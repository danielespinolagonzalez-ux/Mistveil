// Tutorial guiado — "La primera cuerda". Fases que enseñan una mecánica cada una
// y terminan enseñando a COMBINARLAS. Corre sobre el modo play normal (deps inyectadas).
import { DataDB } from './data_db.js';
import { GameState, RunState, SaveManager, AudioManager } from './state.js';
import { EventBus } from './event_bus.js';

export class Tutorial {
  // deps: {world, cad, Input, flash, font, ctx, VW, VH, Enemy, currentRoom()}
  constructor(deps) {
    this.d = deps;
    this.active = false;
    this.fase = 0; this.n = 0; this.t = 0; this.doneT = 0;
    this.moveT = 0; this.dashWas = false; this.igWas = false;
    this._hooks = [];
  }
  _on(ev, fn) { EventBus.on(ev, fn); this._hooks.push([ev, fn]); }
  _offAll() { for (const [ev, fn] of this._hooks) EventBus.off?.(ev, fn); this._hooks = []; }

  begin() {
    this.active = true; this.fase = 0; this.n = 0; this.t = 0; this.doneT = 0; this.moveT = 0;
    const w = this.d.world;
    w.enemies = w.enemies.filter(e => false); // sin vagabundos: el taller está en silencio
    this._on('enemy_died', () => { if (this.active) this.n++; });
    this._on('cadencia_ended', (why) => { if (this.active && this.fase === 2 && why !== 'fail_break') this.n++; });
    this._on('cadencia_hit', ({ quality }) => { if (this.active && this.fase === 2 && quality === 'perfect') this.perfects = (this.perfects ?? 0) + 1; });
    this._on('cadencia_parried', () => { if (this.active && this.fase === 3) this.n++; });
    this._on('hechizo_lanzado', () => { if (this.active && this.fase === 5) this.n++; });
    AudioManager.sfx('tome');
  }

  _spawn(id, n = 1, ov = {}) {
    const { world, Enemy, currentRoom } = this.d;
    const room = currentRoom();
    const p = this.d.world.player;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.7;
      const e = new Enemy(id, p.x + Math.cos(a) * 88, p.y + Math.sin(a) * 60, ov);
      e.room = room;
      world.enemies.push(e);
    }
    AudioManager.sfx('enemy_spawn');
  }

  _fases() {
    const touch = this.d.Input.touchState().enabled;
    const um = touch && this.d.Input.scheme() === 'una_mano';
    return [
      { titulo: 'MUÉVETE', sub: um || touch ? 'arrastra el pulgar por la pantalla' : 'WASD o flechas', meta: () => this.moveT > 1.6, prog: () => Math.min(1, this.moveT / 1.6) },
      { titulo: 'LÁGRIMAS DE TINTA', sub: um ? 'el fijado dispara solo: acércate a la cera' : touch ? 'stick derecho: apunta y dispara' : 'apunta con el ratón (o WASD) y dispara', on: () => this._spawn('cera_andante', 1, { hp: 6, velocidad: 70 }), meta: () => this.n >= 1, cuenta: () => this.n + '/1' },
      { titulo: 'LA CADENCIA', sub: (um || touch ? 'tap' : 'clic derecho / Espacio') + ' junto al enemigo y REPITE cuando el anillo se cierre — no antes', on: () => { this.n = 0; this._spawn('cera_andante', 1, { hp: 14, velocidad: 55 }); }, meta: () => this.n >= 1 && !this.d.world.enemies.some(e => !e.health.dead), cuenta: () => (this.perfects ?? 0) + ' perfectos' },
      { titulo: 'LA PARADA', sub: 'anillo ROJO = contraataque: ' + (um ? 'tap' : touch ? 'PAR' : 'E') + ' justo al cierre', on: () => { this.n = 0; this._spawn('campanero', 1, { hp: 16, velocidad: 70, counter_chance: 1 }); }, meta: () => this.n >= 1 && !this.d.world.enemies.some(e => !e.health.dead), cuenta: () => this.n + '/1 paradas' },
      { titulo: 'EL RESORTE', sub: (touch ? 'flick (gesto seco)' : 'Shift') + ' para esquivar: hazlo 2 veces', on: () => { this.n = 0; }, meta: () => this.n >= 2, cuenta: () => this.n + '/2' },
      { titulo: 'ARTES DE TINTA', sub: 'el melé llena tu Espíritu; ' + (um ? 'MANTÉN el pulgar' : touch ? 'botón Q' : 'Q') + ' lo gasta en magia', on: () => { this.n = 0; RunState.sp = Math.max(RunState.sp, DataDB.hechizo(RunState.hechizo)?.coste_sp ?? 30); EventBus.emit('sp_changed', RunState.sp); }, meta: () => this.n >= 1, cuenta: () => this.n + '/1' },
      { titulo: 'TODO JUNTO', sub: 'combina: dispara de lejos, Cadencia de cerca, parada al rojo, Arte para limpiar', on: () => { this.n = 0; this._spawn('cera_andante', 2, { hp: 10 }); this._spawn('tejedor_horas', 1, { hp: 10 }); }, meta: () => this.n >= 3 && !this.d.world.enemies.some(e => !e.health.dead), cuenta: () => this.n + '/3 bajas' }
    ];
  }

  update(dt) {
    if (!this.active) return;
    const { Input, world } = this.d;
    const p = world.player;
    this.t += dt;
    const mv = Input.moveVector();
    if (Math.hypot(mv.x, mv.y) > 0.3) this.moveT += dt;
    // dash e Ignición por flanco (no hay evento)
    const dashing = p.dashT > 0;
    if (this.fase === 4 && dashing && !this.dashWas) this.n++;
    this.dashWas = dashing;
    const fases = this._fases();
    const f = fases[this.fase];
    if (!f) { this._finish(); return; }
    if (this.doneT > 0) {
      this.doneT -= dt;
      if (this.doneT <= 0) {
        this.fase++; this.t = 0;
        const nf = fases[this.fase];
        if (nf) { nf.on?.(); AudioManager.sfx('tome'); }
        else this._finish();
      }
      return;
    }
    if (f.meta()) {
      this.doneT = 1.1;
      AudioManager.sfx('clear');
      Input.vibrar?.([12, 30, 12]);
    }
  }

  skip() { this._finish(true); }
  _finish(saltado = false) {
    this.active = false;
    this._offAll();
    GameState.flags.tutorialHecho = true;
    SaveManager.save();
    this.d.flash(saltado ? 'Tutorial saltado' : 'LA CUERDA ESTÁ DADA', 'El descenso de verdad empieza ahora — la Torre te espera');
    // limpiar restos del taller
    for (const e of this.d.world.enemies) if (!e.health.dead) e.die();
  }

  // Parte un texto en líneas que quepan en maxW (con la fuente ACTUAL fijada).
  _wrap(g, text, maxW) {
    const words = String(text).split(' ');
    const lines = []; let cur = '';
    for (const wd of words) {
      const test = cur ? cur + ' ' + wd : wd;
      if (cur && g.measureText(test).width > maxW) { lines.push(cur); cur = wd; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  draw(g, t) {
    if (!this.active) return;
    const { VW, font } = this.d;
    const fases = this._fases();
    const f = fases[this.fase];
    if (!f) return;
    const w = Math.min(380, VW - 24), x = VW / 2 - w / 2, y = 34;
    // El subtítulo se ajusta a varias líneas (antes se salía del cuadro) y la
    // caja crece según el número de líneas.
    font(7);
    const subLines = this._wrap(g, f.sub, w - 16).slice(0, 3);
    const boxH = 30 + subLines.length * 10 + 12;
    g.fillStyle = 'rgba(14,10,28,0.88)'; g.fillRect(x, y, w, boxH);
    g.strokeStyle = this.doneT > 0 ? '#7ec96b' : '#5a4fa0'; g.lineWidth = 1.5;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, boxH - 1);
    font(10); g.textAlign = 'left';
    g.fillStyle = this.doneT > 0 ? '#7ec96b' : '#ffd54f';
    g.fillText((this.doneT > 0 ? '✓ ' : '') + f.titulo, x + 8, y + 15);
    font(7); g.fillStyle = '#b9aee0';
    let sy = y + 26;
    for (const ln of subLines) { g.fillText(ln, x + 8, sy); sy += 10; }
    g.fillStyle = '#6c6193';
    g.fillText('Esc: saltar tutorial', x + 8, sy + 1);
    // progreso
    g.textAlign = 'right'; font(9); g.fillStyle = '#e9e2f5';
    if (f.cuenta) g.fillText(f.cuenta(), x + w - 8, y + 16);
    else if (f.prog) {
      g.fillStyle = '#2a2340'; g.fillRect(x + w - 68, y + 10, 60, 5);
      g.fillStyle = '#7ee8e0'; g.fillRect(x + w - 68, y + 10, 60 * f.prog(), 5);
    }
    // pips de fases (esquina inferior derecha del cuadro)
    for (let i = 0; i < fases.length; i++) {
      g.fillStyle = i < this.fase ? '#ffd54f' : i === this.fase ? '#7ee8e0' : '#3a3358';
      g.fillRect(x + w - 8 - (fases.length - i) * 9, y + boxH - 9, 6, 4);
    }
  }
}
