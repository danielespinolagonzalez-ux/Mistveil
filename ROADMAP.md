# ROADMAP — Mistveil
Claude Code: trabaja las fases EN ORDEN. No avances de fase sin cumplir su **criterio de aceptación**. Marca `[x]` al completar. Añade subtareas si hace falta; nunca borres.

## Fase 0 — Cimientos
- [x] 0.1 Configurar proyecto: `Main.tscn` como escena principal, viewport 640×360, stretch `canvas_items`/`keep`, pixel snap, Input Map (move_up/down/left/right, aim con ratón/stick, shoot, melee, parry, dragoon, dash, pause).
- [x] 0.2 Crear los 6 autoloads vacíos y registrarlos (ver CLAUDE.md).
- [x] 0.3 `DataDB`: carga y valida todos los `data/*.json` con errores claros si falta una clave. Recarga en caliente con F5 (solo debug).
- [x] 0.4 Player: movimiento 8 direcciones con aceleración/fricción (valores de `balance.json`), placeholder visual.
- [x] 0.5 Disparo twin-stick: apuntar con ratón/stick derecho, proyectiles ("lágrimas de tinta") con object pooling, alcance y cadencia desde balance.
- [x] 0.6 `tests/test_smoke.tscn`: el proyecto carga, DataDB valida, el player existe.

**Criterio de aceptación:** me muevo y disparo fluido a 60 fps en una sala vacía; cambiar `move_speed` en balance.json y pulsar F5 se nota al instante.

## Fase 1 — Combate en tiempo real (base Isaac)
- [x] 1.1 Componentes: `HealthComponent`, `HitboxComponent`, `HurtboxComponent` (señales, sin acoplamiento).
- [x] 1.2 Enemigo `cera_andante` (perseguidor melé) instanciado desde `data/enemigos.json`.
- [x] 1.3 Daño por contacto al player, i-frames con parpadeo, muerte y pantalla de derrota mínima.
- [x] 1.4 Enemigos `tejedor_horas` (torreta que dispara) y `engranaje_errante` (volador errático).
- [x] 1.5 HUD: corazones de vida, contador de oro.
- [x] 1.6 Knockback y números de daño flotantes (feedback).

**Criterio:** limpiar una sala de prueba con 5 enemigos mixtos se siente justo y legible.

## Fase 2 — Cadencia (el sistema-firma: validar PRONTO)
Spec completa: `docs/sistemas/combate.md`. Es la prioridad de diseño del juego.
- [x] 2.1 Ataque melé básico con hitbox frontal.
- [x] 2.2 Anillo de sincronía: UI sobre el objetivo que se contrae; ventanas *perfecta/buena/fallo* desde balance.
- [x] 2.3 Cadena de 3 golpes: acertar encadena, fallar corta. Multiplicadores de daño y ganancia de SP por calidad.
  - [x] 2.3b (subtarea descubierta) Dash de la Capa 1 (i-frames breves, cooldown desde balance) y cancelación de combo con dash conservando el SP ganado.
- [x] 2.4 Contraataque QTE: enemigos con `counter_chance` vuelven el anillo ROJO → pulsar `parry` en ventana o recibir daño y perder combo. Enemigo `campanero` lo introduce.
- [x] 2.5 Feedback audio placeholder: *ding* agudo (perfecta), tono medio (buena), *thunk* grave (fallo), campana (counter). Generar beeps por código (AudioStreamGenerator) hasta tener SFX reales.
- [x] 2.6 Todo parámetro de Cadencia ajustable en caliente (F5). Escena `tests/cadencia_playground.tscn` con un dummy para tuning.

**Criterio (UMBRAL DE DECISIÓN):** ejecutar Additions mientras esquivas balas debe ser divertido y legible. Si tras iterar no lo es, PARAR y proponer a Daniel simplificaciones (menos golpes, ventanas mayores) antes de continuar.

## Fase 3 — Salas y piso estático
- [ ] 3.1 `Room.tscn` base: rejilla 13×7 tiles, muros, hasta 4 puertas.
- [ ] 3.2 Cargar layout desde plantillas JSON (`data/salas/`), símbolos según spec de generación.
- [ ] 3.3 Puertas se sellan al entrar con enemigos; `room_cleared` las abre. Transición de cámara entre salas estilo Isaac.
- [ ] 3.4 Piso de prueba: 6 salas conectadas a mano (normal×4, tesoro, jefe-placeholder).
- [ ] 3.5 Obstáculos: rocas (#), pozos (P, bloquean a terrestres), bloques de cera destructibles (O).

**Criterio:** recorrer el piso de 6 salas limpiándolas es ya "un juego".

## Fase 4 — Generación procedural
Spec: `docs/sistemas/generacion_procedural.md`.
- [ ] 4.1 Generador de layout en rejilla (paseo desde sala inicial, nº de salas desde balance, semilla registrada en RunState y visible en debug).
- [ ] 4.2 Colocación de especiales en callejones sin salida: jefe (la más lejana), tesoro, tienda; sala secreta adyacente a ≥2 salas.
- [ ] 4.3 Selección de plantillas por peso y tags de piso; espejado aleatorio.
- [ ] 4.4 Minimapa: salas visitadas/adyacentes, iconos de especiales.
- [ ] 4.5 Test: generar 500 pisos sin errores; jefe alcanzable siempre (BFS).

**Criterio:** cada run genera un piso 1 distinto, navegable y sin salas huérfanas.

## Fase 5 — Objetos y sinergias
Spec: `docs/sistemas/objetos_sinergias.md`.
- [ ] 5.1 Motor de efectos data-driven: aplicar `efectos[]` de items.json (stats, flags de lágrima, mods de Cadencia, eventos).
- [ ] 5.2 Pedestal de item en sala del tesoro; el HUD muestra icono placeholder + nombre.
- [ ] 5.3 Los 10 primeros items de items.json funcionando; al menos 2 sinergias emergentes verificadas.
- [ ] 5.4 Tienda: 3 productos, comprar con oro. Drops de oro/corazones al limpiar salas (tabla en balance).
- [ ] 5.5 Item activo con recarga por salas (`arena_del_tiempo`).

**Criterio:** dos runs con items distintos se JUEGAN distinto.

## Fase 6 — Elementos y Sellos Dragoon
Spec: combate.md §Elementos y §Dragoon. Datos: `elementos.json`, `sellos.json`.
- [ ] 6.1 Campo `elemento` en proyectiles, melé y enemigos; multiplicadores opuesto/mismo desde balance; tinte de color por elemento.
- [ ] 6.2 Barra de SP en HUD; SP solo sube acertando Cadencia.
- [ ] 6.3 Transformación: con SP lleno, `dragoon` activa el Sello equipado — duración limitada, vuelo (ignora pozos), stats modificados, proyectiles elementales.
- [ ] 6.4 D-Addition: combo especial de la forma dragón (ventanas más estrictas, más golpes, finisher con onda expansiva elemental).
- [ ] 6.5 Sello de Ascuas (fuego) completo; después Sello de Marea (agua). Resto quedan definidos en JSON como `planificado`.

**Criterio:** transformarse se siente como un power-spike épico y se acaba antes de trivializar la sala.

## Fase 7 — Jefe y run completa
- [ ] 7.1 Jefe **Guardián de Cera**: máquina de estados, 3 patrones telegrafiados, 2 fases (al 50% se derrite y cambia patrones), barra de vida propia.
- [ ] 7.2 Trampilla al piso siguiente tras el jefe; 3 pisos con dificultad escalada (multiplicadores en balance).
- [ ] 7.3 Muerte → pantalla "Te has detenido…" → volver al pueblo (placeholder) conservando Memoria.
- [ ] 7.4 Victoria provisional en piso 3 con pantalla de resumen de run (tiempo, items, semilla).

**Criterio:** una run completa de ~20–30 min, jugable de principio a fin.

## Fase 8 — Meta-progresión y pueblo
Spec: `docs/sistemas/metaprogresion.md`.
- [ ] 8.1 `SaveManager`: guardar/cargar Memoria, desbloqueos y opciones en `user://save.json` (con versión de esquema).
- [ ] 8.2 Drop de Memoria (jefes y retos); persiste tras morir.
- [ ] 8.3 Escena del pueblo: moverse, hablar con 3 NPC placeholder, entrar al Reloj (inicia run).
- [ ] 8.4 Árbol de Recuerdos: los 8 nodos iniciales de la spec comprables con Memoria.
- [ ] 8.5 Desbloqueos de pool: nodos que añaden items/salas nuevas a las runs (variedad > poder).

**Criterio:** morir duele pero siempre se progresa en algo; el bucle pueblo→run→pueblo cierra.

## Fase 9 — Narrativa y ATE
Spec: `docs/narrativa/historia_personajes.md`.
- [ ] 9.1 Sistema de diálogo: caja, retrato placeholder, nombre, avance por input, texto desde `textos_es.json`.
- [ ] 9.2 Intro jugable (Pip despierta; 8–10 líneas) antes de la primera run.
- [ ] 9.3 Sistema ATE: entre runs, notificación opcional de escena en el pueblo; las 3 ATE del Acto I.
- [ ] 9.4 Diálogos condicionados por progreso (nº de muertes, jefes vencidos) estilo Hades.

**Criterio:** un jugador nuevo entiende quién es Pip, qué es el Reloj y por qué desciende.

## Fase 10 — Audio, accesibilidad, pulido y export
- [ ] 10.1 `AudioManager` con buses (Master/Música/SFX), volúmenes en opciones, crossfade pueblo↔mazmorra.
- [ ] 10.2 Integrar música/SFX reales de `assets/audio/` cuando existan (ver ASSETS_PENDIENTES).
- [ ] 10.3 Accesibilidad: escala global de ventanas de Cadencia (100–200%) en opciones, remapeo de teclas, pantalla de pausa.
- [ ] 10.4 Juice: screenshake sutil, hit-stop en golpes perfectos, partículas por elemento.
- [ ] 10.5 Export presets Windows + Linux; probar builds.
  - [x] 10.5b (adelantada a Fase 2 a petición de Daniel) Export Web (sin threads) + controles táctiles virtuales para probar en móvil/navegador.
- [ ] 10.6 Checklist itch.io: página, capturas, y **marcar la divulgación de IA generativa** (gráficos/audio si aplica).

**Criterio:** build descargable que un desconocido puede jugar sin instrucciones.
