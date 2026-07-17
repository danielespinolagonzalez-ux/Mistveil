# MISTVEIL: El Reloj de las Almas — Guía para Claude Code

## Qué es este proyecto
Roguelite de **relojería y ritmo** en **HTML+JS puro** (ES modules, canvas 2D con render 2.5D, sin build ni dependencias). Pip, un autómata de alma prestada, desciende por una Torre procedural de 9 pisos donde el combate se marca a compás.

Sistemas-firma (todos ya implementados):
- **Cadencia**: combos de ritmo con anillo de sincronía; única fuente de SP. Tres **compases** (posturas) que suben de nivel con el uso.
- **Parada** (parry activo y QTE del anillo rojo), **Ignición** (overdrive con SP lleno), **Artes de Tinta** (hechizos elementales).
- **El Redoble** (`reloj_batalla.js`): combate por turnos CTB estilo FFX con QTE rítmicos, en el pueblo.
- **Esfera del Reloj** (estilo tablero de esferas FFX) + Santuario (Memoria) + XP por desempeño de piso: TODO sube de nivel.
- **Torre vertical procedural** con 3 biomas, cámaras especiales, pueblo-hub con 7 NPCs, tutorial de 7 fases, modo **Una Mano** móvil.

## Ejecutar y probar
- Servir por HTTP (los módulos no cargan por `file://`): `python3 -m http.server 8000` desde la raíz.
  - `index.html` escritorio · `movil.html` móvil (fuerza horizontal, `MISTVEIL_MOBILE`) · `_diag.html` diagnóstico de carga.
- **Tests**: `tests/test_smoke.html` (≈33 asserts, incluye generar 60 torres). El título de la página acaba en `PASS`/`FAIL` y consola imprime `SMOKE: ...`. `tests/cadencia_playground.html` = tuning de Cadencia con sliders.
- **Headless (entorno remoto)**: Chromium en `/opt/pw-browsers/chromium`; instalar Playwright en el scratchpad (`npm i playwright --no-save`) y automatizar con un script que abra el test y cuente `.pass/.fail`. El contenedor es efímero: reinstalar si falta.
- **F5 dentro del juego** recarga todos los `data/*.json` en caliente (se intercepta la tecla; no recarga la página).
- Tras CUALQUIER cambio: smoke test verde antes de commit. Cada sistema nuevo añade sus asserts.

## Arquitectura (obligatoria)
| Módulo | Rol |
|---|---|
| `js/main.js` (~3100 líneas) | Bucle, máquina de modos (`title/pueblo/santuario/batalla/menu/balance/metronomo/upgrade/paused/play/dead/victory`), colisiones, TODO el render 2.5D, HUD, ~40 listeners del bus. **God-file: tocar con bisturí.** |
| `js/event_bus.js` | Pub/sub global. **SOLO señales, sin lógica. Nombres en pasado** (`enemy_died`). Ojo: no tiene `off` (deuda). |
| `js/data_db.js` | Carga y valida los 13 `data/*.json` (`fetch` sin caché). Solo lectura. `reload()` → señal `data_reloaded`. |
| `js/state.js` | `GameState` (meta persistente), `RunState` (run), `SaveManager` (localStorage `mistveil_save`, schema 2), `AudioManager` (WebAudio 100% procedural: beeps, campanas y música generativa; sin ficheros de audio). |
| `js/input.js` | Input Map por ACCIONES (jamás teclas sueltas fuera de aquí). Esquemas: `raton`, `flechas`, `una_mano`. Mando twin-stick, táctil, gestos (flick=dash, agitar=Ignición). |
| `js/entities.js` | `Player`, `Enemy` (comportamientos data-driven), `TearPool`/`BulletPool`. |
| `js/cadencia.js` | El sistema de ritmo. `computeQuality()` es función pura y testeable. |
| `js/rooms.js` | `buildTower(piso, semilla)` = generador REAL (columna vertical + alcobas). `buildFloor` (Isaac) existe pero está desconectado. Anti-softlock `carveUnreachable`. |
| `js/spells.js`, `js/items.js`, `js/esfera.js`, `js/progresion.js` | Artes, motor de efectos de items, Esfera del Reloj, desbloqueos por nivel. |
| `js/reloj_batalla.js`, `js/pueblo.js`, `js/tutorial.js`, `js/menu_equipo.js`, `js/fx.js` | El Redoble, hub, tutorial, menú Tab, partículas/shake. |

### Reglas de oro
1. **Los sistemas NUNCA se llaman directamente entre sí**: comunicación por señales del `EventBus` (nombres en pasado). Dependencias puntuales se inyectan (patrón `cad.getSolids = ...` de main).
2. **CERO números mágicos de gameplay**: todo valor de balance vive en `data/balance.json` y se lee EN EL PUNTO DE USO vía `DataDB.balance.x?.y ?? defecto` (tolerante a JSON incompleto, compatible con F5). Geometría de render y colores placeholder pueden ser `const`.
3. **Data-driven**: enemigos, hechizos, compases, items, nodos de Esfera/Santuario, biomas y plantillas viven en `data/*.json`; el código los interpreta. Contenido nuevo no debería exigir código nuevo salvo mecánicas inéditas.
4. **Input solo por acciones** de `Input` (`justPressed('parry')`), nunca `keydown` sueltos fuera de `input.js`.
5. **Idiomas**: motor/plataforma en inglés (`Player`, `update`, claves físicas como `move_speed`); dominio del juego y TODOS los comentarios en **español** (`cera_andante`, `gainMemoria`). Textos visibles en `data/textos_es.json` (`DataDB.texto('clave')`).
6. **Sin dependencias, sin build, sin binarios**: vanilla JS; el arte se dibuja por código y el audio se sintetiza. Solo Daniel añade assets (screenshots aparte). Nada de npm en el juego (Playwright solo como herramienta de test externa).
7. **Persistencia versionada**: cambios de guardado suben `schema` en `SaveManager` con migración defensiva campo a campo.

## Flujo de trabajo (cada sesión)
1. Lee `ESTADO.md` (dónde quedamos) y `ROADMAP.md` (qué toca). Trabaja **una tarea a la vez**; nunca borres tareas, añade subtareas.
2. Al terminar: smoke test headless verde → marca checkbox → actualiza `ESTADO.md` → commit convencional (`feat:`/`fix:`/`refactor:`) → push a la rama de trabajo.
3. El *game feel* lo valida Daniel jugando (ideal: build en itch.io o servidor local). Ante bifurcaciones de diseño, preguntar; en lo demás, autonomía.

## Trampas conocidas
- `main.js` concentra bucle+escenas+render: cambios grandes ahí piden trocear antes (ver ROADMAP fase de refactor).
- `EventBus` no tiene `off`: no crear suscripciones temporales hasta añadirlo; las sondas de `window.__mistveil` lo asumen y fugan listeners.
- `buildFloor` (layout Isaac) es código muerto funcional: no confundir con `buildTower`, que es el real.
- `data/sellos.json` se carga pero NADIE lo lee (feature planificada). Tres cosas distintas comparten el nombre "sello": nodos-puente de la Esfera, desbloqueo `sello_de_marea` del Santuario y los sellos elementales de ese JSON.
- `orbit_shoot` (polilla_del_polvo) solo existe en El Redoble; en tiempo real cae al default y se queda quieta.
- `index.html`/`movil.html` cargan la fuente VT323 desde Google Fonts (dependencia de red).
- Hooks de depuración en `window.__mistveil` (sonda, testCad, step, xp…): útiles en desarrollo, retirarlos en release.

## Contexto de Daniel (el humano)
Daniel no es programador profesional: explica las decisiones técnicas importantes en 1–2 frases en español cuando las tomes. Prefiere avance autónomo dentro del ROADMAP; pregunta solo ante bifurcaciones de diseño o cosas que afecten al game feel. Prueba las builds en el móvil: el modo Una Mano es prioridad de primera clase, no un extra.
