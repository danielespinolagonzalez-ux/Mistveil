// Cadencia — el sistema-firma. Spec: docs/sistemas/combate.md §Capa 2.
// Anillo de sincronía en tiempo real: acertar encadena, fallar corta.
import { DataDB } from './data_db.js';
import { EventBus } from './event_bus.js';
import { RunState, GameState, AudioManager } from './state.js';
import { esferaBonos } from './esfera.js';

// Función pura y testeable: calidad de una pulsación.
// El "coyote input" solo perdona por el lado temprano de la ventana buena.
export function computeQuality(tMs, alignMs, perfectMs, goodMs, coyoteMs) {
  const d = tMs - alignMs;
  if (Math.abs(d) <= perfectMs / 2) return 'perfect';
  if (d >= -goodMs / 2 - coyoteMs && d <= goodMs / 2) return 'good';
  return 'fail';
}

// Nivel de un compás: sube con los golpes PERFECTOS ejecutados en él
export function compasNivel(id) {
  const c = DataDB.balance.xp;
  if (!c) return 1;
  const uso = GameState.usoCompases?.[id] ?? 0;
  let lv = 1;
  for (const th of c.compas_niveles) if (uso >= th) lv++;
  return lv;
}
// Multiplicador de ventana: Esfera del Reloj × nivel del compás en uso
export function ventanaMult() {
  const c = DataDB.balance.xp;
  const lv = compasNivel(RunState.compas);
  return esferaBonos().window * (c?.compas_ventana_mult[lv - 1] ?? 1);
}

export class Cadencia {
  constructor() { this.player = null; this.reset(); }
  reset() {
    this.active = false;
    this.target = null;
    this.hitIndex = 0;
    this.t = 0;               // ms desde que empezó a contraerse el anillo
    this.counter = false;     // este anillo es ROJO (QTE de contraataque)
    this.counterUsed = false; // regla: nunca dos counters en el mismo combo
    this.lastQuality = null;
    this.flashT = 0;
    this.dashGraceT = 0;      // gracia tras el dash: el combo aguanta la esquiva
  }
  get cfg() { return DataDB.balance.cadencia; }
  get compas() { return DataDB.compas(RunState.compas); }

  _nearest(player, enemies, range) {
    let best = null, bd = range;
    for (const e of enemies) {
      if (e.health.dead) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y) - e.r;
      if (d < bd && this._lineaLibre(player, e)) { bd = d; best = e; }
    }
    return best;
  }

  // Enemigo vivo más cercano en la DIRECCIÓN del dash (para reposicionar el combo, G7a)
  _nearestInDir(player, enemies, dir, range) {
    const dl = Math.hypot(dir[0], dir[1]) || 1;
    const dx0 = dir[0] / dl, dy0 = dir[1] / dl;
    let best = null, bd = range;
    for (const e of enemies) {
      if (e.health.dead) continue;
      const ex = e.x - player.x, ey = e.y - player.y;
      const d = Math.hypot(ex, ey) || 1;
      if (d > range) continue;
      if ((ex / d) * dx0 + (ey / d) * dy0 < 0.35) continue; // debe caer hacia donde dasheas
      if (d < bd && this._lineaLibre(player, e)) { bd = d; best = e; }
    }
    return best;
  }

  // ¿Segmento jugador→enemigo sin muros? (evita fijar bichos al otro lado de una pared)
  _lineaLibre(player, e) {
    const solids = this.getSolids?.() ?? [];
    if (!solids.length) return true;
    const dx = e.x - player.x, dy = e.y - player.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 6));
    for (let i = 1; i < steps; i++) {
      const x = player.x + dx * i / steps, y = player.y + dy * i / steps;
      if (solids.some(s => x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h)) return false;
    }
    return true;
  }

  update(dt, input, player, enemies) {
    this.player = player;
    if (this.flashT > 0) this.flashT -= dt;

    if (!this.active) {
      player.comboLock = false;
      if (input.justPressed('melee') && player.dashT <= 0) {
        input.consume?.('melee');
        const t = this._nearest(player, enemies, this.cfg.acquire_range_px);
        if (t) this._start(player, t);
        else EventBus.emit('cadencia_whiff', player.x + player.aim.x * 18, player.y + player.aim.y * 18, player.aim);
      }
      return;
    }

    const cfg = this.cfg;
    const target = this.target;
    if (target.health.dead) { this._end(); return; }
    const dist = Math.hypot(target.x - player.x, target.y - player.y);
    // ESQUIVA EN CADENCIA: el dash ya NO rompe el combo. Mientras dura el dash
    // (y una breve gracia después) el anillo se CONGELA y el rango se ensancha:
    // puedes esquivar balas sin perder el ritmo y volver a caer sobre el objetivo.
    if (player.dashT > 0) this.dashGraceT = cfg.dash_grace_s ?? 0.22;
    else if (this.dashGraceT > 0) this.dashGraceT -= dt;
    const dodging = player.dashT > 0 || this.dashGraceT > 0;
    const keepRange = cfg.keep_range_px * (dodging ? (cfg.dash_range_mult ?? 1.9) : 1);
    if (dist > keepRange) { this._end('range'); return; }

    player.comboLock = true;
    if (player.dashT > 0) {
      // G7a — dashear HACIA otro enemigo reposiciona el objetivo del combo:
      // eliges a quién sigues sin perder el ritmo (el anillo sigue congelado).
      if (cfg.dash_retarget && player.dashDir) {
        const nuevo = this._nearestInDir(player, enemies, player.dashDir, keepRange);
        if (nuevo && nuevo !== target) { this.target = nuevo; EventBus.emit('cadencia_chain', nuevo); }
      }
      return; // el anillo se detiene mientras esquivas
    }
    this.t += dt * 1000;
    const alignT = cfg.ring_contract_ms * this.compas.ritmo_mult;
    const wscale = (player.mods?.cadencia.window_scale ?? 1)
      * (GameState.tiene('pulso_constante') ? 1.1 : 1) // nodo del Santuario
      * ventanaMult() // Esfera del Reloj + nivel del compás
      * (this.desafinado ? (DataDB.balance.sinergias?.desafinado_window_mult ?? 0.78) : 1); // El Afinador
    const decay = Math.pow(cfg.window_decay_per_hit, this.hitIndex);
    const pw = cfg.window_perfect_ms * decay * wscale;
    const gw = cfg.window_good_ms * decay * wscale;

    if (this.counter) {
      // Anillo ROJO: pulsar PARRY (no melee) dentro de counter_window_ms.
      // En UNA MANO el tap es contextual: durante el anillo rojo, el tap ES la parada.
      const cw = cfg.counter_window_ms;
      if (input.justPressed('melee')) {
        input.consume?.('melee');
        if (this.tapEsParry) {
          if (Math.abs(this.t - alignT) <= cw / 2) this._counterParried(player);
          else this._counterFail(player);
        } else this._counterFail(player);
        return;
      }
      if (input.justPressed('parry')) {
        input.consume?.('parry');
        if (Math.abs(this.t - alignT) <= cw / 2) this._counterParried(player);
        else this._counterFail(player);
        return;
      }
      if (this.t > alignT + cw / 2) this._counterFail(player);
      return;
    }

    if (input.justPressed('melee')) {
      input.consume?.('melee');
      // Gracia anti-doble-click: en el primer tercio del anillo el golpe no se juzga
      // (el clic de más tras iniciar el combo ya no lo rompe); pulsar tarde sí falla.
      if (this.t < alignT * 0.35) {
        AudioManager.beep(340, 0.04, 'square', 0.03);
        EventBus.emit('cadencia_early', player.x, player.y);
        return;
      }
      this._landHit(computeQuality(this.t, alignT, pw, gw, cfg.coyote_input_ms), player, enemies);
      return;
    }
    // No pulsar tampoco perdona
    if (this.t > alignT + gw / 2) this._landHit('fail', player, enemies);
  }

  _start(player, target) {
    this.active = true;
    this.target = target;
    this.hitIndex = 0;
    this.t = 0;
    this.counter = false;
    this.counterUsed = false;
    this.dashGraceT = 0;
    this.allPerfect = true; // sinergias Compás × Arte: combo inmaculado
    player.comboLock = true;
    EventBus.emit('cadencia_started', target);
  }

  _lunge(player, mx, my) {
    const solids = this.getSolids?.() ?? [];
    const dist = Math.hypot(mx, my);
    const steps = Math.max(1, Math.ceil(dist / 4));
    const sx = mx / steps, sy = my / steps;
    for (let i = 0; i < steps; i++) {
      const nx = player.x + sx, ny = player.y + sy;
      if (solids.some(s => nx + player.r > s.x && nx - player.r < s.x + s.w && ny + player.r > s.y && ny - player.r < s.y + s.h)) break;
      player.x = nx; player.y = ny;
    }
  }

  _rollCounter(player) {
    // Puede saltar en los golpes 2+ (el primero siempre es limpio, por legibilidad)
    const c = this.target.def.counter_chance ?? 0;
    if (c > 0 && !this.counterUsed && this.hitIndex >= 1 && Math.random() < c) {
      // Campana rasgada: el primer counter de la sala se supera solo
      if (player && player.autoParryCharges > 0) {
        player.autoParryCharges--;
        this.counterUsed = true;
        RunState.sp = Math.min(DataDB.balance.ignicion.sp_max, RunState.sp + Math.round(this.cfg.sp_counter_bonus * (player.mods?.spGainMult ?? 1) * esferaBonos().sp));
        EventBus.emit('sp_changed', RunState.sp);
        AudioManager.sfx('parry');
        EventBus.emit('cadencia_auto_parried', this.target);
        return;
      }
      this.counter = true;
      this.counterUsed = true;
      this.target.countering = true;
      AudioManager.sfx('cad_counter');
      EventBus.emit('cadencia_counter_started', this.target);
    }
  }

  _landHit(quality, player, enemies) {
    const cfg = this.cfg;
    const bal = player.stats ?? DataDB.balance.player;
    const target = this.target;
    this.lastQuality = quality;
    this.flashT = 0.15;
    if (quality !== 'perfect') this.allPerfect = false;

    // Pip se abalanza hasta quedar a distancia de golpe — barrido en pasitos que se
    // detiene ante cualquier sólido: el combo nunca atraviesa paredes ni saca del mapa
    const dx = target.x - player.x, dy = target.y - player.y;
    const d = Math.hypot(dx, dy) || 1;
    const stop = cfg.lunge_stop_px + target.r;
    if (d > stop) this._lunge(player, dx / d * (d - stop), dy / d * (d - stop));

    const compas = this.compas;
    const hitsTotal = compas.golpes + (player.mods?.cadencia.combo_add ?? 0) + esferaBonos().combo;
    const isLastHit = this.hitIndex >= hitsTotal - 1;
    const ok = quality === 'perfect' || quality === 'good';
    const mult = (quality === 'perfect' ? cfg.mult_perfect : quality === 'good' ? cfg.mult_good : cfg.mult_fail) * compas.dano_mult;
    // Sinergia "Doble campanada": el penúltimo golpe también cuenta como finisher
    const doble = player.mods?.sinergias.includes('Doble campanada') && this.hitIndex >= hitsTotal - 2;
    const finisher = (isLastHit || doble) && ok;
    let dmg = bal.melee_damage * mult * (finisher ? cfg.finisher_mult : 1);
    const kbMult = finisher ? cfg.finisher_knockback / bal.tear_knockback_px_s : 0.5;
    const applied = target.takeDamage(dmg, player.x, player.y, kbMult);

    // SP: la Cadencia es la ÚNICA fuente de SP (compas y batería de almas lo escalan)
    const spBase = quality === 'perfect' ? cfg.sp_perfect : quality === 'good' ? cfg.sp_good : 0;
    const spGain = Math.round(spBase * compas.sp_mult * (player.mods?.spGainMult ?? 1) * esferaBonos().sp);
    if (spGain) {
      RunState.sp = Math.min(DataDB.balance.ignicion.sp_max, RunState.sp + spGain);
      EventBus.emit('sp_changed', RunState.sp);
    }

    // El ritmo PREMIA la movilidad: cada golpe perfecto recorta el enfriamiento
    // del dash, así encadenar bien = más esquivas disponibles.
    if (quality === 'perfect' && (cfg.perfect_dash_refund_s ?? 0) > 0) {
      player.dashCd = Math.max(0, player.dashCd - cfg.perfect_dash_refund_s);
    }
    // G4 — i-frames breves al CONECTAR (perfect > good): atacar es también esquivar.
    // Fallar no da nada (whiffeaste, sin refugio). Muy Dragoon: clavas el timing → intocable.
    if (ok) {
      const ifr = quality === 'perfect' ? (cfg.lunge_iframes_perfect_s ?? 0.22) : (cfg.lunge_iframes_s ?? 0.14);
      player.comboIframeT = Math.max(player.comboIframeT, ifr);
    }

    AudioManager.sfx(quality === 'perfect' ? 'cad_perfect' : quality === 'good' ? 'cad_good' : 'cad_fail');
    if (finisher) AudioManager.sfx('finisher');
    // Sinergias Compás × Arte (combo inmaculado, todo perfecto)
    if (isLastHit && ok && this.allPerfect) {
      const sin = DataDB.balance.sinergias;
      if (compas.id === 'adagio' && sin?.campana_arte_gratis && !RunState.arteGratis) {
        RunState.arteGratis = true;
        EventBus.emit('sinergia', 'La Campana carga tu Arte', 'El siguiente lanzamiento es GRATIS');
      } else if (compas.id === 'tic_tac' && sin?.sereno_sp_bonus) {
        const extra = Math.round(cfg.sp_perfect * compas.golpes * sin.sereno_sp_bonus);
        RunState.sp = Math.min(DataDB.balance.ignicion.sp_max, RunState.sp + extra);
        EventBus.emit('sp_changed', RunState.sp);
        EventBus.emit('sinergia', 'Pulso inmaculado', '+' + extra + ' Espíritu de propina');
      }
    }
    EventBus.emit('cadencia_hit', { x: target.x, y: target.y, quality, dmg: applied, finisher, hitIndex: this.hitIndex });

    if (finisher && enemies) {
      // Onda del remate: knockback en área (sin daño); eco_del_reloj añade daño
      const shock = player.mods?.finisherShock;
      const shockR = Math.max(cfg.finisher_aoe_radius_px, shock?.radio ?? 0);
      for (const e of enemies) {
        if (e === target || e.health.dead) continue;
        const ex = e.x - target.x, ey = e.y - target.y;
        const ed = Math.hypot(ex, ey) || 1;
        if (ed < shockR) {
          e.kbx += ex / ed * cfg.finisher_knockback;
          e.kby += ey / ed * cfg.finisher_knockback;
          if (shock) e.takeDamage(bal.melee_damage * shock.dano_mult, target.x, target.y, 0);
        }
      }
      EventBus.emit('cadencia_finisher', target.x, target.y, shockR);
    }

    // Si el objetivo CAE a mitad de combo, encadena al siguiente enemigo cercano
    // (mantiene el ritmo y el flow contra grupos) en vez de cortar en seco.
    if (target.health.dead && ok && !isLastHit && (cfg.chain_on_kill ?? true) && enemies) {
      const next = this._nearest(player, enemies, cfg.acquire_range_px);
      if (next) {
        this.target = next;
        this.hitIndex++;
        this.t = 0;
        this._rollCounter(player);
        EventBus.emit('cadencia_chain', next);
        return;
      }
    }

    if (!ok || isLastHit || target.health.dead) { this._end(); return; }
    // Encadena el siguiente golpe
    this.hitIndex++;
    this.t = 0;
    this._rollCounter(player);
  }

  _counterParried(player) {
    const cfg = this.cfg;
    this.counter = false;
    this.target.countering = false;
    RunState.sp = Math.min(DataDB.balance.ignicion.sp_max, RunState.sp + Math.round(cfg.sp_counter_bonus * esferaBonos().sp));
    EventBus.emit('sp_changed', RunState.sp);
    AudioManager.sfx('parry');
    EventBus.emit('cadencia_parried', this.target);
    // Péndulo quieto: congela la sala
    if (player.mods?.parryFreezeS > 0) EventBus.emit('sala_congelada', player.mods.parryFreezeS);
    this.t = 0; // el mismo golpe vuelve a intentarse con anillo limpio
  }

  _counterFail(player) {
    const cfg = this.cfg;
    const tgt = this.target; // capturar ANTES de _end() (que anula this.target)
    tgt.countering = false;
    EventBus.emit('cadencia_counter_hit', tgt);
    this._end();
    player.hurt(cfg.counter_damage, tgt.x, tgt.y);
  }

  _end(reason) {
    if (this.target) this.target.countering = false;
    if (this.player) this.player.comboLock = false;
    this.active = false;
    this.target = null;
    EventBus.emit('cadencia_ended', reason);
  }

  // Anillo de sincronía: SIEMPRE por encima de balas y de la iluminación
  draw(ctx) {
    if (!this.active || !this.target) return;
    const cfg = this.cfg;
    const t = this.target;
    const x = Math.round(t.x), y = Math.round(t.y);
    const alignT = cfg.ring_contract_ms * this.compas.ritmo_mult;
    const progress = Math.min(1, this.t / alignT);
    const innerR = 11;
    const outerR = 32 - (32 - innerR) * progress;
    const decay = Math.pow(cfg.window_decay_per_hit, this.hitIndex);
    const wscale = (this.player?.mods?.cadencia.window_scale ?? 1)
      * (GameState.tiene('pulso_constante') ? 1.1 : 1) * ventanaMult()
      * (this.desafinado ? (DataDB.balance.sinergias?.desafinado_window_mult ?? 0.78) : 1);
    const gw = cfg.window_good_ms * decay * wscale;
    const pw = cfg.window_perfect_ms * decay * wscale;
    const inGood = Math.abs(this.t - alignT) <= gw / 2;
    const inPerfect = Math.abs(this.t - alignT) <= pw / 2;

    // Esquivando: el anillo se pinta cian y punteado — "ritmo en pausa, sigue vivo"
    const dodging = (this.player?.dashT > 0) || this.dashGraceT > 0;
    const col = dodging ? '#5ad1ff' : this.counter ? '#ff3b30' : inPerfect ? '#ffffff' : inGood ? '#ffd54f' : '#b9aee0';

    // Anillo interior fijo
    ctx.strokeStyle = dodging ? 'rgba(90,209,255,0.9)' : this.counter ? 'rgba(255,80,60,0.9)' : 'rgba(233,226,245,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, innerR, 0, 7); ctx.stroke();

    // Anillo exterior que se contrae (punteado mientras esquivas)
    ctx.strokeStyle = col;
    ctx.lineWidth = this.counter ? 3 : 2;
    if (dodging) ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(x, y, outerR, 0, 7); ctx.stroke();
    ctx.setLineDash([]);

    // Destello al entrar en ventana
    if (inPerfect && !this.counter) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, innerR - 2, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Aviso de counter: icono de parry
    if (this.counter) {
      ctx.font = '18px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff3b30';
      ctx.fillText('¡E!', x, y - outerR - 6);
    }

    // Pips del combo
    const hits = this.compas.golpes + (this.player?.mods?.cadencia.combo_add ?? 0) + esferaBonos().combo;
    for (let i = 0; i < hits; i++) {
      ctx.fillStyle = i < this.hitIndex ? '#ffd54f' : 'rgba(233,226,245,0.35)';
      ctx.fillRect(x - hits * 4 + i * 8 + 1, y + t.r + 8, 5, 3);
    }
  }
}
