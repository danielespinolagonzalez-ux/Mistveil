# ROADMAP — Mistveil (base HTML+JS, reiniciado 2026-07-17)
Claude Code: trabaja las fases EN ORDEN salvo indicación de Daniel. No avances de fase sin cumplir su **criterio de aceptación**. Marca `[x]` al completar; añade subtareas si hace falta; **nunca borres tareas**. El plan nace del estado real del kit (ver ESTADO.md): el juego ya es jugable de punta a punta — esto es completar, robustecer y publicar.

## AUDITORÍA 2026-07 — Reordenación por fases A–E (petición de Daniel)
Auditoría por 9 analistas comparando Mistveil con el género (Hades, Dead Cells, Isaac, Gungeon, Crypt of the NecroDancer, Hi-Fi Rush, Metal: Hellsinger, Vampire Survivors, Slay the Spire, roguelites móviles). **Informe completo en [`docs/auditoria_2026-07.md`](docs/auditoria_2026-07.md).** Notas de madurez: combate 8/10 · identidad rítmica cumplida 4/10 · build/endgame 4/10 · narrativa 3/10 · producto móvil 5/10 · UX/opciones 3/10. Hilo transversal: *casi toda carencia es UI/contenido/reglas sobre motor ya construido.* Estas fases **reordenan por impacto**; se cruzan con las R-tareas de abajo (no se borra nada).

### Fase A — Cerrar la promesa de RITMO (lo que más diferencia) · ✅ COMPLETA (A1–A5)
- [x] A1 Reloj de beat global en `AudioManager` (`beatClock()`) con BPM por pista medido offline (`data/musica.json`); latido visual del HUD (marco SP + pip del compás) y halo del anillo de Cadencia al pulso; tic-tac ambiental callado bajo pista real. **Pendiente por diseño** (riesgo sobre el feel testeado): anclar `ring_contract_ms`/ventanas de Cadencia a subdivisiones del beat (A4 ambicioso, a validar con Daniel jugando).
- [x] A2 SFX de golpe **en escala** que ascienden con `hitIndex` (arpegio, `cadencia.js` con `{pitch}`) + variación de tono ±semitonos en tear (`entities.js`, `_playSample` con `playbackRate`).
- [x] A3 **Juice del disparo**: micro-hit-stop + chispazo direccional teñido por elemento en el impacto de la lágrima + shake; hit-stop extra al rematar (`main.js` impacto de tear).
- [x] A4 Latido visual del HUD al pulso (hecho junto a A1: marco SP + pip del compás + halo del anillo de Cadencia, alimentados por `beatInfo`/`beatClock`).
- [x] A5 Música reactiva a la racha: capa procedural de campanas (`grooveBell`) enganchada al `beatClock` (suena EN el beat), intensidad = `grooveFrac` (perfects/racha) con octava extra en buff; sub-bus propio bajo la música (respeta volumen, no pisa la pista); data-driven (`balance.musica_reactiva`), se apaga sola al decaer el groove.

**Criterio A:** golpear a compás con la música se nota (audio + recompensa); el disparo impacta; el HUD late.

### Fase B — Plataforma móvil comercializable (retención y justicia) · prerrequisito de lanzar
- [x] B1 **Serializar `RunState`** (piso/oro/SP/items/compás/posición + hp/maxHp + estado de salas; la semilla regenera la topología) → `SaveManager.saveRun/loadRun`, autosave en puntos seguros, botón REANUDAR en el título. Guardar y reanudar a mitad, probado recarga→reanudar.
- [x] B2 **Pantalla de Opciones + Pausa** (modo `opciones` desde Pausa): sliders de volumen música/SFX, toggle de control táctil, y "Asistencia de ritmo" reusando `escala_ventanas`/`ventanaMult`. Navegable por toque/mando/teclado.
- [x] B3 **Calibración de latencia** (slider ±120 ms en Opciones que desplaza la ventana en el punto de uso: `computeQuality(this.t - lat, …)`, sin tocar la función pura).
- [ ] B4 Export/import de guardado por código copiar/pegar contra el desalojo ITP de iOS (carencia #9, bajo; enlaza R5.3).
- [ ] B5 Acumulador de **paso fijo** para la lógica de Cadencia + timestamp de input (carencia #11).
- [x] B6 **PWA** (manifest.json + service worker cache-first + iconos de Pip 192/512/maskable/apple-touch) → instalable y jugable OFFLINE tras la primera carga (probado con red cortada). Fuente ya local (Gelica, ver R5.1). **Safe-area/notch**: los botones táctiles pegados a los bordes se apartan de la muesca y del indicador de inicio del iPhone (sonda DOM de `env(safe-area-inset-*)` → coords virtuales, descontando el letterbox); sin muesca no se mueven (regresión de escritorio verde).

**Criterio B:** un desconocido termina una run a ratos en su iPhone sin perder progreso y con el ritmo justo.

### Fase C — Profundidad de build y endgame (rejugabilidad)
- [ ] C1 Ampliar a ~50-60 reliquias (sobre todo JSON) que modulen ritmo/compás/SP, no solo +daño; algunas que escalen con desempeño rítmico (payoff de build) (carencias #5 y #10).
- [x] C2 Pedestal de tesoro **"elige 1 de 2-3"**: el tesoro SIEMPRE ofrece 2 reliquias (3 con Páginas perdidas); coger una desvanece las demás. Reusa `rollItem`; persistencia B1 (pedestal3). Misma cantidad de botín, con decisión de build.
- [x] C3 **Motor de conjuntos/set-bonus** por etiqueta (`items.conjuntos`): reunir N reliquias de un mismo tag (3 cadencia/lágrimas/ignición/movilidad, 4 stats) desbloquea un efecto de conjunto (reusa el formato de efectos de item). Detección una-vez-por-umbral, flash al activar. `aplicarEfectos` factorizado para items Y conjuntos.
- [ ] C4 **Sistema Heat** data-driven (`data/pactos.json`): condiciones apilables con niveles y +Memoria por tramo, reusando el andamio de Cuerda Tensa (carencia #6, crítica).
- [ ] C5 Activar los 6 sellos restantes con selector (cruza R2.5); rangos múltiples en el Santuario y un sumidero tardío para engranajes/Memoria.

**Criterio C:** dos runs se juegan distinto, la build "despega", y "ya gané" pasa a "gané a nivel N, ahora N+1".

### Fase D — Ancho de contenido de la Torre (cruza R3)
- [ ] D1 ≥4 plantillas de sala **por bioma** con obstáculos que incorporen su mecánica de zona (= R3.1, carencia #7).
- [ ] D2 Modificador de **elite/campeón** de spawn que reusa los 19 enemigos (más HP/aura/recompensa; "elite afinado" que exija combo perfecto) (carencia #13, bajo).
- [ ] D3 Filtrar el pool de spawn por el campo `pisos` existente para escalonar debuts al descender (carencia #13, bajo).
- [ ] D4 Reservar el jefe de raid al último piso del mundo (3/6/9/12) + minijefes intermedios; jefes por fase (= R3.2).
- [ ] D5 1-2 salas-evento nuevas alineadas con Cadencia (arena contra reloj; secreta que premia la sincronía).

**Criterio D:** una run de 12 pisos no empieza a repetirse hacia el piso 5-6.

### Fase E — Alma: narrativa, códice y dirección visual (cruza R3.4/R4.0)
- [ ] E1 Extraer `js/escenas.js` (escena pintada) ANTES de escribir (= R4.0) y mover el guion de `pueblo.js` a `textos_es.json` (saldar la deuda de la regla 5).
- [ ] E2 Escribir el arco del "alma prestada" repartido en los 3 biomas + intro de encuadre y victoria REAL (= R3.4) que pague el misterio (carencia #12).
- [ ] E3 2 líneas por jefe (intro + derrota) y flavor-lore a enemigos/items; caracterizar rivales del Redoble (carencia #12, alto retorno por poco texto).
- [ ] E4 **Códice/bestiario** diegético en la pestaña CRÓNICA existente + tooltips/hold-press para items y siglas del HUD (carencia #14).
- [ ] E5 Post-proceso barato en canvas (bloom en perfect/Ignición, viñeta con tinte por bioma) + toggle de screenshake/flash y `prefers-reduced-motion`; diferenciar el anillo de contraataque por forma/glifo, no solo color (carencia #15).
- [ ] E6 Dailies locales (semilla derivada de la fecha + puntuación) e itch.io con divulgación de IA (cruza R5.5).

**Criterio E:** el cimiento temático tiene edificio; el frame se siente "dirigido"; hay accesibilidad de release.

---

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
- [ ] R3.2 Jefes de bioma con patrones propios: usar de verdad la data de patrones (`lluvia_de_cera`, `anillo_de_llamas`, `charcos_ardientes`, `invocar_velones`…) que hoy es decorativa. 2 fases por jefe. **REPLANTEO (auditoría IA):** las "fases" NO se animan por fotogramas (la IA no es consistente entre frames) — cada jefe = 2-3 PIEZAS de estado (íntegro/furioso/roto) que el motor intercambia + patrones y FX por código.
- [ ] R3.3 1–2 enemigos nuevos por bioma que expresen su mecánica (tinta, inversión…), definidos en JSON.
- [ ] R3.4 Victoria REAL en el piso 9: sustituir `ui.victoria_provisional` por secuencia final + resumen de partida (tiempo, bajas, semilla) y vuelta al pueblo con recompensa. **REPLANTEO:** hacerla como ESCENA PINTADA (técnica del pueblo: telón + Pip + retrato + texto) — la narrativa ya es barata.
- [ ] R3.5 Elementos infrautilizados: al menos un enemigo/arte que use `luz`/`oscuridad`/`trueno` con sus oposiciones. **REPLANTEO:** conceptualizarlos como "mecanismo de reloj con una idea clara" (silueta única = lo que la IA borda), sin conceptos que exijan multitud/texto/dependencia entre assets.
- [ ] R3.6 (nueva, auditoría IA) **Viñetas de entrada a bioma** (un plano pintado + 2-3 líneas con retrato) — dar alma con la técnica del pueblo, ahora que es asequible. Opcional según decisión de ambición de Daniel.

**Criterio:** una run completa 1→9 con jefes distinguibles y final digno; cada bioma se SIENTE distinto también en salas.

## Fase R-Arte — Dirección "La Hora Dorada" (encargo de Daniel: mágico, cálido, claro)
Se intercala con R3; los valores viven en balance.arte / biomas.json (F5).
- [x] A1 Etalonaje global cálido ("Hora Dorada"): overlay ámbar + lift de sombras + bruma perlada, data-driven y con override por bioma. PASE 1 — pendiente de afinar con Daniel.
- [x] A5 Ignición épica en 3 actos: estallido (triple onda + fogonazo + 3 campanadas ascendentes + hit-stop), arder (aura, chispas orbitales, caldeo dorado pulsante), serenarse (lluvia de brasas + campana grave). PASE 1.
- [x] A2 (pase 1) Paleta e identidad completa por bioma: Péndulos = ámbar y miel; Archivo = celeste y pergamino con tinta índigo; Invertida = crepúsculo lavanda y cobre. Props de fondo por código (péndulos, estanterías, relojes derretidos).
- [x] A3 (pase 1) Enemigos diferenciados: familias de material (cera cálida y llama · latón bruñido · polvo frío), siluetas más marcadas, animación idle propia por enemigo, rim-light y auras de élite.
- [x] A4 (pase 1) Lenguaje visual único por habilidad: nova = corona de tinta índigo; marea = medialuna de espuma turquesa; ascua = abanico de rescoldos que caen; Cadencia con estética de esfera de reloj (numerales que saltan en la perfecta); parry = campana de cristal; dash = estela de engranajes.

**Criterio:** capturas de los 3 biomas se distinguen a golpe de vista; cada habilidad se reconoce sin leer texto; la Ignición "se siente potente, fuerte, épica" (palabras de Daniel).

## Fase R-Assets — Arte pintado por IA (decisión Daniel 2026-07-18: rompe la regla "cero assets")
Estilo: romanticismo pictórico + fantasía FFIX/FFXIV. Daniel genera con ChatGPT según `docs/encargo_arte.md`; Claude trocea e integra SIEMPRE con fallback al dibujo por código.
> **REPLANTEO de la auditoría IA (`docs/auditoria_diseno.md`), 2026-07-18:**
> - AS-N1 **Biblia de estilo:** set fijo de 3-4 referencias (Pip + un enemigo + una textura) que se adjunta/usa como entrada i2i en cada generación; control A/B al abrir cada lote (evita deriva de estilo sin el `create_style`).
> - AS-N2 **Peso de fondos (NO hay límite duro — corrección de Daniel).** Ambición ALTO: pueblo ✅, victoria, Redoble, cámaras y 1 plano por bioma. Fondos en **JPEG** (opacos, ~1/5 del peso, siempre mejor para carga/RAM) + **carga diferida por bioma** cuando el arte crezca (respuesta correcta a "arte sin límite"; ver R5.7). Salas de la Torre procedurales por gameplay.
> - AS-N3 **El Redoble pintado:** telón + sprites de enemigo + retratos (técnica del pueblo). Mayor subida de calidad barata pendiente.
> - AS-N4 **Poses extra de Pip** (vida barata, lo pidió Daniel): celebrar / herido / canalizar / sentarse. Piezas + hooks de código; NADA de sprite sheets.
> - AS-N5 **Vecinos pintados como estilo:** los figurantes que la IA cuela en escenas = ambiente (solo lo interactuable es sprite). Intención, no accidente.
- [x] AS0 Encargo completo redactado: listado de ~55 assets con prompts exactos, llave de estilo, plantillas y orden de producción (`docs/encargo_arte.md`).
- [x] AS1 `tools/slice_assets.mjs`: troceado automático con 3 estrategias auto-detectadas (alfa real / damero pintado / fondo degradado por crecimiento de región), recorte, reducción por mitades a 2× y red de seguridad anti-"sprite comido"; `assets/sprites/manifest.json`.
- [x] AS2 Cargador `js/sprites.js` con fallback por-código; en el bundle los PNG van incrustados en base64 (`__MISTVEIL_SPRITES__`).
- [ ] AS3 Integración del lote de validación — HECHO Pip (idle/paso/ataque, volteo por dirección, hereda embestida/squash del motor); FALTAN 3 enemigos + suelo/muro Péndulos + iconos reliquias (esperando imágenes de Daniel).
  - [ ] AS3b Campo `sprite` en `data/enemigos.json` + integración en `drawEnemy` cuando lleguen los enemigos.
- [ ] AS4 Producción por lotes vía Recraft MCP según `docs/pipeline_recraft.md` y `tools/encargo.json` (lotes A→I con aprobación de Daniel entre lotes; ~250 créditos estimados).
  - [ ] AS4a Reintentar `create_style` (500 el 2026-07-18); si funciona, control A/B con un asset aprobado y adoptar `style_id`.
  - [ ] AS4b Modo multi-recorte por celdas en el troceador para las hojas de iconos.
  - [ ] AS4c Integración de texturas de suelo/muro como patrón en `room.canvas` (camino distinto al de sprites).
- [ ] AS5 Peso del bundle vigilado (<8 MB) y divulgación de IA en itch.io (enlaza con R5.5).

**Criterio:** el piso 1 se ve "vestido" con el estilo de la llave; quitar cualquier PNG no rompe nada (fallback); Daniel aprueba el look en su iPhone.

## Mejoras de game feel (a petición de Daniel: "combate muy dinámico")
Valores en balance.cadencia (F5).
- [x] G1 Esquiva en Cadencia: el dash ya NO rompe el combo. Mientras dura el dash (+ gracia `dash_grace_s`) el anillo se CONGELA y el rango de mantener objetivo se ensancha (`dash_range_mult`): esquivas balas sin perder el ritmo. Anillo cian punteado como aviso.
- [x] G2 Encadenar al matar (`chain_on_kill`): si el objetivo cae a mitad de combo y hay otro enemigo a rango, la Cadencia salta a él en vez de cortarse — flow contra grupos.
- [x] G3 El ritmo premia la movilidad: cada golpe perfecto recorta el enfriamiento del dash (`perfect_dash_refund_s`); `move_damp_in_combo` subido 0.35→0.5 (más libertad para reposicionar).
- [x] G4 I-frames breves en el lunge de cada golpe: al CONECTAR (perfect > good, fallar no da nada) Pip es intocable un instante — atacar es también esquivar. Halo dorado como aviso. (Balance: `lunge_iframes_s`, `lunge_iframes_perfect_s`.)
- [x] G6 Curva de dificultad temprana más suave (a petición de Daniel: "cuesta progresar"): presupuesto de enemigos por sala 6→4 con incremento por piso data-driven (2→2.25, el piso 9 queda casi igual); escalado de vida 0.35→0.30; XP por piso 40→55 y primer nivel 80→65 XP (engranajes de la Esfera antes = poder permanente antes).
- [x] G5 Bullet-time al esquivar por los pelos: si durante el dash una bala pasa rozándote Y venía hacia ti, micro slow-mo azul (`game_feel.nearmiss_*`, con cooldown anti-spam).
- [x] G7a Dash direccional reposiciona el objetivo del combo: dashear hacia otro enemigo cambia a quién sigues sin perder el ritmo (`cadencia.dash_retarget`).
- [x] G7b Cancelar disparando entre golpes: durante el combo puedes soltar lágrimas (mezclar melé y tiro) sin romperlo (`cadencia.shoot_during_combo`).
- [x] G7c Barra de "Groove"/racha: sube con perfectos/buenos/paradas/bajas y decae con el tiempo; al llegar al umbral, buff de daño y velocidad; recibir daño la desploma. Barra en HUD + aura de fuego (`balance.groove`).

**Criterio:** se puede tejer esquivas dentro de un combo sin que "te inflen"; el combate fluye contra grupos.

## Pulido UI/UX (a petición de Daniel: "texto descuadrado o cosas que se solapan")
Auditoría con capturas de TODAS las pantallas; causa raíz: `font(size)` pinta a `size*2` px y varios layouts contaban con el tamaño sin doblar.
- [x] U1 HUD: barra de controles movida abajo, centrada y temporizada (`balance.ui.hint_secs`); etiqueta de piso corta. Se acabó el solape superior (queja directa).
- [x] U2 Menú de equipo: cabecera mide y separa engranajes/nivel/oro; Crónica separa columnas de valores y recorta nombres largos ("…"); sin numeral 'VI' tras el panel de la Esfera; nombre de elemento recortado.
- [x] U3 El Redoble: menú de órdenes a 14px (panel más alto).
- [x] U4 Balance: contrato en 2 líneas; más aire en subida de nivel.
- [x] U5 Tutorial: subtítulo ajustado a varias líneas.
- [x] U6 Muerte/Victoria: título auto-encoge; tarjetas de mejora sin desbordar; HUD/tutorial/táctil solo en modo 'play' (no "sangran" bajo los overlays).
- [x] U7 Emojis tofu de VT323 (🔒/🍞/⛓) dibujados a mano.
- [x] U8 Ayudas de texto medido reutilizables: `fitFont`/`wrapText`/`clipText` (main) y `_clip`/`_lock`/`_wrap` (menús/tutorial).

**Criterio:** ninguna pantalla muestra texto solapado o cortado a 640×360 ni en móvil; verificado con capturas headless.

## Fase R4 — Refactor sostenible (sin cambiar comportamiento; smoke como red)
- [ ] R4.0 (ADELANTADA por la auditoría IA) Extraer `js/escenas.js`: helper de ESCENA PINTADA reutilizable (fondo a pantalla + sprites y-ordenados + retratos de diálogo + cámara de escena), sacando lo que hoy vive suelto en `main.js`/`pueblo.js`. **Hacerlo ANTES de pintar el Redoble y las viñetas**: el estudio mostró que meter integración de arte en el god-file multiplica bugs latentes (p.ej. el `x,y` de Una Mano). Se hace una vez y todo lo pintado nuevo entra limpio.
- [ ] R4.1 Trocear `main.js`: `js/scenes/` (un módulo por modo con `{enter, update, render}`), `js/render/` (dibujo 2.5D, HUD, minimapa), `js/signals.js` (los ~40 listeners centralizados; hoy hay señales suscritas en 2-3 sitios).
- [ ] R4.2 Extraer `AudioManager` de `state.js` a `js/audio.js`.
- [ ] R4.3 Retirar/condicionar los hooks `window.__mistveil` (flag de debug).
- [ ] R4.4 Smoke test tras cada extracción; cero cambios de gameplay.

**Criterio:** ningún archivo >1200 líneas; el smoke pasa idéntico antes/después. (Puede adelantarse si una fase anterior lo exige.)

## Fase R5 — Lanzamiento
- [x] R5.1 Fuente del juego servida en local: se migró a **Gelica** (`assets/fonts/Gelica-Regular.otf`, `@font-face`) — el juego NO depende de red para la fuente. (Pendiente NO técnico: verificar licencia comercial de Gelica para redistribución; ver B6.)
- [x] R5.2 PWA mínima: manifest + iconos + service worker de caché (jugable offline tras primera carga) — hecho en B6, verificado con red cortada.
- [ ] R5.3 Export/import del guardado (el localStorage se pierde al limpiar el navegador).
- [ ] R5.4 QA móvil real: iOS Safari + Android Chrome, modo Una Mano, rendimiento (partículas/luz), háptica.
- [ ] R5.5 Página de itch.io: subida HTML, capturas, texto, **divulgación de IA generativa** marcada.
- [ ] R5.6 Ronda de balance final con Daniel usando F5 + playground (documento corto de valores tocados). — Arrancado: `docs/balance_torre.md` (curva medida + diales de F5 de la Torre/dificultad); falta la ronda final con Daniel jugando.
- [ ] R5.7 (auditoría IA) **Carga diferida de arte por bioma/escena** cuando el volumen lo pida: no cargar todos los fondos/sprites de golpe en el arranque, sino el arte de cada bioma al entrar. Es lo que permite "arte sin límite" sin penalizar la primera carga (Daniel: no hay tope de peso). Fondos ya en JPEG (opacos, ~1/5 del peso). Adelantable si el bundle se hace lento de arrancar.

**Criterio:** un desconocido lo juega en su móvil desde itch.io sin instrucciones y sin conexión tras la primera carga.

---
### Aparcado (ideas sin fase; no borrar)
- Localización EN (textos ya centralizados en `textos_es.json`).
- Prioridad de fijado "último dañado" y cambio manual de objetivo en Una Mano (`docs/movil_una_mano.md` §futuras).
- Semilla visible/introducible por el jugador (daily runs).
- Más encuentros de El Redoble y ligas 6+.
