// Motor de efectos de items (reliquias) — data-driven desde data/items.json.
// Spec: docs/sistemas/objetos_sinergias.md. Añadir contenido nuevo NO debe requerir código nuevo.
import { DataDB } from './data_db.js';
import { EventBus } from './event_bus.js';
import { RunState, AudioManager } from './state.js';

// Aplica los efectos[] de un item al jugador. Los efectos se acumulan en
// player.mods y Player.recomputeStats() los compone sobre balance.json.
export function applyItem(itemDef, player) {
  RunState.items.push(itemDef.id);
  return applyItemEffects(itemDef, player);
}
// Aplica una lista de efectos[] al jugador (lo usan items Y conjuntos/set-bonus C3).
export function aplicarEfectos(efectos, player, origen = 'item') {
  for (const ef of efectos) {
    switch (ef.tipo) {
      case 'stat': {
        const m = player.mods;
        if (ef.mult != null) m.statMult[ef.stat] = (m.statMult[ef.stat] ?? 1) * ef.mult;
        if (ef.add != null) m.statAdd[ef.stat] = (m.statAdd[ef.stat] ?? 0) + ef.add;
        break;
      }
      case 'tear_flag':
        player.mods.tearFlags.add(ef.flag);
        break;
      case 'element_change':
        player.mods.tearElement = ef.elemento;
        break;
      case 'cadencia_mod': {
        const m = player.mods.cadencia;
        if (ef.param === 'window_scale') m.window_scale *= (ef.mult ?? 1);
        else if (ef.param === 'combo_hits_base') m.combo_add += (ef.add ?? 0);
        break;
      }
      case 'ignicion_mod':
        if (ef.param === 'sp_gain') player.mods.spGainMult *= (ef.mult ?? 1);
        else if (ef.param === 'duration_s') player.mods.ignicionDurAdd += (ef.add ?? 0);
        else player.mods.pendientes.push(origen + ':' + ef.param);
        break;
      case 'on_event':
        switch (ef.accion) {
          case 'heal':
            // cantidad en corazones → 2 puntos por corazón
            player.health.hp = Math.min(player.health.max, player.health.hp + ef.cantidad * 2);
            break;
          case 'grant_armor':
            player.mods.armorPerRoom += ef.cantidad;
            break;
          case 'auto_parry':
            player.mods.autoParryPerRoom += ef.usos_por_sala;
            break;
          case 'shockwave':
            player.mods.finisherShock = { radio: ef.radio_px, dano_mult: ef.dano_mult };
            break;
          case 'freeze_room':
            player.mods.parryFreezeS = Math.max(player.mods.parryFreezeS, ef.duracion_s);
            break;
          case 'reveal_map':
            player.mods.revealMap = true;
            EventBus.emit('mapa_revelado');
            break;
          case 'damage_trail':
            player.mods.dashTrail = { duracion_s: ef.duracion_s, dano_por_s: ef.dano_por_s };
            break;
          case 'extra_choice':
            player.mods.extraChoice = Math.max(player.mods.extraChoice, ef.opciones ?? 2);
            break;
          default:
            player.mods.pendientes.push(origen + ':' + ef.accion); // desconocido: queda registrado
        }
        break;
      case 'groove_buff': {
        // C1 — payoff rítmico: el bono SOLO aplica con la racha (groove) alta. stat: dano|vel|tear_rate.
        const key = ef.stat === 'vel' ? 'grooveVel' : ef.stat === 'tear_rate' ? 'grooveTearRate' : 'grooveDano';
        player.mods[key] = (player.mods[key] ?? 0) + (ef.mult ?? 0);
        break;
      }
      case 'familiar':
        player.mods.familiares.push(ef.id);
        break;
      case 'activo':
        // Objeto activo (tecla X): un solo hueco; coger otro lo sustituye ya cargado
        player.mods.activo = { accion: ef.accion, factor: ef.factor, duracion_s: ef.duracion_s, cooldown_salas: ef.cooldown_salas };
        RunState.activoSalas = ef.cooldown_salas;
        break;
      default:
        player.mods.pendientes.push(origen + ':' + ef.tipo); // desconocido: queda registrado
    }
  }
}

// Aplica los efectos de UN item + recalcula sinergias, conjuntos (set-bonus C3) y stats.
// Lo usa la Fundición al reconstruir mods (por eso no registra el item en RunState).
export function applyItemEffects(itemDef, player) {
  aplicarEfectos(itemDef.efectos, player, itemDef.id);
  // Sinergias declaradas cuyo par está completo (pares con nombre; efecto = flavor + display)
  for (const syn of DataDB.items.sinergias ?? []) {
    if (syn.ids.every(id => RunState.items.includes(id)) && !player.mods.sinergias.includes(syn.nombre)) {
      player.mods.sinergias.push(syn.nombre);
      EventBus.emit('sinergia_activada', syn);
    }
  }
  // Conjuntos / set-bonus (C3): al reunir N reliquias de una MISMA etiqueta se desbloquea un
  // efecto de conjunto (reusa el formato de efectos). Una sola vez por umbral cruzado.
  player.mods.conjuntos ??= [];
  for (const c of DataDB.items.conjuntos ?? []) {
    const key = c.tag + ':' + c.umbral;
    const cuenta = RunState.items.filter(id => DataDB.item(id)?.tags?.includes(c.tag)).length;
    if (cuenta >= c.umbral && !player.mods.conjuntos.includes(key)) {
      player.mods.conjuntos.push(key);
      aplicarEfectos(c.efectos ?? [], player, 'conjunto:' + c.tag);
      EventBus.emit('conjunto_activado', c);
    }
  }
  player.recomputeStats();
  AudioManager.sfx('equip');
  EventBus.emit('item_equipado', itemDef);
}

// Elige un item aleatorio por rareza (tabla en balance) del pool dado, sin repetir.
export function rollItem(pool) {
  const pct = DataDB.balance.items_rareza_pct;
  const r = Math.random() * 100;
  const rareza = r < pct.legendario ? 'legendario' : r < pct.legendario + pct.raro ? 'raro' : 'comun';
  const owned = new Set(RunState.items);
  let cands = DataDB.items.items.filter(i => i.pools.includes(pool) && !owned.has(i.id) && i.rareza === rareza);
  if (!cands.length) cands = DataDB.items.items.filter(i => i.pools.includes(pool) && !owned.has(i.id));
  if (!cands.length) return null;
  return cands[Math.floor(Math.random() * cands.length)];
}
