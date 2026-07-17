# ESTADO del proyecto
> Claude Code: actualiza este archivo al final de CADA sesión.

**Base actual:** kit HTML+JS de Daniel (reinicio 2026-07-17). El proyecto Godot anterior (Fases 0–3) vive solo en el historial de git.
**Fase actual:** R0 COMPLETA (pendiente del visto bueno de Daniel jugando la build publicada). Siguiente: R1 (reliquias).

## Qué hay implementado (resumen del mapeo, 4 informes en paralelo)
Juego jugable de punta a punta: Torre procedural vertical de 9 pisos con 3 biomas y semilla por run; Cadencia completa (compases, counter/parry, coyote, decay); parry activo; Ignición; 3 Artes de Tinta; El Redoble (combate por turnos CTB con QTE); Esfera del Reloj (31 nodos) + XP por desempeño; Santuario (8 nodos por Memoria); pueblo con 7 NPCs, contratos y bendiciones; tutorial de 7 fases; cámaras especiales (fundición, fusión, metrónomo, apuestas); minimapa; guardado localStorage schema 2; audio 100 % procedural con música generativa; 3 esquemas de input + mando + Una Mano móvil; smoke test de ~33 asserts (incluye 60 torres generadas).

## Huecos reales detectados (origen de la Fase R0/R1)
`orbit_shoot` sin código en tiempo real; `escalado_dano_por_piso` huérfano; EventBus sin `off` (sondas fugan); switch duplicado en `esferaBonos`; `buildFloor` (Isaac) desconectado; 6 items en cola `pendientes` (familiares, activo, reveal_map, damage_trail, extra_choice); `data/sellos.json` cargado pero sin código; jefes con patrones decorativos; victoria provisional; fuente por CDN.

## Registro de sesiones
| Fecha | Qué se hizo | Decisiones | Siguiente paso |
|---|---|---|---|
| 2026-07-17 | Reinicio desde el kit HTML+JS de Daniel (commit 8e49d38); verificado: 33/33 PASS y arranque en Chromium. Mapeo exhaustivo con 4 agentes; redactados CLAUDE.md, ROADMAP.md y ESTADO.md nuevos | Motor: vanilla JS sin build; la Torre vertical es el modo canónico; plan en fases R0–R5 (afinación → items → sellos → contenido → refactor → lanzamiento) | Daniel revisa el plan; después, tarea R0.1 |
| 2026-07-17 | Fase R0 completa: orbit_shoot real (polilla orbita+dispara, orbita_px en JSON), escalado de daño por piso vía danoMult, EventBus.off/once, esferaBonos deduplicado, buildFloor retirado; smoke 44/44 PASS. R0.7: build de un solo archivo y publicación como Artifact para que Daniel pruebe con URL | El bundle no toca el código fuente: reescribe imports a un registro por clausuras y embebe JSON+fuente; móvil autodetectado (equivale a movil.html) | Daniel juega la build; después R1.1 (familiares) |

## Deuda técnica / notas
- `main.js` ~3100 líneas (god-file): trocear en R4; hasta entonces, cambios quirúrgicos.
- Colisión de nombre "sello" (Esfera / Santuario / elementales): aclarar en R2.4.
- Hooks `window.__mistveil` expuestos (retirar en R4.3/R5).
