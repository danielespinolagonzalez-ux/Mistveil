# MISTVEIL: El Reloj de las Almas

Roguelite de relojería y ritmo. Un aprendiz de relojero desciende por una torre de
cámaras procedurales donde el combate se marca a compás: la **Cadencia** (combos de
ritmo), paradas al anillo rojo, Artes de Tinta y una **Esfera del Reloj** de progresión
permanente inspirada en el tablero de esferas de FFX.

## Jugar

Es HTML+JS puro (ES modules), sin build. Necesita servirse por HTTP (los módulos no
cargan por `file://`):

```bash
cd mistveil
python3 -m http.server 8000
# → http://localhost:8000            (escritorio)
# → http://localhost:8000/movil.html (móvil, pantalla completa vertical)
```

## Controles

| Acción | Teclado+ratón | Táctil |
|---|---|---|
| Mover | WASD / flechas | stick izquierdo (o toda la pantalla en Una Mano) |
| Disparar | ratón | stick derecho / auto-disparo (Una Mano) |
| Cadencia (combo de ritmo) | clic dcho / Espacio | tap |
| Parada | E | PAR / tap al anillo rojo |
| Dash | Shift | flick |
| Arte de Tinta | Q | botón Q / mantener pulsado |
| Ignición | F | agitar el móvil / doble-tap |
| Equipo y Esfera del Reloj | Tab | ≡ |

Modo **Una Mano** (móvil): pausa → "✋ MODO UNA MANO".

## Estructura

- `index.html` / `movil.html` — arranque escritorio / móvil
- `js/` — motor y sistemas (main, cadencia, entities, rooms, esfera, tutorial,
  reloj_batalla = combate por turnos de El Redoble, menu_equipo, pueblo…)
- `data/` — TODO el balance en JSON editable en caliente (F5 recarga datos):
  enemigos, hechizos, compases, esfera, biomas, progresión, salas
- `docs/` — diseño (p. ej. `movil_una_mano.md`)

## Licencia

Proyecto personal; assets y código generados con ayuda de Claude.
