# ESTADO del proyecto
> Claude Code: actualiza este archivo al final de CADA sesión.

**Base actual:** kit HTML+JS de Daniel (reinicio 2026-07-17). El proyecto Godot anterior (Fases 0–3) vive solo en el historial de git.
**Fase actual:** R-Arte "La Hora Dorada" COMPLETA en pase 1 (A1–A5, las 5 tareas). Siguiente: feedback de Daniel sobre tonos; luego R3 (contenido de pisos 4–9) o pase 2 de arte.

## Qué hay implementado (resumen del mapeo, 4 informes en paralelo)
Juego jugable de punta a punta: Torre procedural vertical de 9 pisos con 3 biomas y semilla por run; Cadencia completa (compases, counter/parry, coyote, decay); parry activo; Ignición; 3 Artes de Tinta; El Redoble (combate por turnos CTB con QTE); Esfera del Reloj (31 nodos) + XP por desempeño; Santuario (8 nodos por Memoria); pueblo con 7 NPCs, contratos y bendiciones; tutorial de 7 fases; cámaras especiales (fundición, fusión, metrónomo, apuestas); minimapa; guardado localStorage schema 2; audio 100 % procedural con música generativa; 3 esquemas de input + mando + Una Mano móvil; smoke test de ~33 asserts (incluye 60 torres generadas).

## Huecos reales detectados (origen de la Fase R0/R1)
`orbit_shoot` sin código en tiempo real; `escalado_dano_por_piso` huérfano; EventBus sin `off` (sondas fugan); switch duplicado en `esferaBonos`; `buildFloor` (Isaac) desconectado; 6 items en cola `pendientes` (familiares, activo, reveal_map, damage_trail, extra_choice); `data/sellos.json` cargado pero sin código; jefes con patrones decorativos; victoria provisional; fuente por CDN.

## Registro de sesiones
| Fecha | Qué se hizo | Decisiones | Siguiente paso |
|---|---|---|---|
| 2026-07-17 | Reinicio desde el kit HTML+JS de Daniel (commit 8e49d38); verificado: 33/33 PASS y arranque en Chromium. Mapeo exhaustivo con 4 agentes; redactados CLAUDE.md, ROADMAP.md y ESTADO.md nuevos | Motor: vanilla JS sin build; la Torre vertical es el modo canónico; plan en fases R0–R5 (afinación → items → sellos → contenido → refactor → lanzamiento) | Daniel revisa el plan; después, tarea R0.1 |
| 2026-07-17 | Fase R0 completa: orbit_shoot real (polilla orbita+dispara, orbita_px en JSON), escalado de daño por piso vía danoMult, EventBus.off/once, esferaBonos deduplicado, buildFloor retirado; smoke 44/44 PASS. R0.7: build de un solo archivo y publicación como Artifact para que Daniel pruebe con URL | El bundle no toca el código fuente: reescribe imports a un registro por clausuras y embebe JSON+fuente; móvil autodetectado (equivale a movil.html) | Daniel juega la build; después R1.1 (familiares) |
| 2026-07-17 | Fase R1 completa: familiares (gota + polilla orbital), objetos activos con tecla X/botón táctil y recarga por salas (arena del tiempo = slow-mo del mundo), revelar mapa, rastro de aceite, doble pedestal; pendientes=∅ con assert; smoke 54/54. R3.0 adelantada: partículas ambientales por bioma. Hook __mistveil.item(id). Artifact republicado | El activo no tiene gesto en Una Mano (aparcado); tick del rastro a 0.5 s por el redondeo mín. 1 | Daniel: probar R1, elegir dirección gráfica y decidir diseño de Sellos (R2.1) |
| 2026-07-17 | R2 núcleo: sellos.js (colección+equipado persistentes, efectos máquina en sellos.json), Ascuas (dash ardiente + onda de fuego) y Marea (cura por SP + ola lenta) como botín de los jefes de Péndulos/Archivo; estado lento en Enemy; rombo en HUD. Bundle: botón ⛶ pantalla completa + guía iOS. Smoke 59/59; artifact republicado | Sellos = botín (decisión Daniel); iPhone sin API fullscreen → vía "Añadir a pantalla de inicio" | R2.5 (selector) o R3 según Daniel; falta su elección gráfica |
| 2026-07-17 | Dirección de arte aprobada por Daniel ("mágico, cálido, claro"): A1 grade Hora Dorada + A5 Ignición 3 actos; A2 biomas con grade/bruma/tints/atrezzo propios (péndulos colgantes, estanterías goteando, engranajes flotantes+reloj derretido); A3 halos por familia (campo familia en enemigos.json), anillo de telegrafía en windup, auras de élite/jefe | Hooks nuevos: __mistveil.sp(n) y .piso(n); bruma se rehornea al cambiar de bioma; sellos=botín decidido antes | A4 (VFX por habilidad) tras feedback; ajustar tonos con balance.arte/biomas.json vía F5 |
| 2026-07-17 | A4 pase 1: firmas visuales por habilidad (js/artes_fx.js) — nova=corona de tinta índigo, marea=medialuna de espuma turquesa, ascua=abanico de rescoldos que caen, parry=campana de cristal, Cadencia perfecta=numeral romano dorado que salta, dash=estela de engranajes espectrales. Smoke 62/62; artifact republicado | Efectos en world.artFx (spawn/update/draw); dibujados en la capa de mundo tras shockwaves | Falta feedback de Daniel sobre tonos; luego R3 (contenido de pisos) o A2/A3 pase 2 |

## Deuda técnica / notas
- `main.js` ~3100 líneas (god-file): trocear en R4; hasta entonces, cambios quirúrgicos.
- Colisión de nombre "sello" (Esfera / Santuario / elementales): aclarar en R2.4.
- Hooks `window.__mistveil` expuestos (retirar en R4.3/R5).
