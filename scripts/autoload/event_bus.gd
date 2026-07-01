extends Node
## EventBus — SOLO señales globales. Sin lógica (regla de oro nº 1 de CLAUDE.md).
## Los sistemas emiten/escuchan aquí; nunca se llaman entre sí directamente.

# --- Datos ---
## DataDB terminó de (re)cargar los JSON (arranque o F5 en debug).
signal data_reloaded

# --- Combate ---
## El player dispara una lágrima; TearPool escucha y la pone en juego.
signal tear_fired(origin: Vector2, direction: Vector2, speed: float, range_px: float, damage: float, knockback_px_s: float)
## Un enemigo dispara; EnemyProjectilePool escucha y pone la bala en juego.
signal enemy_projectile_fired(origin: Vector2, direction: Vector2, speed: float, range_px: float, damage: float, knockback_px_s: float)
## Daño aplicado a un enemigo (para números flotantes y feedback).
signal damage_dealt(world_pos: Vector2, amount: int)

signal enemy_died(enemy: Node)
signal player_died
signal room_cleared

# --- HUD / estado visible ---
## Vida del player para el HUD (re-emitida por el player desde su HealthComponent).
signal player_health_changed(current: int, max_hp: int)
## Oro de la run (lo emite RunState al cambiar).
signal gold_changed(total: int)
