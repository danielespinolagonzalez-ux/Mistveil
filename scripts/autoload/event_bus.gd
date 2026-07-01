extends Node
## EventBus — SOLO señales globales. Sin lógica (regla de oro nº 1 de CLAUDE.md).
## Los sistemas emiten/escuchan aquí; nunca se llaman entre sí directamente.

# --- Datos ---
## DataDB terminó de (re)cargar los JSON (arranque o F5 en debug).
signal data_reloaded

# --- Combate ---
## El player dispara una lágrima; TearPool escucha y la pone en juego.
signal tear_fired(origin: Vector2, direction: Vector2, speed: float, range_px: float)

# (Se irán usando a partir de la Fase 1)
signal enemy_died(enemy: Node)
signal player_died
signal room_cleared
