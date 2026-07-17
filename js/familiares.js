// Familiares — compañeros de reliquia (R1.1). La gota de tinta viva te sigue y
// dispara al enemigo más cercano; la polilla lunar orbita y bloquea proyectiles.
// Valores en balance.familiares; los familiares poseídos viven en player.mods.familiares.
import { DataDB } from './data_db.js';
import { AudioManager } from './state.js';
import { EventBus } from './event_bus.js';
import { FX } from './fx.js';

// Sincroniza world.familiares con los del jugador (idempotente; la Fundición
// puede retirar el item y el familiar se despide solo).
export function syncFamiliares(world, player) {
  world.familiares = world.familiares ?? [];
  const owned = player.mods.familiares ?? [];
  for (const id of owned) {
    if (!world.familiares.some(f => f.id === id)) {
      world.familiares.push({ id, x: player.x - 14, y: player.y - 8, ang: Math.random() * Math.PI * 2, fireCd: 0 });
    }
  }
  if (world.familiares.length > owned.length) {
    world.familiares = world.familiares.filter(f => owned.includes(f.id));
  }
}

export function updateFamiliares(dt, world, player, enemigosVivos) {
  const B = DataDB.balance.familiares ?? {};
  for (const f of world.familiares ?? []) {
    if (f.id === 'gota_tinta') {
      // Sigue con pereza y dispara (a media potencia) al enemigo más cercano
      const k = Math.min(1, dt * (B.gota_lag ?? 3.2));
      f.x += (player.x - 14 - f.x) * k;
      f.y += (player.y - 8 - f.y) * k;
      f.fireCd -= dt;
      if (f.fireCd <= 0) {
        let best = null, bd = B.gota_alcance_px ?? 260;
        for (const e of enemigosVivos) {
          const d = Math.hypot(e.x - f.x, e.y - f.y);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          f.fireCd = B.gota_cadencia_s ?? 1.1;
          const d = bd || 1;
          world.tears.spawn(f.x, f.y,
            (best.x - f.x) / d * player.stats.tear_speed,
            (best.y - f.y) / d * player.stats.tear_speed,
            player.stats.tear_range_px,
            player.stats.tear_damage * (B.gota_dano_mult ?? 0.6));
          AudioManager.beep(1180, 0.04, 'sine', 0.02);
        }
      }
    } else if (f.id === 'orbital_polilla') {
      // Órbita achatada (mundo 2.5D) alrededor del jugador
      f.ang += dt * (B.orbital_vel_rad_s ?? 2.6);
      const R = B.orbital_radio_px ?? 34;
      f.x = player.x + Math.cos(f.ang) * R;
      f.y = player.y + Math.sin(f.ang) * R * 0.75;
      const rr = B.orbital_r_px ?? 8;
      world.bullets.forEach(b => {
        if (Math.hypot(b.x - f.x, b.y - f.y) < rr + 3) {
          b.active = false;
          FX.burst(f.x, f.y, { n: 4, color: '#e8e2f5', speed: 40, life: 0.3, size: 1.5, glow: true });
          AudioManager.beep(1500, 0.05, 'triangle', 0.03, -300);
          EventBus.emit('bala_bloqueada', f);
        }
      });
    }
  }
}

// Dibujo (llamado desde el y-sorting de main con sus proyectores SX/SY)
export function drawFamiliar(ctx, SX, SY, f, t) {
  const x = SX(f.x), y = SY(f.y) - 6 + Math.sin(t * 5 + f.ang) * 1.5;
  if (f.id === 'gota_tinta') {
    ctx.fillStyle = 'rgba(20,18,40,0.5)';
    ctx.beginPath(); ctx.ellipse(SX(f.x), SY(f.y) + 3, 5, 2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a2f5e';
    ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.quadraticCurveTo(x + 5, y, x, y + 5);
    ctx.quadraticCurveTo(x - 5, y, x, y - 7); ctx.fill();
    ctx.fillStyle = '#6f7fd8'; ctx.fillRect(x - 1, y - 3, 2, 2);
  } else if (f.id === 'orbital_polilla') {
    const flap = Math.sin(t * 18) * 3;
    ctx.fillStyle = '#d9d2ec';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y - 4 - flap); ctx.lineTo(x - 2, y + 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6, y - 4 - flap); ctx.lineTo(x + 2, y + 2); ctx.fill();
    ctx.fillStyle = '#8d82ad'; ctx.fillRect(x - 1, y - 2, 2, 5);
  }
}
