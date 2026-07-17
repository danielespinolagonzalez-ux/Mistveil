// A4 — Lenguaje visual único por habilidad. Cada Arte, el parry y el Redoble
// perfecto tienen una firma dibujada propia, reconocible sin leer texto:
//   nova  → corona de gotas de tinta índigo que estallan
//   onda  → medialuna de espuma que barre hacia el aim
//   cono  → abanico de rescoldos que caen y prenden
//   parry → campana de cristal con esquirlas
// Los efectos viven en world.artFx; main.js los actualiza y dibuja en el mundo.

// Añade un efecto de firma. `opts.dir` es el ángulo de apuntado (rad) donde aplica.
export function spawnArt(list, kind, x, y, opts = {}) {
  list.push({ kind, x, y, t: 0, tmax: opts.tmax ?? 0.5, dir: opts.dir ?? 0, r: opts.r ?? 40, color: opts.color ?? '#e9e2f5', seed: (Math.random() * 1000) | 0 });
  if (list.length > 40) list.shift();
}

export function updateArt(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].t += dt;
    if (list[i].t >= list[i].tmax) list.splice(i, 1);
  }
}

// Dibuja en coordenadas de mundo (SX/SY proyectan a pantalla 2.5D).
export function drawArt(ctx, SX, SY, list) {
  for (const fx of list) {
    const k = fx.t / fx.tmax;         // 0→1 vida
    const x = SX(fx.x), y = SY(fx.y, 6);
    ctx.save();
    if (fx.kind === 'corona_tinta') {
      // Corona: 10 gotas de tinta que salen en radial y se estiran como salpicadura
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + fx.seed;
        const dist = fx.r * (0.2 + k * 0.9);
        const dx = Math.cos(a) * dist, dy = Math.sin(a) * dist * 0.6;
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.fillStyle = fx.color;
        const s = 4 * (1 - k) + 1.5;
        ctx.beginPath(); ctx.ellipse(x + dx, y + dy, s, s * 1.4, a, 0, 7); ctx.fill();
        // gotita de cola
        ctx.globalAlpha = (1 - k) * 0.5;
        ctx.beginPath(); ctx.arc(x + dx * 0.6, y + dy * 0.6, s * 0.5, 0, 7); ctx.fill();
      }
      // núcleo que se desvanece
      ctx.globalAlpha = (1 - k) * 0.6;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, 5 * (1 - k), 0, 7); ctx.fill();
    } else if (fx.kind === 'medialuna_espuma') {
      // Medialuna de espuma: arco turquesa que barre y burbujea hacia el aim
      const R = fx.r * (0.35 + k * 0.9);
      const half = Math.PI * 0.55;
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 4 * (1 - k) + 1.5;
      ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.62, 0, fx.dir - half, fx.dir + half); ctx.stroke();
      // espuma: burbujas a lo largo del arco
      for (let i = 0; i <= 6; i++) {
        const a = fx.dir - half + (i / 6) * half * 2;
        const bx = x + Math.cos(a) * R, by = y + Math.sin(a) * R * 0.62;
        ctx.globalAlpha = (1 - k) * 0.7;
        ctx.fillStyle = '#dff7f4';
        ctx.beginPath(); ctx.arc(bx, by, (2 - k * 1.4) + (fx.seed + i) % 2, 0, 7); ctx.fill();
      }
    } else if (fx.kind === 'abanico_rescoldos') {
      // Abanico de rescoldos: brasas que salen en cono y CAEN (gravedad visual)
      const n = 14;
      const half = Math.PI * 0.33;
      for (let i = 0; i < n; i++) {
        const a = fx.dir - half + (i / (n - 1)) * half * 2;
        const spd = fx.r * (0.5 + ((fx.seed + i * 7) % 10) / 10 * 0.9);
        const px = x + Math.cos(a) * spd * k;
        const py = y + Math.sin(a) * spd * 0.6 * k + k * k * 22; // cae
        ctx.globalAlpha = (1 - k);
        const warm = i % 3 === 0 ? '#fff0c0' : i % 3 === 1 ? '#ff9c3a' : '#e4572e';
        ctx.fillStyle = warm;
        const s = (2.4 - k * 1.6);
        ctx.fillRect(px - s / 2, py - s / 2, s, s);
      }
    } else if (fx.kind === 'campana_cristal') {
      // Campana de cristal: dos anillos limpios + esquirlas que saltan
      for (const rr of [fx.r * (0.3 + k), fx.r * (0.15 + k * 0.7)]) {
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = fx.color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.6, 0, 0, 7); ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + fx.seed;
        const d = fx.r * (0.4 + k * 0.7);
        ctx.globalAlpha = (1 - k);
        ctx.fillStyle = '#eafffb';
        const sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d * 0.6;
        ctx.beginPath(); ctx.moveTo(sx, sy - 2); ctx.lineTo(sx + 2, sy); ctx.lineTo(sx, sy + 2); ctx.lineTo(sx - 2, sy); ctx.fill();
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// Numeral romano de un golpe de combo (1→I) para la firma de la Cadencia perfecta.
const ROMANOS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
export function romano(n) { return ROMANOS[n] ?? String(n); }
