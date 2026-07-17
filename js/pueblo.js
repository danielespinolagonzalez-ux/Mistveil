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
    id: 'margo', nombre: 'Margo', x: P.x + 88, y: P.y + 78, r: 14,
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
    id: 'vesper', nombre: 'Lady Vesper', x: P.x + 300, y: P.y + 58, r: 14,
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
    id: 'hermanos', nombre: 'Hermanos Nº7 y Nº12', x: P.x + 424, y: P.y + 96, r: 16,
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
    id: 'tablon', nombre: 'Tablón', x: P.x + 210, y: P.y + 108, r: 12,
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
    id: 'redoble', nombre: 'El Redoble', x: P.x + 150, y: P.y + 132, r: 16,
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
    id: 'gremio', nombre: 'Tablón del Gremio', x: P.x + 350, y: P.y + 150, r: 14,
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
    id: 'puerta', nombre: 'Puerta del Reloj', x: P.x + P.w - 34, y: P.y + 64, r: 20,
    lines() {
      return [
        { who: 'PIP', text: 'Si voy a d-detenerme... quiero detenerme habiendo servido de algo.' },
        { who: '', text: '¿Descender al Reloj de las Almas?' }
      ];
    },
    onDone() { return { accion: 'run' }; }
  }
];

// ---------- Sprites ----------
function px2(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

export function drawNPC(g, npc, SX, SY, t) {
  const x = SX(npc.x), y = SY(npc.y);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.ellipse(x, y + 4, 11, 3.5, 0, 0, 7); g.fill();
  switch (npc.id) {
    case 'margo': {
      const knead = Math.sin(t * 4) * 1.5;
      g.fillStyle = '#b0a08c';
      g.beginPath(); g.ellipse(x, y - 4, 10, 11, 0, 0, 7); g.fill();
      px2(g, x - 10, y - 2, 20, 7, '#e8e2d4');           // delantal
      g.fillStyle = '#c9bda6';
      g.beginPath(); g.arc(x, y - 13, 6, 0, 7); g.fill(); // cabeza
      px2(g, x - 5, y - 22, 10, 5, '#f4f0e6');            // gorro
      px2(g, x - 4, y - 24, 8, 3, '#f4f0e6');
      px2(g, x - 3, y - 14, 2, 2, '#3a3226');
      px2(g, x + 1, y - 14, 2, 2, '#3a3226');
      // brazos amasando
      px2(g, x - 12, y - 6 + knead, 4, 3, '#c9bda6');
      px2(g, x + 8, y - 6 - knead, 4, 3, '#c9bda6');
      // pan en la mesa
      px2(g, x - 16, y + 2, 34, 4, '#6b5a36');
      g.fillStyle = '#d8a85c';
      g.beginPath(); g.ellipse(x - 8, y, 4, 2.5, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(x + 9, y, 4, 2.5, 0, 0, 7); g.fill();
      break;
    }
    case 'vesper': {
      const sway = Math.sin(t * 1.6) * 0.8;
      px2(g, x - 4, y - 26, 8, 30, '#3d3358');            // cuerpo esbelto
      px2(g, x - 6, y - 8, 12, 12, '#4c4070');            // capa
      g.fillStyle = '#d8d2e8';
      g.beginPath(); g.arc(x, y - 28, 5, 0, 7); g.fill(); // cabeza
      px2(g, x - 5, y - 33, 10, 3, '#8a2f3c');            // penacho
      px2(g, x - 1 + sway, y - 36, 3, 4, '#c0392b');
      px2(g, x - 2, y - 29, 2, 2, '#ffb547');             // ojos ámbar
      px2(g, x + 1, y - 29, 2, 2, '#ffb547');
      // lanza
      px2(g, x + 8, y - 38, 2, 42, '#8d82ad');
      px2(g, x + 6, y - 42, 6, 6, '#c9d2ff');
      break;
    }
    case 'hermanos': {
      for (const [ox, phase] of [[-9, 0], [9, Math.PI]]) {
        const nod = Math.sin(t * 2 + phase) * 1.2;
        px2(g, x + ox - 5, y - 10 + nod, 10, 12, '#7a6a4f');
        g.fillStyle = '#c9bda6';
        g.beginPath(); g.arc(x + ox, y - 13 + nod, 4.5, 0, 7); g.fill();
        px2(g, x + ox - 2, y - 14 + nod, 1.5, 1.5, '#3a3226');
        px2(g, x + ox + 1, y - 14 + nod, 1.5, 1.5, '#3a3226');
      }
      // pizarra con cuenta
      px2(g, x - 7, y - 30, 14, 10, '#2b2440');
      g.strokeStyle = '#e9e2f5'; g.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        g.beginPath(); g.moveTo(x - 4 + i * 3, y - 27); g.lineTo(x - 4 + i * 3, y - 23); g.stroke();
      }
      break;
    }
    case 'tablon': {
      px2(g, x - 2, y - 24, 4, 26, '#6b5a36');
      px2(g, x - 14, y - 26, 28, 16, '#8a7248');
      px2(g, x - 12, y - 24, 8, 10, '#e8dfc8');
      px2(g, x - 2, y - 23, 7, 8, '#d8cdb0');
      px2(g, x + 6, y - 25, 6, 11, '#e8dfc8');
      px2(g, x - 11, y - 22, 6, 1, '#8d82ad');
      px2(g, x - 11, y - 20, 6, 1, '#8d82ad');
      px2(g, x + 7, y - 23, 4, 1, '#8d82ad');
      break;
    }
    case 'gremio': {
      // Tablón de anuncios del gremio: poste + papel clavado
      px2(g, x - 2, y - 26, 4, 26, '#4a3b2a');
      px2(g, x - 12, y - 26, 24, 16, '#5d4a33');
      px2(g, x - 10, y - 24, 20, 12, '#2e2417');
      const flut = Math.sin(t * 2.2) * 0.8;
      px2(g, x - 7, y - 23 + flut, 6, 9, '#e8dfc8');
      px2(g, x - 6, y - 21 + flut, 4, 1, '#8d82ad');
      px2(g, x - 6, y - 19 + flut, 4, 1, '#8d82ad');
      px2(g, x + 2, y - 22, 5, 7, '#d8c9a3');
      px2(g, x - 7, y - 23 + flut, 6, 1, '#c9a24a');
      break;
    }
    case 'redoble': {
      // Campana de duelos colgada de un péndulo quieto
      const swing = Math.sin(t * 1.2) * 2;
      px2(g, x - 2, y - 46, 4, 24, '#6b5a36');             // soporte/péndulo
      g.fillStyle = '#c9a24a';                              // campana de bronce
      g.beginPath(); g.moveTo(x - 12 + swing, y - 2); g.quadraticCurveTo(x + swing, y - 26, x + 12 + swing, y - 2); g.closePath(); g.fill();
      g.fillStyle = '#e8c66a';
      g.beginPath(); g.ellipse(x + swing, y - 2, 12, 3, 0, 0, 7); g.fill();
      px2(g, x - 1 + swing, y - 3, 3, 5, '#3a3226');        // badajo
      px2(g, x - 3 + swing, y - 27, 6, 3, '#8a7248');       // yugo
      // reflejo dorado latente
      const gl = 0.12 + Math.sin(t * 3) * 0.05;
      g.fillStyle = `rgba(255,213,79,${gl})`;
      g.beginPath(); g.ellipse(x, y + 2, 18, 6, 0, 0, 7); g.fill();
      break;
    }
    case 'puerta': {
      // El arco se dibuja en el backdrop; aquí solo el brillo del umbral
      const gl = 0.10 + Math.sin(t * 2) * 0.04;
      g.fillStyle = `rgba(150,130,220,${gl})`;
      g.beginPath(); g.ellipse(x, y, 20, 8, 0, 0, 7); g.fill();
      break;
    }
  }
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
