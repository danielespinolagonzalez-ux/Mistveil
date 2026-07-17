// FX — partículas y screenshake (juice). Sin estado de juego aquí.
export const FX = {
  parts: [],
  shake: 0,

  burst(x, y, { n = 8, color = '#fff', speed = 90, life = 0.5, size = 2, gravity = 0, glow = false, spread = Math.PI * 2, dir = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const sp = speed * (0.35 + Math.random() * 0.65);
      this.parts.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        t: life * (0.5 + Math.random() * 0.5), tmax: life,
        size: size * (0.6 + Math.random() * 0.8),
        color, gravity, glow
      });
    }
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
  },

  addShake(amount) { this.shake = Math.min(6, this.shake + amount); },

  update(dt) {
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 14);
    for (const p of this.parts) {
      p.t -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(0.05, dt); p.vy *= Math.pow(0.05, dt);
    }
    this.parts = this.parts.filter(p => p.t > 0);
  },

  draw(ctx, w2s = null) {
    for (const p of this.parts) {
      const a = Math.max(0, p.t / p.tmax);
      const [dx, dy] = w2s ? w2s(p.x, p.y) : [p.x, p.y];
      ctx.globalAlpha = a;
      if (p.glow) {
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(dx, dy, p.size * 2.2, 0, 7); ctx.fill();
        ctx.globalAlpha = a;
      }
      ctx.fillStyle = p.color;
      const s = Math.max(1, Math.round(p.size * a + 0.5));
      ctx.fillRect(Math.round(dx - s / 2), Math.round(dy - s / 2), s, s);
    }
    ctx.globalAlpha = 1;
  },

  shakeOffset() {
    if (this.shake <= 0.05) return [0, 0];
    return [(Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake];
  }
};
