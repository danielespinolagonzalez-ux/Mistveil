// EventBus — SOLO señales globales. Sin lógica. (regla de oro nº1)
const listeners = new Map();

export const EventBus = {
  on(signal, fn) {
    if (!listeners.has(signal)) listeners.set(signal, new Set());
    listeners.get(signal).add(fn);
    return () => listeners.get(signal)?.delete(fn);
  },
  // Suscripción de un solo disparo (se limpia sola)
  once(signal, fn) {
    const un = this.on(signal, (...args) => { un(); fn(...args); });
    return un;
  },
  off(signal, fn) { listeners.get(signal)?.delete(fn); },
  emit(signal, ...args) {
    const set = listeners.get(signal);
    if (set) for (const fn of [...set]) fn(...args);
  },
  clear(signal) { listeners.delete(signal); }
};
// Señales usadas (nombres en pasado): 'enemy_died', 'room_cleared',
// 'player_hurt', 'player_died', 'data_reloaded'
