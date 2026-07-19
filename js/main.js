// Main — bucle, LA TORRE (piso vertical continuo), colisiones, Cadencia, HUD y render 2.5D.
// La LÓGICA es top-down pura (mundo XY); la proyección achata el plano del suelo
// (VIS.KY) y da altura a muros y obstáculos. Solo el render conoce la perspectiva.
// La cámara es LIBRE (sigue al jugador con lerp): no hay cortes por sala.
import { DataDB } from './data_db.js';
import { EventBus } from './event_bus.js';
import { Input } from './input.js';
import { GameState, RunState, SaveManager, AudioManager } from './state.js';
import { Player, Enemy, TearPool, BulletPool, circleHit, circleRectHit } from './entities.js';
import { Cadencia } from './cadencia.js';
import { RelojBatalla } from './reloj_batalla.js';
import { buildTower, BLOCK_W, BLOCK_H, WALL, TILE, TILE_SY, VIS, biomaDe } from './rooms.js';
import { MenuEquipo } from './menu_equipo.js';
import { esferaBonos, ganarXP, xpParaNivel } from './esfera.js';
import { compasesActivos, desbloqueado, desbloqueosEnNivel, etiqueta } from './progresion.js';
import { Tutorial } from './tutorial.js';
import { applyItem, rollItem } from './items.js';
import { aplicarEvento } from './eventos.js';
import { cast, elementMult } from './spells.js';
import { FX } from './fx.js';
import { PLAZA, NPCS, visita, resetVisita, drawNPC, drawCoro, drawPuebloBackdrop, drawPlazaGround } from './pueblo.js';
import { syncFamiliares, updateFamiliares, drawFamiliar } from './familiares.js';
import { spawnArt, updateArt, drawArt, romano } from './artes_fx.js';
import { selloDef, selloEquipado, obtenerSello, rasgoCuraPorSp, rasgoDashBurn, finisherElemental } from './sellos.js';
import { crearDirectorJefe } from './jefes.js';
import { Sprites } from './sprites.js';
import * as UIK from './ui_kit.js';

const PORTRAIT = !!window.MISTVEIL_PORTRAIT;
const MOBILE = !!window.MISTVEIL_MOBILE;
const VW = PORTRAIT ? 360 : 640, VH = PORTRAIT ? 640 : 360;
// Supersampling: el lienzo interno se dibuja a SS× y se muestra al tamaño lógico
// (resize() controla el CSS). Así el texto (Gelica) y el arte pintado salen
// nítidos y suaves — el look "perfilado" en vez de pixelado 8-bit. Todo el juego
// sigue trabajando en coordenadas VW×VH; la escala base la fija render().
const SS = 2;
const { KY, WALL_H, CAP, S_FACE, EXTRA_TOP } = VIS;
const canvas = document.getElementById('game');
canvas.width = VW * SS; canvas.height = VH * SS;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
ctx.setTransform(SS, 0, 0, SS, 0, 0);

// --- Safe-area / notch (B6): los botones táctiles que pegan a los bordes se apartan de
// la muesca y del indicador de inicio del iPhone. Se leen los env(safe-area-inset-*) con
// una sonda DOM y se convierten a coords virtuales (descontando el letterbox del canvas
// centrado). Sin muesca (escritorio/Android) los insets son 0 → los botones NO se mueven. ---
let touchBtns = null;     // se cablea a TOUCH_BTNS_PLAY tras definirlos (más abajo)
let _safeProbe = null;
function safeInsets() {
  try {
    if (!_safeProbe) {
      _safeProbe = document.createElement('div');
      _safeProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;'
        + 'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
      document.body.appendChild(_safeProbe);
    }
    const cs = getComputedStyle(_safeProbe);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  } catch { return { t: 0, r: 0, b: 0, l: 0 }; }
}
function applySafeArea(snap) {
  if (!touchBtns) return;
  const ins = safeInsets();
  const s = snap || 1;
  // El canvas va centrado (Math.min = contain): parte del inset cae sobre la barra de
  // letterbox y no muerde el lienzo. Se descuenta esa banda antes de convertir a virtual.
  const barX = Math.max(0, (window.innerWidth - VW * s) / 2);
  const barY = Math.max(0, (window.innerHeight - VH * s) / 2);
  const rV = Math.max(0, ins.r - barX) / s, lV = Math.max(0, ins.l - barX) / s;
  const bV = Math.max(0, ins.b - barY) / s, tV = Math.max(0, ins.t - barY) / s;
  for (const btn of touchBtns) {
    let x = btn.bx, y = btn.by;
    if (btn.bx > VW - 48) x = btn.bx - rV; else if (btn.bx < 48) x = btn.bx + lV; // pegado a dcha/izq
    if (btn.by > VH - 72) y = btn.by - bV; else if (btn.by < 72) y = btn.by + tV; // pegado a abajo/arriba
    btn.x = x; btn.y = y;
  }
}
function resize() {
  const s = Math.min(window.innerWidth / VW, window.innerHeight / VH);
  // Móvil: escala fraccionaria para llenar la pantalla; escritorio: escala entera pixel-perfect
  const snap = MOBILE ? s : (s >= 1 ? Math.floor(s) : s);
  canvas.style.width = (VW * snap) + 'px';
  canvas.style.height = (VH * snap) + 'px';
  applySafeArea(snap); // reubica los botones táctiles según la muesca (no-op sin insets)
}
window.addEventListener('resize', resize);
resize();

// ---------- Proyección 2.5D + cámara libre ----------
// ZOOM: en móvil el mundo se dibuja ampliado alrededor del jugador (HUD sin escalar)
const ZOOM = (MOBILE || PORTRAIT) ? 1.45 : 1;
const VWz = VW / ZOOM, VHz = VH / ZOOM; // viewport efectivo en unidades de mundo
const cam = { x: 0, y: 0 };
function SX(x) { return Math.round(x - cam.x); }
function SY(y, z = 0) { return Math.round((y - cam.y) * KY - z); }
function toWorld(cx, cy) {
  const r = canvas.getBoundingClientRect();
  return [cx * VW / r.width / ZOOM + cam.x, (cy * VH / r.height / ZOOM) / KY + cam.y];
}
function camGoal() {
  const p = world.player;
  const bb = floorMap.bbox;
  const gf = DataDB.balance.game_feel ?? {};
  const look = (gf.cam_lookahead_aim_px ?? 0);
  const lv = (gf.cam_lookahead_vel_s ?? 0);
  let tx = p.x - VWz / 2 + p.aim.x * look + p.vx * lv;
  let ty = p.y - (VHz / 2 + (PORTRAIT ? 40 : 14)) / KY + (p.aim.y * look + p.vy * lv) * 0.7;
  // Clamp horizontal: si la torre es más estrecha que la vista, centrarla
  const bbwScreen = bb.w;
  if (bbwScreen <= VWz) tx = bb.x + bb.w / 2 - VWz / 2;
  else tx = Math.min(Math.max(tx, bb.x - 20), bb.x + bb.w + 20 - VWz);
  const bbhScreen = bb.h * KY + EXTRA_TOP;
  if (bbhScreen <= VHz) ty = bb.y + bb.h / 2 - (VHz / 2) / KY;
  else ty = Math.min(Math.max(ty, bb.y - (EXTRA_TOP + 14) / KY), bb.y + bb.h + 40 / KY - VHz / KY);
  return [tx, ty];
}

// ---------- Estado global de la escena ----------
const world = {
  player: null, enemies: [],
  tears: new TearPool(), bullets: new BulletPool(),
  pickups: [], dmgNumbers: [], shockwaves: [], corpses: [], pet: null,
  familiares: [], trails: [], artFx: []
};
const cad = new Cadencia();
const batalla = new RelojBatalla(ctx, VW, VH, font);
const menu = new MenuEquipo(VW, VH, font, ctx);
const tut = new Tutorial({ world, cad, Input, flash, font, ctx, VW, VH, Enemy, currentRoom: () => floorMap.current });
let titleT = 0;
let titleIdx = 0; // foco del título cuando hay partida guardada (0 Reanudar / 1 Pueblo)
let menuReturn = 'play';
let pendingBalance = null; // pantalla de XP al pisar la trampilla
let lastDeathXP = null;
// Botones táctiles mínimos (el resto son gestos: tap dcha = ATQ, flick izq = DASH, agitar = Ignición)
// Combate al CENTRO-ABAJO: Ignición (centro, la mayor), Parada y Arte flanqueándola,
// para llegar con los dos pulgares desde los sticks. Sistema (pausa/≡/♪) arriba dcha.
// (No reordenar: TOUCH_BTNS_1MANO/PUEBLO referencian los índices 4 y 5.)
const TOUCH_BTNS_PLAY = [
  { code: 'TouchB', label: 'PARADA',   x: VW / 2 - 58, y: VH - 40, r: 21 },   // 0 bloqueo
  { code: 'TouchQ', label: 'ARTE',     x: VW / 2 + 58, y: VH - 40, r: 21 },   // 1 magia
  { code: 'TouchF', label: 'IGNICIÓN', x: VW / 2,      y: VH - 50, r: 25 },   // 2 overdrive (centro)
  { code: 'TouchC', label: '♪',        x: VW - 16, y: 118, r: 13 },           // 3 compás (sistema)
  { code: 'TouchPause', label: 'II',   x: VW - 16, y: 58, r: 13 },            // 4
  { code: 'TouchMenu', label: '≡',     x: VW - 16, y: 88, r: 13 },            // 5
  { code: 'TouchX', label: '⌛',        x: VW / 2 + 116, y: VH - 60, r: 15 }   // 6 objeto activo (solo si llevas uno)
];
const TOUCH_BTNS_PUEBLO = [TOUCH_BTNS_PLAY[5]];
const TOUCH_BTNS_1MANO = [TOUCH_BTNS_PLAY[4], TOUCH_BTNS_PLAY[5]]; // solo pausa y ≡
const TOUCH_BTNS_NONE = [];
// Safe-area: guarda la posición BASE de diseño de cada botón y aplica el offset de muesca
// ahora que ya existen (PUEBLO/1MANO comparten estos MISMOS objetos por índice → basta esto).
for (const b of TOUCH_BTNS_PLAY) { b.bx = b.x; b.by = b.y; }
touchBtns = TOUCH_BTNS_PLAY;
resize();
let floorMap = null;
let cur = null;      // sala bajo los pies del jugador
let mode = 'play';
let pauseIdx = 0;        // foco del menú de pausa (navegable por toque/mando/teclado)
let musicaActual = null; // pista de música pedida ahora mismo (el director solo cambia al variar)
let beatInfo = { active: false, pulse: 0, phase: 0, beat: 0 }; // reloj de beat de la pista (latido HUD)
let lastMusBeat = -1; // último índice de beat en el que sonó la capa reactiva (A5)
let showDebug = false;
let fps = 60, fpsAcc = 0, fpsN = 0;
let flashMsg = '', flashT = 0, flashSub = '';
let hudHintT = 0; // recordatorio de controles: se muestra abajo unos segundos al entrar a un piso
let trapdoorHintCd = 0;
let freezeT = 0;   // péndulo quieto
let slowmoT = 0, slowmoFactor = 1, slowmoBlue = false; // arena del tiempo (dorado) y bullet-time G5 (azul)
let nearmissCd = 0; // anti-spam del bullet-time por esquivar por los pelos
let ignicionFlashT = 0; // fogonazo dorado del estallido de Ignición
let hitStopT = 0;  // micro-pausa en golpes perfectos (juice)
let pendingUpgrades = null; // 3 mejoras ofrecidas al descender
let upgradeIdx = 0;         // foco de la carta de mejora (toque/mando/teclado)
let santIdx = 0;           // foco del Santuario (rejilla de nodos + Descender)
let dlg = null;             // diálogo activo del pueblo {npc, lines, i}
let puebloAviso = null;     // {titulo, sub, t} recompensa recién ganada
let now0 = performance.now();
const T = () => (performance.now() - now0) / 1000;
const t9 = k => DataDB.texto(k);

function flash(msg, sub = '') { flashMsg = msg; flashSub = sub; flashT = 2.2; }
function pushPopup(x, y, text, color, size = 10) {
  world.dmgNumbers.push({ x, y, t: 0.8, text, color, size });
}

// Salas cuyo bloque intersecta la vista (para render/colisiones/interacción)
function activeRooms(margin = 80) {
  const x0 = cam.x - margin, x1 = cam.x + VWz + margin;
  const y0 = cam.y - margin / KY, y1 = cam.y + (VHz + margin) / KY;
  const out = [];
  for (const room of floorMap.rooms.values()) {
    if (room.blockX + BLOCK_W < x0 || room.blockX > x1) continue;
    if (room.blockY + BLOCK_H < y0 || room.blockY > y1) continue;
    out.push(room);
  }
  if (cur && !out.includes(cur)) out.push(cur);
  return out.sort((a, b) => a.gy - b.gy || a.gx - b.gx);
}

function roomAt(x, y) {
  return floorMap.at(Math.floor(x / BLOCK_W), Math.floor(y / BLOCK_H));
}

function placePlayerAtTop() {
  const start = floorMap.current;
  const p = world.player;
  p.x = start.bounds.x + start.bounds.w / 2;
  p.y = start.bounds.y + start.bounds.h * 0.5;
  p.vx = p.vy = 0;
  cur = start;
  const [gx, gy] = camGoal();
  cam.x = gx; cam.y = gy;
}

// Memoria ganada (Cuerda Tensa la escala +50%)
function gainMemoria(n) {
  GameState.memoria += Math.round(n * (GameState.cuerdaTensa ? 1.5 : 1));
  SaveManager.save();
}

function newRun() {
  // OJO: newRun también se llama como andamiaje al arrancar (detrás del título), así que
  // NO borra aquí la partida guardada — eso lo hace cada sitio donde el JUGADOR decide
  // empezar de cero (descenso desde pueblo/Santuario, tutorial). Ver descartarRunGuardada.
  RunState.reset();
  GameState.stats.runs++;
  floorMap = buildTower(RunState.piso, RunState.semilla);
  world.player = new Player(0, 0);
  // Nodos del Santuario que afectan al inicio de run
  const p0 = world.player;
  if (GameState.tiene('recuerdo_de_cuerda')) {
    p0.mods.statAdd.max_hp = (p0.mods.statAdd.max_hp ?? 0) + 1;
    p0.recomputeStats();
    p0.health.hp = p0.health.max;
  }
  if (GameState.tiene('bolsillo_cosido')) RunState.oro = 5;
  if (GameState.tiene('sello_de_marea') && !RunState.tomos.includes('marea_de_cera')) {
    RunState.tomos.push('marea_de_cera');
  }
  // Bendiciones del pueblo (se consumen)
  if (RunState.bendiciones.includes('pan')) {
    p0.mods.statAdd.max_hp = (p0.mods.statAdd.max_hp ?? 0) + 1;
    p0.recomputeStats();
    p0.health.hp = p0.health.max;
    flash('Pan de ayer', 'El pecho abriga: +1 corazón');
  }
  RunState.bendiciones = [];
  RunState.oro += esferaBonos().oroInicial; // Bolsa del relojero (Esfera)
  world.enemies = [...floorMap.roamers];
  world.pickups = [];
  world.dmgNumbers = [];
  world.shockwaves = [];
  world.tears.clear(); world.bullets.clear();
  cad.reset();
  freezeT = 0; hitStopT = 0; slowmoT = 0; nearmissCd = 0;
  world.familiares = []; world.trails = []; world.artFx = [];
  pendingUpgrades = null;
  mode = 'play';
  hudHintT = DataDB.balance.ui?.hint_secs ?? 7;
  placePlayerAtTop();
  floorMap.current.enter(world);
  world.player.onRoomEntered();
  if (!GameState.flags.menuVisto) flash('Pulsa Tab: equipo y Esfera del Reloj', 'Cada nivel te da un engranaje que gastar');
}

// ---------- Biomas, altares, mascota y caídos ----------
let altarCd = 0, metro = null;
function updateBiomaExtras(dt, p, room) {
  if (altarCd > 0) altarCd -= dt;
  // Péndulos de la Sala de Péndulos: barren la galería; roce cercano = Espíritu
  if (room?.pendulos?.length) {
    const cfg = room.bioma.pendulo;
    for (const pd of room.pendulos) {
      pd.t += dt;
      if (pd.roceCd > 0) pd.roceCd -= dt;
      const a = Math.sin(pd.t * Math.PI * 2 / cfg.period_s) * cfg.half_deg * Math.PI / 180;
      pd.bx = pd.ax + Math.sin(a) * cfg.largo_px;
      pd.by = pd.ay + Math.cos(a) * cfg.largo_px * 0.8;
      const d = Math.hypot(p.x - pd.bx, p.y - pd.by);
      if (d < 11 + p.hurtR) p.hurt(cfg.dano, pd.bx, pd.by);
      else if (d < 34 && pd.roceCd <= 0 && !p.invulnerable) {
        pd.roceCd = 0.9;
        RunState.sp = Math.min(DataDB.balance.ignicion.sp_max, RunState.sp + cfg.sp_roce);
        EventBus.emit('sp_changed', RunState.sp);
        pushPopup(p.x, p.y - 14, '+' + cfg.sp_roce + ' SP', '#7ee8e0', 8);
        AudioManager.beep(920, 0.05, 'triangle', 0.04);
      }
    }
  }
  // La Bóveda de Truenos: descargas telegrafiadas caen a compás durante el combate
  if (room?.truenos) {
    const cfg = room.bioma.truenos;
    const T = room.truenos;
    for (const z of T.zaps) {
      if (!z.fired) {
        z.t -= dt;
        if (z.t <= 0) {
          z.fired = true; z.flash = 0.2;
          if (Math.hypot(p.x - z.x, p.y - z.y) < cfg.radio_px + p.hurtR && !p.invulnerable) p.hurt(cfg.dano, z.x, z.y);
          EventBus.emit('trueno_descarga', z.x, z.y, cfg.radio_px);
          AudioManager.beep(70, 0.2, 'sawtooth', 0.07, -40);
          FX.addShake(2.4);
        }
      } else z.flash -= dt;
    }
    T.zaps = T.zaps.filter(z => z.fired ? z.flash > -0.1 : true);
    if (!room.cleared) { // solo mientras la sala está en combate
      T.t += dt;
      if (T.t >= cfg.period_s) {
        T.t = 0;
        const b = room.bounds;
        for (let i = 0; i < (cfg.zonas ?? 2); i++) {
          T.zaps.push({ x: b.x + 22 + Math.random() * (b.w - 44), y: b.y + 22 + Math.random() * (b.h - 44), t: cfg.telegraph_s, fired: false, flash: 0 });
        }
        AudioManager.beep(1300, 0.05, 'triangle', 0.03);
      }
    }
  }
  // Mecha de los caídos (reavivables) se consume
  for (const c of world.corpses) c.t -= dt;
  world.corpses = world.corpses.filter(c => c.t > 0 && (!c.room || c.room === room));
  // Tuerca, el engranajito con patas: va a por el botín lejano y te lo lanza
  if (desbloqueado('mascota', 'tuerca')) {
    if (!world.pet) world.pet = { x: p.x - 16, y: p.y - 10, blink: 0 };
    const pet = world.pet;
    let target = null, td = 340;
    for (const pk of world.pickups) {
      if (pk.dead) continue;
      const d = Math.hypot(pk.x - p.x, pk.y - p.y);
      if (d > 40 && d < td) { td = d; target = pk; }
    }
    const tx = target ? target.x : p.x - p.aim.x * 22;
    const ty = target ? target.y : p.y - p.aim.y * 22 - 8;
    pet.x += (tx - pet.x) * Math.min(1, dt * 3.4);
    pet.y += (ty - pet.y) * Math.min(1, dt * 3.4);
    pet.blink += dt;
    if (target && Math.hypot(target.x - pet.x, target.y - pet.y) < 10) {
      const d = Math.hypot(p.x - target.x, p.y - target.y) || 1;
      target.vx = (p.x - target.x) / d * 420;
      target.vy = (p.y - target.y) / d * 420;
    }
  } else world.pet = null;
  // Altares de las cámaras especiales
  if (room?.altars?.length && altarCd <= 0 && interactPressed(true)) {
    for (const al of room.altars) {
      if (al.used || Math.hypot(p.x - al.x, p.y - al.y) > 26) continue;
      altarCd = 0.5;
      activarAltar(al, p);
      break;
    }
  }
}

function activarAltar(al, p) {
  const C = DataDB.balance.camaras;
  if (al.kind === 'corazon') {
    if (p.stats.max_hp <= C.fundicion_min_corazones * 2) { flash('La Fundición te rechaza', 'no queda corazón que dar'); return; }
    p.mods.statAdd.max_hp = (p.mods.statAdd.max_hp ?? 0) - 1;
    p.applyBalance();
    GameState.engranajes++;
    SaveManager.save();
    AudioManager.sfx('equip'); FX.addShake(3);
    al.used = true;
    flash('Un corazón a la fragua', '+1 engranaje para la Esfera');
  } else if (al.kind === 'fusion') {
    const comunes = RunState.items.filter(id => DataDB.item(id)?.rareza === 'comun');
    if (comunes.length < 2) { flash('La fragua pide 2 reliquias comunes', 'no tienes suficientes'); return; }
    const sacrif = comunes.sort(() => Math.random() - 0.5).slice(0, 2);
    const keep = [...RunState.items];
    for (const id of sacrif) keep.splice(keep.indexOf(id), 1);
    RunState.items = [];
    p.mods = Player.freshMods();
    for (const id of keep) { const it = DataDB.item(id); if (it) applyItem(it, p); }
    const raras = DataDB.items.items.filter(i => i.rareza === 'raro' && !RunState.items.includes(i.id));
    const nueva = raras.length ? raras[Math.floor(Math.random() * raras.length)] : null;
    if (nueva) applyItem(nueva, p);
    p.applyBalance(); p.onRoomEntered();
    AudioManager.sfx('tome'); FX.addShake(2);
    al.used = true;
    flash('FUSIÓN: ' + (nueva?.nombre ?? 'nada...'), sacrif.map(id => DataDB.item(id)?.nombre).join(' + ') + ' → reliquia rara');
  } else if (al.kind === 'metronomo') {
    metro = { t: -0.8, beats: C.metronomo_beats, beatMs: C.metronomo_beat_ms, hits: 0, claimed: new Set(), altar: al, feed: '', feedT: 0 };
    mode = 'metronomo';
    AudioManager.sfx('tome');
  } else if (al.kind === 'apuesta') {
    if (RunState.apuesta) { flash('Ya hay una apuesta en marcha'); return; }
    if (RunState.oro < C.apuesta_coste) { flash('El Gremio no fía', 'hacen falta ' + C.apuesta_coste + ' de oro'); return; }
    RunState.oro -= C.apuesta_coste;
    RunState.apuesta = { armed: true };
    al.used = true;
    AudioManager.sfx('gold');
    flash('Apuesta sellada: ' + C.apuesta_coste + ' oro', 'limpia la próxima cámara sin fallo ni rasguño → ' + C.apuesta_premio);
  } else if (al.kind === 'evento') {
    // Evento de altar data-driven (data/eventos.json → js/eventos.js). El intérprete lee
    // las reglas; aquí solo le damos acceso al mundo (api) y pintamos el resultado.
    const def = DataDB.eventos?.eventos?.find(e => e.id === al.evId);
    if (!def) { al.used = true; return; }
    const pool = () => (DataDB.enemigos.pools_spawn['bioma_' + (cur?.bioma?.id ?? '')] ?? DataDB.enemigos.pools_spawn['piso1']);
    const api = {
      oro: () => RunState.oro, sp: () => RunState.sp,
      corazones: () => Math.ceil(p.health.max / 2),
      rnd: Math.random,
      addOro: (n) => { RunState.oro = Math.max(0, RunState.oro + n); },
      addSp: (n) => { RunState.sp = Math.max(0, Math.min(DataDB.balance.ignicion.sp_max, RunState.sp + n)); },
      quitarCorazon: (n) => { p.mods.statAdd.max_hp = (p.mods.statAdd.max_hp ?? 0) - n; p.applyBalance(); p.health.hp = Math.min(p.health.hp, p.health.max); FX.addShake(3); },
      efecto: (ef) => {
        switch (ef.tipo) {
          case 'dar_item': { const it = rollItem(ef.pool ?? 'tesoro'); if (it) spawnPickup('item:' + it.id, al.x, al.y - 18, false); break; }
          case 'curar': p.health.hp = Math.min(p.health.max, p.health.hp + (ef.valor ?? 2)); AudioManager.sfx('heart'); break;
          case 'quitar_corazon': api.quitarCorazon(ef.valor ?? 1); break;
          case 'oro': RunState.oro = Math.max(0, RunState.oro + (ef.valor ?? 0)); AudioManager.sfx('gold'); break;
          case 'sp': api.addSp(ef.valor ?? 0); break;
          case 'emboscada': {
            const pl = pool();
            for (let i = 0; i < (ef.valor ?? 2); i++) {
              const a = (i / (ef.valor ?? 2)) * Math.PI * 2;
              const e = new Enemy(pl[Math.floor(Math.random() * pl.length)], al.x + Math.cos(a) * 40, al.y + Math.sin(a) * 30);
              e.room = cur; world.enemies.push(e);
            }
            EventBus.emit('enemy_spawned', al.x, al.y); AudioManager.sfx('door_seal'); FX.addShake(3);
            break;
          }
        }
      }
    };
    const res = aplicarEvento(def, api);
    if (!res.ok) { flash(res.titulo, res.sub); return; }
    al.used = true;
    AudioManager.sfx('equip');
    flash(res.titulo, res.sub);
  }
}

function updateMetronomo(dt) {
  const C = metro;
  C.t += dt;
  if (C.feedT > 0) C.feedT -= dt;
  const tMs = C.t * 1000;
  const beatIdx = Math.round(tMs / C.beatMs);
  // tick audible en cada beat
  if (beatIdx >= 1 && beatIdx <= C.beats && !C['tick' + beatIdx] && Math.abs(tMs - beatIdx * C.beatMs) < 30) {
    C['tick' + beatIdx] = true;
    AudioManager.beep(beatIdx % 4 === 1 ? 1180 : 880, 0.06, 'square', 0.05);
  }
  const press = Input.justPressed('melee') || Input.justCode('Enter') || (Input.touchState().enabled && Input.justCode('TouchTap'));
  if (press && beatIdx >= 1 && beatIdx <= C.beats && !C.claimed.has(beatIdx)) {
    const diff = Math.abs(tMs - beatIdx * C.beatMs);
    C.claimed.add(beatIdx);
    if (diff <= 130) { C.hits++; C.feed = '¡PERFECTO!'; C.feedT = 0.4; AudioManager.sfx('cad_perfect'); }
    else if (diff <= 265) { C.hits++; C.feed = 'bien'; C.feedT = 0.4; AudioManager.sfx('cad_good'); }
    else { C.feed = 'fuera de compás'; C.feedT = 0.4; AudioManager.sfx('cad_fail'); }
  }
  if (tMs > (C.beats + 0.6) * C.beatMs) {
    const need = DataDB.balance.camaras.metronomo_aciertos;
    C.altar.used = true;
    if (C.hits >= need) {
      const it = rollItem('tesoro');
      if (it) spawnPickup('item:' + it.id, C.altar.x, C.altar.y - 18, false);
      flash('¡El Metrónomo asiente!', C.hits + '/' + C.beats + ' — reliquia concedida');
      AudioManager.sfx('clear');
    } else {
      flash('El Metrónomo calla', C.hits + '/' + C.beats + ' — necesitabas ' + need);
    }
    metro = null;
    mode = 'play';
  }
}

function drawMetronomo() {
  ctx.fillStyle = 'rgba(8,5,16,0.88)'; ctx.fillRect(0, 0, VW, VH);
  const C = metro;
  const tMs = C.t * 1000;
  font(12); ctx.textAlign = 'center'; ctx.fillStyle = '#ffd54f';
  ctx.fillText('CÁMARA DEL METRÓNOMO', VW / 2, 60);
  font(8); ctx.fillStyle = '#8d82ad';
  ctx.fillText('golpea (ATAQUE / tap) en cada tic · ' + DataDB.balance.camaras.metronomo_aciertos + ' de ' + C.beats + ' para la reliquia', VW / 2, 78);
  // péndulo oscilante
  const cx = VW / 2, cy = VH / 2 - 26;
  const beatF = (tMs % C.beatMs) / C.beatMs;
  const beatIdx = Math.floor(tMs / C.beatMs);
  const dir = beatIdx % 2 === 0 ? 1 : -1;
  const a = Math.sin((beatF - 0.5) * Math.PI) * 0.6 * dir;
  ctx.strokeStyle = '#b9aee0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.sin(a) * 86, cy + Math.cos(a) * 86); ctx.stroke();
  ctx.fillStyle = '#ffd54f';
  ctx.beginPath(); ctx.arc(cx + Math.sin(a) * 86, cy + Math.cos(a) * 86, 9, 0, 7); ctx.fill();
  // anillo del beat actual
  const nb = Math.round(tMs / C.beatMs);
  if (nb >= 1 && nb <= C.beats) {
    const prox = 1 - Math.min(1, Math.abs(tMs - nb * C.beatMs) / C.beatMs * 2);
    ctx.strokeStyle = `rgba(126,232,224,${0.25 + prox * 0.75})`; ctx.lineWidth = 2 + prox * 3;
    ctx.beginPath(); ctx.arc(cx, cy + 86, 16 + (1 - prox) * 22, 0, 7); ctx.stroke();
  }
  // marcador de beats
  for (let i = 1; i <= C.beats; i++) {
    const bx = VW / 2 - (C.beats * 18) / 2 + (i - 0.5) * 18;
    ctx.fillStyle = C.claimed.has(i) ? '#ffd54f' : i <= beatIdx ? '#5a5470' : '#2a2340';
    ctx.beginPath(); ctx.arc(bx, VH / 2 + 78, 5, 0, 7); ctx.fill();
  }
  font(11); ctx.fillStyle = '#e9e2f5';
  ctx.fillText(C.hits + ' aciertos', VW / 2, VH / 2 + 108);
  if (C.feedT > 0) {
    font(12); ctx.fillStyle = C.feed.startsWith('¡') ? '#ffd54f' : C.feed === 'bien' ? '#7ee8e0' : '#e0556b';
    ctx.fillText(C.feed, VW / 2, VH / 2 - 88);
  }
}

// Telegrafías del jefe de raid (js/jefes.js): se dibujan crecientes en el suelo
// para que las esquives con tiempo (círculo, donut "acércate", cono, barrido, safe).
function drawBossZonas(dir, t = 0) {
  if (!dir?.zonas?.length) return;
  const KY = VIS.KY;
  for (const z of dir.zonas) {
    const sx = SX(z.x), sy = SY(z.y);
    const aviso = z.fase === 'aviso';
    const k = aviso ? 1 - Math.max(0, z.t) / Math.max(0.001, z.telegraph_s ?? 1) : 1;
    const inminente = aviso && k > 0.78;                      // últimos ~20%: el golpe es YA
    const blink = inminente && Math.floor(t * 18) % 2 === 0;  // parpadeo blanco pre-impacto
    const fillA = aviso ? 0.10 + 0.30 * k : 0.5;
    const lineA = aviso ? 0.45 + 0.5 * k : 0.95;
    const col = z.color ?? '#e05a4f';
    const lineCol = blink ? '#ffffff' : col;
    ctx.save();
    ctx.fillStyle = col; ctx.strokeStyle = lineCol; ctx.lineWidth = inminente ? 3 : 2;
    if (z.tipo === 'circulos') {
      ctx.globalAlpha = fillA; ctx.beginPath(); ctx.ellipse(sx, sy, z.r, z.r * KY, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = lineA; ctx.beginPath(); ctx.ellipse(sx, sy, z.r, z.r * KY, 0, 0, 7); ctx.stroke();
    } else if (z.tipo === 'donut') {
      ctx.globalAlpha = fillA; ctx.beginPath();
      ctx.ellipse(sx, sy, z.r_ext, z.r_ext * KY, 0, 0, 7);
      ctx.ellipse(sx, sy, z.r_int, z.r_int * KY, 0, 0, 7, true);
      ctx.fill('evenodd');
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#7ee8e0';
      ctx.beginPath(); ctx.ellipse(sx, sy, z.r_int, z.r_int * KY, 0, 0, 7); ctx.stroke(); // borde de la zona segura
    } else if (z.tipo === 'safe') {
      const b = dir.room.bounds;
      ctx.globalAlpha = fillA; ctx.beginPath();
      ctx.rect(SX(b.x), SY(b.y), b.w, b.h * KY);
      ctx.ellipse(sx, sy, z.r_safe, z.r_safe * KY, 0, 0, 7, true);
      ctx.fill('evenodd');
      ctx.globalAlpha = 0.95; ctx.strokeStyle = '#7ee8e0';
      ctx.beginPath(); ctx.ellipse(sx, sy, z.r_safe, z.r_safe * KY, 0, 0, 7); ctx.stroke();
    } else if (z.tipo === 'cono') {
      ctx.globalAlpha = fillA; ctx.beginPath(); ctx.moveTo(sx, sy);
      const a0 = z.ang - z.arco / 2, a1 = z.ang + z.arco / 2;
      for (let i = 0; i <= 10; i++) { const a = a0 + (a1 - a0) * i / 10; ctx.lineTo(sx + Math.cos(a) * z.largo, sy + Math.sin(a) * z.largo * KY); }
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = lineA; ctx.stroke();
    } else if (z.tipo === 'linea') {
      ctx.translate(sx, sy); ctx.rotate(z.ang); ctx.scale(1, KY);
      ctx.globalAlpha = fillA; ctx.fillRect(0, -z.ancho / 2, z.largo, z.ancho);
      ctx.globalAlpha = lineA; ctx.strokeStyle = lineCol; ctx.lineWidth = inminente ? 2.5 : 1.5; ctx.strokeRect(0, -z.ancho / 2, z.largo, z.ancho);
    } else if (z.tipo === 'barrido') {
      const activa = z.fase === 'activa';
      // Cuña del ancho REAL de colisión (±z.ancho): el peligro se VE, no es una raya fina
      ctx.globalAlpha = activa ? 0.32 : fillA * 0.9; ctx.beginPath(); ctx.moveTo(sx, sy);
      const a0 = z.ang - z.ancho, a1 = z.ang + z.ancho;
      for (let i = 0; i <= 8; i++) { const a = a0 + (a1 - a0) * i / 8; ctx.lineTo(sx + Math.cos(a) * z.largo, sy + Math.sin(a) * z.largo * KY); }
      ctx.closePath(); ctx.fill();
      const ex = sx + Math.cos(z.ang) * z.largo, ey = sy + Math.sin(z.ang) * z.largo * KY; // manecilla central
      ctx.globalAlpha = activa ? 0.95 : lineA; ctx.lineWidth = activa ? 5 : 3;
      ctx.strokeStyle = (activa && Math.floor(t * 18) % 2 === 0) ? '#fff' : col;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    } else if (z.tipo === 'ondas') { // FIRMA CAMPANERO: anillo de campana que se expande
      if (z.fase === 'activa') {
        ctx.globalAlpha = 0.9; ctx.lineWidth = Math.max(3, z.ancho * 0.8);
        ctx.beginPath(); ctx.ellipse(sx, sy, z.r, z.r * KY, 0, 0, 7); ctx.stroke();
        ctx.globalAlpha = 0.3; ctx.lineWidth = z.ancho * 1.6; ctx.stroke();
      } else { const rr = 18 + 8 * Math.sin(t * 12); ctx.globalAlpha = 0.35 + 0.4 * k; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy, rr, rr * KY, 0, 0, 7); ctx.stroke(); }
    } else if (z.tipo === 'cadena') { // FIRMA CARILLÓN: rayo encadenado por nodos
      ctx.globalAlpha = aviso ? lineA : 0.95; ctx.lineWidth = aviso ? 2 : 4;
      ctx.strokeStyle = (!aviso || blink) && Math.floor(t * 20) % 2 === 0 ? '#fff' : col;
      ctx.beginPath();
      for (let i = 0; i < z.puntos.length; i++) { const px = SX(z.puntos[i].x), py = SY(z.puntos[i].y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
      ctx.globalAlpha = lineA; ctx.fillStyle = col;
      for (const pt of z.puntos) { ctx.beginPath(); ctx.ellipse(SX(pt.x), SY(pt.y), 4, 4 * KY, 0, 0, 7); ctx.fill(); }
    } else if (z.tipo === 'proyectiles') { // FIRMA ARCHIVERA: trayectorias de los orbes
      ctx.globalAlpha = 0.3 + 0.5 * k; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
      const L = z.largo * (0.3 + 0.7 * k);
      for (const a of z.angs) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * L, sy + Math.sin(a) * L * KY); ctx.stroke(); }
      ctx.setLineDash([]);
    } else if (z.tipo === 'roba') { // FIRMA RELOJERO: remolino-reloj (robo de compás)
      const rr = z.r * (0.6 + 0.4 * k);
      ctx.globalAlpha = 0.4 + 0.5 * k; ctx.lineWidth = inminente ? 3 : 2;
      ctx.beginPath(); ctx.ellipse(sx, sy, rr, rr * KY, 0, 0, 7); ctx.stroke();
      const ha = t * 6;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(ha) * rr * 0.8, sy + Math.sin(ha) * rr * 0.8 * KY);
      ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(ha * 0.5) * rr * 0.5, sy + Math.sin(ha * 0.5) * rr * 0.5 * KY); ctx.stroke();
    }
    ctx.restore();
  }
}

// Barra de vida grande del jefe (estilo raid): nombre + fase, arriba-centro.
function drawBossHP(dir) {
  if (!dir || dir.boss.health.dead) return;
  const b = dir.boss;
  const w = Math.min(VW - 80, 380), x = (VW - w) / 2, y = 40;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - 2, y - 2, w + 4, 9);
  ctx.fillStyle = '#3a2030'; ctx.fillRect(x, y, w, 5);
  const frac = Math.max(0, b.health.hp / b.health.max);
  ctx.fillStyle = '#e0556b'; ctx.fillRect(x, y, w * frac, 5);
  ctx.fillStyle = '#ffd54f'; ctx.fillRect(x, y, w * frac, 2);
  font(9); ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9c9';
  ctx.fillText(dir.nombre + '  ·  Fase ' + (dir.fase + 1), VW / 2, y - 4);
  ctx.textAlign = 'left';
}

function drawBiomaExtras(t) {
  const room = floorMap.current;
  if (!room) return;
  // charcos de tinta
  if (room.tinta?.length) {
    ctx.fillStyle = 'rgba(16,10,40,0.55)';
    for (const r of room.tinta) {
      ctx.beginPath(); ctx.ellipse(SX(r.x + r.w / 2), SY(r.y + r.h / 2), r.w * 0.62, r.h * 0.62 * VIS.KY, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = 'rgba(120,100,220,0.12)';
    for (const r of room.tinta) {
      ctx.beginPath(); ctx.ellipse(SX(r.x + r.w / 2) - 3, SY(r.y + r.h / 2) - 2, r.w * 0.3, r.h * 0.2, 0, 0, 7); ctx.fill();
    }
  }
  // caídos reavivables (mecha humeante)
  for (const c of world.corpses) {
    const x = SX(c.x), y = SY(c.y);
    ctx.globalAlpha = Math.min(1, c.t / 3);
    ctx.fillStyle = 'rgba(180,160,120,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y, 7, 4, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8d82ad'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y - 2);
    ctx.quadraticCurveTo(x + 3, y - 8 - Math.sin(t * 3 + c.x) * 2, x + 1, y - 12); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // péndulos
  if (room.pendulos?.length) {
    for (const pd of room.pendulos) {
      if (pd.bx == null) continue;
      ctx.strokeStyle = 'rgba(200,190,230,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(SX(pd.ax), SY(pd.ay) - 30); ctx.lineTo(SX(pd.bx), SY(pd.by)); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(SX(pd.bx), SY(pd.by) + 6, 9, 3.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#c9a24a';
      ctx.beginPath(); ctx.arc(SX(pd.bx), SY(pd.by), 9, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(SX(pd.bx) - 2, SY(pd.by) - 3, 3, 0, 7); ctx.fill();
    }
  }
  // descargas de truenos: aro de telegrafía que se cierra, luego rayo + fogonazo
  if (room.truenos?.zaps?.length) {
    const cfg = room.bioma.truenos;
    for (const z of room.truenos.zaps) {
      const x = SX(z.x), y = SY(z.y);
      if (!z.fired) {
        const k = 1 - Math.max(0, z.t) / cfg.telegraph_s;
        ctx.strokeStyle = 'rgba(171,71,188,' + (0.3 + 0.45 * k) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y, cfg.radio_px, cfg.radio_px * VIS.KY, 0, 0, 7); ctx.stroke();
        const rr = cfg.radio_px * (1 - k) + 3;
        ctx.beginPath(); ctx.ellipse(x, y, rr, rr * VIS.KY, 0, 0, 7); ctx.stroke();
      } else if (z.flash > 0) {
        ctx.globalAlpha = Math.min(1, z.flash / 0.2);
        const g = ctx.createRadialGradient(x, y, 2, x, y, cfg.radio_px);
        g.addColorStop(0, 'rgba(240,216,255,0.6)'); g.addColorStop(1, 'rgba(171,71,188,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(x, y, cfg.radio_px, cfg.radio_px * VIS.KY, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#f0d8ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, y - 64);
        for (let yy = y - 64; yy < y; yy += 11) ctx.lineTo(x + (Math.random() - 0.5) * 12, yy);
        ctx.lineTo(x, y); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
  // altares
  if (room.altars?.length) {
    const p = world.player;
    for (const al of room.altars) {
      const x = SX(al.x), y = SY(al.y);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(x, y + 8, 13, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = al.used ? '#3d3358' : '#544878';
      ctx.fillRect(x - 9, y - 10, 18, 18);
      ctx.fillStyle = al.used ? '#241f38' : '#2a2340';
      ctx.fillRect(x - 7, y - 8, 14, 14);
      font(10); ctx.textAlign = 'center';
      // Color/glifo por kind, con FALLBACK para altares-evento (traen su propio glifo/color).
      ctx.fillStyle = al.used ? '#5a5470' : (al.color ?? { corazon: '#e0556b', fusion: '#b678e8', metronomo: '#7ee8e0', apuesta: '#ffd54f' }[al.kind] ?? '#c9a24a');
      ctx.fillText(al.glifo ?? ({ corazon: '♥', fusion: '◇', metronomo: '△', apuesta: '◈' }[al.kind] ?? '?'), x, y + 3);
      if (!al.used && Math.hypot(p.x - al.x, p.y - al.y) < 26) {
        font(7); ctx.fillStyle = '#e9e2f5';
        const evDef = al.kind === 'evento' ? DataDB.eventos?.eventos?.find(e => e.id === al.evId) : null;
        const label = evDef ? ('ATAQUE: ' + (evDef.nombre ?? 'evento')) : {
          corazon: 'ATAQUE: 1 corazón → 1 engranaje',
          fusion: 'ATAQUE: 2 reliquias comunes → 1 rara',
          metronomo: 'ATAQUE: reto de ritmo → reliquia',
          apuesta: 'ATAQUE: apostar ' + DataDB.balance.camaras.apuesta_coste + ' oro'
        }[al.kind] ?? 'ATAQUE: interactuar';
        ctx.fillText(label, x, y - 18);
      }
    }
  }
  // Tuerca
  if (world.pet) {
    const x = SX(world.pet.x), y = SY(world.pet.y) - 4 + Math.sin(t * 6) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(SX(world.pet.x), SY(world.pet.y) + 4, 5, 2, 0, 0, 7); ctx.fill();
    const petSpr = Sprites.get('tuerca_mascota');
    if (petSpr) {
      // sprite pintado: hereda el bob; el cuerpo lleva ya el engranaje, ojos y patas
      const inf = Sprites.info('tuerca_mascota');
      const dh = 18, dw = Math.round(inf.w * dh / inf.h);
      ctx.drawImage(petSpr, Math.round(x - dw / 2), Math.round(y + 6 - dh), dw, dh);
    } else {
      ctx.strokeStyle = '#6c6193'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 2, y + 3); ctx.lineTo(x - 3, y + 7); ctx.moveTo(x + 2, y + 3); ctx.lineTo(x + 3, y + 7); ctx.stroke();
      ctx.fillStyle = '#c9a24a';
      for (let i = 0; i < 6; i++) {
        const a = t * 2 + i * Math.PI / 3;
        ctx.fillRect(x + Math.cos(a) * 5 - 1, y + Math.sin(a) * 5 - 1, 2.4, 2.4);
      }
      ctx.beginPath(); ctx.arc(x, y, 4.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#0b0819';
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill();
    }
  }
}

function spawnPickup(type, x, y, scatter = true) {
  const a = Math.random() * Math.PI * 2;
  const sp = scatter ? 40 + Math.random() * 50 : 0;
  world.pickups.push({ type, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 5, t: 0 });
}

function onEnterRoom(room, first) {
  world.player.onRoomEntered();
  if (first && room.type === 'tesoro') flash('Alcoba del tesoro');
  if (first && room.type === 'tienda') flash('Tienda', 'Toca un producto para comprarlo');
  if (first && room.type === 'maldita') flash('Alcoba maldita', 'La recompensa exige sangre');
  if (first && room.type === 'galeria') flash('Galería', 'Los engranajes vagan sueltos');
  if (first && room.type === 'fundicion') flash('La Fundición', 'Sacrificio a cambio de engranajes');
  if (first && room.type === 'metronomo') flash('Cámara del Metrónomo', 'Un reto de ritmo puro');
  if (first && room.type === 'apuestas') flash('El Reloj de Apuestas', 'El Gremio paga a los intachables');
  if (first && room.type === 'evento') { const ev = DataDB.eventos?.eventos?.find(e => e.id === room.altars?.[0]?.evId); flash(ev?.nombre ?? 'Un altar aguarda', ev?.desc ?? 'Acércate y decide'); }
  if (first) {
    for (const s of room.pickupSpots) if (Math.random() < 0.5) spawnPickup('coin', s.x, s.y, false);
  }
  if (room.type === 'jefe' && !room.cleared) { flash(DataDB.jefes?.jefes?.[room.bioma?.id]?.nombre ?? DataDB.biomas?.jefes_bioma?.[room.bioma?.id]?.nombre ?? 'Campanero Mayor'); AudioManager.bell(98, 0.12); }
}

// Cartas de mejora: rects compartidos por update (tap) y drawOverlay
function upgradeCardRect(i) {
  if (PORTRAIT) {
    const cw = 300, chh = 108;
    return { x: VW / 2 - cw / 2, y: 140 + i * (chh + 14), w: cw, h: chh };
  }
  const cw = 168, chh = 120;
  return { x: VW / 2 + (i - 1) * (cw + 16) - cw / 2, y: 130, w: cw, h: chh };
}

// Mejoras de piso: elegir 1 de 3 antes de descender
function rollUpgrades() {
  const all = [...DataDB.balance.mejoras_piso];
  const out = [];
  while (out.length < 3 && all.length) {
    out.push(all.splice(Math.floor(Math.random() * all.length), 1)[0]);
  }
  return out;
}
function applyUpgrade(u) {
  const p = world.player;
  RunState.mejoras.push(u.id);
  if (u.tipo === 'stat') {
    p.mods.statMult[u.stat] = (p.mods.statMult[u.stat] ?? 1) * (u.mult ?? 1);
    p.recomputeStats();
  } else if (u.tipo === 'corazon') {
    p.mods.statAdd.max_hp = (p.mods.statAdd.max_hp ?? 0) + 1;
    p.recomputeStats();
    p.health.hp = Math.min(p.health.max, p.health.hp + 2);
  } else if (u.tipo === 'sp_gain') {
    p.mods.spGainMult *= (u.mult ?? 1);
  }
  AudioManager.sfx('equip');
  flash(u.nombre, u.desc);
}

// Descenso de piso por la trampilla
function descendFloor() {
  RunState.piso++;
  if (RunState.piso > DataDB.balance.run.floors_total) {
    mode = 'victory';
    GameState.stats.victorias++;
    gainMemoria(DataDB.balance.meta.memoria_por_jefe);
    SaveManager.clearRun(); // run terminada: no hay nada que reanudar
    return;
  }
  floorMap = buildTower(RunState.piso, RunState.semilla);
  world.enemies = [...floorMap.roamers];
  world.pickups = [];
  world.tears.clear(); world.bullets.clear();
  cad.reset();
  placePlayerAtTop();
  floorMap.current.enter(world);
  world.player.onRoomEntered();
  RunState.resetFloorStats();
  hudHintT = DataDB.balance.ui?.hint_secs ?? 7;
  const bio = biomaDe(RunState.piso);
  if ((RunState.piso - 1) % 3 === 0 && bio) flash(bio.nombre.toUpperCase(), bio.sub);
  else flash('Piso ' + RunState.piso, 'La Torre desciende...');
  AudioManager.sfx('door_open');
  AudioManager.sample('sting_piso', 0.85); // stinger de descenso de piso
  autosaveRun(); // punto seguro: piso nuevo, sala inicial ya limpia
}

// ---------- B1: guardar/reanudar la run a mitad (localStorage 'mistveil_run') ----------
// La geometría es determinista en TOPOLOGÍA (buildTower con mulberry32 por piso^semilla),
// pero los INTERIORES (plantillas, item del pedestal, stock de tienda) usan Math.random,
// así que NO se reproducen exactos. Estrategia: regenerar la torre desde la semilla y
// restaurar solo los flags MUTABLES percibidos (salas limpias/visitadas, consumibles
// cogidos, corazones, build). El Player se RECONSTRUYE re-aplicando items (patrón fusión).
let prevAutoKey = null; // anti-repetición del autosave por cambio de sala

function buildSnapshot() {
  if (!floorMap || !world.player) return null;
  const p = world.player;
  const key = r => r.gx + ',' + r.gy;
  const rooms = [];
  for (const r of floorMap.rooms.values()) {
    const e = { k: key(r) };
    if (r.visited) e.v = 1;
    if (r.cleared) e.c = 1;
    if (r.looted) e.l = 1;
    if (r.pedestal?.taken) e.pt = 1;
    if (r.pedestal2?.taken) e.p2 = 1;
    if (r.stock) e.st = r.stock.map(s => (s.taken ? 1 : 0));
    if (r.altars?.length) e.al = r.altars.map(a => (a.used ? 1 : 0));
    if (Object.keys(e).length > 1) rooms.push(e); // solo salas con algo que restaurar
  }
  return {
    piso: RunState.piso, semilla: RunState.semilla, oro: RunState.oro, sp: RunState.sp,
    items: [...RunState.items], tomos: [...RunState.tomos], hechizo: RunState.hechizo,
    compas: RunState.compasRobado ?? RunState.compas, // resuelve el robo temporal del compás
    mejoras: [...RunState.mejoras], activoSalas: RunState.activoSalas,
    selloSpAcum: RunState.selloSpAcum, arteGratis: !!RunState.arteGratis,
    floorStats: RunState.floorStats ? { ...RunState.floorStats } : null,
    contrato: RunState.contrato ? { ...RunState.contrato } : null,
    hp: p.health.hp, maxHp: p.health.max,
    px: Math.round(p.x), py: Math.round(p.y), cur: key(floorMap.current), rooms
  };
}

// Guarda un punto de la run. No guarda en tutorial (su estado no se serializa) ni si el
// jugador está muerto o no hay torre. Se llama en puntos SEGUROS (sala limpia, descenso,
// pausa, cambio a sala no sellada) para no capturar un combate a medias.
function autosaveRun() {
  if (tut.active || !floorMap || !world.player || world.player.health.dead) return;
  const snap = buildSnapshot();
  if (snap) SaveManager.saveRun(snap);
}

function restoreSnapshot(snap) {
  // 1. RunState (GameState ya está cargado por SaveManager.load — cuerdaTensa/llave alteran el RNG del piso)
  RunState.reset();
  RunState.piso = snap.piso ?? 1;
  RunState.semilla = (snap.semilla ?? 0) >>> 0;
  RunState.oro = snap.oro ?? 0; RunState.sp = snap.sp ?? 0;
  RunState.items = Array.isArray(snap.items) ? [...snap.items] : [];
  RunState.tomos = (Array.isArray(snap.tomos) && snap.tomos.length) ? [...snap.tomos] : ['estallido_de_tinta'];
  RunState.hechizo = snap.hechizo ?? RunState.tomos[0];
  RunState.compas = snap.compas ?? 'tic_tac';
  RunState.mejoras = Array.isArray(snap.mejoras) ? [...snap.mejoras] : [];
  RunState.activoSalas = snap.activoSalas ?? 0;
  RunState.selloSpAcum = snap.selloSpAcum ?? 0;
  RunState.arteGratis = !!snap.arteGratis;
  if (snap.floorStats) RunState.floorStats = { ...RunState.floorStats, ...snap.floorStats };
  RunState.contrato = snap.contrato ?? null;
  RunState.bendiciones = []; // ya se consumieron en la run original

  // 2. Regenerar la torre (determinista en topología)
  floorMap = buildTower(RunState.piso, RunState.semilla);

  // 3. Restaurar los flags mutables percibidos de cada sala
  const byKey = new Map((snap.rooms || []).map(e => [e.k, e]));
  for (const r of floorMap.rooms.values()) {
    const e = byKey.get(r.gx + ',' + r.gy);
    if (!e) continue;
    if (e.v) r.visited = true;
    if (e.c) { r.cleared = true; r.sealed = false; for (const d of Object.values(r.doors)) if (d) d.open = true; }
    if (e.l) r.looted = true;
    if (e.pt && r.pedestal) r.pedestal.taken = true;
    if (e.p2 && r.pedestal2) r.pedestal2.taken = true;
    if (e.st && r.stock) e.st.forEach((v, i) => { if (v && r.stock[i]) r.stock[i].taken = true; });
    if (e.al && r.altars) e.al.forEach((v, i) => { if (v && r.altars[i]) r.altars[i].used = true; });
  }

  // 4. Reconstruir el Player desde los items (mods derivados, NO serializados)
  const p = new Player(0, 0); world.player = p;
  if (GameState.tiene('recuerdo_de_cuerda')) p.mods.statAdd.max_hp = (p.mods.statAdd.max_hp ?? 0) + 1; // bono pasivo del Santuario
  RunState.items = [];
  for (const id of (snap.items || [])) { const it = DataDB.item(id); if (it) applyItem(it, p); } // re-puebla RunState.items + mods
  p.applyBalance();
  p.health.max = snap.maxHp ?? p.health.max;               // corazones exactos (cubre deltas de altar/pan fuera de items)
  p.health.hp = Math.max(1, Math.min(snap.hp ?? p.health.max, p.health.max));

  // 5. Mundo, roamers (los de galerías YA visitadas se dan por limpiados) y colocación
  world.enemies = floorMap.roamers.filter(e => !e.room?.visited);
  world.pickups = []; world.dmgNumbers = []; world.shockwaves = [];
  world.tears.clear(); world.bullets.clear();
  cad.reset();
  freezeT = 0; hitStopT = 0; slowmoT = 0; nearmissCd = 0;
  world.familiares = []; world.trails = []; world.artFx = [];
  pendingUpgrades = null;
  const [cgx, cgy] = snap.cur ? snap.cur.split(',').map(Number) : [1, 0];
  const curRoom = floorMap.at(cgx, cgy) ?? floorMap.current;
  floorMap.current = curRoom; cur = curRoom; curRoom.visited = true;
  p.x = snap.px ?? (curRoom.bounds.x + curRoom.bounds.w / 2);
  p.y = snap.py ?? (curRoom.bounds.y + curRoom.bounds.h / 2);
  p.vx = p.vy = 0;
  const [gx, gy] = camGoal(); cam.x = gx; cam.y = gy;
  world.player.onRoomEntered();
  prevAutoKey = curRoom.gx + ',' + curRoom.gy;
  musicaActual = null; // el director repone la pista del bioma
  mode = 'play';
  hudHintT = 0;
}

// Reanuda la partida guardada; si no hay o falla, empieza una run nueva.
function resumeRun() {
  const snap = SaveManager.loadRun();
  if (!snap) { newRun(); return false; }
  try {
    restoreSnapshot(snap);
    flash('Partida reanudada', 'Piso ' + RunState.piso + ' — el Reloj sigue su marcha');
    return true;
  } catch (err) {
    console.warn('resumeRun: snapshot corrupto, empiezo run nueva', err);
    SaveManager.clearRun();
    newRun();
    return false;
  }
}

// ---------- Balance del piso: XP por desempeño al pisar la trampilla (estilo FFX) ----------
function computeFloorXP() {
  const c = DataDB.balance.xp, fs = RunState.floorStats;
  const rows = [
    ['Descenso del piso ' + RunState.piso, c.base_piso + (RunState.piso - 1) * c.por_piso_extra],
    ['Bajas × ' + fs.kills, fs.kills * c.por_kill],
    ['Perfectos × ' + fs.perfects, fs.perfects * c.por_perfect],
    ['Buenos × ' + fs.goods, fs.goods * c.por_good],
    ['Paradas × ' + fs.parries, fs.parries * c.por_parry],
    ['Cámaras limpiadas × ' + fs.salas, fs.salas * c.por_sala],
    ['Corazones perdidos × ' + fs.corazones, -fs.corazones * c.castigo_corazon]
  ].filter(r => r[1] !== 0 || r[0].startsWith('Descenso'));
  const bruto = rows.reduce((s, r) => s + r[1], 0);
  const total = Math.max(c.minimo, Math.round(bruto * esferaBonos().xp));
  return { rows, total };
}

function openFloorBalance() {
  const res = computeFloorXP();
  const niveles = ganarXP(res.total);
  const unlocks = [];
  for (let n = GameState.nivel - niveles + 1; n <= GameState.nivel; n++) unlocks.push(...desbloqueosEnNivel(n));
  // Contrato del Gremio: se evalúa al cerrar el piso 1
  let contrato = null;
  if (RunState.contrato && RunState.piso === 1) {
    const fs = RunState.floorStats, c = RunState.contrato;
    const ok = c.id === 'templanza' ? fs.corazones <= 2 : c.id === 'virtuoso' ? fs.perfects >= 6 : fs.parries >= 2;
    const CB = DataDB.balance.contratos;
    if (ok) { GameState.engranajes += CB.premio_engranajes; GameState.memoria += CB.premio_memoria; }
    contrato = { nombre: c.nombre, ok };
    RunState.contrato = null;
  }
  SaveManager.save();
  pendingBalance = { ...res, niveles, unlocks, contrato, nivel: GameState.nivel, reveal: 0, t: 0 };
  mode = 'balance';
  AudioManager.sfx('clear');
}

function updateBalanceScreen(dt) {
  const pb = pendingBalance;
  pb.t += dt;
  const steps = pb.rows.length + 2 + (pb.niveles ? 1 : 0);
  const target = Math.floor(pb.t / 0.3);
  if (target > pb.reveal && pb.reveal < steps) {
    pb.reveal++;
    AudioManager.beep(660 + pb.reveal * 55, 0.045, 'triangle', 0.045);
    if (pb.reveal === pb.rows.length + 1) AudioManager.sfx('gold');
    if (pb.niveles && pb.reveal >= steps) AudioManager.sfx('equip');
  }
  const tap = Input.touchState().enabled && Input.justCode('TouchTap');
  if (Input.justCode('Enter') || Input.justPressed('melee') || tap) {
    if (pb.reveal < steps) { pb.reveal = steps; AudioManager.sfx('gold'); return; }
    pendingBalance = null;
    if (RunState.piso >= DataDB.balance.run.floors_total) { descendFloor(); return; }
    pendingUpgrades = rollUpgrades();
    upgradeIdx = 0;
    mode = 'upgrade';
  }
}

function drawBalanceScreen() {
  ctx.fillStyle = 'rgba(8,5,16,0.9)'; ctx.fillRect(0, 0, VW, VH);
  const pb = pendingBalance;
  if (!pb) return;
  const w = Math.min(340, VW - 40), x = VW / 2 - w / 2;
  let y = VH / 2 - 96;
  ctx.textAlign = 'center';
  font(14); ctx.fillStyle = '#ffd54f';
  ctx.fillText('BALANCE DEL PISO ' + RunState.piso, VW / 2, y); y += 8;
  ctx.strokeStyle = 'rgba(255,213,79,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke(); y += 16;
  font(9);
  for (let i = 0; i < Math.min(pb.reveal, pb.rows.length); i++) {
    const [label, val] = pb.rows[i];
    ctx.textAlign = 'left'; ctx.fillStyle = '#b9aee0'; ctx.fillText(label, x, y);
    ctx.textAlign = 'right'; ctx.fillStyle = val >= 0 ? '#e9e2f5' : '#e0556b';
    ctx.fillText((val >= 0 ? '+' : '') + val, x + w, y);
    y += 15;
  }
  if (pb.reveal > pb.rows.length) {
    y += 2;
    ctx.strokeStyle = 'rgba(200,190,230,0.3)';
    ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + w, y - 8); ctx.stroke();
    font(11); ctx.textAlign = 'left'; ctx.fillStyle = '#ffd54f'; ctx.fillText('EXPERIENCIA', x, y + 5);
    ctx.textAlign = 'right'; ctx.fillText('+' + pb.total + ' XP', x + w, y + 5);
    y += 24;
  }
  const steps = pb.rows.length + 2 + (pb.niveles ? 1 : 0);
  if (pb.contrato && pb.reveal > pb.rows.length) {
    // La recompensa va en su propia línea: junta se salía del ancho de pantalla.
    font(9); ctx.textAlign = 'center';
    ctx.fillStyle = pb.contrato.ok ? '#7ec96b' : '#e0556b';
    ctx.fillText('CONTRATO ' + (pb.contrato.ok ? 'CUMPLIDO' : 'FALLIDO') + ': ' + pb.contrato.nombre, VW / 2, y + 6);
    y += 14;
    if (pb.contrato.ok) {
      font(8); ctx.fillStyle = '#7ec96b';
      ctx.fillText('+1 engranaje · +15 ◆', VW / 2, y + 3);
      y += 14;
    }
  }
  if (pb.niveles && pb.reveal >= steps) {
    font(12); ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
    ctx.fillText('¡NIVEL ' + pb.nivel + '!  +' + pb.niveles + ' engranaje' + (pb.niveles > 1 ? 's' : ''), VW / 2, y + 4);
    font(8); ctx.fillStyle = '#8d82ad';
    ctx.fillText('Gástalo en la Esfera del Reloj (Tab)', VW / 2, y + 20);
    y += 34;
    for (const u of pb.unlocks ?? []) {
      const l = etiqueta(u);
      font(9); ctx.fillStyle = '#7ee8e0';
      ctx.fillText('DESBLOQUEADO: ' + l.titulo, VW / 2, y);
      y += 14;
    }
    y += 12;
  }
  if (pb.reveal >= steps) {
    font(9); ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(141,130,173,${0.6 + Math.sin(performance.now() / 300) * 0.4})`;
    ctx.fillText(RunState.piso >= DataDB.balance.run.floors_total ? 'Enter: concluir el descenso' : 'Enter: elegir mejora y descender', VW / 2, VH / 2 + 100);
  }
}

// ---------- Señales ----------
const PALETTES = {
  cera_andante: ['#e8d5a3', '#b7a578', '#fff2cf'],
  tejedor_horas: ['#c69a58', '#77603f', '#f0e0b8'],
  engranaje_errante: ['#aeb8ce', '#6d7690', '#e8edf8'],
  velon_inestable: ['#f0e6d0', '#5aa7e8', '#ffffff'],
  campanero: ['#b08d57', '#6d5636', '#ffd54f'],
  badajo_errante: ['#b08d57', '#6d5636', '#c99cf0'],
  girandula: ['#c9a24d', '#77603f', '#8fdc8f'],
  remora_de_tinta: ['#3949AB', '#20204a', '#8f98e0'],
  peon_de_sebo: ['#e8d5a3', '#b7a578', '#ff9c6a'],
  cimbalo: ['#c9a24d', '#6d5636', '#c99cf0'],
  saltahoras: ['#6a5a9a', '#2a2450', '#c9a0f0'],
  broquel: ['#b08d57', '#6d5636', '#d8b877'],
  cumulo_de_sebo: ['#e8d5a3', '#b7a578', '#ff9c6a'],
  restaurador: ['#cfe8b0', '#8fb070', '#e0ffc8']
};
const TAG_COLORS = {
  lagrimas: '#7f96d8', stats: '#7ec98f', cadencia: '#ffd54f',
  ignicion: '#b678e8', movilidad: '#7ee8e0', activo: '#ff9c3a'
};
EventBus.on('enemy_died', (e) => {
  if (world.player) world.player.addGroove(DataDB.balance.groove?.por_kill ?? 0); // racha (G7c)
  const pal = PALETTES[e.id] ?? ['#9E9E9E', '#666', '#fff'];
  FX.burst(e.x, e.y, { n: 16, color: pal[0], speed: 130, life: 0.6, size: 3, gravity: 180 });
  FX.burst(e.x, e.y, { n: 8, color: pal[2], speed: 70, life: 0.4, size: 2, glow: true });
  FX.addShake(1.2);
  hitStopT = Math.max(hitStopT, 0.03);
  // Los vagabundos de galería sueltan calderilla a veces
  if (e.room?.type === 'galeria' && Math.random() < 0.4) spawnPickup('coin', e.x, e.y);
  // Élite (minijefe): botín garantizado — oro + espíritu, y opción de corazón. Compensa
  // el riesgo extra sin regalar sostén (el % de corazón es tunable).
  if (e.elite) {
    const E = DataDB.balance.elite ?? {};
    RunState.oro += (E.recompensa_oro ?? 6);
    RunState.sp = Math.min(DataDB.balance.ignicion.sp_max, RunState.sp + (E.recompensa_sp ?? 10));
    AudioManager.sfx('gold'); FX.addShake(2.4);
    FX.burst(e.x, e.y, { n: 16, color: '#ffd54f', speed: 130, life: 0.6, size: 2.5, glow: true });
    if (Math.random() * 100 < (E.recompensa_corazon_pct ?? 24)) spawnPickup('heart', e.x, e.y);
    flash('¡Élite abatido!', '+' + (E.recompensa_oro ?? 6) + ' oro · el alma se enciende');
  }
  // Los caídos dejan mecha: el Cerero Errante puede reavivarlos
  if (!e.def.jefe) world.corpses.push({ id: e.id, x: e.x, y: e.y, hp: e.def.hp, t: 11 });
  // Núcleos que se DIVIDEN: al morir sueltan crías (gestión de multitud)
  if (e.def.divide && world.enemies) {
    const { hijo, n = 2, hp } = e.def.divide;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.6;
      const c = new Enemy(hijo, e.x + Math.cos(a) * 12, e.y + Math.sin(a) * 12, hp ? { hp } : {});
      c.room = e.room; world.enemies.push(c);
    }
    EventBus.emit('enemy_spawned', e.x, e.y);
  }
});
EventBus.on('gemelo_enfurecido', () => flash('¡El gemelo superviviente enloquece!'));
EventBus.on('enemigo_reavivado', (rev) => flash('El Cerero reaviva a ' + rev.def.nombre, 'Mátalo primero...'));
// Firmas de las mecánicas nuevas
EventBus.on('enemy_blink', (x, y) => FX.burst(x, y, { n: 10, color: '#b98fd0', speed: 90, life: 0.3, size: 2, glow: true }));
EventBus.on('escudo_bloqueo', (x, y) => { FX.burst(x, y, { n: 5, color: '#e8e2c8', speed: 70, life: 0.2, size: 1.5, spread: 1.2 }); AudioManager.beep(300, 0.05, 'square', 0.025); });
EventBus.on('enemy_curado', (x, y) => FX.burst(x, y - 4, { n: 4, color: '#8fdc8f', speed: 40, life: 0.5, size: 1.5, glow: true, gravity: -60 }));
// Jefes de raid (js/jefes.js): cambio de fase, invocaciones y golpe de mecánica
EventBus.on('jefe_fase', (n, nombre) => { flash(nombre + ' — FASE ' + n, 'La mecánica cambia'); FX.addShake(3); AudioManager.bell?.(120, 0.2); });
EventBus.on('jefe_adds', (quien, n, x, y) => {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const e = new Enemy(quien, x + Math.cos(a) * 32, y + Math.sin(a) * 32);
    e.room = floorMap.current; world.enemies.push(e);
  }
  flash('¡El jefe invoca refuerzos!');
  AudioManager.sfx?.('enemy_spawn');
});
EventBus.on('jefe_golpe', () => FX.addShake(2));
// FIRMA ARCHIVERA: descarga de orbes de tinta telegrafiados (los lanza el director)
EventBus.on('jefe_proyectiles', (angs, cx, cy, dano, color, vel) => {
  for (const a of angs) world.bullets.spawn({ x: cx, y: cy, vx: Math.cos(a) * (vel ?? 160), vy: Math.sin(a) * (vel ?? 160), damage: dano ?? 1, color: color || '#5c6bc0' });
  AudioManager.sfx?.('cast_onda'); FX.addShake(1);
});
// FIRMA RELOJERO: roba el compás un rato (reconecta la mecánica legacy roba_compas)
EventBus.on('jefe_roba_compas', (dur = 6) => {
  if (RunState.compasRobado || RunState.compas === 'tic_tac') return; // no hay nada que robar
  RunState.compasRobado = RunState.compas;
  RunState.compas = 'tic_tac';
  flash('¡El Relojero te roba el compás!', 'Lo recuperas en unos segundos');
  AudioManager.sfx?.('cad_fail');
  setTimeout(() => { if (RunState.compasRobado) { RunState.compas = RunState.compasRobado; RunState.compasRobado = null; flash('Recuperas tu compás'); } }, dur * 1000);
});
EventBus.on('sinergia', (a, b) => flash('SINERGIA: ' + a, b));
// El Primer Relojero: roba tu compás en su primera campanada; se recupera con su derrota
EventBus.on('boss_campanada', (e) => {
  if (e.def.roba_compas && !RunState.compasRobado && RunState.compas !== 'tic_tac') {
    RunState.compasRobado = RunState.compas;
    RunState.compas = 'tic_tac';
    flash('¡El Relojero te roba el compás!', 'Derrótalo para recuperarlo');
  }
  // Archivera Anegada: cada campanada entinta el suelo
  if (e.def.entinta && e.room) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 60;
      const b = e.room.bounds;
      const x = Math.min(Math.max(e.x + Math.cos(a) * d, b.x + 8), b.x + b.w - 40);
      const y = Math.min(Math.max(e.y + Math.sin(a) * d, b.y + 8), b.y + b.h - 40);
      e.room.tinta.push({ x, y, w: 32, h: 32 });
    }
  }
});
EventBus.on('enemy_died', (e) => {
  if (e.def.roba_compas && RunState.compasRobado) {
    RunState.compas = RunState.compasRobado; RunState.compasRobado = null;
    flash('Recuperas tu compás', 'El Relojero lo suelta al caer');
  }
});
// Reloj de Apuestas: sin fallos y sin daño en la siguiente cámara sellada
EventBus.on('room_sealed', (room) => {
  if (RunState.apuesta?.armed) RunState.apuesta = { tracking: true, room, fails: 0, hurt: false };
});
EventBus.on('player_hurt', () => { if (RunState.apuesta?.tracking) RunState.apuesta.hurt = true; });
EventBus.on('room_cleared', (room) => {
  const a = RunState.apuesta;
  if (a?.tracking && a.room === room) {
    const C = DataDB.balance.camaras;
    if (!a.fails && !a.hurt) { RunState.oro += C.apuesta_premio; AudioManager.sfx('gold'); flash('¡APUESTA GANADA!', '+' + C.apuesta_premio + ' oro del Gremio'); }
    else flash('Apuesta perdida...', a.hurt ? 'te han tocado' : 'un golpe a destiempo');
    RunState.apuesta = null;
  }
});
EventBus.on('enemy_windup', (e) => {
  pushPopup(e.x, e.y - e.r - 10, '!', '#ff6b5e', 12);
  AudioManager.noise(0.16, 700, 0.032, 350);
});
// Aviso de disparo a distancia: rombo tenue del color de la familia sobre la cabeza
EventBus.on('enemy_cast', (e) => {
  const c = { cera: '#ff9d5c', laton: '#ffd54f', polvo: '#b98fd0' }[e.def.familia] ?? '#ff9d5c';
  pushPopup(e.x, e.y - e.r - 9, '◆', c, 9);
});
// Impacto del golpe de melé (antes SIN feedback): fogonazo de partículas + micro-shake
EventBus.on('enemy_strike', (e) => {
  const c = { cera: '#ff9d5c', laton: '#ffd54f', polvo: '#b98fd0' }[e.def.familia] ?? '#ff6b5e';
  FX.burst(e.x, e.y, { n: 6, color: c, speed: 130, life: 0.22, size: 2, glow: true });
  FX.addShake(1);
});
EventBus.on('enemy_spawned', (x, y) => {
  FX.burst(x, y, { n: 10, color: '#8f86ad', speed: 60, life: 0.5, size: 2, glow: true });
});
EventBus.on('enemy_exploded', (x, y, r) => {
  world.shockwaves.push({ x, y, r0: 6, r1: r, t: 0.3, tmax: 0.3, color: '#5aa7e8' });
  FX.burst(x, y, { n: 22, color: '#5aa7e8', speed: 170, life: 0.5, size: 2.5, glow: true });
  FX.addShake(3);
  for (const room of activeRooms()) {
    for (const w of [...room.wax]) {
      const wx = w.x + w.w / 2, wy = w.y + w.h / 2;
      if (Math.hypot(wx - x, wy - y) < r + 16) room.breakWax(w);
    }
  }
});
EventBus.on('room_cleared', (room) => {
  AudioManager.sfx('clear');
  flash(t9('ui.sala_limpia'));
  const run = DataDB.balance.run;
  const cx = room.bounds.x + room.bounds.w / 2, cy = room.bounds.y + room.bounds.h / 2;
  if (room.type === 'jefe') {
    flash(t9('ui.victoria_provisional'));
    // Trampilla apartada del botín (al sur) para no tragársela al ir a por el loot
    room.trapdoor = { x: cx, y: cy + Math.min(56, room.bounds.h / 2 - 36), r: 12, dwell: 0 };
    gainMemoria(DataDB.balance.meta.memoria_por_jefe);
    const tomoNuevo = DataDB.hechizos.hechizos.find(h => !RunState.tomos.includes(h.id));
    if (tomoNuevo) spawnPickup('tomo:' + tomoNuevo.id, cx - 34, cy - 20);
    const it = rollItem('jefe');
    if (it) spawnPickup('item:' + it.id, cx + 34, cy - 20);
    // Sello elemental del jefe de bioma (R2): botín único, solo la primera vez
    const selloId = DataDB.jefes?.jefes?.[room.bioma?.id]?.sello ?? DataDB.biomas?.jefes_bioma?.[room.bioma?.id]?.sello;
    if (selloId && selloDef(selloId)?.estado === 'activo' && !GameState.sellosObtenidos.includes(selloId)) {
      spawnPickup('sello:' + selloId, cx, cy - 40);
    }
    for (let i = 0; i < 3; i++) spawnPickup('coin', cx, cy + 26);
    return;
  }
  if (Math.random() * 100 < run.drop_oro_pct) {
    const n = run.oro_min + Math.floor(Math.random() * (run.oro_max - run.oro_min + 1));
    for (let i = 0; i < n; i++) spawnPickup('coin', cx, cy);
  }
  if (Math.random() * 100 < run.drop_corazon_pct) spawnPickup('heart', cx, cy);
  if (Math.random() * 100 < (run.drop_tomo_pct ?? 0)) {
    const tomoNuevo = DataDB.hechizos.hechizos.find(h => !RunState.tomos.includes(h.id));
    if (tomoNuevo) spawnPickup('tomo:' + tomoNuevo.id, cx, cy - 14);
  }
  if (room.type === 'maldita') {
    const it = rollItem('tesoro');
    if (it) spawnPickup('item:' + it.id, cx, cy - 14);
    gainMemoria(DataDB.balance.meta.memoria_por_reto);
  }
});
EventBus.on('player_hurt', () => {
  const p = world.player;
  hurtFlashT = 0.35;
  FX.burst(p.x, p.y, { n: 12, color: '#d8454f', speed: 110, life: 0.5, size: 2 });
  FX.addShake(3.5);
});
EventBus.on('player_died', () => {
  mode = 'dead'; GameState.stats.muertes++;
  SaveManager.clearRun(); // muerte permanente: la run no se reanuda
  // La Torre recuerda: media experiencia aunque caigas
  const res = computeFloorXP();
  const xp = Math.max(5, Math.round(res.total * DataDB.balance.xp.muerte_mult));
  const niveles = ganarXP(xp);
  lastDeathXP = { xp, niveles, nivel: GameState.nivel };
  SaveManager.save(); FX.addShake(5);
});
EventBus.on('tear_fired', (x, y, dx, dy) => {
  FX.burst(x, y, { n: 3, color: '#bcd0ff', speed: 40, life: 0.18, size: 1.5, glow: true, spread: 1.2, dir: Math.atan2(dy, dx) });
});
EventBus.on('wax_broken', (w) => {
  FX.burst(w.x + w.w / 2, w.y + w.h / 2, { n: 14, color: '#e8dfc8', speed: 100, life: 0.5, size: 2.5, gravity: 200 });
});
EventBus.on('cadencia_hit', ({ x, y, quality, dmg, finisher, hitIndex }) => {
  // Háptica acorde: perfect = golpe seco, good = leve, fail = zumbido de error.
  // + micro hit-stop en perfect/finisher: el mundo "acusa" tu golpe.
  Input.vibrar?.(quality === 'perfect' ? 24 : quality === 'good' ? 10 : [45, 30, 25]);
  if (quality === 'perfect') freezeT = Math.max(freezeT, finisher ? 0.09 : 0.045);
  // Firma de la Cadencia perfecta: el numeral romano del golpe SALTA en dorado,
  // como los tiempos de una esfera de reloj marcándose uno a uno.
  if (quality === 'perfect') {
    pushPopup(x - 12, y - 30, romano((hitIndex ?? 0) + 1), '#ffe9a8', 16);
  }
  const p = world.player;
  const ddx = x - p.x, ddy = y - p.y;
  const dl = Math.hypot(ddx, ddy) || 1;
  p.attackAnim = { t: 0.2, tmax: 0.2, dir: [ddx / dl, ddy / dl], finisher, quality };
  const conf = {
    perfect: { txt: t9('ui.cad_perfecta'), col: '#ffd54f', n: 10 },
    good: { txt: t9('ui.cad_buena'), col: '#e9e2f5', n: 5 },
    fail: { txt: t9('ui.cad_fallo'), col: '#8d82ad', n: 2 }
  }[quality];
  pushPopup(x, y - 22, conf.txt, conf.col, quality === 'perfect' ? 11 : 9);
  if (dmg > 0) pushPopup(x + 10, y - 10, String(dmg), '#f4f0e6');
  FX.burst(x, y, { n: conf.n, color: conf.col, speed: 90, life: 0.4, size: 2, glow: quality === 'perfect' });
  if (quality === 'perfect') { FX.addShake(1); hitStopT = Math.max(hitStopT, 0.045); }
  // Groove/racha (G7c): encadenar buenos golpes sube la barra
  const gg = DataDB.balance.groove;
  if (gg && world.player) world.player.addGroove(quality === 'perfect' ? gg.por_perfect : quality === 'good' ? gg.por_good : 0);
  if (finisher) {
    pushPopup(x, y - 34, t9('ui.finisher'), '#ff9c3a', 12);
    world.shockwaves.push({ x, y, r0: 8, r1: DataDB.balance.cadencia.finisher_aoe_radius_px, t: 0.28, tmax: 0.28, color: '#ffd54f' });
    // Sello elemental (R2): el finisher lanza además una onda del elemento
    const fx = finisherElemental();
    if (fx) {
      const col = DataDB.elementos[fx.elemento]?.color ?? '#e9e2f5';
      world.shockwaves.push({ x, y, r0: 10, r1: fx.radio_px, t: 0.34, tmax: 0.34, color: col });
      const p2 = world.player;
      for (const e of world.enemies) {
        if (e.health.dead || Math.hypot(e.x - x, e.y - y) > fx.radio_px + e.r) continue;
        e.takeDamage(p2.stats.melee_damage * fx.dano_mult * elementMult(e.def.elemento, fx.elemento), x, y,
          (fx.empuje ?? 0) / DataDB.balance.player.tear_knockback_px_s);
        if (fx.quema) e.burn = { t: DataDB.balance.hechizos.quema_duracion_s };
        if (fx.lento_s) e.slowT = Math.max(e.slowT ?? 0, fx.lento_s);
      }
      FX.burst(x, y, { n: 14, color: col, speed: 130, life: 0.5, size: 2, glow: true });
    }
    FX.addShake(2.5);
    hitStopT = Math.max(hitStopT, 0.09);
  }
});
EventBus.on('room_cleared', () => autosaveRun()); // B1: punto seguro de guardado (sala recién limpiada)
EventBus.on('cadencia_early', (x, y) => pushPopup(x, y - 24, 'aún no...', '#8d82ad', 8));
EventBus.on('cadencia_counter_started', (e) => {
  inputBuf.melee = 0; // un melé bufado de antes no debe fallar el contraataque
  Input.vibrar?.([12, 50, 12]); // doble pulso: ¡ojo, anillo rojo!
  pushPopup(e.x, e.y - 26, t9('ui.cad_contra'), '#ff3b30', 11);
});
EventBus.on('cadencia_parried', (e) => {
  Input.vibrar?.([10, 20, 30]);
  freezeT = Math.max(freezeT, 0.07);
  if (world.player) world.player.addGroove(DataDB.balance.groove?.por_parry ?? 0); // racha (G7c)
  pushPopup(e.x, e.y - 26, t9('ui.cad_parry'), '#7ee8e0', 11);
  spawnArt(world.artFx, 'campana_cristal', e.x, e.y, { tmax: 0.4, r: 32, color: '#aef4ec' });
});
EventBus.on('cadencia_whiff', (x, y) => {
  AudioManager.beep(420, 0.06, 'triangle', 0.03, -120);
  FX.burst(x, y, { n: 4, color: '#8d82ad', speed: 60, life: 0.2, size: 1.5, spread: 1.6 });
});
EventBus.on('cadencia_auto_parried', (e) => {
  pushPopup(e.x, e.y - 26, t9('ui.cad_parry') + ' (campana rasgada)', '#7ee8e0', 10);
  world.shockwaves.push({ x: e.x, y: e.y, r0: 4, r1: 30, t: 0.2, tmax: 0.2, color: '#7ee8e0' });
});
EventBus.on('sala_congelada', (s) => {
  freezeT = Math.max(freezeT, s);
  flash('¡El tiempo se detiene!');
});
EventBus.on('armor_absorbed', (p) => {
  pushPopup(p.x, p.y - 18, '¡Absorbido!', '#c9d2ff', 10);
  world.shockwaves.push({ x: p.x, y: p.y, r0: 6, r1: 22, t: 0.2, tmax: 0.2, color: '#c9d2ff' });
});
EventBus.on('item_equipado', (it) => flash(it.nombre, it.descripcion));
EventBus.on('sinergia_activada', (syn) => flash('SINERGIA: ' + syn.nombre, syn.regla));
EventBus.on('hechizo_lanzado', (h, x, y) => {
  if (world.player) world.player.castT = 0.34; // pose de Arte mientras canaliza (visual)
  // A4 — cada Arte tiene su firma dibujada, reconocible de un vistazo
  const color = DataDB.elementos[h.elemento]?.color ?? '#bcd0ff';
  const aim = Math.atan2(world.player.aim.y, world.player.aim.x);
  if (h.tipo === 'nova') {
    // Corona de tinta índigo: gotas que estallan en radial
    spawnArt(world.artFx, 'corona_tinta', x, y, { tmax: 0.5, r: (h.params.alcance_px ?? 90) * 0.5, color: '#3949AB' });
    FX.burst(x, y, { n: 10, color: '#5c6bc0', speed: 90, life: 0.4, size: 2, glow: true });
    AudioManager.beep(520, 0.14, 'triangle', 0.05, 180);
  } else if (h.tipo === 'onda') {
    // Medialuna de espuma turquesa que barre hacia el aim
    spawnArt(world.artFx, 'medialuna_espuma', x, y, { tmax: 0.42, r: h.params.radio_px, dir: aim, color: '#4FC3F7' });
    world.shockwaves.push({ x, y, r0: 10, r1: h.params.radio_px, t: 0.3, tmax: 0.3, color });
  } else if (h.tipo === 'cono') {
    // Abanico de rescoldos que caen y prenden
    spawnArt(world.artFx, 'abanico_rescoldos', x, y, { tmax: 0.55, r: h.params.alcance_px, dir: aim, color: '#E4572E' });
    FX.burst(x + world.player.aim.x * 24, y + world.player.aim.y * 24,
      { n: 16, color: '#ff9c3a', speed: 150, life: 0.4, size: 2, glow: true, spread: (h.params.angulo_deg ?? 75) * Math.PI / 180, dir: aim, gravity: 120 });
  } else {
    world.shockwaves.push({ x, y, r0: 6, r1: 34, t: 0.2, tmax: 0.2, color });
    FX.burst(x, y, { n: 12, color, speed: 120, life: 0.4, size: 2, glow: true });
  }
  FX.addShake(1.5);
});
EventBus.on('hechizo_sin_sp', (h) => {
  pushPopup(world.player.x, world.player.y - 20, 'SP insuficiente (' + h.coste_sp + ')', '#e07a7a', 9);
});
// --- Jefe: campanadas e invocación ---
EventBus.on('boss_campanada', (e) => {
  const R = 92;
  world.shockwaves.push({ x: e.x, y: e.y, r0: 12, r1: R, t: 0.35, tmax: 0.35, color: '#ffd54f' });
  world.shockwaves.push({ x: e.x, y: e.y, r0: 6, r1: R * 0.7, t: 0.3, tmax: 0.3, color: '#b08d57' });
  FX.burst(e.x, e.y, { n: 18, color: '#ffd54f', speed: 150, life: 0.5, size: 2, glow: true });
  FX.addShake(4);
  AudioManager.beep(140, 0.6, 'sine', 0.1, -30);
  AudioManager.beep(280, 0.4, 'triangle', 0.05, -60);
  const p = world.player;
  if (Math.hypot(p.x - e.x, p.y - e.y) < R + p.hurtR) p.hurt(1, e.x, e.y);
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5;
    world.bullets.spawn({ x: e.x, y: e.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, damage: 1, color: '#c7a266' });
  }
});
EventBus.on('boss_summon', (e) => {
  flash('¡El Campanero convoca!');
  for (const off of [[-50, 20], [50, 20]]) {
    const x = e.x + off[0], y = e.y + off[1];
    const v = new Enemy('velon_inestable', x, y);
    v.room = e.room;
    world.enemies.push(v);
    EventBus.emit('enemy_spawned', x, y);
  }
});
// --- Ignición ---
// Ignición en TRES ACTOS (dirección de arte): estallido → arder → serenarse.
EventBus.on('ignicion_started', (p) => {
  flash('¡IGNICIÓN!', 'El alma de Pip arde sin cera');
  AudioManager.sample('sting_ignicion', 0.9); // stinger del encendido del alma
  // Acto 1 — el estallido: el mundo se detiene un instante y estalla en oro
  for (const [r1, dt2, col] of [[70, 0.35, '#fff3d6'], [110, 0.5, '#ffd54f'], [150, 0.65, '#ffb547']]) {
    world.shockwaves.push({ x: p.x, y: p.y, r0: 8, r1, t: dt2, tmax: dt2, color: col });
  }
  FX.burst(p.x, p.y, { n: 34, color: '#ffb547', speed: 170, life: 0.7, size: 2.5, glow: true, gravity: -60 });
  FX.burst(p.x, p.y, { n: 16, color: '#fff3d6', speed: 240, life: 0.4, size: 1.8, glow: true });
  FX.addShake(6);
  // Tres campanadas ascendentes: el Reloj reconoce la llama
  AudioManager.bell(392, 0.09);
  setTimeout(() => AudioManager.bell(523, 0.1), 130);
  setTimeout(() => AudioManager.bell(784, 0.12), 280);
  AudioManager.beep(330, 0.5, 'sawtooth', 0.05, 660);
  hitStopT = Math.max(hitStopT, 0.22);
  ignicionFlashT = 0.7;
});
EventBus.on('ignicion_ended', (p) => {
  // Acto 3 — serenarse: lluvia de brasas que caen y campana grave
  FX.burst(p.x, p.y - 8, { n: 26, color: '#ffb547', speed: 70, life: 0.9, size: 2, glow: true, gravity: 90 });
  FX.burst(p.x, p.y, { n: 12, color: '#8d82ad', speed: 50, life: 0.6, size: 2, gravity: 60 });
  AudioManager.bell(131, 0.1);
  AudioManager.beep(440, 0.3, 'sine', 0.05, -300);
});
EventBus.on('data_reloaded', () => { world.player?.applyBalance(); flash('Datos recargados (F5)'); });

// ---------- Crónica del piso: alimenta el XP del Balance (trampilla) ----------
EventBus.on('cadencia_hit', ({ quality }) => {
  if (RunState.apuesta?.tracking && quality === 'fail') RunState.apuesta.fails++;
  // Sello de Marea (R2): los perfectos curan cada N SP ganado
  if (quality === 'perfect') {
    const curado = rasgoCuraPorSp(DataDB.balance.cadencia.sp_perfect, world.player);
    if (curado) {
      AudioManager.sfx('heart');
      pushPopup(world.player.x, world.player.y - 24, '+♥', '#4FC3F7', 10);
    }
  }
  const fs = RunState.floorStats; if (!fs) return;
  if (quality === 'perfect') {
    fs.perfects++;
    GameState.usoCompases[RunState.compas] = (GameState.usoCompases[RunState.compas] ?? 0) + 1; // el compás sube de nivel
  } else if (quality === 'good') fs.goods++;
  else fs.fails++;
});
EventBus.on('enemy_died', () => { if (RunState.floorStats) RunState.floorStats.kills++; });
EventBus.on('cadencia_parried', () => { if (RunState.floorStats) RunState.floorStats.parries++; });
EventBus.on('cadencia_auto_parried', () => { if (RunState.floorStats) RunState.floorStats.parries++; });
EventBus.on('room_cleared', () => {
  if (RunState.floorStats) RunState.floorStats.salas++;
  RunState.activoSalas++; // recarga del objeto activo (R1.2)
});
EventBus.on('player_hurt', (hp, amount) => { Input.vibrar?.(70); if (RunState.floorStats && amount > 0) RunState.floorStats.corazones += amount; });
EventBus.on('hechizo_subio', (h, lv) => flash('Arte perfeccionada: ' + h.nombre + ' Nv.' + lv, 'Su tinta corre más espesa'));
EventBus.on('esfera_activada', (n) => flash('Esfera: ' + n.nombre, n.desc));
EventBus.on('nivel_subido', (nivel, niveles) => {
  for (let n = nivel - niveles + 1; n <= nivel; n++) for (const u of desbloqueosEnNivel(n)) {
    const l = etiqueta(u);
    flash('Desbloqueado: ' + l.titulo, l.sub);
  }
});

// Buffer de entrada: una pulsación ligeramente temprana (o durante hit-stop) no se pierde
const inputBuf = { melee: 0, dash: 0, parry: 0, hechizo: 0 };
const bufInput = Object.create(Input);
bufInput.justPressed = (a) => (a in inputBuf && inputBuf[a] > 0) || Input.justPressed(a);
bufInput.consume = (a) => { if (a in inputBuf) inputBuf[a] = 0; };

// ---------- Update ----------
// Director de música: cada escena/bioma/jefe tiene su pista (assets/audio/*.mp3).
// Devuelve [id, loop] o null (no cambiar: menú/pausa/balance mantienen la actual).
function musicaEscena() {
  switch (mode) {
    case 'title': return ['mus_titulo', true];
    case 'pueblo': return ['mus_pueblo', true];
    case 'santuario': return ['mus_santuario', true];
    case 'batalla': return ['mus_redoble', true];
    case 'dead': return ['mus_derrota', false];
    case 'victory': return ['mus_victoria', false];
    case 'play': {
      if (world.bossDir && !world.bossDir.boss.health.dead) return ['mus_jefe', true];
      const b = floorMap?.current?.bioma?.id;
      return [{ pendulos: 'mus_pendulos', archivo: 'mus_archivo', invertida: 'mus_invertida', truenos: 'mus_truenos' }[b] ?? 'mus_pendulos', true];
    }
  }
  return null;
}

function update(dt) {
  if (Input.f5Pressed()) DataDB.reload();
  // Mando (MFi/Xbox/PS) recién conectado: pasa a twin-stick, esconde el táctil y
  // avisa. Volver a tocar la pantalla reactiva el control táctil (lo último manda).
  if (Input.padJustConnected()) {
    if (Input.scheme() === 'una_mano') { Input.setScheme('raton'); GameState.opciones.esquema_control = 'raton'; SaveManager.save(); }
    Input.hideTouch();
    flash('Mando conectado', 'Sticks: mover + apuntar · A golpe · LB parada · X arte · Y ignición');
  }
  // Música de fondo por escena (crossfade automático; el AudioManager ignora la
  // repetición de la misma pista y cae al dron procedural si falta el fichero).
  const mt = musicaEscena();
  if (mt && mt[0] !== musicaActual) { musicaActual = mt[0]; AudioManager.playTrack(mt[0], { loop: mt[1] }); }
  // Reloj de beat: una lectura por frame (sample-accurate desde el AudioContext). Solo
  // alimenta el latido visual del HUD; el input de Cadencia NO depende de esto.
  beatInfo = AudioManager.beatClock();
  // A5 — Música reactiva a la racha: en cada beat NUEVO de la pista, si el groove está
  // alto, programa una campana EN el próximo beat (sample-accurate). Se apaga sola cuando
  // el groove decae. Polling del bucle (NO EventBus.on: el bus no tiene off, fugaría).
  if (beatInfo.active && beatInfo.beat !== lastMusBeat) {
    lastMusBeat = beatInfo.beat;
    const rc = DataDB.balance.musica_reactiva;
    if (rc?.activa && world.player && mode === 'play' && beatInfo.beat % (rc.cada_n_beats ?? 2) === 0) {
      const gf = world.player.grooveFrac ?? 0;
      if (gf >= (rc.umbral_frac ?? 0.25)) {
        AudioManager.grooveBell(AudioManager.beatTime(beatInfo.beat + 1), gf, world.player.grooveBuffed, rc);
      }
    }
  }
  // Feedback de pulsación: un "tick" suave al tocar CUALQUIER botón táctil (el
  // pulso visual y la vibración ya los da input.js; esto añade el eco sonoro).
  if (Input.touchState().enabled) {
    for (const c of ['TouchB', 'TouchQ', 'TouchF', 'TouchX', 'TouchC', 'TouchPause', 'TouchMenu']) {
      if (Input.justCode(c)) { AudioManager.sfx('ui_tap'); break; }
    }
  }
  // Refrescar buffer de entrada (sobrevive al hit-stop; caduca solo)
  const bufS = DataDB.balance.game_feel?.input_buffer_s ?? 0;
  for (const a in inputBuf) {
    if (Input.justPressed(a)) inputBuf[a] = bufS;
    else if (inputBuf[a] > 0) inputBuf[a] -= dt;
  }
  if (Input.justPressed('debug_info')) showDebug = !showDebug;
  if (Input.justPressed('toggle_scheme')) {
    const s = Input.toggleScheme();
    GameState.opciones.esquema_control = s;
    SaveManager.save();
    flash(s === 'flechas' ? 'Control: flechas mueven · WASD disparan' : 'Control: WASD mueven · ratón dispara');
  }

  if (hurtFlashT > 0) hurtFlashT -= dt;
  if (ignicionFlashT > 0) ignicionFlashT -= dt;
  if (mode === 'dead' || mode === 'victory') {
    FX.update(dt);
    const tap = Input.touchState().enabled && Input.justCode('TouchTap');
    if (Input.justPressed('restart') || tap) enterPueblo();
    return;
  }
  if (mode === 'title') {
    titleT += dt;
    FX.update(dt);
    if (titleT <= 0.6) return;
    const tap = Input.touchState().enabled ? Input.consumeTap() : null;
    const hayRun = GameState.flags.tutorialHecho && SaveManager.hasRun(); // ¿partida a medias?
    if (hayRun) {
      // Dos opciones: Reanudar la run guardada / ir al Pueblo (nueva partida)
      titleIdx = UIK.mover1D(Input, titleIdx, 2);
      let elegido = -1;
      if (tap) { for (let i = 0; i < 2; i++) if (UIK.hit(titleOptRect(i), tap)) { titleIdx = i; elegido = i; } }
      if (Input.justPressed('melee') || Input.justCode('Enter') || UIK.confirmo(Input)) elegido = titleIdx;
      if (elegido === 0) { AudioManager.sfx('door_open'); resumeRun(); }
      else if (elegido === 1) { AudioManager.sfx('door_open'); mode = 'pueblo'; }
    } else if (Input.justPressed('melee') || Input.justCode('Enter') || tap) {
      AudioManager.sfx('door_open');
      if (!GameState.flags.tutorialHecho) {
        newRun();          // el tutorial es la primera cámara de una run real
        tut.begin();
        flash('LA PRIMERA CUERDA', 'Ferrán te observa desde arriba: «despacio, aprendiz»');
      } else mode = 'pueblo';
    }
    return;
  }
  // Botones táctiles por modo: en menús/pantallas los botones de combate se apagan
  // para que un tap sea solo un tap (nada de PAR/ATQ fantasma sobre la Esfera).
  // En UNA MANO solo quedan ≡ y pausa (todo lo demás es gesto).
  Input.setTouchButtons(mode === 'play' ? (Input.scheme() === 'una_mano' ? TOUCH_BTNS_1MANO : TOUCH_BTNS_PLAY) : mode === 'pueblo' ? TOUCH_BTNS_PUEBLO : TOUCH_BTNS_NONE);
  Input.setComboActivo(mode === 'play' && cad.active);
  if ((mode === 'play' || mode === 'pueblo') && Input.justPressed('menu')) {
    menuReturn = mode; mode = 'menu'; menu.open(world.player);
    Input.consumeTap(); // que el toque que abre el menú no navegue dentro de él
    if (!GameState.flags.menuVisto) { GameState.flags.menuVisto = true; SaveManager.save(); }
    return;
  }
  if (mode === 'opciones') { updateOpciones(); return; }
  if (mode === 'menu') {
    if (menu.update(Input, dt) === 'cerrar') mode = menuReturn;
    return;
  }
  if (mode === 'balance') {
    FX.update(dt);
    updateBalanceScreen(dt);
    return;
  }
  if (mode === 'metronomo') {
    updateMetronomo(dt);
    return;
  }
  if (mode === 'pueblo') {
    updatePueblo(dt);
    return;
  }
  if (mode === 'santuario') {
    FX.update(dt);
    updateSantuario();
    return;
  }
  if (mode === 'batalla') {
    if (batalla.update(dt, Input) === 'fin') {
      // Liga del Redoble: cada rango superado por primera vez paga 1 engranaje
      if (batalla.won && batalla.clave?.startsWith('liga')) {
        const rango = GameState.ligaRango ?? 0;
        if (batalla.clave === 'liga' + (rango + 1)) {
          GameState.ligaRango = rango + 1;
          GameState.engranajes++;
          SaveManager.save();
          flash('Rango ' + GameState.ligaRango + ' de la Liga superado', '+1 engranaje · ' + (GameState.ligaRango >= 5 ? 'te espera EL CAMPEÓN' : 'siguiente rival en El Redoble'));
        }
      } else if (batalla.won && batalla.clave === 'campeon' && !GameState.flags.campeonBatido) {
        GameState.flags.campeonBatido = true;
        GameState.engranajes += 2;
        SaveManager.save();
        flash('¡CAMPEÓN DEL REDOBLE!', 'Tu eco se inclina · +2 engranajes');
      }
      enterPueblo();
    }
    return;
  }
  if (mode === 'upgrade') {
    FX.update(dt);
    const n = pendingUpgrades.length;
    upgradeIdx = UIK.mover1D(Input, Math.min(upgradeIdx, n - 1), n); // izq/dcha (o arriba/abajo) mueve el foco
    const keys = ['Digit1', 'Digit2', 'Digit3'];
    const tap = Input.consumeTap();
    let elegido = -1;
    for (let i = 0; i < n; i++) {
      if (UIK.hit(upgradeCardRect(i), tap)) { upgradeIdx = i; elegido = i; }
      if (Input.justCode(keys[i])) elegido = i; // atajos 1/2/3 (teclado)
    }
    if (elegido < 0 && UIK.confirmo(Input)) elegido = upgradeIdx; // A del mando / Enter
    if (elegido >= 0) {
      applyUpgrade(pendingUpgrades[elegido]);
      pendingUpgrades = null; mode = 'play'; descendFloor();
    }
    return;
  }
  if (tut.active) {
    tut.update(dt);
    if (Input.justPressed('pause')) { tut.skip(); return; } // Esc salta el tutorial
  }
  if (Input.justPressed('pause')) {
    mode = (mode === 'paused') ? 'play' : 'paused';
    if (mode === 'paused') { pauseIdx = 0; autosaveRun(); } // guarda al pausar (salir sin perder progreso)
    return; // no procesar el mismo frame (evita que Esc/Start abra-y-cierre la pausa)
  }
  if (mode === 'paused') {
    const opts = pauseOptions(); const n = opts.length;
    pauseIdx = UIK.mover1D(Input, Math.min(pauseIdx, n - 1), n);
    if (UIK.cancelo(Input)) { mode = 'play'; return; } // B del mando (Esc lo cierra arriba)
    const tap = Input.consumeTap();
    let elegido = -1;
    for (let i = 0; i < n; i++) if (UIK.hit(pauseRect(i, n), tap)) { pauseIdx = i; elegido = i; }
    if (elegido < 0 && UIK.confirmo(Input)) elegido = pauseIdx;
    if (elegido >= 0) opts[elegido].act();
    return;
  }

  if (hitStopT > 0) { hitStopT -= dt; return; }

  const p = world.player;
  const rooms = activeRooms();

  // Sala actual = bloque bajo los pies; al pisar su interior por primera vez, se activa
  const under = roomAt(p.x, p.y);
  if (under) cur = under;
  if (cur && !cur.visited) {
    const b = cur.bounds;
    if (p.x > b.x + 4 && p.x < b.x + b.w - 4 && p.y > b.y + 4 && p.y < b.y + b.h - 4) {
      const first = cur.enter(world);
      onEnterRoom(cur, first);
    }
  }
  // Autosave B1: al llegar a una sala SEGURA (no sellada) distinta, guarda. Captura las
  // reliquias del pedestal/tienda recogidas en la sala anterior (que no emiten room_cleared).
  if (cur && !cur.sealed && !tut.active) {
    const ck = cur.gx + ',' + cur.gy;
    if (ck !== prevAutoKey) { prevAutoKey = ck; autosaveRun(); }
  }

  // Jugador: colisiona con muros/rejas/obstáculos de las salas activas
  const solids = [];
  for (const room of rooms) {
    solids.push(...room.wallSolids(), ...room.gateSolids(), ...room.playerSolids());
  }
  const bb = floorMap.bbox;
  const roomCtxPlayer = {
    bounds: bb,
    playerSolids: () => solids,
    clampPlayer: (pl) => {
      pl.x = Math.min(Math.max(pl.x, bb.x + pl.r), bb.x + bb.w - pl.r);
      pl.y = Math.min(Math.max(pl.y, bb.y + pl.r), bb.y + bb.h - pl.r);
    }
  };
  p.update(dt, bufInput, roomCtxPlayer, world);

  // Cámara libre con lerp
  const [gx, gy] = camGoal();
  const k = Math.min(1, dt * 7);
  cam.x += (gx - cam.x) * k;
  cam.y += (gy - cam.y) * k;

  // Arte de Tinta (Q). Bloqueado durante la Ignición.
  if (bufInput.justPressed('hechizo')) {
    bufInput.consume('hechizo');
    if (p.ignicionT > 0) pushPopup(p.x, p.y - 20, 'El alma ya arde', '#ffb547', 9);
    else cast(RunState.hechizo, p, world, cur);
  }

  // Compas de Cadencia (C) — solo posturas desbloqueadas (progresión por nivel)
  if (Input.justPressed('compas') && !cad.active) {
    const list = compasesActivos();
    if (list.length < 2) {
      AudioManager.sfx('no_sp');
      flash('Solo conoces el ' + list[0].nombre, 'Las posturas se aprenden subiendo de nivel');
    } else {
      const i = list.findIndex(c => c.id === RunState.compas);
      const next = list[(i + 1) % list.length];
      RunState.compas = next.id;
      AudioManager.sfx('tome');
      flash(next.nombre, next.desc);
    }
  }

  // Ignición (F)
  if (Input.justPressed('ignicion') && p.ignicionT <= 0) {
    if (RunState.sp >= DataDB.balance.ignicion.sp_max) p.startIgnicion();
    else { AudioManager.sfx('no_sp'); pushPopup(p.x, p.y - 20, 'Espíritu insuficiente', '#e07a7a', 9); }
  }
  // Decay del Espíritu (anti-banking): fuera de combate el SP se enfría, para que
  // la Ignición no se acumule pasivamente entre salas. Todo tunable en balance.ignicion.
  {
    const ig = DataDB.balance.ignicion;
    const dps = ig?.sp_decay_por_s ?? 0;
    if (dps > 0 && p.ignicionT <= 0 && RunState.sp > 0) {
      const fueraCombate = !world.enemies.some(e => !e.health.dead);
      if (!(ig.sp_decay_solo_fuera_combate ?? true) || fueraCombate) {
        const antes = RunState.sp;
        RunState.sp = Math.max(0, RunState.sp - dps * dt);
        if (Math.floor(antes) !== Math.floor(RunState.sp)) EventBus.emit('sp_changed', RunState.sp);
      }
    }
  }
  // Acto 2 — arder: chispas tangenciales orbitando + engranajes dorados que suben
  if (p.ignicionT > 0 && Math.random() < dt * 9) {
    const a = Math.random() * Math.PI * 2;
    FX.burst(p.x + Math.cos(a) * 14, p.y - 6 + Math.sin(a) * 10,
      { n: 1, color: '#ffe28a', speed: 34, dir: a + Math.PI / 2, spread: 0.4, life: 0.55, size: 1.6, glow: true });
  }
  if (p.ignicionT > 0 && Math.random() < dt * 30) {
    FX.burst(p.x + (Math.random() - 0.5) * 10, p.y - 8, { n: 1, color: Math.random() < 0.5 ? '#ffb547' : '#ff9c3a', speed: 22, life: 0.5, size: 2, glow: true, gravity: -80 });
  }

  // Arena del tiempo: el MUNDO se ralentiza (enemigos, balas, salas); Pip no.
  if (slowmoT > 0) slowmoT -= dt;
  const dtMundo = slowmoT > 0 ? dt * slowmoFactor : dt;

  for (const room of rooms) room.update(dtMundo, world);
  world.tears.update(dt, bb);
  if (freezeT <= 0) world.bullets.update(dtMundo, bb);

  // G5 — BULLET-TIME al esquivar por los pelos: si durante el dash una bala pasa
  // rozándote Y venía hacia ti, el mundo se ralentiza un instante (dramático).
  if (nearmissCd > 0) nearmissCd -= dt;
  if (p.dashT > 0 && nearmissCd <= 0 && slowmoT <= 0) {
    const G = DataDB.balance.game_feel;
    const rr = G.nearmiss_radius_px ?? 15;
    let roce = null;
    world.bullets.forEach(bl => {
      if (roce) return;
      const dx = p.x - bl.x, dy = p.y - bl.y;
      if (Math.hypot(dx, dy) > rr + p.r) return;
      // ¿venía hacia ti? (producto escalar velocidad · dirección al jugador)
      if (bl.vx * dx + bl.vy * dy > 0) roce = bl;
    });
    if (roce) {
      slowmoT = G.nearmiss_slowmo_s ?? 0.45;
      slowmoFactor = G.nearmiss_factor ?? 0.35;
      slowmoBlue = true;
      nearmissCd = G.nearmiss_cooldown_s ?? 1.6;
      AudioManager.beep(1200, 0.06, 'sine', 0.03, -400);
      AudioManager.beep(300, 0.4, 'sine', 0.05, 120);
      FX.addShake(1.5);
      pushPopup(p.x, p.y - 22, '¡POR LOS PELOS!', '#5ad1ff', 10);
      EventBus.emit('nearmiss', p.x, p.y);
    }
  }

  const alive = world.enemies.filter(e => !e.health.dead);
  if (freezeT > 0) freezeT -= dt;
  else {
    for (const e of alive) {
      const ctxE = { bounds: e.room?.bounds ?? bb, groundSolids: () => e.room?.groundSolids() ?? [] };
      e.update(dtMundo, p, ctxE, world);
    }
    // Director de mecánicas del jefe de raid: nace con él, muere con él
    const jefe = alive.find(e => e.def?.comportamiento === 'jefe_ancla');
    if (jefe) {
      if (!world.bossDir || world.bossDir.boss !== jefe) world.bossDir = crearDirectorJefe(jefe, jefe.room ?? floorMap.current);
      world.bossDir?.update(dtMundo, p);
    } else world.bossDir = null;
  }

  // Familiares de reliquia (R1.1)
  updateArt(world.artFx, dt);
  syncFamiliares(world, p);
  if (freezeT <= 0) updateFamiliares(dt, world, p, alive);

  // Objeto activo (X): un uso, recarga limpiando salas (R1.2)
  if (Input.justPressed('activo') && p.mods.activo && RunState.activoSalas >= p.mods.activo.cooldown_salas) {
    RunState.activoSalas = 0;
    if (p.mods.activo.accion === 'global_slowmo') {
      slowmoT = p.mods.activo.duracion_s;
      slowmoFactor = p.mods.activo.factor;
      slowmoBlue = false;
      AudioManager.beep(320, 0.5, 'sine', 0.06, -180);
      flash('El tiempo se espesa...');
    }
    EventBus.emit('activo_usado', p.mods.activo);
  }

  // Rastros del dash: Aceite negro daña (R1.4) y el Sello de Ascuas ARDE (R2)
  const ascuas = rasgoDashBurn();
  if ((p.mods.dashTrail || ascuas) && p.dashT > 0) {
    const last = world.trails[world.trails.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 10) {
      world.trails.push({
        x: p.x, y: p.y + 4, tick: 0, fuego: !!ascuas,
        t: ascuas ? ascuas.duracion_s : p.mods.dashTrail.duracion_s
      });
    }
  }
  for (let i = world.trails.length - 1; i >= 0; i--) {
    const tr = world.trails[i];
    tr.t -= dt; tr.tick -= dt;
    if (tr.t <= 0) { world.trails.splice(i, 1); continue; }
    if (tr.tick <= 0) {
      // tick de 0.5 s: con el redondeo "mínimo 1" un tick más fino inflaría el dps
      tr.tick = 0.5;
      for (const e of alive) {
        if (Math.hypot(e.x - tr.x, e.y - tr.y) < 14 + e.r) {
          if (tr.fuego) e.burn = { t: DataDB.balance.hechizos.quema_duracion_s };
          else if (p.mods.dashTrail) e.takeDamage(p.mods.dashTrail.dano_por_s * 0.5, tr.x, tr.y, 0);
        }
      }
      if (tr.fuego && Math.random() < 0.7) {
        FX.burst(tr.x, tr.y - 4, { n: 1, color: '#ff9c3a', speed: 16, life: 0.4, size: 1.8, glow: true, gravity: -50 });
      }
    }
  }

  // Cadencia: fija por línea de visión (getSolids) — nunca a través de paredes,
  // pero sí a vagabundos que cruzan límites de bloque (galerías)
  cad.getSolids = () => solids;
  cad.beat = beatInfo; // reloj de beat de la pista (SOLO acento visual del anillo, no el juicio)
  cad.tapEsParry = Input.scheme() === 'una_mano' && Input.touchState().enabled;
  cad.update(dt, bufInput, p, alive);
  // El Afinador desafina tus ventanas mientras siga vivo en tu cámara
  cad.desafinado = alive.some(e => e.id === 'afinador' && !e.health.dead && Math.hypot(e.x - p.x, e.y - p.y) < 320);
  // Tinta del Archivo Anegado: frena (surf con la Marea de Cera equipada)
  const curRm = floorMap.current;
  let tMul = 1;
  if (curRm?.tinta?.length && curRm.bioma?.tinta) {
    if (curRm.tinta.some(r => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h)) {
      tMul = RunState.hechizo === 'marea_de_cera' ? curRm.bioma.tinta.surf_mult : curRm.bioma.tinta.slow_mult;
    }
  }
  p.terrainMult = tMul;
  updateBiomaExtras(dt, p, curRm);

  // Separación suave entre enemigos terrestres (que no se apilen en un punto)
  {
    const sep = DataDB.balance.game_feel?.enemy_separation ?? 0;
    if (sep > 0) {
      for (let i = 0; i < alive.length; i++) {
        const a = alive[i];
        if (a.def.vuela) continue;
        for (let j = i + 1; j < alive.length; j++) {
          const b2 = alive[j];
          if (b2.def.vuela) continue;
          let dx = b2.x - a.x, dy = b2.y - a.y;
          const rr = a.r + b2.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2) || 1;
          const push = (rr - d) * sep * 0.5;
          dx /= d; dy /= d;
          if (!a.def.jefe) { a.x -= dx * push; a.y -= dy * push; }
          if (!b2.def.jefe) { b2.x += dx * push; b2.y += dy * push; }
        }
      }
    }
  }

  // Parry activo (E)
  if (bufInput.justPressed('parry') && !(cad.active && cad.counter) && p.parryCd <= 0) {
    bufInput.consume('parry');
    p.parryCd = DataDB.balance.parry.cooldown_s;
    p.parryAnimT = 0.28; // pose de Parada (visual)
    let parried = false;
    for (const e of alive) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < DataDB.balance.parry.range_px + e.r && e.parryable) {
        e.stun(DataDB.balance.parry.stun_s);
        parried = true;
        pushPopup(e.x, e.y - e.r - 8, t9('ui.cad_parry'), '#7ee8e0', 11);
        spawnArt(world.artFx, 'campana_cristal', e.x, e.y, { tmax: 0.4, r: 34, color: '#aef4ec' });
      }
    }
    if (parried) {
      RunState.sp = Math.min(DataDB.balance.ignicion.sp_max, RunState.sp + DataDB.balance.parry.sp_gain);
      EventBus.emit('sp_changed', RunState.sp);
      p.addGroove(DataDB.balance.groove?.por_parry ?? 0); // racha (G7c)
      AudioManager.sfx('parry');
      hitStopT = Math.max(hitStopT, 0.06);
      FX.addShake(1.5);
    } else {
      FX.burst(p.x + p.aim.x * 14, p.y + p.aim.y * 14, { n: 3, color: '#7ee8e0', speed: 50, life: 0.18, size: 1.5, spread: 1.4, dir: Math.atan2(p.aim.y, p.aim.x) });
    }
  }

  // Lágrimas → muros/rejas/rocas/cera de las salas activas
  world.tears.forEach(t => {
    for (const room of rooms) {
      for (const wsolid of room.wallSolids()) {
        if (circleRectHit(t, wsolid)) { t.active = false; return; }
      }
      for (const g of room.gateSolids()) {
        if (circleRectHit(t, g)) { t.active = false; return; }
      }
      for (const rock of room.rocks) {
        if (circleRectHit(t, rock)) {
          FX.burst(t.x, t.y, { n: 3, color: '#8f86ad', speed: 50, life: 0.25, size: 1.5 });
          t.active = false; return;
        }
      }
      for (const w of [...room.wax]) {
        if (circleRectHit(t, w)) {
          if (t._lastWax === w) return;
          t._lastWax = w;
          w.hp -= Math.max(1, Math.round(t.damage));
          FX.burst(t.x, t.y, { n: 5, color: '#e8dfc8', speed: 70, life: 0.3, size: 2 });
          AudioManager.sfx('hit');
          if (w.hp <= 0) room.breakWax(w);
          if (!t.flags?.has('heavy')) t.active = false;
          return;
        }
      }
    }
  });

  // Lágrimas → enemigos
  world.tears.forEach(t => {
    for (const e of alive) {
      if (!e.health.dead && circleHit(t, e)) {
        const dmg = e.takeDamage(t.damage * elementMult(t.elemento, e.def.elemento), t.x, t.y);
        if (dmg > 0) {
          pushPopup(e.x + 8, e.y - e.r - 4, String(dmg), '#f4f0e6', 9);
          // JUICE DEL DISPARO (Fase A #8): chispazo DIRECCIONAL teñido por elemento +
          // núcleo blanco + micro-shake; al REMATAR, un micro-hit-stop que da peso.
          const elc = DataDB.elementos[t.elemento]?.color ?? '#bfe3ff';
          const ang = Math.atan2(t.vy, t.vx);
          FX.burst(t.x, t.y, { n: 8, color: elc, speed: 150, life: 0.26, size: 2, glow: true, dir: ang, spread: 1.3 });
          FX.burst(t.x, t.y, { n: 3, color: '#ffffff', speed: 55, life: 0.12, size: 1.6, glow: true });
          FX.addShake(0.6);
          if (e.health.dead) { hitStopT = Math.max(hitStopT, 0.045); FX.addShake(2.2); }
          if (t.flags) {
            if (t.flags.has('burn')) e.burn = { t: DataDB.balance.hechizos.quema_duracion_s, tick: 1 };
            if (t.flags.has('split_on_hit') && !t.split) {
              const a = Math.atan2(t.vy, t.vx);
              for (const da of [Math.PI / 2, -Math.PI / 2]) {
                world.tears.spawn(t.x, t.y, Math.cos(a + da) * 220, Math.sin(a + da) * 220, 80, t.damage * 0.5,
                  { elemento: t.elemento, flags: t.flags, split: true, r: 2.5 });
              }
            }
          }
        }
        t.active = false;
        break;
      }
    }
    if (t.active && Math.random() < dt * 14) {
      FX.burst(t.x, t.y, { n: 1, color: '#7f96d8', speed: 8, life: 0.3, size: 1.2 });
    }
  });

  // Balas enemigas → sólidos y jugador
  world.bullets.forEach(b => {
    for (const room of rooms) {
      for (const s of [...room.wallSolids(), ...room.gateSolids(), ...room.tearSolids()]) {
        if (circleRectHit(b, s)) { b.active = false; return; }
      }
    }
    if (circleHit(b, { x: p.x, y: p.y, r: p.hurtR })) { if (p.hurt(b.damage, b.x, b.y)) b.active = false; }
  });

  // Contacto: los enemigos de melé solo dañan durante su embestida
  for (const e of alive) {
    if (e.def.dano_contacto > 0 && circleHit(e, { x: p.x, y: p.y, r: p.hurtR })) {
      if (e.melees) {
        if (e.atk.state === 'strike' && p.hurt(e.def.dano_contacto, e.x, e.y)) {
          e.atk.state = 'recover'; e.atk.t = DataDB.balance.enemigo_melee.recover_s;
        }
      } else {
        p.hurt(e.def.dano_contacto, e.x, e.y);
      }
    }
  }
  for (const e of alive) {
    if (e.melees && e.atk.state === 'strike' && Math.random() < dt * 40) {
      FX.burst(e.x, e.y, { n: 2, color: '#ff6b5e', speed: 30, life: 0.25, size: 2 });
    }
  }

  // Pickups: imán y recogida
  for (const pk of world.pickups) {
    pk.t += dt;
    const dx = p.x - pk.x, dy = p.y - pk.y;
    const d = Math.hypot(dx, dy);
    if (d < (DataDB.balance.game_feel?.magnet_radius_px ?? 30)) {
      const acc = DataDB.balance.game_feel?.magnet_accel ?? 600;
      pk.vx += dx / d * acc * dt; pk.vy += dy / d * acc * dt;
    }
    pk.x += pk.vx * dt; pk.y += pk.vy * dt;
    pk.vx *= Math.pow(0.01, dt); pk.vy *= Math.pow(0.01, dt);
    if (d < 11) {
      if (pk.type === 'coin') {
        RunState.oro++;
        AudioManager.sfx('gold');
        pushPopup(p.x, p.y - 16, '+1', '#e8c565', 9);
        pk.dead = true;
      } else if (pk.type === 'heart' && p.health.hp < p.health.max) {
        p.health.hp = Math.min(p.health.max, p.health.hp + 2);
        AudioManager.sfx('heart');
        pk.dead = true;
      } else if (pk.type.startsWith('tomo:')) {
        const id = pk.type.slice(5);
        if (!RunState.tomos.includes(id)) RunState.tomos.push(id);
        RunState.hechizo = id;
        const h = DataDB.hechizo(id);
        AudioManager.sfx('tome');
        if (h) flash('Tomo: ' + h.nombre, h.desc + ' (Q para lanzar)');
        pk.dead = true;
      } else if (pk.type.startsWith('item:')) {
        const it = DataDB.item(pk.type.slice(5));
        if (it) applyItem(it, p);
        pk.dead = true;
      } else if (pk.type.startsWith('sello:')) {
        const s = obtenerSello(pk.type.slice(6));
        if (s) {
          AudioManager.bell(220, 0.1);
          flash('Sello: ' + s.nombre, s.rasgo + ' · finisher: ' + s.d_finisher);
          SaveManager.save(); // la colección es permanente
        }
        pk.dead = true;
      }
    }
  }
  world.pickups = world.pickups.filter(pk => !pk.dead);

  // Tienda y pedestal (salas activas)
  for (const room of rooms) {
    if (room.stock) {
      for (const s of room.stock) {
        if (s.taken) continue;
        if (Math.hypot(p.x - s.x, p.y - s.y) < 14 + p.r) {
          if (s.hintCd > 0) continue;
          if (RunState.oro >= s.price) {
            RunState.oro -= s.price;
            s.taken = true;
            AudioManager.sfx('gold');
            if (s.kind === 'item') { const it = DataDB.item(s.id); if (it) applyItem(it, p); }
            else if (s.kind === 'heart') { p.health.hp = Math.min(p.health.max, p.health.hp + 2); AudioManager.sfx('heart'); flash('Corazón de cera', '+1 corazón'); }
            else if (s.kind === 'tomo') {
              const h = DataDB.hechizos.hechizos.find(x => !RunState.tomos.includes(x.id));
              if (h) { RunState.tomos.push(h.id); RunState.hechizo = h.id; AudioManager.sfx('tome'); flash('Tomo: ' + h.nombre, h.desc); }
              else { flash('El tendero no tiene más tomos'); RunState.oro += s.price; s.taken = false; s.hintCd = 2; }
            }
          } else {
            s.hintCd = 1.5;
            pushPopup(s.x, s.y - 20, 'Faltan ' + (s.price - RunState.oro) + ' de oro', '#e07a7a', 9);
            AudioManager.sfx('no_sp');
          }
        }
        if (s.hintCd > 0) s.hintCd -= dt;
      }
    }
    // Pedestales (1 o 2 con Páginas perdidas — coger uno retira el otro, R1.5)
    for (const pd of [room.pedestal, room.pedestal2]) {
      if (!pd || pd.taken) continue;
      if (Math.hypot(p.x - pd.x, p.y - pd.y) < 16 + p.r) {
        pd.taken = true;
        const otro = pd === room.pedestal ? room.pedestal2 : room.pedestal;
        if (otro && !otro.taken) { otro.taken = true; flash('La otra reliquia se desvanece...'); }
        const it = DataDB.item(pd.itemId);
        if (it) applyItem(it, p);
      }
    }
    // Trampilla: hay que QUEDARSE encima (0.45s) — rozarla ya no te traga al piso siguiente
    if (trapdoorHintCd > 0) trapdoorHintCd -= dt;
    const td = room.trapdoor;
    if (td && !tut.active && Math.hypot(p.x - td.x, p.y - td.y) < td.r + p.r) {
      if (td.dwell === 0 && trapdoorHintCd <= 0) flash('La trampilla cede...', 'quédate encima para descender');
      td.dwell += dt;
      if (td.dwell > 0.45 && trapdoorHintCd <= 0) {
        trapdoorHintCd = 1;
        openFloorBalance();
        return;
      }
    } else if (td && td.dwell > 0) td.dwell = 0;
  }

  // Polvo al correr
  if (Math.hypot(p.vx, p.vy) > 140 && Math.random() < dt * 14) {
    FX.burst(p.x - p.vx * 0.02, p.y + 6, { n: 1, color: '#6c6193', speed: 18, life: 0.35, size: 1.5, gravity: -20 });
  }
  // Ambiente del bioma: motas características por mundo (pase 1 de identidad visual)
  const amb = floorMap.current?.bioma?.ambiente;
  if (amb && Math.random() < dt * amb.rate) {
    FX.burst(p.x + (Math.random() - 0.5) * 360, p.y + (Math.random() - 0.5) * 220,
      { n: 1, color: amb.color, speed: 6, life: 1.6, size: amb.size, gravity: amb.grav, glow: true });
  }
  // Llamitas sobre enemigos ardiendo + motas de polvo ambiental
  for (const e of alive) {
    if (e.burn && Math.random() < dt * 10) {
      FX.burst(e.x + (Math.random() - 0.5) * e.r, e.y - e.r * 0.5, { n: 1, color: '#ff9c3a', speed: 20, life: 0.4, size: 2, glow: true, gravity: -60 });
    }
  }
  // Ascuas que se desprenden de las velas
  if (rooms.length && Math.random() < dt * 3) {
    const rl = rooms[(Math.random() * rooms.length) | 0];
    const cds = rl.candles();
    if (cds.length) {
      const cd = cds[(Math.random() * cds.length) | 0];
      FX.burst(cd.x + (Math.random() - 0.5) * 4, rl.bounds.y - 26,
        { n: 1, color: Math.random() < 0.5 ? '#ffb547' : '#ff9c3a', speed: 10, life: 1.3, size: 1.5, glow: true, gravity: -24 });
    }
  }
  if (cur && Math.random() < dt * 4) {
    const b = cur.bounds;
    FX.burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h,
      { n: 1, color: '#9c8fc0', speed: 5, life: 2.6, size: 1, glow: true, gravity: -7 });
  }

  for (const n of world.dmgNumbers) { n.t -= dt; n.y -= 26 * dt; }
  world.dmgNumbers = world.dmgNumbers.filter(n => n.t > 0);
  for (const s of world.shockwaves) s.t -= dt;
  world.shockwaves = world.shockwaves.filter(s => s.t > 0);

  FX.update(dt);
  if (flashT > 0) flashT -= dt;
  if (hudHintT > 0) hudHintT -= dt;
}

// ---------- Render ----------
const vignette = document.createElement('canvas');
vignette.width = VW; vignette.height = VH;
{
  const v = vignette.getContext('2d');
  const g = v.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(4,2,10,0.35)');
  v.fillStyle = g; v.fillRect(0, 0, VW, VH);
}
const lightCanvas = document.createElement('canvas');
lightCanvas.width = VW; lightCanvas.height = VH;
const lctx = lightCanvas.getContext('2d');

// NIEBLA de Mistveil: 2 capas de vaho con parallax y deriva (horneadas una vez)
// Bruma horneada en diferido: el color vive en balance.arte y DataDB aún no ha
// cargado cuando este módulo se evalúa. Se hornea en el primer frame y con F5.
let mistLayers = null;
function bakeMist() {
  const layers = [];
  for (let li = 0; li < 2; li++) {
    const c = document.createElement('canvas');
    c.width = VW; c.height = VH;
    const g = c.getContext('2d');
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * VW, y = Math.random() * VH, r = 45 + Math.random() * (70 + li * 45);
      // Bruma perlada cálida (dirección de arte "Hora Dorada"; rgb por bioma o global)
      const nc = floorMap?.current?.bioma?.niebla ?? DataDB.balance?.arte?.niebla ?? '168,156,206';
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${nc},${0.09 - li * 0.02})`);
      grad.addColorStop(1, `rgba(${nc},0)`);
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    layers.push({ c, sp: 4 + li * 7, par: 0.10 + li * 0.09, amp: 9 + li * 7, ph: li * 2.1 });
  }
  return layers;
}
EventBus.on('data_reloaded', () => { mistLayers = null; }); // rehornear con F5
let _mistKey = '';
function drawMist(t, strength = 1) {
  // La bruma cambia de color con el bioma (biomas.json → niebla)
  const key = floorMap?.current?.bioma?.niebla ?? DataDB.balance?.arte?.niebla ?? '';
  if (!mistLayers || key !== _mistKey) { _mistKey = key; mistLayers = bakeMist(); }
  for (const m of mistLayers) {
    const ox = (((-cam.x * m.par + t * m.sp) % VW) + VW) % VW;
    const oy = (((-cam.y * m.par * KY + t * 2 + Math.sin(t * 0.13 + m.ph) * m.amp) % VH) + VH) % VH;
    ctx.globalAlpha = strength;
    for (const dx of [0, VW]) for (const dy of [0, VH]) {
      ctx.drawImage(m.c, Math.round(ox - dx), Math.round(oy - dy));
    }
    ctx.globalAlpha = 1;
  }
}
let hurtFlashT = 0; // pulso rojo en los bordes al recibir daño

function font(size) { ctx.font = `${size * 2}px Gelica, serif`; }

// Ayudas de texto medido (VT323 no es monoespaciada del todo: medir evita solapes).
// El mayor tamaño de la lista (descendente) cuyo texto quepa en maxW; fija esa fuente.
function fitFont(text, maxW, sizes) {
  for (const s of sizes) { font(s); if (ctx.measureText(text).width <= maxW) return s; }
  font(sizes[sizes.length - 1]); return sizes[sizes.length - 1];
}
// Parte en líneas que quepan en maxW (con la fuente ACTUAL); corta a maxLines.
function wrapText(text, maxW, maxLines = 3) {
  const words = String(text).split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (cur && ctx.measureText(test).width > maxW) { lines.push(cur); cur = w; if (lines.length >= maxLines) return lines; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}
// Recorta con '…' si no cabe en maxW (con la fuente ACTUAL).
function clipText(text, maxW) {
  if (ctx.measureText(String(text)).width <= maxW) return String(text);
  let s = String(text);
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

// --- Chrome ornamentado del HUD (100% por código, sin assets) ---
// Panel oscuro casi opaco (el texto encima queda nítido) con doble borde dorado
// biselado y remates en punta a los lados, como los banners de la referencia.
function ornateFrame(x, y, w, h, opts = {}) {
  const fill = opts.fill ?? 'rgba(15,11,28,0.92)';
  const g1 = opts.gold ?? '#dfc06c', g2 = opts.gold2 ?? '#7c5f28';
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  const gr = ctx.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, g1); gr.addColorStop(0.55, g2); gr.addColorStop(1, '#b6924a');
  ctx.strokeStyle = gr; ctx.lineWidth = 1.6; ctx.strokeRect(x + 0.8, y + 0.8, w - 1.6, h - 1.6);
  ctx.strokeStyle = 'rgba(255,240,205,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  if (opts.finials !== false) {
    // Puntas laterales + joya superior (rombos)
    const my = y + h / 2, fr = 3;
    ctx.fillStyle = g1;
    ctx.beginPath(); ctx.moveTo(x - fr - 1, my); ctx.lineTo(x + 1.5, my - fr); ctx.lineTo(x + 1.5, my + fr); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w + fr + 1, my); ctx.lineTo(x + w - 1.5, my - fr); ctx.lineTo(x + w - 1.5, my + fr); ctx.closePath(); ctx.fill();
    const jx = x + w / 2;
    ctx.beginPath(); ctx.moveTo(jx, y - 2.4); ctx.lineTo(jx + 2.2, y); ctx.lineTo(jx, y + 2.4); ctx.lineTo(jx - 2.2, y); ctx.closePath(); ctx.fill();
  }
}
// Banner ornamentado ajustado a un texto ya medido (con la fuente actual fijada).
// side: 'left' ancla en x, 'right' ancla el borde derecho, 'center' centra en x.
// Devuelve el rect con tx/cy para pintar el texto centrado en vertical.
function hudBanner(text, x, y, opts = {}) {
  const padX = opts.padX ?? 9, h = opts.h ?? 15;
  const tw = ctx.measureText(text).width;
  const w = tw + padX * 2;
  const fx = opts.side === 'right' ? x - w : opts.side === 'center' ? x - w / 2 : x;
  ornateFrame(fx, y, w, h, opts);
  return { x: fx, y, w, h, tx: fx + padX, cy: y + 11 };
}

// Overlay de hitboxes (F3): círculo azul = cuerpo, verde = hurtbox real del jugador
function drawHitboxes() {
  ctx.save(); ctx.lineWidth = 1;
  const el = (x, y, r, col) => { ctx.strokeStyle = col; ctx.beginPath(); ctx.ellipse(SX(x), SY(y, 0), r, r * VIS.KY, 0, 0, 7); ctx.stroke(); };
  const p = world.player;
  if (p) { el(p.x, p.y, p.r, 'rgba(90,160,255,0.9)'); el(p.x, p.y, p.hurtR, 'rgba(120,255,140,0.95)'); }
  for (const e of world.enemies) if (!e.health.dead) el(e.x, e.y, e.r, 'rgba(255,90,90,0.9)');
  world.tears.forEach(tr => el(tr.x, tr.y, tr.r, 'rgba(140,200,255,0.8)'));
  world.bullets.forEach(b => el(b.x, b.y, b.r, 'rgba(255,170,60,0.9)'));
  ctx.strokeStyle = 'rgba(255,220,90,0.4)';
  for (const room of activeRooms()) {
    for (const s of [...room.wallSolids(), ...room.gateSolids(), ...room.groundSolids()]) {
      ctx.strokeRect(SX(s.x), SY(s.y, 0), s.w, s.h * VIS.KY);
    }
  }
  ctx.restore();
}

function candleScreen(room, cd) {
  return { x: SX(cd.x), y: SY(room.bounds.y) - 22 };
}

function drawDoor(room, side) {
  const door = room.doors[side];
  if (!door) return;
  const c = room.doorCenter(side);
  const b = room.bounds;

  if (side === 'n') {
    const cx = SX(c.x), ft = SY(b.y);
    ctx.fillStyle = '#0e0b1c';
    ctx.beginPath();
    ctx.moveTo(cx - 22, ft);
    ctx.lineTo(cx - 22, ft - 26);
    ctx.quadraticCurveTo(cx, ft - 44, cx + 22, ft - 26);
    ctx.lineTo(cx + 22, ft);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6b5a36'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 23, ft);
    ctx.lineTo(cx - 23, ft - 27);
    ctx.quadraticCurveTo(cx, ft - 46, cx + 23, ft - 27);
    ctx.lineTo(cx + 23, ft);
    ctx.stroke();
    if (!door.open) {
      ctx.strokeStyle = '#4c4070'; ctx.lineWidth = 2;
      for (let i = -16; i <= 16; i += 8) {
        ctx.beginPath(); ctx.moveTo(cx + i, ft); ctx.lineTo(cx + i, ft - 30); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,60,50,0.18)';
      ctx.fillRect(cx - 22, ft - 40, 44, 40);
    } else {
      const g = ctx.createLinearGradient(0, ft - 30, 0, ft);
      g.addColorStop(0, 'rgba(150,130,220,0)');
      g.addColorStop(1, 'rgba(150,130,220,0.14)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 22, ft - 30, 44, 30);
    }
  } else if (side === 's') {
    const cx = SX(c.x), fb = SY(b.y + b.h);
    ctx.fillStyle = '#0e0b1c';
    ctx.fillRect(cx - 22, fb, 44, CAP + S_FACE - 2);
    const g = ctx.createLinearGradient(0, fb, 0, fb + CAP + S_FACE);
    g.addColorStop(0, 'rgba(150,130,220,0.12)');
    g.addColorStop(1, 'rgba(14,11,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 22, fb, 44, CAP + S_FACE - 2);
    ctx.fillStyle = '#6b5a36';
    ctx.fillRect(cx - 25, fb, 3, CAP); ctx.fillRect(cx + 22, fb, 3, CAP);
    if (!door.open) {
      ctx.strokeStyle = '#4c4070'; ctx.lineWidth = 2;
      for (let i = -16; i <= 16; i += 8) {
        ctx.beginPath(); ctx.moveTo(cx + i, fb); ctx.lineTo(cx + i, fb + CAP + 6); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,60,50,0.18)';
      ctx.fillRect(cx - 22, fb, 44, CAP + 6);
    }
  } else {
    const vert = side === 'w';
    const x = vert ? SX(room.blockX) : SX(b.x + b.w);
    const cy = SY(c.y);
    ctx.fillStyle = '#0e0b1c';
    ctx.fillRect(x, cy - 18, WALL, 38);
    ctx.fillStyle = '#6b5a36';
    ctx.fillRect(x, cy - 21, WALL, 3);
    ctx.fillRect(x, cy + 20, WALL, 3);
    if (!door.open) {
      ctx.strokeStyle = '#4c4070'; ctx.lineWidth = 2;
      for (let i = -12; i <= 12; i += 8) {
        ctx.beginPath(); ctx.moveTo(x, cy + i); ctx.lineTo(x + WALL, cy + i); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,60,50,0.18)';
      ctx.fillRect(x, cy - 18, WALL, 38);
    } else {
      ctx.fillStyle = 'rgba(150,130,220,0.10)';
      ctx.fillRect(x, cy - 18, WALL, 38);
    }
  }
}

// Dibuja un icono pintado CENTRADO en (cx, cy) a una altura dh (para HUD/iconos).
// Devuelve false si no hay sprite → el llamante pinta su versión vectorial.
function drawIconCentered(id, cx, cy, dh) {
  const spr = Sprites.get(id); if (!spr) return false;
  const inf = Sprites.info(id);
  const dw = Math.round(inf.w * dh / inf.h);
  ctx.drawImage(spr, Math.round(cx - dw / 2), Math.round(cy - dh / 2), dw, dh);
  return true;
}

// Dibuja un prop pintado anclado por su BASE (cx, byY) a una altura dh.
// Devuelve false si no hay sprite cargado → el llamante pinta su versión vectorial.
function drawPropSprite(id, cx, byY, dh, alpha = 1) {
  const spr = Sprites.get(id); if (!spr) return false;
  const inf = Sprites.info(id);
  const dw = Math.round(inf.w * dh / inf.h);
  const a = ctx.globalAlpha; if (alpha !== 1) ctx.globalAlpha = a * alpha;
  ctx.drawImage(spr, Math.round(cx - dw / 2), Math.round(byY - dh), dw, dh);
  ctx.globalAlpha = a;
  return true;
}

function drawRock(rect) {
  const x = SX(rect.x), y = SY(rect.y);
  const v = ((rect.x * 7 + rect.y * 13) % 10) / 10;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x + 16, y + TILE_SY - 2, 15, 5, 0, 0, 7); ctx.fill();
  if (drawPropSprite('prop_roca', x + 16, y + TILE_SY, 30)) return;
  ctx.fillStyle = '#4a4266';
  ctx.beginPath();
  ctx.moveTo(x + 4, y + TILE_SY - 2);
  ctx.lineTo(x + 2, y + 4);
  ctx.lineTo(x + 8 + v * 4, y - 9);
  ctx.lineTo(x + 23, y - 10);
  ctx.lineTo(x + 30, y + 1);
  ctx.lineTo(x + 29, y + TILE_SY - 2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5f5386';
  ctx.beginPath();
  ctx.moveTo(x + 5, y + 2);
  ctx.lineTo(x + 10, y - 7);
  ctx.lineTo(x + 22, y - 8);
  ctx.lineTo(x + 27, y);
  ctx.lineTo(x + 19, y + 4);
  ctx.lineTo(x + 9, y + 4);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x + 4, y + TILE_SY - 8, 25, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(x + 8, y - 6, 8, 2);
}

function drawWaxBlock(w, maxHp) {
  const x = SX(w.x), y = SY(w.y);
  const H = 13;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x + 16, y + TILE_SY - 2, 15, 4, 0, 0, 7); ctx.fill();
  if (!drawPropSprite('prop_bloque_cera', x + 16, y + TILE_SY, H + TILE_SY * 0.9)) {
    ctx.fillStyle = '#d5c8a4';
    ctx.fillRect(x + 2, y - H + TILE_SY * 0.35, 28, H + TILE_SY * 0.55);
    ctx.fillStyle = '#efe4c8';
    ctx.fillRect(x + 2, y - H, 28, TILE_SY * 0.45);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 2, y - H, 28, 2);
    ctx.fillStyle = '#bfae87';
    ctx.fillRect(x + 2, y + TILE_SY - 6, 28, 5);
    ctx.fillStyle = '#efe4c8';
    ctx.fillRect(x + 5, y + TILE_SY - 4, 3, 4);
    ctx.fillRect(x + 23, y + TILE_SY - 5, 3, 5);
    ctx.fillRect(x + 13, y - H + 4, 2, 6);
  }
  if (w.hp < maxHp) {
    ctx.strokeStyle = 'rgba(60,50,30,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 8, y - H + 5); ctx.lineTo(x + 13, y + 2); ctx.lineTo(x + 9, y + 10); ctx.stroke();
    if (w.hp <= maxHp / 2) {
      ctx.beginPath(); ctx.moveTo(x + 21, y - H + 4); ctx.lineTo(x + 17, y + 4); ctx.lineTo(x + 23, y + 12); ctx.stroke();
    }
  }
}

function drawPedestalObj(room, t, pd = room.pedestal) {
  const x = SX(pd.x), y = SY(pd.y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y + 8, 12, 4, 0, 0, 7); ctx.fill();
  if (!drawPropSprite('prop_pedestal', x, y + 8, 30)) {
    ctx.fillStyle = '#352d52';
    ctx.fillRect(x - 6, y - 16, 12, 22);
    ctx.fillStyle = '#4c4070';
    ctx.beginPath(); ctx.ellipse(x, y - 16, 9, 3.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3d3358';
    ctx.beginPath(); ctx.ellipse(x, y + 6, 9, 3.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x - 6, y - 14, 2, 18);
  }
  if (pd.taken) return;
  const it = DataDB.item(pd.itemId);
  const hover = Math.sin(t * 3) * 2;
  const col = TAG_COLORS[it?.tags?.[0]] ?? '#e9e2f5';
  const gy = y - 28 + hover;
  const g = ctx.createRadialGradient(x, gy, 0, x, gy, 15);
  g.addColorStop(0, col + '4d');
  g.addColorStop(1, col + '00');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, gy, 15, 0, 7); ctx.fill();
  ctx.fillStyle = col;
  ctx.save(); ctx.translate(x, gy); ctx.rotate(Math.PI / 4);
  ctx.fillRect(-4, -4, 8, 8); ctx.restore();
  ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, gy - 1, 2, 2);
  if (Math.hypot(world.player.x - pd.x, world.player.y - pd.y) < 70) {
    font(8); ctx.textAlign = 'center'; ctx.fillStyle = '#cfc6e8';
    ctx.fillText(it?.nombre ?? '?', x, y - 42);
  }
}

function drawShopItem(s, t) {
  const x = SX(s.x), y = SY(s.y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y + 6, 11, 4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#3d3358'; ctx.fillRect(x - 7, y - 6, 14, 11);
  ctx.fillStyle = '#4c4070'; ctx.beginPath(); ctx.ellipse(x, y - 6, 9, 3.2, 0, 0, 7); ctx.fill();
  if (s.taken) return;
  const hover = Math.sin(t * 3 + s.x) * 1.5;
  const gy = y - 16 + hover;
  if (s.kind === 'heart') {
    ctx.fillStyle = '#d8454f';
    ctx.beginPath();
    ctx.moveTo(x, gy + 5);
    ctx.lineTo(x - 5, gy - 1); ctx.lineTo(x - 5, gy - 3); ctx.lineTo(x - 3, gy - 5); ctx.lineTo(x, gy - 3);
    ctx.lineTo(x + 3, gy - 5); ctx.lineTo(x + 5, gy - 3); ctx.lineTo(x + 5, gy - 1);
    ctx.closePath(); ctx.fill();
  } else if (s.kind === 'tomo') {
    ctx.fillStyle = '#3a3226'; ctx.fillRect(x - 5, gy - 4, 10, 9);
    ctx.fillStyle = '#b678e8'; ctx.fillRect(x - 4, gy - 3, 8, 7);
    ctx.fillStyle = '#fff2c8'; ctx.fillRect(x - 1, gy - 3, 1, 7);
  } else {
    const it = DataDB.item(s.id);
    const col = TAG_COLORS[it?.tags?.[0]] ?? '#e9e2f5';
    ctx.save(); ctx.translate(x, gy); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = col; ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  }
  const afford = RunState.oro >= s.price;
  font(8); ctx.textAlign = 'center';
  ctx.fillStyle = afford ? '#e8c565' : '#e07a7a';
  ctx.fillText(s.price + ' oro', x, y + 16);
  if (s.kind === 'item' && Math.hypot(world.player.x - s.x, world.player.y - s.y) < 60) {
    ctx.fillStyle = '#cfc6e8';
    ctx.fillText(DataDB.item(s.id)?.nombre ?? '?', x, y - 28);
  }
}

function drawTrapdoor(room) {
  if (!room.trapdoor) return;
  const x = SX(room.trapdoor.x), y = SY(room.trapdoor.y);
  const trapSpr = Sprites.get('prop_trampilla');
  if (trapSpr) {
    // Trampilla pintada en el suelo (vista cenital): anclada por su centro
    const inf = Sprites.info('prop_trampilla');
    const dh = 34, dw = Math.round(inf.w * dh / inf.h);
    ctx.drawImage(trapSpr, Math.round(x - dw / 2), Math.round(y - dh * 0.62), dw, dh);
  } else {
    ctx.fillStyle = '#07050e';
    ctx.beginPath(); ctx.ellipse(x, y, 14, 10 * KY + 3, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#6b5a36'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, 14, 10 * KY + 3, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(150,130,220,0.15)';
    ctx.beginPath(); ctx.ellipse(x, y - 2, 10, 5, 0, 0, 7); ctx.fill();
  }
  // Progreso de descenso (dwell): anillo dorado que se cierra
  const dw = room.trapdoor.dwell ?? 0;
  if (dw > 0) {
    ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(x, y, 18, 13 * KY + 3, 0, -Math.PI / 2, -Math.PI / 2 + Math.min(1, dw / 0.45) * Math.PI * 2); ctx.stroke();
  }
}

function drawSpawnMarks(room, t) {
  if (room.spawnTimer <= 0) return;
  for (const s of room.pendingSpawns) {
    const x = SX(s.x), y = SY(s.y);
    const k = 1 - room.spawnTimer / DataDB.balance.salas.spawn_telegraph_s;
    ctx.strokeStyle = `rgba(160,120,255,${0.3 + k * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, 12 - k * 6, (12 - k * 6) * KY, 0, t * 4, t * 4 + 4.5); ctx.stroke();
    ctx.fillStyle = `rgba(160,120,255,${0.2 + k * 0.4})`;
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
}

function drawPickup(pk, t) {
  const hover = Math.sin(t * 4 + pk.x) * 1.5;
  const x = SX(pk.x), y = SY(pk.y, 4 + hover);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(SX(pk.x), SY(pk.y) + 3, 4, 1.6, 0, 0, 7); ctx.fill();
  if (pk.type.startsWith('sello:')) {
    // Sello elemental: rombo latiente del color de su elemento
    const def = selloDef(pk.type.slice(6));
    const col = DataDB.elementos[def?.elemento]?.color ?? '#e9e2f5';
    const s = 1 + Math.sin(t * 6) * 0.12;
    ctx.save(); ctx.translate(x, y - 2); ctx.scale(s, s);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 0); ctx.lineTo(0, 7); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-1, -3, 2, 2);
    ctx.restore();
    return;
  }
  if (pk.type === 'coin') {
    ctx.fillStyle = '#8a6d2f'; ctx.beginPath(); ctx.arc(x + 1, y + 1, 4.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8c565'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff2c8'; ctx.fillRect(x - 2, y - 2, 2, 2);
  } else if (pk.type === 'heart') {
    const s = 1 + Math.sin(t * 5) * 0.08;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = '#d8454f';
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.lineTo(-5, -1); ctx.lineTo(-5, -3); ctx.lineTo(-3, -5); ctx.lineTo(0, -3);
    ctx.lineTo(3, -5); ctx.lineTo(5, -3); ctx.lineTo(5, -1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f28d95'; ctx.fillRect(-3, -3, 2, 2);
    ctx.restore();
  } else if (pk.type.startsWith('tomo:')) {
    const h = DataDB.hechizo(pk.type.slice(5));
    const col = DataDB.elementos[h?.elemento]?.color ?? '#b678e8';
    ctx.fillStyle = '#3a3226'; ctx.fillRect(x - 5, y - 4, 10, 9);
    ctx.fillStyle = col; ctx.fillRect(x - 4, y - 3, 8, 7);
    ctx.fillStyle = '#fff2c8'; ctx.fillRect(x - 1, y - 3, 1, 7);
  } else if (pk.type.startsWith('item:')) {
    const it = DataDB.item(pk.type.slice(5));
    const col = TAG_COLORS[it?.tags?.[0]] ?? '#e9e2f5';
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = col; ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, y - 1, 2, 2);
  }
}

// Decoración de fondo por bioma (A2): atrezzo determinista por sala, dibujado
// tenue tras las entidades para vestir cada mundo sin ensuciar la lectura.
function drawBiomaDecor(room, t) {
  const bioma = room.bioma?.id;
  if (!bioma) return;
  const b = room.bounds;
  // Semilla barata por sala: posiciones estables entre frames
  const seed = (room.gx * 73856093 ^ room.gy * 19349663) >>> 0;
  const rndAt = i => ((seed * (i + 17) * 2654435761) >>> 8) % 1000 / 1000;
  ctx.save();
  ctx.globalAlpha = 0.5;
  if (bioma === 'pendulos' && room.type !== 'galeria') {
    // Péndulos decorativos colgando del techo (los de las galerías son el peligro real)
    const pendSpr = Sprites.get('prop_pendulo_colgante');
    for (let i = 0; i < 2; i++) {
      const px = b.x + b.w * (0.2 + rndAt(i) * 0.6);
      const largo = 26 + rndAt(i + 3) * 16;
      const ang = Math.sin(t * 0.9 + seed % 7 + i * 2.4) * 0.28;
      const x0 = SX(px), y0 = SY(b.y) - 26;
      if (pendSpr) {
        // Sprite pintado colgando del techo: pivota desde el enganche (ang)
        const inf = Sprites.info('prop_pendulo_colgante');
        const dh = 30 + largo * 0.4, dw = Math.round(inf.w * dh / inf.h);
        ctx.save(); ctx.globalAlpha *= 1.5; ctx.translate(x0, y0); ctx.rotate(ang);
        ctx.drawImage(pendSpr, Math.round(-dw / 2), 0, dw, dh); ctx.restore();
      } else {
        const x1 = x0 + Math.sin(ang) * largo, y1 = y0 + Math.cos(ang) * largo;
        ctx.strokeStyle = '#6d5c42'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.fillStyle = '#c8a24f';
        ctx.beginPath(); ctx.arc(x1, y1, 4, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffe9b0'; ctx.fillRect(x1 - 1, y1 - 2, 1.5, 1.5);
      }
    }
    // Candelabro de pie contra la pared norte
    drawPropSprite('prop_candelabro', SX(b.x + b.w * (0.09 + rndAt(6) * 0.06)), SY(b.y) + 8, 34, 1.5);
  } else if (bioma === 'archivo') {
    // Estanterías del Archivo sobre la pared norte, con lomos apagados y tinta que gotea
    const shelfSpr = Sprites.get('prop_estanteria_tinta');
    for (let s = 0; s < 2; s++) {
      const cx = b.x + b.w * (0.22 + s * 0.5);
      if (shelfSpr) {
        drawPropSprite('prop_estanteria_tinta', SX(cx), SY(b.y) + 10, 42, 1.5);
      } else {
        const sx0 = SX(cx - 34), sy0 = SY(b.y) - 34;
        ctx.fillStyle = '#3a3a52';
        ctx.fillRect(sx0, sy0, 68, 26);
        const lomos = ['#7d90b8', '#a8a2c8', '#6d84a8', '#8d9cb0'];
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = lomos[(i + s) % lomos.length];
          ctx.fillRect(sx0 + 4 + i * 8, sy0 + 4 + (i % 2), 6, 20 - (i % 3) * 2);
        }
        const drip = ((t * 0.55 + rndAt(s + 9)) % 1);
        ctx.fillStyle = 'rgba(60,80,160,0.8)';
        ctx.fillRect(sx0 + 12 + s * 30, sy0 + 26 + drip * 26, 2, 4);
      }
    }
    // Pila de libros con tintero en el suelo
    drawPropSprite('prop_pila_libros', SX(b.x + b.w * 0.5), SY(b.y + b.h * 0.3), 24, 1.4);
  } else if (bioma === 'invertida') {
    // Engranajes flotando al revés y un reloj derretido en la pared
    const gearSpr = Sprites.get('prop_engranaje_flotante');
    for (let i = 0; i < 3; i++) {
      const gx = SX(b.x + b.w * (0.15 + rndAt(i) * 0.7));
      const gy = SY(b.y + b.h * (0.2 + rndAt(i + 5) * 0.35)) - 30 - Math.sin(t * 0.7 + i * 2.1) * 5;
      const r = 6 + rndAt(i + 2) * 7;
      const rot = t * (i % 2 ? 0.4 : -0.3) + i;
      if (gearSpr) {
        const inf = Sprites.info('prop_engranaje_flotante');
        const dh = r * 2.8, dw = Math.round(inf.w * dh / inf.h);
        ctx.save(); ctx.globalAlpha *= 1.4; ctx.translate(gx, gy); ctx.rotate(rot);
        ctx.drawImage(gearSpr, Math.round(-dw / 2), Math.round(-dh / 2), dw, dh); ctx.restore();
      } else {
        ctx.strokeStyle = '#a06848'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(gx, gy, r, 0, 7); ctx.stroke();
        for (let d = 0; d < 4; d++) {
          const a = rot + d * Math.PI / 2;
          ctx.fillStyle = '#a06848';
          ctx.fillRect(gx + Math.cos(a) * r - 1.5, gy + Math.sin(a) * r - 1.5, 3, 3);
        }
      }
    }
    // Esfera de reloj derretida chorreando sobre la pared norte
    const mx = SX(b.x + b.w * (0.3 + rndAt(11) * 0.4));
    if (!drawPropSprite('prop_reloj_derretido', mx, SY(b.y) + 4, 30, 1.5)) {
      const my = SY(b.y) - 22;
      ctx.strokeStyle = '#c8b090'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(mx, my, 12, 8 + Math.sin(t * 0.5 + seed) * 1.5, 0.3, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx - 4, my + 7); ctx.quadraticCurveTo(mx - 3, my + 15, mx - 5, my + 18); ctx.stroke();
    }
  } else if (bioma === 'truenos') {
    // El órgano-carillón: tubos de bronce en la pared norte y campanas colgantes
    const nx = SX(b.x + b.w * 0.5), ny = SY(b.y) - 32;
    for (let i = 0; i < 7; i++) {
      const tx = nx - 44 + i * 14, h = 16 + rndAt(i) * 20;
      const grd = ctx.createLinearGradient(tx, ny - h, tx, ny);
      grd.addColorStop(0, '#b98fd0'); grd.addColorStop(1, '#544266');
      ctx.fillStyle = grd; ctx.fillRect(tx, ny - h, 8, h);
      ctx.fillStyle = 'rgba(240,220,255,0.5)'; ctx.fillRect(tx, ny - h, 2, h);
    }
    for (let i = 0; i < 2; i++) { // campanas que se mecen
      const cx = SX(b.x + b.w * (0.26 + i * 0.5)), cy0 = SY(b.y) - 22;
      const sway = Math.sin(t * 0.8 + i * 2 + seed % 5) * 0.22;
      const cx1 = cx + Math.sin(sway) * 8, cy1 = cy0 + 14;
      ctx.strokeStyle = '#6d5c42'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy0); ctx.lineTo(cx1, cy1); ctx.stroke();
      ctx.fillStyle = '#9a7fae';
      ctx.beginPath(); ctx.moveTo(cx1 - 6, cy1 + 6); ctx.quadraticCurveTo(cx1 - 6, cy1 - 4, cx1, cy1 - 5);
      ctx.quadraticCurveTo(cx1 + 6, cy1 - 4, cx1 + 6, cy1 + 6); ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawCandles(room, t) {
  const sconce = Sprites.get('prop_candelabro_pared');
  room.candles().forEach((cd, i) => {
    const { x, y } = candleScreen(room, cd);
    if (sconce) {
      // Candelabro de bronce pintado; la llama procedural sigue encima (parpadeo)
      const inf = Sprites.info('prop_candelabro_pared');
      const sh = 22, sw = Math.round(inf.w * sh / inf.h);
      ctx.drawImage(sconce, Math.round(x - sw / 2), Math.round(y - 13), sw, sh);
    } else {
      ctx.fillStyle = '#4a3b28';
      ctx.fillRect(x - 3, y + 6, 6, 3);
      ctx.fillStyle = '#6b563a';
      ctx.fillRect(x - 2, y + 1, 4, 6);
      ctx.fillStyle = '#e8dfc8';
      ctx.fillRect(x - 1.5, y - 5, 3, 7);
    }
    const fl = Math.sin(t * 11 + i * 2.4 + room.gx + room.gy) * 0.8 + Math.sin(t * 23 + i) * 0.5;
    ctx.fillStyle = '#ff9c3a';
    ctx.beginPath(); ctx.ellipse(x + fl * 0.6, y - 9, 2, 4 + fl * 0.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffe28a';
    ctx.beginPath(); ctx.ellipse(x + fl * 0.4, y - 8, 1, 2.2, 0, 0, 7); ctx.fill();
  });
}

function drawLight(t, rooms) {
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, VW, VH);
  // Más luz global: capa de oscuridad más suave
  lctx.fillStyle = 'rgba(7,4,16,0.30)';
  lctx.fillRect(0, 0, VW, VH);
  lctx.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, a) => {
    const g = lctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g;
    lctx.beginPath(); lctx.arc(x, y, r, 0, 7); lctx.fill();
  };
  const p = world.player;
  if (p) hole(SX(p.x), SY(p.y), 165, 0.95);
  for (const room of rooms) {
    room.candles().forEach((cd, i) => {
      const cs = candleScreen(room, cd);
      const fl = 1 + Math.sin(t * 9 + i * 1.7) * 0.08;
      hole(cs.x, cs.y, 105 * fl, 0.85);
    });
    if (room.trapdoor) hole(SX(room.trapdoor.x), SY(room.trapdoor.y), 50, 0.6);
    if (room.pedestal && !room.pedestal.taken) hole(SX(room.pedestal.x), SY(room.pedestal.y) - 20, 55, 0.6);
    if (room.pedestal2 && !room.pedestal2.taken) hole(SX(room.pedestal2.x), SY(room.pedestal2.y) - 20, 55, 0.6);
    if (room.stock) for (const s of room.stock) if (!s.taken) hole(SX(s.x), SY(s.y) - 10, 40, 0.5);
  }
  ctx.drawImage(lightCanvas, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  for (const room of rooms) {
    for (const cd of room.candles()) {
      const cs = candleScreen(room, cd);
      const g = ctx.createRadialGradient(cs.x, cs.y - 4, 0, cs.x, cs.y - 4, 55);
      g.addColorStop(0, 'rgba(255,150,50,0.10)');
      g.addColorStop(1, 'rgba(255,150,50,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cs.x, cs.y - 4, 55, 0, 7); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

// Alto de dibujo por pose de Pip (px). Las poses con capa/efecto que se extienden
// (dash, ignición, arte, parada) se agrandan para que el CUERPO de Pip conserve el
// mismo tamaño que en idle/andar: la IA no sabe de escalas, la fija el motor. 34 =
// alto base (sprites guardados a 2×, dibujados a la mitad). Afinable a ojo con captura.
const POSE_DRAWH = { pip_dash: 40, pip_ataque: 34, pip_parada: 38, pip_arte: 44, pip_ignicion: 50 };
// Ajuste vertical fino por pose (px): 0 = pies en el suelo; negativo sube (poses aéreas).
const POSE_DY = { pip_dash: -2, pip_arte: -1, pip_ignicion: -1 };
// Transiciones animadas por código (ms). FLIP = giro izquierda↔derecha (Pip pivota);
// FADE = crossfade entre poses DISTINTAS (no entre los dos fotogramas de andar).
const FLIP_MS = 130, POSE_FADE_MS = 75;

function drawPlayer(p, t) {
  // A4 — estela de dash: engranajes espectrales que giran y se desvanecen
  for (const tr of p.trail) {
    const a = tr.t * 2.2;
    const gx = SX(tr.x), gy = SY(tr.y) - 6;
    const rot = t * 6 + tr.x * 0.3;
    const r = 5 + tr.t * 6;
    ctx.globalAlpha = a * 0.8;
    ctx.strokeStyle = '#9fb0ff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(gx, gy, r, 0, 7); ctx.stroke();
    ctx.fillStyle = '#c3ccff';
    for (let d = 0; d < 6; d++) {
      const ga = rot + d * Math.PI / 3;
      ctx.fillRect(gx + Math.cos(ga) * r - 1, gy + Math.sin(ga) * r - 1, 2, 2);
    }
    ctx.globalAlpha = a * 0.4;
    ctx.fillStyle = '#8fa2ff';
    ctx.beginPath(); ctx.arc(gx, gy, r * 0.4, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (p.health.invuln > 0 && p.dashT <= 0 && Math.floor(performance.now() / 60) % 2 === 0) return;
  // G7c — aura de racha: mientras el buff está activo, Pip late en fuego
  if (p.grooveBuffed) {
    const px = SX(p.x), py = SY(p.y) - 8;
    const pul = 16 + Math.sin(t * 9) * 3;
    const g = ctx.createRadialGradient(px, py, 4, px, py, pul);
    g.addColorStop(0, 'rgba(255,122,46,0)');
    g.addColorStop(0.7, 'rgba(255,122,46,0.18)');
    g.addColorStop(1, 'rgba(255,122,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, pul, 0, 7); ctx.fill();
  }
  // G4 — halo dorado breve mientras los i-frames del golpe protegen a Pip
  if (p.comboIframeT > 0) {
    const px = SX(p.x), py = SY(p.y) - 8;
    const g = ctx.createRadialGradient(px, py, 3, px, py, 20);
    g.addColorStop(0, 'rgba(255,224,138,0.5)');
    g.addColorStop(1, 'rgba(255,224,138,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, 20, 0, 7); ctx.fill();
  }
  const moving = Math.hypot(p.vx, p.vy) > 25;
  const bob = moving ? Math.sin(t * 13) * 1.5 : Math.sin(t * 2.2) * 0.6;
  const aa = p.attackAnim;
  let lx = 0, ly = 0, sx2 = 1, sy2 = 1;
  if (aa) {
    const k = aa.t / aa.tmax;
    const punch = Math.sin((1 - k) * Math.PI);
    const amp = aa.finisher ? 9 : 6;
    lx = aa.dir[0] * punch * amp;
    ly = aa.dir[1] * punch * amp;
    sx2 = 1 + punch * 0.22; sy2 = 1 - punch * 0.16;
  } else if (cad.active && cad.target) {
    const tdx = cad.target.x - p.x, tdy = cad.target.y - p.y;
    const tl = Math.hypot(tdx, tdy) || 1;
    lx = tdx / tl * 2; ly = tdy / tl * 2;
    sy2 = 0.92; sx2 = 1.05;
  }
  const x = SX(p.x + lx), y = SY(p.y + ly, 4 - bob * 0.4);

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(SX(p.x), SY(p.y) + 4, 7, 3, 0, 0, 7); ctx.fill();

  if (p.ignicionT > 0) {
    const g = ctx.createRadialGradient(x, y - 2, 2, x, y - 2, 22);
    g.addColorStop(0, 'rgba(255,181,71,0.4)');
    g.addColorStop(1, 'rgba(255,181,71,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y - 2, 22, 0, 7); ctx.fill();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx2, sy2);
  ctx.translate(-x, -y);

  // Sprite pintado si está cargado (hereda embestida/squash del transform de
  // arriba); si no, el Pip vectorial de siempre — fallback obligatorio.
  // Pose por estado (prioridad: dash > ataque > parada > arte > ignición > andar > idle).
  // El motor añade el resto del movimiento: bob, embestida, squash, volteo y estelas.
  // Andar alterna dos fotogramas (paso/paso_b) = ciclo real, no un swap con idle.
  const walkFrame = Math.sin(t * 13) > 0 ? 'pip_paso' : 'pip_paso_b';
  const poseId =
      p.dashT > 0 ? 'pip_dash'
    : aa ? 'pip_ataque'
    : p.parryAnimT > 0 ? 'pip_parada'
    : p.castT > 0 ? 'pip_arte'
    : p.ignicionT > 0 ? 'pip_ignicion'
    : moving ? walkFrame
    : 'pip_idle';
  // Giro suave (Pip pivota al cambiar de lado) y crossfade entre poses distintas,
  // ambos animados por código con performance.now() (independiente de dt del bucle).
  const nowMs = performance.now();
  if (p._drawnFacing === undefined) p._drawnFacing = p.facing;
  if (p.facing !== p._drawnFacing) { p._flipAt = nowMs; p._drawnFacing = p.facing; }
  const flipK = Math.min(1, (nowMs - (p._flipAt ?? -1e9)) / FLIP_MS);
  const turnSX = 0.12 + 0.88 * flipK; // ancho horizontal durante el giro (nunca 0 del todo)

  if (poseId !== p._lastPose) {
    // No hacemos crossfade entre los dos fotogramas de andar: ese cambio ES el paso.
    const walkInternal = poseId.startsWith('pip_paso') && String(p._lastPose).startsWith('pip_paso');
    if (p._lastPose && !walkInternal) { p._prevPose = p._lastPose; p._poseAt = nowMs; }
    p._lastPose = poseId;
  }
  const fadeK = Math.min(1, (nowMs - (p._poseAt ?? -1e9)) / POSE_FADE_MS); // 0..1

  // Dibuja una pose a cierta opacidad; hereda facing, giro y el alto por pose.
  const drawPose = (pid, alpha) => {
    const im = Sprites.get(pid); if (!im) return false;
    const info = Sprites.info(pid);
    const dH = POSE_DRAWH[pid] ?? 34;                    // alto por pose (cuerpo constante)
    const dW = Math.round(info.w * dH / info.h);         // guardado a 2×, dibujado a la mitad
    const flip = (info.face === 'right') !== (p.facing >= 0);
    ctx.save();
    ctx.globalAlpha = alpha * (p.dashT > 0 ? 0.8 : 1);   // esquiva: cuerpo espectral
    ctx.translate(x, y + 11 + (POSE_DY[pid] ?? 0));
    ctx.scale((flip ? -1 : 1) * turnSX, 1);
    ctx.drawImage(im, Math.round(-dW / 2), -dH, dW, dH);
    ctx.restore();
    return true;
  };

  if (Sprites.get(poseId)) {
    if (p._prevPose && p._prevPose !== poseId && fadeK < 1) drawPose(p._prevPose, 1 - fadeK); // pose saliente
    drawPose(poseId, fadeK < 1 ? fadeK : 1);                                                  // pose entrante
  } else if (Sprites.get('pip_idle')) {
    drawPose('pip_idle', 1); // esta pose aún carga: idle mientras llega
  } else {
  const ig = p.ignicionT > 0;
  ctx.fillStyle = p.dashT > 0 ? '#e8ecff' : ig ? '#9c5f2e' : '#4a4577';
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 4);
  ctx.lineTo(x + 6, y - 4);
  ctx.lineTo(x + 7, y + 9);
  ctx.lineTo(x - 7, y + 9);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = p.dashT > 0 ? '#c9d2ff' : ig ? '#7a4620' : '#37335c';
  ctx.fillRect(x - 7, y + 6, 14, 3);

  if (moving) {
    const step = Math.sin(t * 13) > 0 ? 2 : -2;
    ctx.fillStyle = '#2a2647';
    ctx.fillRect(x - 4 + step, y + 9, 3, 2);
    ctx.fillRect(x + 1 - step, y + 9, 3, 2);
  }

  ctx.fillStyle = '#5a5490';
  ctx.beginPath(); ctx.arc(x, y - 8, 7, Math.PI, 0); ctx.fill();
  ctx.fillRect(x - 7, y - 8, 14, 3);
  ctx.fillStyle = '#ece6d8';
  ctx.fillRect(x - 4, y - 10, 8, 7);

  const ex = x + Math.round(p.aim.x * 2), ey = y - 7 + Math.round(p.aim.y * 1.5);
  const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 7);
  g.addColorStop(0, 'rgba(255,185,70,0.5)');
  g.addColorStop(1, 'rgba(255,185,70,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(ex, ey, 7, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffb547'; ctx.fillRect(ex - 2, ey - 2, 4, 4);
  ctx.fillStyle = '#fff3d0'; ctx.fillRect(ex - 1, ey - 1, 2, 2);

  const ka = moving ? t * 6 : t * 1.2;
  ctx.save();
  ctx.translate(x - 8, y - 1);
  ctx.rotate(ka);
  ctx.fillStyle = '#c9a24d';
  ctx.fillRect(-1, -4, 2, 8);
  ctx.fillRect(-3, -4, 6, 2);
  ctx.restore();
  }
  ctx.restore();

  if (aa) {
    const k = 1 - aa.t / aa.tmax;
    const base = Math.atan2(aa.dir[1] * KY, aa.dir[0]);
    const sweep = Math.PI * 0.9;
    const a0 = base - sweep / 2 + sweep * k;
    const rr = aa.finisher ? 26 : 20;
    ctx.globalAlpha = Math.sin(k * Math.PI);
    ctx.strokeStyle = aa.finisher ? '#ff9c3a' : aa.quality === 'perfect' ? '#ffd54f' : '#e9e2f5';
    ctx.lineWidth = aa.finisher ? 4 : 3;
    ctx.beginPath(); ctx.ellipse(x, y - 2, rr, rr * KY, 0, a0 - 0.55, a0 + 0.55); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.globalAlpha *= 0.5;
    ctx.beginPath(); ctx.ellipse(x, y - 2, rr - 5, (rr - 5) * KY, 0, a0 - 0.4, a0 + 0.4); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// Color del AVISO de ataque por familia de material (unifica el lenguaje visual:
// cera cálida, latón dorado, polvo violeta). Distinto del halo estático de familia.
const TELE_FAM = { cera: '255,157,92', laton: '255,213,79', polvo: '185,143,208' };
// Comportamientos cuyo disparo APUNTA (dibujan línea de trayectoria en el aviso).
const CAST_AIM = new Set(['turret', 'orbit_shoot', 'cuckoo', 'blink']);

function drawEnemy(e, t) {
  if (e.health.dead) return;
  const scale = e.r / 10;
  const z = e.def.vuela ? 10 + Math.sin(t * 4 + e.y) * 2 : 0;
  let ox = 0, oy = 0;
  const atk = e.atk;
  if (e.melees) {
    if (atk.state === 'windup') {
      const k = 1 - atk.t / DataDB.balance.enemigo_melee.windup_s;
      ox = -atk.dir[0] * 4 * k + (Math.random() - 0.5) * 1.6 * k;
      oy = -atk.dir[1] * 4 * k * KY;
    } else if (atk.state === 'strike') {
      ox = atk.dir[0] * 3; oy = atk.dir[1] * 3 * KY;
    }
  }
  const x = SX(e.x + ox), y = SY(e.y, z + 4) + Math.round(oy);
  const flash = e.flash > 0;
  const white = '#ffffff';

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(SX(e.x), SY(e.y) + 4, e.r * 0.8, 3, 0, 0, 7); ctx.fill();

  // A3 — Halo de FAMILIA de material: cera cálida, latón bruñido, polvo frío.
  // Agrupa visualmente a los enemigos de un vistazo sobre el suelo claro.
  const famCol = { cera: '255,214,150', laton: '232,197,101', polvo: '150,140,200' }[e.def.familia];
  if (famCol) {
    const hg = ctx.createRadialGradient(x, y, 2, x, y, e.r * 2.1);
    hg.addColorStop(0, `rgba(${famCol},0.16)`);
    hg.addColorStop(1, `rgba(${famCol},0)`);
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(x, y, e.r * 2.1, 0, 7); ctx.fill();
  }
  const telc = TELE_FAM[e.def.familia] ?? '255,107,94'; // color de aviso por familia
  // Telegrafía de zarpazo: anillo creciendo a los pies durante el windup (melé)
  if (e.melees && atk.state === 'windup') {
    const wdur = DataDB.balance.enemigo_melee.windup_s * (e.def.windup_mult ?? 1);
    const k = 1 - atk.t / wdur;
    ctx.strokeStyle = `rgba(${telc},${0.25 + k * 0.45})`;
    ctx.lineWidth = 1.5 + k;
    ctx.beginPath(); ctx.ellipse(SX(e.x), SY(e.y) + 4, e.r * (0.9 + k * 0.5), (e.r * (0.9 + k * 0.5)) * 0.4, 0, 0, 7); ctx.stroke();
  }
  // Telegrafía GENÉRICA de disparo a distancia (turret/orbit/spiral/cuco/sanador):
  // un anillo que se CIERRA hacia el enemigo (0→1) + pulso interior en el último
  // tramo; si el ataque apunta, línea de trayectoria. Da ventana para esquivar.
  if (e.cast > 0 && e.castMax > 0) {
    const k = 1 - e.cast / e.castMax;
    const rr = e.r * (3 - 2 * k); // se cierra de 3r a r
    ctx.strokeStyle = `rgba(${telc},${0.3 + k * 0.5})`;
    ctx.lineWidth = 1.5 + k * 1.5;
    ctx.beginPath(); ctx.ellipse(SX(e.x), SY(e.y), rr, rr * KY, 0, 0, 7); ctx.stroke();
    if (k > 0.72 && Math.floor(t * 20) % 2 === 0) { // destello inminente
      ctx.fillStyle = `rgba(${telc},0.5)`;
      ctx.beginPath(); ctx.ellipse(SX(e.x), SY(e.y), e.r * 0.9, e.r * 0.9 * KY, 0, 0, 7); ctx.fill();
    }
    if (e.castAim && CAST_AIM.has(e.def.comportamiento)) { // trayectoria del disparo apuntado
      const ex = SX(e.x), ey = SY(e.y), len = 40 + k * 44;
      ctx.strokeStyle = `rgba(${telc},${0.22 + k * 0.5})`;
      ctx.lineWidth = 1 + k; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + e.castAim[0] * len, ey + e.castAim[1] * KY * len); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // Fogonazo blanco breve al soltar el disparo (el "AHORA")
  if (e.muzzle > 0) {
    const mk = Math.max(0, e.muzzle / 0.1), rr = e.r * (1.1 + (1 - mk) * 1.1);
    ctx.fillStyle = `rgba(255,255,255,${0.5 * mk})`;
    ctx.beginPath(); ctx.ellipse(SX(e.x), SY(e.y), rr, rr * KY, 0, 0, 7); ctx.fill();
  }
  // Élites (minijefe con rasgo), gemelo enfurecido y jefes: aura latiente que impone.
  // El color del aura DELATA el rasgo del élite (acorazado azul acero, veloz cian, iracundo rojo).
  if (e.enraged || e.def.jefe || e.elite) {
    const AURA_ELITE = { acorazado: '110,150,210', veloz: '120,230,220', iracundo: '255,120,60' };
    const rgb = e.def.jefe ? '255,181,71' : e.elite ? (AURA_ELITE[e.elite] ?? '224,140,60') : '224,90,79';
    const pul = 0.6 + Math.sin(t * 6 + e.x) * 0.4;
    ctx.strokeStyle = `rgba(${rgb},${(e.def.jefe ? 0.3 : 0.4) * pul})`;
    ctx.lineWidth = e.elite ? 2.4 : 2;
    ctx.beginPath(); ctx.ellipse(SX(e.x), SY(e.y) + 4, e.r * 1.5 + pul * 3, (e.r * 1.5 + pul * 3) * 0.4, 0, 0, 7); ctx.stroke();
    if (e.elite) { // segundo aro interior para que el minijefe destaque entre la horda
      ctx.strokeStyle = `rgba(${rgb},${0.22 * pul})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(SX(e.x), SY(e.y) + 4, e.r * 1.15, e.r * 1.15 * 0.4, 0, 0, 7); ctx.stroke();
    }
    if (Math.random() < (e.elite ? 0.2 : 0.15)) {
      FX.burst(e.x + (Math.random() - 0.5) * e.r * 2, e.y - 4,
        { n: 1, color: `rgb(${rgb})`, speed: 14, life: 0.5, size: 1.5, glow: true, gravity: -40 });
    }
  }

  ctx.save();
  ctx.translate(x, y);
  if (scale !== 1) ctx.scale(scale, scale);

  // Sprite pintado si existe para este enemigo (hereda escala por radio y los
  // desplazamientos de windup/golpe); si no, el cuerpo vectorial del switch.
  // Jefe de raid con sprite propio (def.sprite = 'jefe_<bioma>'); si no, el del enemigo base.
  const sprId = (e.def.sprite && Sprites.get(e.def.sprite)) ? e.def.sprite : 'enemigo_' + e.id;
  const eSpr = Sprites.get(sprId);
  if (eSpr) {
    const inf = Sprites.info(sprId);
    // Los jefes de raid se dibujan más grandes (proporcional a su radio); el
    // resto conserva la altura tuneada de 32 px.
    const dh = e.def.jefe ? Math.round((e.r ?? 18) * 3.4) : 32;
    const dw = Math.round(inf.w * dh / inf.h);
    const wob = Math.sin(t * 5 + e.x) * 0.03; // respiración sutil
    const faceRight = world.player ? world.player.x >= e.x : true;
    const flip = (inf.face === 'right') !== faceRight;
    ctx.save();
    ctx.scale((flip ? -1 : 1) * (1 + wob), 1 - wob);
    if (flash) ctx.globalAlpha = 0.5; // fogonazo al encajar un golpe
    ctx.drawImage(eSpr, Math.round(-dw / 2), 11 - dh, dw, dh);
    ctx.restore();
  } else switch (e.id) {
    case 'cera_andante': {
      const wob = Math.sin(t * 6 + e.x) * 1.4;
      ctx.fillStyle = flash ? white : '#a89065';
      ctx.beginPath(); ctx.ellipse(0, 7, 13 + wob * 0.4, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = flash ? white : '#e2cf9d';
      ctx.beginPath(); ctx.ellipse(-wob * 0.4, 1, 9, 11 + wob * 0.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = flash ? white : '#efe0b8';
      ctx.beginPath(); ctx.ellipse(-2, -3, 4, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = flash ? white : '#d3bd88';
      ctx.fillRect(-9, 2 + wob, 2, 5);
      ctx.fillRect(6, 3 - wob, 2, 4);
      ctx.fillStyle = '#463b30'; ctx.fillRect(-1, -15, 2, 6);
      ctx.fillStyle = 'rgba(160,160,180,0.25)';
      ctx.fillRect(Math.round(Math.sin(t * 3 + e.x) * 2), -19, 2, 2);
      ctx.fillStyle = '#3a3226';
      ctx.fillRect(-4, -2 + wob * 0.3, 2, 3);
      ctx.fillRect(2, -2 - wob * 0.3, 2, 3);
      break;
    }
    case 'tejedor_horas': {
      ctx.strokeStyle = flash ? white : '#6d5636'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const side = i < 2 ? -1 : 1;
        const a = side * (0.6 + i % 2 * 0.7) + Math.sin(t * 5 + i * 1.8) * 0.12;
        const kx = Math.cos(a) * 11 * side, ky = Math.sin(Math.abs(a)) * 6 - 4;
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(kx, ky - 4);
        ctx.lineTo(kx + side * 4, 8);
        ctx.stroke();
      }
      ctx.fillStyle = flash ? white : '#8a6c42';
      ctx.beginPath(); ctx.ellipse(0, 3, 7, 6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = flash ? white : '#e8dfc4';
      ctx.beginPath(); ctx.arc(0, -4, 6, 0, 7); ctx.fill();
      ctx.strokeStyle = '#77603f'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, -4, 6, 0, 7); ctx.stroke();
      const charge = 1 - Math.min(1, e.fireCd / (e.def.proyectil?.cadencia_s ?? 1));
      ctx.strokeStyle = charge > 0.8 ? '#c0392b' : '#4a3b28';
      ctx.beginPath(); ctx.moveTo(0, -4);
      ctx.lineTo(Math.cos(charge * 6.28 - 1.57) * 4, -4 + Math.sin(charge * 6.28 - 1.57) * 4);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -7); ctx.stroke();
      break;
    }
    case 'engranaje_errante': {
      ctx.fillStyle = flash ? white : '#9aa4bc';
      for (let i = 0; i < 8; i++) {
        const a = e.spin + i * Math.PI / 4;
        ctx.save();
        ctx.translate(Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.rotate(a);
        ctx.fillRect(-2, -3, 4, 6);
        ctx.restore();
      }
      const g = ctx.createRadialGradient(-3, -3, 1, 0, 0, 9);
      g.addColorStop(0, flash ? white : '#cfd6e6');
      g.addColorStop(1, flash ? white : '#7d87a4');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill();
      ctx.strokeStyle = '#4d5568'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a = e.spin + i * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 6, Math.sin(a) * 6); ctx.stroke();
      }
      ctx.fillStyle = '#242a38';
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffb547';
      ctx.fillRect(-1, -1, 2, 2);
      break;
    }
    case 'velon_inestable': {
      const prim = e.priming > 0;
      const jitter = prim ? (Math.random() - 0.5) * 2 : 0;
      ctx.translate(jitter, 0);
      ctx.strokeStyle = '#c9b895'; ctx.lineWidth = 2;
      const run = Math.sin(t * 16 + e.x) * 3;
      ctx.beginPath(); ctx.moveTo(-3, 8); ctx.lineTo(-5 + run, 13); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, 8); ctx.lineTo(5 - run, 13); ctx.stroke();
      ctx.fillStyle = flash || (prim && Math.floor(t * 16) % 2 === 0) ? white : '#f0e6d0';
      ctx.fillRect(-5, -8, 10, 17);
      ctx.fillStyle = '#dbcfae';
      ctx.fillRect(-5, 5, 10, 4);
      ctx.fillRect(-6, -8, 2, 6);
      const fl = Math.sin(t * 14 + e.x) * 1;
      ctx.fillStyle = '#5aa7e8';
      ctx.beginPath(); ctx.ellipse(fl * 0.5, -12, 2.5, 5 + (prim ? 2 : 0), 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#bfe0ff';
      ctx.beginPath(); ctx.ellipse(fl * 0.3, -11, 1.2, 2.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#3a3226';
      ctx.fillRect(-3, -4, 2, 3); ctx.fillRect(1, -4, 2, 3);
      break;
    }
    case 'campanero': {
      const sway = Math.sin(t * 2.5 + e.x) * 0.06;
      ctx.rotate(sway);
      const g = ctx.createLinearGradient(-10, -10, 10, 10);
      g.addColorStop(0, flash ? white : '#c7a266');
      g.addColorStop(1, flash ? white : '#8a6c3e');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-9, 8);
      ctx.quadraticCurveTo(-9, -8, 0, -11);
      ctx.quadraticCurveTo(9, -8, 9, 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = flash ? white : '#6d5636';
      ctx.fillRect(-11, 7, 22, 4);
      ctx.fillStyle = flash ? white : '#dbc08a';
      ctx.fillRect(-11, 7, 22, 1.5);
      ctx.fillStyle = '#5c4a2e';
      ctx.fillRect(-2, -14, 4, 4);
      const cl = Math.sin(t * 2.5 + e.x) * 4;
      ctx.strokeStyle = '#463b28'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(cl, 12); ctx.stroke();
      ctx.fillStyle = '#463b28';
      ctx.beginPath(); ctx.arc(cl, 13, 3, 0, 7); ctx.fill();
      ctx.fillStyle = e.countering ? '#ff3b30' : '#2b2214';
      ctx.fillRect(-4, -5, 8, 2.5);
      if (e.countering) {
        ctx.strokeStyle = 'rgba(255,60,48,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 14 + Math.sin(t * 20) * 2, 0, 7); ctx.stroke();
      }
      break;
    }
    case 'badajo_errante': {
      const st = e.atk;
      if (st.state === 'windup') { // aviso: línea de carga en la dirección elegida
        ctx.strokeStyle = 'rgba(171,71,188,' + (0.4 + 0.4 * Math.abs(Math.sin(t * 20))) + ')';
        ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(st.dir[0] * 36, st.dir[1] * 36); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = flash ? white : '#6d5636'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 1); ctx.stroke();
      const gb = ctx.createRadialGradient(-2, 3, 1, 0, 5, 9);
      gb.addColorStop(0, flash ? white : '#d8b877'); gb.addColorStop(1, flash ? white : '#7a5f38');
      ctx.fillStyle = gb;
      ctx.beginPath(); ctx.arc(0, 5, 8, 0, 7); ctx.fill();
      ctx.fillStyle = flash ? white : '#4a3a22';
      ctx.beginPath(); ctx.arc(0, -10, 2.5, 0, 7); ctx.fill();
      break;
    }
    case 'girandula': {
      const rot = e.spin * 2.2;
      ctx.rotate(rot);
      ctx.fillStyle = flash ? white : '#c9a24d';
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(3, -3); ctx.lineTo(12, -2); ctx.lineTo(2, 3); ctx.closePath(); ctx.fill();
      }
      ctx.rotate(-rot);
      ctx.fillStyle = flash ? white : '#8fdc8f';
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill();
      break;
    }
    case 'remora_de_tinta': {
      const wob = Math.sin(t * 8 + e.x) * 0.5;
      ctx.fillStyle = flash ? white : '#3949AB';
      ctx.beginPath();
      ctx.moveTo(-7, 0); ctx.quadraticCurveTo(-13, -3 + wob * 3, -15, wob * 4);
      ctx.quadraticCurveTo(-12, 2, -7, 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = flash ? white : '#2a2a6b';
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 6, wob * 0.2, 0, 7); ctx.fill();
      ctx.fillStyle = '#c7ccf0';
      ctx.beginPath(); ctx.arc(4, -1, 1.6, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(57,73,171,0.5)'; ctx.fillRect(-1, 6, 2, 3);
      break;
    }
    case 'peon_de_sebo': {
      const wob = Math.sin(t * 7 + e.x) * 1.1;
      ctx.fillStyle = flash ? white : '#d9c48d';
      ctx.beginPath(); ctx.ellipse(0, 3, 7, 8 + wob * 0.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = flash ? white : '#efe0b8';
      ctx.beginPath(); ctx.ellipse(-1, 1, 3, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#463b30'; ctx.fillRect(-0.7, -8, 1.6, 5);
      ctx.fillStyle = 'rgba(255,120,60,0.85)';
      ctx.beginPath(); ctx.ellipse(0.2, -10 + Math.sin(t * 12) * 0.6, 1.8, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#2e2620'; ctx.fillRect(-3, 0, 1.5, 2); ctx.fillRect(1.5, 0, 1.5, 2);
      break;
    }
    case 'cimbalo': {
      const gc = ctx.createLinearGradient(-11, 0, 11, 0);
      gc.addColorStop(0, flash ? white : '#d8b877'); gc.addColorStop(0.5, flash ? white : '#a5813f'); gc.addColorStop(1, flash ? white : '#d8b877');
      ctx.fillStyle = gc;
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 4.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = flash ? white : '#6d5636';
      ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, 7); ctx.fill();
      if (e.fireCd > (e.def.proyectil?.cadencia_s ?? 1.3) - 0.14) { // chispazo al disparar
        ctx.strokeStyle = 'rgba(171,71,188,0.85)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(5, -3); ctx.lineTo(9, -8); ctx.lineTo(7, -4); ctx.lineTo(12, -7); ctx.stroke();
      }
      break;
    }
    case 'saltahoras': {
      ctx.globalAlpha = e._blinkTele ? (0.35 + 0.45 * Math.abs(Math.sin(t * 30))) : 0.85;
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, e.r + 1);
      g.addColorStop(0, flash ? white : '#c9a0f0'); g.addColorStop(1, 'rgba(60,40,90,0.15)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, 0, e.r * 0.9, e.r * 1.1, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(240,220,255,0.75)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(4, -5); ctx.lineTo(-4, 5); ctx.lineTo(4, 5); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -2, 1.4, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'broquel': {
      const fa = e._faceAng ?? 0;
      ctx.fillStyle = flash ? white : '#7a5f38';
      ctx.beginPath(); ctx.ellipse(0, 2, 7, 9, 0, 0, 7); ctx.fill();
      ctx.fillStyle = flash ? white : '#2b2214'; ctx.fillRect(-3, -3, 2, 2); ctx.fillRect(1, -3, 2, 2);
      ctx.save();
      ctx.translate(Math.cos(fa) * 9, Math.sin(fa) * 9 * 0.6); ctx.rotate(fa);
      const gs = ctx.createLinearGradient(-4, 0, 4, 0);
      gs.addColorStop(0, flash ? white : '#d8b877'); gs.addColorStop(1, flash ? white : '#8a6c3e');
      ctx.fillStyle = gs;
      ctx.beginPath(); ctx.ellipse(0, 0, 4, 8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#5c4a2e'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, 7); ctx.fill();
      ctx.restore();
      break;
    }
    case 'cumulo_de_sebo': {
      const wob = Math.sin(t * 5 + e.x) * 1.2;
      ctx.fillStyle = flash ? white : '#d3bd88';
      ctx.beginPath(); ctx.ellipse(0, 2, 11, 12 + wob * 0.3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = flash ? white : '#efe0b8';
      ctx.beginPath(); ctx.ellipse(-2, -1, 4, 5, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(90,70,40,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(2, -2); ctx.lineTo(-2, 4); ctx.lineTo(1, 11); ctx.stroke();
      ctx.fillStyle = '#3a3226'; ctx.fillRect(-5, -2, 2, 3); ctx.fillRect(3, -2, 2, 3);
      break;
    }
    case 'restaurador': {
      const pul = Math.sin(t * 3) * 0.15;
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, e.r + 4);
      g.addColorStop(0, 'rgba(143,220,143,0.35)'); g.addColorStop(1, 'rgba(143,220,143,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, e.r + 4, 0, 7); ctx.fill();
      ctx.fillStyle = flash ? white : '#c8c090';
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = flash ? white : '#fff2c8'; ctx.fillRect(-2, -3, 4, 6);
      ctx.fillStyle = '#8fdc8f'; ctx.beginPath(); ctx.arc(0, 0, 2 + pul, 0, 7); ctx.fill();
      break;
    }
    default: {
      ctx.fillStyle = flash ? white : e.elementColor;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, 7); ctx.fill();
    }
  }
  ctx.restore();

  if (e.melees && atk.state === 'windup') {
    const A = DataDB.balance.enemigo_melee;
    const k = 1 - atk.t / A.windup_s;
    const inWindow = atk.t <= DataDB.balance.parry.window_s;
    const base = Math.atan2(atk.dir[1] * KY, atk.dir[0]);
    ctx.strokeStyle = inWindow && Math.floor(t * 14) % 2 === 0 ? '#7ee8e0' : `rgba(${telc},${0.35 + k * 0.55})`;
    ctx.lineWidth = 2 + k * 1.5;
    ctx.beginPath();
    ctx.ellipse(SX(e.x), SY(e.y), e.r + 8, (e.r + 8) * KY, 0, base - 0.5 - k * 0.4, base + 0.5 + k * 0.4);
    ctx.stroke();
  }
  if (e.melees && atk.state === 'stunned') {
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + i * Math.PI * 2 / 3;
      ctx.fillStyle = i % 2 ? '#ffd54f' : '#7ee8e0';
      ctx.fillRect(x + Math.round(Math.cos(a) * 11) - 1, y - e.r - 8 + Math.round(Math.sin(a) * 3) - 1, 2, 2);
    }
  }
  if (e.def.jefe && e.belling > 0) {
    const k = 1 - e.belling / 0.9;
    const rr = 92 * (0.25 + k * 0.75);
    ctx.strokeStyle = `rgba(255,213,79,${0.25 + k * 0.6})`;
    ctx.lineWidth = 2 + k * 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.ellipse(SX(e.x), SY(e.y), rr, rr * KY, 0, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (e.id === 'velon_inestable' && e.priming > 0) {
    const k = 1 - e.priming / e.def.explosion.telegraph_s;
    const rr = e.def.explosion.radio_px * (0.6 + k * 0.4);
    ctx.strokeStyle = `rgba(90,167,232,${0.3 + k * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.ellipse(SX(e.x), SY(e.y), rr, rr * KY, 0, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
  }

  if (e.health.hp < e.health.max) {
    const w = Math.max(18, e.r * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2, y - e.r - 10, w, 3);
    ctx.fillStyle = '#c94f4f';
    ctx.fillRect(x - w / 2, y - e.r - 10, Math.round(w * e.health.hp / e.health.max), 3);
  }
}

function drawProjectiles() {
  world.tears.forEach(tr => {
    const a = Math.atan2(tr.vy, tr.vx);
    const x = SX(tr.x), y = SY(tr.y, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(SX(tr.x), SY(tr.y), 2.5, 1.2, 0, 0, 7); ctx.fill();
    const col = tr.elemento !== 'neutro' ? (DataDB.elementos[tr.elemento]?.color ?? '#a9c0ff') : null;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 8);
    g.addColorStop(0, col ? col + '59' : 'rgba(150,180,255,0.35)');
    g.addColorStop(1, 'rgba(150,180,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill();
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = col ?? '#a9c0ff';
    ctx.beginPath();
    ctx.moveTo(-6, 0); ctx.quadraticCurveTo(-2, -3.5, 2, -3);
    ctx.arc(2, 0, 3.2, -1.2, 1.2);
    ctx.quadraticCurveTo(-2, 3.5, -6, 0);
    ctx.fill();
    ctx.fillStyle = '#e6eeff';
    ctx.fillRect(1, -2, 2, 2);
    ctx.restore();
  });
  world.bullets.forEach(b => {
    const a = Math.atan2(b.vy, b.vx);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(SX(b.x), SY(b.y), 2.5, 1.2, 0, 0, 7); ctx.fill();
    ctx.save();
    ctx.translate(SX(b.x), SY(b.y, 8)); ctx.rotate(a);
    ctx.fillStyle = b.color;
    ctx.fillRect(-5, -1, 10, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(3, -1, 3, 2);
    ctx.restore();
  });
}

// Rastros del dash: tinta del Aceite negro (R1.4) o brasas de Ascuas (R2)
function drawTrails() {
  for (const tr of world.trails) {
    const a = Math.min(0.55, tr.t);
    ctx.globalAlpha = a;
    ctx.fillStyle = tr.fuego ? '#3a1408' : '#161228';
    ctx.beginPath(); ctx.ellipse(SX(tr.x), SY(tr.y), 13, 13 * KY, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = a * 0.5;
    ctx.fillStyle = tr.fuego ? '#ff7a2e' : '#3d2f6e';
    ctx.beginPath(); ctx.ellipse(SX(tr.x), SY(tr.y), 8, 8 * KY, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawShockwaves() {
  for (const s of world.shockwaves) {
    const k = 1 - s.t / s.tmax;
    const r = s.r0 + (s.r1 - s.r0) * k;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.5 - k * 1.5;
    ctx.beginPath();
    ctx.ellipse(SX(s.x), SY(s.y), r, r * KY, 0, 0, 7);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawHeart(x, y, fill, t) {
  const beat = fill > 0 ? 1 + Math.sin(t * 3.5) * 0.04 : 1;
  ctx.save();
  ctx.translate(x + 6, y + 6);
  ctx.scale(beat, beat);
  // Corazón de cera pintado (lleno/medio/vacío); si falta, el corazón vectorial.
  const hid = fill === 2 ? 'hud_heart_full' : fill === 1 ? 'hud_heart_half' : 'hud_heart_empty';
  if (drawIconCentered(hid, 0, 0, 14)) { ctx.restore(); return; }
  ctx.translate(-6, -6);
  const shape = (half) => {
    ctx.beginPath();
    ctx.moveTo(6, 11);
    ctx.lineTo(half ? 6 : 12, 5);
    ctx.lineTo(half ? 6 : 12, 2);
    ctx.lineTo(half ? 6 : 10, 0);
    ctx.lineTo(6, 2);
    ctx.lineTo(2, 0);
    ctx.lineTo(0, 2);
    ctx.lineTo(0, 5);
    ctx.closePath();
  };
  ctx.fillStyle = '#352b4e'; shape(false); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; shape(false); ctx.stroke();
  if (fill > 0) {
    ctx.fillStyle = '#d8454f'; shape(fill === 1); ctx.fill();
    ctx.fillStyle = '#f28d95';
    ctx.fillRect(2, 2, 2, 2);
  }
  ctx.restore();
}

function drawSpellGlyph(tipo, x, y, col) {
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  if (tipo === 'nova') {
    ctx.fillRect(x - 4, y - 1, 8, 2);
    ctx.fillRect(x - 1, y - 4, 2, 8);
    ctx.fillRect(x - 3, y - 3, 2, 2); ctx.fillRect(x + 1, y + 1, 2, 2);
    ctx.fillRect(x + 1, y - 3, 2, 2); ctx.fillRect(x - 3, y + 1, 2, 2);
  } else if (tipo === 'onda') {
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 5, -0.6, 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 5, Math.PI - 0.6, Math.PI + 0.6); ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x - 3, y + 4);
    ctx.quadraticCurveTo(x - 4, y - 2, x, y - 5);
    ctx.quadraticCurveTo(x + 4, y - 2, x + 3, y + 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff2c8';
    ctx.fillRect(x - 1, y, 2, 3);
  }
}

function drawHUD(t) {
  const p = world.player;
  // Velo superior suave (degradado) en vez de barra plana: deja respirar la
  // escena como en la referencia, manteniendo legible el texto del HUD.
  const topG = ctx.createLinearGradient(0, 0, 0, 54);
  topG.addColorStop(0, 'rgba(9,7,18,0.5)'); topG.addColorStop(1, 'rgba(9,7,18,0)');
  ctx.fillStyle = topG; ctx.fillRect(0, 0, VW, 54);
  const hearts = Math.ceil(p.health.max / 2);
  for (let i = 0; i < hearts; i++) {
    const rest = p.health.hp - i * 2;
    drawHeart(12 + i * 17, 8, rest >= 2 ? 2 : rest === 1 ? 1 : 0, t);
  }
  // Fila del oro: oro → sello → objeto activo, en FLUJO medido (nada de x fijas:
  // con oro de 2-3 cifras las posiciones fijas de antes se pisaban entre sí).
  if (!drawIconCentered('hud_oro', 17, 31, 13)) {
    ctx.fillStyle = '#8a6d2f'; ctx.beginPath(); ctx.arc(18, 31, 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8c565'; ctx.beginPath(); ctx.arc(17, 30, 4.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff2c8'; ctx.fillRect(15, 28, 2, 2);
  }
  font(10); ctx.fillStyle = '#cfc6e8'; ctx.textAlign = 'left';
  const oroTxt = '× ' + RunState.oro;
  ctx.fillText(oroTxt, 28, 35);
  let gx = 28 + ctx.measureText(oroTxt).width + 9;
  // Sello elemental equipado: rombo de su elemento tras el oro
  if (GameState.selloEquipado) {
    const sd = selloDef(GameState.selloEquipado);
    const col = DataDB.elementos[sd?.elemento]?.color ?? '#e9e2f5';
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(gx + 4, 26); ctx.lineTo(gx + 8, 31); ctx.lineTo(gx + 4, 36); ctx.lineTo(gx, 31); ctx.closePath(); ctx.fill();
    gx += 15;
  }
  // Objeto activo (X): carga por salas limpiadas
  if (p.mods.activo) {
    const cd = p.mods.activo.cooldown_salas;
    const listo = RunState.activoSalas >= cd;
    font(9);
    ctx.fillStyle = listo ? '#e8c565' : '#6c6193';
    ctx.fillText(`⌛${listo ? ' X' : ` ${Math.min(RunState.activoSalas, cd)}/${cd}`}`, gx, 35);
  }

  const spMax = DataDB.balance.ignicion.sp_max;
  const k = RunState.sp / spMax;
  const full = k >= 1;
  font(8); ctx.fillStyle = '#8d82ad';
  ctx.fillText('SP', 12, 45);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(28, 39, 72, 5);
  ctx.fillStyle = full ? (Math.floor(t * 4) % 2 ? '#ffe28a' : '#ffb547') : world.player.ignicionT > 0 ? '#ff9c3a' : '#b08d57';
  ctx.fillRect(28, 39, Math.round(72 * k), 5);
  if (full && world.player.ignicionT <= 0) {
    font(8); ctx.fillStyle = '#ffe28a'; ctx.textAlign = 'left';
    ctx.fillText('¡F!', 104, 45);
  }
  // Marco dorado biselado de la barra de SP.
  const spGr = ctx.createLinearGradient(0, 38, 0, 45);
  spGr.addColorStop(0, '#e9c877'); spGr.addColorStop(1, '#8a6a2c');
  ctx.strokeStyle = spGr; ctx.lineWidth = 1; ctx.strokeRect(27.5, 38.5, 73, 6);
  // Latido de beat: destello suave del marco al ritmo de la pista (aditivo, sin lógica).
  if (beatInfo.active && beatInfo.pulse > 0.02) {
    ctx.save();
    ctx.globalAlpha = beatInfo.pulse * 0.55;
    ctx.strokeStyle = '#fff2c0'; ctx.lineWidth = 1.4;
    ctx.strokeRect(26.5, 37.5, 75, 8);
    ctx.restore();
  }

  // Groove/racha (G7c): barra fina bajo el SP, solo si hay racha. Al llenar el
  // umbral late y cambia a rojo-ámbar (buff de daño y velocidad activo).
  const gv = world.player.grooveFrac;
  if (gv > 0.01) {
    const buffed = world.player.grooveBuffed;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(28, 46, 72, 3);
    const pulse = buffed ? (Math.floor(t * 8) % 2 ? '#ff7a2e' : '#ffd54f') : '#c86bd8';
    ctx.fillStyle = pulse;
    ctx.fillRect(28, 46, Math.round(72 * gv), 3);
    if (buffed) {
      // Bajo la propia barra de racha, alineado con ella (antes caía en x=104
      // y se montaba con el ¡F! del SP y el borde de la caja del Arte).
      font(7); ctx.fillStyle = '#ffd54f'; ctx.textAlign = 'left';
      ctx.fillText('¡RACHA!', 28, 57);
    }
  }

  // Compás: banner dorado centrado arriba, como la referencia (así no compite
  // con la columna izquierda). En retrato no hay sitio: texto simple como antes.
  const comp = DataDB.compas(RunState.compas);
  if (comp) {
    font(8); ctx.textAlign = 'left';
    const txt = '♪ ' + comp.nombre + ' (C)';
    // Pip de beat: un puntito que se enciende en cada golpe de la pista, junto al
    // banner del compás → refuerza "el compás late con la música". Puro adorno.
    const pip = (px, py) => {
      if (!beatInfo.active) return;
      const r = 1.6 + beatInfo.pulse * 2.2;
      ctx.save();
      ctx.globalAlpha = 0.35 + beatInfo.pulse * 0.6;
      ctx.fillStyle = comp.color;
      ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
      ctx.restore();
    };
    if (PORTRAIT) {
      ctx.fillStyle = comp.color;
      ctx.fillText(txt, 110, 31);
      pip(104, 31);
    } else {
      const b = hudBanner(txt, VW / 2, 3, { side: 'center' });
      ctx.fillStyle = comp.color;
      ctx.fillText(txt, b.tx, b.cy);
      pip(b.tx + ctx.measureText(txt).width + 8, b.cy);
    }
  }

  // Arte equipada + reliquias: en su propia zona (x≥152), lejos del ¡F!/¡RACHA!
  // del SP con los que antes chocaban.
  const hch = DataDB.hechizo(RunState.hechizo);
  if (hch) {
    const okSp = RunState.sp >= hch.coste_sp;
    const bx = 152, by = 35;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx, by, 34, 12);
    ctx.strokeStyle = okSp ? '#b678e8' : '#37335c';
    ctx.strokeRect(bx + 0.5, by + 0.5, 33, 11);
    const col = DataDB.elementos[hch.elemento]?.color ?? '#bcd0ff';
    ctx.globalAlpha = okSp ? 1 : 0.4;
    // Icono de Arte pintado (por hechizo); si falta, el glifo vectorial.
    if (!drawIconCentered('arte_' + RunState.hechizo, bx + 8, by + 6, 12))
      drawSpellGlyph(hch.tipo, bx + 8, by + 6, col);
    font(8); ctx.fillStyle = okSp ? '#cfc6e8' : '#55496e'; ctx.textAlign = 'left';
    ctx.fillText('Q' + hch.coste_sp, bx + 16, by + 10);
    ctx.globalAlpha = 1;
  }

  RunState.items.slice(0, 10).forEach((id, i) => {
    const it = DataDB.item(id);
    const ix = 194 + i * 13, iy = 36;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(ix, iy, 11, 11);
    // Icono de reliquia pintado, contenido dentro de la caja de 11×11.
    const spr = Sprites.get('icono_' + id);
    if (spr) {
      const inf = Sprites.info('icono_' + id);
      const s = Math.min(11 / inf.w, 11 / inf.h);
      const dw = inf.w * s, dh = inf.h * s;
      ctx.drawImage(spr, ix + (11 - dw) / 2, iy + (11 - dh) / 2, dw, dh);
    } else {
      const col = TAG_COLORS[it?.tags?.[0]] ?? '#e9e2f5';
      ctx.fillStyle = col; ctx.fillRect(ix + 2, iy + 2, 7, 7);
      ctx.fillStyle = '#141120';
      font(6); ctx.textAlign = 'center';
      ctx.fillText((it?.nombre ?? '?')[0].toUpperCase(), ix + 5.5, iy + 9);
    }
  });

  // Cartela de piso ornamentada arriba a la derecha (como "Piso 1 · Entrada").
  const label = {
    inicial: 'entrada', camara: 'cámara', galeria: 'galería', normal: 'sala',
    tesoro: 'tesoro', jefe: 'JEFE', tienda: 'tienda', maldita: 'MALDITA'
  }[cur?.type] ?? '';
  font(8); ctx.textAlign = 'left';
  const flTxt = 'Piso ' + RunState.piso + ' · ' + label;
  const fb = hudBanner(flTxt, VW - 6, 3, { side: 'right' });
  ctx.fillStyle = '#e8dcae';
  ctx.fillText(flTxt, fb.tx, fb.cy);

  // Recordatorio de controles (solo teclado): abajo y centrado, unos segundos al
  // entrar a un piso. Antes iba fijo arriba a la derecha en fuente grande y se
  // solapaba con corazones/oro/SP/compás/items (queja de Daniel).
  if (hudHintT > 0 && !Input.touchState().enabled) {
    const hint = Input.scheme() === 'flechas'
      ? 'Flechas mover · WASD disparar · E parada · Q arte · Tab equipo'
      : 'WASD mover · clic disparar · E parada · Q arte · Tab equipo';
    const a = Math.min(1, hudHintT / 1.5);
    font(7); ctx.textAlign = 'center';
    const tw = ctx.measureText(hint).width;
    const hy = VH - 12;
    ctx.fillStyle = `rgba(10,8,20,${0.5 * a})`;
    ctx.fillRect(VW / 2 - tw / 2 - 6, hy - 8, tw + 12, 12);
    ctx.fillStyle = `rgba(159,148,192,${a})`;
    ctx.fillText(hint, VW / 2, hy);
  }

  // Efectos de MUNDO (peligros de bioma + telegrafías del jefe): se dibujan con el
  // MISMO zoom/cámara que el mundo. Antes iban en coords de pantalla (sin ZOOM) y en
  // móvil (ZOOM≠1) se desalineaban — las áreas del jefe parecían "seguir" al jugador.
  const [shkx, shky] = FX.shakeOffset();
  ctx.save();
  ctx.translate(Math.round(shkx), Math.round(shky));
  ctx.scale(ZOOM, ZOOM);
  drawBiomaExtras(t);
  if (world.bossDir) drawBossZonas(world.bossDir, t);
  if (showDebug) drawHitboxes();
  ctx.restore();
  if (world.bossDir) drawBossHP(world.bossDir); // barra de vida grande = HUD de pantalla
  drawMinimap();

  if (flashT > 0) {
    font(12); ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255,213,79,${Math.min(1, flashT)})`;
    ctx.fillText(flashMsg, VW / 2, 66);
    if (flashSub) {
      font(9);
      ctx.fillStyle = `rgba(207,198,232,${Math.min(1, flashT)})`;
      ctx.fillText(flashSub, VW / 2, 82);
    }
  }
  if (showDebug) {
    font(9); ctx.textAlign = 'left'; ctx.fillStyle = '#7ec98f';
    const lines = [
      'fps ' + fps.toFixed(0),
      'sala (' + (cur?.gx ?? '?') + ',' + (cur?.gy ?? '?') + ') ' + (cur?.type ?? '') + (cur?.template ? ' · ' + cur.template : ''),
      'enemigos ' + world.enemies.filter(e => !e.health.dead).length + ' · partículas ' + FX.parts.length,
      'sp ' + RunState.sp + ' · move_speed ' + DataDB.balance.player.move_speed + ' (F5)',
      'INPUT down[' + Input.debugState().down + '] pad[' + Input.debugState().padMove + ']',
      'semilla ' + RunState.semilla
    ];
    lines.forEach((l, i) => ctx.fillText(l, 10, VH - 72 + i * 11));
  }
}

function drawMinimap() {
  const CW = 11, CH = 8, GAP = 2;
  const known = new Map();
  const vesper = GameState.tiene('diario_de_vesper') || world.player?.mods.revealMap; // revela toda la Torre
  for (const [k, room] of floorMap.rooms) {
    if (room.visited) {
      known.set(k, 'visited');
      for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
        const nk = (room.gx + dx) + ',' + (room.gy + dy);
        if (floorMap.rooms.has(nk) && !known.has(nk)) known.set(nk, 'adj');
      }
    } else if (vesper && !known.has(k)) known.set(k, 'adj');
  }
  let minGx = 99, minGy = 99, maxGx = -1;
  for (const k of known.keys()) {
    const [gx, gy] = k.split(',').map(Number);
    minGx = Math.min(minGx, gx); maxGx = Math.max(maxGx, gx); minGy = Math.min(minGy, gy);
  }
  // Bajo la cartela de piso; en táctil se aparta a la izquierda de los botones
  // pausa/menú del borde derecho (la Torre es vertical: el minimapa crece hacia
  // abajo y antes se metía debajo de esos botones).
  const padR = Input.touchState().enabled ? 38 : 12;
  const ox = VW - padR - (maxGx - minGx + 1) * (CW + GAP), oy = 24;
  const ICON = { tesoro: '#e8c565', tienda: '#7ec98f', jefe: '#e05a4f', maldita: '#b678e8', evento: '#d9a441', desafio: '#7ee8e0' };
  for (const [k, vis] of known) {
    const [gx, gy] = k.split(',').map(Number);
    const room = floorMap.rooms.get(k);
    const x = ox + (gx - minGx) * (CW + GAP), y = oy + (gy - minGy) * (CH + GAP);
    const isCur = room === cur;
    ctx.fillStyle = vis === 'adj' ? 'rgba(60,52,90,0.55)'
      : isCur ? 'rgba(233,226,245,0.9)'
      : room.cleared ? 'rgba(120,108,160,0.7)' : 'rgba(90,80,130,0.7)';
    ctx.fillRect(x, y, CW, CH);
    if (room.type !== 'normal' && room.type !== 'inicial' && room.type !== 'camara' && room.type !== 'galeria') {
      ctx.fillStyle = ICON[room.type] ?? 'transparent';
      ctx.fillRect(x + CW / 2 - 1.5, y + CH / 2 - 1.5, 3, 3);
    }
    if (isCur) {
      ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 1;
      ctx.strokeRect(x - 0.5, y - 0.5, CW + 1, CH + 1);
    }
  }
}

// ---------- Overlay táctil (sticks + botones) ----------
const ECO_COL = { golpe: '#ffd54f', ritmo: '#ffd54f', dash: '#8fa2ff', arte: '#b678e8', ignicion: '#ffb547' };
const ECO_TXT = { golpe: 'golpe', ritmo: '♪', dash: 'dash', arte: 'ARTE', ignicion: '¡IGNICIÓN!' };
// ---------- Pantalla de título ----------
// Rects de las dos opciones del título cuando hay partida guardada (Reanudar / Pueblo).
function titleOptRect(i) { return { x: (VW - 220) / 2, y: VH / 2 + 30 + i * 52, w: 220, h: 44 }; }

function drawTitle(t) {
  const port = Sprites.get('portada_titulo');
  if (port) {
    // Portada pintada: cubre la pantalla manteniendo el aspecto (cover) y una
    // veladura vertical para que el título y el prompt se lean sobre la pintura.
    const inf = Sprites.info('portada_titulo');
    const scale = Math.max(VW / inf.w, VH / inf.h);
    const dw = inf.w * scale, dh = inf.h * scale;
    ctx.drawImage(port, (VW - dw) / 2, (VH - dh) / 2, dw, dh);
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, 'rgba(11,8,25,0.5)');
    g.addColorStop(0.45, 'rgba(11,8,25,0.05)');
    g.addColorStop(1, 'rgba(11,8,25,0.8)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  } else {
    ctx.fillStyle = '#0b0819'; ctx.fillRect(0, 0, VW, VH);
    // péndulo de fondo (fallback procedural sin portada)
    const a = Math.sin(t * 0.9) * 0.35;
    ctx.strokeStyle = 'rgba(90,79,160,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(VW / 2, -8);
    ctx.lineTo(VW / 2 + Math.sin(a) * 150, 130 + Math.cos(a) * 20); ctx.stroke();
    ctx.fillStyle = 'rgba(201,162,74,0.5)';
    ctx.beginPath(); ctx.arc(VW / 2 + Math.sin(a) * 150, 132 + Math.cos(a) * 20, 10, 0, 7); ctx.fill();
    // esfera de reloj tenue
    ctx.strokeStyle = 'rgba(90,79,160,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(VW / 2, VH / 2 + 10, 120, 0, 7); ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const h = i / 12 * Math.PI * 2;
      ctx.fillStyle = 'rgba(141,130,173,0.35)';
      ctx.fillRect(VW / 2 + Math.cos(h) * 112 - 1, VH / 2 + 10 + Math.sin(h) * 112 - 1, 2, 2);
    }
  }
  font(26); ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd54f';
  ctx.fillText('MISTVEIL', VW / 2, VH / 2 - 26);
  font(11); ctx.fillStyle = '#b9aee0';
  ctx.fillText('El Reloj de las Almas', VW / 2, VH / 2 - 4);
  const hayRun = GameState.flags.tutorialHecho && SaveManager.hasRun();
  if (hayRun) {
    // Menú de dos botones con foco: Reanudar (dorado) / Pueblo. El input lo gestiona el título.
    const rs = SaveManager.loadRun();
    const labels = ['REANUDAR — Piso ' + (rs?.piso ?? 1), 'PUEBLO (nueva partida)'];
    for (let i = 0; i < 2; i++) {
      const r = titleOptRect(i);
      UIK.boton(ctx, font, { x: r.x, y: r.y, w: r.w, h: r.h, label: labels[i], foco: i === titleIdx, tono: i === 0 ? 'primary' : 'normal', t });
    }
    UIK.glyphBar(ctx, font, Input, [{ k: 'nav', txt: 'elegir' }, { k: 'confirm', txt: 'aceptar' }], VW, VH);
  } else {
    font(9); ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(233,226,245,${0.55 + Math.sin(t * 3) * 0.35})`;
    const touch = Input.touchState().enabled;
    ctx.fillText(touch ? 'toca para ' : 'Enter para ', VW / 2, VH / 2 + 46);
    font(11); ctx.fillStyle = '#7ee8e0';
    ctx.fillText(GameState.flags.tutorialHecho ? 'CONTINUAR' : 'DAR CUERDA (tutorial)', VW / 2, VH / 2 + 62);
  }
  if (GameState.flags.tutorialHecho) {
    ctx.textAlign = 'center';
    font(7); ctx.fillStyle = '#6c6193';
    // Con menú, las estadísticas van entre subtítulo y botones (abajo lo ocupa la barra de glifos).
    const statsY = hayRun ? VH / 2 + 16 : VH / 2 + 78;
    ctx.fillText('Nv.' + GameState.nivel + ' · ' + GameState.engranajes + ' engranajes · ◆ ' + GameState.memoria, VW / 2, statsY);
  }
  if (!hayRun) { // la coletilla estorbaría a la barra de glifos del menú
    font(7); ctx.fillStyle = '#4a4468';
    ctx.fillText('un roguelite de relojería y ritmo', VW / 2, VH - 18);
  }
}

// ---------- Pantalla de título (fin) ----------
function drawTouchEcos() {
  const now = performance.now();
  for (const e of Input.touchEcos()) {
    const age = (now - e.t) / 420;
    if (age >= 1) continue;
    const col = ECO_COL[e.tipo] ?? '#8d82ad';
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = col; ctx.lineWidth = 2.5 - age * 1.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, 9 + age * 26, 0, 7); ctx.stroke();
    font(8); ctx.textAlign = 'center'; ctx.fillStyle = col;
    ctx.fillText(ECO_TXT[e.tipo] ?? '', e.x, e.y - 18 - age * 10);
    ctx.globalAlpha = 1;
  }
  // Anillo de carga del long-press (Arte): se rellena bajo el pulgar
  const h = Input.holdState();
  if (h) {
    const frac = Math.min(1, (performance.now() - h.t0) / 250);
    if (frac > 0.25) {
      ctx.strokeStyle = '#b678e8'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(h.x, h.y, 22, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
    }
  }
}
function drawTouchUI(t) {
  const ts = Input.touchState();
  if (!ts.enabled || (mode !== 'play' && mode !== 'pueblo')) return;
  // UNA MANO: rombo de fijado sobre el enemigo objetivo (el juego dispara solo)
  const lk = Input.scheme() === 'una_mano' ? world.player?.lockE : null;
  if (lk && !lk.health.dead && mode === 'play') {
    const x = SX(lk.x), y = SY(lk.y) - lk.r - 14 + Math.sin(t * 5) * 1.5;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(255,213,79,0.9)';
    ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = '#0b0819';
    ctx.fillRect(-1.6, -1.6, 3.2, 3.2);
    ctx.restore();
  }
  ctx.save();
  // Sticks: base en el origen del toque, perilla desplazada
  for (const st of [ts.move, ts.aim]) {
    if (st.id === null) continue;
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#cfc6e8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(st.ox, st.oy, 34, 0, 7); ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = st === ts.aim ? '#ffb547' : '#cfc6e8';
    ctx.beginPath(); ctx.arc(st.ox + st.x * 34, st.oy + st.y * 34, 13, 0, 7); ctx.fill();
  }
  // Botones (en una mano el stick es toda la pantalla y no hay botones de combate)
  const p = world.player;
  for (const b of ts.buttons) {
    let on = true, col = '#cfc6e8';
    if (b.code === 'TouchF') { on = RunState.sp >= DataDB.balance.ignicion.sp_max && p.ignicionT <= 0; col = '#ffb547'; }
    if (b.code === 'TouchQ') { const h = DataDB.hechizo(RunState.hechizo); on = h && RunState.sp >= h.coste_sp; col = '#b678e8'; }
    if (b.code === 'TouchB') { on = p.parryCd <= 0; col = '#7ee8e0'; }
    if (b.code === 'TouchD') { on = p.dashCd <= 0; col = '#8fa2ff'; }
    if (b.code === 'TouchA') col = '#ffd54f';
    if (b.code === 'TouchMenu') col = '#ffd54f';
    if (b.code === 'TouchX') {
      if (!p.mods.activo) continue; // el botón solo existe si llevas un objeto activo
      on = RunState.activoSalas >= p.mods.activo.cooldown_salas; col = '#e8c565';
    }
    // Depresión visual: 160ms de pulso al tocar (input→respuesta visible)
    const pk = b.pressT ? Math.max(0, 1 - (performance.now() - b.pressT) / 160) : 0;
    const rr = b.r * (1 - pk * 0.12);
    // Medallón pintado si existe para este botón (pausa y ≡ siguen por código)
    const MEDALLONES = { TouchB: 'boton_campana', TouchC: 'boton_nota', TouchQ: 'boton_pluma', TouchF: 'boton_llama', TouchX: 'boton_reloj' };
    const med = Sprites.get(MEDALLONES[b.code]);
    if (med) {
      if (pk > 0) { // resplandor de pulsación detrás del medallón (feedback sutil)
        ctx.globalAlpha = pk * 0.4;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2);
        g.addColorStop(0, col); g.addColorStop(1, col + '00');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = b.pressed ? 1 : on ? 0.62 + pk * 0.3 : 0.22;
      ctx.drawImage(med, b.x - rr, b.y - rr, rr * 2, rr * 2);
      if (pk > 0) { // onda que sale del medallón
        ctx.globalAlpha = pk * 0.55;
        ctx.strokeStyle = col; ctx.lineWidth = 2 + pk * 2;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + (1 - pk) * 16, 0, 7); ctx.stroke();
      }
      if (b.r > 20) { // etiqueta pequeña bajo el medallón grande (claridad)
        ctx.globalAlpha = 0.75;
        font(6); ctx.textAlign = 'center'; ctx.fillStyle = col;
        ctx.fillText(b.label, b.x, b.y + rr + 8);
      }
      continue;
    }
    ctx.globalAlpha = b.pressed ? 0.95 : on ? 0.45 + pk * 0.4 : 0.18;
    ctx.fillStyle = pk > 0 ? '#241f3a' : '#141120';
    ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, 7); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2 + pk * 1.5;
    ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, 7); ctx.stroke();
    if (pk > 0) { // onda que sale del botón
      ctx.globalAlpha = pk * 0.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + (1 - pk) * 12, 0, 7); ctx.stroke();
      ctx.globalAlpha = b.pressed ? 0.95 : 0.45 + pk * 0.4;
    }
    ctx.fillStyle = col;
    font(b.r > 24 ? 11 : 8); ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x, b.y + (b.r > 24 ? 8 : 6));
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---------- Pueblo (hub entre runs) ----------
function enterPueblo() {
  resetVisita();
  dlg = null; puebloAviso = null;
  if (!world.player) world.player = new Player(0, 0);
  const p = world.player;
  p.x = PLAZA.x + 40; p.y = PLAZA.y + PLAZA.h * 0.62;
  p.vx = p.vy = 0;
  p.health.hp = Math.max(p.health.hp, 2); // Pip se reenciende
  // -80 (antes +30): baja a Pip y los NPCs sobre el adoquinado del fondo pintado
  cam.x = puebloCamX(); cam.y = PLAZA.y + PLAZA.h / 2 - 80 - (VHz / 2) / KY;
  mode = 'pueblo';
}
function puebloCamX() {
  const p = world.player;
  let tx = p.x - VWz / 2;
  return Math.min(Math.max(tx, PLAZA.x - 30), Math.max(PLAZA.x - 30, PLAZA.x + PLAZA.w + 30 - VWz));
}
const puebloStubWorld = { tears: { spawn() {} }, bullets: { spawn() {} } };
let dlgCd = 0; // anti-reapertura: al cerrar una charla, medio segundo de gracia
function interactPressed(open = false) {
  // Para ABRIR: solo golpe/parada (TouchA = tap seco; arrastrar el stick no abre nada).
  if (open) return Input.justPressed('melee') || Input.justPressed('parry');
  return Input.justPressed('melee') || Input.justPressed('parry') ||
    (Input.touchState().enabled && Input.justCode('TouchTap'));
}
function updatePueblo(dt) {
  FX.update(dt);
  const p = world.player;
  if (dlgCd > 0) dlgCd -= dt;
  if (puebloAviso) { puebloAviso.t -= dt; if (puebloAviso.t <= 0) puebloAviso = null; }

  if (dlg) {
    if (interactPressed()) {
      dlg.i++;
      AudioManager.beep(520, 0.03, 'triangle', 0.025);
      if (dlg.i >= dlg.lines.length) {
        const res = dlg.npc.onDone() ?? {};
        dlg = null;
        dlgCd = 0.5;
        if (res.aviso) puebloAviso = { titulo: res.aviso[0], sub: res.aviso[1], t: 2.6 };
        if (res.accion === 'santuario') { mode = 'santuario'; santIdx = 0; }
        if (res.accion === 'run') { SaveManager.clearRun(); newRun(); } // descenso nuevo: abandona la partida a medias
        if (res.accion === 'batalla') {
          let enc = res.encuentro ?? 'vigilia';
          if (enc === 'liga') {
            const rango = GameState.ligaRango ?? 0;
            enc = rango >= 5 ? 'campeon' : 'liga' + (rango + 1);
          } else if (enc !== 'vigilia' && !desbloqueado('encuentro', enc)) enc = 'vigilia';
          else if (enc === 'vigilia' && desbloqueado('encuentro', 'enjambre') && Math.random() < 0.5) enc = 'enjambre';
          batalla.start(enc); mode = 'batalla';
        }
      }
    }
    return;
  }

  const roomCtx = {
    bounds: PLAZA,
    playerSolids: () => [],
    clampPlayer: (pl) => {
      pl.x = Math.min(Math.max(pl.x, PLAZA.x + pl.r), PLAZA.x + PLAZA.w - pl.r);
      pl.y = Math.min(Math.max(pl.y, PLAZA.y + 30), PLAZA.y + PLAZA.h - pl.r);
    }
  };
  p.update(dt, Input, roomCtx, puebloStubWorld);
  cam.x += (puebloCamX() - cam.x) * Math.min(1, dt * 7);

  // Interacción con el NPC más cercano
  const near = nearestNPC();
  if (near && dlgCd <= 0 && interactPressed(true)) {
    dlg = { npc: near, lines: near.lines(), i: 0 };
    AudioManager.beep(660, 0.05, 'triangle', 0.03);
  }
}
function nearestNPC() {
  const p = world.player;
  let best = null, bd = 1e9;
  for (const n of NPCS) {
    const d = Math.hypot(p.x - n.x, p.y - n.y);
    if (d < n.r + 18 && d < bd) { bd = d; best = n; }
  }
  return best;
}
function renderPueblo(t) {
  const fondoP = Sprites.get('fondo_pueblo');
  // Fondo pintado a pantalla completa (estilo FFIX: escenario fijo + sprites
  // encima); leve parallax horizontal con la cámara. La cámara del pueblo está
  // ajustada para que Pip y los NPCs caminen sobre el adoquinado inferior.
  if (fondoP) {
    const par = (cam.x - puebloCamX()) * 0.06; // parallax sutil
    // Cubre el lienzo con margen; recorta casas arriba, adoquinado abajo
    const w = VW * 1.14, h = w * fondoP.height / fondoP.width;
    ctx.drawImage(fondoP, Math.round((VW - w) / 2 - par), Math.round(VH - h + 6), Math.round(w), Math.round(h));
  } else {
    // Cielo del atardecer perpetuo (fallback procedural)
    const sky = ctx.createLinearGradient(0, 0, 0, VH);
    sky.addColorStop(0, '#141126');
    sky.addColorStop(0.5, '#231c3e');
    sky.addColorStop(1, '#3a2c50');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 30; i++) {
      const sx2 = ((i * 89) % VW), sy2 = ((i * 53) % Math.floor(VH * 0.5));
      ctx.fillStyle = `rgba(220,215,240,${0.15 + (i % 4) * 0.08 + Math.sin(t * 2 + i) * 0.05})`;
      ctx.fillRect(sx2, sy2, 1.5, 1.5);
    }
    ctx.fillStyle = '#e8dfc8';
    ctx.beginPath(); ctx.arc(VW * 0.18, 52, 15, 0, 7); ctx.fill();
    ctx.fillStyle = '#d0c5a8';
    ctx.beginPath(); ctx.arc(VW * 0.18 - 4, 48, 4, 0, 7); ctx.fill();
  }

  ctx.save();
  ctx.scale(ZOOM, ZOOM);
  if (!fondoP) {
    drawPuebloBackdrop(ctx, SX, SY, t, VW, VH);
    drawPlazaGround(ctx, SX, SY, KY);
  }
  // NPCs + Pip con y-sorting
  const sortables = NPCS.map(n => ({ y: n.y, draw: () => drawNPC(ctx, n, SX, SY, t) }));
  sortables.push({ y: world.player.y + 10, draw: () => drawPlayer(world.player, t) });
  sortables.sort((a, b) => a.y - b.y);
  for (const s of sortables) s.draw();
  drawCoro(ctx, SX, SY, t);
  FX.draw(ctx, (x, y) => [SX(x), SY(y, 4)]);
  // Prompt de interacción
  const near = dlg ? null : nearestNPC();
  if (near) {
    const nx = SX(near.x), ny = SY(near.y) - 42;
    font(8); ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd54f';
    ctx.fillText(near.nombre, nx, ny);
    ctx.fillStyle = '#8d82ad';
    ctx.fillText(Input.touchState().enabled ? 'toca para hablar' : 'Espacio / E: hablar', nx, ny + 12);
  }
  ctx.restore();

  drawMist(t, 0.65);

  // Caja de diálogo (con retrato pintado del NPC si existe, estilo FFIX:
  // el busto asoma por encima del marco a la izquierda)
  if (dlg) {
    const line = dlg.lines[Math.min(dlg.i, dlg.lines.length - 1)];
    const bh = 78, by = VH - bh - 12; // 3 líneas: el retrato roba ancho al texto
    // El retrato es del que HABLA: las líneas de Pip muestran a Pip, no al NPC
    const habla = (line.who ?? '').toLowerCase() === 'pip' ? 'pip' : dlg.npc.id;
    const ret = Sprites.get('retrato_' + habla);
    ctx.fillStyle = 'rgba(13,10,26,0.92)';
    ctx.fillRect(20, by, VW - 40, bh);
    ctx.strokeStyle = '#6b5a36'; ctx.lineWidth = 2;
    ctx.strokeRect(21, by + 1, VW - 42, bh - 2);
    let tx = 34;
    if (ret) {
      const inf = Sprites.info('retrato_' + dlg.npc.id);
      const rh = 74, rw = Math.round(inf.w * rh / inf.h);
      ctx.drawImage(ret, 28, by + bh - rh - 4, rw, rh);
      tx = 28 + rw + 10;
    }
    ctx.textAlign = 'left';
    if (line.who) {
      font(9); ctx.fillStyle = '#ffd54f';
      ctx.fillText(line.who, tx, by + 18);
    }
    font(9); ctx.fillStyle = '#e9e2f5';
    // texto en hasta 3 líneas ajustadas al ancho REAL disponible
    const lines = wrapText(line.text, VW - 40 - tx - 14, 3);
    let ly = by + (line.who ? 34 : 26);
    for (const ln of lines) { ctx.fillText(ln, tx, ly); ly += 14; }
    font(8); ctx.textAlign = 'right';
    ctx.fillStyle = '#6c6193';
    ctx.fillText('▸', VW - 34, by + bh - 10);
  }
  // Aviso de recompensa
  if (puebloAviso) {
    font(11); ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255,213,79,${Math.min(1, puebloAviso.t)})`;
    ctx.fillText(puebloAviso.titulo, VW / 2, 70);
    font(9);
    ctx.fillStyle = `rgba(207,198,232,${Math.min(1, puebloAviso.t)})`;
    ctx.fillText(puebloAviso.sub, VW / 2, 86);
  }
  // HUD mínimo del pueblo — velo superior para leer el texto sobre el fondo pintado
  const puG = ctx.createLinearGradient(0, 0, 0, 30);
  puG.addColorStop(0, 'rgba(9,7,18,0.6)'); puG.addColorStop(1, 'rgba(9,7,18,0)');
  ctx.fillStyle = puG; ctx.fillRect(0, 0, VW, 30);
  font(9); ctx.textAlign = 'left';
  ctx.fillStyle = '#d8cef0';
  // Gema de Memoria pintada delante del número; si falta, el glifo ◆.
  if (drawIconCentered('hud_memoria', 16, 14, 13)) {
    ctx.fillText('' + GameState.memoria, 24, 18);
  } else {
    ctx.fillText('◆ ' + GameState.memoria, 12, 18);
  }
  if (RunState.bendiciones.length) {
    // Hogaza dibujada (🍞 salía como tofu en VT323).
    ctx.fillStyle = '#c98a3c';
    ctx.beginPath(); ctx.ellipse(17, 29, 6, 3.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e6bd84'; ctx.fillRect(14, 27.6, 6, 1.1);
    ctx.fillStyle = '#d8a85c'; ctx.textAlign = 'left';
    ctx.fillText('pan', 27, 32);
  }
  font(9); ctx.textAlign = 'right'; ctx.fillStyle = '#b3a6d6';
  ctx.fillText('EL PUEBLO · la puerta del Reloj espera al este', VW - 10, 16);
}

// ---------- Santuario del Péndulo (meta-progresión entre runs) ----------
function santuarioCardRect(i) {
  if (PORTRAIT) {
    const cw = 158, chh = 64, col = i % 2, row = Math.floor(i / 2);
    return { x: VW / 2 - cw - 6 + col * (cw + 12), y: 108 + row * (chh + 10), w: cw, h: chh };
  }
  const cw = 142, chh = 92, col = i % 4, row = Math.floor(i / 4);
  return { x: VW / 2 - (cw * 2 + 18) + col * (cw + 12), y: 96 + row * (chh + 12), w: cw, h: chh };
}
function santuarioDescendRect() {
  return { x: VW / 2 - 100, y: VH - 64, w: 200, h: 44 };
}
function screenTap() {
  // Tap táctil (coords de canvas) o clic de ratón (mousePos es mundo → a pantalla)
  const t = Input.consumeTap();
  if (t) return t;
  if (Input.justCode('MouseLeft')) {
    const m = Input.mousePos();
    return { x: (m.x - cam.x) * ZOOM, y: (m.y - cam.y) * KY * ZOOM };
  }
  return null;
}
function activarNodoSantuario(n) {
  const coste = DataDB.balance.arbol[n.id] ?? 999;
  if (GameState.tiene(n.id)) {
    if (n.id === 'cuarto_de_la_penumbra') {
      GameState.cuerdaTensa = !GameState.cuerdaTensa; SaveManager.save();
      AudioManager.sfx(GameState.cuerdaTensa ? 'door_seal' : 'door_open');
    } else AudioManager.sfx('no_sp');
  } else if (GameState.memoria >= coste) {
    GameState.memoria -= coste; GameState.desbloqueos.push(n.id);
    if (n.id === 'cuarto_de_la_penumbra') GameState.cuerdaTensa = true;
    SaveManager.save(); AudioManager.sfx('equip');
    FX.burst(VW / 2 + cam.x, (VH / 2) / KY + cam.y, { n: 20, color: '#ffd54f', speed: 120, life: 0.6, size: 2, glow: true });
  } else AudioManager.sfx('no_sp');
}
function updateSantuario() {
  const nodos = DataDB.santuario.nodos, n = nodos.length; // índice n = botón Descender
  santIdx = UIK.moverGrid(Input, Math.min(santIdx, n), 4, n + 1); // rejilla 4-col + Descender
  if (UIK.cancelo(Input) || Input.justPressed('pause')) { mode = 'pueblo'; return; }
  const tap = screenTap();
  const inRect = (t, r) => t && t.x > r.x && t.x < r.x + r.w && t.y > r.y && t.y < r.y + r.h;
  const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'];
  let act = -1;
  for (let i = 0; i < n; i++) { if (Input.justCode(keys[i])) act = i; if (UIK.hit(santuarioCardRect(i), tap)) { santIdx = i; act = i; } }
  if (UIK.hit(santuarioDescendRect(), tap)) { santIdx = n; act = n; }
  if (Input.justPressed('restart')) act = n;               // R = descender directo
  if (act < 0 && UIK.confirmo(Input)) act = santIdx;        // A del mando / Enter sobre el foco
  if (act === n) { SaveManager.clearRun(); newRun(); return; } // descenso nuevo desde el Santuario
  if (act >= 0) activarNodoSantuario(nodos[act]);
}
function drawSantuario(t) {
  ctx.fillStyle = 'rgba(8,5,16,0.92)';
  ctx.fillRect(0, 0, VW, VH);
  // Péndulo de fondo
  const pa = Math.sin(t * 1.1) * 0.35;
  ctx.save();
  ctx.translate(VW / 2, -30);
  ctx.rotate(pa);
  ctx.strokeStyle = 'rgba(107,90,54,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, VH * 0.85); ctx.stroke();
  ctx.fillStyle = 'rgba(255,213,79,0.25)';
  ctx.beginPath(); ctx.arc(0, VH * 0.85, 14, 0, 7); ctx.fill();
  ctx.restore();

  ctx.textAlign = 'center';
  font(15); ctx.fillStyle = '#e9e2f5';
  ctx.fillText('Santuario del Péndulo', VW / 2, 40);
  font(10); ctx.fillStyle = '#b09be0';
  ctx.fillText('◆ Memoria: ' + GameState.memoria, VW / 2, 62);
  font(9); ctx.fillStyle = '#6c6193';
  ctx.fillText('Graba recuerdos con Memoria · toca / 1-8 / mando', VW / 2, 78);

  const nodos = DataDB.santuario.nodos;
  const TIPO_COL = { poder: '#e05a4f', variedad: '#7ec98f', comodidad: '#7f96d8', reto: '#b678e8' };
  nodos.forEach((n, i) => {
    const r = santuarioCardRect(i);
    const owned = GameState.tiene(n.id);
    const coste = DataDB.balance.arbol[n.id] ?? 0;
    const afford = GameState.memoria >= coste;
    const foc = i === santIdx;
    ctx.fillStyle = foc ? '#2b2547' : owned ? '#241f3d' : '#1d1930';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = foc ? '#ffffff' : owned ? '#ffd54f' : afford ? TIPO_COL[n.tipo] ?? '#4c4070' : '#37335c';
    ctx.lineWidth = foc ? 3 : owned ? 2 : 1.5;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    if (foc) { ctx.save(); ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,247,180,${0.5 + 0.4 * Math.sin(t * 8)})`; ctx.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6); ctx.restore(); }
    ctx.textAlign = 'center';
    ctx.fillStyle = owned ? '#ffd54f' : afford ? '#e9e2f5' : '#55496e';
    fitFont(n.nombre, r.w - 10, [9, 8, 7]); // encoge el nombre para que quepa en la carta
    ctx.fillText(n.nombre, r.x + r.w / 2, r.y + 18);
    font(8);
    ctx.fillStyle = owned ? '#9c8fc0' : afford ? '#9c8fc0' : '#453a5e';
    // desc en 2 líneas (ajuste por medida real con la fuente ya subida)
    const dl = wrapText(n.desc, r.w - 12, 2);
    ctx.fillText(dl[0] ?? '', r.x + r.w / 2, r.y + 36);
    if (dl[1]) ctx.fillText(dl[1], r.x + r.w / 2, r.y + 50);
    font(8);
    if (owned) {
      if (n.id === 'cuarto_de_la_penumbra') {
        ctx.fillStyle = GameState.cuerdaTensa ? '#e05a4f' : '#6c6193';
        ctx.fillText(GameState.cuerdaTensa ? 'ACTIVO · toca para apagar' : 'apagado · toca para activar', r.x + r.w / 2, r.y + r.h - 10);
      } else {
        ctx.fillStyle = '#ffd54f';
        ctx.fillText('✓ grabado', r.x + r.w / 2, r.y + r.h - 10);
      }
    } else {
      ctx.fillStyle = afford ? '#b09be0' : '#55496e';
      ctx.fillText('◆ ' + coste + '  [' + (i + 1) + ']', r.x + r.w / 2, r.y + r.h - 10);
    }
  });

  const dr = santuarioDescendRect();
  const focD = santIdx === nodos.length;
  UIK.boton(ctx, font, { ...dr, label: 'DESCENDER', sub: 'a la Torre', tono: 'primary', foco: focD, t });
  ctx.textAlign = 'center';
  UIK.glyphBar(ctx, font, Input, [{ k: 'nav', txt: 'mover' }, { k: 'confirm', txt: 'grabar / descender' }, { k: 'cancel', txt: 'pueblo' }], VW, VH);
}

// ---- Pantalla de OPCIONES (Fase B, carencias #3/#4): volumen, asistencia de ritmo,
// calibración de latencia y control. Navegable por toque/mando/teclado con el kit. ----
let optIdx = 0;
function optItems() {
  const o = GameState.opciones;
  const items = [
    { type: 'slider', label: 'Volumen música', get: () => o.vol_musica,
      set: v => { o.vol_musica = v; AudioManager.setMusicVol(); }, valTxt: () => Math.round(o.vol_musica * 100) + '%' },
    { type: 'slider', label: 'Volumen efectos', get: () => o.vol_sfx,
      set: v => { o.vol_sfx = v; AudioManager.sfx('ui_tap'); }, valTxt: () => Math.round(o.vol_sfx * 100) + '%' },
    { type: 'slider', label: 'Asistencia de ritmo', get: () => ((o.escala_ventanas ?? 1) - 1) / 0.6,
      set: v => { o.escala_ventanas = 1 + Math.max(0, Math.min(1, v)) * 0.6; },
      valTxt: () => { const e = o.escala_ventanas ?? 1; return e <= 1.02 ? 'Normal' : e >= 1.55 ? 'Fácil' : 'Suave +' + Math.round((e - 1) * 100) + '%'; } },
    { type: 'slider', label: 'Calibración de latencia', get: () => ((o.latencia_ms ?? 0) + 120) / 240,
      set: v => { o.latencia_ms = Math.round((v * 240 - 120) / 5) * 5; },
      valTxt: () => { const l = o.latencia_ms ?? 0; return (l > 0 ? '+' : '') + l + ' ms'; } },
  ];
  if (Input.touchState().enabled) items.push({
    type: 'toggle', label: 'Control táctil',
    act: () => { const nuevo = Input.scheme() === 'una_mano' ? 'raton' : 'una_mano'; Input.setScheme(nuevo); o.esquema_control = nuevo; },
    valTxt: () => Input.scheme() === 'una_mano' ? 'Una Mano' : 'Dos pulgares',
  });
  items.push({ type: 'button', label: 'Volver', tono: 'primary', act: () => salirOpciones() });
  return items;
}
function optRect(i) {
  const w = Math.min(VW - 80, 420), h = 44, gap = 5;
  return { x: Math.round((VW - w) / 2), y: 52 + i * (h + gap), w, h };
}
function salirOpciones() { SaveManager.save(); mode = 'paused'; }
function updateOpciones() {
  const items = optItems(), n = items.length;
  if (UIK.cancelo(Input)) { salirOpciones(); return; }
  if (Input.justPressed('move_up')) optIdx = (optIdx - 1 + n) % n;
  if (Input.justPressed('move_down')) optIdx = (optIdx + 1) % n;
  optIdx = Math.min(optIdx, n - 1);
  const it = items[optIdx];
  if (it.type === 'slider') { // izq/dcha ajusta el slider enfocado
    let dv = 0;
    if (Input.justPressed('move_left')) dv = -0.1;
    if (Input.justPressed('move_right')) dv = 0.1;
    if (dv) it.set(Math.max(0, Math.min(1, it.get() + dv)));
  }
  if (UIK.confirmo(Input) && it.act) it.act();
  const tap = Input.consumeTap();
  if (tap) for (let i = 0; i < n; i++) {
    const r = optRect(i);
    if (!UIK.hit(r, tap)) continue;
    optIdx = i; const t2 = items[i];
    if (t2.type === 'slider') { const bx = r.x + 12, bw = r.w - 24; t2.set(Math.max(0, Math.min(1, (tap.x - bx) / bw))); }
    else if (t2.act) t2.act();
    break;
  }
}
function drawOpciones(t) {
  const items = optItems(), n = items.length;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  font(16); ctx.fillStyle = '#e9e2f5'; ctx.fillText('OPCIONES', VW / 2, 46);
  for (let i = 0; i < n; i++) {
    const r = optRect(i), it = items[i], foco = i === optIdx;
    if (it.type === 'slider') UIK.slider(ctx, font, { ...r, label: it.label, value: it.get(), valTxt: it.valTxt(), foco, t });
    else UIK.boton(ctx, font, { ...r, label: it.label, sub: it.valTxt ? it.valTxt() : '', tono: it.tono, foco, t });
  }
  UIK.glyphBar(ctx, font, Input, [{ k: 'nav', txt: 'elegir' }, { k: 'confirm', txt: 'ajustar' }, { k: 'cancel', txt: 'volver' }], VW, VH);
  ctx.textAlign = 'center';
}

// Opciones del menú de pausa (botones grandes navegables por toque/mando/teclado).
function pauseOptions() {
  return [
    { label: 'Continuar', tono: 'primary', act: () => { mode = 'play'; } },
    { label: 'Opciones', sub: 'volumen · ritmo · latencia · control', act: () => { optIdx = 0; mode = 'opciones'; } },
  ];
}
function pauseRect(i, n) {
  const w = 260, h = UIK.UI.BTN_H, gap = 12;
  const y0 = Math.round(VH / 2 - (n * h + (n - 1) * gap) / 2 + 16);
  return { x: Math.round((VW - w) / 2), y: y0 + i * (h + gap), w, h };
}

function drawOverlay(t = 0) {
  if (mode === 'play') return;
  ctx.fillStyle = 'rgba(8,5,16,0.8)';
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  if (mode === 'opciones') { drawOpciones(t); return; }
  if (mode === 'upgrade' && pendingUpgrades) {
    font(14); ctx.fillStyle = '#ffd54f';
    ctx.fillText('El Reloj te ofrece cuerda', VW / 2, 74);
    font(9); ctx.fillStyle = '#8d82ad';
    ctx.fillText(PORTRAIT ? 'Toca una mejora antes de descender' : 'Elige una mejora antes de descender (1, 2 o 3)', VW / 2, 94);
    pendingUpgrades.forEach((u, i) => {
      const rc = upgradeCardRect(i);
      const x = rc.x, y = rc.y, cw = rc.w, chh = rc.h;
      const foc = i === upgradeIdx;
      ctx.fillStyle = foc ? '#241f3d' : '#1d1930';
      ctx.fillRect(x, y, cw, chh);
      ctx.strokeStyle = foc ? '#ffd54f' : '#4c4070'; ctx.lineWidth = foc ? 3 : 2;
      ctx.strokeRect(x + 1, y + 1, cw - 2, chh - 2);
      if (foc) { ctx.save(); ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,247,180,${0.5 + 0.4 * Math.sin(t * 8)})`; ctx.strokeRect(x - 3, y - 3, cw + 6, chh + 6); ctx.restore(); }
      font(11); ctx.fillStyle = '#ffd54f';
      ctx.fillText(String(i + 1), x + cw / 2, y + 24);
      // Título: el mayor tamaño que quepa en la tarjeta (antes "Lágrimas afiladas"
      // se salía por los lados de la carta).
      fitFont(u.nombre, cw - 12, [10, 9, 8]); ctx.fillStyle = '#e9e2f5';
      ctx.fillText(u.nombre, x + cw / 2, y + (PORTRAIT ? 50 : 52));
      // Descripción: ajuste por medida real, no por número de caracteres.
      font(8); ctx.fillStyle = '#9c8fc0';
      const lines = wrapText(u.desc, cw - 14, PORTRAIT ? 2 : 3);
      let ly = y + (PORTRAIT ? 74 : 74);
      for (const ln of lines) { ctx.fillText(ln, x + cw / 2, ly); ly += 11; }
    });
    UIK.glyphBar(ctx, font, Input, [{ k: 'nav', txt: 'elegir' }, { k: 'confirm', txt: 'tomar' }], VW, VH);
    ctx.textAlign = 'center';
    return;
  }
  if (mode === 'paused') {
    const opts = pauseOptions(), n = opts.length;
    font(16); ctx.fillStyle = '#e9e2f5'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('PAUSA', VW / 2, pauseRect(0, n).y - 22);
    for (let i = 0; i < n; i++) {
      const r = pauseRect(i, n), o = opts[i];
      UIK.boton(ctx, font, { ...r, label: o.label, sub: o.sub, tono: o.tono, foco: i === pauseIdx, t });
    }
    UIK.glyphBar(ctx, font, Input, [{ k: 'nav', txt: 'mover' }, { k: 'confirm', txt: 'elegir' }, { k: 'cancel', txt: 'volver' }], VW, VH);
    ctx.textAlign = 'center';
  } else if (mode === 'dead') {
    fitFont(t9('ui.muerte'), VW - 40, [18, 16, 14]); ctx.fillStyle = '#e9e2f5';
    ctx.fillText(t9('ui.muerte'), VW / 2, VH / 2 - 12);
    font(11); ctx.fillStyle = '#9c8fc0';
    ctx.fillText(t9('ui.muerte_sub'), VW / 2, VH / 2 + 14);
    font(10); ctx.fillStyle = '#6c6193';
    ctx.fillText('Pulsa R para volver a encenderte', VW / 2, VH / 2 + 44);
    font(9); ctx.fillStyle = '#b09be0';
    ctx.fillText('◆ Memoria conservada: ' + GameState.memoria, VW / 2, VH / 2 + 68);
    if (lastDeathXP) {
      ctx.fillStyle = '#8d82ad';
      ctx.fillText('La Torre recuerda: +' + lastDeathXP.xp + ' XP' + (lastDeathXP.niveles ? ' · ¡Nivel ' + lastDeathXP.nivel + '! +' + lastDeathXP.niveles + ' engranaje' + (lastDeathXP.niveles > 1 ? 's' : '') : ''), VW / 2, VH / 2 + 84);
    }
  } else if (mode === 'victory') {
    fitFont('El Reloj de las Almas se detiene', VW - 40, [18, 16, 14, 13]); ctx.fillStyle = '#ffd54f';
    ctx.fillText('El Reloj de las Almas se detiene', VW / 2, VH / 2 - 12);
    font(11); ctx.fillStyle = '#9c8fc0';
    ctx.fillText('Pip recuerda. Por ahora, es suficiente.', VW / 2, VH / 2 + 14);
    font(10); ctx.fillStyle = '#6c6193';
    ctx.fillText('Pulsa R para descender de nuevo', VW / 2, VH / 2 + 44);
  }
}

function render() {
  ctx.setTransform(SS, 0, 0, SS, 0, 0); // escala base de supersampling cada frame
  const t = T();
  if (mode === 'title') { drawTitle(t); return; }
  if (mode === 'pueblo') { renderPueblo(t); return; }
  if (mode === 'santuario') { drawSantuario(t); return; }
  if (mode === 'batalla') { batalla.draw(t); return; }
  if (mode === 'menu') { menu.draw(t); return; }
  if (mode === 'balance') { drawBalanceScreen(); return; }
  if (mode === 'metronomo') { drawMetronomo(); return; }
  const [shx, shy] = FX.shakeOffset();
  ctx.fillStyle = '#0b0916';
  ctx.fillRect(0, 0, VW, VH);
  for (let i = 0; i < 40; i++) {
    const vx = ((i * 97) % VW), vy = ((i * 61) % VH);
    ctx.fillStyle = `rgba(120,110,180,${0.02 + (i % 5) * 0.005})`;
    ctx.fillRect(vx, vy, 2, 2);
  }
  ctx.save();
  ctx.translate(Math.round(shx), Math.round(shy));
  ctx.scale(ZOOM, ZOOM); // zoom de mundo (HUD fuera de este bloque)

  const rooms = activeRooms();
  for (const room of rooms) {
    ctx.drawImage(room.canvas, SX(room.blockX), SY(room.blockY) - EXTRA_TOP);
  }
  for (const room of rooms) {
    drawBiomaDecor(room, t);
    drawDoor(room, 'n'); drawDoor(room, 's'); drawDoor(room, 'e'); drawDoor(room, 'w');
    drawCandles(room, t);
    drawTrapdoor(room);
    // Mostrador de la tienda: mueble de fondo, detrás de los productos
    if (room.stock && room.stock.length) {
      let sx = 0, sy = 1e9;
      for (const s of room.stock) { sx += s.x; sy = Math.min(sy, s.y); }
      drawPropSprite('prop_mostrador_tienda', SX(sx / room.stock.length), SY(sy) + 12, 40);
    }
    drawSpawnMarks(room, t);
  }

  const maxWaxHp = DataDB.balance.salas.wax_hp;
  const sortables = [];
  for (const room of rooms) {
    for (const r of room.rocks) sortables.push({ y: r.y + r.h, draw: () => drawRock(r) });
    for (const w of room.wax) sortables.push({ y: w.y + w.h, draw: () => drawWaxBlock(w, maxWaxHp) });
    if (room.pedestal) sortables.push({ y: room.pedestal.y + 10, draw: () => drawPedestalObj(room, t, room.pedestal) });
    if (room.pedestal2) sortables.push({ y: room.pedestal2.y + 10, draw: () => drawPedestalObj(room, t, room.pedestal2) });
    if (room.stock) for (const s of room.stock) sortables.push({ y: s.y + 8, draw: () => drawShopItem(s, t) });
  }
  // Familiares de reliquia (van con el jugador, no con una sala)
  for (const f of world.familiares) sortables.push({ y: f.y, draw: () => drawFamiliar(ctx, SX, SY, f, t) });
  for (const pk of world.pickups) sortables.push({ y: pk.y, draw: () => drawPickup(pk, t) });
  for (const e of world.enemies) if (!e.health.dead) sortables.push({ y: e.y + e.r, draw: () => drawEnemy(e, t) });
  if (world.player) sortables.push({ y: world.player.y + 10, draw: () => drawPlayer(world.player, t) });
  sortables.sort((a, b) => a.y - b.y);
  for (const s of sortables) s.draw();

  drawProjectiles();
  FX.draw(ctx, (x, y) => [SX(x), SY(y, 4)]);
  drawTrails();
  drawShockwaves();
  drawArt(ctx, SX, SY, world.artFx);

  drawLight(t, rooms);

  if (cad.active && cad.target) {
    ctx.save();
    ctx.translate(SX(cad.target.x) - cad.target.x, SY(cad.target.y, 8) - cad.target.y);
    cad.draw(ctx);
    ctx.restore();
  }

  for (const n of world.dmgNumbers) {
    font(n.size ?? 9); ctx.textAlign = 'center';
    ctx.globalAlpha = Math.min(1, n.t * 2.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
    ctx.strokeText(n.text, SX(n.x), SY(n.y, 10));
    ctx.fillStyle = n.color;
    ctx.fillText(n.text, SX(n.x), SY(n.y, 10));
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Overlays de pantalla completa SIN zoom (grade, niebla, viñeta, ignición, congelación)
  // "Hora Dorada": etalonaje cálido y luminoso de toda la escena (balance.arte,
  // con posible override por bioma). Un overlay caldea; un screen levanta sombras.
  const arte = floorMap?.current?.bioma?.grade ?? DataDB.balance.arte;
  if (arte && mode !== 'pueblo') {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = arte.grade_overlay_alpha ?? 0;
    ctx.fillStyle = arte.grade_overlay ?? '#ffffff';
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = arte.grade_screen_alpha ?? 0;
    ctx.fillStyle = arte.grade_screen ?? '#ffffff';
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  drawMist(t, 1);
  ctx.drawImage(vignette, 0, 0);
  if (world.player?.ignicionT > 0) {
    // Borde llameante que late al compás + caldeo dorado de toda la escena
    const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.32, VW / 2, VH / 2, VH * 0.75);
    g.addColorStop(0, 'rgba(255,150,50,0)');
    g.addColorStop(1, `rgba(255,140,40,${0.14 + Math.sin(t * 8) * 0.05})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.10 + Math.sin(t * 8) * 0.04;
    ctx.fillStyle = '#ffb547';
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  if (ignicionFlashT > 0) {
    // Fogonazo del Acto 1: blanco dorado que se disuelve
    const k = ignicionFlashT / 0.7;
    ctx.fillStyle = `rgba(255,240,205,${0.55 * k * k})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  if (freezeT > 0) {
    ctx.fillStyle = 'rgba(126,232,224,0.10)';
    ctx.fillRect(0, 0, VW, VH);
  }
  if (slowmoT > 0) {
    // Velo del tiempo lento: azul en el bullet-time (G5), dorado en la arena
    ctx.fillStyle = slowmoBlue ? 'rgba(90,209,255,0.08)' : 'rgba(232,197,101,0.06)';
    ctx.fillRect(0, 0, VW, VH);
  }
  if (hurtFlashT > 0) {
    const k = hurtFlashT / 0.35;
    const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH * 0.72);
    g.addColorStop(0, 'rgba(216,69,79,0)');
    g.addColorStop(1, `rgba(216,69,79,${0.3 * k})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }

  // HUD, tutorial y controles táctiles SOLO en juego: en 'upgrade/dead/victory/
  // paused' el overlay oscuro los tapa a medias y se veían corazones/SP/flash
  // "sangrando" por detrás (queja de textos solapados).
  if (mode === 'play') {
    drawHUD(t);
    tut.draw(ctx, t);
    drawTouchUI(t);
    if (Input.touchState().enabled) drawTouchEcos();
  }
  drawOverlay(t);
}

// ---------- Bucle ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame); // programar ANTES: una excepción no mata el bucle
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }

  Input.pollGamepad();
  try {
    update(dt);
    render();
  } catch (err) {
    console.error('frame:', err);
  }
  Input.endFrame();
}

// ---------- Arranque ----------
window.addEventListener('unhandledrejection', e => console.error('unhandledrejection:', e.reason));
function paintFatal(err) {
  console.error('boot:', err);
  ctx.fillStyle = '#141120'; ctx.fillRect(0, 0, VW, VH);
  font(10); ctx.fillStyle = '#e07a7a'; ctx.textAlign = 'left';
  String(err.stack ?? err).split('\n').slice(0, 8).forEach((l, i) => ctx.fillText(l.slice(0, 60), 10, 30 + i * 16));
}
(async function boot() {
  try {
  const ok = await DataDB.load();
  if (!ok) {
    ctx.fillStyle = '#141120'; ctx.fillRect(0, 0, VW, VH);
    font(10); ctx.fillStyle = '#e07a7a'; ctx.textAlign = 'left';
    DataDB.errors.forEach((e, i) => ctx.fillText(e, 10, 30 + i * 16));
    return;
  }
  SaveManager.load();
  // Espera a que Gelica esté disponible: el texto se mide (measureText) para los
  // layouts, así que arrancar sin la fuente daría métricas del fallback.
  try { if (document.fonts?.load) { await document.fonts.load('16px Gelica'); await document.fonts.ready; } } catch {}
  await Sprites.load(); // arte pintado opcional; el bake de salas usa las texturas
  Input.init(canvas, toWorld, VW, VH);
  if (GameState.opciones.esquema_control) Input.setScheme(GameState.opciones.esquema_control);
  Input.setTouchButtons(TOUCH_BTNS_PLAY);
  if (PORTRAIT || MOBILE) {
    Input.forceTouch();
    flash('Tap dcha: golpe · Flick izq: dash', 'Agita el móvil: Ignición · ≡: equipo y Esfera');
  }
  newRun();
  enterPueblo();
  mode = 'title'; // pantalla de inicio: el pueblo espera detrás
  // Hook de depuración: entrar directo al Reloj de Batalla (también accesible por El Redoble en el pueblo)
  window.__mistveil = {
    batalla: (enc) => { batalla.start(enc || 'vigilia'); mode = 'batalla'; },
    // Equipa una reliquia por id (pruebas de items/familiares/activos)
    item: (id) => { const it = DataDB.item(id); if (it && world.player) applyItem(it, world.player); return it?.nombre ?? 'id desconocido'; },
    // Obtiene y equipa un sello elemental (pruebas R2)
    sello: (id = 'sello_ascuas') => { const s = obtenerSello(id); return s ? s.nombre + ' · ' + s.rasgo : 'id desconocido'; },
    // Rellena el Espíritu (pruebas de Ignición/Artes)
    sp: (n = 100) => { RunState.sp = Math.min(DataDB.balance.ignicion.sp_max, n); return RunState.sp; },
    // Salta al piso n (pruebas de biomas)
    piso: (n = 4) => { RunState.piso = n - 1; descendFloor(); return 'piso ' + RunState.piso + ' · ' + (floorMap.current?.bioma?.nombre ?? ''); },
    // Sube la racha (pruebas de Groove/buff G7c)
    groove: (n = 100) => { world.player?.addGroove(n); return { groove: Math.round(world.player?.groove ?? 0), buff: world.player?.grooveBuffed }; },
    // Posiciones en pantalla de Pip y NPCs (ajuste de layout del pueblo)
    pos: () => {
      const p = world.player;
      const r = { pip: p ? [Math.round(SX(p.x)), Math.round(SY(p.y))] : null, vw: VW, vh: VH };
      if (mode === 'pueblo') r.npcs = NPCS.map(n => [n.id, Math.round(SX(n.x)), Math.round(SY(n.y))]);
      return r;
    },
    // Abre el diálogo de un NPC del pueblo por id (pruebas de retratos/diálogos)
    hablar: (id = 'margo') => {
      const npc = NPCS.find(n => n.id === id);
      if (!npc || mode !== 'pueblo') return 'requiere modo pueblo y un id válido';
      dlg = { npc, lines: npc.lines(), i: 0 };
      return npc.nombre;
    },
    // Brota n enemigos por id junto al jugador (pruebas de sprites/IA)
    spawn: (id = 'cera_andante', n = 1) => {
      const p = world.player; if (!p) return 'sin jugador';
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.7;
        const e = new Enemy(id, p.x + Math.cos(a) * 88, p.y + Math.sin(a) * 60);
        e.room = cur; world.enemies.push(e);
      }
      return id + ' ×' + n;
    },
    // Invoca el jefe de raid del bioma en la sala actual (pruebas de mecánicas)
    jefe: (bioma) => {
      const p = world.player; if (!p) return 'sin jugador';
      const rm = cur ?? floorMap.current;
      const bid = bioma ?? rm?.bioma?.id ?? 'pendulos';
      const raid = DataDB.jefes?.jefes?.[bid]; if (!raid) return 'sin jefe raid para ' + bid;
      const c = { x: rm.bounds.x + rm.bounds.w / 2, y: rm.bounds.y + rm.bounds.h * 0.4 };
      const e = new Enemy(raid.base ?? 'campanero', c.x, c.y, { nombre: raid.nombre, hp: raid.hp, r: raid.r ?? 18, velocidad: raid.velocidad ?? 40, comportamiento: 'jefe_ancla', jefe: true, sello: raid.sello, elemento: raid.elemento, sprite: 'jefe_' + bid, ancla: c });
      e.room = rm; world.enemies.push(e);
      return raid.nombre + ' invocado';
    },
    unaMano: (on = true) => {
      Input.setScheme(on ? 'una_mano' : 'raton');
      if (on) Input.forceTouch();
      return { esquema: Input.scheme(), lock: () => { const l = world.player?.lockE; return l ? { id: l.id, hp: l.health.hp } : null; }, tearsVivas: () => world.tears.items.filter(t => t.active).length };
    },
    menu: () => { if (mode !== 'menu') { menuReturn = mode; mode = 'menu'; menu.open(world.player); } },
    xp: (n = 100) => { const s = ganarXP(n); SaveManager.save(); return { nivel: GameState.nivel, engranajes: GameState.engranajes, subidas: s }; },
    balancePiso: () => openFloorBalance(),
    // Sonda realista: usa SOLO el bucle vivo; inyecta melé al compás y registra calidades
    sonda: () => new Promise(res => {
      newRun();
      const p = world.player;
      let e = world.enemies.find(x => !x.health.dead);
      if (!e) { res({ err: 'sin enemigos' }); return; }
      floorMap.current = e.room ?? floorMap.current;
      p.x = e.x - 34; p.y = e.y;
      const hits = [], evs = [];
      const hHit = (h) => hits.push(h.quality + '@' + Math.round(cad.t));
      const hSt = () => evs.push('start');
      const hEnd = (why) => evs.push('end:' + (why ?? 'ok'));
      EventBus.on('cadencia_hit', hHit); EventBus.on('cadencia_started', hSt); EventBus.on('cadencia_ended', hEnd);
      const alignMs = DataDB.balance.cadencia.ring_contract_ms * (DataDB.compas(RunState.compas)?.ritmo_mult ?? 1);
      Input.inject('melee'); // arranque
      let n = 0;
      const iv = setInterval(() => {
        n++;
        if (!e.health.dead && cad.active) Input.inject('melee'); // golpe al compás
        if (n >= 6 || e.health.dead) {
          clearInterval(iv);
          EventBus.off?.('cadencia_hit', hHit); EventBus.off?.('cadencia_started', hSt); EventBus.off?.('cadencia_ended', hEnd);
          res({ enemigo: e.id, hp: e.health.hp + '/' + e.health.max, muerto: e.health.dead, activo: cad.active, hits, evs: evs.slice(0, 10) });
        }
      }, alignMs);
    }),
    testCad: (conMelee = true) => {
      try {
        newRun();
        const p = world.player;
        let e = world.enemies.find(x => !x.health.dead);
        if (!e) {
          let sala = null;
          for (const r of floorMap.rooms.values()) { if (r.spawnPts.length && !r.cleared) { sala = r; break; } }
          if (!sala) return { err: 'sin sala con spawns' };
          floorMap.current = sala;
          p.x = sala.bounds.x + sala.bounds.w / 2; p.y = sala.bounds.y + sala.bounds.h / 2;
          sala.enter(world);
          for (let i = 0; i < 90; i++) update(1 / 60);
          e = world.enemies.find(x => !x.health.dead);
          if (!e) return { err: 'no brotaron enemigos' };
        } else floorMap.current = e.room ?? floorMap.current;
        const ev = [];
        const h1 = () => ev.push('whiff'); const h2 = (t) => ev.push('start:' + (t?.id ?? '?'));
        const h3 = (x) => ev.push('died:' + (x?.id ?? '?'));
        EventBus.on('cadencia_whiff', h1); EventBus.on('cadencia_started', h2); EventBus.on('enemy_died', h3);
        const traza = [];
        p.x = e.x - 34; p.y = e.y;
        const hp0 = e.health.hp;
        for (let i = 0; i < 200 && !e.health.dead; i++) {
          if (conMelee && i % 26 === 0) Input.inject('melee');
          update(1 / 60);
          if (i % 13 === 1) traza.push((cad.active ? 'A' : '-') + cad.hitIndex + ':' + (window.__dbgCad?.n ?? '?'));
        }
        EventBus.off?.('cadencia_whiff', h1); EventBus.off?.('cadencia_started', h2); EventBus.off?.('enemy_died', h3);
        return { enemigo: e.id, sala: (e.room?.type ?? '?') + '/' + (floorMap.current?.type ?? '?'), hp0, hpFinal: e.health.hp, muerto: e.health.dead, dist: Math.round(Math.hypot(p.x - e.x, p.y - e.y)), ev: ev.slice(0, 10), traza: traza.slice(0, 12).join(' ') };
      } catch (err) { return { err: String(err.stack || err).slice(0, 320) }; }
    },
    step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { try { update(dt); render(); } catch (err) { console.error('step:', err); return String(err); } } return 'ok'; }
  };
  // La música ambiental necesita un gesto del usuario (política de autoplay)
  const kick = () => {
    AudioManager.startAmbient();
    AudioManager.unlockMusic(); // arranca la pista real de la escena actual
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
    window.removeEventListener('touchstart', kick);
  };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);
  window.addEventListener('touchstart', kick);
  // iOS puede SUSPENDER el AudioContext al arrancar la música (HTMLAudio), y entonces
  // los SFX (WebAudio: disparo, golpes…) enmudecen a media partida. Este handler
  // PERSISTENTE lo reanuda en cada interacción (moverse, disparar, tocar) para que no
  // se apaguen. (El silencio total con música ok en iPhone suele ser el interruptor
  // de silencio: WebAudio lo respeta; la solución real son muestras por el canal media.)
  const keepAudioAlive = () => { try { AudioManager._desilenciarIOS(); const c = AudioManager.ctx; if (c && c.state === 'suspended') c.resume(); } catch {} };
  window.addEventListener('pointerdown', keepAudioAlive);
  window.addEventListener('touchstart', keepAudioAlive);
  window.addEventListener('keydown', keepAudioAlive);
  requestAnimationFrame(frame);
  } catch (err) { paintFatal(err); }
})();
