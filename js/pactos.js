// Sistema Heat (C4): pactos = condiciones de dificultad OPT-IN, apilables y con niveles.
// Reusa el andamio de "Cuerda Tensa" (nodo del Santuario) generalizándolo a un catálogo
// data-driven (data/pactos.json). Cada pacto sube la dificultad por un LEVER concreto y paga
// +Memoria por tramo. El Heat total = suma de niveles.
//
// FILOSOFÍA (regla de oro 1): las funciones puras (calc*) no tocan estado global y son
// testeables; los lectores de conveniencia (Pactos.*) leen GameState.pactos + DataDB.pactos
// EN EL PUNTO DE USO (rooms/main/entities) para respetar F5.
import { DataDB } from './data_db.js';
import { GameState } from './state.js';

// ---- Funciones PURAS (testeables sin DataDB ni estado) ----

// Nivel activo de un pacto (0 = apagado), acotado a [0, max_nivel].
export function nivelClamp(nivel, def) {
  const max = def?.max_nivel ?? 1;
  return Math.max(0, Math.min(max, nivel | 0));
}

// Heat total = suma de niveles activos.
export function calcHeat(pactos = {}) {
  let h = 0;
  for (const k in pactos) h += Math.max(0, pactos[k] | 0);
  return h;
}

// Multiplicador de Memoria: 1 + Σ(memoria_por_nivel × nivel). Recompensa apilable.
export function calcMemoriaMult(pactos = {}, defs = []) {
  let m = 1;
  for (const d of defs) {
    const n = Math.max(0, (pactos[d.id] | 0));
    if (n > 0) m += (d.memoria_por_nivel ?? 0) * n;
  }
  return m;
}

// Multiplicador de un LEVER de dificultad: 1 + Σ(efecto.por_nivel × nivel) para los pactos
// cuyo efecto.tipo coincide. Ej: efecto('hp_enemigo') sobre {vida_tensa:2} → 1 + 0.18*2 = 1.36.
export function calcEfecto(pactos = {}, defs = [], tipo) {
  let m = 1;
  for (const d of defs) {
    if (d.efecto?.tipo !== tipo) continue;
    const n = Math.max(0, (pactos[d.id] | 0));
    if (n > 0) m += (d.efecto.por_nivel ?? 0) * n;
  }
  return m;
}

// ---- Lectores de conveniencia (leen el estado real, para el punto de uso) ----
export const Pactos = {
  defs() { return DataDB.pactos?.pactos ?? []; },
  def(id) { return this.defs().find(p => p.id === id) ?? null; },
  estado() { return GameState.pactos ?? (GameState.pactos = {}); },
  nivel(id) { return Math.max(0, (this.estado()[id] | 0)); },
  heat() { return calcHeat(this.estado()); },
  activo() { return this.heat() > 0; },
  // Multiplicador del lever (para rooms/entities). base opcional se compone por fuera.
  efecto(tipo) { return calcEfecto(this.estado(), this.defs(), tipo); },
  memoriaMult() { return calcMemoriaMult(this.estado(), this.defs()); },
  // Sube/baja un pacto un nivel, acotado. Devuelve el nuevo nivel.
  ajustar(id, delta) {
    const def = this.def(id); if (!def) return 0;
    const st = this.estado();
    const nuevo = nivelClamp((st[id] | 0) + delta, def);
    if (nuevo <= 0) delete st[id]; else st[id] = nuevo;
    return nuevo;
  }
};
