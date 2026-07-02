# ESTADO del proyecto
> Claude Code: actualiza este archivo al final de CADA sesión.

**Fase actual:** 2 (Cadencia) — Daniel pidió continuar; criterios de Fases 0-1 pendientes de su prueba manual
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
| 2026-07-01 | 1.3: player con Health+Hurtbox, i-frames con parpadeo (hurt_blink_hz nuevo en balance), muerte→player_died→pantalla de derrota (reinicia con disparo); tests/test_player.tscn (10 checks) | Nuevos: balance player.hurt_blink_hz y texto ui.reiniciar; la pantalla de derrota vive en Main y solo escucha EventBus | Tarea 1.4 (tejedor_horas y engranaje_errante) |
| 2026-07-01 | 1.4: comportamientos turret y wander_bounce; Tear generalizada a Projectile + ProjectilePool base (lágrimas y balas enemigas comparten código); alcance_px añadido a proyectiles del JSON y validado | Un solo Projectile para ambos bandos (cambian capas de colisión); el engranaje rebota contra colisiones y bordes del viewport hasta que existan muros (Fase 3) | Tarea 1.5 (HUD) |
| 2026-07-01 | 1.5: HUD con corazones (1 hp = 1 corazón, coherente con el item cuerda_extra) y contador de oro; RunState.gold con add_gold/reset; señales player_health_changed y gold_changed | Corazones/moneda como ColorRect placeholder; sprites pedidos en ASSETS_PENDIENTES.md | Tarea 1.6 (knockback + números de daño) |
| 2026-07-01 | 1.6: knockback (sección feedback nueva en balance; empuje como propiedad del hitbox, decae solo) y números de daño flotantes (sistema que escucha damage_dealt); Main con 5 enemigos mixtos | Balas enemigas no empujan (solo el contacto); tests por tiempo real y no por frames (headless corre >60 fps) | Daniel prueba Fases 0-1; después Fase 2 (Cadencia) |
| 2026-07-02 | 2.1: melé básico con hitbox frontal orientado al aim, fases WINDUP/ACTIVE/RECOVERY con tiempos en balance (melee_windup_s/active/recovery_s) y knockback propio | El arco se fija al pulsar (no sigue al ratón durante el golpe); clic derecho o X del mando | Tarea 2.2 (anillo de sincronía) |
| 2026-07-02 | 2.2: SyncRing (dibujo por código, se contrae sobre el objetivo, judge_now con perfecta/buena/fallo + coyote, cierre y aviso al pasarse); integrado al iniciar melé con objetivo cercano; tests/test_cadencia.tscn (12 checks) | Anillo avanza con reloj de física (se congela en pausa); z_index absoluto 200 para dibujarse sobre balas; nuevas claves ring_contract_ms y target_range_px | Tarea 2.3 (cadena de 3 golpes) |

## Deuda técnica / notas
- (vacío)
