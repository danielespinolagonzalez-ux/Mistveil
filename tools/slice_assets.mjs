// Troceador de assets pintados (AS1) — normaliza lo que Daniel genera con ChatGPT:
//   assets/src/*.png  →  assets/sprites/<id>.png (+ manifest.json)
//
// Detecta y arregla los tres casos reales de salida de ChatGPT:
//   1) transparencia real        → recortar y listo
//   2) damero "falso" pintado    → quitar el damero (los dos grises en cuadrícula)
//   3) fondo opaco (degradado)   → quitarlo por crecimiento de región desde el borde
//
// Sin dependencias nuevas: decodifica y procesa con canvas en Chromium headless
// (el mismo que usan los tests). Ejecutar desde la raíz del repo:
//   node tools/slice_assets.mjs
// Si playwright no está en NODE_PATH, se busca en el scratchpad de la sesión.

import { createRequire } from 'module';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { resolve, basename } from 'path';

// --- localizar playwright (herramienta externa, nunca parte del juego) ---
const require2 = createRequire(import.meta.url);
function findPlaywright() {
  const candidates = [
    process.env.PW_NODE_MODULES,
    '/tmp/claude-0/-home-user-Mistveil/eb3418c9-28ea-5818-a958-4f3a2104e3a3/scratchpad/node_modules',
  ].filter(Boolean);
  for (const c of candidates) {
    try { return createRequire(resolve(c, 'x.js'))('playwright'); } catch {}
  }
  try { return require2('playwright'); } catch {}
  throw new Error('playwright no encontrado: npm i playwright --no-save en el scratchpad');
}

// Config por asset: altura final en px del canvas del juego ×2 (se guarda a 2×
// y el motor dibuja a la mitad: nitidez al reducir y margen para menús).
// face: hacia dónde mira el arte original (para que el motor sepa cuándo voltear).
const CONFIG = {
  pip_idle:   { targetH: 68, face: 'right' },
  pip_paso:   { targetH: 68, face: 'left' },
  pip_ataque: { targetH: 68, face: 'left' },
};
const DEFAULTS = { targetH: 68, face: 'right' };

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const SRC = resolve(ROOT, 'assets/src');
const OUT = resolve(ROOT, 'assets/sprites');

async function main() {
  const { chromium } = findPlaywright();
  mkdirSync(OUT, { recursive: true });
  const files = readdirSync(SRC).filter(f => f.endsWith('.png'));
  if (!files.length) { console.log('assets/src vacío — nada que trocear'); return; }
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const manifest = existsSync(resolve(OUT, 'manifest.json'))
    ? JSON.parse(readFileSync(resolve(OUT, 'manifest.json'), 'utf8')) : {};

  for (const f of files) {
    const id = basename(f, '.png');
    const cfg = { ...DEFAULTS, ...(CONFIG[id] ?? {}) };
    const dataUrl = 'data:image/png;base64,' + readFileSync(resolve(SRC, f)).toString('base64');
    const res = await page.evaluate(procesar, { dataUrl, targetH: cfg.targetH });
    if (res.error) { console.log(`✗ ${id}: ${res.error}`); continue; }
    writeFileSync(resolve(OUT, id + '.png'), Buffer.from(res.png.split(',')[1], 'base64'));
    manifest[id] = { w: res.w, h: res.h, face: cfg.face };
    console.log(`✓ ${id}: ${res.modo} → ${res.w}×${res.h}`);
  }
  writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  await browser.close();
  console.log('manifest.json actualizado (' + Object.keys(manifest).length + ' sprites)');
}

// ---- Se ejecuta DENTRO del navegador ----
async function procesar({ dataUrl, targetH }) {
  const img = new Image();
  await new Promise((ok, ko) => { img.onload = ok; img.onerror = () => ko(new Error('png ilegible')); img.src = dataUrl; });
  const W = img.width, H = img.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const im = g.getImageData(0, 0, W, H);
  const d = im.data;
  const idx = (x, y) => (y * W + x) * 4;

  // --- 1. ¿Qué clase de fondo trae? ---
  let alfaReal = false;
  for (let i = 3; i < d.length; i += 29 * 4) if (d[i] < 200) { alfaReal = true; break; }

  let modo = 'alpha';
  let grises = null;
  if (!alfaReal) {
    // Muestrear una BANDA completa a lo largo de los 4 bordes (las esquinas
    // solas fallan si las casillas del damero son grandes: caen en una sola).
    const banda = Math.max(24, Math.round(Math.min(W, H) * 0.06));
    const muestras = [];
    const toma = (x, y) => { const i = idx(x, y); muestras.push([d[i], d[i + 1], d[i + 2]]); };
    for (let x = 0; x < W; x += 2) for (let y = 0; y < banda; y += 3) { toma(x, y); toma(x, H - 1 - y); }
    for (let y = 0; y < H; y += 2) for (let x = 0; x < banda; x += 3) { toma(x, y); toma(W - 1 - x, y); }
    const esGris = ([r, gg, b]) => Math.max(r, gg, b) - Math.min(r, gg, b) < 18;
    const grisPct = muestras.filter(esGris).length / muestras.length;
    if (grisPct > 0.8) {
      // Damero: dos tonos de gris (percentiles bajos/altos de luminancia)
      const lums = muestras.filter(esGris).map(([r, gg, b]) => (r + gg + b) / 3).sort((a, b) => a - b);
      const lo = lums[Math.floor(lums.length * 0.12)], hi = lums[Math.floor(lums.length * 0.88)];
      if (hi - lo > 10) { modo = 'checker'; grises = [lo, hi]; }
      else { modo = 'checker'; grises = [lo - 6, hi + 6]; } // gris casi uniforme: mismo tratamiento
    } else modo = 'gradient';
  }

  // --- 2. Máscara de fondo por BFS desde TODO el borde ---
  if (modo !== 'alpha') {
    const bg = new Uint8Array(W * H);
    const cola = [];
    const esFondo = (i) => {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (modo === 'checker') {
        const chroma = Math.max(r, gg, b) - Math.min(r, gg, b);
        const lum = (r + gg + b) / 3;
        return chroma < 22 && lum > grises[0] - 24 && lum < grises[1] + 24;
      }
      return true; // gradient: la condición es la similitud LOCAL (abajo)
    };
    const dist2 = (i, j) => {
      const dr = d[i] - d[j], dg = d[i + 1] - d[j + 1], db = d[i + 2] - d[j + 2];
      return dr * dr + dg * dg + db * db;
    };
    const TOL_LOCAL = 18 * 18 * 3; // gradiente suave: saltos locales pequeños
    const push = (x, y, from) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const p = y * W + x;
      if (bg[p]) return;
      const i = p * 4;
      if (modo === 'checker') { if (!esFondo(i)) return; }
      else if (from >= 0 && dist2(i, from) > TOL_LOCAL) return;
      bg[p] = 1; cola.push(p);
    };
    for (let x = 0; x < W; x++) { push(x, 0, -1); push(x, H - 1, -1); }
    for (let y = 0; y < H; y++) { push(0, y, -1); push(W - 1, y, -1); }
    while (cola.length) {
      const p = cola.pop();
      const x = p % W, y = (p / W) | 0, i = p * 4;
      push(x + 1, y, i); push(x - 1, y, i); push(x, y + 1, i); push(x, y - 1, i);
    }
    // Damero: barrido extra para restos sueltos junto a bordes suaves
    if (modo === 'checker') {
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        if (bg[p] || !esFondo(p * 4)) continue;
        let vecinosBg = 0;
        for (const q of [p - 1, p + 1, p - W, p + W]) if (bg[q]) vecinosBg++;
        if (vecinosBg >= 3) bg[p] = 1;
      }
    }
    // Aplicar: fondo → alfa 0, con 1px de suavizado en la frontera
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (bg[p]) { d[p * 4 + 3] = 0; continue; }
      let borde = false;
      for (const q of [p - 1, p + 1, p - W, p + W]) if (q >= 0 && q < W * H && bg[q]) { borde = true; break; }
      if (borde) d[p * 4 + 3] = Math.min(d[p * 4 + 3], 150);
    }
    g.putImageData(im, 0, 0);
  }

  // --- 3. Recortar al contenido (con 2px de margen) ---
  const im2 = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1, opacos = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (im2[(y * W + x) * 4 + 3] > 12) {
      opacos++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { error: 'todo transparente tras limpiar el fondo' };
  // Red de seguridad: si queda menos del 4% de la imagen, el algoritmo se ha
  // comido al sujeto — mejor fallar a gritos que guardar un sprite roto.
  if (opacos < W * H * 0.04) return { error: `solo sobrevive el ${(opacos * 100 / (W * H)).toFixed(1)}% — fondo mal detectado (modo ${modo})` };
  x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2);
  x1 = Math.min(W - 1, x1 + 2); y1 = Math.min(H - 1, y1 + 2);
  let cw = x1 - x0 + 1, ch = y1 - y0 + 1;

  // --- 4. Reducir a targetH por mitades (mejor calidad que un salto único) ---
  let cur = document.createElement('canvas'); cur.width = cw; cur.height = ch;
  cur.getContext('2d').drawImage(cv, x0, y0, cw, ch, 0, 0, cw, ch);
  while (ch / 2 >= targetH) {
    const half = document.createElement('canvas');
    half.width = Math.max(1, Math.round(cw / 2)); half.height = Math.max(1, Math.round(ch / 2));
    const hg = half.getContext('2d'); hg.imageSmoothingQuality = 'high';
    hg.drawImage(cur, 0, 0, half.width, half.height);
    cur = half; cw = half.width; ch = half.height;
  }
  const fw = Math.max(1, Math.round(cw * targetH / ch));
  const fin = document.createElement('canvas'); fin.width = fw; fin.height = targetH;
  const fg = fin.getContext('2d'); fg.imageSmoothingQuality = 'high';
  fg.drawImage(cur, 0, 0, fw, targetH);
  return { png: fin.toDataURL('image/png'), w: fw, h: targetH, modo };
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
