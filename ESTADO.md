# ESTADO del proyecto
> Claude Code: actualiza este archivo al final de CADA sesión.

**Fase actual:** 1 (Combate en tiempo real) — Daniel pidió continuar; el criterio de la Fase 0 sigue pendiente de su prueba manual (fluidez + F5)
**Última sesión:** 2026-07-01

## Registro de sesiones
| Fecha | Qué se hizo | Decisiones | Siguiente paso |
|---|---|---|---|
| — | Kit inicial creado | Motor: Godot 4.x + GDScript | Empezar tarea 0.1 |
| 2026-07-01 | 0.1: project.godot (viewport 640×360, stretch, pixel snap, Input Map completo), Main.tscn mínima | Godot 4.5 estable; mando: melé=X, parry=LB, dash=RB, dragoon=Y, disparo=RT/click izq., melé=click dcho. | Tarea 0.2 (autoloads) |
| 2026-07-01 | 0.2: 6 autoloads creados y registrados en orden | EventBus arranca con señales previstas (data_reloaded, enemy_died, player_died, room_cleared) | Tarea 0.3 (DataDB) |
| 2026-07-01 | 0.3: DataDB carga y valida todos los JSON (claves obligatorias, referencias cruzadas, plantillas de sala), F5 recarga en caliente | F5 vive en Input Map como `debug_reload_data`; datos en solo lectura recursiva; `get_balance("a.b")` con error claro si falta | Tarea 0.4 (player) |
| 2026-07-01 | 0.4: Player CharacterBody2D con movimiento 8 dir. (move_toward con aceleración/fricción de balance), placeholder Polygon2D | Colisión circular pequeña a los pies; el visual (48 px) es más alto que la colisión, como pide el estilo top-down | Tarea 0.5 (disparo) |
| 2026-07-01 | 0.5: disparo twin-stick (ratón o stick dcho. con auto-disparo), lágrimas con pooling que crece bajo demanda | Player emite `tear_fired` por EventBus; TearPool (sistema en Main) instancia/recicla — cero acoplamiento player↔pool | Tarea 0.6 (test de humo) |
| 2026-07-01 | 0.6: test_smoke.tscn (10 checks: DataDB, balance, textos, enemigos, main, player, pooling) — todo verde | El criterio de aceptación de la Fase 0 (fluidez, F5 en vivo) requiere prueba manual de Daniel en el editor | Daniel prueba la Fase 0; después, tarea 1.1 (componentes) |
| 2026-07-01 | 1.1: HealthComponent, HitboxComponent y HurtboxComponent + capas de física con nombre + tests/test_components.tscn (11 checks) | Hitbox/Hurtbox son Area2D desacopladas: cada una emite su señal y el dueño conecta con su Health; capas 4-7 = ataque/hurt por bando | Tarea 1.2 (enemigo cera_andante) |
| 2026-07-01 | 1.2: Enemy genérico data-driven (enemy.tscn + enemy.gd) con chase, muerte→enemy_died, color por elemento; Tear ahora ES un HitboxComponent con daño; cera_andante en Main | Una sola escena Enemy para todos los enemigos: el JSON decide stats y comportamiento; daño redondeado (entero más cercano, mín. 1) según combate.md | Tarea 1.3 (daño por contacto + i-frames + derrota) |

## Deuda técnica / notas
- (vacío)
