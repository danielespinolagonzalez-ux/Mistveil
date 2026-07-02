extends Node
## Test de salas y piso estático (Fase 3). Ejecutar:
##   godot --headless res://tests/test_rooms.tscn

const ROOM_SCENE: PackedScene = preload("res://scenes/rooms/room.tscn")

var _failures: int = 0


func _ready() -> void:
	# ALWAYS: la transición de sala pausa el árbol y el test debe seguir corriendo.
	process_mode = Node.PROCESS_MODE_ALWAYS
	await _test_room_base()
	await _test_room_template()
	await _test_floor_transition()

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


## Tarea 3.2: el layout JSON se interpreta símbolo a símbolo (vía leyenda).
func _test_room_template() -> void:
	var salas: Dictionary = DataDB.salas["piso1_plantillas"]
	var legend: Dictionary = salas["leyenda"]
	var template: Dictionary = {}
	for t: Dictionary in salas["plantillas"]:
		if t["id"] == "p1_pilares_01":
			template = t
	_check("plantilla p1_pilares_01 existe", not template.is_empty())

	var room: Room = ROOM_SCENE.instantiate()
	add_child(room)
	var exits: Array[Vector2i] = [Vector2i.RIGHT]
	room.setup(Vector2i.ZERO, Vector2i(13, 7), exits, template, legend)
	await get_tree().physics_frame

	# Conteo de símbolos directamente del layout (fuente de verdad).
	var counts: Dictionary = { "#": 0, "P": 0, "O": 0, "E": 0, "e": 0 }
	for row: Variant in template["layout"]:
		for ch: String in str(row):
			if counts.has(ch):
				counts[ch] += 1

	_check("layout: rocas colocadas = '#' del layout",
		_count_in_group(room, "rocks") == counts["#"])
	_check("layout: pozos colocados = 'P' del layout",
		_count_in_group(room, "pits") == counts["P"])
	_check("layout: bloques de cera = 'O' del layout",
		_count_in_group(room, "wax_blocks") == counts["O"])

	var cleared_rooms: Array[Node] = []
	EventBus.room_cleared.connect(func(r: Node) -> void: cleared_rooms.append(r))
	room.activate()
	await get_tree().physics_frame
	var enemies: Array[Enemy] = []
	for child in room.get_children():
		if child is Enemy:
			enemies.append(child)
	_check("spawns: enemigos entre E y E+e",
		enemies.size() >= counts["E"] and enemies.size() <= counts["E"] + counts["e"])
	_check("spawns: ids válidos del pool piso1",
		enemies.all(func(e: Enemy) -> bool: return DataDB.pools_spawn["piso1"].has(e.enemy_id)))
	_check("activar con enemigos sella las puertas", not room.is_door_open(Vector2i.RIGHT))

	# Matar a todos → room_cleared y puertas abiertas.
	for enemy: Enemy in enemies:
		(enemy.get_node("HealthComponent") as HealthComponent).take_damage(99999)
	await get_tree().physics_frame
	_check("limpiar la sala emite room_cleared", cleared_rooms.size() == 1 and cleared_rooms[0] == room)
	_check("limpiar la sala abre las puertas", room.is_door_open(Vector2i.RIGHT))
	room.queue_free()
	await get_tree().physics_frame


## Tarea 3.3: transición de cámara entre salas al cruzar una puerta.
func _test_floor_transition() -> void:
	var camera := Camera2D.new()
	add_child(camera)
	var manager := FloorManager.new()
	manager.camera = camera
	add_child(manager)
	var player: Player = (load("res://scenes/player/player.tscn") as PackedScene).instantiate()
	add_child(player)

	var entered: Array[Vector2i] = []
	EventBus.room_entered.connect(func(grid: Vector2i) -> void: entered.append(grid))

	var floor_def: Dictionary = {
		Vector2i.ZERO: { "tipo": "normal" },
		Vector2i(1, 0): { "tipo": "normal", "plantilla": "p1_pilares_01" },
	}
	manager.build_floor(floor_def, Vector2i.ZERO)
	await get_tree().physics_frame

	_check("piso: 2 salas construidas", manager.rooms.size() == 2)
	var start_room: Room = manager.rooms[Vector2i.ZERO]
	_check("piso: la sala inicial (sin plantilla) queda limpia", start_room.cleared)
	_check("piso: cámara centrada en la sala inicial",
		camera.global_position == start_room.center_global())
	_check("piso: player en el centro de la inicial",
		player.global_position == start_room.center_global())
	_check("piso: room_entered de la inicial",
		entered.size() == 1 and entered[0] == Vector2i.ZERO)

	# Cruce simulado de la puerta este.
	EventBus.door_crossed.emit(Vector2i.ZERO, Vector2i.RIGHT)
	var timeout := get_tree().create_timer(3.0)
	while manager.transitioning or manager.current_grid != Vector2i(1, 0):
		if timeout.time_left <= 0.0:
			break
		await get_tree().process_frame
	var target_room: Room = manager.rooms[Vector2i(1, 0)]

	_check("transición: la sala actual es la nueva", manager.current_grid == Vector2i(1, 0))
	_check("transición: el árbol queda despausado", not get_tree().paused)
	_check("transición: cámara centrada en la sala nueva",
		camera.global_position.distance_to(target_room.center_global()) < 2.0)
	_check("transición: player entra por la puerta oeste",
		player.global_position.distance_to(target_room.entry_position(Vector2i.LEFT)) < 2.0)
	_check("transición: la sala nueva se activa y sella (tiene enemigos)",
		target_room.activated and not target_room.is_door_open(Vector2i.LEFT))
	_check("transición: room_entered emitido para la nueva",
		entered.size() == 2 and entered[1] == Vector2i(1, 0))

	manager.queue_free()
	player.queue_free()
	camera.queue_free()
	await get_tree().physics_frame


func _count_in_group(root: Node, group: String) -> int:
	var count: int = 0
	for child in root.get_children():
		if child.is_in_group(group):
			count += 1
	return count


func _check(nombre: String, ok: bool) -> void:
	print(("  [OK]   " if ok else "  [FALLO] ") + nombre)
	if not ok:
		_failures += 1
