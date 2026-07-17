// Sellos elementales (R2) — botín de los jefes de bioma (decisión de Daniel).
// Colección permanente (GameState.sellosObtenidos) y uno equipado que persiste
// entre runs (GameState.selloEquipado). Los efectos máquina viven en
// data/sellos.json (rasgo_fx / finisher_fx); aquí solo se interpretan.
// Nota de nombres: estos son los sellos ELEMENTALES; nada que ver con los
// nodos-puente de la Esfera ni con el desbloqueo sello_de_marea del Santuario.
import { DataDB } from './data_db.js';
import { GameState, RunState } from './state.js';
import { EventBus } from './event_bus.js';

export function selloDef(id) { return (DataDB.sellos ?? []).find(s => s.id === id) ?? null; }
export function selloEquipado() { return selloDef(GameState.selloEquipado); }

// Recoger un sello: entra en la colección y queda equipado.
export function obtenerSello(id) {
  const def = selloDef(id);
  if (!def) return null;
  if (!GameState.sellosObtenidos.includes(id)) GameState.sellosObtenidos.push(id);
  GameState.selloEquipado = id;
  EventBus.emit('sello_obtenido', def);
  return def;
}

// Rasgo de Marea: los golpes perfectos curan `cura` cada `sp` de Espíritu ganado.
// Devuelve los puntos de vida curados (0 si el sello equipado no cura).
export function rasgoCuraPorSp(spGanado, player) {
  const fx = selloEquipado()?.rasgo_fx;
  if (fx?.tipo !== 'cura_por_sp') return 0;
  RunState.selloSpAcum += spGanado;
  let curado = 0;
  while (RunState.selloSpAcum >= fx.sp) {
    RunState.selloSpAcum -= fx.sp;
    curado += fx.cura;
  }
  if (curado && player) player.health.hp = Math.min(player.health.max, player.health.hp + curado);
  return curado;
}

// ¿El rasgo equipado incendia el rastro del dash? (Ascuas)
export function rasgoDashBurn() {
  const fx = selloEquipado()?.rasgo_fx;
  return fx?.tipo === 'dash_burn' ? fx : null;
}

// Config de la onda elemental del finisher (o null si no hay sello con onda).
export function finisherElemental() {
  const fx = selloEquipado()?.finisher_fx;
  return fx?.tipo === 'onda_elemental' ? fx : null;
}
