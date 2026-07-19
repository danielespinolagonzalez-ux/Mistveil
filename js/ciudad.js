// CUERDAQUEDA — el hub (ver docs/ciudad.md). Reemplaza a pueblo.js: la villa es ahora
// data-driven (data/ciudad.json), en 3 terrazas, y MODULAR — cada distrito está "vivo"
// o en "ruina" según a quién hayas rescatado en la Torre. main.js mueve a Pip y pinta el
// diálogo; aquí viven los distritos (posición, desbloqueo, diálogos, dibujo ruina/viva).
import { DataDB } from './data_db.js';
import { GameState, RunState, SaveManager, AudioManager } from './state.js';

const t9 = k => DataDB.texto(k);

// La plaza (rect del mundo). Se lee de ciudad.json con fallback, para F5 en caliente.
export function plaza() {
  return DataDB.ciudad?.plaza ?? { x: 0, y: -600, w: 980, h: 232 };
}

// Estado de visita (se resetea al volver de cada run) — controla regalos de una sola vez.
export const visita = { margo: false, tablon: false, hermanos: false };
export function resetVisita() { visita.margo = visita.tablon = visita.hermanos = false; }

// Contratos del Gremio: retos de una run, pagados en engranajes y Memoria.
export const CONTRATOS = [
  { id: 'templanza', nombre: 'Templanza', desc: 'Baja del piso 1 perdiendo 2 corazones como mucho.' },
  { id: 'virtuoso', nombre: 'Virtuosismo', desc: 'Clava 6 golpes PERFECTOS de Cadencia en el piso 1.' },
  { id: 'intocable', nombre: 'Eco de bronce', desc: 'Logra 2 paradas (parry) en el piso 1.' }
];

// ---------- Desbloqueo: ¿está VIVO este distrito? (derivado, nunca guardado) ----------
export function barrioVivo(d) {
  const u = d.unlock ?? { tipo: 'inicio' };
  switch (u.tipo) {
    case 'inicio': return true;
    case 'rescate': return GameState.rescatados.includes(d.id);
    case 'nivel': return GameState.nivel >= (u.ref ?? 1);
    case 'flag': return !!GameState.flags?.[u.ref];
    case 'muerte': return (GameState.stats?.muertes ?? 0) > 0;
    case 'rescatados_min': return GameState.rescatados.length >= (u.ref ?? 1);
    default: return false;
  }
}

// ---------- Diálogos y efectos por servicio (migrados del viejo pueblo.js) ----------
// Cada servicio: lines() → array de {who, text}; onDone() → {accion?, aviso?} y aplica
// beneficios. Los distritos aún sin servicio real (F3) muestran un placeholder al vivir.
const SERVICIOS = {
  margo: {
    lines() {
      const l = [
        { who: 'MARGO', text: t9('dlg.margo.intro.1') },
        { who: 'MARGO', text: 'El pan no sabe a nada si no hay nadie que lo espere. Aun así, se hornea.' }
      ];
      if (!visita.margo) l.push({ who: 'MARGO', text: 'Toma. Pan de ayer. Abriga el pecho como un corazón de más.' });
      else l.push({ who: 'MARGO', text: 'Ya te di tu ración. Vuelve mañana... si los dos seguimos aquí.' });
      return l;
    },
    onDone() {
      if (!visita.margo) {
        visita.margo = true;
        if (!RunState.bendiciones.includes('pan')) RunState.bendiciones.push('pan');
        AudioManager.sfx('heart');
        return { aviso: ['Pan de ayer', '+1 corazón en el próximo descenso'] };
      }
      return {};
    }
  },
  mirador: {
    lines() {
      const primera = GameState.stats.muertes === 0;
      return primera ? [
        { who: 'VESPER', text: t9('dlg.vesper.intro.1') },
        { who: 'VESPER', text: t9('dlg.vesper.intro.2') },
        { who: 'VESPER', text: 'Ven. Te enseñaré a grabar recuerdos en el Péndulo.' }
      ] : [
        { who: 'PIP', text: '¿Y si mañana no... no me enciendo?' },
        { who: 'VESPER', text: 'Entonces hoy pesa el doble. Levanta la espada.' },
        { who: 'VESPER', text: 'El Péndulo espera. Gasta lo que recuerdas.' }
      ];
    },
    onDone() { return { accion: 'santuario' }; }
  },
  hermanos: {
    lines() {
      const m = GameState.stats.muertes;
      const l = [
        { who: 'Nº 7', text: 'Detenidos esta estación: cuarenta y dos. Y tus paradas, Pip: ' + m + '.' },
        { who: 'Nº 12', text: 'No los cuentes, hermano. Cuéntalos. Que no es lo mismo.' }
      ];
      if (!GameState.flags?.hermanos_memoria) l.push({ who: 'Nº 7', text: 'Nos ayudaste a no perder la cuenta. Toma. Un recuerdo que sobraba.' });
      return l;
    },
    onDone() {
      GameState.flags = GameState.flags ?? {};
      if (!GameState.flags.hermanos_memoria) {
        GameState.flags.hermanos_memoria = true;
        GameState.memoria += 5;
        SaveManager.save();
        AudioManager.sfx('equip');
        return { aviso: ['◆ +5 Memoria', 'Un recuerdo que sobraba'] };
      }
      return {};
    }
  },
  tablon: {
    lines() {
      GameState.flags = GameState.flags ?? {};
      const idx = (GameState.flags.ate_idx ?? 0) % 3;
      const ATE = [
        [{ who: '◆ Mientras tanto...', text: '"Pan de ayer" — De madrugada, Margo hornea. Nadie espera el pan. Lo hornea igual.' },
         { who: 'MARGO', text: 'Una hogaza más. Por si acaso. Siempre por si acaso.' }],
        [{ who: '◆ Mientras tanto...', text: '"La cuenta" — Nº7 talla una muesca. Nº12 la lija hasta borrarla.' },
         { who: 'Nº 12', text: 'Recordar no es lo mismo que llevar la cuenta, hermano.' }],
        [{ who: '◆ Mientras tanto...', text: '"El ensayo" — Vesper practica a solas una Addition que ya no puede completar.' },
         { who: 'VESPER', text: '...tres, y cuatro. Antes llegaba a siete. Antes.' }]
      ];
      if (visita.tablon) return [{ who: 'TABLÓN', text: 'No hay más avisos hoy. La cera de los carteles aún está tierna.' }];
      return ATE[idx];
    },
    onDone() {
      if (visita.tablon) return {};
      visita.tablon = true;
      GameState.flags.ate_idx = ((GameState.flags.ate_idx ?? 0) + 1) % 3;
      GameState.memoria += DataDB.balance.meta.memoria_por_descubrimiento;
      SaveManager.save();
      AudioManager.sfx('tome');
      return { aviso: ['◆ +' + DataDB.balance.meta.memoria_por_descubrimiento + ' Memoria', 'Mirar también es vivir'] };
    }
  },
  redoble: {
    lines() {
      const r = GameState.ligaRango ?? 0;
      const rivales = ['"La Mecha"', '"Doce Agujas"', '"El Coro de Sebo"', '"Polvo y Péndulo"', '"Las Gemelas"'];
      return [
        { who: 'EL REDOBLE', text: 'Una campana de duelos, colgada de un péndulo detenido. Zumba bajo tu mano.' },
        r >= 5
          ? { who: 'EL REDOBLE', text: GameState.flags?.campeonBatido ? 'Ya eres CAMPEÓN. Tu eco sigue dispuesto a ensayar.' : 'Liga completada. Solo queda EL CAMPEÓN: un eco con tu propia silueta.' }
          : { who: 'EL REDOBLE', text: 'Liga del Redoble — rango ' + (r + 1) + ' de 5. Te espera ' + rivales[r] + '. Cada rango paga un engranaje.' },
        { who: '', text: '¿Entrar al Reloj de Batalla? (por turnos)' }
      ];
    },
    onDone() { return { accion: 'batalla', encuentro: 'liga' }; }
  },
  gremio: {
    lines() {
      if (RunState.contrato) {
        return [
          { who: 'TABLÓN DEL GREMIO', text: 'Tu contrato sigue clavado con un alfiler de latón:' },
          { who: '', text: RunState.contrato.nombre + ' — ' + RunState.contrato.desc }
        ];
      }
      this._hoy = CONTRATOS[(GameState.stats.muertes + GameState.nivel) % CONTRATOS.length];
      return [
        { who: 'TABLÓN DEL GREMIO', text: 'Papel amarillento, tinta fresca. Un contrato para el próximo descenso:' },
        { who: '', text: this._hoy.nombre + ' — ' + this._hoy.desc },
        { who: '', text: 'Paga: 1 engranaje y 15 ◆ de Memoria. Se firma al tocarlo.' }
      ];
    },
    onDone() {
      if (!RunState.contrato && this._hoy) {
        RunState.contrato = { ...this._hoy };
        AudioManager.sfx('equip');
      }
      return {};
    }
  },
  puerta: {
    lines() {
      return [
        { who: 'PIP', text: 'Si voy a d-detenerme... quiero detenerme habiendo servido de algo.' },
        { who: '', text: '¿Descender al Reloj de las Almas?' }
      ];
    },
    onDone() { return { accion: 'run' }; }
  },
  // --- Distritos rescatables sin servicio real todavía (se cablean en F3). Al vivir,
  //     agradecen el rescate y adelantan su oficio futuro. ---
  fragua: {
    lines() { return [
      { who: 'YELMO', text: 'La fragua aún se caldea. El fuelle recuerda cómo respirar.' },
      { who: 'YELMO', text: 'Pronto reavivaré aquí tus sellos, autómata. Un sello frío no es más que una piedra con nostalgia.' }
    ]; },
    onDone() { return {}; }
  },
  botica: {
    lines() { return [
      { who: 'NÉBULA', text: 'Huele a mirra y a cera nueva. Ya casi soy yo otra vez.' },
      { who: 'NÉBULA', text: 'Cuando encienda del todo la Botica, te fundiré velas que son medio hechizo para el descenso.' }
    ]; },
    onDone() { return {}; }
  },
  conservatorio: {
    lines() { return [
      { who: 'SOSTENIDO', text: 'Un dedo de menos y aun así marco mejor el compás que nadie. Ja.' },
      { who: 'SOSTENIDO', text: 'Vuelve cuando el Conservatorio esté afinado: te enseñaré a subir tus compases.' }
    ]; },
    onDone() { return {}; }
  },
  atalaya: {
    lines() { return [
      { who: 'ALONDRA', text: 'Desde aquí veo la niebla moverse. Casi entiendo lo que oculta.' },
      { who: 'ALONDRA', text: 'Cuando la Atalaya alumbre, te prestaré mis ojos: sabrás qué te espera antes de bajar.' }
    ]; },
    onDone() { return {}; }
  }
};

// ---------- Distritos (defs de ciudad.json + posición mundo + servicio enlazado) ----------
// Se recomputa por si se recarga ciudad.json con F5. Cada distrito lleva x/y del mundo,
// su servicio (lines/onDone) y si está vivo AHORA.
export function distritos() {
  const P = plaza();
  const defs = DataDB.ciudad?.distritos ?? [];
  return defs.map(def => {
    const s = SERVICIOS[def.servicio] ?? { lines: () => [{ who: def.vecino, text: '...' }], onDone: () => ({}) };
    return {
      ...def,
      x: P.x + def.dx, y: P.y + def.dy,
      nombre: def.nombre, vecino: def.vecino,
      retrato: def.retrato ?? def.servicio, // clave del retrato pintado (fallback: sin busto)
      lines: s.lines.bind(s), onDone: s.onDone.bind(s),
      vivo: barrioVivo(def)
    };
  });
}

// ---------- Dibujo (100% código, estilo coherente con el resto de la villa) ----------
function _rgba(hex, a) {
  const n = parseInt((hex || '#ffce6a').slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function _glow(g, x, y, r, hex, a) {
  const gl = g.createRadialGradient(x, y, 0, x, y, r);
  gl.addColorStop(0, _rgba(hex, a)); gl.addColorStop(1, _rgba(hex, 0));
  g.fillStyle = gl; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
}

// Emblema propio de cada distrito, centrado en (cx,cy). `apagado` lo pinta en silueta fría.
function drawEmblema(g, forma, cx, cy, col, apagado = false) {
  g.save(); g.translate(cx, cy);
  if (apagado) col = '#5a5470';
  switch (forma) {
    case 'pan':
      g.fillStyle = apagado ? '#4a4260' : '#e2a35a'; g.beginPath(); g.ellipse(0, 1, 7, 4.5, 0, 0, 7); g.fill();
      g.fillStyle = apagado ? '#3a3350' : '#c98a44'; g.beginPath(); g.ellipse(0, 2.5, 7, 2, 0, 0, 7); g.fill();
      g.strokeStyle = apagado ? '#2b2540' : '#7a5028'; g.lineWidth = 0.8;
      for (const dx of [-3, 0, 3]) { g.beginPath(); g.moveTo(dx - 1.5, -1.5); g.lineTo(dx + 1.5, 2); g.stroke(); }
      break;
    case 'vesper': {
      g.strokeStyle = '#8d82ad'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -7); g.lineTo(0, 3); g.stroke();
      g.fillStyle = col; g.beginPath(); g.moveTo(0, 1); g.lineTo(3.5, 5); g.lineTo(0, 9); g.lineTo(-3.5, 5); g.closePath(); g.fill();
      g.fillStyle = apagado ? '#6a6288' : '#efe6ff'; g.beginPath(); g.moveTo(0, 2.5); g.lineTo(1.5, 5); g.lineTo(0, 7.5); g.closePath(); g.fill();
      break;
    }
    case 'hermanos':
      g.strokeStyle = '#8a7248'; g.lineWidth = 1.2; g.strokeRect(-6, -5, 12, 11);
      g.strokeStyle = '#5d4a33'; g.lineWidth = 0.7;
      for (const yy of [-1.5, 2]) { g.beginPath(); g.moveTo(-6, yy); g.lineTo(6, yy); g.stroke(); }
      g.fillStyle = col; for (const [bx, by] of [[-3, -1.5], [1, -1.5], [3, -1.5], [-2, 2], [2, 2]]) { g.beginPath(); g.arc(bx, by, 1.2, 0, 7); g.fill(); }
      break;
    case 'tablon':
      g.fillStyle = apagado ? '#4a4460' : '#efe6cf'; g.fillRect(-5, -6, 10, 13);
      g.strokeStyle = '#8d82ad'; g.lineWidth = 0.7;
      for (const yy of [-3, -1, 1, 3]) { g.beginPath(); g.moveTo(-3.5, yy); g.lineTo(3.5, yy); g.stroke(); }
      g.fillStyle = _rgba(col, 0.9); g.beginPath(); g.arc(3, -5, 1.4, 0, 7); g.fill();
      break;
    case 'gremio':
      g.fillStyle = apagado ? '#4a4460' : '#e6d3a6'; g.fillRect(-5, -6, 10, 13);
      g.strokeStyle = '#9a7a44'; g.lineWidth = 0.7; g.strokeRect(-5, -6, 10, 13);
      g.fillStyle = apagado ? '#5a3a40' : '#b0402f'; g.beginPath(); g.arc(0, 3.5, 2.6, 0, 7); g.fill();
      g.fillStyle = apagado ? '#6a4a50' : '#d85a45'; g.beginPath(); g.arc(-0.6, 2.8, 1, 0, 7); g.fill();
      break;
    case 'redoble': {
      g.fillStyle = col; g.beginPath(); g.moveTo(-6, 5); g.quadraticCurveTo(-5, -6, 0, -7); g.quadraticCurveTo(5, -6, 6, 5); g.closePath(); g.fill();
      g.fillStyle = apagado ? '#3a3450' : '#8a6a24'; g.beginPath(); g.ellipse(0, 5, 6, 1.6, 0, 0, 7); g.fill();
      g.fillStyle = '#3a2e12'; g.beginPath(); g.arc(0, 6, 1.2, 0, 7); g.fill();
      if (!apagado) { g.fillStyle = _rgba('#fff2c0', 0.5); g.beginPath(); g.ellipse(-2, -1, 1.3, 3, -0.3, 0, 7); g.fill(); }
      break;
    }
    case 'fragua': { // yunque con chispa
      g.fillStyle = col; g.beginPath();
      g.moveTo(-6, 2); g.lineTo(6, 2); g.lineTo(6, 4); g.lineTo(2, 4); g.lineTo(2, 7); g.lineTo(-2, 7); g.lineTo(-2, 4); g.lineTo(-6, 4); g.closePath(); g.fill();
      g.fillStyle = apagado ? '#3a3450' : '#3a2e12'; g.fillRect(-3, 7, 6, 2);
      if (!apagado) { g.fillStyle = '#fff2c0'; g.beginPath(); g.arc(4, 0, 1, 0, 7); g.fill(); g.beginPath(); g.arc(2, -2, 0.7, 0, 7); g.fill(); }
      break;
    }
    case 'botica': { // vela con llama
      g.fillStyle = apagado ? '#4a4460' : '#efe6cf'; g.fillRect(-2, -2, 4, 10);
      g.strokeStyle = '#8a7248'; g.lineWidth = 0.6; g.strokeRect(-2, -2, 4, 10);
      if (!apagado) { g.fillStyle = col; g.beginPath(); g.moveTo(0, -8); g.quadraticCurveTo(2.4, -4.5, 0, -2.5); g.quadraticCurveTo(-2.4, -4.5, 0, -8); g.closePath(); g.fill();
        g.fillStyle = '#fff2c0'; g.beginPath(); g.ellipse(0, -4, 0.9, 1.8, 0, 0, 7); g.fill(); }
      break;
    }
    case 'conservatorio': { // lira/campana con nota
      g.strokeStyle = col; g.lineWidth = 1.3; g.beginPath(); g.arc(0, 1, 5, Math.PI * 0.15, Math.PI * 0.85, false); g.stroke();
      g.beginPath(); g.moveTo(-4.4, 3); g.lineTo(-4.4, -4); g.stroke(); g.beginPath(); g.moveTo(4.4, 3); g.lineTo(4.4, -4); g.stroke();
      g.fillStyle = apagado ? '#5a5470' : '#f0d67a'; g.beginPath(); g.arc(1.5, 4.5, 1.5, 0, 7); g.fill();
      g.strokeStyle = apagado ? '#5a5470' : '#f0d67a'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(3, 4.5); g.lineTo(3, -1); g.stroke();
      break;
    }
    case 'atalaya': { // catalejo
      g.save(); g.rotate(-0.5);
      g.fillStyle = col; g.fillRect(-6, -2, 9, 4);
      g.fillStyle = apagado ? '#3a3450' : '#3a2e18'; g.fillRect(3, -2.6, 3, 5.2);
      if (!apagado) { g.fillStyle = '#cfe0ff'; g.fillRect(4, -1.6, 1.4, 3.2); }
      g.restore();
      break;
    }
    case 'puerta': {
      g.fillStyle = apagado ? '#4a4460' : '#efe6cf'; g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fill();
      g.strokeStyle = '#5a4a2a'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, 7, 0, 7); g.stroke();
      g.strokeStyle = '#3a2e18'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -4); g.stroke();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(3.5, 1.5); g.stroke();
      break;
    }
  }
  g.restore();
}

// Dibuja un distrito. Si `vivo`, la estación encendida (farol + emblema con resplandor);
// si no, la RUINA: poste apagado con tablas cruzadas y el emblema en silueta fría.
export function drawDistrito(g, d, SX, SY, t, near = false) {
  const x = SX(d.x), y = SY(d.y);
  const col = d.acento ?? '#ffce6a';
  const vivo = d.vivo;
  const foco = near ? 1 : 0;
  const pulso = 0.5 + Math.sin(t * 2.4 + d.x * 0.1) * 0.5;

  // Sombra de contacto sobre el adoquín
  g.fillStyle = 'rgba(0,0,0,0.30)';
  g.beginPath(); g.ellipse(x, y + 3, 13, 4, 0, 0, 7); g.fill();

  // La Puerta del Reloj: umbral monumental del descenso (siempre viva).
  if (d.emblema === 'puerta') {
    _glow(g, x, y - 30, 46 + foco * 12, col, 0.12 + foco * 0.14 + pulso * 0.03);
    g.fillStyle = '#2a2440';
    g.beginPath();
    g.moveTo(x - 26, y); g.lineTo(x - 26, y - 44);
    g.quadraticCurveTo(x, y - 74, x + 26, y - 44); g.lineTo(x + 26, y);
    g.lineTo(x + 18, y); g.lineTo(x + 18, y - 42);
    g.quadraticCurveTo(x, y - 62, x - 18, y - 42); g.lineTo(x - 18, y); g.closePath(); g.fill();
    const pg = g.createLinearGradient(x, y, x, y - 58);
    pg.addColorStop(0, _rgba(col, 0.05)); pg.addColorStop(1, _rgba(col, 0.28 + foco * 0.18));
    g.fillStyle = pg;
    g.beginPath();
    g.moveTo(x - 18, y); g.lineTo(x - 18, y - 42);
    g.quadraticCurveTo(x, y - 62, x + 18, y - 42); g.lineTo(x + 18, y); g.closePath(); g.fill();
    g.save(); g.translate(x, y - 50); g.scale(1.5, 1.5); drawEmblema(g, 'puerta', 0, 0, col); g.restore();
    for (let i = 0; i < 4; i++) {
      const st = (t * 0.4 + i * 0.25) % 1;
      g.fillStyle = _rgba('#efe6ff', (1 - st) * (0.3 + foco * 0.3));
      g.beginPath(); g.arc(x + Math.sin(t + i * 2) * 10, y - 6 - st * 40, 1.4, 0, 7); g.fill();
    }
    return;
  }

  if (!vivo) {
    // RUINA: poste frío con tablas cruzadas; el emblema apenas se intuye.
    g.strokeStyle = '#241f30'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(x - 9, y + 1); g.lineTo(x - 9, y - 34); g.lineTo(x + 3, y - 34); g.stroke();
    // panel entablado
    const px = x + 3, py = y - 30;
    g.fillStyle = '#191527';
    g.beginPath(); g.roundRect ? g.roundRect(px - 12, py - 8, 24, 24, 4) : g.rect(px - 12, py - 8, 24, 24); g.fill();
    g.strokeStyle = '#332c44'; g.lineWidth = 1;
    g.beginPath(); g.roundRect ? g.roundRect(px - 12, py - 8, 24, 24, 4) : g.rect(px - 12, py - 8, 24, 24); g.stroke();
    // tablas cruzadas
    g.strokeStyle = '#4a3f5e'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(px - 12, py - 6); g.lineTo(px + 12, py + 14); g.stroke();
    g.beginPath(); g.moveTo(px + 12, py - 6); g.lineTo(px - 12, py + 14); g.stroke();
    drawEmblema(g, d.emblema, px, py + 4, col, true);
    // farol frío
    g.fillStyle = 'rgba(90,84,112,0.5)';
    g.beginPath(); g.arc(x + 3, y - 34, 2, 0, 7); g.fill();
    return;
  }

  // VIVO: farol de hierro colgando un emblema (mismo lenguaje para todos).
  const sway = Math.sin(t * 1.5 + d.x * 0.13) * 0.9;
  _glow(g, x + 6, y - 24, 26 + foco * 8, col, 0.10 + foco * 0.16 + pulso * 0.03);
  g.strokeStyle = '#2b2536'; g.lineWidth = 2.4;
  g.beginPath(); g.moveTo(x - 9, y + 1); g.lineTo(x - 9, y - 34); g.lineTo(x + 3, y - 34); g.stroke();
  g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 12, y + 1); g.lineTo(x - 6, y + 1); g.stroke();
  const px = x + 3 + sway, py = y - 30;
  g.strokeStyle = '#3a3350'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 3, y - 34); g.lineTo(px, py - 8); g.stroke();
  g.fillStyle = '#241f36';
  g.beginPath(); g.roundRect ? g.roundRect(px - 12, py - 8, 24, 24, 4) : g.rect(px - 12, py - 8, 24, 24); g.fill();
  g.strokeStyle = _rgba(col, 0.8); g.lineWidth = 1.4;
  g.beginPath(); g.roundRect ? g.roundRect(px - 12, py - 8, 24, 24, 4) : g.rect(px - 12, py - 8, 24, 24); g.stroke();
  const pg = g.createRadialGradient(px, py + 4, 1, px, py + 4, 16);
  pg.addColorStop(0, _rgba(col, 0.30 + foco * 0.2)); pg.addColorStop(1, _rgba(col, 0));
  g.fillStyle = pg; g.fillRect(px - 12, py - 8, 24, 24);
  drawEmblema(g, d.emblema, px, py + 4, col);
  g.fillStyle = _rgba('#ffce7a', 0.9 * (0.7 + pulso * 0.3));
  g.beginPath(); g.arc(x + 3, y - 34, 2.2, 0, 7); g.fill();
}

function px2(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

// CORO, el ave de fuego: revolotea sobre la villa (ambiental)
export function drawCoro(g, SX, SY, t) {
  const P = plaza();
  const bx = P.x + 150 + Math.sin(t * 0.7) * 40;
  const by = P.y + 60 + Math.sin(t * 1.3) * 8;
  const x = SX(bx), y = SY(by, 26 + Math.sin(t * 5) * 3);
  const flap = Math.sin(t * 12) * 3;
  g.fillStyle = '#ff9c3a';
  g.beginPath(); g.ellipse(x, y, 4, 3, 0, 0, 7); g.fill();
  px2(g, x - 6, y - 1 + flap, 4, 2, '#ffb547');
  px2(g, x + 2, y - 1 - flap, 4, 2, '#ffb547');
  px2(g, x + 3, y - 1, 2, 1.5, '#ffe28a');
  px2(g, x - 1, y - 2, 1.5, 1.5, '#3a3226');
}

// ---------- Backdrop de la villa (fallback por código; el arte pintado va encima si existe) ----------
export function drawPuebloBackdrop(g, SX, SY, t, VW, VH) {
  const P = plaza();
  const houses = [
    { x: P.x - 10, w: 90, h: 74 }, { x: P.x + 120, w: 70, h: 58 },
    { x: P.x + 240, w: 84, h: 80 }, { x: P.x + 380, w: 66, h: 62 },
    { x: P.x + 500, w: 88, h: 70 }, { x: P.x + 640, w: 74, h: 64 },
    { x: P.x + 760, w: 82, h: 72 }
  ];
  const horizon = SY(P.y) - 6;
  for (const h of houses) {
    const hx = SX(h.x);
    g.fillStyle = '#241f3d';
    g.fillRect(hx, horizon - h.h, h.w, h.h);
    g.fillStyle = '#1b1730';
    g.beginPath();
    g.moveTo(hx - 4, horizon - h.h);
    g.lineTo(hx + h.w / 2, horizon - h.h - 22);
    g.lineTo(hx + h.w + 4, horizon - h.h);
    g.closePath(); g.fill();
    for (let i = 0; i < Math.floor(h.w / 26); i++) {
      const wx = hx + 10 + i * 26, wy = horizon - h.h + 14 + (i % 2) * 20;
      const on = Math.sin(t * 0.4 + h.x + i * 7) > -0.6;
      g.fillStyle = on ? 'rgba(255,190,90,0.85)' : 'rgba(60,52,90,0.6)';
      g.fillRect(wx, wy, 7, 9);
      if (on) {
        const gl = g.createRadialGradient(wx + 3, wy + 4, 0, wx + 3, wy + 4, 16);
        gl.addColorStop(0, 'rgba(255,190,90,0.16)');
        gl.addColorStop(1, 'rgba(255,190,90,0)');
        g.fillStyle = gl;
        g.beginPath(); g.arc(wx + 3, wy + 4, 16, 0, 7); g.fill();
      }
    }
  }
  // Catedral + Puerta del Reloj (derecha)
  const gx = SX(P.x + P.w - 34);
  g.fillStyle = '#1d1930';
  g.fillRect(gx - 42, horizon - 130, 84, 130);
  g.fillStyle = '#141126';
  g.beginPath();
  g.moveTo(gx - 46, horizon - 130); g.lineTo(gx, horizon - 168); g.lineTo(gx + 46, horizon - 130);
  g.closePath(); g.fill();
  g.fillStyle = '#e8dfc8';
  g.beginPath(); g.arc(gx, horizon - 108, 17, 0, 7); g.fill();
  g.strokeStyle = '#3a3226'; g.lineWidth = 2;
  g.beginPath(); g.arc(gx, horizon - 108, 17, 0, 7); g.stroke();
  const ha = t * 0.05, ma = t * 0.6;
  g.beginPath(); g.moveTo(gx, horizon - 108); g.lineTo(gx + Math.cos(ha) * 8, horizon - 108 + Math.sin(ha) * 8); g.stroke();
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(gx, horizon - 108); g.lineTo(gx + Math.cos(ma) * 12, horizon - 108 + Math.sin(ma) * 12); g.stroke();
  g.fillStyle = '#0e0b1c';
  g.beginPath();
  g.moveTo(gx - 20, horizon); g.lineTo(gx - 20, horizon - 44);
  g.quadraticCurveTo(gx, horizon - 62, gx + 20, horizon - 44); g.lineTo(gx + 20, horizon);
  g.closePath(); g.fill();
  // horno de Margo (izquierda)
  const mx = SX(P.x + 66);
  g.fillStyle = '#3a3040';
  g.fillRect(mx - 14, horizon - 34, 28, 34);
  g.fillStyle = '#241f30';
  g.beginPath(); g.arc(mx, horizon - 12, 9, Math.PI, 0); g.fill();
  g.fillRect(mx - 9, horizon - 12, 18, 12);
  const fire = 0.5 + Math.sin(t * 9) * 0.15 + Math.sin(t * 23) * 0.08;
  g.fillStyle = `rgba(255,140,50,${fire})`;
  g.beginPath(); g.arc(mx, horizon - 8, 6, Math.PI, 0); g.fill();
  g.fillRect(mx - 6, horizon - 8, 12, 7);
  const gl = g.createRadialGradient(mx, horizon - 8, 0, mx, horizon - 8, 46);
  gl.addColorStop(0, 'rgba(255,150,60,0.22)');
  gl.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = gl;
  g.beginPath(); g.arc(mx, horizon - 8, 46, 0, 7); g.fill();
  g.fillStyle = '#3a3040'; g.fillRect(mx + 6, horizon - 48, 7, 16);
  for (let i = 0; i < 3; i++) {
    const st = (t * 0.5 + i * 0.33) % 1;
    g.fillStyle = `rgba(160,150,180,${0.25 * (1 - st)})`;
    g.beginPath(); g.arc(mx + 9 + Math.sin(t + i * 2) * 4 * st, horizon - 50 - st * 26, 2 + st * 4, 0, 7); g.fill();
  }
}

// Suelo adoquinado de la plaza
export function drawPlazaGround(g, SX, SY, KY) {
  const P = plaza();
  const x0 = SX(P.x - 20), x1 = SX(P.x + P.w + 20);
  const y0 = SY(P.y), y1 = SY(P.y + P.h) + 14;
  g.fillStyle = '#332c4a';
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 38; c++) {
      const ax = x0 + c * 28 + (r % 2) * 14, ay = y0 + r * (24 * KY);
      const v = ((r * 13 + c * 7) % 8);
      g.fillStyle = `rgb(${56 + v},${50 + v},${82 + v})`;
      g.fillRect(ax + 1, ay + 1, 26, 24 * KY - 2);
    }
  }
}

// ============ F2 · Profundidad y vida en las calles ============

// Capa LEJANA con parallax: la silueta del Reloj colosal DETENIDO y terrazas en la bruma.
// Se desplaza más despacio que la calle (par<1) → da profundidad sin arte pintado.
export function drawCieloLejano(g, camX, SY, t) {
  const P = plaza();
  const horizon = SY(P.y) - 6;
  const par = 0.4;
  const cx = (P.x + P.w * 0.5) - camX * par; // centro del Reloj, en coords del mundo escalado
  // Terrazas lejanas escalonadas (bajan hasta el horizonte, nunca por debajo)
  g.fillStyle = 'rgba(32,28,56,0.75)';
  for (let i = -3; i <= 4; i++) {
    const bx = cx + i * 190, h = 46 + (i % 2 ? 0 : 18);
    g.fillRect(bx - 64, horizon - h, 128, h);
  }
  // El Reloj colosal (torre central) — cabe en la banda de cielo sobre el horizonte
  g.fillStyle = '#22213e';
  g.fillRect(cx - 46, horizon - 96, 92, 96);
  g.beginPath(); g.moveTo(cx - 52, horizon - 96); g.lineTo(cx, horizon - 128); g.lineTo(cx + 52, horizon - 96); g.closePath(); g.fill();
  // Esfera pálida DETENIDA (el tiempo se paró) con manecillas quietas
  g.fillStyle = 'rgba(184,172,144,0.5)';
  g.beginPath(); g.arc(cx, horizon - 62, 17, 0, 7); g.fill();
  g.strokeStyle = 'rgba(38,32,58,0.85)'; g.lineWidth = 3;
  g.beginPath(); g.arc(cx, horizon - 62, 17, 0, 7); g.stroke();
  g.lineWidth = 2.4; g.beginPath(); g.moveTo(cx, horizon - 62); g.lineTo(cx, horizon - 74); g.stroke();
  g.lineWidth = 1.8; g.beginPath(); g.moveTo(cx, horizon - 62); g.lineTo(cx + 9, horizon - 57); g.stroke();
  // Bruma dorada baja del atardecer
  const gg = g.createLinearGradient(0, horizon - 34, 0, horizon + 6);
  gg.addColorStop(0, 'rgba(120,90,110,0)'); gg.addColorStop(1, 'rgba(126,96,116,0.28)');
  g.fillStyle = gg; g.fillRect(-200, horizon - 34, 4000, 40);
}

// Motas de polvo dorado que flotan sobre la plaza (ambiente cálido, baratísimo).
export function drawMotas(g, camX, VW, VH, t) {
  for (let i = 0; i < 22; i++) {
    const sx = ((i * 137.5 - camX * 0.6) % (VW + 40) + VW + 40) % (VW + 40) - 20;
    const sy = (VH * 0.28) + Math.sin(t * 0.5 + i) * 30 + (i % 5) * 34;
    const a = 0.10 + 0.10 * Math.sin(t * 1.3 + i * 2);
    g.fillStyle = `rgba(255,224,168,${a})`;
    g.fillRect(sx, sy, 1.5, 1.5);
  }
}

// ---- Fuente-oclusor de primer plano: Pip pasa POR DETRÁS (y-sort en main.js) ----
export function propsCiudad() {
  const P = plaza();
  return [{ kind: 'fuente', x: P.x + 496, y: P.y + 176 }];
}
export function drawProp(g, prop, SX, SY, t) {
  if (prop.kind !== 'fuente') return;
  const x = SX(prop.x), y = SY(prop.y);
  // sombra
  g.fillStyle = 'rgba(0,0,0,0.30)'; g.beginPath(); g.ellipse(x, y + 6, 28, 8, 0, 0, 7); g.fill();
  // pilón de piedra
  g.fillStyle = '#2b2540'; g.beginPath(); g.ellipse(x, y, 28, 11, 0, 0, 7); g.fill();
  g.fillStyle = '#3a3352'; g.beginPath(); g.ellipse(x, y - 3, 26, 9, 0, 0, 7); g.fill();
  g.fillStyle = '#211c34'; g.beginPath(); g.ellipse(x, y - 4, 20, 6, 0, 0, 7); g.fill();
  // columna central con engranajes (fuente de RELOJERÍA, sin agua: gira despacio)
  g.fillStyle = '#3a3352'; g.fillRect(x - 5, y - 30, 10, 26);
  for (const [gy, r] of [[y - 30, 8], [y - 20, 6]]) {
    g.save(); g.translate(x, gy); g.rotate(t * (r === 8 ? 0.5 : -0.7));
    g.fillStyle = '#c9a24a';
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.fillRect(Math.cos(a) * r - 1.4, Math.sin(a) * r - 1.4, 2.8, 2.8); }
    g.beginPath(); g.arc(0, 0, r * 0.6, 0, 7); g.fill();
    g.fillStyle = '#6b5a2c'; g.beginPath(); g.arc(0, 0, r * 0.28, 0, 7); g.fill();
    g.restore();
  }
  // brillo cálido en el borde
  g.strokeStyle = 'rgba(255,206,122,0.35)'; g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(x, y - 4, 20, 6, 0, Math.PI, Math.PI * 2); g.stroke();
}

// ---- Vecinos: pasean por los distritos VIVOS (vida). Se repueblan al entrar al hub. ----
let _vecinos = null;
function _nuevoVecino(x, y, col, speed, nino = false) {
  return { x, homeX: x, y, col, speed: speed * 14, dir: Math.random() < 0.5 ? -1 : 1, rango: 34 + Math.random() * 46, t: Math.random() * 6, nino, pausa: Math.random() * 1.5 };
}
export function poblarVecinos() {
  const P = plaza();
  const T = DataDB.ciudad?.terrazas ?? { baja: 196, media: 132, alta: 74 };
  const v = [];
  // Un vecino junto a cada distrito VIVO (menos la Puerta), del color de su acento.
  for (const d of distritos()) {
    if (!d.vivo || d.emblema === 'puerta') continue;
    v.push(_nuevoVecino(d.x + 20, d.y + 6, d.acento, 0.6 + (d.id.charCodeAt(0) % 5) * 0.06));
  }
  // Paseantes genéricos por la terraza media (más cuantos más rescatados → la villa bulle).
  const nStroll = Math.min(4, 1 + (GameState.rescatados?.length ?? 0));
  const grises = ['#cfc6e8', '#b0a6c8', '#d8cfa0', '#a8b0d0'];
  for (let i = 0; i < nStroll; i++) v.push(_nuevoVecino(P.x + 240 + i * 150, P.y + T.media + 26, grises[i % grises.length], 0.55));
  // Niños + Tuerca cuando la villa se anima (≥3 rescatados): corretean por la plaza baja.
  if ((GameState.rescatados?.length ?? 0) >= 3) {
    for (let i = 0; i < 2; i++) v.push(_nuevoVecino(P.x + 320 + i * 70, P.y + T.baja + 4, '#ffd9a0', 1.5, true));
  }
  _vecinos = v;
}
export function updateVecinos(dt) {
  if (!_vecinos) return;
  for (const v of _vecinos) {
    v.t += dt;
    if (v.pausa > 0) { v.pausa -= dt; continue; }
    v.x += v.dir * v.speed * dt;
    if (v.x < v.homeX - v.rango) { v.x = v.homeX - v.rango; v.dir = 1; v.pausa = 0.5 + Math.random() * 1.2; }
    else if (v.x > v.homeX + v.rango) { v.x = v.homeX + v.rango; v.dir = -1; v.pausa = 0.5 + Math.random() * 1.2; }
  }
}
export function vecinos() { return _vecinos ?? []; }
export function drawVecino(g, v, SX, SY, t) {
  const x = SX(v.x), y = SY(v.y);
  const s = v.nino ? 0.72 : 1;
  const andando = v.pausa <= 0;
  const bob = andando ? Math.abs(Math.sin(v.t * 6)) * 2 : 0;
  const lean = andando ? v.dir * 0.6 : 0;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x, y + 2, 6 * s, 2.4 * s, 0, 0, 7); g.fill();
  // cuerpo (capa) con leve inclinación hacia donde camina
  g.save(); g.translate(x, y - bob); g.rotate(lean * 0.04);
  g.fillStyle = v.col;
  g.beginPath(); g.moveTo(-5 * s, 0); g.quadraticCurveTo(-6 * s, -12 * s, 0, -15 * s); g.quadraticCurveTo(6 * s, -12 * s, 5 * s, 0); g.closePath(); g.fill();
  g.fillStyle = '#2a2740'; g.beginPath(); g.arc(0, -13 * s, 3.1 * s, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,220,150,0.16)'; g.fillRect(-4 * s, -10 * s, 8 * s, 3 * s);
  g.restore();
}
