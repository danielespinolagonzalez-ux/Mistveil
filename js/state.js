// GameState (meta persistente) + RunState (estado de la run) + SaveManager + AudioManager
// Stubs funcionales: crecen en fases 6-10.

export const GameState = {
  memoria: 0,
  desbloqueos: [],
  xp: 0, nivel: 1, engranajes: 0,        // progresión: XP por piso → niveles → engranajes
  esfera: ['eje'],                       // nodos activados de la Esfera del Reloj
  usoHechizos: {}, usoCompases: {},      // "todo sube de nivel": contadores de uso
  cuerdaTensa: false,           // modo reto (requiere cuarto_de_la_penumbra)
  flags: {},                    // narrativa/pueblo (hermanos_memoria, ate_idx...)
  stats: { runs: 0, muertes: 0, victorias: 0 },
  opciones: { escala_ventanas: 1.0, vol_musica: 1.0, vol_sfx: 1.0, esquema_control: 'raton' },
  tiene(id) { return this.desbloqueos.includes(id); }
};

export const RunState = {
  piso: 1, oro: 0, sp: 0, items: [], semilla: 0, activoSalas: 0,
  hechizo: 'estallido_de_tinta',           // Arte de Tinta equipada (Q)
  tomos: ['estallido_de_tinta'],           // hechizos conocidos
  compas: 'tic_tac',                       // ritmo de Cadencia elegido (C)
  mejoras: [],                             // mejoras de piso elegidas
  bendiciones: [],                         // regalos del pueblo para la próxima run
  floorStats: null,                        // crónica del piso actual (alimenta el XP)
  resetFloorStats() {
    this.floorStats = { kills: 0, perfects: 0, goods: 0, fails: 0, parries: 0, salas: 0, corazones: 0 };
  },
  reset() {
    this.piso = 1; this.oro = 0; this.sp = 0; this.items = [];
    this.hechizo = 'estallido_de_tinta';
    this.tomos = ['estallido_de_tinta'];
    this.compas = 'tic_tac';
    this.mejoras = [];
    // bendiciones NO se resetean aquí: se consumen en newRun
    this.semilla = (Math.random() * 0xFFFFFFFF) >>> 0;
    this.resetFloorStats();
    this.contrato = null;      // contrato del Gremio (tablón del pueblo)
    this.apuesta = null;       // Reloj de Apuestas
    this.activoSalas = 0;      // salas limpiadas desde el último uso del objeto activo
    this.arteGratis = false;   // sinergia de Campana
    this.compasRobado = null;  // El Primer Relojero
  }
};

export const SaveManager = {
  KEY: 'mistveil_save',
  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({
        schema: 2, memoria: GameState.memoria,
        desbloqueos: GameState.desbloqueos, opciones: GameState.opciones,
        cuerdaTensa: GameState.cuerdaTensa, stats: GameState.stats, flags: GameState.flags,
        xp: GameState.xp, nivel: GameState.nivel, engranajes: GameState.engranajes,
        ligaRango: GameState.ligaRango ?? 0,
        esfera: GameState.esfera, usoHechizos: GameState.usoHechizos, usoCompases: GameState.usoCompases
      }));
    } catch (e) { console.warn('SaveManager: no se pudo guardar', e); }
  },
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (d.schema !== 1 && d.schema !== 2) return false;
      GameState.memoria = d.memoria ?? 0;
      GameState.desbloqueos = d.desbloqueos ?? [];
      GameState.cuerdaTensa = d.cuerdaTensa ?? false;
      GameState.flags = d.flags ?? {};
      GameState.xp = d.xp ?? 0;
      GameState.nivel = d.nivel ?? 1;
      GameState.engranajes = d.engranajes ?? 0;
      GameState.ligaRango = d.ligaRango ?? 0;
      GameState.esfera = (Array.isArray(d.esfera) && d.esfera.length) ? d.esfera : ['eje'];
      GameState.usoHechizos = d.usoHechizos ?? {};
      GameState.usoCompases = d.usoCompases ?? {};
      Object.assign(GameState.stats, d.stats ?? {});
      Object.assign(GameState.opciones, d.opciones ?? {});
      return true;
    } catch { return false; }
  }
};

// AudioManager — beeps por código (WebAudio) hasta tener SFX reales.
export const AudioManager = {
  ctx: null,
  _ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  beep(freq, dur = 0.08, type = 'square', gain = 0.06, slide = 0) {
    try {
      this._ensure();
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(gain * GameState.opciones.vol_sfx, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch { /* audio no disponible */ }
  },
  // Ruido filtrado (texturas: impactos, explosiones, viento)
  _noiseBuf: null,
  noise(dur = 0.15, freq = 800, gain = 0.05, slide = -400) {
    try {
      this._ensure();
      const c = this.ctx;
      if (!this._noiseBuf) {
        this._noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
        const d = this._noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const t = c.currentTime;
      const s = c.createBufferSource(); s.buffer = this._noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
      f.frequency.setValueAtTime(freq, t);
      if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq + slide), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(gain * GameState.opciones.vol_sfx, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(c.destination);
      s.start(t); s.stop(t + dur + 0.02);
    } catch { /* audio no disponible */ }
  },

  // Campana lejana (música y jefe): parciales inarmónicos + eco de piedra
  bell(freq, gain = 0.05) {
    try {
      this._ensure();
      const c = this.ctx, t = c.currentTime;
      const g = c.createGain();
      g.gain.setValueAtTime(gain * GameState.opciones.vol_musica, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
      for (const [m, w] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq * m;
        const og = c.createGain(); og.gain.value = w;
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + 3.5);
      }
      g.connect(this.music ? this.music.out : c.destination);
      if (this.music) g.connect(this.music.dl);
    } catch { /* audio no disponible */ }
  },

  // Música ambiental generativa: dron de órgano lejano + campanas esporádicas + tic-tac del Reloj
  music: null,
  startAmbient() {
    if (this.music) return;
    try {
      this._ensure();
      const c = this.ctx;
      const out = c.createGain();
      out.gain.value = 0.9 * GameState.opciones.vol_musica;
      out.connect(c.destination);
      // eco de sala de piedra (delay con retroalimentación filtrada)
      const dl = c.createDelay(1.2); dl.delayTime.value = 0.46;
      const fb = c.createGain(); fb.gain.value = 0.4;
      const damp = c.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 850;
      dl.connect(damp); damp.connect(fb); fb.connect(dl);
      dl.connect(out);
      this.music = { out, dl, timers: [] };
      // dron grave que respira
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 230; lp.Q.value = 0.7;
      const dg = c.createGain(); dg.gain.value = 0.042;
      lp.connect(dg); dg.connect(out); dg.connect(dl);
      for (const f of [55, 55.35, 82.4, 110.5]) {
        const o = c.createOscillator(); o.type = f < 100 ? 'triangle' : 'sine'; o.frequency.value = f;
        o.connect(lp); o.start();
      }
      const lfo = c.createOscillator(); lfo.frequency.value = 0.045;
      const lg = c.createGain(); lg.gain.value = 0.02;
      lfo.connect(lg); lg.connect(dg.gain); lfo.start();
      // campanas lejanas, pentáfrasis del Reloj
      const notas = [220, 246.94, 293.66, 329.63, 392, 440];
      const campana = () => {
        if (!this.music) return;
        this.bell(notas[(Math.random() * notas.length) | 0] * (Math.random() < 0.3 ? 0.5 : 1), 0.045);
        this.music.timers[0] = setTimeout(campana, 6000 + Math.random() * 11000);
      };
      this.music.timers[0] = setTimeout(campana, 2500);
      // tic-tac casi subliminal
      let tic = false;
      const tick = () => {
        if (!this.music) return;
        this.beep(tic ? 1900 : 1520, 0.012, 'square', 0.007);
        tic = !tic;
        this.music.timers[1] = setTimeout(tick, 1000);
      };
      this.music.timers[1] = setTimeout(tick, 1200);
    } catch { this.music = null; }
  },

  sfx(name) {
    switch (name) {
      case 'tear': this.beep(760, 0.045, 'triangle', 0.03); break;
      case 'hit': this.beep(300, 0.05, 'square', 0.045); break;
      case 'enemy_die': this.beep(420, 0.16, 'sawtooth', 0.05, -300); this.noise(0.22, 900, 0.045, -700); break;
      case 'hurt': this.beep(130, 0.22, 'sawtooth', 0.08, -60); this.noise(0.28, 500, 0.055, -380); break;
      case 'dash': this.beep(520, 0.07, 'sine', 0.04, 240); this.noise(0.12, 1500, 0.028, 700); break;
      case 'clear': this.beep(660, 0.1, 'triangle', 0.05); setTimeout(() => this.beep(990, 0.16, 'triangle', 0.05), 90); break;
      case 'die': this.beep(220, 0.5, 'sawtooth', 0.07, -170); break;
      case 'gold': this.beep(1180, 0.06, 'triangle', 0.04); break;
      case 'heart': this.beep(700, 0.08, 'sine', 0.05); setTimeout(() => this.beep(1050, 0.12, 'sine', 0.05), 70); break;
      // Cadencia: el jugador debe poder jugar "de oído"
      case 'cad_perfect': this.beep(1420, 0.11, 'sine', 0.07); this.beep(2130, 0.09, 'sine', 0.03); break;
      case 'cad_good': this.beep(880, 0.08, 'triangle', 0.055); break;
      case 'cad_fail': this.beep(140, 0.16, 'square', 0.07, -40); break;
      case 'cad_counter': this.beep(620, 0.3, 'sine', 0.08); this.beep(1244, 0.22, 'sine', 0.04); break;
      case 'parry': this.beep(1500, 0.1, 'sine', 0.06, 500); this.beep(300, 0.05, 'square', 0.04); break;
      case 'finisher': this.beep(520, 0.2, 'sawtooth', 0.07, -320); this.beep(1040, 0.12, 'sine', 0.04); break;
      case 'door_open': this.beep(240, 0.18, 'triangle', 0.05, 80); break;
      case 'door_seal': this.beep(170, 0.2, 'square', 0.05, -60); break;
      case 'wax_break': this.beep(360, 0.1, 'square', 0.04, -160); this.noise(0.18, 1100, 0.05, -600); break;
      case 'explode': this.beep(85, 0.35, 'sawtooth', 0.09, -40); this.noise(0.5, 320, 0.11, -240); break;
      case 'cast_nova': this.beep(520, 0.12, 'triangle', 0.06, 300); this.beep(780, 0.18, 'sine', 0.04, -200); break;
      case 'cast_onda': this.beep(300, 0.25, 'sine', 0.07, -140); this.beep(150, 0.3, 'triangle', 0.05, -60); break;
      case 'cast_cono': this.beep(200, 0.3, 'sawtooth', 0.06, 260); break;
      case 'no_sp': this.beep(180, 0.08, 'square', 0.05); setTimeout(() => this.beep(140, 0.1, 'square', 0.05), 70); break;
      case 'equip': this.beep(660, 0.1, 'triangle', 0.05); setTimeout(() => this.beep(880, 0.1, 'triangle', 0.05), 80); setTimeout(() => this.beep(1320, 0.14, 'triangle', 0.05), 160); break;
      case 'tome': this.beep(440, 0.12, 'sine', 0.05); setTimeout(() => this.beep(587, 0.12, 'sine', 0.05), 90); setTimeout(() => this.beep(880, 0.2, 'sine', 0.05), 180); break;
      case 'armor': this.beep(500, 0.08, 'square', 0.05, -100); break;
    }
  }
};
