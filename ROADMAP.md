# ROADMAP — Mistveil (base HTML+JS, reiniciado 2026-07-17)
Claude Code: trabaja las fases EN ORDEN salvo indicación de Daniel. No avances de fase sin cumplir su **criterio de aceptación**. Marca `[x]` al completar; añade subtareas si hace falta; **nunca borres tareas**. El plan nace del estado real del kit (ver ESTADO.md): el juego ya es jugable de punta a punta — esto es completar, robustecer y publicar.

## Fase R0 — Afinación (bugs y huecos detectados en el mapeo)
- [x] R0.1 Implementar `orbit_shoot` en tiempo real (la `polilla_del_polvo` hoy se queda quieta y muda; en El Redoble sí funciona). Orbitar al jugador + disparo con su `cadencia_s`.
- [x] R0.2 Aplicar `run.escalado_dano_por_piso` (definido en balance, hoy huérfano) al daño de contacto/proyectil enemigo por piso — o retirarlo del JSON si Daniel prefiere no escalar daño.
- [x] R0.3 `EventBus`: añadir `off(señal, fn)` y `once`; arreglar las sondas de `window.__mistveil` que hoy fugan listeners (`EventBus.off?.()` silencioso).
- [x] R0.4 `esfera.js`: deduplicar el switch de efectos de `esferaBonos()` (lógica repetida función+inline).
- [x] R0.5 Decidir y ejecutar sobre `buildFloor` (generador Isaac desconectado): borrarlo o rescatarlo como variante de piso (propuesta: borrar; la Torre es el juego).
- [x] R0.6 Asserts nuevos en `test_smoke.html`: orbit_shoot, escalado por piso, EventBus.off, y humo de Esfera (activar nodo adyacente, rechazar no-adyacente).
- [x] R0.7 (añadida a petición de Daniel) `tools/build_artifact.mjs`: empaqueta el juego en UN html autocontenido (módulos inlineados, JSON embebidos, fuente en base64) para publicarlo como página de pruebas con URL. Sirve también de base para el archivo único de itch.io (R5).

**Criterio:** smoke ampliado en verde; una run al piso 4+ no muestra enemigos inertes ni comportamientos rotos.

## Fase R1 — Reliquias completas (cerrar la cola `pendientes` de items)
- [x] R1.1 Sistema de **familiares** (compañeros que siguen/orbitan): `tinta_viva` (gota que dispara contigo) y `polilla_lunar` (orbital que bloquea proyectiles). Unificar con la mascota Tuerca donde tenga sentido.
- [x] R1.2 Sistema de **objetos activos** con recarga por salas + hueco propio en HUD y botón/gesto: `arena_del_tiempo` (slow-mo global 3 s, recarga 4 salas).
- [x] R1.3 `ojo_de_vidrio` (`reveal_map`: revela el minimapa del piso al cogerlo).
- [x] R1.4 `aceite_negro` (`damage_trail`: el dash deja rastro que daña).
- [x] R1.5 `paginas_perdidas` (`extra_choice`: el tesoro ofrece 2 reliquias, elige 1).
- [x] R1.6 Vaciar `mods.pendientes`: todo efecto de `items.json` interpretado o retirado del JSON. Asserts por item nuevo.

**Criterio:** los 20 items de items.json funcionan de verdad; dos runs con reliquias distintas se JUEGAN distinto.

## Fase R2 — Sellos elementales (la feature diseñada en `data/sellos.json`)
- [x] R2.1 Diseño de integración con Daniel: **decidido — botín de los jefes de bioma** (colección permanente; al cogerlo queda equipado y persiste entre runs).
- [x] R2.2 Motor: campo `sello` en RunState/GameState, rasgo pasivo data-driven, finisher de Cadencia teñido de elemento (interacción con `elementMult`).
- [x] R2.3 **Sello de Ascuas** (fuego) completo; después **Sello de Marea** (agua). Los otros 6 quedan `planificado` en el JSON.
- [x] R2.4 Resolver la colisión de nombres "sello" (Esfera/Santuario/elementales) al menos en comentarios y textos de UI.

- [ ] R2.5 (nueva) Selector de Sello en el menú de equipo cuando la colección tenga ≥2 (hoy: el último cogido queda equipado; cambio solo por hook de consola).

**Criterio:** equipar Ascuas cambia perceptiblemente una run (rasgo + finisher); Marea funcional.

## Fase R3 — Contenido de la Torre (pisos 4–9 con identidad propia)
- [x] R3.0 (adelantada; pase 1 de identidad visual) Partículas ambientales por bioma (motas doradas de cera / lluvia de tinta / chispas invertidas que suben), definidas en `biomas.json → ambiente`.
- [ ] R3.1 Sets de plantillas por bioma (`salas/`): hoy los 3 biomas reutilizan las 5 plantillas de piso1. Añadir ≥4 por bioma con sus obstáculos temáticos.
- [ ] R3.2 Jefes de bioma con patrones propios: usar de verdad la data de patrones (`lluvia_de_cera`, `anillo_de_llamas`, `charcos_ardientes`, `invocar_velones`…) que hoy es decorativa. 2 fases por jefe.
- [ ] R3.3 1–2 enemigos nuevos por bioma que expresen su mecánica (tinta, inversión…), definidos en JSON.
- [ ] R3.4 Victoria REAL en el piso 9: sustituir `ui.victoria_provisional` por secuencia final + resumen de partida (tiempo, bajas, semilla) y vuelta al pueblo con recompensa.
- [ ] R3.5 Elementos infrautilizados: al menos un enemigo/arte que use `luz`/`oscuridad`/`trueno` con sus oposiciones.

**Criterio:** una run completa 1→9 con jefes distinguibles y final digno; cada bioma se SIENTE distinto también en salas.

## Fase R4 — Refactor sostenible (sin cambiar comportamiento; smoke como red)
- [ ] R4.1 Trocear `main.js`: `js/scenes/` (un módulo por modo con `{enter, update, render}`), `js/render/` (dibujo 2.5D, HUD, minimapa), `js/signals.js` (los ~40 listeners centralizados; hoy hay señales suscritas en 2-3 sitios).
- [ ] R4.2 Extraer `AudioManager` de `state.js` a `js/audio.js`.
- [ ] R4.3 Retirar/condicionar los hooks `window.__mistveil` (flag de debug).
- [ ] R4.4 Smoke test tras cada extracción; cero cambios de gameplay.

**Criterio:** ningún archivo >1200 líneas; el smoke pasa idéntico antes/después. (Puede adelantarse si una fase anterior lo exige.)

## Fase R5 — Lanzamiento
- [ ] R5.1 Fuente VT323 servida en local (hoy Google Fonts: el juego depende de red).
- [ ] R5.2 PWA mínima: manifest + íconos + service worker de caché (jugable offline tras primera carga).
- [ ] R5.3 Export/import del guardado (el localStorage se pierde al limpiar el navegador).
- [ ] R5.4 QA móvil real: iOS Safari + Android Chrome, modo Una Mano, rendimiento (partículas/luz), háptica.
- [ ] R5.5 Página de itch.io: subida HTML, capturas, texto, **divulgación de IA generativa** marcada.
- [ ] R5.6 Ronda de balance final con Daniel usando F5 + playground (documento corto de valores tocados).

**Criterio:** un desconocido lo juega en su móvil desde itch.io sin instrucciones y sin conexión tras la primera carga.

---
### Aparcado (ideas sin fase; no borrar)
- Localización EN (textos ya centralizados en `textos_es.json`).
- Prioridad de fijado "último dañado" y cambio manual de objetivo en Una Mano (`docs/movil_una_mano.md` §futuras).
- Semilla visible/introducible por el jugador (daily runs).
- Más encuentros de El Redoble y ligas 6+.
