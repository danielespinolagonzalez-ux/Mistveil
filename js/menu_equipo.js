// Menú de equipo y progresión (Tab) — Equipo · Esfera del Reloj · Crónica.
// La Esfera es el tablero de esferas de FFX adaptado: un reloj de nodos que se
// activan gastando engranajes (1 por nivel), viajando solo por nodos adyacentes.
import { DataDB } from './data_db.js';
import { GameState, RunState, SaveManager, AudioManager } from './state.js';
import { nodosEsfera, nodoEsfera, aristasEsfera, vecinosEsfera, nodoActivado, nodoDisponible, activarNodo, esferaBonos, xpParaNivel } from './esfera.js';
import { nivelHechizo } from './spells.js';
import { compasNivel, ventanaMult } from './cadencia.js';
import { desbloqueado, nivelDe } from './progresion.js';

const CAT_COLOR = { ofensa: '#e0556b', ritmo: '#7ee8e0', alma: '#b678e8', vida: '#7ec96b', fortuna: '#ffd54f', sello: '#c9a24a', inicio: '#e9e2f5', mutador: '#ff7b9c' };
const TABS = ['EQUIPO', 'ESFERA DEL RELOJ', 'CRÓNICA'];

export class MenuEquipo {
  constructor(VW, VH, font, ctx) {
    this.VW = VW; this.VH = VH; this.font = font; this.g = ctx;
    this.tab = 0; this.t = 0;
    this.col = 0; this.idx = [0, 0, 0];
    this.cursor = 'eje';
    this.msg = null; this.msgT = 0;
  }
  open(player) {
    this.p = player; this.t = 0; this.msg = null;
    AudioManager.sfx('tome');
  }
  _aviso(txt) { this.msg = txt; this.msgT = 1.8; AudioManager.beep(220, 0.07, 'square', 0.05); }

  update(Input, dt) {
    this.t += dt;
    this.touch = Input.touchState().enabled;
    if (this.msgT > 0) this.msgT -= dt;
    if (Input.justPressed('menu') || Input.justPressed('pause')) { AudioManager.beep(320, 0.05, 'square', 0.04); return 'cerrar'; }
    const beep = () => AudioManager.beep(560, 0.03, 'triangle', 0.035);
    if (Input.justCode('Digit1')) { this.tab = 0; beep(); }
    if (Input.justCode('Digit2')) { this.tab = 1; beep(); }
    if (Input.justCode('Digit3')) { this.tab = 2; beep(); }
    if (Input.justCode('KeyE')) { this.tab = (this.tab + 1) % 3; beep(); }
    if (Input.justCode('KeyQ')) { this.tab = (this.tab + 2) % 3; beep(); }
    // En táctil el confirm por 'melee' (TouchA, tap seco a la dcha) se desactiva:
    // confirmar es SIEMPRE re-tap sobre lo ya seleccionado (evita activaciones fantasma).
    let confirm = Input.justCode('Enter') || (!this.touch && Input.justPressed('melee'));
    const tap = Input.consumeTap ? Input.consumeTap() : null;
    if (tap) {
      if (tap.x > this.VW - 78 && tap.y > this.VH - 30) { AudioManager.beep(320, 0.05, 'square', 0.04); return 'cerrar'; } // ✕ CERRAR
      for (let i = 0; i < 3; i++) {
        const r = this._tabRect(i);
        if (tap.x > r.x && tap.x < r.x + r.w && tap.y > r.y - 4 && tap.y < r.y + r.h + 6) { this.tab = i; beep(); return null; }
      }
    }
    if (this.tab === 0) this._updateEquipo(Input, confirm, tap, beep);
    else if (this.tab === 1) this._updateEsfera(Input, confirm, tap, beep);
    return null;
  }

  _equipoLists() {
    return [
      RunState.tomos.map(id => DataDB.hechizo(id)).filter(Boolean),
      DataDB.compases.compases,
      RunState.items.map(id => DataDB.item(id)).filter(Boolean)
    ];
  }

  _updateEquipo(Input, confirm, tap, beep) {
    const lists = this._equipoLists();
    if (Input.justPressed('move_left')) { this.col = (this.col + 2) % 3; beep(); }
    if (Input.justPressed('move_right')) { this.col = (this.col + 1) % 3; beep(); }
    // Tap en una fila: 1º selecciona, 2º (misma fila) equipa
    if (tap) {
      const y0 = 54, hh = this.VH - 54 - 62, w = (this.VW - 44) / 3;
      for (let c = 0; c < 3; c++) {
        const x = 16 + c * (w + 6);
        if (tap.x < x || tap.x > x + w || tap.y < y0 || tap.y > y0 + hh) continue;
        const list = lists[c];
        if (!list.length) { this.col = c; beep(); break; }
        const selIdx = Math.min(this.idx[c], list.length - 1);
        const maxRows = Math.floor((hh - 24) / 22);
        const off = Math.max(0, Math.min(selIdx - maxRows + 1, list.length - maxRows));
        const row = off + Math.floor((tap.y - (y0 + 19)) / 22);
        if (row >= off && row < Math.min(list.length, off + maxRows)) {
          if (this.col === c && this.idx[c] === row) confirm = true;
          else { this.col = c; this.idx[c] = row; beep(); }
        } else { this.col = c; beep(); }
        break;
      }
    }
    const list = lists[this.col];
    if (!list.length) return;
    this.idx[this.col] = Math.min(this.idx[this.col], list.length - 1);
    if (Input.justPressed('move_up')) { this.idx[this.col] = (this.idx[this.col] + list.length - 1) % list.length; beep(); }
    if (Input.justPressed('move_down')) { this.idx[this.col] = (this.idx[this.col] + 1) % list.length; beep(); }
    if (confirm) {
      if (this.col === 0) { RunState.hechizo = list[this.idx[0]].id; AudioManager.sfx('equip'); }
      else if (this.col === 1) {
        const c = list[this.idx[1]];
        if (!desbloqueado('compas', c.id)) this._aviso('Se desbloquea en Nv.' + nivelDe('compas', c.id));
        else { RunState.compas = c.id; AudioManager.sfx('equip'); }
      }
    }
  }

  _updateEsfera(Input, confirm, tap, beep) {
    for (const [act, d] of [['move_up', [0, -1]], ['move_down', [0, 1]], ['move_left', [-1, 0]], ['move_right', [1, 0]]]) {
      if (Input.justPressed(act)) {
        const next = this._nodeToward(this.cursor, d);
        if (next) { this.cursor = next; beep(); }
      }
    }
    if (tap) {
      const hit = this._nodeAt(tap.x, tap.y);
      if (hit) { if (hit === this.cursor) confirm = true; else { this.cursor = hit; beep(); } }
    }
    if (confirm) {
      const n = nodoEsfera(this.cursor);
      if (!n || n.id === 'eje') return;
      if (nodoActivado(n.id)) this._aviso('Este nodo ya brilla.');
      else if (!nodoDisponible(n.id)) this._aviso('Conecta primero un nodo adyacente.');
      else if (GameState.engranajes < n.coste) this._aviso('Te faltan engranajes: cuesta ' + n.coste + '.');
      else if (activarNodo(n.id, this.p)) { SaveManager.save(); AudioManager.sfx('equip'); }
    }
  }

  // ---------- geometría de la esfera ----------
  _board() {
    const base = Math.min(this.VW, this.VH);
    return { cx: this.VW / 2, cy: this.VH / 2 + 14, r1: base * 0.155, rs: base * 0.235, r2: base * 0.315, r3: base * 0.385 };
  }
  _pos(n) {
    const b = this._board();
    const R = n.ring === 0 ? 0 : n.ring === 1 ? b.r1 : n.ring === 1.5 ? b.rs : n.ring === 3 ? b.r3 : b.r2;
    const a = (n.hora / 12) * Math.PI * 2 - Math.PI / 2;
    return [b.cx + Math.cos(a) * R, b.cy + Math.sin(a) * R];
  }
  _nodeToward(fromId, dir) {
    const [fx, fy] = this._pos(nodoEsfera(fromId));
    let best = null, bestDot = 0.25;
    for (const vid of vecinosEsfera(fromId)) {
      const [x, y] = this._pos(nodoEsfera(vid));
      const dx = x - fx, dy = y - fy, d = Math.hypot(dx, dy) || 1;
      const dot = (dx * dir[0] + dy * dir[1]) / d;
      if (dot > bestDot) { bestDot = dot; best = vid; }
    }
    return best;
  }
  _nodeAt(x, y) {
    for (const n of nodosEsfera()) {
      const [nx, ny] = this._pos(n);
      if (Math.hypot(x - nx, y - ny) < 13) return n.id;
    }
    return null;
  }
  _tabRect(i) { const w = (this.VW - 32) / 3; return { x: 16 + i * w, y: 30, w, h: 16 }; }

  _gear(g, x, y, r, col) {
    g.save(); g.translate(x, y); g.fillStyle = col;
    for (let i = 0; i < 8; i++) { g.rotate(Math.PI / 4); g.fillRect(-r * 0.18, -r - r * 0.32, r * 0.36, r * 0.45); }
    g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    g.fillStyle = '#0b0819'; g.beginPath(); g.arc(0, 0, r * 0.42, 0, 7); g.fill();
    g.restore();
  }
  _panel(g, x, y, w, h, title) {
    g.fillStyle = 'rgba(20,15,38,0.85)'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#3a3358'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (title) { this.font(8); g.textAlign = 'left'; g.fillStyle = '#8d82ad'; g.fillText(title, x + 6, y + 12); }
  }

  // ---------- draw ----------
  draw(t) {
    const g = this.g, VW = this.VW, VH = this.VH;
    g.fillStyle = '#0b0819'; g.fillRect(0, 0, VW, VH);
    g.strokeStyle = '#5a4fa0'; g.lineWidth = 1.5; g.strokeRect(6.5, 6.5, VW - 13, VH - 13);
    g.strokeStyle = 'rgba(255,213,79,0.18)'; g.lineWidth = 1; g.strokeRect(10.5, 10.5, VW - 21, VH - 21);
    // cabecera
    this.font(10); g.textAlign = 'left'; g.fillStyle = '#e9e2f5';
    g.fillText('PIP — APRENDIZ DE RELOJERO', 16, 22);
    g.textAlign = 'right'; this.font(9);
    this._gear(g, VW - 148, 17, 5, '#ffd54f');
    g.fillStyle = '#ffd54f'; g.fillText('× ' + GameState.engranajes, VW - 116, 21);
    g.fillStyle = '#b9aee0'; g.fillText('Nv. ' + GameState.nivel, VW - 70, 21);
    g.fillStyle = '#c7a266'; g.fillText(RunState.oro + ' oro', VW - 16, 21);
    const need = xpParaNivel(GameState.nivel);
    g.fillStyle = '#2a2340'; g.fillRect(VW - 148, 24, 132, 3);
    g.fillStyle = '#7a5fd0'; g.fillRect(VW - 148, 24, 132 * Math.min(1, GameState.xp / need), 3);
    // pestañas
    for (let i = 0; i < 3; i++) {
      const r = this._tabRect(i);
      const sel = i === this.tab;
      g.fillStyle = sel ? 'rgba(90,79,160,0.35)' : 'rgba(30,24,55,0.6)';
      g.fillRect(r.x, r.y, r.w - 4, r.h);
      if (sel) { g.strokeStyle = '#ffd54f'; g.lineWidth = 1; g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 5, r.h - 1); }
      this.font(8); g.textAlign = 'center';
      g.fillStyle = sel ? '#ffd54f' : '#8d82ad';
      g.fillText((i + 1) + ' · ' + TABS[i], r.x + (r.w - 4) / 2, r.y + 11);
    }
    if (this.tab === 0) this._drawEquipo(g, t);
    else if (this.tab === 1) this._drawEsfera(g, t);
    else this._drawCronica(g, t);
    this.font(7); g.textAlign = 'center'; g.fillStyle = '#6c6193';
    g.fillText(this.touch
      ? (this.tab === 1 ? 'Toca un nodo · toca otra vez para activar' : this.tab === 0 ? 'Toca para elegir · toca otra vez para equipar' : 'Toca las pestañas para cambiar')
      : (this.tab === 1 ? 'Flechas mover · Enter activar · Q/E pestaña · Tab cerrar'
      : this.tab === 0 ? 'Flechas navegar · Enter equipar · Q/E pestaña · Tab cerrar'
      : 'Q/E pestaña · Tab cerrar'), VW / 2, VH - 14);
    if (this.touch) {
      g.textAlign = 'right'; this.font(9);
      g.fillStyle = 'rgba(20,15,38,0.9)'; g.fillRect(VW - 74, VH - 28, 60, 17);
      g.strokeStyle = '#5a4fa0'; g.lineWidth = 1; g.strokeRect(VW - 73.5, VH - 27.5, 59, 16);
      g.fillStyle = '#e0556b'; g.fillText('✕ cerrar', VW - 20, VH - 16);
    }
    if (this.msgT > 0 && this.msg) {
      g.globalAlpha = Math.min(1, this.msgT * 2);
      this.font(9); g.textAlign = 'center'; g.fillStyle = '#ff8a5a';
      g.fillText(this.msg, VW / 2, VH - 26);
      g.globalAlpha = 1;
    }
  }

  _drawEquipo(g, t) {
    const VW = this.VW, VH = this.VH;
    const y0 = 54, hh = VH - 54 - 62;
    const w = (VW - 44) / 3;
    const lists = this._equipoLists();
    const titles = ['ARTES DE TINTA [Q]', 'COMPÁS [C]', 'RELIQUIAS (' + lists[2].length + ')'];
    for (let c = 0; c < 3; c++) {
      const x = 16 + c * (w + 6);
      this._panel(g, x, y0, w, hh, titles[c]);
      if (this.col === c) { g.strokeStyle = '#ffd54f'; g.strokeRect(x + 0.5, y0 + 0.5, w - 1, hh - 1); }
      const list = lists[c];
      if (!list.length) { this.font(8); g.textAlign = 'left'; g.fillStyle = '#5a5470'; g.fillText(c === 2 ? 'Sin reliquias aún' : '—', x + 6, y0 + 30); continue; }
      const selIdx = Math.min(this.idx[c], list.length - 1);
      const maxRows = Math.floor((hh - 24) / 22);
      const off = Math.max(0, Math.min(selIdx - maxRows + 1, list.length - maxRows));
      for (let i = off; i < Math.min(list.length, off + maxRows); i++) {
        const it = list[i];
        const ry = y0 + 22 + (i - off) * 22;
        const sel = this.col === c && i === selIdx;
        if (sel) { g.fillStyle = 'rgba(255,213,79,0.10)'; g.fillRect(x + 2, ry - 3, w - 4, 20); }
        const eq = (c === 0 && it.id === RunState.hechizo) || (c === 1 && it.id === RunState.compas);
        const lock = c === 1 && !desbloqueado('compas', it.id);
        this.font(8); g.textAlign = 'left';
        g.fillStyle = lock ? '#5a5470' : sel ? '#ffd54f' : eq ? '#ffe9a8' : '#e9e2f5';
        g.fillText((eq ? '▶ ' : '') + it.nombre, x + 5, ry + 6);
        this.font(7);
        if (c === 0) {
          const el = DataDB.elementos[it.elemento];
          g.fillStyle = el?.color ?? '#8d82ad'; g.fillText(el?.nombre ?? '', x + 5, ry + 15);
          g.textAlign = 'right'; g.fillStyle = '#8d82ad';
          g.fillText('Nv.' + nivelHechizo(it.id) + ' · ' + it.coste_sp + ' SP', x + w - 6, ry + 15);
        } else if (c === 1) {
          const bloqueado = !desbloqueado('compas', it.id);
          if (bloqueado) {
            g.fillStyle = '#5a5470'; g.fillText('🔒 bloqueado', x + 5, ry + 15);
            g.textAlign = 'right'; g.fillText('Nv.' + nivelDe('compas', it.id), x + w - 6, ry + 15);
          } else {
            g.fillStyle = it.color ?? '#8d82ad';
            g.fillText(it.golpes + ' golpes', x + 5, ry + 15);
            g.textAlign = 'right'; g.fillStyle = '#8d82ad'; g.fillText('Nv.' + compasNivel(it.id), x + w - 6, ry + 15);
          }
        } else {
          g.fillStyle = ({ comun: '#8d82ad', raro: '#7ea8e8', legendario: '#ffd54f' })[it.rareza] ?? '#8d82ad';
          g.fillText(({ comun: 'común', raro: 'raro', legendario: 'LEGENDARIO' })[it.rareza] ?? '', x + 5, ry + 15);
        }
        g.textAlign = 'left';
      }
    }
    // descripción + sinergias
    const list = lists[this.col];
    const it = list[Math.min(this.idx[this.col], Math.max(0, list.length - 1))];
    const dy = VH - 60;
    this._panel(g, 16, dy, VW - 32, 28, null);
    this.font(8); g.textAlign = 'left';
    if (it) {
      g.fillStyle = '#e9e2f5'; g.fillText(it.nombre, 22, dy + 11);
      this.font(7); g.fillStyle = '#8d82ad';
      g.fillText((it.desc ?? it.descripcion ?? '').slice(0, 92), 22, dy + 21);
    }
    const syn = this.p?.mods?.sinergias ?? [];
    if (syn.length) { this.font(7); g.textAlign = 'right'; g.fillStyle = '#ffd54f'; g.fillText('SINERGIA: ' + syn.join(' · '), VW - 22, dy + 11); }
  }

  _drawEsfera(g, t) {
    const b = this._board();
    // ornamentos de esfera de reloj
    g.strokeStyle = 'rgba(122,95,208,0.25)'; g.lineWidth = 1;
    g.beginPath(); g.arc(b.cx, b.cy, b.r2 + 12, 0, 7); g.stroke();
    g.setLineDash([2, 4]); g.beginPath(); g.arc(b.cx, b.cy, b.r1 * 0.55, 0, 7); g.stroke(); g.setLineDash([]);
    this.font(9); g.textAlign = 'center'; g.fillStyle = 'rgba(185,174,224,0.5)';
    const rom = { 0: 'XII', 3: 'III', 6: 'VI', 9: 'IX' };
    for (const h of [0, 3, 6, 9]) {
      const a = h / 12 * Math.PI * 2 - Math.PI / 2;
      g.fillText(rom[h], b.cx + Math.cos(a) * (b.r2 + 24), b.cy + Math.sin(a) * (b.r2 + 24) + 3);
    }
    // aristas
    for (const [aid, bid] of aristasEsfera()) {
      const [x1, y1] = this._pos(nodoEsfera(aid));
      const [x2, y2] = this._pos(nodoEsfera(bid));
      const actA = nodoActivado(aid), actB = nodoActivado(bid);
      g.strokeStyle = actA && actB ? 'rgba(255,213,79,0.7)' : (actA || actB) ? 'rgba(126,232,224,0.32)' : 'rgba(90,80,130,0.28)';
      g.lineWidth = actA && actB ? 2 : 1;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    // manecillas apuntando al cursor
    const [cx2, cy2] = this._pos(nodoEsfera(this.cursor));
    if (this.cursor !== 'eje') {
      const ang = Math.atan2(cy2 - b.cy, cx2 - b.cx);
      g.strokeStyle = 'rgba(233,226,245,0.3)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(b.cx, b.cy); g.lineTo(b.cx + Math.cos(ang) * b.r1 * 0.6, b.cy + Math.sin(ang) * b.r1 * 0.6); g.stroke();
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(b.cx, b.cy); g.lineTo(b.cx + Math.cos(ang) * b.r1 * 0.88, b.cy + Math.sin(ang) * b.r1 * 0.88); g.stroke();
    }
    // nodos
    for (const n of nodosEsfera()) {
      const [x, y] = this._pos(n);
      const act = nodoActivado(n.id), disp = nodoDisponible(n.id);
      const afford = GameState.engranajes >= n.coste;
      const col = CAT_COLOR[n.cat] ?? '#e9e2f5';
      const R = n.ring === 1.5 ? 6 : 7;
      const shape = (fill, stroke, lw) => {
        if (n.ring === 1.5) {
          g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
          if (fill) { g.fillStyle = fill; g.fillRect(-R + 1, -R + 1, R * 2 - 2, R * 2 - 2); }
          if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.strokeRect(-R + 0.5, -R + 0.5, R * 2 - 1, R * 2 - 1); }
          g.restore();
        } else {
          if (fill) { g.fillStyle = fill; g.beginPath(); g.arc(x, y, R, 0, 7); g.fill(); }
          if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.beginPath(); g.arc(x, y, R, 0, 7); g.stroke(); }
        }
      };
      if (act) {
        shape('#ffd54f', '#fff7dd', 1);
        g.fillStyle = n.id === 'eje' ? '#0b0819' : col;
        g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill();
      } else if (disp && afford) {
        shape('#16333a', '#7ee8e0', 1.5 + Math.sin(t * 5) * 0.5);
        g.fillStyle = col; g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill();
      } else if (disp) {
        shape('#241f38', '#8d82ad', 1);
        g.fillStyle = col; g.globalAlpha = 0.7; g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); g.globalAlpha = 1;
      } else {
        shape('#171227', '#3d3358', 1);
        g.fillStyle = col; g.globalAlpha = 0.35; g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); g.globalAlpha = 1;
      }
      if (n.id === this.cursor) {
        g.strokeStyle = '#ffffff'; g.lineWidth = 1.2;
        g.setLineDash([3, 3]); g.lineDashOffset = -t * 24;
        g.beginPath(); g.arc(x, y, R + 4.5, 0, 7); g.stroke();
        g.setLineDash([]); g.lineDashOffset = 0;
      }
    }
    // ficha del nodo bajo el cursor
    const n = nodoEsfera(this.cursor);
    const dy = this.VH - 60;
    this._panel(g, 16, dy, this.VW - 32, 28, null);
    this.font(9); g.textAlign = 'left';
    g.fillStyle = CAT_COLOR[n.cat] ?? '#e9e2f5';
    g.fillText(n.nombre, 22, dy + 11);
    this.font(7); g.fillStyle = '#8d82ad';
    g.fillText(n.desc.slice(0, 92), 22, dy + 21);
    this.font(8); g.textAlign = 'right';
    if (nodoActivado(n.id)) { g.fillStyle = '#ffd54f'; g.fillText('ACTIVADO', this.VW - 22, dy + 11); }
    else if (!nodoDisponible(n.id)) { g.fillStyle = '#5a5470'; g.fillText('fuera de alcance', this.VW - 22, dy + 11); }
    else {
      g.fillStyle = GameState.engranajes >= n.coste ? '#7ee8e0' : '#e0556b';
      g.fillText('coste: ' + n.coste + ' engranaje' + (n.coste > 1 ? 's' : ''), this.VW - 22, dy + 11);
    }
  }

  _drawCronica(g, t) {
    const VW = this.VW, VH = this.VH;
    const y0 = 54, hh = VH - 54 - 30;
    const w = (VW - 38) / 2;
    this._panel(g, 16, y0, w, hh, 'ESTADÍSTICAS DE PIP');
    const base = DataDB.balance.player, s = this.p?.stats ?? base;
    const eb = esferaBonos();
    const fmt = v => String(Math.round(v * 10) / 10);
    const rows = [
      ['Corazones', base.max_hp, s.max_hp, false],
      ['Daño lágrima', base.tear_damage, s.tear_damage, false],
      ['Disparos/s', base.tear_rate_per_s, s.tear_rate_per_s, false],
      ['Alcance', base.tear_range_px, s.tear_range_px, false],
      ['Daño melé', base.melee_damage, s.melee_damage, false],
      ['Velocidad', base.move_speed, s.move_speed, false],
      ['Dash (s)', base.dash_cooldown_s, s.dash_cooldown_s, true],
      ['Ventanas ×', 1, (this.p?.mods?.cadencia.window_scale ?? 1) * ventanaMult(), false],
      ['Espíritu ×', 1, (this.p?.mods?.spGainMult ?? 1) * eb.sp, false],
      ['Artes ×', 1, eb.artes, false]
    ];
    rows.forEach((r, i) => {
      const ry = y0 + 26 + i * 13;
      this.font(8); g.textAlign = 'left'; g.fillStyle = '#8d82ad'; g.fillText(r[0], 22, ry);
      g.textAlign = 'right';
      const better = r[3] ? r[2] < r[1] - 1e-9 : r[2] > r[1] + 1e-9;
      g.fillStyle = '#5a5470'; g.fillText(fmt(r[1]), 16 + w - 54, ry);
      g.fillStyle = better ? '#7ec96b' : '#e9e2f5'; g.fillText(fmt(r[2]), 16 + w - 8, ry);
    });
    // derecha: niveles de todo
    const x2 = 16 + w + 6;
    this._panel(g, x2, y0, w, hh, 'TODO SUBE DE NIVEL');
    let ry = y0 + 26;
    const need = xpParaNivel(GameState.nivel);
    this.font(8); g.textAlign = 'left';
    g.fillStyle = '#e9e2f5'; g.fillText('Pip — Nivel ' + GameState.nivel, x2 + 6, ry);
    g.fillStyle = '#2a2340'; g.fillRect(x2 + 6, ry + 4, w - 70, 4);
    g.fillStyle = '#7a5fd0'; g.fillRect(x2 + 6, ry + 4, (w - 70) * Math.min(1, GameState.xp / need), 4);
    this.font(7); g.textAlign = 'right'; g.fillStyle = '#8d82ad'; g.fillText(GameState.xp + '/' + need + ' XP', x2 + w - 8, ry + 8);
    ry += 22;
    const ths = DataDB.balance.xp;
    for (const h of DataDB.hechizos.hechizos) {
      const uso = GameState.usoHechizos[h.id] ?? 0;
      const next = ths.hechizo_niveles.find(x => uso < x);
      this.font(8); g.textAlign = 'left';
      g.fillStyle = RunState.tomos.includes(h.id) ? '#e9e2f5' : '#5a5470';
      g.fillText(h.nombre + '  Nv.' + nivelHechizo(h.id), x2 + 6, ry);
      this.font(7); g.textAlign = 'right'; g.fillStyle = '#8d82ad';
      g.fillText(next ? uso + '/' + next + ' usos' : 'MAESTRÍA', x2 + w - 8, ry);
      ry += 12;
    }
    ry += 5;
    for (const c of DataDB.compases.compases) {
      const uso = GameState.usoCompases[c.id] ?? 0;
      const next = ths.compas_niveles.find(x => uso < x);
      this.font(8); g.textAlign = 'left'; g.fillStyle = '#e9e2f5';
      g.fillText(c.nombre + '  Nv.' + compasNivel(c.id), x2 + 6, ry);
      this.font(7); g.textAlign = 'right'; g.fillStyle = '#8d82ad';
      g.fillText(next ? uso + '/' + next + ' perfectos' : 'MAESTRÍA', x2 + w - 8, ry);
      ry += 12;
    }
    const fs = RunState.floorStats;
    if (fs) {
      ry += 8;
      this.font(8); g.textAlign = 'left'; g.fillStyle = '#ffd54f'; g.fillText('ESTE PISO', x2 + 6, ry); ry += 11;
      this.font(7); g.fillStyle = '#8d82ad';
      g.fillText('Bajas ' + fs.kills + ' · Perfectos ' + fs.perfects + ' · Paradas ' + fs.parries, x2 + 6, ry); ry += 10;
      g.fillText('Corazones perdidos ' + fs.corazones + ' · Cámaras ' + fs.salas, x2 + 6, ry);
    }
  }
}
