// Artes de Tinta — hechizos lanzados con Q gastando SP (data/hechizos.json).
// El SP viene de la Cadencia: melé arriesgado → magia. Cast interpreta 'tipo'.
// Cada Arte SUBE DE NIVEL con el uso (balance.xp.hechizo_niveles): más daño y área.
import { DataDB } from './data_db.js';
import { EventBus } from './event_bus.js';
import { RunState, GameState, AudioManager } from './state.js';
import { esferaBonos } from './esfera.js';

// Multiplicador elemental (spec combate.md §Capa 4)
export function elementMult(atk, def) {
  if (!atk || !def || atk === 'neutro' || def === 'neutro') return DataDB.balance.elementos.neutral_mult;
  if (atk === def) return DataDB.balance.elementos.same_mult;
  if (DataDB.elementos[atk]?.opuesto === def) return DataDB.balance.elementos.opposite_mult;
  return DataDB.balance.elementos.neutral_mult;
}

export function nivelHechizo(id) {
  const c = DataDB.balance.xp;
  if (!c) return 1;
  const uso = GameState.usoHechizos?.[id] ?? 0;
  let lv = 1;
  for (const th of c.hechizo_niveles) if (uso >= th) lv++;
  return lv;
}

export function canCast(id) {
  const h = DataDB.hechizo(id);
  return h && RunState.sp >= h.coste_sp;
}

// Devuelve true si se lanzó. world: {tears, enemies}; cur: sala actual (para la cera).
export function cast(id, player, world, cur) {
  const h = DataDB.hechizo(id);
  if (!h) return false;
  // Sinergia de Campana: un combo inmaculado deja el Arte cargada (gratis)
  const gratis = !!RunState.arteGratis;
  if (!gratis && RunState.sp < h.coste_sp) {
    AudioManager.sfx('no_sp');
    EventBus.emit('hechizo_sin_sp', h);
    return false;
  }
  if (gratis) RunState.arteGratis = false;
  else RunState.sp -= h.coste_sp;
  EventBus.emit('sp_changed', RunState.sp);
  const alive = world.enemies.filter(e => !e.health.dead);
  const stats = player.stats;
  // Nivel del Arte (por uso) + nodos de la Esfera del Reloj
  const cx = DataDB.balance.xp;
  const lv = nivelHechizo(id);
  const dmgMult = (cx?.hechizo_dano_mult[lv - 1] ?? 1) * esferaBonos().artes;
  const areaMult = cx?.hechizo_area_mult[lv - 1] ?? 1;

  switch (h.tipo) {
    case 'nova': {
      const p = h.params;
      for (let i = 0; i < p.n; i++) {
        const a = (i / p.n) * Math.PI * 2;
        const t = world.tears.spawn(
          player.x + Math.cos(a) * 8, player.y + Math.sin(a) * 8,
          Math.cos(a) * stats.tear_speed * p.velocidad_mult,
          Math.sin(a) * stats.tear_speed * p.velocidad_mult,
          p.alcance_px * areaMult, stats.tear_damage * p.dano_mult * dmgMult
        );
        t.elemento = h.elemento;
      }
      AudioManager.sfx('cast_nova');
      break;
    }
    case 'onda': {
      const p = h.params;
      const radio = p.radio_px * areaMult;
      for (const e of alive) {
        const dx = e.x - player.x, dy = e.y - player.y;
        const d = Math.hypot(dx, dy);
        if (d < radio + e.r) {
          const dmg = p.dano * dmgMult * elementMult(h.elemento, e.def.elemento);
          e.takeDamage(dmg, player.x, player.y, p.knockback / DataDB.balance.player.tear_knockback_px_s);
          e.burn = null; // el agua apaga
        }
      }
      AudioManager.sfx('cast_onda');
      break;
    }
    case 'cono': {
      const p = h.params;
      const alcance = p.alcance_px * areaMult;
      const half = (p.angulo_deg * Math.PI / 180) / 2;
      const aim = Math.atan2(player.aim.y, player.aim.x);
      for (const e of alive) {
        const dx = e.x - player.x, dy = e.y - player.y;
        const d = Math.hypot(dx, dy);
        if (d > alcance + e.r) continue;
        let da = Math.atan2(dy, dx) - aim;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) > half) continue;
        const dmg = p.dano * dmgMult * elementMult(h.elemento, e.def.elemento);
        e.takeDamage(dmg, player.x, player.y, 0.8);
        // Sinergia Febril × fuego: la quema se extiende
        if (p.quema_s) e.burn = { t: p.quema_s * (RunState.compas === 'allegro' ? (DataDB.balance.sinergias?.febril_quema_mult ?? 1) : 1), tick: 0 };
      }
      // El fuego derrite la cera del cono
      if (cur) {
        for (const w of [...cur.wax]) {
          const wx = w.x + w.w / 2, wy = w.y + w.h / 2;
          const d = Math.hypot(wx - player.x, wy - player.y);
          if (d > alcance + 20) continue;
          let da = Math.atan2(wy - player.y, wx - player.x) - aim;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          if (Math.abs(da) <= half) cur.breakWax(w);
        }
        // ...y SECA la tinta del Archivo Anegado
        if (cur.tinta?.length) {
          cur.tinta = cur.tinta.filter(r => {
            const rx = r.x + r.w / 2, ry = r.y + r.h / 2;
            const d = Math.hypot(rx - player.x, ry - player.y);
            if (d > alcance + 24) return true;
            let da = Math.atan2(ry - player.y, rx - player.x) - aim;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            return Math.abs(da) > half;
          });
        }
      }
      AudioManager.sfx('cast_cono');
      break;
    }
  }
  // El uso perfecciona el Arte
  GameState.usoHechizos[id] = (GameState.usoHechizos[id] ?? 0) + 1;
  const lvNew = nivelHechizo(id);
  if (lvNew > lv) EventBus.emit('hechizo_subio', h, lvNew);
  EventBus.emit('hechizo_lanzado', h, player.x, player.y);
  return true;
}
