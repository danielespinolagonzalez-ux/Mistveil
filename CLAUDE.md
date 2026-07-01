# MISTVEIL: El Reloj de las Almas — Guía para Claude Code

## Qué es este proyecto
Action-roguelite 2D top-down en Godot 4.x. Mezcla tres pilares:
- **The Binding of Isaac**: salas procedurales, twin-stick, objetos con sinergias, roguelite.
- **The Legend of Dragoon**: combos de timing ("Cadencia" = Additions en tiempo real), contraataques QTE, transformaciones Dragoon elementales.
- **Final Fantasy IX**: tono de cuento de hadas melancólico, pueblo-hub con personajes, ATE (escenas opcionales), tema "qué significa estar vivo".

El diseño completo está en `docs/`. **Lee siempre la spec del sistema antes de implementarlo.**

## Stack técnico
- **Motor**: Godot 4.x estable (GDScript). Sin plugins externos salvo autorización explícita de Daniel.
- **Render**: 2D, viewport base **640×360**, stretch mode `canvas_items`, aspect `keep`. Pixel snap activado.
- **Tiles**: 32×32. Sprites de personajes: 48–64 px de alto.
- **Input**: teclado+ratón (WASD mover, ratón apuntar/disparar) y mando (twin-stick). Definir SIEMPRE en Input Map, nunca hardcodear teclas.

## Idiomas y convenciones
- **Código e identificadores: en INGLÉS** (mejor soporte del corpus GDScript). Comentarios: en español.
- **Textos visibles del juego: en español**, centralizados en `data/textos_es.json` (clave → texto) para facilitar futura localización EN.
- Archivos y carpetas: `snake_case`. Clases/Nodos: `PascalCase`. Señales: pasado (`enemy_died`, `room_cleared`).
- **GDScript tipado siempre** (`var speed: float`, `func take_damage(amount: int) -> void`). Reduce errores y alucinaciones de API.
- Si dudas de un método/clase de Godot, NO lo inventes: consulta la documentación oficial de la clase.

## Arquitectura (obligatoria)
### Autoloads (singletons, en este orden)
| Autoload | Archivo | Responsabilidad |
|---|---|---|
| `EventBus` | `scripts/autoload/event_bus.gd` | SOLO señales globales. Sin lógica. |
| `DataDB` | `scripts/autoload/data_db.gd` | Carga y valida todos los `data/*.json` al arrancar. Acceso de solo lectura. Tecla F5 en debug = recargar datos en caliente. |
| `GameState` | `scripts/autoload/game_state.gd` | Estado meta persistente (Memoria, desbloqueos, opciones). |
| `RunState` | `scripts/autoload/run_state.gd` | Estado de la run actual (piso, items, oro, SP, semilla). Se resetea al morir. |
| `AudioManager` | `scripts/autoload/audio_manager.gd` | Música y SFX vía buses. |
| `SaveManager` | `scripts/autoload/save_manager.gd` | Guardado/carga JSON en `user://save.json`. |

### Reglas de oro
1. **Los sistemas NUNCA se llaman directamente entre sí.** Comunicación por señales a través de `EventBus`. Ej.: un enemigo muere → `EventBus.enemy_died.emit(self)` → la sala escucha y comprueba si queda limpia.
2. **CERO números mágicos.** Todo valor de balance vive en `data/balance.json` y se lee vía `DataDB`. Si necesitas un valor nuevo, añádelo al JSON primero.
3. **Data-driven**: items, enemigos, sellos, elementos y plantillas de sala se definen en `data/*.json`. El código los interpreta; añadir contenido nuevo NO debe requerir código nuevo salvo efectos inéditos.
4. **Composición sobre herencia**: entidades pequeñas con componentes reutilizables (`HealthComponent`, `HitboxComponent`, `HurtboxComponent`, `MovementComponent`) en `scripts/components/`.
5. **Placeholders siempre**: nunca bloquees una tarea por falta de arte. Usa `Polygon2D`/`ColorRect` con el color del elemento correspondiente y registra el asset necesario en `ASSETS_PENDIENTES.md` (formato descrito allí). Daniel genera el arte con IA y lo coloca en `assets/`; tú lo integras después.

### Estructura de carpetas
```
scenes/        # .tscn: main/, player/, enemies/, rooms/, ui/, town/
scripts/       # .gd: autoload/, components/, systems/, entities/
data/          # JSON de balance y contenido (fuente de verdad)
docs/          # Especificaciones de diseño (leer antes de implementar)
tests/         # Escenas de test headless
assets/        # Arte/audio real (lo aporta Daniel; no generes binarios aquí)
```

## Flujo de trabajo (cada sesión)
1. Lee `ESTADO.md` (dónde quedamos) y `ROADMAP.md` (qué toca).
2. Trabaja **una tarea a la vez**, en orden. No saltes de fase sin cumplir el criterio de aceptación.
3. Al terminar una tarea: ejecuta los tests, marca su checkbox en `ROADMAP.md`, actualiza `ESTADO.md` (fecha, qué se hizo, decisiones, siguiente paso) y haz **commit** con mensaje convencional (`feat:`, `fix:`, `refactor:`).
4. Si una tarea revela trabajo extra, añádelo como subtarea al ROADMAP; **nunca borres tareas**.
5. Si necesitas un asset, añade la entrada a `ASSETS_PENDIENTES.md` y sigue con placeholder.

## Ejecución y tests (headless)
- Comprobación de que el proyecto carga: `godot --headless --quit` (desde la raíz).
- Tras clonar (o si aparecen errores "Could not find type" con class_name): ejecutar `godot --headless --import` una vez para regenerar `.godot/` y el caché de clases globales.
- Tests: escenas en `tests/` que ejecutan asserts y salen con `get_tree().quit(0)` (éxito) o `quit(1)` (fallo). Ejecutar: `godot --headless res://tests/test_smoke.tscn` desde la raíz del proyecto.
- Cada sistema core (Data, Cadencia, generación, items, guardado) debe tener al menos un test de humo antes de dar su fase por cerrada.
- Si `godot` no está en el PATH, pide a Daniel la ruta del ejecutable y anótala aquí.
- **Entorno remoto (Claude Code web)**: Godot **4.5 estable** instalado en `/usr/local/bin/godot` (descargado de downloads.godotengine.org). El contenedor es efímero: si `godot --headless --version` falla, reinstalar igual. En la máquina local de Daniel la ruta puede ser otra.

## Prohibido
- Llamadas directas entre managers/sistemas (usa EventBus).
- Hardcodear balance, textos o teclas.
- Añadir plugins/addons o dependencias sin preguntar a Daniel.
- Borrar o reordenar tareas del ROADMAP.
- Crear archivos binarios (imágenes/audio); solo Daniel añade assets.
- `await` dentro de `_physics_process` o en callbacks de señales sin justificarlo.
- Commits gigantes: una tarea = un commit (o pocos, coherentes).

## Contexto de Daniel (el humano)
Daniel no es programador profesional: explica las decisiones técnicas importantes en 1–2 frases en español cuando las tomes. Prefiere que avances con autonomía dentro del ROADMAP y preguntes solo ante bifurcaciones de diseño o cosas que afecten al game feel.
