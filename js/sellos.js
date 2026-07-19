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

// Rango del sello (C5): sube con Memoria en la Forja del Santuario. Los sellos obtenidos
// arrancan en rango 1; el rango ESCALA la magnitud del rasgo y del finisher.
export function selloRango(id) { return Math.max(1, (GameState.selloRango?.[id] ?? 1) | 0); }
function rangoEq() { return GameState.selloEquipado ? selloRango(GameState.selloEquipado) : 1; }

// Recoger un sello: entra en la colección y queda equipado.
export function obtenerSello(id) {
  const def = selloDef(id);
  if (!def) return null;
  if (!GameState.sellosObtenidos.includes(id)) GameState.sellosObtenidos.push(id);
  (GameState.selloRango ??= {})[id] ??= 1;
  GameState.selloEquipado = id;
  EventBus.emit('sello_obtenido', def);
  return def;
}

// Bonos de stat PASIVOS del sello equipado (Vendaval/Ocaso/Incoloro), como multiplicadores.
// El rango escala la desviación respecto a 1 (rango 2 = doble bono). Devuelve {stat: mult} o null.
export function selloStatPasivo() {
  const fx = selloEquipado()?.rasgo_fx;
  if (fx?.tipo !== 'stat_pasivo' || !fx.stats) return null;
  const r = rangoEq(), out = {};
  for (const k in fx.stats) out[k] = 1 + (fx.stats[k] - 1) * r;
  return out;
}
// Armadura por sala del sello equipado (Peña), escalada por rango. 0 si no aplica.
export function selloArmaduraSala() {
  const fx = selloEquipado()?.rasgo_fx;
  return fx?.tipo === 'armadura_sala' ? (fx.cantidad ?? 0) * rangoEq() : 0;
}
// Cura por sala del sello equipado (Alba), en puntos de vida, escalada por rango. 0 si no aplica.
export function selloCuraSala() {
  const fx = selloEquipado()?.rasgo_fx;
  return fx?.tipo === 'cura_sala' ? (fx.cantidad ?? 0) * rangoEq() : 0;
}
// SP extra por golpe perfecto del sello equipado (Trueno), escalado por rango. 0 si no aplica.
export function selloSpPorPerfecto() {
  const fx = selloEquipado()?.rasgo_fx;
  return fx?.tipo === 'sp_por_perfecto' ? (fx.sp ?? 0) * rangoEq() : 0;
}

// Rasgo de Marea: los golpes perfectos curan `cura` cada `sp` de Espíritu ganado.
// Devuelve los puntos de vida curados (0 si el sello equipado no cura).
export function rasgoCuraPorSp(spGanado, player) {
  const fx = selloEquipado()?.rasgo_fx;
  if (fx?.tipo !== 'cura_por_sp') return 0;
  RunState.selloSpAcum += spGanado;
  let curado = 0;
  const cura = (fx.cura ?? 1) * rangoEq(); // C5: el rango cura más por tramo
  while (RunState.selloSpAcum >= fx.sp) {
    RunState.selloSpAcum -= fx.sp;
    curado += cura;
  }
  if (curado && player) player.health.hp = Math.min(player.health.max, player.health.hp + curado);
  return curado;
}

// ¿El rasgo equipado incendia el rastro del dash? (Ascuas) — el rango alarga la duración.
export function rasgoDashBurn() {
  const fx = selloEquipado()?.rasgo_fx;
  return fx?.tipo === 'dash_burn' ? { ...fx, duracion_s: (fx.duracion_s ?? 2) * rangoEq() } : null;
}

// Config de la onda elemental del finisher (o null si no hay sello con onda). El rango
// agranda el radio y sube el daño de la onda.
export function finisherElemental() {
  const fx = selloEquipado()?.finisher_fx;
  if (fx?.tipo !== 'onda_elemental') return null;
  const r = rangoEq();
  return { ...fx, radio_px: (fx.radio_px ?? 64) * (1 + 0.12 * (r - 1)), dano_mult: (fx.dano_mult ?? 0.6) * (1 + 0.15 * (r - 1)) };
}
