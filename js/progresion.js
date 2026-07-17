// Progresión gradual — qué está desbloqueado según el nivel de Pip (data/progresion.json).
// Todo se evalúa contra GameState.nivel: retroactivo y sin tocar saves.
import { DataDB } from './data_db.js';
import { GameState } from './state.js';

export function desbloqueos() { return DataDB.progresion?.desbloqueos ?? []; }
export function nivelDe(tipo, id) {
  const d = desbloqueos().find(u => u.tipo === tipo && u.id === id);
  return d ? d.nivel : 1;
}
export function desbloqueado(tipo, id) { return GameState.nivel >= nivelDe(tipo, id); }
export function compasesActivos() {
  return DataDB.compases.compases.filter(c => desbloqueado('compas', c.id));
}
export function desbloqueosEnNivel(n) { return desbloqueos().filter(u => u.nivel === n); }
// Etiqueta humana de un desbloqueo (para flashes y pantalla de Balance)
export function etiqueta(u) {
  if (u.tipo === 'compas') {
    const c = DataDB.compases.compases.find(x => x.id === u.id);
    return { titulo: c?.nombre ?? u.id, sub: c?.desc ?? 'Nueva postura de Cadencia' };
  }
  return { titulo: u.nombre ?? u.id, sub: u.sub ?? '' };
}
