// La Esfera del Reloj — progresión permanente estilo tablero de esferas (FFX).
// XP → niveles → engranajes → nodos. Solo se activan nodos adyacentes a los activados.
// esferaBonos() agrega los efectos; entities/cadencia/spells lo consultan (cacheado).
import { DataDB } from './data_db.js';
import { GameState } from './state.js';
import { EventBus } from './event_bus.js';

let _cache = null, _rev = -1, _ver = 0, _edges = null;

export function nodosEsfera() { return DataDB.esfera?.nodos ?? []; }
export function nodoEsfera(id) { return nodosEsfera().find(n => n.id === id) ?? null; }

// Aristas por regla de reloj: eje→radios XII/III/VI/IX, anillos circulares,
// sellos como puente interior→exterior en cada radio.
export function aristasEsfera() {
  if (_edges) return _edges;
  const E = [];
  for (const h of [0, 3, 6, 9]) E.push(['eje', 'i' + h]);
  for (let h = 0; h < 12; h++) E.push(['i' + h, 'i' + ((h + 1) % 12)]);
  for (const h of [0, 3, 6, 9]) { E.push(['i' + h, 's' + h]); E.push(['s' + h, 'o' + h]); }
  for (let h = 0; h < 12; h++) E.push(['o' + h, 'o' + ((h + 1) % 12)]);
  for (const h of [10, 11, 1, 2]) E.push(['o' + h, 'm' + h]); // Horas Muertas: espolones de medianoche
  _edges = E;
  return E;
}
export function vecinosEsfera(id) {
  const out = [];
  for (const [a, b] of aristasEsfera()) { if (a === id) out.push(b); else if (b === id) out.push(a); }
  return out;
}
export function nodoActivado(id) { return GameState.esfera.includes(id); }
export function nodoDisponible(id) {
  if (nodoActivado(id)) return false;
  return vecinosEsfera(id).some(nodoActivado);
}
export function activarNodo(id, player) {
  const n = nodoEsfera(id);
  if (!n || nodoActivado(id) || !nodoDisponible(id) || GameState.engranajes < n.coste) return false;
  GameState.engranajes -= n.coste;
  GameState.esfera.push(id);
  _ver++;
  if (player) {
    player.applyBalance();
    // Un corazón nuevo llega lleno (convención de items: 1 corazón = 2 puntos)
    if (n.efecto?.tipo === 'stat' && n.efecto.stat === 'max_hp') {
      player.health.hp = Math.min(player.health.max, player.health.hp + n.efecto.add * 2);
    }
  }
  EventBus.emit('esfera_activada', n);
  return true;
}

export function esferaBonos() {
  if (_cache && _rev === _ver) return _cache;
  const b = { statMult: {}, statAdd: {}, window: 1, combo: 0, sp: 1, artes: 1, ignicionDur: 0, oroInicial: 0, xp: 1 };
  // Un único intérprete de efectos; 'multi' (Horas Muertas) recurre sobre su lista.
  const aplicar = ef => {
    switch (ef.tipo) {
      case 'multi': for (const sub of ef.lista) aplicar(sub); break;
      case 'stat':
        if (ef.mult != null) b.statMult[ef.stat] = (b.statMult[ef.stat] ?? 1) * ef.mult;
        if (ef.add != null) b.statAdd[ef.stat] = (b.statAdd[ef.stat] ?? 0) + ef.add;
        break;
      case 'cadencia':
        if (ef.param === 'window') b.window *= ef.mult;
        else if (ef.param === 'combo') b.combo += ef.add;
        break;
      case 'sp': b.sp *= ef.mult; break;
      case 'artes': b.artes *= ef.mult; break;
      case 'ignicion': b.ignicionDur += ef.add; break;
      case 'oro_inicial': b.oroInicial += ef.add; break;
      case 'xp': b.xp *= ef.mult; break;
    }
  };
  for (const id of GameState.esfera) {
    const ef = nodoEsfera(id)?.efecto;
    if (ef) aplicar(ef);
  }
  _cache = b; _rev = _ver;
  return b;
}
export function invalidarEsfera() { _ver++; } // tras cargar partida

// ---------- XP y niveles ----------
export function xpParaNivel(n) {
  const c = DataDB.balance.xp;
  return Math.round(c.nivel_base + (n - 1) * c.nivel_incremento);
}
// Aplica XP; devuelve cuántos niveles se subieron (cada nivel = +1 engranaje)
export function ganarXP(cant) {
  GameState.xp += cant;
  let niveles = 0;
  while (GameState.xp >= xpParaNivel(GameState.nivel)) {
    GameState.xp -= xpParaNivel(GameState.nivel);
    GameState.nivel++;
    GameState.engranajes++;
    niveles++;
  }
  if (niveles) EventBus.emit('nivel_subido', GameState.nivel, niveles);
  return niveles;
}
