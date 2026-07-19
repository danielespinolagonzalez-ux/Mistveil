// UI Kit — botones grandes (≥44px), foco navegable por TOQUE/MANDO/TECLADO y barra
// de glifos, para menús usables en móvil. SOLO dibujo + hit-test + helpers de foco;
// recibe el ctx (g) y la función font() ya existentes (font(n) pinta a n*2 px). No
// toca input.js: la navegación por mando ya llega vía justPressed('move_*')/ui_*.
// Geometría en px LÓGICOS del lienzo 640×360 (constantes de UI, no de gameplay).
export const UI = { TAP_MIN: 44, ROW_H: 56, BTN_H: 52, PRIMARY_H: 60, PILL_H: 46, PAD: 14, GAP: 8, R: 9 };
// Tamaños de fuente por rol (suelo absoluto font(9)=18px; sube desde los font(7)/font(8) de antes).
export const UI_SIZE = { titulo: 12, boton: 11, cuerpo: 9, nota: 9 };

const TONOS = {
  primary: { fill: '#ffd54f', border: '#fff7dd', text: '#2a1c10' },
  normal:  { fill: 'rgba(58,44,72,0.92)', border: '#8a7bb0', text: '#f3ecff' },
  danger:  { fill: '#e0556b', border: '#ffd7de', text: '#2a1016' },
  ghost:   { fill: 'rgba(40,34,60,0.55)', border: '#5a5470', text: '#9a92b5' },
};

function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// Botón/fila/tarjeta. spec={x,y,w,h,label,sub?,badge?,foco?,activo?,tono?,t?}. Fuerza
// el mínimo táctil (44) y DEVUELVE el rect real ya inflado para hit-testear con hit().
export function boton(g, font, spec) {
  let { x, y, w, h, label = '', sub = '', badge = '', foco = false, activo = true, tono = 'normal', t = 0 } = spec;
  w = Math.max(w, UI.TAP_MIN); h = Math.max(h, UI.TAP_MIN);
  const c = TONOS[activo ? tono : 'ghost'];
  g.save();
  rrect(g, x, y, w, h, UI.R); g.fillStyle = c.fill; g.fill();
  g.lineWidth = foco ? 3 : 1.5; g.strokeStyle = foco ? '#fff' : c.border; g.stroke();
  if (foco) { // halo punteado pulsante (mismo lenguaje que el cursor de la Esfera)
    g.setLineDash([5, 5]); g.lineWidth = 2;
    g.strokeStyle = `rgba(255,247,180,${0.5 + 0.4 * Math.sin(t * 8)})`;
    rrect(g, x - 3, y - 3, w + 6, h + 6, UI.R + 2); g.stroke(); g.setLineDash([]);
  }
  g.fillStyle = c.text; g.textAlign = 'center'; g.textBaseline = 'middle';
  const cy = sub ? y + h * 0.38 : y + h / 2;
  font(UI_SIZE.boton); g.fillText(label, x + w / 2, cy);
  if (sub) { font(UI_SIZE.nota); g.globalAlpha = 0.85; g.fillText(sub, x + w / 2, y + h * 0.72); g.globalAlpha = 1; }
  if (badge) { font(UI_SIZE.nota); g.textAlign = 'right'; g.fillText(badge, x + w - 10, y + h / 2); }
  g.restore();
  return { x, y, w, h };
}

// Slider horizontal etiquetado. value 0..1. Devuelve el rect de la BARRA (para
// tocar/arrastrar). El foco lo ajusta con izq/dcha; el menú lee ese rect para el tacto.
export function slider(g, font, spec) {
  let { x, y, w, h = UI.BTN_H, label = '', value = 0, foco = false, valTxt = '', t = 0 } = spec;
  h = Math.max(h, UI.TAP_MIN);
  g.save();
  rrect(g, x, y, w, h, UI.R); g.fillStyle = TONOS.normal.fill; g.fill();
  g.lineWidth = foco ? 3 : 1.5; g.strokeStyle = foco ? '#fff' : TONOS.normal.border; g.stroke();
  if (foco) { g.setLineDash([5, 5]); g.lineWidth = 2; g.strokeStyle = `rgba(255,247,180,${0.5 + 0.4 * Math.sin(t * 8)})`; rrect(g, x - 3, y - 3, w + 6, h + 6, UI.R + 2); g.stroke(); g.setLineDash([]); }
  g.fillStyle = TONOS.normal.text; g.textBaseline = 'middle';
  font(UI_SIZE.nota); g.textAlign = 'left'; g.fillText(label, x + 12, y + h * 0.30);
  g.textAlign = 'right'; g.fillStyle = '#ffe9c9'; g.fillText(valTxt, x + w - 12, y + h * 0.30);
  const bx = x + 12, bw = w - 24, by = y + h * 0.66, bh = 6, v = Math.max(0, Math.min(1, value));
  g.fillStyle = 'rgba(0,0,0,0.45)'; rrect(g, bx, by - bh / 2, bw, bh, 3); g.fill();
  g.fillStyle = '#ffd54f'; rrect(g, bx, by - bh / 2, bw * v, bh, 3); g.fill();
  g.beginPath(); g.arc(bx + bw * v, by, 7, 0, 7); g.fillStyle = '#fff7dd'; g.fill();
  g.restore();
  return { x: bx, y, w: bw, h }; // barra (para tocar/arrastrar)
}

// Panel/caja de fondo con doble borde (look de menu_equipo._panel / reloj_batalla._panel).
export function panel(g, x, y, w, h, opts = {}) {
  const { titulo = '', font = null } = opts;
  g.save();
  rrect(g, x, y, w, h, UI.R); g.fillStyle = 'rgba(20,15,38,0.9)'; g.fill();
  g.lineWidth = 2; g.strokeStyle = '#6a5a9a'; g.stroke();
  g.lineWidth = 1; g.strokeStyle = 'rgba(255,213,79,0.35)'; rrect(g, x + 3, y + 3, w - 6, h - 6, UI.R - 2); g.stroke();
  if (titulo && font) { font(UI_SIZE.titulo); g.fillStyle = '#ffe9c9'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(titulo, x + w / 2, y + 8); }
  g.restore();
}

// Texto con recorte por ancho (ellipsis) para no desbordar al subir el tamaño de fuente.
export function texto(g, font, str, x, y, opts = {}) {
  const { size = UI_SIZE.cuerpo, color = '#f3ecff', align = 'left', maxW = 0 } = opts;
  g.save(); font(size); g.fillStyle = color; g.textAlign = align; g.textBaseline = 'top';
  let s = String(str);
  if (maxW && g.measureText(s).width > maxW) { while (s.length > 1 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1); s += '…'; }
  g.fillText(s, x, y); g.restore();
}

// Hit-test tolerante: infla el rect al mínimo táctil (44) ANTES de comparar. tap ya
// llega en coords lógicas VW×VH (Input.consumeTap) → casa directo.
export function hit(r, tap) {
  if (!tap || !r) return false;
  let { x, y, w, h } = r;
  if (w < UI.TAP_MIN) { x -= (UI.TAP_MIN - w) / 2; w = UI.TAP_MIN; }
  if (h < UI.TAP_MIN) { y -= (UI.TAP_MIN - h) / 2; h = UI.TAP_MIN; }
  return tap.x >= x && tap.x <= x + w && tap.y >= y && tap.y <= y + h;
}

// Barra de ayudas al pie: elige el glifo según la fuente activa (mando/toque/teclado).
// acciones = [{k:'confirm'|'cancel'|'tab'|'nav', txt:'Equipar'}]. (Gelica/VT323 no
// tienen emoji → usamos texto ASCII seguro: (A)/(B)/LB·RB/flechas.)
export function glyphBar(g, font, Input, acciones, vw, vh) {
  const pad = Input.padPresent?.(), touch = !pad && Input.touchState?.().enabled;
  const glifo = {
    confirm: pad ? '(A)' : touch ? 'Toca' : 'Enter',
    cancel: pad ? '(B)' : touch ? '' : 'Esc',
    tab: pad ? 'LB/RB' : 'Q/E',
    nav: pad ? 'D-pad' : touch ? '' : 'flechas',
  };
  const parts = acciones.filter(a => glifo[a.k]).map(a => `${glifo[a.k]} ${a.txt}`);
  if (!parts.length) return;
  g.save(); font(UI_SIZE.nota); g.textBaseline = 'bottom'; g.textAlign = 'center';
  g.fillStyle = 'rgba(243,236,255,0.72)';
  g.fillText(parts.join('    ·    '), vw / 2, vh - 6);
  g.restore();
}

// --- Foco navegable. Leen justPressed('move_*') → heredan mando/teclado automáticamente. ---
export function mover1D(Input, idx, n, wrap = true) {
  if (n <= 0) return 0;
  let i = idx;
  if (Input.justPressed('move_down') || Input.justPressed('move_right')) i++;
  if (Input.justPressed('move_up') || Input.justPressed('move_left')) i--;
  return wrap ? (i + n) % n : Math.max(0, Math.min(n - 1, i));
}
export function moverGrid(Input, idx, cols, n) {
  if (n <= 0) return 0;
  let i = idx;
  if (Input.justPressed('move_right')) i = Math.min(n - 1, i + 1);
  if (Input.justPressed('move_left')) i = Math.max(0, i - 1);
  if (Input.justPressed('move_down')) i = Math.min(n - 1, i + cols);
  if (Input.justPressed('move_up')) i = Math.max(0, i - cols);
  return i;
}
export function confirmo(Input) { return Input.justPressed('ui_confirm'); }
export function cancelo(Input) { return Input.justPressed('ui_cancel'); }
