# ESTADO del proyecto
> Claude Code: actualiza este archivo al final de CADA sesión.

**Fase actual:** 0 (Cimientos) — en curso
**Última sesión:** 2026-07-01

## Registro de sesiones
| Fecha | Qué se hizo | Decisiones | Siguiente paso |
|---|---|---|---|
| — | Kit inicial creado | Motor: Godot 4.x + GDScript | Empezar tarea 0.1 |
| 2026-07-01 | 0.1: project.godot (viewport 640×360, stretch, pixel snap, Input Map completo), Main.tscn mínima | Godot 4.5 estable; mando: melé=X, parry=LB, dash=RB, dragoon=Y, disparo=RT/click izq., melé=click dcho. | Tarea 0.2 (autoloads) |
| 2026-07-01 | 0.2: 6 autoloads creados y registrados en orden | EventBus arranca con señales previstas (data_reloaded, enemy_died, player_died, room_cleared) | Tarea 0.3 (DataDB) |
| 2026-07-01 | 0.3: DataDB carga y valida todos los JSON (claves obligatorias, referencias cruzadas, plantillas de sala), F5 recarga en caliente | F5 vive en Input Map como `debug_reload_data`; datos en solo lectura recursiva; `get_balance("a.b")` con error claro si falta | Tarea 0.4 (player) |
| 2026-07-01 | 0.4: Player CharacterBody2D con movimiento 8 dir. (move_toward con aceleración/fricción de balance), placeholder Polygon2D | Colisión circular pequeña a los pies; el visual (48 px) es más alto que la colisión, como pide el estilo top-down | Tarea 0.5 (disparo) |

## Deuda técnica / notas
- (vacío)
