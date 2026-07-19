// DataDB — carga y valida todos los data/*.json al arrancar. Solo lectura.
// F5 en debug = recarga en caliente (emite 'data_reloaded').
import { EventBus } from './event_bus.js';

const FILES = {
  balance: 'data/balance.json',
  biomas: 'data/biomas.json',
  elementos: 'data/elementos.json',
  enemigos: 'data/enemigos.json',
  items: 'data/items.json',
  hechizos: 'data/hechizos.json',
  compases: 'data/compases.json',
  santuario: 'data/santuario.json',
  progresion: 'data/progresion.json',
  esfera: 'data/esfera.json',
  sellos: 'data/sellos.json',
  textos: 'data/textos_es.json',
  salas_piso1: 'data/salas/piso1_plantillas.json',
  jefes: 'data/jefes.json',
  musica: 'data/musica.json'
};

// Claves mínimas requeridas por archivo (validación con errores claros)
const REQUIRED = {
  balance: ['player', 'cadencia', 'ignicion', 'elementos', 'run'],
  elementos: ['neutro', 'fuego', 'agua'],
  enemigos: ['enemigos', 'jefes', 'pools_spawn'],
  items: ['items'],
  hechizos: ['hechizos'],
  textos: ['ui.muerte']
};
const REQUIRED_PLAYER = ['max_hp', 'move_speed', 'acceleration', 'friction',
  'tear_damage', 'tear_rate_per_s', 'tear_speed', 'tear_range_px',
  'dash_speed', 'dash_duration_s', 'dash_cooldown_s', 'dash_iframes_s', 'hurt_iframes_s'];

export const DataDB = {
  balance: null, elementos: null, enemigos: null, items: null,
  sellos: null, textos: null, salas_piso1: null,
  errors: [],

  async load() {
    this.errors = [];
    for (const [key, path] of Object.entries(FILES)) {
      try {
        const res = await fetch(path, { cache: 'reload' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        this[key] = await res.json();
      } catch (e) {
        this.errors.push(`DataDB: no se pudo cargar '${path}' (${e.message})`);
      }
    }
    this._validate();
    if (this.errors.length) {
      for (const err of this.errors) console.error(err);
    }
    return this.errors.length === 0;
  },

  _validate() {
    for (const [key, keys] of Object.entries(REQUIRED)) {
      if (!this[key]) continue;
      for (const k of keys) {
        if (!(k in this[key])) this.errors.push(`DataDB: falta la clave '${k}' en ${FILES[key]}`);
      }
    }
    if (this.balance?.player) {
      for (const k of REQUIRED_PLAYER) {
        if (!(k in this.balance.player)) this.errors.push(`DataDB: falta 'player.${k}' en data/balance.json`);
      }
    }
  },

  enemigo(id) {
    return this.enemigos?.enemigos.find(e => e.id === id) ?? null;
  },
  item(id) {
    return this.items?.items.find(i => i.id === id) ?? null;
  },
  hechizo(id) {
    return this.hechizos?.hechizos.find(h => h.id === id) ?? null;
  },
  compas(id) {
    return this.compases?.compases.find(c => c.id === id) ?? this.compases?.compases[0] ?? null;
  },
  nodo(id) {
    return this.santuario?.nodos.find(n => n.id === id) ?? null;
  },
  // BPM/desfase de una pista para el reloj de beat; null si no está medida.
  musicaBpm(id) {
    const m = this.musica?.[id];
    return (m && m.bpm > 0) ? m : null;
  },
  texto(clave) {
    return this.textos?.[clave] ?? `[${clave}]`;
  },

  async reload() {
    const ok = await this.load();
    EventBus.emit('data_reloaded');
    console.log('DataDB: recarga en caliente ' + (ok ? 'OK' : 'con errores'));
    return ok;
  }
};
