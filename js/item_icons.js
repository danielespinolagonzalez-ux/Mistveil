// Iconos PROCEDURALES de reliquias — dibujados por código (regla 6: el arte se dibuja).
// Cada reliquia tiene una SILUETA distinta según su campo `icono_forma` en items.json.
// Se usa como icono real cuando NO hay sprite pintado (`icono_<id>`), tanto en el suelo
// como en el menú → toda reliquia, aunque sea nueva, se ve DIFERENTE sin pedir assets.
// drawItemIcon(g, forma, color, cx, cy, r): centrado en (cx,cy), radio ~r.

const HI = 'rgba(255,255,255,0.85)';

export function drawItemIcon(g, forma, color = '#e9e2f5', cx = 0, cy = 0, r = 5) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = color; g.strokeStyle = color; g.lineWidth = Math.max(1, r * 0.28); g.lineJoin = 'round'; g.lineCap = 'round';
  const dot = (x, y, s = r * 0.28) => { g.fillStyle = HI; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); g.fillStyle = color; };
  switch (forma) {
    case 'gota': { // gota de tinta: punta arriba, bulbo abajo
      g.beginPath(); g.moveTo(0, -r); g.quadraticCurveTo(r * 0.9, r * 0.15, 0, r); g.quadraticCurveTo(-r * 0.9, r * 0.15, 0, -r); g.fill();
      dot(-r * 0.25, r * 0.1, r * 0.22); break;
    }
    case 'doble_gota': { // dos gotas (tinta dividida)
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * r * 0.5, -r * 0.7); g.quadraticCurveTo(s * r * 0.5 + r * 0.5, r * 0.2, s * r * 0.5, r * 0.7); g.quadraticCurveTo(s * r * 0.5 - r * 0.5, r * 0.2, s * r * 0.5, -r * 0.7); g.fill(); }
      break;
    }
    case 'reloj': { // esfera de reloj con dos manecillas
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r * 0.7); g.moveTo(0, 0); g.lineTo(r * 0.5, r * 0.2); g.stroke();
      dot(0, 0, r * 0.18); break;
    }
    case 'engranaje': { // engranaje con dientes
      const n = 8; g.beginPath();
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, ro = r, ri = r * 0.7; g.rect(Math.cos(a) * ro - r * 0.14, Math.sin(a) * ro - r * 0.14, r * 0.28, r * 0.28); }
      g.fill();
      g.beginPath(); g.arc(0, 0, r * 0.62, 0, 7); g.fill();
      g.fillStyle = '#141120'; g.beginPath(); g.arc(0, 0, r * 0.26, 0, 7); g.fill(); break;
    }
    case 'pendulo': { // varilla + lenteja
      g.beginPath(); g.moveTo(0, -r); g.lineTo(0, r * 0.4); g.stroke();
      g.beginPath(); g.arc(0, r * 0.6, r * 0.42, 0, 7); g.fill(); dot(-r * 0.12, r * 0.5, r * 0.14); break;
    }
    case 'campana': { // campana con badajo
      g.beginPath(); g.moveTo(-r * 0.8, r * 0.5); g.quadraticCurveTo(-r * 0.7, -r, 0, -r); g.quadraticCurveTo(r * 0.7, -r, r * 0.8, r * 0.5); g.closePath(); g.fill();
      g.fillRect(-r, r * 0.5, r * 2, r * 0.28); dot(0, r * 0.9, r * 0.2); break;
    }
    case 'llama': { // llama
      g.beginPath(); g.moveTo(0, -r); g.quadraticCurveTo(r * 0.9, -r * 0.1, r * 0.55, r * 0.6); g.quadraticCurveTo(r * 0.3, r, 0, r); g.quadraticCurveTo(-r * 0.3, r, -r * 0.55, r * 0.6); g.quadraticCurveTo(-r * 0.9, -r * 0.1, 0, -r); g.fill();
      g.fillStyle = HI; g.beginPath(); g.moveTo(0, r * 0.1); g.quadraticCurveTo(r * 0.35, r * 0.3, 0, r * 0.8); g.quadraticCurveTo(-r * 0.35, r * 0.3, 0, r * 0.1); g.fill(); break;
    }
    case 'ojo': { // ojo de vidrio
      g.beginPath(); g.moveTo(-r, 0); g.quadraticCurveTo(0, -r * 0.85, r, 0); g.quadraticCurveTo(0, r * 0.85, -r, 0); g.fill();
      g.fillStyle = '#141120'; g.beginPath(); g.arc(0, 0, r * 0.4, 0, 7); g.fill(); dot(r * 0.1, -r * 0.1, r * 0.16); break;
    }
    case 'ala': { // ala de polilla
      g.beginPath(); g.moveTo(0, r * 0.6); g.quadraticCurveTo(-r, -r * 0.2, -r * 0.3, -r); g.quadraticCurveTo(r * 0.2, -r * 0.3, 0, r * 0.6); g.fill();
      g.save(); g.scale(-1, 1); g.beginPath(); g.moveTo(0, r * 0.6); g.quadraticCurveTo(-r, -r * 0.2, -r * 0.3, -r); g.quadraticCurveTo(r * 0.2, -r * 0.3, 0, r * 0.6); g.fill(); g.restore();
      dot(0, -r * 0.1, r * 0.16); break;
    }
    case 'corazon': { // corazón (de lata)
      g.beginPath(); g.moveTo(0, r * 0.7); g.lineTo(-r, -r * 0.15); g.lineTo(-r, -r * 0.45); g.lineTo(-r * 0.5, -r * 0.8); g.lineTo(0, -r * 0.4);
      g.lineTo(r * 0.5, -r * 0.8); g.lineTo(r, -r * 0.45); g.lineTo(r, -r * 0.15); g.closePath(); g.fill(); dot(-r * 0.35, -r * 0.3, r * 0.16); break;
    }
    case 'luna': { // luna creciente
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      g.fillStyle = '#141120'; g.beginPath(); g.arc(r * 0.4, -r * 0.15, r * 0.85, 0, 7); g.fill(); break;
    }
    case 'peso': { // pesa (lágrima pesada)
      g.beginPath(); g.moveTo(-r * 0.5, -r * 0.7); g.lineTo(r * 0.5, -r * 0.7); g.lineTo(r, r * 0.8); g.lineTo(-r, r * 0.8); g.closePath(); g.fill();
      g.fillStyle = '#141120'; g.font; g.fillRect(-r * 0.28, -r * 0.25, r * 0.56, r * 0.5); break;
    }
    case 'resorte': { // resorte / segundero suelto (zigzag)
      g.beginPath(); g.moveTo(-r * 0.7, -r); for (let i = 0; i < 4; i++) { g.lineTo((i % 2 ? -r * 0.7 : r * 0.7), -r + (i + 1) * r * 0.5); } g.stroke(); break;
    }
    case 'bateria': { // batería de almas
      g.fillRect(-r * 0.7, -r * 0.85, r * 1.4, r * 1.7); g.fillRect(-r * 0.25, -r * 1.1, r * 0.5, r * 0.25);
      g.fillStyle = HI; g.beginPath(); g.moveTo(r * 0.1, -r * 0.5); g.lineTo(-r * 0.3, r * 0.05); g.lineTo(r * 0.02, r * 0.05); g.lineTo(-r * 0.15, r * 0.6); g.lineTo(r * 0.35, -r * 0.1); g.lineTo(r * 0.02, -r * 0.1); g.closePath(); g.fill(); break;
    }
    case 'frasco': { // frasco / vial
      g.beginPath(); g.moveTo(-r * 0.3, -r); g.lineTo(r * 0.3, -r); g.lineTo(r * 0.3, -r * 0.3); g.lineTo(r * 0.7, r * 0.8); g.lineTo(-r * 0.7, r * 0.8); g.lineTo(-r * 0.3, -r * 0.3); g.closePath(); g.fill();
      g.fillStyle = HI; g.fillRect(-r * 0.5, r * 0.1, r, r * 0.5); break;
    }
    case 'espejo': { // espejo / lágrimas espejo (rombo partido)
      g.beginPath(); g.moveTo(0, -r); g.lineTo(r, 0); g.lineTo(0, r); g.closePath(); g.fill();
      g.globalAlpha = 0.5; g.beginPath(); g.moveTo(0, -r); g.lineTo(-r, 0); g.lineTo(0, r); g.closePath(); g.fill(); g.globalAlpha = 1; break;
    }
    case 'pluma': { // pluma / páginas
      g.beginPath(); g.moveTo(r * 0.6, -r); g.quadraticCurveTo(-r, -r * 0.2, -r * 0.5, r); g.quadraticCurveTo(r * 0.2, r * 0.1, r * 0.6, -r); g.fill();
      g.strokeStyle = '#141120'; g.lineWidth = 1; g.beginPath(); g.moveTo(r * 0.55, -r * 0.85); g.lineTo(-r * 0.45, r * 0.9); g.stroke(); break;
    }
    case 'cuerda': { // cuerda / resorte enrollado (espiral)
      g.beginPath(); for (let a = 0; a < Math.PI * 5; a += 0.3) { const rr = r * (0.15 + a / (Math.PI * 5) * 0.85); const x = Math.cos(a) * rr, y = Math.sin(a) * rr; a === 0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); break;
    }
    case 'sello': { // sello agrietado (rombo con grieta)
      g.beginPath(); g.moveTo(0, -r); g.lineTo(r, 0); g.lineTo(0, r); g.lineTo(-r, 0); g.closePath(); g.fill();
      g.strokeStyle = '#141120'; g.lineWidth = 1; g.beginPath(); g.moveTo(-r * 0.2, -r * 0.6); g.lineTo(r * 0.15, 0); g.lineTo(-r * 0.15, r * 0.6); g.stroke(); break;
    }
    default: { // rombo por defecto
      g.beginPath(); g.moveTo(0, -r); g.lineTo(r, 0); g.lineTo(0, r); g.lineTo(-r, 0); g.closePath(); g.fill();
      dot(0, 0, r * 0.22); break;
    }
  }
  g.restore();
}
