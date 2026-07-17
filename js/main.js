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
import { cast, elementMult } from './spells.js';
import { FX } from './fx.js';
import { PLAZA, NPCS, visita, resetVisita, drawNPC, drawCoro, drawPuebloBackdrop, drawPlazaGround } from './pueblo.js';
import { syncFamiliares, updateFamiliares, drawFamiliar } from './familiares.js';
import { selloDef, selloEquipado, obtenerSello, rasgoCuraPorSp, rasgoDashBurn, finisherElemental } from './sellos.js';

const PORTRAIT = !!window.MISTVEIL_PORTRAIT;
const MOBILE = !!window.MISTVEIL_MOBILE;
const VW = PORTRAIT ? 360 : 640, VH = PORTRAIT ? 640 : 360;
const { KY, WALL_H, CAP, S_FACE, EXTRA_TOP } = VIS;
const canvas = document.getElementById('game');
canvas.width = VW; canvas.height = VH;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function resize() {
  const s = Math.min(window.innerWidth / VW, window.innerHeight / VH);
  // Móvil: escala fraccionaria para llenar la pantalla; escritorio: escala entera pixel-perfect
  const snap = MOBILE ? s : (s >= 1 ? Math.floor(s) : s);
  canvas.style.width = (VW * snap) + 'px';
  canvas.style.height = (VH * snap) + 'px';
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
  familiares: [], trails: []
};
const cad = new Cadencia();
const batalla = new RelojBatalla(ctx, VW, VH, font);
const menu = new MenuEquipo(VW, VH, font, ctx);
const tut = new Tutorial({ world, cad, Input, flash, font, ctx, VW, VH, Enemy, currentRoom: () => floorMap.current });
let titleT = 0;
let menuReturn = 'play';
let pendingBalance = null; // pantalla de XP al pisar la trampilla
let lastDeathXP = null;
// Botones táctiles mínimos (el resto son gestos: tap dcha = ATQ, flick izq = DASH, agitar = Ignición)
const TOUCH_BTNS_PLAY = [
  { code: 'TouchB', label: 'PAR', x: VW - 30, y: VH - 92, r: 24 },
  { code: 'TouchQ', label: 'Q', x: VW - 28, y: VH - 156, r: 19 },
  { code: 'TouchF', label: 'F', x: VW - 66, y: VH - 130, r: 16 }, // respaldo si el agitado no va
  { code: 'TouchC', label: '♪', x: VW - 26, y: VH - 208, r: 14 },
  { code: 'TouchPause', label: 'II', x: VW - 16, y: 58, r: 13 },
  { code: 'TouchMenu', label: '≡', x: VW - 16, y: 88, r: 13 },
  { code: 'TouchX', label: '⌛', x: VW - 70, y: VH - 178, r: 14 } // objeto activo (solo si llevas uno)
];
const TOUCH_BTNS_PUEBLO = [TOUCH_BTNS_PLAY[5]];
const TOUCH_BTNS_1MANO = [TOUCH_BTNS_PLAY[4], TOUCH_BTNS_PLAY[5]]; // solo pausa y ≡
const TOUCH_BTNS_NONE = [];
let floorMap = null;
let cur = null;      // sala bajo los pies del jugador
let mode = 'play';
let showDebug = false;
let fps = 60, fpsAcc = 0, fpsN = 0;
let flashMsg = '', flashT = 0, flashSub = '';
let trapdoorHintCd = 0;
let freezeT = 0;   // péndulo quieto
let slowmoT = 0, slowmoFactor = 1; // arena del tiempo (objeto activo)
let ignicionFlashT = 0; // fogonazo dorado del estallido de Ignición
let hitStopT = 0;  // micro-pausa en golpes perfectos (juice)
let pendingUpgrades = null; // 3 mejoras ofrecidas al descender
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
  freezeT = 0; hitStopT = 0; slowmoT = 0;
  world.familiares = []; world.trails = [];
  pendingUpgrades = null;
  mode = 'play';
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
      ctx.fillStyle = al.used ? '#5a5470' : { corazon: '#e0556b', fusion: '#b678e8', metronomo: '#7ee8e0', apuesta: '#ffd54f' }[al.kind];
      ctx.fillText({ corazon: '♥', fusion: '⛓', metronomo: '△', apuesta: '◈' }[al.kind], x, y + 3);
      if (!al.used && Math.hypot(p.x - al.x, p.y - al.y) < 26) {
        font(7); ctx.fillStyle = '#e9e2f5';
        const label = {
          corazon: 'ATAQUE: 1 corazón → 1 engranaje',
          fusion: 'ATAQUE: 2 reliquias comunes → 1 rara',
          metronomo: 'ATAQUE: reto de ritmo → reliquia',
          apuesta: 'ATAQUE: apostar ' + DataDB.balance.camaras.apuesta_coste + ' oro'
        }[al.kind];
        ctx.fillText(label, x, y - 18);
      }
    }
  }
  // Tuerca
  if (world.pet) {
    const x = SX(world.pet.x), y = SY(world.pet.y) - 4 + Math.sin(t * 6) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(SX(world.pet.x), SY(world.pet.y) + 4, 5, 2, 0, 0, 7); ctx.fill();
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
  if (first) {
    for (const s of room.pickupSpots) if (Math.random() < 0.5) spawnPickup('coin', s.x, s.y, false);
  }
  if (room.type === 'jefe' && !room.cleared) { flash(DataDB.biomas?.jefes_bioma?.[room.bioma?.id]?.nombre ?? 'Campanero Mayor'); AudioManager.bell(98, 0.12); }
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
  const bio = biomaDe(RunState.piso);
  if ((RunState.piso - 1) % 3 === 0 && bio) flash(bio.nombre.toUpperCase(), bio.sub);
  else flash('Piso ' + RunState.piso, 'La Torre desciende...');
  AudioManager.sfx('door_open');
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
    font(9); ctx.textAlign = 'center';
    ctx.fillStyle = pb.contrato.ok ? '#7ec96b' : '#e0556b';
    ctx.fillText('CONTRATO ' + (pb.contrato.ok ? 'CUMPLIDO' : 'FALLIDO') + ': ' + pb.contrato.nombre + (pb.contrato.ok ? '  (+1 engranaje, +15 ◆)' : ''), VW / 2, y + 6);
    y += 16;
  }
  if (pb.niveles && pb.reveal >= steps) {
    font(12); ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
    ctx.fillText('¡NIVEL ' + pb.nivel + '!  +' + pb.niveles + ' engranaje' + (pb.niveles > 1 ? 's' : ''), VW / 2, y + 4);
    font(8); ctx.fillStyle = '#8d82ad';
    ctx.fillText('Gástalo en la Esfera del Reloj (Tab)', VW / 2, y + 18);
    for (const u of pb.unlocks ?? []) {
      const l = etiqueta(u);
      font(9); ctx.fillStyle = '#7ee8e0';
      ctx.fillText('DESBLOQUEADO: ' + l.titulo, VW / 2, y + 32);
      y += 13;
    }
    y += 28;
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
  campanero: ['#b08d57', '#6d5636', '#ffd54f']
};
const TAG_COLORS = {
  lagrimas: '#7f96d8', stats: '#7ec98f', cadencia: '#ffd54f',
  ignicion: '#b678e8', movilidad: '#7ee8e0', activo: '#ff9c3a'
};
EventBus.on('enemy_died', (e) => {
  const pal = PALETTES[e.id] ?? ['#9E9E9E', '#666', '#fff'];
  FX.burst(e.x, e.y, { n: 16, color: pal[0], speed: 130, life: 0.6, size: 3, gravity: 180 });
  FX.burst(e.x, e.y, { n: 8, color: pal[2], speed: 70, life: 0.4, size: 2, glow: true });
  FX.addShake(1.2);
  hitStopT = Math.max(hitStopT, 0.03);
  // Los vagabundos de galería sueltan calderilla a veces
  if (e.room?.type === 'galeria' && Math.random() < 0.4) spawnPickup('coin', e.x, e.y);
  // Los caídos dejan mecha: el Cerero Errante puede reavivarlos
  if (!e.def.jefe) world.corpses.push({ id: e.id, x: e.x, y: e.y, hp: e.def.hp, t: 11 });
});
EventBus.on('gemelo_enfurecido', () => flash('¡El gemelo superviviente enloquece!'));
EventBus.on('enemigo_reavivado', (rev) => flash('El Cerero reaviva a ' + rev.def.nombre, 'Mátalo primero...'));
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
    const selloId = DataDB.biomas?.jefes_bioma?.[room.bioma?.id]?.sello;
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
EventBus.on('cadencia_hit', ({ x, y, quality, dmg, finisher }) => {
  // Háptica acorde: perfect = golpe seco, good = leve, fail = zumbido de error.
  // + micro hit-stop en perfect/finisher: el mundo "acusa" tu golpe.
  Input.vibrar?.(quality === 'perfect' ? 24 : quality === 'good' ? 10 : [45, 30, 25]);
  if (quality === 'perfect') freezeT = Math.max(freezeT, finisher ? 0.09 : 0.045);
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
EventBus.on('cadencia_early', (x, y) => pushPopup(x, y - 24, 'aún no...', '#8d82ad', 8));
EventBus.on('cadencia_counter_started', (e) => {
  inputBuf.melee = 0; // un melé bufado de antes no debe fallar el contraataque
  Input.vibrar?.([12, 50, 12]); // doble pulso: ¡ojo, anillo rojo!
  pushPopup(e.x, e.y - 26, t9('ui.cad_contra'), '#ff3b30', 11);
});
EventBus.on('cadencia_parried', (e) => {
  Input.vibrar?.([10, 20, 30]);
  freezeT = Math.max(freezeT, 0.07);
  pushPopup(e.x, e.y - 26, t9('ui.cad_parry'), '#7ee8e0', 11);
  world.shockwaves.push({ x: e.x, y: e.y, r0: 4, r1: 30, t: 0.2, tmax: 0.2, color: '#7ee8e0' });
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
  const color = DataDB.elementos[h.elemento]?.color ?? '#bcd0ff';
  if (h.tipo === 'onda') world.shockwaves.push({ x, y, r0: 10, r1: h.params.radio_px, t: 0.3, tmax: 0.3, color });
  else world.shockwaves.push({ x, y, r0: 6, r1: 34, t: 0.2, tmax: 0.2, color });
  if (h.tipo === 'cono') {
    const aim = Math.atan2(world.player.aim.y, world.player.aim.x);
    FX.burst(x + world.player.aim.x * 30, y + world.player.aim.y * 30,
      { n: 26, color, speed: 180, life: 0.45, size: 2.5, glow: true, spread: h.params.angulo_deg * Math.PI / 180, dir: aim });
  } else {
    FX.burst(x, y, { n: 14, color, speed: 120, life: 0.4, size: 2, glow: true });
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
function update(dt) {
  if (Input.f5Pressed()) DataDB.reload();
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
    const tap = Input.touchState().enabled && Input.justCode('TouchTap');
    if (titleT > 0.6 && (Input.justPressed('melee') || Input.justCode('Enter') || tap)) {
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
    const keys = ['Digit1', 'Digit2', 'Digit3'];
    const tap = Input.consumeTap();
    for (let i = 0; i < pendingUpgrades.length; i++) {
      const r = upgradeCardRect(i);
      const tapped = tap && tap.x > r.x && tap.x < r.x + r.w && tap.y > r.y && tap.y < r.y + r.h;
      if (Input.justCode(keys[i]) || tapped) {
        applyUpgrade(pendingUpgrades[i]);
        pendingUpgrades = null;
        mode = 'play';
        descendFloor();
        return;
      }
    }
    return;
  }
  if (tut.active) {
    tut.update(dt);
    if (Input.justPressed('pause')) { tut.skip(); return; } // Esc salta el tutorial
  }
  if (Input.justPressed('pause')) mode = (mode === 'paused') ? 'play' : 'paused';
  if (mode === 'paused') {
    // Táctil: botón "UNA MANO" en pausa alterna el esquema de un pulgar
    const tap0 = Input.touchState().enabled ? Input.consumeTap() : null;
    if (tap0 && Math.abs(tap0.x - VW / 2) < 80 && Math.abs(tap0.y - (VH / 2 + 56)) < 16) {
      const nuevo = Input.scheme() === 'una_mano' ? 'raton' : 'una_mano';
      Input.setScheme(nuevo);
      GameState.opciones.esquema_control = nuevo;
      SaveManager.save();
      flash(nuevo === 'una_mano' ? 'MODO UNA MANO' : 'Twin-stick táctil',
        nuevo === 'una_mano' ? 'auto-disparo · tap: golpe · mantén: Arte · doble-tap: Ignición' : 'dos pulgares: mover + apuntar');
      mode = 'play';
      return;
    }
    if (tap0 && !Input.justCode('TouchPause')) mode = 'play';
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

  const alive = world.enemies.filter(e => !e.health.dead);
  if (freezeT > 0) freezeT -= dt;
  else {
    for (const e of alive) {
      const ctxE = { bounds: e.room?.bounds ?? bb, groundSolids: () => e.room?.groundSolids() ?? [] };
      e.update(dtMundo, p, ctxE, world);
    }
  }

  // Familiares de reliquia (R1.1)
  syncFamiliares(world, p);
  if (freezeT <= 0) updateFamiliares(dt, world, p, alive);

  // Objeto activo (X): un uso, recarga limpiando salas (R1.2)
  if (Input.justPressed('activo') && p.mods.activo && RunState.activoSalas >= p.mods.activo.cooldown_salas) {
    RunState.activoSalas = 0;
    if (p.mods.activo.accion === 'global_slowmo') {
      slowmoT = p.mods.activo.duracion_s;
      slowmoFactor = p.mods.activo.factor;
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
    let parried = false;
    for (const e of alive) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < DataDB.balance.parry.range_px + e.r && e.parryable) {
        e.stun(DataDB.balance.parry.stun_s);
        parried = true;
        pushPopup(e.x, e.y - e.r - 8, t9('ui.cad_parry'), '#7ee8e0', 11);
        world.shockwaves.push({ x: e.x, y: e.y, r0: 5, r1: 36, t: 0.22, tmax: 0.22, color: '#7ee8e0' });
      }
    }
    if (parried) {
      RunState.sp = Math.min(DataDB.balance.ignicion.sp_max, RunState.sp + DataDB.balance.parry.sp_gain);
      EventBus.emit('sp_changed', RunState.sp);
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
          const pal = PALETTES[e.id] ?? ['#fff'];
          FX.burst(t.x, t.y, { n: 5, color: pal[0], speed: 80, life: 0.35, size: 2 });
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
      // Bruma perlada cálida (dirección de arte "Hora Dorada"; rgb en balance.arte)
      const nc = DataDB.balance?.arte?.niebla ?? '168,156,206';
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
function drawMist(t, strength = 1) {
  if (!mistLayers) mistLayers = bakeMist();
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

function font(size) { ctx.font = `${size * 2}px VT323, monospace`; }

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

function drawRock(rect) {
  const x = SX(rect.x), y = SY(rect.y);
  const v = ((rect.x * 7 + rect.y * 13) % 10) / 10;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x + 16, y + TILE_SY - 2, 15, 5, 0, 0, 7); ctx.fill();
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
  ctx.fillStyle = '#352d52';
  ctx.fillRect(x - 6, y - 16, 12, 22);
  ctx.fillStyle = '#4c4070';
  ctx.beginPath(); ctx.ellipse(x, y - 16, 9, 3.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#3d3358';
  ctx.beginPath(); ctx.ellipse(x, y + 6, 9, 3.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(x - 6, y - 14, 2, 18);
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
  ctx.fillStyle = '#07050e';
  ctx.beginPath(); ctx.ellipse(x, y, 14, 10 * KY + 3, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#6b5a36'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y, 14, 10 * KY + 3, 0, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(150,130,220,0.15)';
  ctx.beginPath(); ctx.ellipse(x, y - 2, 10, 5, 0, 0, 7); ctx.fill();
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

function drawCandles(room, t) {
  room.candles().forEach((cd, i) => {
    const { x, y } = candleScreen(room, cd);
    ctx.fillStyle = '#4a3b28';
    ctx.fillRect(x - 3, y + 6, 6, 3);
    ctx.fillStyle = '#6b563a';
    ctx.fillRect(x - 2, y + 1, 4, 6);
    ctx.fillStyle = '#e8dfc8';
    ctx.fillRect(x - 1.5, y - 5, 3, 7);
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

function drawPlayer(p, t) {
  for (const tr of p.trail) {
    ctx.globalAlpha = tr.t * 2.2;
    ctx.fillStyle = '#8fa2ff';
    ctx.fillRect(SX(tr.x) - 5, SY(tr.y) - 12, 10, 14);
  }
  ctx.globalAlpha = 1;

  if (p.health.invuln > 0 && p.dashT <= 0 && Math.floor(performance.now() / 60) % 2 === 0) return;
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

  ctx.save();
  ctx.translate(x, y);
  if (scale !== 1) ctx.scale(scale, scale);

  switch (e.id) {
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
    ctx.strokeStyle = inWindow && Math.floor(t * 14) % 2 === 0 ? '#7ee8e0' : `rgba(255,80,60,${0.35 + k * 0.55})`;
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
  ctx.fillStyle = 'rgba(10,8,20,0.35)';
  ctx.fillRect(0, 0, VW, 48);
  const hearts = Math.ceil(p.health.max / 2);
  for (let i = 0; i < hearts; i++) {
    const rest = p.health.hp - i * 2;
    drawHeart(12 + i * 17, 8, rest >= 2 ? 2 : rest === 1 ? 1 : 0, t);
  }
  ctx.fillStyle = '#8a6d2f'; ctx.beginPath(); ctx.arc(18, 31, 5, 0, 7); ctx.fill();
  ctx.fillStyle = '#e8c565'; ctx.beginPath(); ctx.arc(17, 30, 4.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff2c8'; ctx.fillRect(15, 28, 2, 2);
  font(10); ctx.fillStyle = '#cfc6e8'; ctx.textAlign = 'left';
  ctx.fillText('× ' + RunState.oro, 27, 35);
  // Sello elemental equipado: rombo de su elemento junto al oro
  if (GameState.selloEquipado) {
    const sd = selloDef(GameState.selloEquipado);
    const col = DataDB.elementos[sd?.elemento]?.color ?? '#e9e2f5';
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(50, 26); ctx.lineTo(54, 31); ctx.lineTo(50, 36); ctx.lineTo(46, 31); ctx.closePath(); ctx.fill();
  }
  // Objeto activo (X): carga por salas limpiadas
  if (p.mods.activo) {
    const cd = p.mods.activo.cooldown_salas;
    const listo = RunState.activoSalas >= cd;
    font(9);
    ctx.fillStyle = listo ? '#e8c565' : '#6c6193';
    ctx.fillText(`⌛${listo ? ' X' : ` ${Math.min(RunState.activoSalas, cd)}/${cd}`}`, 62, 35);
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
  ctx.strokeStyle = '#37335c'; ctx.lineWidth = 1;
  ctx.strokeRect(27.5, 38.5, 73, 6);

  const comp = DataDB.compas(RunState.compas);
  if (comp) {
    font(8); ctx.textAlign = 'left';
    ctx.fillStyle = comp.color;
    ctx.fillText('♪ ' + comp.nombre + ' (C)', 110, 31);
  }

  const hch = DataDB.hechizo(RunState.hechizo);
  if (hch) {
    const okSp = RunState.sp >= hch.coste_sp;
    const bx = 110, by = 35;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx, by, 34, 12);
    ctx.strokeStyle = okSp ? '#b678e8' : '#37335c';
    ctx.strokeRect(bx + 0.5, by + 0.5, 33, 11);
    const col = DataDB.elementos[hch.elemento]?.color ?? '#bcd0ff';
    ctx.globalAlpha = okSp ? 1 : 0.4;
    drawSpellGlyph(hch.tipo, bx + 8, by + 6, col);
    font(8); ctx.fillStyle = okSp ? '#cfc6e8' : '#55496e'; ctx.textAlign = 'left';
    ctx.fillText('Q' + hch.coste_sp, bx + 16, by + 10);
    ctx.globalAlpha = 1;
  }

  RunState.items.slice(0, 10).forEach((id, i) => {
    const it = DataDB.item(id);
    const col = TAG_COLORS[it?.tags?.[0]] ?? '#e9e2f5';
    const ix = 152 + i * 13, iy = 36;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(ix, iy, 11, 11);
    ctx.fillStyle = col; ctx.fillRect(ix + 2, iy + 2, 7, 7);
    ctx.fillStyle = '#141120';
    font(6); ctx.textAlign = 'center';
    ctx.fillText((it?.nombre ?? '?')[0].toUpperCase(), ix + 5.5, iy + 9);
  });

  font(9); ctx.fillStyle = '#6c6193'; ctx.textAlign = 'right';
  const label = {
    inicial: 'entrada', camara: 'cámara', galeria: 'galería', normal: 'sala',
    tesoro: 'tesoro', jefe: 'JEFE', tienda: 'tienda', maldita: 'MALDITA'
  }[cur?.type] ?? '';
  ctx.fillText((PORTRAIT ? 'piso ' : 'MISTVEIL · LA TORRE · piso ') + RunState.piso + ' · ' + label, VW - 10, 16);
  if (!Input.touchState().enabled) {
    ctx.fillText(Input.scheme() === 'flechas'
      ? 'Flechas mover · WASD disparar · E parada · Q arte · Tab equipo'
      : 'WASD mover · ratón disparar · E parada · Q arte · Tab equipo', VW - 10, 30);
  }

  drawBiomaExtras(t);
  if (showDebug) drawHitboxes();
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
  const ox = VW - 12 - (maxGx - minGx + 1) * (CW + GAP), oy = 38;
  const ICON = { tesoro: '#e8c565', tienda: '#7ec98f', jefe: '#e05a4f', maldita: '#b678e8' };
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
function drawTitle(t) {
  ctx.fillStyle = '#0b0819'; ctx.fillRect(0, 0, VW, VH);
  // péndulo de fondo
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
  font(26); ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd54f';
  ctx.fillText('MISTVEIL', VW / 2, VH / 2 - 26);
  font(11); ctx.fillStyle = '#b9aee0';
  ctx.fillText('El Reloj de las Almas', VW / 2, VH / 2 - 4);
  font(9);
  ctx.fillStyle = `rgba(233,226,245,${0.55 + Math.sin(t * 3) * 0.35})`;
  const touch = Input.touchState().enabled;
  ctx.fillText(touch ? 'toca para ' : 'Enter para ', VW / 2, VH / 2 + 46);
  font(11); ctx.fillStyle = '#7ee8e0';
  ctx.fillText(GameState.flags.tutorialHecho ? 'CONTINUAR' : 'DAR CUERDA (tutorial)', VW / 2, VH / 2 + 62);
  if (GameState.flags.tutorialHecho) {
    font(7); ctx.fillStyle = '#6c6193';
    ctx.fillText('Nv.' + GameState.nivel + ' · ' + GameState.engranajes + ' engranajes · ◆ ' + GameState.memoria, VW / 2, VH / 2 + 78);
  }
  font(7); ctx.fillStyle = '#4a4468';
  ctx.fillText('un roguelite de relojería y ritmo', VW / 2, VH - 18);
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
  cam.x = puebloCamX(); cam.y = PLAZA.y + PLAZA.h / 2 + 30 - (VHz / 2) / KY;
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
        if (res.accion === 'santuario') mode = 'santuario';
        if (res.accion === 'run') newRun();
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
  // Cielo del atardecer perpetuo
  const sky = ctx.createLinearGradient(0, 0, 0, VH);
  sky.addColorStop(0, '#141126');
  sky.addColorStop(0.5, '#231c3e');
  sky.addColorStop(1, '#3a2c50');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VW, VH);
  // estrellas y luna-engranaje
  for (let i = 0; i < 30; i++) {
    const sx2 = ((i * 89) % VW), sy2 = ((i * 53) % Math.floor(VH * 0.5));
    ctx.fillStyle = `rgba(220,215,240,${0.15 + (i % 4) * 0.08 + Math.sin(t * 2 + i) * 0.05})`;
    ctx.fillRect(sx2, sy2, 1.5, 1.5);
  }
  ctx.fillStyle = '#e8dfc8';
  ctx.beginPath(); ctx.arc(VW * 0.18, 52, 15, 0, 7); ctx.fill();
  ctx.fillStyle = '#d0c5a8';
  ctx.beginPath(); ctx.arc(VW * 0.18 - 4, 48, 4, 0, 7); ctx.fill();

  ctx.save();
  ctx.scale(ZOOM, ZOOM);
  drawPuebloBackdrop(ctx, SX, SY, t, VW, VH);
  drawPlazaGround(ctx, SX, SY, KY);
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

  // Caja de diálogo
  if (dlg) {
    const line = dlg.lines[Math.min(dlg.i, dlg.lines.length - 1)];
    const bh = 64, by = VH - bh - 12;
    ctx.fillStyle = 'rgba(13,10,26,0.92)';
    ctx.fillRect(20, by, VW - 40, bh);
    ctx.strokeStyle = '#6b5a36'; ctx.lineWidth = 2;
    ctx.strokeRect(21, by + 1, VW - 42, bh - 2);
    ctx.textAlign = 'left';
    if (line.who) {
      font(9); ctx.fillStyle = '#ffd54f';
      ctx.fillText(line.who, 34, by + 18);
    }
    font(9); ctx.fillStyle = '#e9e2f5';
    // texto en 2 líneas
    const words = line.text.split(' ');
    let l1 = '', l2 = '';
    for (const w of words) { if ((l1 + w).length < 62 && !l2) l1 += w + ' '; else l2 += w + ' '; }
    ctx.fillText(l1.trim(), 34, by + (line.who ? 34 : 26));
    if (l2) ctx.fillText(l2.trim(), 34, by + (line.who ? 48 : 40));
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
  // HUD mínimo del pueblo
  font(9); ctx.textAlign = 'left';
  ctx.fillStyle = '#b09be0';
  ctx.fillText('◆ ' + GameState.memoria, 12, 18);
  if (RunState.bendiciones.length) {
    ctx.fillStyle = '#d8a85c';
    ctx.fillText('🍞 pan', 12, 32);
  }
  font(9); ctx.textAlign = 'right'; ctx.fillStyle = '#6c6193';
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
  return { x: VW / 2 - 90, y: VH - 54, w: 180, h: 32 };
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
function updateSantuario() {
  const nodos = DataDB.santuario.nodos;
  const tap = screenTap();
  const inRect = (t, r) => t && t.x > r.x && t.x < r.x + r.w && t.y > r.y && t.y < r.y + r.h;
  const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'];
  for (let i = 0; i < nodos.length; i++) {
    if (Input.justCode(keys[i]) || inRect(tap, santuarioCardRect(i))) {
      const n = nodos[i];
      const coste = DataDB.balance.arbol[n.id] ?? 999;
      if (GameState.tiene(n.id)) {
        if (n.id === 'cuarto_de_la_penumbra') {
          GameState.cuerdaTensa = !GameState.cuerdaTensa;
          SaveManager.save();
          AudioManager.sfx(GameState.cuerdaTensa ? 'door_seal' : 'door_open');
        } else AudioManager.sfx('no_sp');
      } else if (GameState.memoria >= coste) {
        GameState.memoria -= coste;
        GameState.desbloqueos.push(n.id);
        if (n.id === 'cuarto_de_la_penumbra') GameState.cuerdaTensa = true;
        SaveManager.save();
        AudioManager.sfx('equip');
        FX.burst(VW / 2 + cam.x, (VH / 2) / KY + cam.y, { n: 20, color: '#ffd54f', speed: 120, life: 0.6, size: 2, glow: true });
      } else {
        AudioManager.sfx('no_sp');
      }
      return;
    }
  }
  if (Input.justPressed('restart') || Input.justCode('Enter') || inRect(tap, santuarioDescendRect())) {
    newRun();
    return;
  }
  if (Input.justPressed('pause') || Input.justCode('Space')) { mode = 'pueblo'; }
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
  font(8); ctx.fillStyle = '#6c6193';
  ctx.fillText(PORTRAIT ? 'Toca un recuerdo para grabarlo' : 'Pulsa 1-8 o haz clic para grabar un recuerdo', VW / 2, 78);

  const nodos = DataDB.santuario.nodos;
  const TIPO_COL = { poder: '#e05a4f', variedad: '#7ec98f', comodidad: '#7f96d8', reto: '#b678e8' };
  nodos.forEach((n, i) => {
    const r = santuarioCardRect(i);
    const owned = GameState.tiene(n.id);
    const coste = DataDB.balance.arbol[n.id] ?? 0;
    const afford = GameState.memoria >= coste;
    ctx.fillStyle = owned ? '#241f3d' : '#1d1930';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = owned ? '#ffd54f' : afford ? TIPO_COL[n.tipo] ?? '#4c4070' : '#37335c';
    ctx.lineWidth = owned ? 2 : 1.5;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx.textAlign = 'center';
    font(8);
    ctx.fillStyle = owned ? '#ffd54f' : afford ? '#e9e2f5' : '#55496e';
    ctx.fillText(n.nombre, r.x + r.w / 2, r.y + 18);
    font(7);
    ctx.fillStyle = owned ? '#9c8fc0' : afford ? '#9c8fc0' : '#453a5e';
    // desc en 2 líneas
    const words = n.desc.split(' ');
    let l1 = '', l2 = '';
    for (const w of words) { if ((l1 + w).length < 24 && !l2) l1 += w + ' '; else l2 += w + ' '; }
    ctx.fillText(l1.trim(), r.x + r.w / 2, r.y + 36);
    if (l2) ctx.fillText(l2.trim(), r.x + r.w / 2, r.y + 50);
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
  const pulse = 1 + Math.sin(t * 3) * 0.03;
  ctx.save();
  ctx.translate(dr.x + dr.w / 2, dr.y + dr.h / 2);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = '#2a2140';
  ctx.fillRect(-dr.w / 2, -dr.h / 2, dr.w, dr.h);
  ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2;
  ctx.strokeRect(-dr.w / 2 + 1, -dr.h / 2 + 1, dr.w - 2, dr.h - 2);
  font(11); ctx.fillStyle = '#ffd54f'; ctx.textAlign = 'center';
  ctx.fillText('DESCENDER', 0, 6);
  ctx.restore();
  font(8); ctx.fillStyle = '#6c6193';
  ctx.fillText('R / Enter / toca · Esc: volver al pueblo', VW / 2, dr.y + dr.h + 14);
}

function drawOverlay() {
  if (mode === 'play') return;
  ctx.fillStyle = 'rgba(8,5,16,0.8)';
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  if (mode === 'upgrade' && pendingUpgrades) {
    font(14); ctx.fillStyle = '#ffd54f';
    ctx.fillText('El Reloj te ofrece cuerda', VW / 2, 74);
    font(9); ctx.fillStyle = '#8d82ad';
    ctx.fillText(PORTRAIT ? 'Toca una mejora antes de descender' : 'Elige una mejora antes de descender (1, 2 o 3)', VW / 2, 94);
    pendingUpgrades.forEach((u, i) => {
      const rc = upgradeCardRect(i);
      const x = rc.x, y = rc.y, cw = rc.w, chh = rc.h;
      ctx.fillStyle = '#1d1930';
      ctx.fillRect(x, y, cw, chh);
      ctx.strokeStyle = '#4c4070'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, cw - 2, chh - 2);
      font(11); ctx.fillStyle = '#ffd54f';
      ctx.fillText(String(i + 1), x + cw / 2, y + 24);
      font(10); ctx.fillStyle = '#e9e2f5';
      ctx.fillText(u.nombre, x + cw / 2, y + (PORTRAIT ? 50 : 52));
      font(8); ctx.fillStyle = '#9c8fc0';
      const words = u.desc.split(' ');
      let l1 = '', l2 = '';
      for (const w of words) { if ((l1 + w).length < (PORTRAIT ? 34 : 22) && !l2) l1 += w + ' '; else l2 += w + ' '; }
      ctx.fillText(l1.trim(), x + cw / 2, y + (PORTRAIT ? 74 : 76));
      if (l2) ctx.fillText(l2.trim(), x + cw / 2, y + (PORTRAIT ? 90 : 92));
    });
    return;
  }
  if (mode === 'paused') {
    font(16); ctx.fillStyle = '#e9e2f5';
    ctx.fillText('PAUSA', VW / 2, VH / 2);
    font(10); ctx.fillStyle = '#8d82ad';
    ctx.fillText(Input.touchState().enabled ? 'toca para continuar' : 'Esc para continuar', VW / 2, VH / 2 + 26);
    if (Input.touchState().enabled) {
      const um = Input.scheme() === 'una_mano';
      ctx.fillStyle = 'rgba(24,18,46,0.92)'; ctx.fillRect(VW / 2 - 80, VH / 2 + 40, 160, 32);
      ctx.strokeStyle = um ? '#ffd54f' : '#5a4fa0'; ctx.lineWidth = 1.5;
      ctx.strokeRect(VW / 2 - 79, VH / 2 + 41, 158, 30);
      font(9); ctx.fillStyle = um ? '#ffd54f' : '#e9e2f5';
      ctx.fillText(um ? '✋ MODO UNA MANO: SÍ' : '✋ MODO UNA MANO: NO', VW / 2, VH / 2 + 60);
    }
  } else if (mode === 'dead') {
    font(18); ctx.fillStyle = '#e9e2f5';
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
    font(18); ctx.fillStyle = '#ffd54f';
    ctx.fillText('El Reloj de las Almas se detiene', VW / 2, VH / 2 - 12);
    font(11); ctx.fillStyle = '#9c8fc0';
    ctx.fillText('Pip recuerda. Por ahora, es suficiente.', VW / 2, VH / 2 + 14);
    font(10); ctx.fillStyle = '#6c6193';
    ctx.fillText('Pulsa R para descender de nuevo', VW / 2, VH / 2 + 44);
  }
}

function render() {
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
    drawDoor(room, 'n'); drawDoor(room, 's'); drawDoor(room, 'e'); drawDoor(room, 'w');
    drawCandles(room, t);
    drawTrapdoor(room);
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
    // Arena del tiempo: velo dorado sutil mientras el mundo va lento
    ctx.fillStyle = 'rgba(232,197,101,0.06)';
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

  drawHUD(t);
  tut.draw(ctx, t);
  drawTouchUI(t);
  if (Input.touchState().enabled) drawTouchEcos();
  drawOverlay();
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
  Input.init(canvas, toWorld);
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
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
    window.removeEventListener('touchstart', kick);
  };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);
  window.addEventListener('touchstart', kick);
  requestAnimationFrame(frame);
  } catch (err) { paintFatal(err); }
})();
