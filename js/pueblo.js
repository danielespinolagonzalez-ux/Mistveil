// Pueblo — hub entre runs. Spec: docs/sistemas/metaprogresion.md + narrativa/historia_personajes.md
// Aquí viven los NPCs (sprites, diálogos, beneficios). main.js mueve a Pip y pinta el diálogo.
import { DataDB } from './data_db.js';
import { GameState, RunState, SaveManager, AudioManager } from './state.js';

export const PLAZA = { x: 0, y: -600, w: 560, h: 190 }; // lejos de la Torre (coords propias)
const P = PLAZA;
const t9 = k => DataDB.texto(k);

// Estado de visita (se resetea al volver de cada run)
export const visita = { margo: false, tablon: false, hermanos: false };
export function resetVisita() { visita.margo = visita.tablon = visita.hermanos = false; }

// Contratos del Gremio: retos de una run, pagados en engranajes y Memoria
export const CONTRATOS = [
  { id: 'templanza', nombre: 'Templanza', desc: 'Baja del piso 1 perdiendo 2 corazones como mucho.' },
  { id: 'virtuoso', nombre: 'Virtuosismo', desc: 'Clava 6 golpes PERFECTOS de Cadencia en el piso 1.' },
  { id: 'intocable', nombre: 'Eco de bronce', desc: 'Logra 2 paradas (parry) en el piso 1.' }
];

// ---------- Diálogos y efectos ----------
// Cada NPC: lines() → array de {who, text}; onDone() → {accion?} y aplica beneficios.
export const NPCS = [
  {
    id: 'margo', nombre: 'Margo', x: P.x + 68, y: P.y + 150, r: 14,
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
  {
    id: 'vesper', nombre: 'Lady Vesper', x: P.x + 158, y: P.y + 180, r: 14,
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
  {
    id: 'hermanos', nombre: 'Hermanos Nº7 y Nº12', x: P.x + 318, y: P.y + 182, r: 16,
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
  {
    id: 'tablon', nombre: 'Tablón', x: P.x + 238, y: P.y + 156, r: 12,
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
  {
    id: 'redoble', nombre: 'El Redoble', x: P.x + 448, y: P.y + 150, r: 16,
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
  {
    id: 'gremio', nombre: 'Tablón del Gremio', x: P.x + 388, y: P.y + 172, r: 14,
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
  {
    id: 'puerta', nombre: 'Puerta del Reloj', x: P.x + P.w - 26, y: P.y + 140, r: 20,
    lines() {
      return [
        { who: 'PIP', text: 'Si voy a d-detenerme... quiero detenerme habiendo servido de algo.' },
        { who: '', text: '¿Descender al Reloj de las Almas?' }
      ];
    },
    onDone() { return { accion: 'run' }; }
  }
];

// ---------- Estaciones del pueblo (100% código, estilo coherente) ----------
// Antes se pegaban sprites pintados sueltos encima de la lámina (otro estilo/escala/luz,
// y la Puerta traía un recuadro sin recortar → cantaba). Ahora cada NPC es una ESTACIÓN
// dibujada por código con un lenguaje único: farol de hierro cálido colgando un emblema
// propio, sombra de contacto y resplandor del atardecer. Pip es el único personaje que
// pasea; al hablar sale el retrato pintado. Así el pueblo va todo a una con el fondo.
function px2(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

// Color de acento por estación (tinta el emblema y el resplandor).
const ESTACION = {
  margo: { col: '#ffb15a', nombre: 'Horno' },
  vesper: { col: '#b98ff0', nombre: 'Péndulo' },
  hermanos: { col: '#f0d67a', nombre: 'La cuenta' },
  tablon: { col: '#e8c98a', nombre: 'Avisos' },
  gremio: { col: '#e0b24a', nombre: 'Gremio' },
  redoble: { col: '#f0c24a', nombre: 'El Redoble' },
  puerta: { col: '#a892f0', nombre: 'La Puerta' }
};
function _rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function _glow(g, x, y, r, hex, a) {
  const gl = g.createRadialGradient(x, y, 0, x, y, r);
  gl.addColorStop(0, _rgba(hex, a)); gl.addColorStop(1, _rgba(hex, 0));
  g.fillStyle = gl; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
}

// Emblema propio de cada estación, centrado en (cx,cy). Dibujo simple y cálido.
function drawEmblema(g, id, cx, cy, col) {
  g.save(); g.translate(cx, cy);
  switch (id) {
    case 'margo': // pan dorado con cortes
      g.fillStyle = '#e2a35a'; g.beginPath(); g.ellipse(0, 1, 7, 4.5, 0, 0, 7); g.fill();
      g.fillStyle = '#c98a44'; g.beginPath(); g.ellipse(0, 2.5, 7, 2, 0, 0, 7); g.fill();
      g.strokeStyle = '#7a5028'; g.lineWidth = 0.8;
      for (const dx of [-3, 0, 3]) { g.beginPath(); g.moveTo(dx - 1.5, -1.5); g.lineTo(dx + 1.5, 2); g.stroke(); }
      break;
    case 'vesper': { // péndulo con cristal
      g.strokeStyle = '#8d82ad'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -7); g.lineTo(0, 3); g.stroke();
      g.fillStyle = col; g.beginPath(); g.moveTo(0, 1); g.lineTo(3.5, 5); g.lineTo(0, 9); g.lineTo(-3.5, 5); g.closePath(); g.fill();
      g.fillStyle = '#efe6ff'; g.beginPath(); g.moveTo(0, 2.5); g.lineTo(1.5, 5); g.lineTo(0, 7.5); g.closePath(); g.fill();
      break;
    }
    case 'hermanos': // ábaco/cuenta
      g.strokeStyle = '#8a7248'; g.lineWidth = 1.2; g.strokeRect(-6, -5, 12, 11);
      g.strokeStyle = '#5d4a33'; g.lineWidth = 0.7;
      for (const yy of [-1.5, 2]) { g.beginPath(); g.moveTo(-6, yy); g.lineTo(6, yy); g.stroke(); }
      g.fillStyle = col; for (const [bx, by] of [[-3, -1.5], [1, -1.5], [3, -1.5], [-2, 2], [2, 2]]) { g.beginPath(); g.arc(bx, by, 1.2, 0, 7); g.fill(); }
      break;
    case 'tablon': // hoja de avisos con renglones
      g.fillStyle = '#efe6cf'; g.fillRect(-5, -6, 10, 13);
      g.strokeStyle = '#8d82ad'; g.lineWidth = 0.7;
      for (const yy of [-3, -1, 1, 3]) { g.beginPath(); g.moveTo(-3.5, yy); g.lineTo(3.5, yy); g.stroke(); }
      g.fillStyle = _rgba(col, 0.9); g.beginPath(); g.arc(3, -5, 1.4, 0, 7); g.fill(); // chincheta
      break;
    case 'gremio': // pergamino con sello de cera
      g.fillStyle = '#e6d3a6'; g.fillRect(-5, -6, 10, 13);
      g.strokeStyle = '#9a7a44'; g.lineWidth = 0.7; g.strokeRect(-5, -6, 10, 13);
      g.fillStyle = '#b0402f'; g.beginPath(); g.arc(0, 3.5, 2.6, 0, 7); g.fill();
      g.fillStyle = '#d85a45'; g.beginPath(); g.arc(-0.6, 2.8, 1, 0, 7); g.fill();
      break;
    case 'redoble': { // campana de bronce
      g.fillStyle = col; g.beginPath(); g.moveTo(-6, 5); g.quadraticCurveTo(-5, -6, 0, -7); g.quadraticCurveTo(5, -6, 6, 5); g.closePath(); g.fill();
      g.fillStyle = '#8a6a24'; g.beginPath(); g.ellipse(0, 5, 6, 1.6, 0, 0, 7); g.fill();
      g.fillStyle = '#3a2e12'; g.beginPath(); g.arc(0, 6, 1.2, 0, 7); g.fill();
      g.fillStyle = _rgba('#fff2c0', 0.5); g.beginPath(); g.ellipse(-2, -1, 1.3, 3, -0.3, 0, 7); g.fill();
      break;
    }
    case 'puerta': { // esfera de reloj (marca del descenso)
      g.fillStyle = '#efe6cf'; g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fill();
      g.strokeStyle = '#5a4a2a'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, 7, 0, 7); g.stroke();
      g.strokeStyle = '#3a2e18'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -4); g.stroke();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(3.5, 1.5); g.stroke();
      break;
    }
  }
  g.restore();
}

// Dibuja la estación de un NPC. `near` = Pip está al lado (se aviva).
export function drawNPC(g, npc, SX, SY, t, near = false) {
  const x = SX(npc.x), y = SY(npc.y);
  const est = ESTACION[npc.id] ?? { col: '#ffce6a' };
  const foco = near ? 1 : 0;
  const pulso = 0.5 + Math.sin(t * 2.4 + npc.x * 0.1) * 0.5;

  // Sombra de contacto sobre el adoquín
  g.fillStyle = 'rgba(0,0,0,0.30)';
  g.beginPath(); g.ellipse(x, y + 3, 13, 4, 0, 0, 7); g.fill();

  // La Puerta del Reloj: umbral monumental del descenso (arco de piedra + luz).
  if (npc.id === 'puerta') {
    _glow(g, x, y - 30, 46 + foco * 12, est.col, 0.12 + foco * 0.14 + pulso * 0.03);
    // Arco de piedra
    g.fillStyle = '#2a2440';
    g.beginPath();
    g.moveTo(x - 26, y); g.lineTo(x - 26, y - 44);
    g.quadraticCurveTo(x, y - 74, x + 26, y - 44); g.lineTo(x + 26, y);
    g.lineTo(x + 18, y); g.lineTo(x + 18, y - 42);
    g.quadraticCurveTo(x, y - 62, x - 18, y - 42); g.lineTo(x - 18, y); g.closePath(); g.fill();
    // Umbral iluminado (portal)
    const pg = g.createLinearGradient(x, y, x, y - 58);
    pg.addColorStop(0, _rgba(est.col, 0.05)); pg.addColorStop(1, _rgba(est.col, 0.28 + foco * 0.18));
    g.fillStyle = pg;
    g.beginPath();
    g.moveTo(x - 18, y); g.lineTo(x - 18, y - 42);
    g.quadraticCurveTo(x, y - 62, x + 18, y - 42); g.lineTo(x + 18, y); g.closePath(); g.fill();
    // Clave del arco con esfera de reloj
    g.save(); g.translate(x, y - 50); g.scale(1.5, 1.5); drawEmblema(g, 'puerta', 0, 0, est.col); g.restore();
    // Motas ascendentes
    for (let i = 0; i < 4; i++) {
      const st = (t * 0.4 + i * 0.25) % 1;
      g.fillStyle = _rgba('#efe6ff', (1 - st) * (0.3 + foco * 0.3));
      g.beginPath(); g.arc(x + Math.sin(t + i * 2) * 10, y - 6 - st * 40, 1.4, 0, 7); g.fill();
    }
    return;
  }

  // Estaciones normales: farol de hierro colgando un emblema (mismo lenguaje para todas).
  const sway = Math.sin(t * 1.5 + npc.x * 0.13) * 0.9;
  _glow(g, x + 6, y - 24, 26 + foco * 8, est.col, 0.10 + foco * 0.16 + pulso * 0.03);
  // Poste de hierro + brazo
  g.strokeStyle = '#2b2536'; g.lineWidth = 2.4;
  g.beginPath(); g.moveTo(x - 9, y + 1); g.lineTo(x - 9, y - 34); g.lineTo(x + 3, y - 34); g.stroke();
  g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 12, y + 1); g.lineTo(x - 6, y + 1); g.stroke(); // base
  // Cadena + panel colgante que se mece
  const px = x + 3 + sway, py = y - 30;
  g.strokeStyle = '#3a3350'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 3, y - 34); g.lineTo(px, py - 8); g.stroke();
  // Marco del panel (hierro) + fondo cálido
  g.fillStyle = '#241f36';
  g.beginPath(); g.roundRect ? g.roundRect(px - 12, py - 8, 24, 24, 4) : g.rect(px - 12, py - 8, 24, 24); g.fill();
  g.strokeStyle = _rgba(est.col, 0.8); g.lineWidth = 1.4;
  g.beginPath(); g.roundRect ? g.roundRect(px - 12, py - 8, 24, 24, 4) : g.rect(px - 12, py - 8, 24, 24); g.stroke();
  const pg = g.createRadialGradient(px, py + 4, 1, px, py + 4, 16);
  pg.addColorStop(0, _rgba(est.col, 0.30 + foco * 0.2)); pg.addColorStop(1, _rgba(est.col, 0));
  g.fillStyle = pg; g.fillRect(px - 12, py - 8, 24, 24);
  // Emblema dentro del panel
  drawEmblema(g, npc.id, px, py + 4, est.col);
  // Farolillo cálido en el remate del brazo
  g.fillStyle = _rgba('#ffce7a', 0.9 * (0.7 + pulso * 0.3));
  g.beginPath(); g.arc(x + 3, y - 34, 2.2, 0, 7); g.fill();
}

// CORO, el ave de fuego: revolotea cerca de Margo (ambiental)
export function drawCoro(g, SX, SY, t) {
  const bx = P.x + 130 + Math.sin(t * 0.7) * 26;
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

// ---------- Backdrop del pueblo ----------
export function drawPuebloBackdrop(g, SX, SY, t, VW, VH) {
  // Casas al fondo (siluetas con ventanas cálidas)
  const houses = [
    { x: P.x - 10, w: 90, h: 74 }, { x: P.x + 95, w: 70, h: 58 },
    { x: P.x + 180, w: 84, h: 80 }, { x: P.x + 280, w: 66, h: 62 },
    { x: P.x + 360, w: 88, h: 70 }
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
    // ventanas cálidas parpadeantes
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
  // esfera de reloj
  g.fillStyle = '#e8dfc8';
  g.beginPath(); g.arc(gx, horizon - 108, 17, 0, 7); g.fill();
  g.strokeStyle = '#3a3226'; g.lineWidth = 2;
  g.beginPath(); g.arc(gx, horizon - 108, 17, 0, 7); g.stroke();
  const ha = t * 0.05, ma = t * 0.6;
  g.beginPath(); g.moveTo(gx, horizon - 108); g.lineTo(gx + Math.cos(ha) * 8, horizon - 108 + Math.sin(ha) * 8); g.stroke();
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(gx, horizon - 108); g.lineTo(gx + Math.cos(ma) * 12, horizon - 108 + Math.sin(ma) * 12); g.stroke();
  // arco de la puerta
  g.fillStyle = '#0e0b1c';
  g.beginPath();
  g.moveTo(gx - 20, horizon);
  g.lineTo(gx - 20, horizon - 44);
  g.quadraticCurveTo(gx, horizon - 62, gx + 20, horizon - 44);
  g.lineTo(gx + 20, horizon);
  g.closePath(); g.fill();
  g.strokeStyle = '#6b5a36'; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(gx - 21, horizon);
  g.lineTo(gx - 21, horizon - 45);
  g.quadraticCurveTo(gx, horizon - 64, gx + 21, horizon - 45);
  g.lineTo(gx + 21, horizon);
  g.stroke();
  // horno de Margo (izquierda)
  const mx = SX(P.x + 60);
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
  // chimenea con humo
  g.fillStyle = '#3a3040'; g.fillRect(mx + 6, horizon - 48, 7, 16);
  for (let i = 0; i < 3; i++) {
    const st = (t * 0.5 + i * 0.33) % 1;
    g.fillStyle = `rgba(160,150,180,${0.25 * (1 - st)})`;
    g.beginPath(); g.arc(mx + 9 + Math.sin(t + i * 2) * 4 * st, horizon - 50 - st * 26, 2 + st * 4, 0, 7); g.fill();
  }
}

// Suelo adoquinado de la plaza
export function drawPlazaGround(g, SX, SY, KY) {
  const x0 = SX(P.x - 20), x1 = SX(P.x + P.w + 20);
  const y0 = SY(P.y), y1 = SY(P.y + P.h) + 14;
  g.fillStyle = '#332c4a';
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  // adoquines
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 22; c++) {
      const ax = x0 + c * 28 + (r % 2) * 14, ay = y0 + r * (24 * KY);
      const v = ((r * 13 + c * 7) % 8);
      g.fillStyle = `rgb(${56 + v},${50 + v},${82 + v})`;
      g.fillRect(ax + 1, ay + 1, 26, 24 * KY - 2);
    }
  }
}
