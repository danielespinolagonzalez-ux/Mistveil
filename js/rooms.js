// Salas y piso — plantillas JSON, puertas, obstáculos, bake visual.
// Spec: docs/sistemas/generacion_procedural.md §2-3 (aquí: piso de 6 salas a mano, Fase 3).
import { DataDB } from './data_db.js';
import { EventBus } from './event_bus.js';
import { AudioManager, GameState, RunState } from './state.js';
import { Enemy } from './entities.js';
import { rollItem } from './items.js';
import { Sprites } from './sprites.js';

export const TILE = 32, RW = 13, RH = 7, WALL = 16;
export const BLOCK_W = RW * TILE + WALL * 2;   // 448
export const BLOCK_H = RH * TILE + WALL * 2;   // 256

// Proyección 2.5D (solo render; la lógica sigue en top-down puro):
// el plano del suelo se achata KY y los muros ganan altura (cara vertical + tapa).
export const VIS = {
  KY: 0.75,        // factor de achatado del plano del suelo
  WALL_H: 42,      // altura de la cara del muro norte
  CAP: 12,         // grosor de la tapa de los muros
  S_FACE: 20,      // cara exterior visible del muro sur
  EXTRA_TOP: 42    // margen del canvas por encima del bloque (cara norte)
};
export const TILE_SY = TILE * VIS.KY; // 24

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) ^ 2246822519;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Bioma del piso (un mundo cada 3): tinta las losas y trae su mecánica propia
export function biomaDe(piso) {
  const bs = DataDB.biomas?.biomas ?? [];
  return bs[Math.min(bs.length - 1, Math.floor((piso - 1) / 3))] ?? null;
}

// Las casillas frente a una puerta deben ser transitables (validador de la spec §5)
export function isDoorFront(tx, ty) {
  return (ty === 0 && tx >= 5 && tx <= 7) ||
         (ty === RH - 1 && tx >= 5 && tx <= 7) ||
         (tx === 0 && ty >= 2 && ty <= 4) ||
         (tx === RW - 1 && ty >= 2 && ty <= 4);
}

function pickTemplate() {
  const list = DataDB.salas_piso1.plantillas;
  const total = list.reduce((s, p) => s + p.peso, 0);
  let r = Math.random() * total;
  for (const p of list) { r -= p.peso; if (r <= 0) return p; }
  return list[0];
}

// Validador anti-encierro: ninguna celda con enemigo/botín/cera puede quedar aislada
// tras un muro de roca (softlock: sala sellada con enemigo inalcanzable). Los pozos y
// la cera NO cuentan como barrera (se dispara por encima / se rompe), solo la roca.
function carveUnreachable(grid, tplName) {
  const H = grid.length, W = grid[0].length;
  const solid = s => s === '#';
  const flood = () => {
    const seen = Array.from({ length: H }, () => Array(W).fill(false));
    const q = [];
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      if (isDoorFront(tx, ty) && !solid(grid[ty][tx])) { seen[ty][tx] = true; q.push([tx, ty]); }
    }
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny][nx] || solid(grid[ny][nx])) continue;
        seen[ny][nx] = true; q.push([nx, ny]);
      }
    }
    return seen;
  };
  for (let guard = 0; guard < 8; guard++) {
    const seen = flood();
    let bad = null;
    outer: for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      if ('Ee$O'.includes(grid[ty][tx]) && !seen[ty][tx]) { bad = [tx, ty]; break outer; }
    }
    if (!bad) return;
    // BFS desde la celda encerrada atravesando roca: abrir brecha por el camino más corto
    const prev = new Map();
    const seen2 = new Set([bad.join(',')]);
    const q = [bad];
    let joint = null;
    while (q.length && !joint) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const k = nx + ',' + ny;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen2.has(k)) continue;
        seen2.add(k); prev.set(k, x + ',' + y);
        if (seen[ny][nx]) { joint = k; break; }
        q.push([nx, ny]);
      }
    }
    if (!joint) return;
    let k = joint;
    while (k) {
      const [x, y] = k.split(',').map(Number);
      if (grid[y][x] === '#') grid[y][x] = '.';
      k = prev.get(k);
    }
    console.warn(`Room: plantilla ${tplName} tenía zona encerrada; brecha abierta`);
  }
}

export class Room {
  constructor(gx, gy, type, piso = 1) {
    this.gx = gx; this.gy = gy; this.type = type; // inicial | camara | galeria | tesoro | jefe | tienda | maldita | normal(test)
    this.piso = piso;
    this.blockX = gx * BLOCK_W; this.blockY = gy * BLOCK_H;
    this.bounds = { x: this.blockX + WALL, y: this.blockY + WALL, w: RW * TILE, h: RH * TILE };
    this.doors = { n: null, s: null, e: null, w: null };
    this.rocks = []; this.pits = []; this.wax = [];
    this.spawnPts = []; this.pickupSpots = [];
    this.visited = false; this.sealed = false; this.looted = false;
    this.cleared = (type === 'inicial' || type === 'tesoro' || type === 'tienda' || type === 'galeria' || type === 'fundicion' || type === 'metronomo' || type === 'apuestas');
    this.spawnTimer = 0; this.pendingSpawns = [];
    this.trapdoor = null;
    this.pendingExit = null;
    this.template = null;
    this.bioma = biomaDe(piso);
    this.pendulos = []; this.tinta = []; this.altars = [];
    // La Sala de Péndulos: las galerías tienen un péndulo que barre el centro
    if (this.bioma?.pendulo && type === 'galeria') {
      this.pendulos.push({ ax: this.bounds.x + this.bounds.w / 2, ay: this.bounds.y + 6, t: Math.random() * 3, roceCd: 0 });
    }

    this._walls = null;
    if (['normal', 'camara', 'galeria', 'maldita'].includes(type)) this._applyTemplate(pickTemplate(), Math.random() < 0.5);
    // El Archivo Anegado: charcos de tinta que frenan (el fuego los seca)
    if (this.bioma?.tinta && ['camara', 'galeria', 'normal'].includes(type)) {
      const tc = this.bioma.tinta;
      const n = tc.charcos_min + Math.floor(Math.random() * (tc.charcos_max - tc.charcos_min + 1));
      const solids = this.groundSolids();
      for (let i = 0; i < n; i++) {
        const tx = 1 + Math.floor(Math.random() * (RW - 2)), ty = 1 + Math.floor(Math.random() * (RH - 2));
        if (isDoorFront(tx, ty)) continue;
        const r = this._tileRect(tx, ty);
        if (solids.some(s => s.x === r.x && s.y === r.y)) continue;
        this.tinta.push(r);
      }
    }
    // Cámaras especiales: altares interactivos (main.js gestiona el toque)
    if (type === 'fundicion') {
      const cx0 = this.bounds.x + this.bounds.w / 2, cy0 = this.bounds.y + this.bounds.h / 2;
      this.altars.push({ kind: 'corazon', x: cx0 - 56, y: cy0, used: false });
      this.altars.push({ kind: 'fusion', x: cx0 + 56, y: cy0, used: false });
    } else if (type === 'metronomo') {
      this.altars.push({ kind: 'metronomo', x: this.bounds.x + this.bounds.w / 2, y: this.bounds.y + this.bounds.h / 2, used: false });
    } else if (type === 'apuestas') {
      this.altars.push({ kind: 'apuesta', x: this.bounds.x + this.bounds.w / 2, y: this.bounds.y + this.bounds.h / 2, used: false });
    }
    // Sala del tesoro: pedestal con una reliquia del pool 'tesoro'.
    // Con Páginas perdidas (extra_choice, R1.5) ofrece DOS y eliges una.
    this.pedestal = null;
    this.pedestal2 = null;
    if (type === 'tesoro') {
      const it = rollItem('tesoro');
      const cx = this.bounds.x + this.bounds.w / 2, cy = this.bounds.y + this.bounds.h / 2 - 4;
      this.pedestal = it ? { x: cx, y: cy, itemId: it.id, taken: false } : null;
      if (it && RunState.items.includes('paginas_perdidas')) {
        const it2 = rollItem('tesoro');
        if (it2 && it2.id !== it.id) {
          this.pedestal.x = cx - 44;
          this.pedestal2 = { x: cx + 44, y: cy, itemId: it2.id, taken: false };
        }
      }
    }
    // Tienda: 3 productos con precio (4 con la Estantería de Margo)
    this.stock = null;
    if (type === 'tienda') {
      const scx = this.bounds.x + this.bounds.w / 2, scy = this.bounds.y + this.bounds.h / 2;
      const it = rollItem('tienda');
      const precio = { comun: 15, raro: 25, legendario: 40 };
      this.stock = [
        it ? { kind: 'item', id: it.id, price: precio[it.rareza] ?? 20, x: scx - 70, y: scy, taken: false } : null,
        { kind: 'heart', price: 6, x: scx, y: scy, taken: false },
        { kind: 'tomo', price: 20, x: scx + 70, y: scy, taken: false }
      ].filter(Boolean);
      if (GameState.tiene('estanteria_de_margo')) {
        const it2 = rollItem('tienda');
        if (it2) this.stock.push({ kind: 'item', id: it2.id, price: precio[it2.rareza] ?? 20, x: scx, y: scy - 46, taken: false });
      }
    }
    this.canvas = this._bake();
  }

  _tileRect(tx, ty) {
    return { x: this.bounds.x + tx * TILE, y: this.bounds.y + ty * TILE, w: TILE, h: TILE };
  }

  _applyTemplate(tpl, mirror) {
    this.template = tpl.id + (mirror ? ' (espejo)' : '');
    // 1. Grid de símbolos (espejo + regla de puertas: nunca bloquear una puerta)
    const grid = tpl.layout.map((row, ty) => {
      const cells = mirror ? [...row].reverse() : [...row];
      return cells.map((ch, tx) => ('#PO'.includes(ch) && isDoorFront(tx, ty)) ? '.' : ch);
    });
    // 2. Garantía anti-encierro
    carveUnreachable(grid, this.template);
    // 3. Materializar rects
    grid.forEach((row, ty) => row.forEach((sym, tx) => {
      const rect = this._tileRect(tx, ty);
      const cx = rect.x + TILE / 2, cy = rect.y + TILE / 2;
      if (sym === '#') this.rocks.push(rect);
      else if (sym === 'P') this.pits.push(rect);
      else if (sym === 'O') this.wax.push({ ...rect, hp: DataDB.balance.salas.wax_hp });
      else if (sym === 'E') this.spawnPts.push({ x: cx, y: cy, req: true });
      else if (sym === 'e') this.spawnPts.push({ x: cx, y: cy, req: false });
      else if (sym === '$') this.pickupSpots.push({ x: cx, y: cy });
    }));
  }

  // Muros sólidos con hueco en las puertas (geometría estática, cacheada)
  wallSolids() {
    if (this._walls) return this._walls;
    const dw = (DataDB.balance.salas.door_width_px ?? 48) / 2 + 4;
    const b = this.bounds;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const W = [];
    const addH = (y, hasDoor) => {
      if (hasDoor) {
        W.push({ x: this.blockX, y, w: cx - dw - this.blockX, h: WALL });
        W.push({ x: cx + dw, y, w: this.blockX + BLOCK_W - (cx + dw), h: WALL });
      } else W.push({ x: this.blockX, y, w: BLOCK_W, h: WALL });
    };
    const addV = (x, hasDoor) => {
      if (hasDoor) {
        W.push({ x, y: this.blockY, w: WALL, h: cy - dw - this.blockY });
        W.push({ x, y: cy + dw, w: WALL, h: this.blockY + BLOCK_H - (cy + dw) });
      } else W.push({ x, y: this.blockY, w: WALL, h: BLOCK_H });
    };
    addH(this.blockY, !!this.doors.n);
    addH(b.y + b.h, !!this.doors.s);
    addV(this.blockX, !!this.doors.w);
    addV(b.x + b.w, !!this.doors.e);
    this._walls = W;
    return W;
  }
  // Rejas: bloquean el hueco de puerta mientras la sala está sellada
  gateSolids() {
    const dw = (DataDB.balance.salas.door_width_px ?? 48) / 2 + 4;
    const b = this.bounds, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const G = [];
    if (this.doors.n && !this.doors.n.open) G.push({ x: cx - dw, y: this.blockY, w: dw * 2, h: WALL });
    if (this.doors.s && !this.doors.s.open) G.push({ x: cx - dw, y: b.y + b.h, w: dw * 2, h: WALL });
    if (this.doors.w && !this.doors.w.open) G.push({ x: this.blockX, y: cy - dw, w: WALL, h: dw * 2 });
    if (this.doors.e && !this.doors.e.open) G.push({ x: b.x + b.w, y: cy - dw, w: WALL, h: dw * 2 });
    return G;
  }

  // Sólidos según quién pregunta
  groundSolids() { return [...this.rocks, ...this.pits, ...this.wax]; }
  playerSolids() { return this.groundSolids(); }
  tearSolids() { return [...this.rocks, ...this.wax]; } // los pozos no paran proyectiles

  doorCenter(side) {
    const b = this.bounds;
    if (side === 'n') return { x: b.x + b.w / 2, y: b.y };
    if (side === 's') return { x: b.x + b.w / 2, y: b.y + b.h };
    if (side === 'w') return { x: b.x, y: b.y + b.h / 2 };
    return { x: b.x + b.w, y: b.y + b.h / 2 };
  }

  clampPlayer(p) {
    const b = this.bounds;
    const dw = (DataDB.balance.salas.door_width_px ?? 48) / 2;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const EXT = WALL * 2 + 4;
    this.pendingExit = null;

    const inX = Math.abs(p.x - cx) < dw - 4;
    const inY = Math.abs(p.y - cy) < dw - 4;

    let minY = b.y + p.r, maxY = b.y + b.h - p.r;
    if (this.doors.n?.open && inX) minY = b.y - EXT;
    if (this.doors.s?.open && inX) maxY = b.y + b.h + EXT;
    p.y = Math.min(Math.max(p.y, minY), maxY);

    let minX = b.x + p.r, maxX = b.x + b.w - p.r;
    if (this.doors.w?.open && inY) minX = b.x - EXT;
    if (this.doors.e?.open && inY) maxX = b.x + b.w + EXT;
    p.x = Math.min(Math.max(p.x, minX), maxX);

    // Dentro de un pasaje: ceñirse al hueco y detectar el cruce
    if (p.y < b.y + p.r - 1) {
      p.x = Math.min(Math.max(p.x, cx - dw + p.r), cx + dw - p.r);
      if (p.y < b.y - WALL) this.pendingExit = 'n';
    } else if (p.y > b.y + b.h - p.r + 1) {
      p.x = Math.min(Math.max(p.x, cx - dw + p.r), cx + dw - p.r);
      if (p.y > b.y + b.h + WALL) this.pendingExit = 's';
    } else if (p.x < b.x + p.r - 1) {
      p.y = Math.min(Math.max(p.y, cy - dw + p.r), cy + dw - p.r);
      if (p.x < b.x - WALL) this.pendingExit = 'w';
    } else if (p.x > b.x + b.w - p.r + 1) {
      p.y = Math.min(Math.max(p.y, cy - dw + p.r), cy + dw - p.r);
      if (p.x > b.x + b.w + WALL) this.pendingExit = 'e';
    }
  }

  // Entrar en la sala: sellar y preparar spawns si toca
  enter(world) {
    const first = !this.visited;
    this.visited = true;
    if (this.type === 'jefe' && !this.cleared) {
      const c = { x: this.bounds.x + this.bounds.w / 2, y: this.bounds.y + this.bounds.h * 0.35 };
      const hpMult = 1 + (this.piso - 1) * DataDB.balance.run.escalado_hp_por_piso;
      // Jefe del bioma (Campanero Mayor / Archivera Anegada / El Primer Relojero)
      const jb = DataDB.biomas?.jefes_bioma?.[this.bioma?.id] ?? { base: 'campanero', nombre: 'Campanero Mayor', hp: 90, velocidad: 95, counter_chance: 0.5, r: 18 };
      const { base, ...ov } = jb;
      this.pendingSpawns = [{
        id: base, x: c.x, y: c.y,
        overrides: {
          ...ov, hp: Math.round(jb.hp * hpMult), coste_dificultad: 0, jefe: true,
          danoMult: 1 + (this.piso - 1) * (DataDB.balance.run.escalado_dano_por_piso ?? 0)
        }
      }];
      this._seal(world);
    } else if (!this.cleared && this.spawnPts.length) {
      this.pendingSpawns = this._rollSpawns();
      if (this.pendingSpawns.length) this._seal(world);
      else this.cleared = true;
    }
    return first;
  }

  _seal(world) {
    this.sealed = true;
    for (const d of Object.values(this.doors)) if (d) d.open = false;
    this.spawnTimer = DataDB.balance.salas.spawn_telegraph_s;
    AudioManager.sfx('door_seal');
    EventBus.emit('room_sealed', this);
  }

  _rollSpawns() {
    const R = DataDB.balance.run;
    const pool = (DataDB.enemigos.pools_spawn['bioma_' + (this.bioma?.id ?? '')] ?? DataDB.enemigos.pools_spawn['piso1'])
      .map(id => DataDB.enemigo(id))
      .filter(Boolean);
    // Maldita: presupuesto doble. Escalado por piso según spec §4 (incremento tunable).
    let budget = R.dificultad_sala_base * (this.type === 'maldita' ? 2 : 1) + (this.piso - 1) * (R.dificultad_por_piso ?? 2);
    const hpMult = 1 + (this.piso - 1) * R.escalado_hp_por_piso;
    const danoMult = 1 + (this.piso - 1) * (R.escalado_dano_por_piso ?? 0);
    const inv = this.bioma?.invertida; // Relojería Invertida: telegrafía doble, zarpazo feroz
    const out = [];
    const pts = [...this.spawnPts].sort(() => Math.random() - 0.5);
    let pairSeq = 0;
    for (const pt of pts) {
      if (!pt.req && Math.random() < (this.type === 'maldita' ? 0.2 : 0.5)) continue;
      if (budget <= 0 && out.length) break;
      const affordable = pool.filter(d => d.coste_dificultad <= Math.max(budget, 1));
      const def = affordable.length ? pick(affordable) : pick(pool);
      const ov = { hp: Math.round(def.hp * hpMult), danoMult };
      if (inv) { ov.windup_mult = inv.windup_mult; ov.strike_mult = inv.strike_mult; }
      if (def.gemelo) {
        // Los minuteros llegan SIEMPRE en pareja vinculada
        const key = 'par' + (pairSeq++);
        out.push({ id: def.id, x: pt.x - 14, y: pt.y, overrides: ov, pairKey: key });
        out.push({ id: def.id, x: pt.x + 14, y: pt.y, overrides: { ...ov }, pairKey: key });
      } else {
        out.push({ id: def.id, x: pt.x, y: pt.y, overrides: ov });
      }
      budget -= def.coste_dificultad;
    }
    return out;
  }

  update(dt, world) {
    if (this.spawnTimer > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.pendingSpawns.length) {
        const born = [];
        for (const s of this.pendingSpawns) {
          const e = new Enemy(s.id, s.x, s.y, s.overrides);
          e.room = this;
          e._pairKey = s.pairKey;
          world.enemies.push(e);
          born.push(e);
          EventBus.emit('enemy_spawned', s.x, s.y);
        }
        // Vincular gemelos por pareja
        for (const e of born) {
          if (!e._pairKey || e.twin) continue;
          const other = born.find(o => o !== e && o._pairKey === e._pairKey && !o.twin);
          if (other) { e.twin = other; other.twin = e; }
        }
        this.pendingSpawns = [];
      }
    }
    if (this.sealed && this.spawnTimer <= 0 && !this.pendingSpawns.length &&
        world.enemies.filter(e => e.room === this).every(e => e.health.dead)) {
      this.sealed = false;
      this.cleared = true;
      for (const d of Object.values(this.doors)) if (d) d.open = true;
      AudioManager.sfx('door_open');
      EventBus.emit('room_cleared', this);
    }
  }

  breakWax(w) {
    this.wax = this.wax.filter(x => x !== w);
    AudioManager.sfx('wax_break');
    EventBus.emit('wax_broken', w);
  }

  // ---------- Bake visual de la sala (en espacio de pantalla 2.5D) ----------
  _bake() {
    const { KY, WALL_H, CAP, S_FACE, EXTRA_TOP } = VIS;
    const c = document.createElement('canvas');
    c.width = BLOCK_W;
    c.height = EXTRA_TOP + CAP + RH * TILE_SY + CAP + S_FACE; // 254
    const g = c.getContext('2d');
    const seed = this.gx * 31 + this.gy * 57;
    const yof = (wy) => EXTRA_TOP + (wy - this.blockY) * KY; // mundo→canvas
    const floorTop = yof(this.bounds.y);            // 54
    const floorBot = yof(this.bounds.y + this.bounds.h); // 222

    // --- Muro norte: cara vertical de piedra + tapa ---
    const faceTop = floorTop - WALL_H;
    g.fillStyle = '#4c4070';
    g.fillRect(0, faceTop - CAP, BLOCK_W, CAP); // tapa
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, faceTop - CAP, BLOCK_W, 2);
    // Cara del muro: textura pintada del bioma si existe; si no, el gradiente
    // procedural con hiladas de siempre (fallback obligatorio).
    const texM = Sprites.get('muro_' + (this.bioma?.id ?? ''));
    if (texM) {
      const sM = WALL_H / texM.height; // la banda ocupa la altura exacta de la cara
      const patM = g.createPattern(texM, 'repeat');
      patM.setTransform?.(new DOMMatrix([sM, 0, 0, sM, 0, faceTop]));
      g.fillStyle = patM;
      g.fillRect(0, faceTop, BLOCK_W, WALL_H);
      // Veladura: asienta la piedra clara en la penumbra y oscurece hacia el suelo
      const vel = g.createLinearGradient(0, faceTop, 0, floorTop);
      vel.addColorStop(0, 'rgba(24,17,44,0.35)');
      vel.addColorStop(1, 'rgba(12,8,24,0.6)');
      g.fillStyle = vel;
      g.fillRect(0, faceTop, BLOCK_W, WALL_H);
    } else {
      const grad = g.createLinearGradient(0, faceTop, 0, floorTop);
      grad.addColorStop(0, '#413761');
      grad.addColorStop(0.7, '#332a4f');
      grad.addColorStop(1, '#241f3a');
      g.fillStyle = grad;
      g.fillRect(0, faceTop, BLOCK_W, WALL_H);
      // Hiladas de ladrillo en la cara
      g.strokeStyle = 'rgba(12,9,24,0.55)'; g.lineWidth = 1;
      for (let row = 0; row < 4; row++) {
        const yy = faceTop + 6 + row * 10;
        g.beginPath(); g.moveTo(0, yy); g.lineTo(BLOCK_W, yy); g.stroke();
        for (let x = (row % 2) * 12; x < BLOCK_W; x += 24) {
          g.beginPath(); g.moveTo(x, yy); g.lineTo(x, Math.min(yy + 10, floorTop)); g.stroke();
          if (hash(x + seed, row) > 0.8) {
            g.fillStyle = 'rgba(255,255,255,0.05)';
            g.fillRect(x + 1, yy + 1, 10, 4);
          }
        }
      }
    }
    // Vitral gotico tenue en la cara norte (solo salas especiales)
    if (this.type === 'tesoro' || this.type === 'jefe' || this.type === 'maldita') {
      const wx = BLOCK_W / 2;
      const col = this.type === 'jefe' ? '255,120,90' : this.type === 'maldita' ? '170,90,255' : '232,197,101';
      g.fillStyle = `rgba(${col},0.12)`;
      g.beginPath();
      g.moveTo(wx - 12, floorTop - 4);
      g.lineTo(wx - 12, faceTop + 12);
      g.quadraticCurveTo(wx, faceTop + 2, wx + 12, faceTop + 12);
      g.lineTo(wx + 12, floorTop - 4);
      g.closePath(); g.fill();
      g.strokeStyle = `rgba(${col},0.25)`;
      g.stroke();
    }

    // --- Suelo: textura pintada del bioma (achatada en Y por la 2.5D) o las
    // losas procedurales de siempre (fallback) ---
    const texF = Sprites.get('suelo_' + (this.bioma?.id ?? ''));
    if (texF) {
      // Escala UNIFORME (sin estirar el ladrillo) — la referencia de Daniel usa
      // ladrillo pequeño visto casi plano; el achatado 2.5D apenas se nota aquí.
      const rep = 96; // px de mundo por repetición horizontal del patrón
      const s = rep / texF.width;
      const patF = g.createPattern(texF, 'repeat');
      patF.setTransform?.(new DOMMatrix([s, 0, 0, s, WALL, floorTop]));
      g.fillStyle = patF;
      g.fillRect(WALL, floorTop, RW * TILE, RH * TILE_SY);
      // Veladura violeta-oscura (penumbra de la referencia) + código de color
      // del tipo de sala, que antes iba en el tinte de las losas
      g.fillStyle = 'rgba(18,12,40,0.42)';
      g.fillRect(WALL, floorTop, RW * TILE, RH * TILE_SY);
      const velTipo = {
        jefe: 'rgba(255,90,60,0.08)', tesoro: 'rgba(232,197,101,0.09)',
        tienda: 'rgba(150,220,140,0.06)', maldita: 'rgba(170,90,255,0.09)',
        galeria: 'rgba(120,140,255,0.06)'
      }[this.type];
      if (velTipo) { g.fillStyle = velTipo; g.fillRect(WALL, floorTop, RW * TILE, RH * TILE_SY); }
    } else {
    for (let ty = 0; ty < RH; ty++) {
      for (let tx = 0; tx < RW; tx++) {
        const x = WALL + tx * TILE, y = floorTop + ty * TILE_SY;
        const v = hash(tx + seed, ty + seed * 3);
        const tint = this.type === 'jefe' ? [8, -4, -2]
          : this.type === 'tesoro' ? [6, 5, -6]
          : this.type === 'tienda' ? [8, 4, -2]
          : this.type === 'maldita' ? [2, -8, 4]
          : this.type === 'galeria' ? [-3, -3, 3] : [0, 0, 0];
        const base = (tx + ty) % 2 ? 38 : 43; // suelo más claro (legibilidad)
        const bt = this.bioma?.tint ?? [0, 0, 0];
        const l = base + Math.floor(v * 7);
        g.fillStyle = `rgb(${l - 4 + tint[0] + bt[0]},${l - 7 + tint[1] + bt[1]},${l + 14 + tint[2] + bt[2]})`;
        g.fillRect(x, y, TILE, TILE_SY);
        g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(x, y, TILE, 1.5);
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, y + TILE_SY - 1.5, TILE, 1.5);
        g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(x + TILE - 1.5, y, 1.5, TILE_SY);
        if (v > 0.84) {
          g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x + 6 + v * 8, y + 3);
          g.lineTo(x + 12 + v * 6, y + 10 + v * 5);
          g.lineTo(x + 8 + v * 10, y + 20);
          g.stroke();
        }
      }
    }
    }
    // Sombra de contacto del muro norte sobre el suelo
    const ao = g.createLinearGradient(0, floorTop, 0, floorTop + 14);
    ao.addColorStop(0, 'rgba(0,0,0,0.4)');
    ao.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = ao;
    g.fillRect(WALL, floorTop, RW * TILE, 14);
    // AO lateral e inferior (asienta los muros este/oeste/sur)
    const aoL = g.createLinearGradient(WALL, 0, WALL + 10, 0);
    aoL.addColorStop(0, 'rgba(0,0,0,0.3)'); aoL.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = aoL; g.fillRect(WALL, floorTop, 10, RH * TILE_SY);
    const aoR = g.createLinearGradient(WALL + RW * TILE, 0, WALL + RW * TILE - 10, 0);
    aoR.addColorStop(0, 'rgba(0,0,0,0.3)'); aoR.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = aoR; g.fillRect(WALL + RW * TILE - 10, floorTop, 10, RH * TILE_SY);
    const aoB = g.createLinearGradient(0, floorTop + RH * TILE_SY, 0, floorTop + RH * TILE_SY - 9);
    aoB.addColorStop(0, 'rgba(0,0,0,0.26)'); aoB.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = aoB; g.fillRect(WALL, floorTop + RH * TILE_SY - 9, RW * TILE, 9);
    // Haces de luz de las velas: columna cálida + charco en el suelo (horneado, coste 0)
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const cd of this.candles()) {
      const cx = cd.x - this.blockX;
      const beam = g.createLinearGradient(0, floorTop - 26, 0, floorTop + 56);
      beam.addColorStop(0, 'rgba(255,190,110,0.11)');
      beam.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(cx - 5, floorTop - 26);
      g.lineTo(cx + 5, floorTop - 26);
      g.lineTo(cx + 25, floorTop + 56);
      g.lineTo(cx - 25, floorTop + 56);
      g.closePath(); g.fill();
      const pool = g.createRadialGradient(cx, floorTop + 32, 0, cx, floorTop + 32, 33);
      pool.addColorStop(0, 'rgba(255,190,110,0.09)');
      pool.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = pool;
      g.beginPath(); g.ellipse(cx, floorTop + 32, 33, 19, 0, 0, 7); g.fill();
    }
    g.restore();

    // Grabado del reloj (inicial y jefe) — elipse por la perspectiva
    if (this.type === 'inicial' || this.type === 'jefe') {
      const ccx = BLOCK_W / 2, ccy = (floorTop + floorBot) / 2;
      g.strokeStyle = this.type === 'jefe' ? 'rgba(255,120,90,0.12)' : 'rgba(190,170,255,0.10)';
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(ccx, ccy, 74, 74 * KY, 0, 0, 7); g.stroke();
      g.lineWidth = 1;
      g.beginPath(); g.ellipse(ccx, ccy, 64, 64 * KY, 0, 0, 7); g.stroke();
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        g.beginPath();
        g.moveTo(ccx + Math.cos(a) * 58, ccy + Math.sin(a) * 58 * KY);
        g.lineTo(ccx + Math.cos(a) * 64, ccy + Math.sin(a) * 64 * KY);
        g.stroke();
      }
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(ccx, ccy); g.lineTo(ccx + 22, ccy - 34 * KY); g.stroke();
      g.beginPath(); g.moveTo(ccx, ccy); g.lineTo(ccx - 30, ccy - 6 * KY); g.stroke();
    }
    if (this.type === 'tesoro') {
      const ccx = BLOCK_W / 2, ccy = (floorTop + floorBot) / 2;
      g.fillStyle = 'rgba(150,110,50,0.18)';
      g.fillRect(ccx - 40, ccy - 22, 80, 44);
      g.strokeStyle = 'rgba(232,197,101,0.35)'; g.lineWidth = 2;
      g.strokeRect(ccx - 40, ccy - 22, 80, 44);
    }

    // --- Pozos: agujeros con profundidad ---
    for (const p of this.pits) {
      const x = p.x - this.blockX;
      const y = floorTop + (p.y - this.bounds.y) * KY;
      const h = TILE_SY;
      g.fillStyle = '#060410';
      g.fillRect(x + 1, y + 1, TILE - 2, h - 2);
      const pg = g.createLinearGradient(0, y, 0, y + h);
      pg.addColorStop(0, 'rgba(0,0,0,0.75)');
      pg.addColorStop(1, 'rgba(60,50,110,0.15)');
      g.fillStyle = pg;
      g.fillRect(x + 1, y + 1, TILE - 2, h - 2);
      g.fillStyle = 'rgba(150,130,220,0.18)';
      g.fillRect(x + 1, y + h - 3, TILE - 2, 2); // borde inferior iluminado
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(x + 1, y, TILE - 2, 3);
    }

    // --- Muros laterales (tapas) ---
    for (const sx of [0, BLOCK_W - WALL]) {
      g.fillStyle = '#453a68';
      g.fillRect(sx, faceTop - CAP, WALL, floorBot - faceTop + CAP + CAP);
      g.strokeStyle = 'rgba(12,9,24,0.5)';
      for (let y = faceTop; y < floorBot + CAP; y += 14) {
        g.strokeRect(sx + 0.5, y + 0.5, WALL - 1, 14);
      }
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(sx === 0 ? WALL - 2 : sx, faceTop - CAP, 2, floorBot - faceTop + CAP + CAP);
    }

    // --- Muro sur: tapa + cara exterior que cae a la oscuridad ---
    g.fillStyle = '#4c4070';
    g.fillRect(0, floorBot, BLOCK_W, CAP);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(0, floorBot, BLOCK_W, 2);
    const sg = g.createLinearGradient(0, floorBot + CAP, 0, floorBot + CAP + S_FACE);
    sg.addColorStop(0, '#2c2545');
    sg.addColorStop(1, 'rgba(20,15,38,0)');
    g.fillStyle = sg;
    g.fillRect(0, floorBot + CAP, BLOCK_W, S_FACE);

    // --- Pilares de esquina (prismas más altos que el muro) ---
    for (const [pxx, top] of [[0, true], [BLOCK_W - 22, true], [0, false], [BLOCK_W - 22, false]]) {
      const py = top ? faceTop - CAP - 6 : floorBot - 6;
      const ph = top ? WALL_H + CAP + 8 : CAP + 10;
      g.fillStyle = '#544878';
      g.fillRect(pxx, py, 22, 6);           // tapa
      g.fillStyle = '#3d3358';
      g.fillRect(pxx, py + 6, 22, ph);      // cara
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(pxx, py + 6, 22, 2);
      g.strokeStyle = '#1a1530';
      g.strokeRect(pxx + 0.5, py + 0.5, 21, ph + 5.5);
    }
    return c;
  }

  // Velas montadas en la cara del muro norte (x en mundo; el alzado lo pone el render)
  candles() {
    return [
      { x: this.blockX + BLOCK_W * 0.3 },
      { x: this.blockX + BLOCK_W * 0.7 }
    ];
  }
}

// ---------- Generación procedural del piso (spec §1) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const DIRS = [[0, -1], [0, 1], [1, 0], [-1, 0]];

// (El generador de rejilla tipo Isaac que vivía aquí se retiró en la fase R0.5:
// la Torre vertical de buildTower es el modo canónico. Historia en git.)

// ---------- La Torre: piso vertical continuo (sustituye al layout Isaac) ----------
// Segmentos apilados en una columna: cámaras (se sellan al entrar) y galerías
// (vagabundos sueltos, sin sellos). Tesoro/tienda/maldita como alcobas laterales.
export function buildTower(piso = 1, seed = Date.now()) {
  const rnd = mulberry32((seed ^ (piso * 104729)) >>> 0);
  const hpMult = (1 + (piso - 1) * DataDB.balance.run.escalado_hp_por_piso)
    * (GameState.cuerdaTensa ? 1.25 : 1); // modo Cuerda Tensa (Santuario)
  const nSeg = Math.min(9, 5 + piso + Math.floor(rnd() * 2));

  // 1. Tipos de segmento (decididos antes de crear las salas)
  const types = [];
  for (let i = 0; i < nSeg; i++) {
    if (i === 0) types.push('inicial');
    else if (i === nSeg - 1) types.push('jefe');
    else types.push(rnd() < 0.45 ? 'galeria' : 'camara');
  }
  // Garantías: al menos 2 cámaras y 1 galería en el tramo medio
  const mid = types.slice(1, -1);
  if (mid.filter(t => t === 'camara').length < 2) { types[1] = 'camara'; types[nSeg - 2] = 'camara'; }
  if (!types.slice(1, -1).includes('galeria') && nSeg > 4) types[2] = 'galeria';

  const COL = 1;
  const rooms = new Map();
  const segs = [];
  for (let i = 0; i < nSeg; i++) {
    const r = new Room(COL, i, types[i], piso);
    rooms.set(COL + ',' + i, r);
    segs.push(r);
  }
  // 2. Cadena vertical
  for (let i = 0; i < nSeg - 1; i++) {
    const d = { open: true };
    segs[i].doors.s = d;
    segs[i + 1].doors.n = d;
  }
  // 3. Alcobas laterales: tesoro y tienda garantizadas, maldita 60% (100% con la Llave del sótano)
  const alcoveTypes = ['tesoro', 'tienda'];
  if (GameState.tiene('llave_del_sotano') || rnd() < 0.6) alcoveTypes.push('maldita');
  // Cámara especial del gremio: fundición / metrónomo / apuestas (60%)
  if (rnd() < 0.6) alcoveTypes.push(pick(['fundicion', 'metronomo', 'apuestas']));
  const midIdx = [];
  for (let i = 1; i < nSeg - 1; i++) midIdx.push(i);
  for (const at of alcoveTypes) {
    if (!midIdx.length) break;
    const idx = midIdx.splice(Math.floor(rnd() * midIdx.length), 1)[0];
    const side = rnd() < 0.5 ? -1 : 1;
    const gx = COL + side;
    const alc = new Room(gx, idx, at, piso);
    rooms.set(gx + ',' + idx, alc);
    const d = { open: true };
    if (side === 1) { segs[idx].doors.e = d; alc.doors.w = d; }
    else { segs[idx].doors.w = d; alc.doors.e = d; }
  }
  // 4. Vagabundos de las galerías (sueltos desde el principio, sin sello)
  const bio = biomaDe(piso);
  const pool = (DataDB.enemigos.pools_spawn['bioma_' + (bio?.id ?? '')] ?? DataDB.enemigos.pools_spawn['piso1']).map(id => DataDB.enemigo(id)).filter(Boolean).filter(d => !d.gemelo && d.comportamiento !== 'reviver');
  const roamers = [];
  for (const r of segs) {
    if (r.type !== 'galeria') continue;
    const n = 2 + Math.floor(rnd() * 2);
    const solids = r.groundSolids();
    for (let i = 0; i < n; i++) {
      const def = pool[Math.floor(rnd() * pool.length)];
      let x, y, tries = 12;
      do {
        x = r.bounds.x + 20 + rnd() * (r.bounds.w - 40);
        y = r.bounds.y + 20 + rnd() * (r.bounds.h - 40);
      } while (tries-- > 0 && solids.some(s => x > s.x - 12 && x < s.x + s.w + 12 && y > s.y - 12 && y < s.y + s.h + 12));
      const e = new Enemy(def.id, x, y, { hp: Math.round(def.hp * hpMult) });
      e.room = r;
      roamers.push(e);
    }
  }
  // 5. BBox de la torre (para cámara libre y proyectiles)
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const r of rooms.values()) {
    minX = Math.min(minX, r.blockX); minY = Math.min(minY, r.blockY);
    maxX = Math.max(maxX, r.blockX + BLOCK_W); maxY = Math.max(maxY, r.blockY + BLOCK_H);
  }
  return {
    rooms, piso, roamers,
    current: segs[0],
    bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    at(gx, gy) { return rooms.get(gx + ',' + gy) ?? null; },
    neighbor(room, dir) {
      const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[dir];
      return this.at(room.gx + d[0], room.gy + d[1]);
    }
  };
}

// ---------- Piso de prueba: 6 salas conectadas a mano ----------
//        (1,0)Tesoro  (2,0)Normal
// (0,1)Inicial (1,1)Normal (2,1)Normal (3,1)Jefe
export function buildTestFloor() {
  const defs = [
    [0, 1, 'inicial'], [1, 1, 'normal'], [1, 0, 'tesoro'],
    [2, 0, 'normal'], [2, 1, 'normal'], [3, 1, 'jefe']
  ];
  const rooms = new Map();
  for (const [gx, gy, type] of defs) rooms.set(gx + ',' + gy, new Room(gx, gy, type));

  const connect = (a, b) => {
    const ra = rooms.get(a), rb = rooms.get(b);
    const door = { open: true };
    if (rb.gx === ra.gx + 1) { ra.doors.e = door; rb.doors.w = door; }
    else if (rb.gx === ra.gx - 1) { ra.doors.w = door; rb.doors.e = door; }
    else if (rb.gy === ra.gy + 1) { ra.doors.s = door; rb.doors.n = door; }
    else { ra.doors.n = door; rb.doors.s = door; }
  };
  connect('0,1', '1,1');
  connect('1,1', '1,0');
  connect('1,0', '2,0');
  connect('2,0', '2,1');
  connect('1,1', '2,1');
  connect('2,1', '3,1');

  return {
    rooms,
    current: rooms.get('0,1'),
    at(gx, gy) { return rooms.get(gx + ',' + gy) ?? null; },
    neighbor(room, dir) {
      const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[dir];
      return this.at(room.gx + d[0], room.gy + d[1]);
    }
  };
}
