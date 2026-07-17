// El Reloj de Batalla — combate por turnos estilo FFX (CTB) fusionado con Mistveil.
// FUSIÓN:
//  · CTB (Conditional Turn-Based): línea de turnos PREDICTIVA por agilidad + coste de acción.
//  · Cadencia: atacar abre el anillo de sincronía rítmico (perfect/good/fail escalan daño y Espíritu).
//  · Compases: la postura (Sereno/Febril/Campana) cambia nº de golpes, daño Y coste de turno.
//  · Artes de Tinta: hechizos elementales que explotan debilidades (empujan al enemigo en la línea).
//  · Espíritu = Overdrive: la Ignición gasta todo el SP en una cadena de golpes brutal.
//  · Parry rítmico: en Guardia, el ataque enemigo abre una ventana de parada que contraataca.
import { DataDB } from './data_db.js';
import { EventBus } from './event_bus.js';
import { GameState, RunState, AudioManager } from './state.js';
import { computeQuality } from './cadencia.js';
import { compasesActivos } from './progresion.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

// Elenco de duelos de demostración (crece con el juego).
const ENCUENTROS = {
  vigilia: {
    titulo: 'La Vigilia del Taller',
    enemigos: ['cera_andante', 'tejedor_horas', 'campanero']
  },
  liga1: { titulo: 'Liga · Rango I — "La Mecha"', enemigos: ['cera_andante', 'velon_inestable'] },
  liga2: { titulo: 'Liga · Rango II — "Doce Agujas"', enemigos: ['tejedor_horas', 'engranaje_errante', 'cera_andante'] },
  liga3: { titulo: 'Liga · Rango III — "El Coro de Sebo"', enemigos: ['velon_inestable', 'velon_inestable', 'campanero'] },
  liga4: { titulo: 'Liga · Rango IV — "Polvo y Péndulo"', enemigos: ['polilla_del_polvo', 'cuco_de_cuerda', 'tejedor_horas'] },
  liga5: { titulo: 'Liga · Rango V — "Las Gemelas"', enemigos: ['minutero_gemelo', 'minutero_gemelo', 'campanero'] },
  campeon: { titulo: 'EL CAMPEÓN — tu propio eco', enemigos: ['campanero', 'cuco_de_cuerda', 'minutero_gemelo'] },
  enjambre: {
    titulo: 'El Enjambre de Polvo',
    enemigos: ['polilla_del_polvo', 'engranaje_errante', 'velon_inestable']
  }
};

export class RelojBatalla {
  constructor(ctx, VW, VH, font) {
    this.ctx = ctx; this.VW = VW; this.VH = VH; this.font = font;
    this.active = false;
    this.clock = 0;
    this.touch = false;
    this.parts = [];   // partículas ligeras
  }
  get cfg() { return DataDB.balance.batalla; }

  // ---------- Arranque ----------
  start(clave = 'vigilia') {
    const enc = ENCUENTROS[clave] ?? ENCUENTROS.vigilia;
    this.clave = clave;
    this.won = false;
    this.titulo = enc.titulo;
    this.clock = 0;
    this.parts = [];
    this.msg = null; this.msgT = 0;
    this.dmgFloat = [];
    this.done = false;

    const bal = DataDB.balance;
    const pipMax = bal.player.max_hp * (this.cfg.pip_hp_mult ?? 1);
    this.pip = {
      side: 'aliado', id: 'pip', name: 'Pip',
      hp: pipMax, maxHp: pipMax, agi: this.cfg.pip_agi,
      element: 'luz', ct: 0, guard: false, statuses: {},
      x: this.VW - 150, y: 214
    };
    // Enemigos posicionados en abanico a la izquierda
    const ids = enc.enemigos;
    this.enemies = ids.map((id, i) => {
      const def = DataDB.enemigo(id) ?? {};
      const agi = Math.max(6, Math.round((def.velocidad ?? 90) / 12) + 2);
      const n = ids.length;
      return {
        side: 'enemigo', id, name: def.nombre ?? id, def,
        hp: def.hp ?? 12, maxHp: def.hp ?? 12, agi,
        element: def.elemento ?? 'neutro', ct: 0, statuses: {},
        x: 96 + i * 96, y: 120 + (i % 2) * 46,
        bob: Math.random() * 6, dead: false, hitFlash: 0, telegraph: null
      };
    });
    this.combatants = [this.pip, ...this.enemies];
    // El ensayo del Redoble presta el kit completo para lucir la fusión
    this.tomos = DataDB.hechizos.hechizos.map(h => h.id);
    RunState.sp = Math.max(RunState.sp, 45);
    EventBus.emit('sp_changed', RunState.sp);
    // ICV inicial: ordena la primera ronda por agilidad
    for (const c of this.combatants) c.ct = this._icv(c.agi, 100) + Math.round(rnd(-4, 4));

    this.compasIdx = this._compasIndex(RunState.compas);
    this.menuIdx = 0;
    this.targetIdx = 0;
    this.spellIdx = 0;

    this.active = true;
    this._banner(this.titulo, 1.6);
    AudioManager.sfx('cad_counter');
    // Empezar la primera ronda tras el rótulo
    this._setPhase('intro', 1.6, () => this._nextTurn());
  }

  _compasIndex(id) {
    const list = DataDB.compases.compases;
    const i = list.findIndex(c => c.id === id);
    return i < 0 ? 0 : i;
  }
  get compas() { return DataDB.compases.compases[this.compasIdx]; }

  _icv(agi, rec) { return Math.max(1, Math.round(this.cfg.icv_base / agi * rec / 100)); }

  // ---------- Máquina de estados ----------
  _setPhase(phase, timer = 0, after = null) {
    this.phase = phase; this.pTimer = timer; this.pAfter = after;
  }
  _banner(text, secs = 1.2, color = '#ffd54f') { this.msg = text; this.msgColor = color; this.msgT = secs; }

  _aliveEnemies() { return this.enemies.filter(e => !e.dead); }

  // Selecciona el siguiente en actuar (CTB): resta el mínimo ct y actúa quien llega a 0.
  _nextTurn() {
    if (this._checkEnd()) return;
    const alive = [this.pip, ...this._aliveEnemies()];
    let minCt = Math.min(...alive.map(c => c.ct));
    for (const c of alive) c.ct -= minCt;
    // desempate por agilidad
    const actor = alive.filter(c => c.ct <= 0).sort((a, b) => b.agi - a.agi)[0];
    this.actor = actor;
    this._tickStatuses(actor);
    if (this._checkEnd()) return;
    if (actor.hp <= 0) { this._reschedule(actor, 100); return; }

    if (actor.side === 'aliado') {
      this.pip.guard = false;
      this.menuIdx = 0;
      this._setPhase('menu');
    } else {
      this._enemyTurn(actor);
    }
  }

  _tickStatuses(actor) {
    const s = actor.statuses;
    if (s.quema > 0) {
      const d = this.cfg.quema_dano;
      this._damage(actor, d, 'fuego', { silent: true });
      this._float(actor, '-' + d, '#ff7a3a');
      AudioManager.sfx('cast_cono');
      s.quema--;
    }
    if (s.lento > 0) s.lento--;
  }

  _reschedule(actor, rec) {
    let r = rec;
    if (actor.statuses.lento > 0) r = Math.round(r * this.cfg.lento_mult);
    actor.ct += this._icv(actor.agi, r);
    this._nextTurn();
  }

  // ---------- Turno del jugador ----------
  _commands() {
    const spFull = RunState.sp >= DataDB.balance.ignicion.sp_max;
    return [
      { id: 'atacar', label: 'Cadencia', sub: 'Golpe rítmico' },
      { id: 'magia', label: 'Artes de Tinta', sub: 'Hechizo · SP' },
      { id: 'guardia', label: 'Guardia', sub: 'Parry al recibir' },
      { id: 'ignicion', label: 'Ignición', sub: spFull ? 'Overdrive listo' : 'Espíritu al máximo', off: !spFull }
    ];
  }

  _startAttack(target, opts = {}) {
    const golpes = this.compas.golpes;
    this.qte = {
      target, kind: opts.kind ?? 'atacar',
      total: opts.total ?? golpes, i: 0, t: 0,
      results: [], danoMult: opts.danoMult ?? 1, hitAll: opts.hitAll ?? false
    };
    this._setPhase('qte_attack');
    this._banner(opts.kind === 'ignicion' ? '¡IGNICIÓN!' : this.compas.nombre, 0.9, this.compas.color);
  }

  _beatWindow() {
    const c = this.cfg;
    const decay = Math.pow(0.92, this.qte.i);
    return {
      align: c.beat_ms,
      perfect: c.window_perfect_ms * decay,
      good: c.window_good_ms * decay
    };
  }

  _landBeat(quality) {
    const q = this.qte;
    q.results.push(quality);
    const c = this.cfg;
    const bal = DataDB.balance.player;
    const mult = quality === 'perfect' ? c.mult_perfect : quality === 'good' ? c.mult_good : c.mult_fail;
    const dmgMult = q.kind === 'ignicion' ? c.ignicion_dano_mult : this.compas.dano_mult;
    let dmg = bal.melee_damage * mult * dmgMult * q.danoMult;

    if (q.hitAll) {
      for (const e of this._aliveEnemies()) this._damage(e, dmg, this.pip.element);
    } else {
      // reencaminar si el objetivo murió a un enemigo vivo
      if (q.target.dead) q.target = this._aliveEnemies()[0];
      if (q.target) this._damage(q.target, dmg, this.pip.element);
    }
    // Espíritu (Overdrive) sube con la calidad — como en FFX el overdrive sube al actuar bien
    const sp = quality === 'perfect' ? c.sp_perfect : quality === 'good' ? c.sp_good : 0;
    if (sp) { RunState.sp = clamp(RunState.sp + sp, 0, DataDB.balance.ignicion.sp_max); EventBus.emit('sp_changed', RunState.sp); }

    AudioManager.sfx(quality === 'perfect' ? 'cad_perfect' : quality === 'good' ? 'cad_good' : 'cad_fail');
    if (quality === 'perfect') this._shake(3);
    q.i++;
    q.t = 0;
    if (q.i >= q.total || this._aliveEnemies().length === 0) this._finishAttack();
  }

  _finishAttack() {
    const q = this.qte;
    const perfects = q.results.filter(r => r === 'perfect').length;
    if (perfects === q.total && q.total > 1) { this._banner('¡CADENCIA PERFECTA!', 1.2, '#ffffff'); AudioManager.sfx('finisher'); }
    const rec = q.kind === 'ignicion' ? this.cfg.rec_ignicion
      : Math.round(this.cfg.rec_atacar_base * this.compas.ritmo_mult);
    this.qte = null;
    this._setPhase('resolve', 0.5, () => this._reschedule(this.pip, rec));
  }

  _castSpell(spell, target) {
    const p = spell.params ?? {};
    const bal = DataDB.balance.player;
    RunState.sp = clamp(RunState.sp - (spell.coste_sp ?? 0), 0, DataDB.balance.ignicion.sp_max);
    EventBus.emit('sp_changed', RunState.sp);
    AudioManager.sfx(spell.tipo === 'nova' ? 'cast_nova' : spell.tipo === 'onda' ? 'cast_onda' : 'cast_cono');
    this._banner(spell.nombre, 1.0, DataDB.elementos[spell.elemento]?.color ?? '#e9e2f5');

    const targets = spell.tipo === 'cono' ? [target] : this._aliveEnemies();
    const base = p.dano ?? bal.melee_damage * (p.dano_mult ?? 1.5);
    for (const e of targets) {
      if (!e || e.dead) continue;
      this._damage(e, base, spell.elemento);
      if (spell.elemento === 'agua') this._applyStatus(e, 'lento', this.cfg.lento_turnos);
      if (spell.elemento === 'fuego') this._applyStatus(e, 'quema', this.cfg.quema_turnos);
    }
    this._shake(4);
    this._setPhase('resolve', 0.7, () => this._reschedule(this.pip, this.cfg.rec_magia));
  }

  // ---------- Turno enemigo ----------
  _enemyTurn(e) {
    const beh = e.def.comportamiento;
    let action;
    if (beh === 'chase_explode') action = { nombre: 'Estallido', dano: 2, suicida: true, tipo: 'aoe' };
    else if (beh === 'turret' || beh === 'orbit_shoot') action = { nombre: 'Aguja de horas', dano: 1, tipo: 'dist' };
    else if (beh === 'chase_heavy') action = { nombre: 'Campanada', dano: 1, tipo: 'pesado' };
    else action = { nombre: 'Embestida', dano: 1, tipo: 'melee' };
    action.dano *= this.cfg.dano_enemigo_base;
    e.telegraph = action.nombre;
    this.pendingEnemyAct = { e, action };
    this._banner(e.name + ': ' + action.nombre, 0.9, '#ff8a5a');
    AudioManager.sfx('cad_fail');
    // Ventana de anticipación (telegrafía FFX-lite); si Pip está en Guardia, abre parry
    this._setPhase('enemy_windup', 0.85, () => this._resolveEnemyAct());
  }

  _resolveEnemyAct() {
    const { e, action } = this.pendingEnemyAct;
    e.telegraph = null;
    if (this.pip.guard) {
      // Parry rítmico: anillo de parada
      this.parry = { e, action, t: 0 };
      this._setPhase('qte_parry');
      return;
    }
    this._enemyHitPip(e, action, 1);
  }

  _enemyHitPip(e, action, mult) {
    const dmg = Math.max(1, Math.round(action.dano * mult));
    this._damage(this.pip, dmg, e.element);
    this._float(this.pip, '-' + dmg, '#ff5a5a');
    AudioManager.sfx('hurt'); this._shake(5);
    if (action.suicida) { this._damage(e, e.maxHp, 'neutro', { silent: true }); this._banner(e.name + ' se consume', 1.0, '#ff8a5a'); }
    this.pendingEnemyAct = null;
    this._setPhase('resolve', 0.5, () => this._reschedule(e, this.cfg.rec_enemigo));
  }

  _parrySuccess() {
    const { e, action } = this.parry;
    this.pip.guard = false;
    RunState.sp = clamp(RunState.sp + this.cfg.sp_parry, 0, DataDB.balance.ignicion.sp_max);
    EventBus.emit('sp_changed', RunState.sp);
    AudioManager.sfx('parry'); this._shake(4);
    this._banner('¡PARADA!', 1.0, '#7ee8e0');
    // Contragolpe + empujón en la línea de turnos (stagger)
    const counter = DataDB.balance.player.melee_damage * 1.2;
    this._damage(e, counter, this.pip.element);
    e.ct += this.cfg.stagger_push;
    this.parry = null;
    this.pendingEnemyAct = null;
    this._setPhase('resolve', 0.6, () => this._reschedule(e, this.cfg.rec_enemigo));
  }

  _parryFail() {
    const { e, action } = this.parry;
    this.parry = null;
    this._enemyHitPip(e, action, this.cfg.guardia_reduccion); // Guardia sin parry = daño reducido
  }

  // ---------- Daño y estados ----------
  _damage(target, base, element, opts = {}) {
    let dmg = Math.max(1, Math.round(base));
    let tag = '';
    if (target.side === 'enemigo') {
      const em = DataDB.elementos[target.element];
      const mm = DataDB.balance.elementos;
      if (em?.opuesto === element) { dmg = Math.round(dmg * mm.opposite_mult); tag = ' ¡Débil!'; target.ct += Math.round(this.cfg.stagger_push * 0.6); }
      else if (target.element === element && element !== 'neutro') { dmg = Math.round(dmg * mm.same_mult); tag = ' resiste'; }
    }
    target.hp = clamp(target.hp - dmg, 0, target.maxHp);
    if (target.side === 'enemigo') { target.hitFlash = 0.15; }
    if (!opts.silent) {
      this._float(target, '-' + dmg + tag, tag.includes('Débil') ? '#ffd54f' : '#ffffff');
      this._burst(target.x, target.y, tag.includes('Débil') ? '#ffd54f' : '#e9e2f5');
    }
    AudioManager.sfx('hit');
    if (target.hp <= 0) this._kill(target);
  }

  _applyStatus(target, key, turns) {
    target.statuses[key] = Math.max(target.statuses[key] ?? 0, turns);
    this._float(target, key === 'quema' ? 'QUEMA' : 'LENTO', key === 'quema' ? '#ff7a3a' : '#7ee8e0');
  }

  _kill(target) {
    if (target.side === 'enemigo' && !target.dead) {
      target.dead = true;
      AudioManager.sfx('enemy_die');
      this._burst(target.x, target.y, target.elementColor ?? '#e9e2f5', 14);
    }
  }

  _checkEnd() {
    if (this.done) return true;
    if (this.pip.hp <= 0) { this.done = true; this._setPhase('derrota', 0, null); this._banner('El péndulo te alcanza...', 2, '#ff5a5a'); AudioManager.sfx('die'); return true; }
    if (this._aliveEnemies().length === 0) {
      this.done = true;
      this.won = true;
      const oro = this.cfg.recompensa_oro, mem = this.cfg.recompensa_memoria;
      RunState.oro += oro; GameState.memoria += mem;
      this.reward = { oro, mem };
      this._setPhase('victoria', 0, null);
      this._banner('¡El taller enmudece!', 2, '#ffd54f'); AudioManager.sfx('clear');
      return true;
    }
    return false;
  }

  // ---------- Update ----------
  update(dt, Input) {
    this.clock += dt;
    if (this.msgT > 0) this.msgT -= dt;
    this._updateParts(dt);
    for (const e of this.enemies) if (e.hitFlash > 0) e.hitFlash -= dt;
    for (const d of this.dmgFloat) { d.t -= dt; d.y -= dt * 18; }
    this.dmgFloat = this.dmgFloat.filter(d => d.t > 0);
    if (this.shakeT > 0) this.shakeT -= dt;

    this.touch = Input.touchState().enabled;
    const tap = (this.touch && Input.consumeTap) ? Input.consumeTap() : null;
    const inR = r => tap && tap.x > r.x && tap.x < r.x + r.w && tap.y > r.y && tap.y < r.y + r.h;
    // En táctil: tap-en-pantalla ES el botón de ritmo (QTE) y el de salir; los menús se tocan por filas
    let confirm = Input.justPressed('melee') || Input.justCode('Enter') ||
      (!!tap && (this.phase === 'qte_attack' || this.phase === 'victoria' || this.phase === 'derrota'));
    const cancel = Input.justPressed('pause');

    switch (this.phase) {
      case 'intro': case 'resolve': case 'enemy_windup':
        this.pTimer -= dt;
        if (this.pTimer <= 0 && this.pAfter) { const f = this.pAfter; this.pAfter = null; f(); }
        break;

      case 'menu': {
        if (Input.justPressed('move_up')) { this.menuIdx = (this.menuIdx + 3) % 4; AudioManager.beep(520, 0.03, 'triangle', 0.03); }
        if (Input.justPressed('move_down')) { this.menuIdx = (this.menuIdx + 1) % 4; AudioManager.beep(520, 0.03, 'triangle', 0.03); }
        if (Input.justPressed('compas')) this._cycleCompas();
        if (tap) {
          const L = this._menuLayout();
          if (L) {
            const cmds = this._commands();
            let hit = false;
            for (let i = 0; i < cmds.length; i++) {
              if (!inR(L.row(i))) continue;
              hit = true;
              if (cmds[i].off) AudioManager.sfx('no_sp');
              else if (this.menuIdx === i) confirm = true;
              else { this.menuIdx = i; AudioManager.beep(520, 0.03, 'triangle', 0.03); }
              break;
            }
            if (!hit && inR(L.row(cmds.length))) this._cycleCompas();
          }
        }
        if (confirm) {
          const cmd = this._commands()[this.menuIdx];
          if (cmd.id === 'atacar') { this.targetIdx = 0; this._setPhase('target'); this._pendingCmd = 'atacar'; }
          else if (cmd.id === 'magia') { this.spellIdx = 0; this._setPhase('spell'); }
          else if (cmd.id === 'guardia') { this.pip.guard = true; this._banner('Pip alza la guardia', 0.9, '#7ee8e0'); AudioManager.sfx('armor'); this._setPhase('resolve', 0.4, () => this._reschedule(this.pip, this.cfg.rec_guardia)); }
          else if (cmd.id === 'ignicion') {
            if (RunState.sp >= DataDB.balance.ignicion.sp_max) {
              RunState.sp = 0; EventBus.emit('sp_changed', 0);
              const tgt = this._aliveEnemies().sort((a, b) => b.hp - a.hp)[0];
              this._startAttack(tgt, { kind: 'ignicion', total: this.cfg.ignicion_golpes });
            } else AudioManager.sfx('no_sp');
          }
        }
        break;
      }

      case 'spell': {
        const tomos = this.tomos.map(id => DataDB.hechizo(id)).filter(Boolean);
        if (Input.justPressed('move_up')) { this.spellIdx = (this.spellIdx + tomos.length - 1) % tomos.length; AudioManager.beep(520, 0.03, 'triangle', 0.03); }
        if (Input.justPressed('move_down')) { this.spellIdx = (this.spellIdx + 1) % tomos.length; AudioManager.beep(520, 0.03, 'triangle', 0.03); }
        if (cancel) { this._setPhase('menu'); AudioManager.beep(300, 0.04, 'square', 0.03); }
        if (tap) {
          const L = this._spellLayout(tomos.length);
          if (L) for (let i = 0; i <= tomos.length; i++) {
            if (!inR(L.row(i))) continue;
            if (i === tomos.length) { this._setPhase('menu'); AudioManager.beep(300, 0.04, 'square', 0.03); return null; }
            if (RunState.sp < (tomos[i].coste_sp ?? 0)) AudioManager.sfx('no_sp');
            else if (this.spellIdx === i) confirm = true;
            else { this.spellIdx = i; AudioManager.beep(520, 0.03, 'triangle', 0.03); }
            break;
          }
        }
        if (confirm) {
          const sp = tomos[this.spellIdx];
          if (RunState.sp < (sp.coste_sp ?? 0)) { AudioManager.sfx('no_sp'); break; }
          this._pendingSpell = sp;
          if (sp.tipo === 'cono') { this.targetIdx = 0; this._setPhase('target'); this._pendingCmd = 'magia'; }
          else this._castSpell(sp, null);
        }
        break;
      }

      case 'target': {
        const alive = this._aliveEnemies();
        if (Input.justPressed('move_left')) { this.targetIdx = (this.targetIdx + alive.length - 1) % alive.length; AudioManager.beep(520, 0.03, 'triangle', 0.03); }
        if (Input.justPressed('move_right')) { this.targetIdx = (this.targetIdx + 1) % alive.length; AudioManager.beep(520, 0.03, 'triangle', 0.03); }
        if (cancel) { this._setPhase(this._pendingCmd === 'magia' ? 'spell' : 'menu'); AudioManager.beep(300, 0.04, 'square', 0.03); }
        if (tap) {
          if (inR(this._backRect())) { this._setPhase(this._pendingCmd === 'magia' ? 'spell' : 'menu'); AudioManager.beep(300, 0.04, 'square', 0.03); return null; }
          for (let i = 0; i < alive.length; i++) {
            if (Math.hypot(tap.x - alive[i].x, tap.y - alive[i].y) < 38) { this.targetIdx = i; confirm = true; break; }
          }
        }
        if (confirm) {
          const tgt = alive[clamp(this.targetIdx, 0, alive.length - 1)];
          if (this._pendingCmd === 'magia') this._castSpell(this._pendingSpell, tgt);
          else this._startAttack(tgt);
        }
        break;
      }

      case 'qte_attack': {
        const q = this.qte;
        q.t += dt * 1000;
        const w = this._beatWindow();
        if (confirm) {
          const quality = computeQuality(q.t, w.align, w.perfect, w.good, 40);
          this._landBeat(quality);
        } else if (q.t > w.align + w.good / 2) {
          this._landBeat('fail');
        }
        break;
      }

      case 'qte_parry': {
        const pr = this.parry;
        pr.t += dt * 1000;
        const align = this.cfg.beat_ms;
        const win = this.cfg.parry_window_ms;
        if (Input.justPressed('parry') || (this.touch && tap)) {
          if (Math.abs(pr.t - align) <= win / 2) this._parrySuccess();
          else { AudioManager.sfx('cad_fail'); this._parryFail(); }
        } else if (pr.t > align + win / 2) {
          this._parryFail();
        }
        break;
      }

      case 'victoria':
      case 'derrota':
        if (confirm || cancel) { this.active = false; return 'fin'; }
        break;
    }
    return null;
  }

  // ---------- Efectos ----------
  _shake(a) { this.shakeT = 0.18; this.shakeA = a; }
  _shakeOff() { if (!(this.shakeT > 0)) return [0, 0]; const a = this.shakeA * (this.shakeT / 0.18); return [rnd(-a, a), rnd(-a, a)]; }
  _float(t, text, color) { this.dmgFloat.push({ x: t.x + rnd(-8, 8), y: t.y - 20, text, color, t: 0.9 }); }
  _burst(x, y, color, n = 7) { for (let i = 0; i < n; i++) { const a = rnd(0, 7), s = rnd(30, 90); this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.3, 0.6), t: 0, color, r: rnd(1, 2.5) }); } }
  _updateParts(dt) { for (const p of this.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; } this.parts = this.parts.filter(p => p.t < p.life); }

  // ---------- CTB: previsión de la línea de turnos ----------
  _timeline(n = 7) {
    // simula hacia delante con la acción por defecto (ataque) para prever el orden — como FFX
    const sim = [this.pip, ...this._aliveEnemies()].map(c => ({ ref: c, ct: c.ct }));
    const defRec = c => c.side === 'aliado' ? Math.round(this.cfg.rec_atacar_base * this.compas.ritmo_mult) : this.cfg.rec_enemigo;
    const out = [];
    for (let k = 0; k < n; k++) {
      const min = Math.min(...sim.map(s => s.ct));
      for (const s of sim) s.ct -= min;
      const nx = sim.filter(s => s.ct <= 0).sort((a, b) => b.ref.agi - a.ref.agi)[0];
      out.push(nx.ref);
      nx.ct += this._icv(nx.ref.agi, defRec(nx.ref));
    }
    return out;
  }

  // ---------- Render ----------
  draw(t) {
    const g = this.ctx, VW = this.VW, VH = this.VH;
    const [sx, sy] = this._shakeOff();
    g.save(); g.translate(sx, sy);

    // Fondo: cámara del Reloj, niebla, suelo
    const sky = g.createLinearGradient(0, 0, 0, VH);
    sky.addColorStop(0, '#0c0a18'); sky.addColorStop(0.55, '#171331'); sky.addColorStop(1, '#241b3c');
    g.fillStyle = sky; g.fillRect(-8, -8, VW + 16, VH + 16);
    // engranaje-reloj de fondo
    this._drawBackClock(g, VW * 0.32, VH * 0.30, 74, t);
    // suelo en perspectiva
    g.fillStyle = '#20182f';
    g.beginPath(); g.moveTo(-8, 250); g.lineTo(VW + 8, 250); g.lineTo(VW + 8, VH + 8); g.lineTo(-8, VH + 8); g.closePath(); g.fill();
    for (let i = 1; i < 7; i++) { g.strokeStyle = `rgba(120,105,180,${0.12 - i * 0.012})`; g.lineWidth = 1; const yy = 250 + i * i * 3.2; g.beginPath(); g.moveTo(-8, yy); g.lineTo(VW + 8, yy); g.stroke(); }
    // niebla suave
    for (let i = 0; i < 3; i++) { const yy = 210 + i * 40 + Math.sin(t * 0.5 + i) * 6; g.fillStyle = `rgba(150,140,190,${0.05})`; g.fillRect(-8, yy, VW + 16, 26); }

    // Partículas detrás de sprites
    for (const p of this.parts) { g.globalAlpha = clamp(1 - p.t / p.life, 0, 1); g.fillStyle = p.color; g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
    g.globalAlpha = 1;

    // Enemigos
    const alive = this._aliveEnemies();
    this.enemies.forEach((e) => {
      if (e.dead) return;
      const isTarget = this.phase === 'target' && alive[this.targetIdx] === e;
      this._drawEnemy(g, e, t, isTarget);
    });

    // Pip
    this._drawPip(g, t);

    // Anillo de Cadencia (ataque) sobre el objetivo
    if (this.phase === 'qte_attack' && this.qte) this._drawSyncRing(g, this.qte.target, this.qte.t, this._beatWindow(), false);
    // Anillo de parry sobre Pip
    if (this.phase === 'qte_parry' && this.parry) this._drawSyncRing(g, this.pip, this.parry.t, { align: this.cfg.beat_ms, perfect: this.cfg.parry_window_ms, good: this.cfg.parry_window_ms }, true);

    // Números flotantes
    for (const d of this.dmgFloat) { g.globalAlpha = clamp(d.t / 0.9, 0, 1); this.font(9); g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(d.text, d.x + 1, d.y + 1); g.fillStyle = d.color; g.fillText(d.text, d.x, d.y); }
    g.globalAlpha = 1;

    // HUD: línea de turnos (CTB), menús, banner
    this._drawTimeline(g, t);
    this._drawPipStatus(g);
    this._drawMenus(g, t);
    this._drawBanner(g);
    if (this.phase === 'victoria') this._drawVictory(g);
    if (this.phase === 'derrota') this._drawDefeat(g);

    g.restore();
  }

  _drawBackClock(g, cx, cy, r, t) {
    g.strokeStyle = 'rgba(150,135,205,0.10)'; g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8)); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
    g.lineWidth = 2; const ha = t * 0.1, ma = t * 0.4;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ha) * r * 0.5, cy + Math.sin(ha) * r * 0.5); g.stroke();
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ma) * r * 0.75, cy + Math.sin(ma) * r * 0.75); g.stroke();
  }

  _drawHpBar(g, x, y, w, hp, maxHp, color) {
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - 1, y - 1, w + 2, 6);
    g.fillStyle = '#2a2340'; g.fillRect(x, y, w, 4);
    g.fillStyle = color; g.fillRect(x, y, w * clamp(hp / maxHp, 0, 1), 4);
  }

  _drawEnemy(g, e, t, isTarget) {
    const bob = Math.sin(t * 2 + e.bob) * 3;
    const x = e.x, y = e.y + bob;
    // sombra
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x, e.y + 30, 18, 5, 0, 0, 7); g.fill();
    // marcador de objetivo
    if (isTarget) { g.strokeStyle = '#ffd54f'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.arc(x, y, 28 + Math.sin(t * 6) * 2, 0, 7); g.stroke(); g.setLineDash([]); this.font(9); g.fillStyle = '#ffd54f'; g.textAlign = 'center'; g.fillText('▼', x, y - 34); }
    g.save();
    if (e.hitFlash > 0) { g.globalAlpha = 1; }
    const col = e.hitFlash > 0 ? '#ffffff' : (DataDB.elementos[e.element]?.color ?? '#8f86ad');
    this._enemySprite(g, e, x, y, col, t);
    g.restore();
    // telegrafía de acción (encima)
    if (e.telegraph) { this.font(9); g.textAlign = 'center'; g.fillStyle = '#ff8a5a'; g.fillText('! ' + e.telegraph, x, y - 40); }
    // estados
    let sx = x - 14;
    if (e.statuses.quema > 0) { g.fillStyle = '#ff7a3a'; g.fillRect(sx, y - 46, 6, 6); sx += 8; }
    if (e.statuses.lento > 0) { g.fillStyle = '#7ee8e0'; g.fillRect(sx, y - 46, 6, 6); sx += 8; }
    // nombre + hp
    this.font(8); g.textAlign = 'center'; g.fillStyle = '#cfc6e8'; g.fillText(e.name, x, e.y + 46);
    this._drawHpBar(g, x - 22, e.y + 50, 44, e.hp, e.maxHp, '#e0556b');
  }

  _enemySprite(g, e, x, y, col, t) {
    const px = (dx, dy, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x + dx), Math.round(y + dy), w, h); };
    switch (e.id) {
      case 'cera_andante':
        g.fillStyle = col; g.beginPath(); g.moveTo(x - 14, y + 18); g.quadraticCurveTo(x - 18, y - 12, x, y - 18); g.quadraticCurveTo(x + 18, y - 12, x + 14, y + 18); g.closePath(); g.fill();
        px(-3, -20, 2, 6, '#3a3226'); px(-6, -6, 4, 4, '#241f30'); px(3, -6, 4, 4, '#241f30');
        break;
      case 'tejedor_horas':
        g.fillStyle = col; g.beginPath(); g.arc(x, y, 13, 0, 7); g.fill();
        for (let i = 0; i < 6; i++) { const a = i / 6 * 7 + t * 0.4; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22); g.stroke(); }
        px(-5, -3, 4, 4, '#ffd54f'); px(2, -3, 4, 4, '#ffd54f');
        break;
      case 'engranaje_errante': {
        g.save(); g.translate(x, y); g.rotate(t); g.fillStyle = col;
        for (let i = 0; i < 8; i++) { g.rotate(Math.PI / 4); g.fillRect(-3, -18, 6, 8); }
        g.beginPath(); g.arc(0, 0, 12, 0, 7); g.fill(); g.fillStyle = '#241f30'; g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fill(); g.restore();
        break;
      }
      case 'velon_inestable':
        px(-8, -6, 16, 22, col); px(-4, -20, 8, 14, '#e8dfc8');
        g.fillStyle = '#4fc3f7'; g.beginPath(); g.moveTo(x, y - 30); g.quadraticCurveTo(x + 5, y - 22, x, y - 18); g.quadraticCurveTo(x - 5, y - 22, x, y - 30); g.fill();
        px(-5, 2, 3, 3, '#241f30'); px(2, 2, 3, 3, '#241f30');
        break;
      case 'campanero':
        px(-14, -4, 28, 22, '#5b5470'); g.fillStyle = col; g.beginPath(); g.moveTo(x - 15, y - 4); g.quadraticCurveTo(x, y - 26, x + 15, y - 4); g.closePath(); g.fill();
        px(-2, -30, 4, 6, '#3a3226'); px(-8, -2, 5, 5, '#ffd54f'); px(3, -2, 5, 5, '#ffd54f');
        break;
      case 'polilla_del_polvo':
        g.fillStyle = col; g.beginPath(); g.ellipse(x, y, 6, 12, 0, 0, 7); g.fill();
        for (const s of [-1, 1]) { g.fillStyle = 'rgba(120,110,160,0.8)'; g.beginPath(); g.ellipse(x + s * 14, y - 4 + Math.sin(t * 12) * 2, 12, 8, s * 0.4, 0, 7); g.fill(); }
        px(-3, -8, 2, 2, '#ff5a5a'); px(1, -8, 2, 2, '#ff5a5a');
        break;
      default:
        g.fillStyle = col; g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill();
    }
  }

  _drawPip(g, t) {
    const p = this.pip;
    const acting = this.actor === p && (this.phase === 'menu' || this.phase === 'spell' || this.phase === 'target' || this.phase === 'qte_attack');
    const bob = Math.sin(t * 3) * 2 + (acting ? Math.sin(t * 10) * 1 : 0);
    const x = p.x, y = p.y + bob;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x, p.y + 26, 14, 4, 0, 0, 7); g.fill();
    // aura de guardia
    if (p.guard) { g.strokeStyle = 'rgba(126,232,224,0.7)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y - 2, 22 + Math.sin(t * 6) * 2, 0, 7); g.stroke(); }
    // cuerpo de Pip (encapuchado con farol-alma)
    const px = (dx, dy, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x + dx), Math.round(y + dy), w, h); };
    px(-8, -2, 16, 22, '#3a3358'); px(-9, -14, 18, 14, '#4c4070');
    g.fillStyle = '#d8d2e8'; g.beginPath(); g.arc(x, y - 16, 6, 0, 7); g.fill();
    px(-6, -20, 12, 5, '#2b2440'); // capucha
    px(-3, -16, 2, 2, '#ffd54f'); px(1, -16, 2, 2, '#ffd54f');
    // farol-alma (llama que late con el SP)
    const glow = 0.4 + RunState.sp / DataDB.balance.ignicion.sp_max * 0.6;
    g.fillStyle = `rgba(255,${140 + glow * 60},60,${0.7})`; g.beginPath(); g.arc(x + 12, y - 4, 3 + glow * 2, 0, 7); g.fill();
    const gl = g.createRadialGradient(x + 12, y - 4, 0, x + 12, y - 4, 26); gl.addColorStop(0, `rgba(255,150,60,${0.18 * glow})`); gl.addColorStop(1, 'rgba(255,150,60,0)'); g.fillStyle = gl; g.beginPath(); g.arc(x + 12, y - 4, 26, 0, 7); g.fill();
    // nombre
    this.font(8); g.textAlign = 'center'; g.fillStyle = '#cfc6e8'; g.fillText('Pip', x, p.y + 42);
  }

  _drawSyncRing(g, target, tMs, w, isParry) {
    if (!target) return;
    const x = target.x, y = target.y - 2;
    const progress = clamp(tMs / w.align, 0, 1.4);
    const inner = 12, outer = Math.max(inner, 40 - (40 - inner) * clamp(progress, 0, 1));
    const inPerfect = Math.abs(tMs - w.align) <= w.perfect / 2;
    const inGood = Math.abs(tMs - w.align) <= w.good / 2;
    const col = isParry ? (inGood ? '#7ee8e0' : '#ff3b30') : inPerfect ? '#ffffff' : inGood ? '#ffd54f' : '#b9aee0';
    g.strokeStyle = isParry ? 'rgba(126,232,224,0.9)' : 'rgba(233,226,245,0.9)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, inner, 0, 7); g.stroke();
    g.strokeStyle = col; g.lineWidth = isParry ? 3 : 2.5;
    g.beginPath(); g.arc(x, y, outer, 0, 7); g.stroke();
    if (inPerfect) { g.globalAlpha = 0.35; g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, inner - 2, 0, 7); g.fill(); g.globalAlpha = 1; }
    this.font(9); g.textAlign = 'center'; g.fillStyle = col;
    g.fillText(isParry ? (this.touch ? '¡TOCA!' : '¡E! parar') : (this.touch ? '¡toca!' : '¡pulsa!'), x, y - outer - 8);
    // pips del combo
    if (!isParry && this.qte) { const n = this.qte.total; for (let i = 0; i < n; i++) { const r = this.qte.results[i]; g.fillStyle = r === 'perfect' ? '#fff' : r === 'good' ? '#ffd54f' : r === 'fail' ? '#7a5a5a' : 'rgba(233,226,245,0.3)'; g.fillRect(x - n * 4 + i * 8, y + 34, 5, 4); } }
  }

  _drawTimeline(g, t) {
    const VW = this.VW;
    const order = this._timeline(8);
    const x = VW - 26;
    let y = 58;
    order.forEach((c, i) => {
      const size = i === 0 ? 22 : 18;
      const cx = x, cy = y + size / 2;
      // ficha
      g.fillStyle = c.side === 'aliado' ? '#3a3358' : '#4a2340';
      if (i === 0) g.fillStyle = c.side === 'aliado' ? '#5a4fa0' : '#8a3350';
      g.fillRect(cx - size / 2, y, size, size);
      g.strokeStyle = i === 0 ? '#ffd54f' : 'rgba(200,190,230,0.3)'; g.lineWidth = i === 0 ? 2 : 1;
      g.strokeRect(cx - size / 2, y, size, size);
      // inicial
      this.font(i === 0 ? 10 : 8); g.textAlign = 'center'; g.fillStyle = '#e9e2f5';
      g.fillText(c.side === 'aliado' ? 'P' : c.name[0].toUpperCase(), cx, cy + (i === 0 ? 4 : 3));
      // color elemental
      g.fillStyle = DataDB.elementos[c.element]?.color ?? '#9E9E9E'; g.fillRect(cx - size / 2, y + size - 3, size, 3);
      y += size + 5;
    });
    // etiqueta "AHORA"
    this.font(7); g.fillStyle = '#ffd54f'; g.textAlign = 'center';
    g.save(); g.translate(VW - 44, 66); g.rotate(-Math.PI / 2); g.fillText('AHORA', 0, 0); g.restore();
  }

  _drawPipStatus(g) {
    const VH = this.VH;
    const x = 12, y = VH - 30;
    // corazones
    this.font(9); g.textAlign = 'left'; g.fillStyle = '#e9e2f5';
    const hearts = Math.ceil(this.pip.hp), maxH = this.pip.maxHp;
    let hx = x;
    for (let i = 0; i < maxH; i++) { g.fillStyle = i < this.pip.hp ? '#e0556b' : '#3a2340'; g.fillRect(hx, y, 7, 7); hx += 9; }
    // barra de Espíritu (Overdrive)
    const spMax = DataDB.balance.ignicion.sp_max, sp = RunState.sp;
    const bx = x, by = y + 12, bw = 150;
    g.fillStyle = '#2a2340'; g.fillRect(bx, by, bw, 7);
    const full = sp >= spMax;
    g.fillStyle = full ? '#ffd54f' : '#7a5fd0'; g.fillRect(bx, by, bw * clamp(sp / spMax, 0, 1), 7);
    this.font(7); g.fillStyle = full ? '#ffd54f' : '#8d82ad'; g.fillText(full ? 'IGNICIÓN LISTA' : 'ESPÍRITU ' + Math.round(sp) + '/' + spMax, bx + bw + 6, by + 7);
  }

  _cycleCompas() {
    const act = compasesActivos().map(c => c.id);
    if (act.length < 2) { AudioManager.sfx('no_sp'); this._banner('Más posturas a mayor nivel', 0.9, '#8d82ad'); return; }
    const all = DataDB.compases.compases;
    do { this.compasIdx = (this.compasIdx + 1) % all.length; } while (!act.includes(all[this.compasIdx].id));
    RunState.compas = this.compas.id;
    AudioManager.sfx('equip');
  }

  // ---------- Layout táctil: filas grandes, dedo-amigables ----------
  _menuLayout() {
    if (!this.touch) return null;
    // Rejilla 2×2 de botones gordos + fila de postura: dedos grandes bienvenidos
    const w = 304, cell = 34, gap = 4, x = 8;
    const h = 12 + cell * 3 + gap * 2;
    const y = this.VH - h - 6;
    const cw = (w - 12 - gap) / 2;
    return {
      x, y, w, h,
      row: i => i < 4
        ? { x: x + 6 + (i % 2) * (cw + gap), y: y + 6 + Math.floor(i / 2) * (cell + gap), w: cw, h: cell }
        : { x: x + 6, y: y + 6 + 2 * (cell + gap), w: w - 12, h: cell }
    };
  }
  _spellLayout(n) {
    if (!this.touch) return null;
    const w = 304, cell = 34, gap = 4, x = 8;
    const rows = Math.ceil((n + 1) / 2);
    const h = 12 + rows * cell + (rows - 1) * gap;
    const y = this.VH - h - 6;
    const cw = (w - 12 - gap) / 2;
    return { x, y, w, h, row: i => ({ x: x + 6 + (i % 2) * (cw + gap), y: y + 6 + Math.floor(i / 2) * (cell + gap), w: cw, h: cell }) };
  }
  _backRect() { return { x: 8, y: this.VH - 50, w: 130, h: 40 }; }
  _drawBack(g) {
    const r = this._backRect();
    g.fillStyle = 'rgba(14,10,28,0.92)'; g.fillRect(r.x, r.y, r.w, r.h);
    g.strokeStyle = '#5a4fa0'; g.lineWidth = 1.5; g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    this.font(9); g.textAlign = 'center'; g.fillStyle = '#e9e2f5';
    g.fillText('← atrás', r.x + r.w / 2, r.y + 25);
  }

  _drawMenus(g, t) {
    if (this.phase === 'menu') this._drawCommandMenu(g);
    else if (this.phase === 'spell') this._drawSpellMenu(g);
    else if (this.phase === 'target') {
      if (this.touch) { this._drawBack(g); this._hint(g, '¡Toca a tu objetivo!'); }
      else { this._drawCommandMenu(g, true); this._hint(g, '← → objetivo · Enter confirmar · Esc atrás'); }
    }
    else if (this.phase === 'qte_attack') this._hint(g, (this.touch ? 'Toca en el destello · ' : 'Pulsa ATACAR/Enter en el destello · ') + this.compas.nombre);
    else if (this.phase === 'qte_parry') this._hint(g, this.touch ? '¡PARRY! Toca cuando el anillo cierre' : '¡PARRY! Pulsa E cuando el anillo cierre');
  }

  _panel(g, x, y, w, h) {
    g.fillStyle = 'rgba(14,10,28,0.92)'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#5a4fa0'; g.lineWidth = 1.5; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.strokeStyle = 'rgba(255,213,79,0.25)'; g.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
  }

  _drawCommandMenu(g, dim = false) {
    if (this.touch) {
      const L = this._menuLayout();
      this._panel(g, L.x, L.y, L.w, L.h);
      const cmds = this._commands();
      cmds.forEach((c, i) => {
        const r = L.row(i);
        const sel = i === this.menuIdx && !dim;
        g.fillStyle = c.off ? 'rgba(60,54,90,0.25)' : sel ? 'rgba(255,213,79,0.14)' : 'rgba(90,79,160,0.16)';
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = c.off ? '#3a3358' : sel ? '#ffd54f' : '#5a4fa0'; g.lineWidth = sel ? 2 : 1;
        g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        this.font(10); g.textAlign = 'center';
        g.fillStyle = c.off ? '#5a5470' : sel ? '#ffd54f' : '#e9e2f5';
        g.fillText(c.label, r.x + r.w / 2, r.y + r.h / 2 + 4);
      });
      const pr = L.row(cmds.length);
      g.fillStyle = 'rgba(30,24,55,0.5)'; g.fillRect(pr.x, pr.y, pr.w, pr.h);
      g.strokeStyle = this.compas.color; g.lineWidth = 1; g.strokeRect(pr.x + 0.5, pr.y + 0.5, pr.w - 1, pr.h - 1);
      this.font(9); g.textAlign = 'left'; g.fillStyle = this.compas.color;
      g.fillText('♪ ' + this.compas.nombre + ' · ' + this.compas.golpes + ' golpes', pr.x + 10, pr.y + 22);
      this.font(7); g.textAlign = 'right'; g.fillStyle = '#8d82ad';
      g.fillText(compasesActivos().length < 2 ? 'Nv.2 desbloquea más' : 'toca: cambiar postura', pr.x + pr.w - 10, pr.y + 22); g.textAlign = 'left';
      this._hint(g, cmds[this.menuIdx].sub + ' · toca otra vez para confirmar');
      return;
    }
    const x = 12, y = this.VH - 104, w = 212, h = 76;
    this._panel(g, x, y, w, h);
    const cmds = this._commands();
    g.textAlign = 'left';
    cmds.forEach((c, i) => {
      const cy = y + 14 + i * 12;
      const sel = i === this.menuIdx && !dim;
      this.font(9);
      g.fillStyle = c.off ? '#5a5470' : sel ? '#ffd54f' : '#e9e2f5';
      if (sel) g.fillText('▶', x + 6, cy);
      g.fillText(c.label, x + 18, cy);
    });
    // descripción del comando seleccionado + postura
    this.font(7); g.fillStyle = '#8d82ad';
    g.fillText(cmds[this.menuIdx].sub, x + 6, y + h - 14);
    g.fillStyle = this.compas.color;
    g.fillText('Postura [C]: ' + this.compas.nombre, x + 6, y + h - 4);
  }

  _drawSpellMenu(g) {
    const tomos = this.tomos.map(id => DataDB.hechizo(id)).filter(Boolean);
    if (this.touch) {
      const L = this._spellLayout(tomos.length);
      this._panel(g, L.x, L.y, L.w, L.h);
      tomos.forEach((s, i) => {
        const r = L.row(i);
        const sel = i === this.spellIdx;
        const afford = RunState.sp >= (s.coste_sp ?? 0);
        g.fillStyle = !afford ? 'rgba(60,54,90,0.25)' : sel ? 'rgba(255,213,79,0.14)' : 'rgba(90,79,160,0.16)';
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = !afford ? '#3a3358' : sel ? '#ffd54f' : '#5a4fa0'; g.lineWidth = sel ? 2 : 1;
        g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        this.font(9); g.textAlign = 'left';
        g.fillStyle = !afford ? '#5a5470' : sel ? '#ffd54f' : '#e9e2f5';
        g.fillText(s.nombre, r.x + 8, r.y + 15);
        this.font(7);
        g.fillStyle = DataDB.elementos[s.elemento]?.color ?? '#8d82ad';
        g.fillText((DataDB.elementos[s.elemento]?.nombre ?? '') + ' · ' + s.coste_sp + ' SP', r.x + 8, r.y + 27);
      });
      const br = L.row(tomos.length);
      g.fillStyle = 'rgba(30,24,55,0.5)'; g.fillRect(br.x, br.y, br.w, br.h);
      g.strokeStyle = '#8d82ad'; g.lineWidth = 1; g.strokeRect(br.x + 0.5, br.y + 0.5, br.w - 1, br.h - 1);
      this.font(9); g.textAlign = 'center'; g.fillStyle = '#b9aee0'; g.fillText('← atrás', br.x + br.w / 2, br.y + 21);
      this._hint(g, 'toca un Arte · otra vez para lanzar');
      return;
    }
    const x = 12, y = this.VH - 110, w = 250, h = 78;
    this._panel(g, x, y, w, h);
    g.textAlign = 'left';
    tomos.forEach((s, i) => {
      const cy = y + 14 + i * 15;
      const sel = i === this.spellIdx;
      const afford = RunState.sp >= (s.coste_sp ?? 0);
      this.font(9); g.fillStyle = !afford ? '#5a5470' : sel ? '#ffd54f' : '#e9e2f5';
      if (sel) g.fillText('▶', x + 6, cy);
      g.fillText(s.nombre, x + 18, cy);
      this.font(7);
      g.fillStyle = DataDB.elementos[s.elemento]?.color ?? '#8d82ad';
      g.fillText(DataDB.elementos[s.elemento]?.nombre ?? s.elemento, x + 18, cy + 8);
      g.textAlign = 'right'; g.fillStyle = afford ? '#7a5fd0' : '#5a5470'; this.font(8);
      g.fillText(s.coste_sp + ' SP', x + w - 8, cy); g.textAlign = 'left';
    });
    this._hint(g, '↑ ↓ elegir · Enter lanzar · Esc atrás');
  }

  _hint(g, text) {
    this.font(8); g.textAlign = 'center'; g.fillStyle = '#8d82ad';
    g.fillText(text, this.VW / 2, this.VH - 8);
  }

  _drawBanner(g) {
    if (this.msgT <= 0 || !this.msg) return;
    g.globalAlpha = clamp(this.msgT / 0.4, 0, 1);
    this.font(15); g.textAlign = 'center';
    g.fillStyle = '#000'; g.fillText(this.msg, this.VW / 2 + 1, 41);
    g.fillStyle = this.msgColor; g.fillText(this.msg, this.VW / 2, 40);
    g.globalAlpha = 1;
  }

  _drawVictory(g) {
    g.fillStyle = 'rgba(8,5,16,0.72)'; g.fillRect(0, 0, this.VW, this.VH);
    this.font(18); g.textAlign = 'center'; g.fillStyle = '#ffd54f';
    g.fillText('VICTORIA', this.VW / 2, this.VH / 2 - 20);
    this.font(10); g.fillStyle = '#e9e2f5';
    g.fillText('+' + this.reward.oro + ' oro   ◆ +' + this.reward.mem + ' Memoria', this.VW / 2, this.VH / 2 + 6);
    this.font(9); g.fillStyle = '#8d82ad';
    g.fillText('Enter / tap para volver al pueblo', this.VW / 2, this.VH / 2 + 30);
  }

  _drawDefeat(g) {
    g.fillStyle = 'rgba(8,5,16,0.78)'; g.fillRect(0, 0, this.VW, this.VH);
    this.font(18); g.textAlign = 'center'; g.fillStyle = '#e0556b';
    g.fillText('TE HAS DETENIDO', this.VW / 2, this.VH / 2 - 8);
    this.font(9); g.fillStyle = '#8d82ad';
    g.fillText('El duelo era un ensayo. Enter / tap para volver.', this.VW / 2, this.VH / 2 + 20);
  }
}
