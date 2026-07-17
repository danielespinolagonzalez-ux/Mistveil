// Input — Input Map central: acciones, nunca teclas hardcodeadas fuera de aquí.
// Teclado+ratón (WASD mover, ratón apuntar/disparar) y mando twin-stick.
export const INPUT_MAP = {
  move_up:    ['KeyW', 'ArrowUp'],
  move_down:  ['KeyS', 'ArrowDown'],
  move_left:  ['KeyA', 'ArrowLeft'],
  move_right: ['KeyD', 'ArrowRight'],
  shoot:      ['MouseLeft'],
  melee:      ['Space', 'MouseRight', 'TouchA'],
  parry:      ['KeyE', 'TouchB'],
  dash:       ['ShiftLeft', 'ShiftRight', 'TouchD', 'TouchFlick'],
  hechizo:    ['KeyQ', 'TouchQ', 'TouchHold'],
  ignicion:   ['KeyF', 'TouchF', 'TouchShake', 'TouchDouble'],
  compas:     ['KeyC', 'TouchC'],
  activo:     ['KeyX', 'TouchX'],
  menu:       ['Tab', 'KeyI', 'TouchMenu'],
  pause:      ['Escape', 'KeyP', 'TouchPause'],
  restart:    ['KeyR', 'TouchTap'],
  debug_wave: ['KeyT'],
  debug_info: ['F3'],
  toggle_scheme: ['F2']
};
const PAD = { melee: 5, parry: 4, dash: 1, hechizo: 2, ignicion: 3, pause: 9, menu: 8 }; // índices de botón

// Esquema de disparo. 'raton': WASD/flechas mueven, ratón apunta/dispara.
// 'flechas': flechas mueven, WASD dispara en 4/8 dir (twin-stick de teclado, sin ratón).
// 'una_mano' (táctil): un solo pulgar — stick flotante en TODA la pantalla, auto-disparo
// al enemigo fijado, tap = golpe/parry contextual, long-press = Arte, flick = dash.
let scheme = 'raton';
const MOVE_CODES = {
  raton:   { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] },
  flechas: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'] }
};
const FIRE_CODES = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }; // solo en 'flechas'
let lastAim = { x: 1, y: 0 };

// ---------- Táctil: sticks virtuales + botones ----------
const touchUI = {
  enabled: false,          // se activa con el primer toque (o forzado en movil.html)
  buttons: [],             // [{code,label,x,y,r}] en coords de canvas (los pone main.js)
  move: { id: null, ox: 0, oy: 0, x: 0, y: 0 },   // stick izquierdo (origen dinámico)
  aim:  { id: null, ox: 0, oy: 0, x: 0, y: 0 },   // stick derecho (apunta y dispara)
  tap: null                // último tap {x,y} de este frame (menús)
};
const STICK_R = 42;        // px de canvas para desviación máxima
let flickDir = null;
let comboActivo = false; // durante un combo, cualquier toque = golpe de ritmo       // dirección del flick de este frame (dash gestual)
let shakeCd = 0;           // anti-rebote del gesto de agitar
let longPressT = null;     // una_mano: timer del long-press (Arte de Tinta)
let lastTapEnd = 0;        // una_mano: doble-tap = Ignición
// Feedback input→respuesta: cada gesto reconocido deja un ECO visual en el punto
// del dedo (main.js lo dibuja) y un pulso háptico distinto según el gesto.
const ecos = [];
let holdInfo = null;       // {x, y, t0} mientras un long-press carga (anillo de carga)
function vib(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
function eco(x, y, tipo) {
  ecos.push({ x, y, tipo, t: performance.now() });
  if (ecos.length > 10) ecos.shift();
}

const down = new Set();
const just = new Set();
let mouse = { x: 320, y: 180, left: false, right: false };
let padState = { move: [0, 0], aim: [0, 0], buttons: new Set(), justButtons: new Set() };
let padRest = null; // línea base de ejes en reposo (auto-calibración anti-deriva)
let scaleFn = (x, y) => [x, y];

function codesFor(action) { return INPUT_MAP[action] ?? []; }

export const Input = {
  init(canvas, toWorld) {
    scaleFn = toWorld;
    // Todas las teclas mapeadas: preventDefault evita que el navegador haga scroll
    // (flechas/Espacio) y se trague el keyup, dejando una tecla "pegada".
    const GAME_CODES = new Set(Object.values(INPUT_MAP).flat());
    window.addEventListener('keydown', e => {
      if (e.code === 'F5') { e.preventDefault(); just.add('__f5'); return; }
      if (e.code === 'F3' || GAME_CODES.has(e.code)) e.preventDefault();
      if (!e.repeat) just.add(e.code);
      down.add(e.code);
    });
    window.addEventListener('keyup', e => {
      if (GAME_CODES.has(e.code)) e.preventDefault();
      down.delete(e.code);
    });
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      [mouse.x, mouse.y] = scaleFn(e.clientX - r.left, e.clientY - r.top);
    });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { mouse.left = true; just.add('MouseLeft'); }
      if (e.button === 2) { mouse.right = true; just.add('MouseRight'); }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) mouse.left = false;
      if (e.button === 2) mouse.right = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // --- Táctil ---
    const rawPos = t => {
      const r = canvas.getBoundingClientRect();
      return [(t.clientX - r.left) * canvas.width / r.width, (t.clientY - r.top) * canvas.height / r.height];
    };
    const findButton = (x, y) => touchUI.buttons.find(b => Math.hypot(x - b.x, y - b.y) < b.r * 1.35);
    const touchButtons = new Map(); // touchId -> button
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      touchUI.enabled = true;
      for (const t of e.changedTouches) {
        const [x, y] = rawPos(t);
        touchUI.tap = { x, y };
        just.add('TouchTap');
        const btn = findButton(x, y);
        if (btn) {
          touchButtons.set(t.identifier, btn);
          if (!down.has(btn.code)) just.add(btn.code);
          down.add(btn.code);
          btn.pressed = true;
          btn.pressT = performance.now(); // depresión visual del botón
          vib(9);
        } else if (comboActivo) {
          // Combo de Cadencia en marcha: CUALQUIER toque es el golpe (pantalla = botón de ritmo)
          just.add('TouchA');
          eco(x, y, 'ritmo'); vib(10);
        } else if (scheme === 'una_mano' && touchUI.move.id === null) {
          // UNA MANO: toda la pantalla es el stick flotante; el tap/long-press se decide al soltar
          touchUI.move = { id: t.identifier, ox: x, oy: y, x: 0, y: 0, t0: performance.now(), lx: x, ly: y };
          holdInfo = { x, y, t0: performance.now() };
          longPressT = setTimeout(() => {
            just.add('TouchHold'); longPressT = null;
            eco(x, y, 'arte'); vib(22);
            holdInfo = null;
          }, 250);
        } else if (scheme === 'una_mano') {
          // segundo dedo (raro con una mano, pero pasa): golpe de ritmo
          just.add('TouchA');
          eco(x, y, 'ritmo'); vib(10);
        } else if (x < canvas.width / 2 && touchUI.move.id === null) {
          touchUI.move = { id: t.identifier, ox: x, oy: y, x: 0, y: 0, t0: performance.now(), lx: x, ly: y };
        } else if (x >= canvas.width / 2 && touchUI.aim.id === null) {
          touchUI.aim = { id: t.identifier, ox: x, oy: y, x: 0, y: 0, t0: performance.now(), lx: x, ly: y };
        } else if (x >= canvas.width / 2) {
          // Segundo dedo en el lado derecho (mientras apuntas) = golpe de Cadencia inmediato
          just.add('TouchA');
        }
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const [x, y] = rawPos(t);
        for (const st of [touchUI.move, touchUI.aim]) {
          if (st.id === t.identifier) {
            st.lx = x; st.ly = y;
            let dx = (x - st.ox) / STICK_R, dy = (y - st.oy) / STICK_R;
            const m = Math.hypot(dx, dy);
            if (m > 1) { dx /= m; dy /= m; }
            st.x = dx; st.y = dy;
            // una_mano: si el pulgar se mueve, ya no es tap ni long-press
            if (scheme === 'una_mano' && st === touchUI.move && longPressT && Math.hypot(x - st.ox, y - st.oy) > 14) {
              clearTimeout(longPressT); longPressT = null; holdInfo = null;
            }
          }
        }
      }
    }, { passive: false });
    const touchEnd = e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const btn = touchButtons.get(t.identifier);
        if (btn) {
          touchButtons.delete(t.identifier);
          // solo soltar el code si ningún otro dedo lo mantiene
          if (![...touchButtons.values()].some(b => b.code === btn.code)) down.delete(btn.code);
          btn.pressed = false;
        }
        if (touchUI.move.id === t.identifier) {
          // Flick = gesto RÁPIDO y decidido (>34px y >0.28 px/ms): los ajustes
          // normales del stick ya no disparan el dash sin querer
          const st = touchUI.move;
          const dt = performance.now() - st.t0;
          const dx = st.lx - st.ox, dy = st.ly - st.oy;
          const disp = Math.hypot(dx, dy);
          if (dt < 180 && disp > 34 && disp / dt > 0.28) {
            flickDir = [dx / disp, dy / disp];
            just.add('TouchFlick');
            eco(st.lx, st.ly, 'dash'); vib(14);
          } else if (scheme === 'una_mano' && dt < 240 && disp < 14) {
            // UNA MANO: tap seco en cualquier parte = golpe de Cadencia; doble-tap = Ignición
            const now = performance.now();
            if (now - lastTapEnd < 300) { just.add('TouchDouble'); lastTapEnd = 0; eco(x, y, 'ignicion'); vib([18, 40, 18]); }
            else { just.add('TouchA'); lastTapEnd = now; eco(x, y, 'golpe'); vib(8); }
          }
          if (longPressT) { clearTimeout(longPressT); longPressT = null; }
          holdInfo = null;
          touchUI.move = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
        }
        if (touchUI.aim.id === t.identifier) {
          // Tap seco en el lado derecho = golpe de Cadencia (ATQ); umbral generoso
          // (14px de canvas eran ~8px físicos en móvil: imposible con el pulgar)
          const st = touchUI.aim;
          const dt = performance.now() - st.t0;
          const disp = Math.hypot(st.lx - st.ox, st.ly - st.oy);
          if (dt < 240 && disp < 22) { just.add('TouchA'); eco(st.lx, st.ly, 'golpe'); vib(8); }
          touchUI.aim = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
        }
      }
    };
    canvas.addEventListener('touchend', touchEnd, { passive: false });
    canvas.addEventListener('touchcancel', touchEnd, { passive: false });

    // Giroscopio/acelerómetro: AGITAR el móvil = Ignición. iOS pide permiso en el primer toque.
    let motionReady = false;
    const startMotion = () => {
      if (motionReady) return;
      motionReady = true;
      window.addEventListener('devicemotion', e => {
        const a = e.acceleration; // sin gravedad
        if (!a) return;
        const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
        const now = performance.now();
        if (mag > 16 && now > shakeCd) {
          shakeCd = now + 1200;
          just.add('TouchShake');
        }
      });
    };
    canvas.addEventListener('touchstart', () => {
      if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
        DeviceMotionEvent.requestPermission().then(s => { if (s === 'granted') startMotion(); }).catch(() => {});
      } else startMotion();
    }, { once: true });

    const panic = () => { down.clear(); just.clear(); mouse.left = mouse.right = false; padState.move = [0, 0]; padState.aim = [0, 0]; };
    window.addEventListener('blur', panic);
    window.addEventListener('focus', panic);
    document.addEventListener('visibilitychange', () => { if (document.hidden) panic(); });
  },

  // Test: inyecta una acción como si se hubiera pulsado este frame
  inject(action) { const c = INPUT_MAP[action]?.[0]; if (c) just.add(c); },
  // Cadencia activa: la pantalla entera pasa a ser el botón de ritmo
  setComboActivo(v) { comboActivo = !!v; },

  // Estado en crudo para el overlay de debug (F3) — diagnóstico de deriva
  debugState() {
    return { down: [...down].join(',') || '∅', padMove: padState.move.map(v => v.toFixed(2)).join(',') };
  },

  pollGamepad() {
    const pads = navigator.getGamepads?.() ?? [];
    // Elegir el primer mando REALMENTE presente y conectado (evita ranuras fantasma
    // que reportan ejes en reposo ≠ 0 y provocaban deriva a la derecha).
    let gp = null;
    for (const p of pads) { if (p && p.connected && p.axes?.length >= 2) { gp = p; break; } }
    padState.justButtons.clear();
    if (!gp) { padState.move = [0, 0]; padState.aim = [0, 0]; padRest = null; return; }
    // Auto-calibración: el primer sondeo de un mando define su "reposo". Restamos esa
    // línea base siempre, así un stick con deriva o un eje que descansa en ±1 no empuja solo.
    const ax = gp.axes;
    if (!padRest || padRest.length !== ax.length) padRest = Array.from(ax);
    const rest = i => (ax[i] ?? 0) - (padRest[i] ?? 0);
    // Deadzone RADIAL con reescalado sobre los ejes ya calibrados.
    const DZ = 0.28;
    const radial = (vx, vy) => {
      const m = Math.hypot(vx, vy);
      if (m < DZ) return [0, 0];
      const k = (m - DZ) / (1 - DZ) / m;
      return [vx * k, vy * k];
    };
    padState.move = radial(rest(0), rest(1));
    padState.aim = radial(rest(2), rest(3));
    const now = new Set();
    gp.buttons.forEach((b, i) => { if (b.pressed) now.add(i); });
    for (const i of now) if (!padState.buttons.has(i)) padState.justButtons.add(i);
    padState.buttons = now;
  },

  // Táctil: main.js define los botones y dibuja el overlay con este estado
  setTouchButtons(list) { touchUI.buttons = list; },
  touchEcos() { return ecos; },
  holdState() { return holdInfo; },
  vibrar(p) { if (touchUI.enabled) vib(p); },
  touchState() { return touchUI; },
  forceTouch() { touchUI.enabled = true; },
  consumeTap() { const t = touchUI.tap; touchUI.tap = null; return t; },
  flickDir() { return flickDir; },

  isDown(action) {
    for (const c of codesFor(action)) {
      if (c === 'MouseLeft' && mouse.left) return true;
      if (c === 'MouseRight' && mouse.right) return true;
      if (down.has(c)) return true;
    }
    if (action in PAD && padState.buttons.has(PAD[action])) return true;
    return false;
  },

  justPressed(action) {
    for (const c of codesFor(action)) if (just.has(c)) return true;
    if (action in PAD && padState.justButtons.has(PAD[action])) return true;
    return false;
  },

  justCode(code) { return just.has(code); },

  f5Pressed() { return just.has('__f5'); },

  // Vector de movimiento normalizado (táctil > teclado según esquema > stick izquierdo)
  moveVector() {
    if (touchUI.move.id !== null && (touchUI.move.x || touchUI.move.y)) {
      const dz = 0.18, m = Math.hypot(touchUI.move.x, touchUI.move.y);
      if (m > dz) return [touchUI.move.x, touchUI.move.y];
      return [0, 0];
    }
    const m = MOVE_CODES[scheme] ?? MOVE_CODES.raton; // una_mano: teclado de respaldo
    const anyDown = codes => codes.some(c => down.has(c));
    let x = (anyDown(m.right) ? 1 : 0) - (anyDown(m.left) ? 1 : 0);
    let y = (anyDown(m.down) ? 1 : 0) - (anyDown(m.up) ? 1 : 0);
    if (x === 0 && y === 0) [x, y] = padState.move;
    const len = Math.hypot(x, y);
    return len > 1 ? [x / len, y / len] : [x, y];
  },

  // Vector de apuntado: táctil > stick derecho > WASD (esquema flechas) > ratón
  aimVector(px, py) {
    if (scheme === 'una_mano') {
      // una_mano no apunta con stick: main/Player fijan el objetivo (auto-aim);
      // devolvemos el último aim como inerte — active=false para no interferir
      return { x: lastAim.x, y: lastAim.y, active: false };
    }
    if (touchUI.aim.id !== null) {
      const m = Math.hypot(touchUI.aim.x, touchUI.aim.y);
      if (m > 0.25) { lastAim = { x: touchUI.aim.x / m, y: touchUI.aim.y / m }; return { x: lastAim.x, y: lastAim.y, active: true }; }
      return { x: lastAim.x, y: lastAim.y, active: false };
    }
    const [ax, ay] = padState.aim;
    if (ax || ay) { const l = Math.hypot(ax, ay); lastAim = { x: ax / l, y: ay / l }; return { x: lastAim.x, y: lastAim.y, active: true }; }
    if (scheme === 'flechas') {
      let fx = (down.has(FIRE_CODES.right) ? 1 : 0) - (down.has(FIRE_CODES.left) ? 1 : 0);
      let fy = (down.has(FIRE_CODES.down) ? 1 : 0) - (down.has(FIRE_CODES.up) ? 1 : 0);
      if (fx || fy) { const l = Math.hypot(fx, fy); lastAim = { x: fx / l, y: fy / l }; return { x: lastAim.x, y: lastAim.y, active: true }; }
      return { x: lastAim.x, y: lastAim.y, active: false };
    }
    const dx = mouse.x - px, dy = mouse.y - py;
    const l = Math.hypot(dx, dy) || 1;
    lastAim = { x: dx / l, y: dy / l };
    return { x: lastAim.x, y: lastAim.y, active: mouse.left };
  },

  setAim(x, y) { lastAim = { x, y }; }, // una_mano: el fijado escribe el aim

  shooting() {
    if (scheme === 'una_mano') return false; // el autofire lo decide Player (enemigo fijado)
    if (touchUI.aim.id !== null) return Math.hypot(touchUI.aim.x, touchUI.aim.y) > 0.25;
    const [ax, ay] = padState.aim;
    if (ax !== 0 || ay !== 0) return true;
    if (scheme === 'flechas') {
      return down.has(FIRE_CODES.up) || down.has(FIRE_CODES.down) ||
             down.has(FIRE_CODES.left) || down.has(FIRE_CODES.right);
    }
    return mouse.left;
  },

  scheme() { return scheme; },
  toggleScheme() { scheme = scheme === 'raton' ? 'flechas' : 'raton'; return scheme; },
  setScheme(s) { if (s === 'raton' || s === 'flechas' || s === 'una_mano') scheme = s; },

  mousePos() { return mouse; },
  endFrame() { just.clear(); flickDir = null; }
};
