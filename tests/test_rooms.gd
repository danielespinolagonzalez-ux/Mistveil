extends Node
## Test de salas y piso estático (Fase 3). Ejecutar:
##   godot --headless res://tests/test_rooms.tscn

const ROOM_SCENE: PackedScene = preload("res://scenes/rooms/room.tscn")

var _failures: int = 0


func _ready() -> void:
	await _test_room_base()

	if _failures == 0:
		print("TEST ROOMS: OK")
		get_tree().quit(0)
	else:
		print("TEST ROOMS: %d fallo(s)" % _failures)
		get_tree().quit(1)


## Tarea 3.1: sala base con muros y puertas según conexiones.
func _test_room_base() -> void:
	var room: Room = ROOM_SCENE.instantiate()
	add_child(room)
	var exits: Array[Vector2i] = [Vector2i.RIGHT, Vector2i.UP]
	room.setup(Vector2i.ZERO, Vector2i(13, 7), exits)
	await get_tree().physics_frame

	_check("sala: tamaño total = interior + muros",
		room.total_size_px() == Vector2(13 * 32 + 64, 7 * 32 + 64))
	_check("sala: solo puertas hacia vecinos (2)", room.door_count() == 2)
	_check("sala: puertas abiertas al construir",
		room.is_door_open(Vector2i.RIGHT) and room.is_door_open(Vector2i.UP))

	room.seal_doors()
	await get_tree().physics_frame
	_check("sala: sellado cierra las puertas",
		not room.is_door_open(Vector2i.RIGHT) and not room.is_door_open(Vector2i.UP))
	room.open_doors()
	await get_tree().physics_frame
	_check("sala: reabrir puertas", room.is_door_open(Vector2i.RIGHT))

	# Cruce de puerta: un player tocando el trigger de la puerta abierta emite door_crossed.
	var crossings: Array[Dictionary] = []
	EventBus.door_crossed.connect(func(grid: Vector2i, dir: Vector2i) -> void:
		crossings.append({"grid": grid, "dir": dir}))
	var player: Player = (load("res://scenes/player/player.tscn") as PackedScene).instantiate()
	# Colocado sobre la puerta este (punto medio del borde derecho).
	player.position = room.position + Vector2(13 * 32 + 64 - 16, 32 + 3 * 32 + 16)
	add_child(player)
	await get_tree().physics_frame
	await get_tree().physics_frame
	_check("sala: cruzar puerta abierta emite door_crossed",
		crossings.size() >= 1 and crossings[0]["dir"] == Vector2i.RIGHT and crossings[0]["grid"] == Vector2i.ZERO)
	player.queue_free()
	room.queue_free()
	await get_tree().physics_frame


func _check(nombre: String, ok: bool) -> void:
	print(("  [OK]   " if ok else "  [FALLO] ") + nombre)
	if not ok:
		_failures += 1
