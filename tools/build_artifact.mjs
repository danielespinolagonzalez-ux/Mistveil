#!/usr/bin/env node
// Empaqueta Mistveil en UN solo HTML autocontenido: todos los módulos JS
// inlineados (sin imports), los data/*.json embebidos (se sirve un fetch
// falso en memoria) y la fuente VT323 opcionalmente incrustada en base64.
// Uso: node tools/build_artifact.mjs [ruta_salida.html] [--sin-fuente]
// Sirve para publicar el juego como página única (Artifact de claude.ai,
// itch.io de archivo único, etc.). No modifica el código fuente.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : join(ROOT, 'mistveil_bundle.html');
const SIN_FUENTE = process.argv.includes('--sin-fuente');

// ---------- 1. Módulos: leer, extraer imports/exports, ordenar ----------
const jsDir = join(ROOT, 'js');
const files = readdirSync(jsDir).filter(f => f.endsWith('.js'));
const mods = new Map(); // nombre (sin .js) → { deps: [{mod, names}], code, exports }

const RE_IMPORT = /^import\s*\{([^}]*)\}\s*from\s*'\.\/(\w+)\.js';?\s*$/;
const RE_EXPORT = /^export\s+(const|let|function|class)\s+([A-Za-z_$][\w$]*)/;

for (const f of files) {
  const name = f.replace(/\.js$/, '');
  const deps = [], exports = [];
  const out = [];
  for (const line of readFileSync(join(jsDir, f), 'utf8').split('\n')) {
    const im = line.match(RE_IMPORT);
    if (im) { deps.push({ mod: im[2], names: im[1].trim() }); continue; }
    const ex = line.match(RE_EXPORT);
    if (ex) { exports.push(ex[2]); out.push(line.replace(/^export\s+/, '')); continue; }
    if (/^export\s*\{/.test(line)) throw new Error(`export {} no soportado en ${f}: ${line}`);
    out.push(line);
  }
  mods.set(name, { deps, exports, code: out.join('\n') });
}

// Orden topológico (DFS); los ciclos rompen el empaquetado y deben detectarse.
const order = [], state = new Map();
function visit(name, chain = []) {
  if (state.get(name) === 2) return;
  if (state.get(name) === 1) throw new Error('Ciclo de imports: ' + [...chain, name].join(' → '));
  state.set(name, 1);
  for (const d of mods.get(name)?.deps ?? []) visit(d.mod, [...chain, name]);
  state.set(name, 2);
  if (name !== 'main') order.push(name);
}
for (const name of mods.keys()) visit(name);

let bundleJs = '';
for (const name of order) {
  const m = mods.get(name);
  bundleJs += `\n// ═══════ js/${name}.js ═══════\n{\n`;
  for (const d of m.deps) bundleJs += `const {${d.names}} = __m['${d.mod}'];\n`;
  bundleJs += m.code;
  bundleJs += `\n__m['${name}'] = { ${m.exports.join(', ')} };\n}\n`;
}
{ // main.js al final, sin entrada en el registro
  const m = mods.get('main');
  bundleJs += `\n// ═══════ js/main.js (entrada) ═══════\n{\n`;
  for (const d of m.deps) bundleJs += `const {${d.names}} = __m['${d.mod}'];\n`;
  bundleJs += m.code + '\n}\n';
}

// ---------- 2. Datos embebidos (mismas rutas que DataDB.FILES) ----------
const DATA_PATHS = [
  'data/balance.json', 'data/biomas.json', 'data/elementos.json', 'data/enemigos.json',
  'data/items.json', 'data/hechizos.json', 'data/compases.json', 'data/santuario.json',
  'data/progresion.json', 'data/esfera.json', 'data/sellos.json', 'data/textos_es.json',
  'data/salas/piso1_plantillas.json', 'data/jefes.json',
];
const dataObj = {};
for (const p of DATA_PATHS) dataObj[p] = JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

// ---------- 2b. Sprites pintados (R-Assets): PNG en base64 + manifest ----------
// js/sprites.js mira window.__MISTVEIL_SPRITES__ antes de intentar fetch.
let spritesObj = null;
try {
  const sdir = join(ROOT, 'assets/sprites');
  const manifest = JSON.parse(readFileSync(join(sdir, 'manifest.json'), 'utf8'));
  spritesObj = { manifest, png: {} };
  let peso = 0;
  for (const id of Object.keys(manifest)) {
    const ext = manifest[id].ext || 'png'; // fondos opacos = jpg
    const mime = ext === 'jpg' ? 'image/jpeg' : 'image/png';
    const buf = readFileSync(join(sdir, id + '.' + ext));
    spritesObj.png[id] = `data:${mime};base64,` + buf.toString('base64');
    peso += buf.length;
  }
  console.log(`sprites incrustados: ${Object.keys(manifest).length} (${Math.round(peso / 1024)} KB)`);
} catch { console.log('sin assets/sprites (el juego dibuja todo por código)'); }

// ---------- 3. Fuente Gelica (local, incrustada en base64; sin red) ----------
let fontCss = '';
if (!SIN_FUENTE) {
  try {
    const buf = readFileSync(join(ROOT, 'assets/fonts/Gelica-Regular.otf'));
    fontCss = `@font-face{font-family:'Gelica';font-style:normal;font-weight:400;src:url(data:font/otf;base64,${buf.toString('base64')}) format('opentype');}`;
    console.log(`fuente Gelica incrustada (${Math.round(buf.length / 1024)} KB)`);
  } catch (e) { console.warn('sin fuente incrustada:', String(e).slice(0, 80)); }
}

// ---------- 4. HTML final (escritorio + móvil autodetectado) ----------
const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>MISTVEIL: El Reloj de las Almas</title>
<style>
${fontCss}
html, body { margin: 0; height: 100%; background: radial-gradient(ellipse at 50% 40%, #131022 0%, #07050e 70%); overflow: hidden; overscroll-behavior: none; }
body { display: grid; place-items: center; }
canvas { image-rendering: auto; background: #141120; cursor: crosshair;
  box-shadow: 0 0 80px rgba(90,70,160,0.25), 0 0 8px rgba(0,0,0,0.8); touch-action: none; -webkit-user-select: none; user-select: none; }
#rotate { position: fixed; inset: 0; display: none; place-items: center; background: #07050e; color: #cfc6e8;
  font: 22px Gelica, serif; text-align: center; z-index: 10; }
body.movil-portrait #rotate { display: grid; }
/* Abajo a la izquierda: arriba tapaba los corazones del HUD en escritorio */
#fs { position: fixed; left: calc(8px + env(safe-area-inset-left)); bottom: calc(8px + env(safe-area-inset-bottom));
  z-index: 20; background: rgba(20,17,32,0.55); color: #cfc6e8; border: 1px solid #4c4070;
  font: 16px monospace; width: 34px; height: 34px; border-radius: 6px; cursor: pointer; }
#fs:focus-visible { outline: 2px solid #e8c565; }
#fstip { display: none; position: fixed; inset: 0; z-index: 30; background: rgba(7,5,14,0.94);
  color: #cfc6e8; font: 20px/1.7 Gelica, serif; text-align: center; padding: 30vh 24px 0; }
#fstip em { color: #6c6193; font-size: 15px; font-style: normal; display: block; margin-top: 18px; }
</style>
</head>
<body>
<canvas id="game" width="640" height="360"></canvas>
<div id="rotate">⟳<br>Gira el móvil<br><span style="color:#6c6193;font-size:14px">MISTVEIL se juega en horizontal</span></div>
<button id="fs" aria-label="Pantalla completa">⛶</button>
<div id="fstip">Pantalla completa en iPhone:<br>botón Compartir → «Añadir a pantalla de inicio»<br>y abre Mistveil desde ese icono<em>toca para cerrar</em></div>
<script>
// Pantalla completa: API donde exista (Android/escritorio); en iPhone Safari no
// hay API para páginas, así que el botón enseña el camino (webapp de inicio).
addEventListener('DOMContentLoaded', () => {
  const fs = document.getElementById('fs'), tip = document.getElementById('fstip');
  const root = document.documentElement;
  const pedir = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root);
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (standalone) fs.style.display = 'none';
  fs.addEventListener('click', async () => {
    if (pedir) {
      try { await pedir(); await screen.orientation?.lock?.('landscape'); } catch {}
    } else tip.style.display = 'block';
  });
  tip.addEventListener('click', () => { tip.style.display = 'none'; });
  document.addEventListener('fullscreenchange', () => {
    fs.style.display = document.fullscreenElement ? 'none' : '';
  });
});
</script>
<script>
// Detección móvil (equivale a abrir movil.html) + datos embebidos servidos por
// un fetch en memoria: la página es 100% autocontenida, funciona sin servidor.
window.MISTVEIL_MOBILE = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (window.MISTVEIL_MOBILE) {
  const mq = matchMedia('(orientation: portrait)');
  const upd = () => document.body.classList.toggle('movil-portrait', mq.matches);
  mq.addEventListener?.('change', upd); addEventListener('DOMContentLoaded', upd);
}
window.__MISTVEIL_DATA__ = ${JSON.stringify(dataObj)};
window.__MISTVEIL_SPRITES__ = ${spritesObj ? JSON.stringify(spritesObj) : 'null'};
const __origFetch = window.fetch.bind(window);
window.fetch = (url, opts) => {
  const key = String(url).replace(/^\\.\\//, '');
  if (window.__MISTVEIL_DATA__[key]) {
    return Promise.resolve(new Response(JSON.stringify(window.__MISTVEIL_DATA__[key]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return __origFetch(url, opts);
};
</script>
<script type="module">
const __m = {};
${bundleJs}
</script>
</body>
</html>
`;
writeFileSync(OUT, html);
console.log(`escrito ${OUT} (${Math.round(html.length / 1024)} KB) · módulos: ${order.join(', ')}, main`);
