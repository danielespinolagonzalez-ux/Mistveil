class_name FloorManager
extends Node2D
## Gestiona el piso: instancia salas en la rejilla, sabe cuál es la activa y ejecuta
## la transición de cámara estilo Isaac (árbol en pausa + deslizamiento) al cruzar
## una puerta. Escucha door_crossed por EventBus; no conoce el interior de las salas.

const ROOM_SCENE: PackedScene = preload("res://scenes/rooms/room.tscn")

## Archivo de plantillas del piso (clave en DataDB.salas).
const TEMPLATES_FILE := "piso1_plantillas"

# Tintes de suelo por tipo de sala (placeholder visual).
const TINT_TREASURE := Color(0.2, 0.18, 0.1)
const TINT_BOSS := Color(0.2, 0.1, 0.11)

@export var camera: Camera2D

var rooms: Dictionary = {}  # Vector2i → Room
var current_grid: Vector2i = Vector2i.ZERO
var transitioning: bool = false

var _size_tiles: Vector2i = Vector2i(13, 7)


func _ready() -> void:
	# Debe seguir procesando con el árbol en pausa: él conduce la transición.
	process_mode = Node.PROCESS_MODE_ALWAYS
	EventBus.door_crossed.connect(_on_door_crossed)


## Construye el piso desde una definición { Vector2i: {tipo, plantilla?} } y
## coloca al player en el centro de la sala inicial.
func build_floor(floor_def: Dictionary, start: Vector2i) -> void:
	var templates_data: Dictionary = DataDB.salas.get(TEMPLATES_FILE, {})
	var legend: Dictionary = templates_data.get("leyenda", {})
	var tamano: Array = templates_data.get("tamano", [13, 7])
	_size_tiles = Vector2i(int(tamano[0]), int(tamano[1]))
	var stride: Vector2 = Vector2(_size_tiles.x * Room.TILE + Room.WALL_PX * 2,
		_size_tiles.y * Room.TILE + Room.WALL_PX * 2)

	for grid_pos: Vector2i in floor_def:
		var def: Dictionary = floor_def[grid_pos]
		var exits: Array[Vector2i] = []
		for dir: Vector2i in Room.DOOR_DIRS:
			if floor_def.has(grid_pos + dir):
				exits.append(dir)
		var template: Dictionary = _find_template(templates_data, str(def.get("plantilla", "")))
		var room: Room = ROOM_SCENE.instantiate()
		# Las salas deben CONGELARSE con la pausa de transición: sin esto heredarían
		# el PROCESS_MODE_ALWAYS del FloorManager y los enemigos seguirían moviéndose.
		room.process_mode = Node.PROCESS_MODE_PAUSABLE
		room.position = Vector2(grid_pos.x * stride.x, grid_pos.y * stride.y)
		add_child(room)
		room.difficulty_budget = int(DataDB.get_balance("run.dificultad_sala_base"))
		var forced: Array[String] = []
		for id: Variant in def.get("enemigos", []):
			forced.append(str(id))
		room.forced_spawns = forced
		room.setup(grid_pos, _size_tiles, exits, template, legend)
		match str(def.get("tipo", "normal")):
			"tesoro":
				room.set_floor_tint(TINT_TREASURE)
			"jefe":
				room.set_floor_tint(TINT_BOSS)
		rooms[grid_pos] = room

	current_grid = start
	var start_room: Room = rooms[start]
	start_room.activate()
	if camera != null:
		camera.global_position = start_room.center_global()
	var player: Node2D = get_tree().get_first_node_in_group("player") as Node2D
	if player != null:
		player.global_position = start_room.center_global()
	EventBus.room_entered.emit(start)


func _find_template(templates_data: Dictionary, id: String) -> Dictionary:
	if id.is_empty():
		return {}
	for template: Variant in templates_data.get("plantillas", []):
		if str((template as Dictionary).get("id", "")) == id:
			return template
	push_error("FloorManager: plantilla desconocida '%s'" % id)
	return {}


func _on_door_crossed(room_grid: Vector2i, direction: Vector2i) -> void:
	if transitioning or room_grid != current_grid:
		return
	var target: Vector2i = room_grid + direction
	if not rooms.has(target):
		return
	# El flag se activa YA: dos cruces en el mismo frame no deben encolar dos
	# transiciones diferidas. Deferido: llega desde un callback de física.
	transitioning = true
	_transition_to.call_deferred(target, direction)


## Transición Isaac: congela el juego, mueve al player a la puerta opuesta y
## desliza la cámara hasta la sala destino; al llegar, activa la sala.
func _transition_to(target: Vector2i, direction: Vector2i) -> void:
	transitioning = true
	# La duración se lee ANTES de pausar: si balance está roto (F5 a mitad de
	# edición) no podemos dejarnos el árbol pausado para siempre.
	var duration_raw: Variant = DataDB.get_balance("salas.transicion_camara_s")
	var duration: float = float(duration_raw) if duration_raw != null else 0.0
	get_tree().paused = true
	var room: Room = rooms[target]
	var player: Node2D = get_tree().get_first_node_in_group("player") as Node2D
	if player != null:
		player.global_position = room.entry_position(-direction)
	if camera != null:
		var tween: Tween = create_tween()
		tween.tween_property(camera, "global_position", room.center_global(), duration) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		await tween.finished
	get_tree().paused = false
	transitioning = false
	current_grid = target
	room.activate()
	EventBus.room_entered.emit(target)
