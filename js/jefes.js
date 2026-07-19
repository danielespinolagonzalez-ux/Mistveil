// El Redoble de los Jefes — director de mecánicas estilo raid (inspirado en FFXIV):
// el jefe se ANCLA y lanza telegrafías que esquivas con tiempo y colocación
// (círculos, donut de "acércate", conos-cleave, barrido de manecilla, zona segura,
// invocaciones). La LÓGICA (temporizadores, resolución, daño, fases) vive aquí; el
// DIBUJO lo hace main.js leyendo director.zonas — igual que péndulos/tinta/truenos.
// Data en data/jefes.json (jefes por bioma + biblioteca de mecánicas).
import { EventBus } from './event_bus.js';
import { DataDB } from './data_db.js';
import { AudioManager } from './state.js';

const TAU = Math.PI * 2;
function normAng(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
// Distancia de un punto (px,py) al segmento a→b (para el rayo encadenado)
function distSeg(px, py, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, wx = px - a.x, wy = py - a.y;
  const L = vx * vx + vy * vy; let t = L ? (wx * vx + wy * vy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * vx), py - (a.y + t * vy));
}

export function crearDirectorJefe(boss, room) {
  const cfg = DataDB.jefes?.jefes?.[room?.bioma?.id];
  if (!cfg) return null;
  const MEC = DataDB.jefes.mecanicas ?? {};
  const bounds = room.bounds;
  const dir = { boss, room, cfg, nombre: cfg.nombre, fase: 0, castT: cfg.respiro_s ?? 1.4, zonas: [], _cola: [] };

  const faseActual = () => cfg.fases[dir.fase];

  function comprobarFase() {
    const frac = boss.health.hp / boss.health.max;
    for (let i = cfg.fases.length - 1; i > dir.fase; i--) {
      if (frac <= cfg.fases[i].hp) {
        dir.fase = i; dir._cola = []; dir.castT = Math.max(dir.castT, 0.9);
        EventBus.emit('jefe_fase', dir.fase + 1, cfg.nombre);
        break;
      }
    }
  }

  function siguienteMecanica() {
    if (!dir._cola.length) {
      dir._cola = [...faseActual().mecanicas];
      for (let i = dir._cola.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [dir._cola[i], dir._cola[j]] = [dir._cola[j], dir._cola[i]]; }
    }
    return dir._cola.shift();
  }

  function lanzar(nombre, player) {
    const m = MEC[nombre]; if (!m) return;
    const cx = boss.x, cy = boss.y;
    const b = { tipo: m.tipo, t: m.telegraph_s ?? 1.4, telegraph_s: m.telegraph_s ?? 1.4, fase: 'aviso', dano: m.dano ?? 1, color: m.color ?? '#e05a4f' };
    if (m.tipo === 'circulos') {
      const n = m.n ?? 4;
      for (let i = 0; i < n; i++) {
        const sobreJugador = i === 0 && (m.sobre_jugador ?? true);
        const x = sobreJugador ? player.x : bounds.x + 24 + Math.random() * (bounds.w - 48);
        const y = sobreJugador ? player.y : bounds.y + 24 + Math.random() * (bounds.h - 48);
        dir.zonas.push({ ...b, x, y, r: m.r ?? 42 });
      }
    } else if (m.tipo === 'donut') {
      dir.zonas.push({ ...b, x: cx, y: cy, r_int: m.r_int ?? 48, r_ext: m.r_ext ?? 300 });
    } else if (m.tipo === 'cono') {
      const n = m.n ?? 1, a0 = Math.atan2(player.y - cy, player.x - cx);
      for (let i = 0; i < n; i++) dir.zonas.push({ ...b, x: cx, y: cy, ang: a0 + (i - (n - 1) / 2) * (m.sep ?? 1.1), arco: m.arco ?? 0.9, largo: m.largo ?? 240 });
    } else if (m.tipo === 'linea') {
      dir.zonas.push({ ...b, x: cx, y: cy, ang: Math.atan2(player.y - cy, player.x - cx), ancho: m.ancho ?? 30, largo: m.largo ?? 320 });
    } else if (m.tipo === 'barrido') {
      const vel = (m.vel ?? 1.5) * (Math.random() < 0.5 ? 1 : -1);
      const a0 = Math.atan2(player.y - cy, player.x - cx) - Math.sign(vel) * (m.vueltas ?? 1) * Math.PI;
      dir.zonas.push({ ...b, x: cx, y: cy, ang: a0, ancho: m.ancho ?? 0.16, largo: m.largo ?? 270, vel, activa_s: m.activa_s ?? ((m.vueltas ?? 1) * TAU / Math.abs(vel)) });
    } else if (m.tipo === 'safe') {
      const a = Math.random() * TAU, d = m.dist ?? 92;
      const x = Math.min(Math.max(cx + Math.cos(a) * d, bounds.x + 20), bounds.x + bounds.w - 20);
      const y = Math.min(Math.max(cy + Math.sin(a) * d, bounds.y + 20), bounds.y + bounds.h - 20);
      dir.zonas.push({ ...b, x, y, r_safe: m.r_safe ?? 48, safe: true });
    } else if (m.tipo === 'ondas') {
      // FIRMA CAMPANERO: anillos de campana que se EXPANDEN desde el jefe en tanda;
      // el peligro es la banda del anillo → esquívala cruzando por donde ya pasó.
      const n = m.n ?? 3, gap = m.gap_s ?? 0.5, tel = m.telegraph_s ?? 1.0;
      for (let i = 0; i < n; i++) dir.zonas.push({ ...b, x: cx, y: cy, r: 0, r_max: m.r_max ?? 260, vel: m.vel ?? 300, ancho: m.ancho ?? 26, t: tel + i * gap, telegraph_s: tel });
    } else if (m.tipo === 'cadena') {
      // FIRMA CARILLÓN: rayo ENCADENADO que salta por varios nodos hacia el jugador.
      const nn = m.n ?? 4, seg = m.seg ?? 96; const pts = [{ x: cx, y: cy }]; let px = cx, py = cy;
      for (let i = 0; i < nn; i++) {
        const ta = Math.atan2(player.y - py, player.x - px) + (Math.random() - 0.5) * 1.5;
        px = Math.min(Math.max(px + Math.cos(ta) * seg, bounds.x + 12), bounds.x + bounds.w - 12);
        py = Math.min(Math.max(py + Math.sin(ta) * seg, bounds.y + 12), bounds.y + bounds.h - 12);
        pts.push({ x: px, y: py });
      }
      dir.zonas.push({ ...b, x: cx, y: cy, puntos: pts, ancho: m.ancho ?? 22 });
    } else if (m.tipo === 'proyectiles') {
      // FIRMA ARCHIVERA: abanico de ORBES de tinta telegrafiados que cruzan la sala.
      const np = m.n ?? 5, spread = m.spread ?? 1.5, a0 = Math.atan2(player.y - cy, player.x - cx);
      const angs = []; for (let i = 0; i < np; i++) angs.push(a0 + (i - (np - 1) / 2) * (spread / np));
      dir.zonas.push({ ...b, x: cx, y: cy, angs, largo: m.largo ?? 300, proy_vel: m.vel ?? 160 });
    } else if (m.tipo === 'roba') {
      // FIRMA RELOJERO: te ROBA el compás un rato (reconecta la mecánica legacy).
      dir.zonas.push({ ...b, x: cx, y: cy, r: m.r ?? 44, dur: m.dur_s ?? 6 });
    } else if (m.tipo === 'adds') {
      EventBus.emit('jefe_adds', m.quien, m.n ?? 2, cx, cy);
      return;
    }
    EventBus.emit('jefe_cast', nombre, cx, cy);
    AudioManager.beep(300, 0.13, 'sine', 0.045, -70);
  }

  function resolver(z, player) {
    // Mecánicas no posicionales: emiten su efecto y no comprueban colisión de zona.
    if (z.tipo === 'proyectiles') { EventBus.emit('jefe_proyectiles', z.angs, z.x, z.y, z.dano, z.color, z.proy_vel); return; }
    if (z.tipo === 'roba') { EventBus.emit('jefe_roba_compas', z.dur); return; }
    const dxp = player.x - z.x, dyp = player.y - z.y, d = Math.hypot(dxp, dyp);
    let golpe = false;
    if (z.tipo === 'circulos') golpe = d < z.r;
    else if (z.tipo === 'donut') golpe = d > z.r_int && d < z.r_ext;
    else if (z.tipo === 'safe') golpe = d > z.r_safe;
    else if (z.tipo === 'cono') { const da = normAng(Math.atan2(dyp, dxp) - z.ang); golpe = Math.abs(da) < z.arco / 2 && d < z.largo; }
    else if (z.tipo === 'linea') { const da = normAng(Math.atan2(dyp, dxp) - z.ang); golpe = Math.abs(Math.sin(da) * d) < z.ancho / 2 && Math.cos(da) > 0 && d < z.largo; }
    else if (z.tipo === 'cadena') { for (let i = 1; i < z.puntos.length; i++) { if (distSeg(player.x, player.y, z.puntos[i - 1], z.puntos[i]) < z.ancho) { golpe = true; break; } } }
    if (golpe && !player.invulnerable) { player.hurt(z.dano, z.x, z.y); EventBus.emit('jefe_golpe', player.x, player.y); }
  }

  dir.update = function (dt, player) {
    if (boss.health.dead) return;
    comprobarFase();
    for (const z of dir.zonas) {
      if (z.fase === 'aviso') {
        z.t -= dt;
        if (z.t <= 0) {
          if (z.tipo === 'barrido') { z.fase = 'activa'; z.t = z.activa_s; }
          else if (z.tipo === 'ondas') { z.fase = 'activa'; z.t = z.r_max / z.vel + 0.1; }
          else { z.fase = 'golpe'; z.t = 0.24; resolver(z, player); }
        }
      } else if (z.fase === 'activa') {
        z.t -= dt;
        if (z.tipo === 'ondas') { // anillo que se expande; peligro = la banda
          z.r += z.vel * dt;
          const d = Math.hypot(player.x - z.x, player.y - z.y);
          if (Math.abs(d - z.r) < z.ancho && !player.invulnerable) { player.hurt(z.dano, z.x, z.y); EventBus.emit('jefe_golpe', player.x, player.y); }
          if (z.r >= z.r_max) z.fase = 'fin';
        } else { // barrido: la manecilla gira y daña a lo largo
          z.ang += z.vel * dt;
          const da = normAng(Math.atan2(player.y - z.y, player.x - z.x) - z.ang);
          const d = Math.hypot(player.x - z.x, player.y - z.y);
          if (Math.abs(da) < z.ancho && d < z.largo && !player.invulnerable) player.hurt(z.dano, z.x, z.y);
          if (z.t <= 0) z.fase = 'fin';
        }
      } else if (z.fase === 'golpe') { z.t -= dt; if (z.t <= 0) z.fase = 'fin'; }
    }
    dir.zonas = dir.zonas.filter(z => z.fase !== 'fin');
    dir.castT -= dt;
    // no encadena un cast nuevo mientras un barrido siga activo (para no saturar)
    if (dir.castT <= 0 && !dir.zonas.some(z => z.fase === 'activa')) {
      dir.castT = faseActual().cadencia_s ?? 2.6;
      lanzar(siguienteMecanica(), player);
    }
  };

  return dir;
}
