// GameState (meta persistente) + RunState (estado de la run) + SaveManager + AudioManager
// Stubs funcionales: crecen en fases 6-10.
// DataDB (solo lectura) para el BPM por pista del reloj de beat y config de música reactiva.
import { DataDB } from './data_db.js';

export const GameState = {
  memoria: 0,
  desbloqueos: [],
  xp: 0, nivel: 1, engranajes: 0,        // progresión: XP por piso → niveles → engranajes
  esfera: ['eje'],                       // nodos activados de la Esfera del Reloj
  usoHechizos: {}, usoCompases: {},      // "todo sube de nivel": contadores de uso
  pactos: {},                   // Heat (C4): { id_pacto: nivel } — condiciones de dificultad OPT-IN apilables (requiere cuarto_de_la_penumbra); antes era el booleano cuerdaTensa
  sellosObtenidos: [],          // sellos elementales conseguidos (botín de jefes / Forja del Santuario)
  selloEquipado: null,          // sello elemental activo (persiste entre runs)
  selloRango: {},               // C5: { id_sello: rango } — el rango escala el rasgo/finisher (sube con Memoria)
  flags: {},                    // narrativa/pueblo (hermanos_memoria, ate_idx...)
  stats: { runs: 0, muertes: 0, victorias: 0 },
  opciones: { escala_ventanas: 1.0, vol_musica: 1.0, vol_sfx: 1.0, esquema_control: 'raton', latencia_ms: 0 },
  tiene(id) { return this.desbloqueos.includes(id); }
};

export const RunState = {
  piso: 1, oro: 0, sp: 0, items: [], semilla: 0, activoSalas: 0, selloSpAcum: 0,
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
    this.selloSpAcum = 0;      // SP de perfectos acumulado para el rasgo de Marea
    this.arteGratis = false;   // sinergia de Campana
    this.compasRobado = null;  // El Primer Relojero
  }
};

export const SaveManager = {
  KEY: 'mistveil_save',
  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({
        schema: 3, memoria: GameState.memoria,
        desbloqueos: GameState.desbloqueos, opciones: GameState.opciones,
        pactos: GameState.pactos, stats: GameState.stats, flags: GameState.flags,
        xp: GameState.xp, nivel: GameState.nivel, engranajes: GameState.engranajes,
        ligaRango: GameState.ligaRango ?? 0,
        esfera: GameState.esfera, usoHechizos: GameState.usoHechizos, usoCompases: GameState.usoCompases,
        sellosObtenidos: GameState.sellosObtenidos, selloEquipado: GameState.selloEquipado,
        selloRango: GameState.selloRango
      }));
    } catch (e) { console.warn('SaveManager: no se pudo guardar', e); }
  },
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (![1, 2, 3].includes(d.schema)) return false;
      GameState.memoria = d.memoria ?? 0;
      GameState.desbloqueos = d.desbloqueos ?? [];
      // Migración C4 (schema 2→3): el booleano cuerdaTensa se generaliza al mapa de pactos.
      // Una run "tensa" antigua equivale a Cuerda Tensa nivel 2 (+36% vida enemiga).
      GameState.pactos = (d.pactos && typeof d.pactos === 'object') ? d.pactos : (d.cuerdaTensa ? { vida_tensa: 2 } : {});
      GameState.flags = d.flags ?? {};
      GameState.xp = d.xp ?? 0;
      GameState.nivel = d.nivel ?? 1;
      GameState.engranajes = d.engranajes ?? 0;
      GameState.ligaRango = d.ligaRango ?? 0;
      GameState.esfera = (Array.isArray(d.esfera) && d.esfera.length) ? d.esfera : ['eje'];
      GameState.usoHechizos = d.usoHechizos ?? {};
      GameState.usoCompases = d.usoCompases ?? {};
      GameState.sellosObtenidos = d.sellosObtenidos ?? [];
      GameState.selloEquipado = d.selloEquipado ?? null;
      GameState.selloRango = (d.selloRango && typeof d.selloRango === 'object') ? d.selloRango : {}; // C5 (campo aditivo tolerante)
      Object.assign(GameState.stats, d.stats ?? {});
      Object.assign(GameState.opciones, d.opciones ?? {});
      return true;
    } catch { return false; }
  },

  // ---- Guardado de la RUN en curso (B1). KEY aparte para no mezclar con el meta;
  // el snapshot lo construye main.js (buildSnapshot). schema propio, tolerante. ----
  RUN_KEY: 'mistveil_run',
  RUN_SCHEMA: 1,
  saveRun(snap) {
    try {
      if (!snap || typeof snap.piso !== 'number') return;
      localStorage.setItem(this.RUN_KEY, JSON.stringify({ schema: this.RUN_SCHEMA, ...snap }));
    } catch (e) { console.warn('SaveManager: no se pudo guardar la run', e); }
  },
  loadRun() {
    try {
      const raw = localStorage.getItem(this.RUN_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (d.schema !== this.RUN_SCHEMA || typeof d.piso !== 'number') return null;
      return d;
    } catch { return null; }
  },
  hasRun() { return !!this.loadRun(); },
  clearRun() { try { localStorage.removeItem(this.RUN_KEY); } catch {} }
};

// AudioManager — beeps por código (WebAudio) hasta tener SFX reales.
export const AudioManager = {
  ctx: null,
  _ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this._sfxLoaded) this.loadSfx(); // precarga los SFX reales la 1ª vez
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

  // ---- SFX REALES (assets/audio/sfx_*.wav) decodificados a AudioBuffer y
  // disparados por WebAudio (baja latencia, se solapan, y suenan por el canal
  // media en iOS gracias al tag silencioso). Si el fichero falta (p. ej. en el
  // bundle sin assets/audio), _sfxBuffers[name] queda vacío y sfx() cae al beep. ----
  _sfxBuffers: {},
  _sfxLoaded: false,
  _sfxNombres: ['tear', 'hit', 'enemy_die', 'hurt', 'dash', 'parry', 'cad_perfect', 'cad_good', 'gold', 'heart',
    'cast_nova', 'cast_onda', 'cast_cono', 'explode', 'wax_break', 'door_open', 'cad_fail', 'cad_counter', 'clear'],
  // Ganancia por SFX (los WAV van normalizados a -1 dBFS = altos; aquí se equilibran).
  // tear es más bajo porque se dispara en ráfaga y se solaparía.
  _sfxGain: { tear: 0.42, hit: 0.6, enemy_die: 0.62, hurt: 0.72, dash: 0.5, parry: 0.62, cad_perfect: 0.72, cad_good: 0.5, gold: 0.55, heart: 0.62,
    cast_nova: 0.65, cast_onda: 0.65, cast_cono: 0.65, explode: 0.72, wax_break: 0.55, door_open: 0.55, cad_fail: 0.5, cad_counter: 0.72, clear: 0.62 },
  loadSfx() {
    if (this._sfxLoaded || !this.ctx) return;
    this._sfxLoaded = true;
    for (const name of this._sfxNombres) {
      fetch(this.musicBase + 'sfx_' + name + '.wav')
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject()))
        .then(ab => new Promise((ok, no) => this.ctx.decodeAudioData(ab, ok, no))) // forma callback: iOS viejo también
        .then(buf => { this._sfxBuffers[name] = buf; })
        .catch(() => { /* falta el fichero o no decodifica: se queda el beep */ });
    }
  },
  _playSample(name, pitch = 1) {
    try {
      const buf = this._sfxBuffers[name];
      if (!buf) return false;
      this._ensure();
      const c = this.ctx, t = c.currentTime;
      const s = c.createBufferSource(); s.buffer = buf;
      if (pitch !== 1) s.playbackRate.value = pitch; // varía el tono (anti-ametralladora / arpegio de combo)
      const g = c.createGain();
      g.gain.value = (this._sfxGain[name] ?? 0.55) * GameState.opciones.vol_sfx;
      s.connect(g); g.connect(c.destination);
      s.start(t);
      return true;
    } catch { return false; }
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
        // Mientras suena una pista REAL, ella es el reloj: callamos el tic-tac para no
        // pelear dos tempos (la pista ya tiene su propio beat, ver beatClock()).
        if (!this._musSrc && !this._musFallbackEl) { this.beep(tic ? 1900 : 1520, 0.012, 'square', 0.007); tic = !tic; }
        this.music.timers[1] = setTimeout(tick, 1000);
      };
      this.music.timers[1] = setTimeout(tick, 1200);
    } catch { this.music = null; }
  },

  // ---- Pistas de música REALES (assets/audio/*.mp3). Se cargan por separado (no
  // van en el bundle); si faltan o el autoplay está bloqueado, se mantiene el dron
  // procedural de arriba. El director de escena (main.js) pide la pista por evento. ----
  _musicUnlocked: false,
  _trackEls: {},   // solo para el reproductor de reserva (HTMLAudio) si WebAudio falla
  _curId: null,
  _desiredId: null,
  _desiredOpts: null,
  _iosTag: null,   // <audio> silencioso en bucle: desmuta WebAudio en iOS (ver _desilenciarIOS)
  musicBase: 'assets/audio/',
  _rampVol(el, to, secs) {
    if (!el) return;
    if (el._rampTimer) clearInterval(el._rampTimer);
    const from = el.volume, steps = Math.max(1, Math.round(secs * 30));
    let i = 0;
    el._rampTimer = setInterval(() => {
      i++; const k = i / steps;
      try { el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch {}
      if (i >= steps) { clearInterval(el._rampTimer); el._rampTimer = null; if (to <= 0) { try { el.pause(); } catch {} } }
    }, 33);
  },
  _duckAmbient(to, secs) {
    if (!this.music) return;
    try {
      const g = this.music.out.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(to, t + secs);
    } catch {}
  },
  // WAV de ~0.5 s de silencio (16-bit mono 8 kHz) como URL de datos, sin fichero.
  _silenceURL() {
    if (this._silURL) return this._silURL;
    const sr = 8000, n = Math.floor(sr * 0.5);
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * 2, true); // datos = 0 → silencio
    return (this._silURL = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
  },
  // iOS enmudece el WebAudio con el interruptor físico de silencio (canal "timbre"),
  // pero NO los <audio> HTML (canal "media"). Un <audio> silencioso en bucle pone la
  // sesión en categoría "playback", y eso arrastra también al WebAudio al canal media:
  // así los SFX (disparo, golpes) suenan con el móvil en silencio, como la música.
  // (Truco estándar tipo howler/unmute; solo en dispositivos táctiles.) Debe llamarse
  // dentro de un gesto del usuario.
  _desilenciarIOS() {
    if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return; // solo táctil
    try {
      if (!this._iosTag) {
        const a = new Audio(this._silenceURL());
        a.loop = true; a.preload = 'auto'; a.setAttribute('playsinline', '');
        this._iosTag = a;
      }
      if (this._iosTag.paused) this._iosTag.play().catch(() => {});
    } catch {}
  },
  unlockMusic() { this._musicUnlocked = true; this._desilenciarIOS(); if (this._desiredId) this.playTrack(this._desiredId, this._desiredOpts || {}); },
  // Aplica en caliente el volumen de música (para el slider de Opciones). El SFX se
  // lee ya en vivo en cada disparo, así que no necesita setter.
  setMusicVol() { try { if (this._musMaster) this._musMaster.gain.value = 0.85 * GameState.opciones.vol_musica; } catch {} },
  // ---- Motor de música por WebAudio: BUCLE SIN COSTURA. Cada pista se decodifica a
  // un AudioBuffer y, si va en loop, se le hornea un crossfade cola→cabeza en el punto
  // que mejor casa (por correlación), de modo que el final funda con el principio; se
  // reproduce con source.loop=true (bucle exacto, sin el hueco que el MP3 mete al
  // reiniciar). Se recortan los silencios ANTES del crossfade, así el priming del MP3
  // no rompe la costura. Suena por el canal media en iOS gracias al tag silencioso.
  // Si WebAudio/decode falla, cae a <audio> loop (con costura, pero suena). ----
  _musMaster: null, _musSrc: null, _musGain: null, _musFallbackEl: null,
  _loopCache: {}, _loopOrder: [],
  // --- Reloj de beat: ancla ctx.currentTime (sample-accurate) al arranque de la pista
  // + su BPM medido (data/musica.json). SOLO latido visual/ambiental; jamás toca el
  // juicio de input de Cadencia (eso vive en cadencia.js con su propio reloj testeado).
  _musStartTime: 0, _musBpm: 0, _musBeatOffset: 0,
  // Devuelve {active, bpm, phase(0..1 dentro del beat), beat(índice), pulse(1→0 por beat)}.
  // Inactivo si no hay pista WebAudio sonando o la pista no tiene BPM medido.
  beatClock() {
    if (!this._musSrc || !this._musBpm || !this.ctx) return { active: false, bpm: 0, phase: 0, beat: 0, pulse: 0 };
    const pos = (this.ctx.currentTime - this._musStartTime) - this._musBeatOffset;
    const beats = pos * this._musBpm / 60;
    const b = Math.floor(beats), phase = beats - b;
    // pulso: brillo que decae desde el downbeat (curva rápida → sensación de golpe)
    const pulse = Math.max(0, 1 - phase * 3.2);
    return { active: true, bpm: this._musBpm, phase, beat: b, pulse };
  },
  // Instante ctx.currentTime del beat índice b (para programar audio EN el beat, sin
  // jitter de frame). Si no hay pista con BPM, devuelve el "ahora" (o 0 sin ctx).
  beatTime(b) {
    if (!this._musBpm) return this.ctx ? this.ctx.currentTime : 0;
    return this._musStartTime + this._musBeatOffset + b * (60 / this._musBpm);
  },
  // --- A5: música REACTIVA a la racha. Capa de campanas armónicas que sube con el
  // desempeño rítmico (grooveFrac) y se apaga sola al decaer. Cuelga de un sub-bus bajo
  // el bus de música (respeta el volumen y NO pisa la pista). El motor de música NO se
  // toca; esto solo AÑADE voces programadas en el beat (ver main: driver por borde). ---
  _reactMaster: null,
  // Ganancia de la capa según la fracción de racha (0..1). PURA y testeable: 0 bajo el
  // umbral, sube monótona hasta gain_max en racha plena (curva cuadrática = arranca suave).
  reactiveGain(gf, cfg) {
    const umbral = cfg?.umbral_frac ?? 0.25, gmax = cfg?.gain_max ?? 0.05;
    if (!(gf > umbral)) return 0;
    const k = (gf - umbral) / (1 - umbral);
    return gmax * k * k;
  },
  _reactNode() {
    this._ensure();
    if (!this._reactMaster) {
      this._reactMaster = this.ctx.createGain();
      this._reactMaster.gain.value = 0.8;
      this._reactMaster.connect(this._musNode()); // bajo el bus de música → hereda vol_musica
    }
    return this._reactMaster;
  },
  // Programa UNA campana reactiva en atTime (ctx time del beat). intensity = grooveFrac.
  // buffed (racha en buff) añade una octava. Silencio si intensity está bajo el umbral o
  // no hay ctx (se conduce solo cuando suena una pista con BPM, ver main).
  grooveBell(atTime, intensity, buffed, cfg) {
    try {
      if (!this.ctx) return;
      const g0 = this.reactiveGain(intensity, cfg);
      if (g0 <= 0.0002) return;
      const c = this.ctx, t = Math.max(c.currentTime, atTime || c.currentTime);
      const notas = (cfg?.notas && cfg.notas.length) ? cfg.notas : [220, 246.94, 293.66, 329.63, 392, 440];
      const freq = notas[Math.floor(t * 2) % notas.length]; // nota estable por beat (no aleatoria por-frame)
      const g = c.createGain();
      g.gain.setValueAtTime(g0, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.0);
      const parciales = [[1, 1], [2.76, 0.35], [5.4, 0.12]];
      if (buffed && (cfg?.buff_octava ?? true)) parciales.push([2, 0.4]); // octava al estar en racha plena
      for (const [m, w] of parciales) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq * m;
        const og = c.createGain(); og.gain.value = w;
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + 3.1);
      }
      g.connect(this._reactNode());
    } catch { /* audio no disponible */ }
  },
  _musNode() {
    this._ensure();
    if (!this._musMaster) {
      this._musMaster = this.ctx.createGain();
      this._musMaster.connect(this.ctx.destination);
    }
    this._musMaster.gain.value = 0.85 * GameState.opciones.vol_musica; // refresca volumen
    return this._musMaster;
  },
  _rampParam(param, to, secs) {
    try {
      const t = this.ctx.currentTime;
      param.cancelScheduledValues(t); param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(to, t + Math.max(0.02, secs));
    } catch {}
  },
  _stopMusicNow(fade) {
    if (this._musSrc && this._musGain) {
      const src = this._musSrc, g = this._musGain;
      this._rampParam(g.gain, 0, fade);
      try { src.stop(this.ctx.currentTime + fade + 0.06); } catch {}
      this._musSrc = null; this._musGain = null; this._musBpm = 0; // reloj de beat inactivo
    }
    if (this._musFallbackEl) { this._rampVol(this._musFallbackEl, 0, fade); this._musFallbackEl = null; }
  },
  // Pide una pista de fondo. Garantiza UNA sola sonando y hace crossfade desde la
  // anterior; baja el dron procedural mientras suena la pista real.
  playTrack(id, opts = {}) {
    const loop = opts.loop !== false, fade = opts.fade ?? 1.4;
    this._desiredId = id; this._desiredOpts = opts;
    if (!this._musicUnlocked) return; // se aplicará en unlockMusic()
    if (this._curId === id && (this._musSrc || this._musFallbackEl)) return; // ya suena la correcta
    this._ensure(); // crea/reanuda el AudioContext antes de decodificar
    this._stopMusicNow(fade);
    this._curId = id;
    this._getMusicBuffer(id, loop)
      .then(buf => {
        if (this._curId !== id || !buf) return; // la escena cambió mientras decodificaba
        const c = this.ctx;
        const src = c.createBufferSource(); src.buffer = buf; src.loop = loop;
        const g = c.createGain(); g.gain.value = 0;
        src.connect(g); g.connect(this._musNode());
        src.start();
        this._musSrc = src; this._musGain = g;
        // ancla el reloj de beat a este arranque (BPM medido por pista; 0 si no hay dato)
        const bd = DataDB.musicaBpm?.(id);
        this._musStartTime = c.currentTime; this._musBpm = bd ? bd.bpm : 0; this._musBeatOffset = bd ? (bd.offset_s || 0) : 0;
        this._duckAmbient(0, fade);         // aparta el dron SOLO cuando suena la pista real
        this._rampParam(g.gain, 1, fade);   // entra la pista
      })
      .catch(() => { if (this._curId === id) this._fallbackHtml(id, loop, fade); });
  },
  crossfadeTo(id, seg = 1.4) { this.playTrack(id, { fade: seg }); },
  stopMusic(fade = 1.0) {
    this._desiredId = null; this._curId = null;
    this._stopMusicNow(fade);
    this._duckAmbient(0.9 * GameState.opciones.vol_musica, fade); // vuelve el dron
  },
  // Reproductor de reserva si WebAudio/decode no está disponible (bucle con costura).
  _fallbackHtml(id, loop, fade) {
    try {
      let el = this._trackEls[id];
      if (!el) { el = new Audio(this.musicBase + id + '.mp3'); el.preload = 'auto'; this._trackEls[id] = el; }
      el.loop = loop; el.volume = 0; try { el.currentTime = 0; } catch {}
      el.play().then(() => { this._duckAmbient(0, fade); this._rampVol(el, 0.85 * GameState.opciones.vol_musica, fade); }).catch(() => {});
      this._musFallbackEl = el;
    } catch {}
  },
  // Devuelve (promesa) el AudioBuffer de la pista; si es loop, ya con crossfade sin
  // costura. Cachea hasta 3 buffers (LRU) para no re-decodificar al revisitar escena.
  _getMusicBuffer(id, loop) {
    if (this._loopCache[id]) {
      this._loopOrder = this._loopOrder.filter(k => k !== id); this._loopOrder.push(id);
      return Promise.resolve(this._loopCache[id]);
    }
    return fetch(this.musicBase + id + '.mp3')
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then(ab => new Promise((ok, no) => this.ctx.decodeAudioData(ab, ok, no)))
      .then(dec => {
        const buf = loop ? this._makeSeamlessLoop(dec) : dec;
        this._loopCache[id] = buf; this._loopOrder.push(id);
        while (this._loopOrder.length > 3) { const viejo = this._loopOrder.shift(); if (viejo !== id) delete this._loopCache[viejo]; }
        return buf;
      });
  },
  // Hornea un bucle sin costura: recorta silencios, busca el crossfade que mejor casa
  // (cabeza≈cola) y funde cola→cabeza a potencia constante. Con source.loop=true sobre
  // [0,dur], el final enlaza con el principio sin salto.
  _makeSeamlessLoop(buf) {
    try {
      const sr = buf.sampleRate, ch = buf.numberOfChannels, n = buf.length;
      const chans = [];
      for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
      // pico y recorte de silencios de los extremos (umbral: 2% del pico)
      let peak = 1e-6;
      for (let c = 0; c < ch; c++) { const d = chans[c]; for (let i = 0; i < n; i += 8) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
      const thr = peak * 0.02;
      const activo = (i) => { for (let c = 0; c < ch; c++) if (Math.abs(chans[c][i]) > thr) return true; return false; };
      let s0 = 0, s1 = n - 1;
      while (s0 < n - 1 && !activo(s0)) s0++;
      while (s1 > s0 && !activo(s1)) s1--;
      const N = s1 - s0 + 1;
      if (N < sr * 2) return buf; // demasiado corto para crossfadear
      // mono para el análisis de correlación cabeza/cola
      const mono = new Float32Array(N);
      for (let i = 0; i < N; i++) { let a = 0; for (let c = 0; c < ch; c++) a += chans[c][s0 + i]; mono[i] = a / ch; }
      // elige el crossfade (en s) que minimiza la diferencia cabeza vs cola
      let cands = [1.5, 2, 2.5, 3, 4, 5, 6].map(s => Math.floor(s * sr)).filter(x => x >= sr && x < N * 0.30);
      if (!cands.length) cands = [Math.floor(Math.min(N * 0.25, sr * 3))];
      let bestX = cands[0], bestCost = Infinity;
      for (const X of cands) {
        let num = 0, den = 1e-9;
        for (let i = 0; i < X; i += 32) { const h = mono[i], t = mono[N - X + i], d = h - t; num += d * d; den += h * h + t * t; }
        const cost = num / den;
        if (cost < bestCost) { bestCost = cost; bestX = X; }
      }
      const X = bestX, L = N - X;
      const out = this.ctx.createBuffer(ch, L, sr);
      for (let c = 0; c < ch; c++) {
        const src = chans[c], dst = out.getChannelData(c);
        for (let i = 0; i < X; i++) {                 // crossfade [0,X): cabeza + cola (potencia cte.)
          const t = i / X, fin = Math.sin(0.5 * Math.PI * t), fout = Math.cos(0.5 * Math.PI * t);
          dst[i] = src[s0 + i] * fin + src[s0 + L + i] * fout;
        }
        for (let i = X; i < L; i++) dst[i] = src[s0 + i]; // cuerpo [X,L): tal cual
      }
      return out;
    } catch { return buf; }
  },
  // One-shot (stingers/eventos): no interrumpe la música de fondo.
  sample(id, vol = 1) {
    try {
      const el = new Audio(this.musicBase + id + '.mp3');
      el.volume = Math.max(0, Math.min(1, vol * GameState.opciones.vol_sfx));
      el.play().catch(() => {});
    } catch {}
  },

  sfx(name, opts = {}) {
    if (this._playSample(name, opts.pitch ?? 1)) return; // SFX real (WAV) si está cargado; si no, beep
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
      // Toque de botón (feedback sutil de pulsación, muy corto y bajo)
      case 'ui_tap': this.beep(1240, 0.028, 'sine', 0.028, 120); break;
    }
  }
};
