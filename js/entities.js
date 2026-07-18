// Entidades y componentes — composición sobre herencia.
import { DataDB } from './data_db.js';
import { EventBus } from './event_bus.js';
import { AudioManager, RunState } from './state.js';
import { esferaBonos } from './esfera.js';

// ---------- Componentes ----------
export class HealthComponent {
  constructor(max) { this.max = max; this.hp = max; this.invuln = 0; this.dead = false; }
  update(dt) { if (this.invuln > 0) this.invuln -= dt; }
  takeDamage(amount, iframes = 0) {
    if (this.dead || this.invuln > 0) return false;
    this.hp -= amount;
    this.invuln = iframes;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return true;
  }
}

// ---------- Colisiones ----------
export function circleHit(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  const r = a.r + b.r;
  return dx * dx + dy * dy < r * r;
}
export function circleRectHit(c, rect) {
  const cx = Math.min(Math.max(c.x, rect.x), rect.x + rect.w);
  const cy = Math.min(Math.max(c.y, rect.y), rect.y + rect.h);
  const dx = c.x - cx, dy = c.y - cy;
  return dx * dx + dy * dy < c.r * c.r;
}
// Empuja el círculo fuera de los rects sólidos. Devuelve true si hubo choque.
export function resolveCircleRects(ent, rects) {
  let hit = false;
  for (const rect of rects) {
    const cx = Math.min(Math.max(ent.x, rect.x), rect.x + rect.w);
    const cy = Math.min(Math.max(ent.y, rect.y), rect.y + rect.h);
    let dx = ent.x - cx, dy = ent.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= ent.r * ent.r) continue;
    hit = true;
    if (d2 === 0) { // centro dentro del rect: expulsar por el eje más corto
      const l = ent.x - rect.x, r = rect.x + rect.w - ent.x;
      const t = ent.y - rect.y, b = rect.y + rect.h - ent.y;
      const m = Math.min(l, r, t, b);
      if (m === l) ent.x = rect.x - ent.r;
      else if (m === r) ent.x = rect.x + rect.w + ent.r;
      else if (m === t) ent.y = rect.y - ent.r;
      else ent.y = rect.y + rect.h + ent.r;
    } else {
      const d = Math.sqrt(d2);
      ent.x = cx + dx / d * ent.r;
      ent.y = cy + dy / d * ent.r;
    }
  }
  return hit;
}

// ---------- Player ----------
export class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = 8;
    this.aim = { x: 1, y: 0 };
    this.fireCd = 0;
    this.trail = [];
    this.dashT = 0; this.dashCd = 0; this.dashDir = [1, 0]; this.dashElapsed = 0;
    this.comboIframeT = 0; // i-frames breves al conectar un golpe de Cadencia (G4)
    this.groove = 0; this.grooveBuffed = false; // racha (G7c): sube encadenando, cae al recibir
    this.parryCd = 0;
    this.castT = 0; this.parryAnimT = 0; // ventanas de POSE de sprite (arte/parada); solo visual
    this.facing = 1; // 1 mira a la dcha, -1 a la izda; drawPlayer anima el giro (solo visual)
    this.ignicionT = 0; this._igDur = 1; // transformación Ignición (F con SP lleno)
    this.attackAnim = null; // {t, tmax, dir, finisher} — lo setea main en cadencia_hit
    this.comboLock = false; // lo controla el sistema de Cadencia
    this.mods = Player.freshMods();   // efectos acumulados de items (js/items.js)
    this.armor = 0; this.autoParryCharges = 0;
    this.applyBalance(true);
  }
  static freshMods() {
    return {
      statMult: {}, statAdd: {},
      tearFlags: new Set(), tearElement: null,
      cadencia: { window_scale: 1, combo_add: 0 },
      spGainMult: 1,
      ignicionDurAdd: 0,
      armorPerRoom: 0, autoParryPerRoom: 0,
      finisherShock: null, parryFreezeS: 0,
      familiares: [], activo: null,
      revealMap: false, dashTrail: null, extraChoice: 0,
      sinergias: [], pendientes: []
    };
  }
  get b() { return this.stats; } // compatibilidad: stats efectivos (base × items)
  applyBalance(resetHp = false) {
    this.recomputeStats();
    if (resetHp) this.health = new HealthComponent(this.stats.max_hp);
    else { this.health.max = this.stats.max_hp; this.health.hp = Math.min(this.health.hp, this.health.max); }
  }
  recomputeStats() {
    const base = DataDB.balance.player;
    const s = {};
    for (const k of Object.keys(base)) {
      let v = base[k];
      if (this.mods.statMult[k] != null) v *= this.mods.statMult[k];
      // max_hp se expresa en corazones en los items → 2 puntos por corazón
      if (this.mods.statAdd[k] != null) v += this.mods.statAdd[k] * (k === 'max_hp' ? 2 : 1);
      s[k] = v;
    }
    // Esfera del Reloj: nodos activados (progresión permanente); misma convención de corazones
    const eb = esferaBonos();
    for (const k in eb.statMult) if (s[k] != null) s[k] *= eb.statMult[k];
    for (const k in eb.statAdd) if (s[k] != null) s[k] += eb.statAdd[k] * (k === 'max_hp' ? 2 : 1);
    // Ignición: el alma de Pip arde sin cera — todo se acelera
    if (this.ignicionT > 0) {
      const I = DataDB.balance.ignicion;
      s.move_speed *= I.speed_mult;
      s.tear_rate_per_s *= I.tear_rate_mult;
      s.tear_damage *= I.damage_mult;
      s.melee_damage *= I.damage_mult;
    }
    // Groove/racha (G7c): con la barra alta, Pip pega y corre más (recompensa la agresividad)
    if (this.grooveBuffed) {
      const G = DataDB.balance.groove;
      s.move_speed *= (G?.buff_speed_mult ?? 1);
      s.tear_damage *= (G?.buff_dano_mult ?? 1);
      s.melee_damage *= (G?.buff_dano_mult ?? 1);
    }
    this.stats = s;
    if (this.health) {
      this.health.max = s.max_hp;
      this.health.hp = Math.min(this.health.hp, s.max_hp);
    }
  }
  // Al entrar en sala: recargar cargas por-sala (corazón de lata, campana rasgada)
  onRoomEntered() {
    this.armor = this.mods.armorPerRoom;
    this.autoParryCharges = this.mods.autoParryPerRoom;
  }

  // Groove (G7c): sumar racha. Al cruzar el umbral se enciende el buff (recompute).
  addGroove(amount) {
    const G = DataDB.balance.groove; if (!G) return;
    this.groove = Math.min(G.max, this.groove + amount);
    this._checkGrooveBuff();
  }
  _checkGrooveBuff() {
    const G = DataDB.balance.groove; if (!G) return;
    const buffed = this.groove >= (G.umbral_buff ?? 60);
    if (buffed !== this.grooveBuffed) {
      this.grooveBuffed = buffed;
      this.recomputeStats();
      EventBus.emit('groove_buff', buffed);
    }
  }
  get grooveFrac() { return this.groove / (DataDB.balance.groove?.max ?? 100); }
  get invulnerable() { return this.health.invuln > 0 || this.comboIframeT > 0 || (this.dashT > 0 && this.dashElapsed < this.b.dash_iframes_s); }
  // Hurtbox del jugador: más pequeña que el cuerpo (justicia bullet-hell: solo cuentan los golpes claros)
  get hurtR() { return this.r * 0.7; }

  startIgnicion() {
    const I = DataDB.balance.ignicion;
    this._igDur = I.duration_s + this.mods.ignicionDurAdd + esferaBonos().ignicionDur;
    this.ignicionT = this._igDur;
    this.recomputeStats();
    EventBus.emit('ignicion_started', this);
  }
  endIgnicion() {
    this.ignicionT = 0;
    this.recomputeStats();
    RunState.sp = 0;
    EventBus.emit('sp_changed', 0);
    EventBus.emit('ignicion_ended', this);
  }

  update(dt, input, roomCtx, world) {
    const b = this.b;
    this.health.update(dt);
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.comboIframeT > 0) this.comboIframeT -= dt;
    // La racha (groove) se enfría poco a poco si dejas de encadenar
    if (this.groove > 0) {
      this.groove = Math.max(0, this.groove - (DataDB.balance.groove?.decay_por_s ?? 6) * dt);
      this._checkGrooveBuff();
    }
    if (this.parryCd > 0) this.parryCd -= dt;
    if (this.castT > 0) this.castT -= dt;        // pose de Arte (visual)
    if (this.parryAnimT > 0) this.parryAnimT -= dt; // pose de Parada (visual)
    // Orientación: Pip mira hacia donde CAMINA (o ataca); parado, hacia el apuntado.
    // Umbral en vx para no voltear al moverse solo en vertical; drawPlayer suaviza el giro.
    if (this.attackAnim && this.attackAnim.dir[0]) this.facing = this.attackAnim.dir[0] >= 0 ? 1 : -1;
    else if (Math.abs(this.vx) > 22) this.facing = this.vx > 0 ? 1 : -1;
    else if (Math.hypot(this.vx, this.vy) < 24 && Math.abs(this.aim.x) > 0.3) this.facing = this.aim.x >= 0 ? 1 : -1;
    // Ignición: consume el Espíritu como combustible
    if (this.ignicionT > 0) {
      this.ignicionT -= dt;
      RunState.sp = Math.max(0, Math.round(DataDB.balance.ignicion.sp_max * this.ignicionT / this._igDur));
      if (this.ignicionT <= 0) this.endIgnicion();
    }
    if (this.attackAnim) { this.attackAnim.t -= dt; if (this.attackAnim.t <= 0) this.attackAnim = null; }

    let [mx, my] = input.moveVector();
    const damp = this.comboLock ? DataDB.balance.cadencia.move_damp_in_combo : 1;

    if (input.justPressed('dash') && this.dashCd <= 0 && this.dashT <= 0) {
      input.consume?.('dash');
      this.dashT = b.dash_duration_s; this.dashElapsed = 0;
      this.dashCd = b.dash_cooldown_s;
      const flick = input.flickDir?.();
      this.dashDir = flick ?? ((mx || my) ? [mx, my] : [this.aim.x, this.aim.y]);
      AudioManager.sfx('dash');
    }

    if (this.dashT > 0) {
      this.dashT -= dt; this.dashElapsed += dt;
      this.vx = this.dashDir[0] * b.dash_speed;
      this.vy = this.dashDir[1] * b.dash_speed;
      this.trail.push({ x: this.x, y: this.y, t: 0.22 });
    } else {
      if (mx || my) {
        // Turn assist: frenar-girar más rápido cuando el input opone la inercia
        const ta = DataDB.balance.game_feel?.turn_assist_mult ?? 1;
        const tm = this.terrainMult ?? 1; // tinta del Archivo: frena (o surf con la marea)
        const boost = (mx * this.vx + my * this.vy) < 0 ? ta : 1;
        this.vx += mx * b.acceleration * damp * boost * tm * dt;
        this.vy += my * b.acceleration * damp * boost * tm * dt;
        const cap = b.move_speed * damp * tm;
        const sp = Math.hypot(this.vx, this.vy);
        if (sp > cap) { this.vx *= cap / sp; this.vy *= cap / sp; }
      } else {
        const sp = Math.hypot(this.vx, this.vy);
        if (sp > 0) {
          const ns = Math.max(0, sp - b.friction * dt);
          this.vx *= ns / sp; this.vy *= ns / sp;
        }
      }
    }

    this.x += this.vx * dt; this.y += this.vy * dt;
    resolveCircleRects(this, roomCtx.playerSolids());
    roomCtx.clampPlayer(this); // muros + huecos de puerta (lo gestiona la sala)

    for (const tr of this.trail) tr.t -= dt;
    this.trail = this.trail.filter(tr => tr.t > 0);

    // Apuntar y disparar (twin-stick). Durante un combo de Cadencia no se dispara.
    let a = input.aimVector(this.x, this.y);
    // Aim assist en esquemas imprecisos (táctil / teclado 8-dir): imantar al enemigo en cono
    const gf = DataDB.balance.game_feel;
    if (gf && world.enemies && (input.touchState?.().enabled || input.scheme?.() === 'flechas')) {
      const cosCone = Math.cos((gf.aim_assist_cone_deg ?? 0) * Math.PI / 180);
      let best = null, bestDot = cosCone;
      for (const e of world.enemies) {
        if (e.health.dead) continue;
        const ex = e.x - this.x, ey = e.y - this.y;
        const d = Math.hypot(ex, ey);
        if (d < 12 || d > (gf.aim_assist_range_px ?? 0)) continue;
        const dot = (ex * a.x + ey * a.y) / d;
        if (dot > bestDot) { bestDot = dot; best = { x: ex / d, y: ey / d }; }
      }
      if (best) a = { x: best.x, y: best.y, active: a.active };
    }
    // UNA MANO: fijado automático (pegajoso) + auto-disparo — el pulgar solo mueve y marca ritmo
    let autoFire = false;
    if (input.scheme?.() === 'una_mano' && world.enemies) {
      const um = DataDB.balance.una_mano ?? {};
      const rango = um.lock_range_px ?? 260;
      let lock = this.lockE;
      if (lock && (lock.health.dead || Math.hypot(lock.x - this.x, lock.y - this.y) > rango * 1.3)) lock = null;
      if (!lock) {
        let bd = rango;
        for (const e of world.enemies) {
          if (e.health.dead) continue;
          const d = Math.hypot(e.x - this.x, e.y - this.y);
          if (d < bd) { bd = d; lock = e; }
        }
      }
      this.lockE = lock;
      if (lock) {
        const d = Math.hypot(lock.x - this.x, lock.y - this.y) || 1;
        a = { x: (lock.x - this.x) / d, y: (lock.y - this.y) / d, active: true };
        input.setAim?.(a.x, a.y);
        autoFire = (um.autofire ?? true);
      }
    } else this.lockE = null;
    this.aim = a;
    this.fireCd -= dt;
    const shooting = input.shooting() || autoFire;
    // G7b — cancelar disparando entre golpes: durante el combo SÍ puedes tirar
    // (mezclar melé y tiro) si shoot_during_combo está activo.
    const tiroBloqueado = this.comboLock && !(DataDB.balance.cadencia?.shoot_during_combo);
    if ((!shooting || tiroBloqueado) && this.fireCd < 0) this.fireCd = 0; // el remanente solo cuenta en fuego sostenido
    if (!tiroBloqueado && shooting && this.fireCd <= 0) {
      this.fireCd += 1 / b.tear_rate_per_s; // conserva el remanente: cadencia exacta de la spec
      const heavy = this.mods.tearFlags.has('heavy');
      const opts = { elemento: this.mods.tearElement ?? 'neutro', flags: this.mods.tearFlags, r: heavy ? 5 : 3.5 };
      world.tears.spawn(this.x + a.x * 6, this.y + a.y * 6,
        a.x * b.tear_speed + this.vx * 0.2, a.y * b.tear_speed + this.vy * 0.2,
        b.tear_range_px, b.tear_damage, opts);
      if (this.mods.tearFlags.has('mirror_back')) {
        world.tears.spawn(this.x - a.x * 6, this.y - a.y * 6,
          -a.x * b.tear_speed + this.vx * 0.2, -a.y * b.tear_speed + this.vy * 0.2,
          b.tear_range_px, b.tear_damage, opts);
      }
      EventBus.emit('tear_fired', this.x + a.x * 8, this.y + a.y * 8, a.x, a.y);
      AudioManager.sfx('tear');
    }
  }

  hurt(amount, fromX, fromY) {
    if (this.invulnerable) return false;
    // Ignición: piel de bronce ardiente (mitad de daño)
    if (this.ignicionT > 0) amount = Math.max(1, Math.round(amount * DataDB.balance.ignicion.defense_mult));
    // Armadura por sala (corazón de lata): absorbe el golpe
    if (this.armor > 0) {
      this.armor--;
      this.health.invuln = 0.5;
      AudioManager.sfx('armor');
      EventBus.emit('armor_absorbed', this);
      return false;
    }
    if (!this.health.takeDamage(amount, this.b.hurt_iframes_s)) return false;
    // Recibir daño rompe la racha (groove): el flow premia NO ser tocado
    if (this.groove > 0) { this.groove = Math.max(0, this.groove - (DataDB.balance.groove?.perdida_al_recibir ?? 45)); this._checkGrooveBuff(); }
    const dx = this.x - fromX, dy = this.y - fromY;
    const l = Math.hypot(dx, dy) || 1;
    const kb = this.b.hurt_knockback_px_s;
    this.vx = dx / l * kb; this.vy = dy / l * kb;
    AudioManager.sfx('hurt');
    EventBus.emit('player_hurt', this.health.hp, amount);
    if (this.health.dead) { AudioManager.sfx('die'); EventBus.emit('player_died'); }
    return true;
  }
}

// ---------- Pools ----------
export class Pool {
  constructor(size, make) {
    this.items = Array.from({ length: size }, () => ({ active: false, ...make() }));
  }
  spawn(props) {
    let it = this.items.find(i => !i.active);
    if (!it) { it = this.items[0]; }
    Object.assign(it, props, { active: true });
    return it;
  }
  forEach(fn) { for (const it of this.items) if (it.active) fn(it); }
  clear() { for (const it of this.items) it.active = false; }
  get count() { return this.items.reduce((n, i) => n + (i.active ? 1 : 0), 0); }
}

export class TearPool extends Pool {
  constructor() { super(96, () => ({ x: 0, y: 0, vx: 0, vy: 0, traveled: 0, range: 0, damage: 0, r: 3.5, elemento: 'neutro', flags: null, split: false })); }
  spawn(x, y, vx, vy, range, damage, opts = {}) {
    return super.spawn({
      x, y, vx, vy, range, damage, traveled: 0,
      elemento: opts.elemento ?? 'neutro',
      flags: opts.flags ?? null,
      split: opts.split ?? false,
      _lastWax: null,
      r: opts.r ?? 3.5
    });
  }
  update(dt, bounds) {
    this.forEach(t => {
      t.x += t.vx * dt; t.y += t.vy * dt;
      t.traveled += Math.hypot(t.vx, t.vy) * dt;
      if (t.traveled > t.range ||
          t.x < bounds.x || t.x > bounds.x + bounds.w || t.y < bounds.y || t.y > bounds.y + bounds.h) {
        t.active = false;
      }
    });
  }
}

export class BulletPool extends Pool {
  constructor() { super(96, () => ({ x: 0, y: 0, vx: 0, vy: 0, damage: 1, r: 3, color: '#9E9E9E' })); }
  update(dt, bounds) {
    this.forEach(b => {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < bounds.x || b.x > bounds.x + bounds.w || b.y < bounds.y || b.y > bounds.y + bounds.h) b.active = false;
    });
  }
}

// ---------- Enemigos (data-driven desde data/enemigos.json) ----------
export class Enemy {
  // overrides: para variantes (jefe placeholder, dummy del playground...)
  constructor(id, x, y, overrides = {}) {
    const base = DataDB.enemigo(id);
    if (!base) throw new Error(`Enemy: id desconocido '${id}'`);
    this.def = { ...base, ...overrides };
    // Escalado de daño por piso (spec §4): multiplica contacto/proyectil/explosión
    const dm = this.def.danoMult ?? 1;
    delete this.def.danoMult;
    if (dm !== 1) {
      if (this.def.dano_contacto > 0) this.def.dano_contacto = Math.max(1, Math.round(this.def.dano_contacto * dm));
      if (this.def.proyectil) this.def.proyectil = { ...this.def.proyectil, dano: Math.max(1, Math.round(this.def.proyectil.dano * dm)) };
      if (this.def.explosion) this.def.explosion = { ...this.def.explosion, dano: Math.max(1, Math.round(this.def.explosion.dano * dm)) };
    }
    this.id = id;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.r = overrides.r ?? 10;
    this.health = new HealthComponent(this.def.hp);
    this.flash = 0;
    this.fireCd = (this.def.proyectil?.cadencia_s ?? 1) * (0.5 + Math.random() * 0.5);
    this.kbx = 0; this.kby = 0;
    this.spin = Math.random() * Math.PI * 2;
    this.countering = false;   // true mientras su anillo de Cadencia es ROJO
    this.slowT = 0;            // ralentizado (ola del Sello de Marea)
    this.priming = 0;          // velon_inestable: cuenta atrás de explosión
    this.burn = null;          // DoT de fuego {t, tick}
    this.atk = { state: 'idle', t: 0, dir: [1, 0] }; // ataque telegrafiado (melee)
    this.channel = 0;          // cerero_errante: canalización de reavivado
    this.twin = null;          // minutero_gemelo: vínculo
    this.enraged = false;
    const ang = Math.random() * Math.PI * 2;
    this.wander = [Math.cos(ang), Math.sin(ang)];
    // Jefe: campanadas telegrafiadas + invocación a mitad de vida
    if (this.def.jefe) { this.bellT = 3.2; this.belling = 0; this.summoned = false; }
  }
  get elementColor() { return DataDB.elementos[this.def.elemento]?.color ?? '#9E9E9E'; }
  // Enemigos de melé: atacan con windup telegrafiado → parryable
  get melees() { return this.def.comportamiento === 'chase' || this.def.comportamiento === 'chase_heavy'; }
  get parryable() {
    const w = DataDB.balance.parry.window_s;
    return this.melees && (this.atk.state === 'strike' || (this.atk.state === 'windup' && this.atk.t <= w));
  }
  stun(s) {
    this.atk.state = 'stunned'; this.atk.t = s;
    this.vx = this.vy = 0;
  }

  _enrage() {
    this.enraged = true;
    this.def = { ...this.def, velocidad: this.def.velocidad * 1.55 };
    AudioManager.beep(160, 0.3, 'sawtooth', 0.06, 220);
    EventBus.emit('gemelo_enfurecido', this);
  }

  die() {
    if (this.health.dead) return;
    this.health.dead = true; this.health.hp = 0;
    if (this.twin && !this.twin.health.dead) this.twin._enrage(); // el gemelo superviviente enloquece
    AudioManager.sfx('enemy_die');
    EventBus.emit('enemy_died', this);
  }

  update(dt, player, roomCtx, world) {
    this.health.update(dt);
    if (this.flash > 0) this.flash -= dt;
    // Quemadura (DoT de fuego)
    if (this.burn) {
      this.burn.t -= dt;
      this.burn.tick = (this.burn.tick ?? 0) - dt;
      if (this.burn.tick <= 0) {
        this.burn.tick = 1;
        this.takeDamage(DataDB.balance.hechizos?.quema_dano_por_s ?? 1, this.x, this.y, 0);
      }
      if (this.burn.t <= 0) this.burn = null;
    }
    this.spin += dt * 3;
    const def = this.def;
    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;

    // --- Patrones de jefe (Campanero Mayor) ---
    if (def.jefe) {
      if (!this.summoned && this.health.hp <= this.health.max / 2) {
        this.summoned = true;
        this.def = { ...def, velocidad: def.velocidad * 1.3 };
        EventBus.emit('boss_summon', this);
      }
      if (this.belling > 0) {
        this.vx = this.vy = 0;
        this.belling -= dt;
        if (this.belling <= 0) {
          this.bellT = 3.2 + Math.random() * 1.6;
          EventBus.emit('boss_campanada', this);
        }
        return; // inmóvil mientras carga la campanada
      }
      if (this.atk.state === 'idle') {
        this.bellT -= dt;
        if (this.bellT <= 0) {
          this.belling = 0.9;
          AudioManager.beep(180, 0.5, 'sine', 0.06, -60);
          EventBus.emit('boss_campanada_telegraph', this);
        }
      }
    }

    switch (def.comportamiento) {
      case 'chase':
      case 'chase_heavy': {
        // Máquina de estados: idle(persigue) → windup(telegrafiado) → strike(embiste) → recover
        const A = DataDB.balance.enemigo_melee;
        const atk = this.atk;
        if (atk.state === 'stunned') {
          this.vx = this.vy = 0; atk.t -= dt;
          if (atk.t <= 0) atk.state = 'idle';
          break;
        }
        if (atk.state === 'windup') {
          this.vx = this.vy = 0; atk.t -= dt;
          const wdur = A.windup_s * (def.windup_mult ?? 1);
          // re-apunta a mitad del windup (aún esquivable)
          if (atk.t > wdur * 0.4) atk.dir = [dx / dist, dy / dist];
          if (atk.t <= 0) {
            atk.state = 'strike'; atk.t = A.strike_s;
            AudioManager.beep(240, 0.09, 'sawtooth', 0.06, 160);
            EventBus.emit('enemy_strike', this);
          }
          break;
        }
        if (atk.state === 'strike') {
          this.vx = atk.dir[0] * def.velocidad * A.strike_speed_mult * (def.strike_mult ?? 1);
          this.vy = atk.dir[1] * def.velocidad * A.strike_speed_mult * (def.strike_mult ?? 1);
          atk.t -= dt;
          if (atk.t <= 0) { atk.state = 'recover'; atk.t = A.recover_s; }
          break;
        }
        if (atk.state === 'recover') {
          this.vx = this.vy = 0; atk.t -= dt;
          if (atk.t <= 0) atk.state = 'idle';
          break;
        }
        this.vx = dx / dist * def.velocidad;
        this.vy = dy / dist * def.velocidad;
        if (dist < A.trigger_range_px + this.r + player.r) {
          atk.state = 'windup'; atk.t = A.windup_s * (def.windup_mult ?? 1);
          atk.dir = [dx / dist, dy / dist];
          AudioManager.beep(520, 0.08, 'triangle', 0.04, -180);
          // Relojería Invertida: telegrafía DOBLE (el tiempo duda)
          if ((def.windup_mult ?? 1) > 1) setTimeout(() => AudioManager.beep(520, 0.08, 'triangle', 0.04, -180), 260);
          EventBus.emit('enemy_windup', this);
        }
        break;
      }
      case 'cuckoo': {
        // Reloj de pared con patas: canta y dispara en abanico cada compás EXACTO
        this.vx = this.vy = 0;
        this.fireCd -= dt;
        if (this.fireCd < 0.55 && !this._ticked) { this._ticked = true; AudioManager.beep(1320, 0.06, 'square', 0.045); }
        if (this.fireCd <= 0 && def.proyectil) {
          this.fireCd = def.proyectil.cadencia_s; this._ticked = false;
          AudioManager.beep(880, 0.09, 'square', 0.05, -220);
          const base = Math.atan2(dy, dx);
          for (const off of [-0.34, 0, 0.34]) {
            world.bullets.spawn({
              x: this.x, y: this.y,
              vx: Math.cos(base + off) * def.proyectil.velocidad,
              vy: Math.sin(base + off) * def.proyectil.velocidad,
              damage: def.proyectil.dano, color: '#ffd54f'
            });
          }
        }
        break;
      }
      case 'reviver': {
        // Cerero: busca un caído y lo reaviva a media vida (los cereros no se reavivan entre sí)
        const corpses = (world.corpses ?? []).filter(c => c.id !== 'cerero_errante');
        let corpse = null, cd = 1e9;
        for (const c of corpses) { const d2 = Math.hypot(c.x - this.x, c.y - this.y); if (d2 < cd) { cd = d2; corpse = c; } }
        if (corpse) {
          if (cd < 16) {
            this.vx = this.vy = 0;
            this.channel += dt;
            if (this.channel > 1.3) {
              this.channel = 0;
              world.corpses.splice(world.corpses.indexOf(corpse), 1);
              const def2 = DataDB.enemigo(corpse.id);
              if (def2) {
                const rev = new Enemy(corpse.id, corpse.x, corpse.y, { hp: Math.max(2, Math.round(corpse.hp / 2)) });
                rev.room = this.room;
                world.enemies.push(rev);
                AudioManager.sfx('enemy_spawn');
                EventBus.emit('enemigo_reavivado', rev, this);
              }
            }
          } else {
            this.channel = 0;
            this.vx = (corpse.x - this.x) / cd * def.velocidad;
            this.vy = (corpse.y - this.y) / cd * def.velocidad;
          }
        } else {
          this.channel = 0;
          // sin trabajo: mantiene distancia con el jugador
          this.vx = -dx / dist * def.velocidad * 0.6;
          this.vy = -dy / dist * def.velocidad * 0.6;
        }
        break;
      }
      case 'flee_aura': {
        // El Afinador: no ataca; huye en diagonal y DESAFINA tu Cadencia mientras viva
        const wob = Math.sin(this.spin * 2) * 0.6;
        this.vx = (-dx / dist + wob * -dy / dist) * def.velocidad;
        this.vy = (-dy / dist + wob * dx / dist) * def.velocidad;
        break;
      }
      case 'turret': {
        this.vx = this.vy = 0;
        this.fireCd -= dt;
        if (this.fireCd <= 0 && def.proyectil) {
          this.fireCd = def.proyectil.cadencia_s;
          world.bullets.spawn({
            x: this.x, y: this.y,
            vx: dx / dist * def.proyectil.velocidad,
            vy: dy / dist * def.proyectil.velocidad,
            damage: def.proyectil.dano, color: this.elementColor
          });
          AudioManager.beep(980, 0.05, 'square', 0.03);
        }
        break;
      }
      case 'orbit_shoot': {
        // Polilla: orbita al jugador a su radio (orbita_px del JSON) y escupe
        // polvo con su cadencia. Sentido de giro fijo por instancia.
        if (this._orbitDir === undefined) this._orbitDir = Math.random() < 0.5 ? -1 : 1;
        const orbitR = def.orbita_px ?? 120;
        const tx = -dy / dist * this._orbitDir, ty = dx / dist * this._orbitDir;
        // Corrección radial: acercarse/alejarse hasta el radio de órbita
        const radial = Math.max(-1, Math.min(1, (dist - orbitR) / orbitR * 2));
        let mx = tx + dx / dist * radial, my = ty + dy / dist * radial;
        const ml = Math.hypot(mx, my) || 1;
        this.vx = mx / ml * def.velocidad;
        this.vy = my / ml * def.velocidad;
        this.fireCd -= dt;
        if (this.fireCd <= 0 && def.proyectil) {
          this.fireCd = def.proyectil.cadencia_s;
          world.bullets.spawn({
            x: this.x, y: this.y,
            vx: dx / dist * def.proyectil.velocidad,
            vy: dy / dist * def.proyectil.velocidad,
            damage: def.proyectil.dano, color: this.elementColor
          });
          AudioManager.beep(700, 0.06, 'sine', 0.035, -120);
        }
        break;
      }
      case 'wander_bounce': {
        const jitter = (Math.random() - 0.5) * 2.4 * dt;
        const [wx, wy] = this.wander;
        const c = Math.cos(jitter), s = Math.sin(jitter);
        this.wander = [wx * c - wy * s, wx * s + wy * c];
        this.vx = this.wander[0] * def.velocidad;
        this.vy = this.wander[1] * def.velocidad;
        break;
      }
      case 'chase_explode': {
        // Persigue; cerca del jugador se planta, telegrafía y estalla
        if (this.priming > 0) {
          this.vx = this.vy = 0;
          this.priming -= dt;
          if (this.priming <= 0) this._explode(player);
        } else {
          this.vx = dx / dist * def.velocidad;
          this.vy = dy / dist * def.velocidad;
          if (dist < def.explosion.radio_px * 0.7) {
            this.priming = def.explosion.telegraph_s;
            AudioManager.beep(1000, 0.1, 'sine', 0.05, 400);
          }
        }
        break;
      }
      default: this.vx = this.vy = 0;
    }

    // Lento (ola de Marea): el mundo le pesa un rato
    if (this.slowT > 0) {
      this.slowT -= dt;
      this.vx *= 0.55; this.vy *= 0.55;
    }
    this.x += (this.vx + this.kbx) * dt;
    this.y += (this.vy + this.kby) * dt;
    this.kbx *= Math.pow(0.0001, dt); this.kby *= Math.pow(0.0001, dt);

    // Obstáculos: los voladores los ignoran
    if (!def.vuela) {
      const bumped = resolveCircleRects(this, roomCtx.groundSolids());
      if (bumped && def.comportamiento === 'wander_bounce') {
        this.wander[0] *= -1; this.wander[1] *= -1;
      }
    }
    // Límites de sala
    const b = roomCtx.bounds;
    const minX = b.x + this.r, maxX = b.x + b.w - this.r;
    const minY = b.y + this.r, maxY = b.y + b.h - this.r;
    if (this.x < minX || this.x > maxX) { this.wander[0] *= -1; this.x = Math.min(Math.max(this.x, minX), maxX); }
    if (this.y < minY || this.y > maxY) { this.wander[1] *= -1; this.y = Math.min(Math.max(this.y, minY), maxY); }
  }

  _explode(player) {
    const ex = this.def.explosion;
    EventBus.emit('enemy_exploded', this.x, this.y, ex.radio_px);
    AudioManager.sfx('explode');
    const d = Math.hypot(player.x - this.x, player.y - this.y);
    if (d < ex.radio_px + player.r) player.hurt(ex.dano, this.x, this.y);
    this.die();
  }

  // Devuelve el daño aplicado (0 si no)
  takeDamage(base, fromX, fromY, kbMult = 1) {
    // Gemelos vinculados: mientras ambos viven, se protegen (mitad de daño)
    if (this.def.gemelo && this.twin && !this.twin.health.dead) base *= 0.5;
    const dmg = Math.max(1, Math.round(base)); // redondeo final, mínimo 1
    if (!this.health.takeDamage(dmg)) return 0;
    this.flash = 0.08;
    const dx = this.x - fromX, dy = this.y - fromY;
    const l = Math.hypot(dx, dy) || 1;
    const kb = DataDB.balance.player.tear_knockback_px_s * kbMult;
    this.kbx += dx / l * kb; this.kby += dy / l * kb;
    if (this.health.dead) {
      this.health.dead = false; // die() emite la señal una sola vez
      this.die();
    } else {
      AudioManager.sfx('hit');
    }
    return dmg;
  }
}
