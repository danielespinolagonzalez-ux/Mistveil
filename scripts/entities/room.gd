class_name Room
extends Node2D
## Sala del Reloj (spec generacion_procedural.md §2-3): interior de 13×7 tiles con
## muros perimetrales y hasta 4 puertas en el punto medio de cada borde según las
## conexiones del piso. Todo se construye por código a partir de la plantilla JSON.
##
## Estados: construida (setup) → activada al entrar (spawn de enemigos + sellado)
## → limpiada (room_cleared abre puertas).

const TILE := 32
const WALL_PX := 32

const ENEMY_SCENE: PackedScene = preload("res://scenes/enemies/enemy.tscn")
const WAX_SCENE: PackedScene = preload("res://scenes/rooms/wax_block.tscn")

# Semánticas de la leyenda de plantillas (los VALORES de "leyenda" en data/salas).
const SYM_FLOOR := "suelo"
const SYM_ROCK := "roca"
const SYM_PIT := "pozo"
const SYM_WAX := "cera destructible"
const SYM_SPAWN := "spawn enemigo"
const SYM_SPAWN_OPTIONAL := "spawn opcional 50%"
const SYM_PICKUP := "posible pickup"

# Colores placeholder (visual, no balance).
const COLOR_FLOOR := Color(0.11, 0.12, 0.17)
const COLOR_WALL := Color(0.2, 0.21, 0.29)
const COLOR_DOOR_OPEN := Color(0.48, 0.35, 0.22)
const COLOR_DOOR_SEALED := Color(0.29, 0.3, 0.38)

## Direcciones de puerta posibles (N, S, O, E) en coordenadas de rejilla del piso.
const DOOR_DIRS: Array[Vector2i] = [Vector2i.UP, Vector2i.DOWN, Vector2i.LEFT, Vector2i.RIGHT]

var grid_pos: Vector2i = Vector2i.ZERO
var size_tiles: Vector2i = Vector2i(13, 7)
var activated: bool = false
var cleared: bool = false

## Pool de spawn del piso (clave de pools_spawn en enemigos.json).
var spawn_pool: String = "piso1"

## Spawns forzados (ids concretos) en vez de plantilla: sala de jefe-placeholder, etc.
var forced_spawns: Array[String] = []

## Presupuesto de dificultad de la sala (spec generación §2): la suma de
## coste_dificultad de los enemigos spawneados no puede superarlo. Lo fija
## FloorManager desde balance (dificultad_sala_base × nº de piso en Fase 4).
var difficulty_budget: int = 0

## Offsets de colocación (en tiles desde el centro) para los spawns forzados.
const FORCED_SPAWN_OFFSETS: Array[Vector2i] = [
	Vector2i(-2, 0), Vector2i(2, 0), Vector2i(0, -1), Vector2i(0, 1),
	Vector2i(-2, -2), Vector2i(2, 2),
]

var _doors: Dictionary = {}  # Vector2i (dir) → { blocker, trigger, visual, open }
var _alive_enemies: int = 0
var _spawn_tiles: Array[Vector2i] = []
var _pickup_tiles: Array[Vector2i] = []
var _rng := RandomNumberGenerator.new()


## Construye suelo, muros, puertas y (si hay plantilla) su layout interior.
## `exits` son las direcciones con sala vecina; `template` la entrada de data/salas
## y `legend` la leyenda de símbolos del archivo de plantillas.
func setup(p_grid_pos: Vector2i, p_size_tiles: Vector2i, exits: Array[Vector2i],
		template: Dictionary = {}, legend: Dictionary = {}) -> void:
	grid_pos = p_grid_pos
	size_tiles = p_size_tiles
	_rng.randomize()
	_build_floor()
	for dir: Vector2i in DOOR_DIRS:
		if exits.has(dir):
			_build_door(dir)
	_build_walls(exits)
	if not template.is_empty():
		_parse_layout(template, legend)
	EventBus.enemy_died.connect(_on_enemy_died)


## Tamaño total en px (interior + muros).
func total_size_px() -> Vector2:
	return Vector2(size_tiles.x * TILE + WALL_PX * 2, size_tiles.y * TILE + WALL_PX * 2)


## Centro de la sala en coordenadas globales (para la cámara).
func center_global() -> Vector2:
	return global_position + total_size_px() * 0.5


## Centro del tile interior (tx, ty) en coordenadas locales.
func tile_center(tx: int, ty: int) -> Vector2:
	return Vector2(WALL_PX + tx * TILE + TILE * 0.5, WALL_PX + ty * TILE + TILE * 0.5)


## Posición interior junto a la puerta `dir` (donde aparece el player al entrar).
func entry_position(dir: Vector2i) -> Vector2:
	var mid: Vector2i = size_tiles / 2
	var tile: Vector2i
	match dir:
		Vector2i.UP:
			tile = Vector2i(mid.x, 0)
		Vector2i.DOWN:
			tile = Vector2i(mid.x, size_tiles.y - 1)
		Vector2i.LEFT:
			tile = Vector2i(0, mid.y)
		Vector2i.RIGHT:
			tile = Vector2i(size_tiles.x - 1, mid.y)
	# Medio tile hacia dentro para no re-pisar el trigger de la puerta.
	return global_position + tile_center(tile.x, tile.y) - Vector2(dir) * TILE * 0.5


func door_count() -> int:
	return _doors.size()


## Tinte del suelo para distinguir tipos de sala (tesoro, jefe…).
func set_floor_tint(color: Color) -> void:
	(get_node("Floor") as ColorRect).color = color


func is_door_open(dir: Vector2i) -> bool:
	return _doors.has(dir) and _doors[dir]["open"]


## Primera activación al entrar: si hay enemigos, sella; si no, queda limpia.
func activate() -> void:
	if activated:
		return
	activated = true
	_alive_enemies = _spawn_enemies()
	if _alive_enemies > 0:
		seal_doors()
	else:
		_mark_cleared()


func seal_doors() -> void:
	for dir: Vector2i in _doors:
		_set_door_open(dir, false)


func open_doors() -> void:
	for dir: Vector2i in _doors:
		_set_door_open(dir, true)


# --- Construcción ---

func _build_floor() -> void:
	var floor_rect := ColorRect.new()
	floor_rect.name = "Floor"
	floor_rect.position = Vector2(WALL_PX, WALL_PX)
	floor_rect.size = Vector2(size_tiles.x * TILE, size_tiles.y * TILE)
	floor_rect.color = COLOR_FLOOR
	floor_rect.z_index = -10
	add_child(floor_rect)


## Muros perimetrales: cuerpo estático con un hueco de 1 tile por puerta.
func _build_walls(exits: Array[Vector2i]) -> void:
	var body := StaticBody2D.new()
	body.name = "Walls"
	body.collision_layer = 1
	body.collision_mask = 0
	add_child(body)
	var total: Vector2 = total_size_px()
	var mid: Vector2i = size_tiles / 2  # tile central (dimensiones impares)
	var mid_x: float = WALL_PX + mid.x * TILE
	var mid_y: float = WALL_PX + mid.y * TILE
	# Cada lado: uno o dos segmentos según haya puerta.
	_add_wall_segments(body, Rect2(0, 0, total.x, WALL_PX), exits.has(Vector2i.UP), true, mid_x)
	_add_wall_segments(body, Rect2(0, total.y - WALL_PX, total.x, WALL_PX), exits.has(Vector2i.DOWN), true, mid_x)
	_add_wall_segments(body, Rect2(0, 0, WALL_PX, total.y), exits.has(Vector2i.LEFT), false, mid_y)
	_add_wall_segments(body, Rect2(total.x - WALL_PX, 0, WALL_PX, total.y), exits.has(Vector2i.RIGHT), false, mid_y)


func _add_wall_segments(body: StaticBody2D, side: Rect2, has_door: bool, horizontal: bool, gap_start: float) -> void:
	var rects: Array[Rect2] = []
	if not has_door:
		rects.append(side)
	elif horizontal:
		rects.append(Rect2(side.position, Vector2(gap_start - side.position.x, side.size.y)))
		var after: float = gap_start + TILE
		rects.append(Rect2(Vector2(after, side.position.y), Vector2(side.end.x - after, side.size.y)))
	else:
		rects.append(Rect2(side.position, Vector2(side.size.x, gap_start - side.position.y)))
		var after_y: float = gap_start + TILE
		rects.append(Rect2(Vector2(side.position.x, after_y), Vector2(side.size.x, side.end.y - after_y)))
	for rect: Rect2 in rects:
		if rect.size.x <= 0.0 or rect.size.y <= 0.0:
			continue
		var shape := CollisionShape2D.new()
		var rectangle := RectangleShape2D.new()
		rectangle.size = rect.size
		shape.shape = rectangle
		shape.position = rect.get_center()
		body.add_child(shape)
		var visual := ColorRect.new()
		visual.position = rect.position
		visual.size = rect.size
		visual.color = COLOR_WALL
		visual.z_index = -5
		add_child(visual)


## Puerta en el punto medio del borde `dir`: visual + blocker + trigger de cruce.
func _build_door(dir: Vector2i) -> void:
	var total: Vector2 = total_size_px()
	var mid: Vector2i = size_tiles / 2
	var mid_x: float = WALL_PX + mid.x * TILE
	var mid_y: float = WALL_PX + mid.y * TILE
	var rect: Rect2
	match dir:
		Vector2i.UP:
			rect = Rect2(mid_x, 0, TILE, WALL_PX)
		Vector2i.DOWN:
			rect = Rect2(mid_x, total.y - WALL_PX, TILE, WALL_PX)
		Vector2i.LEFT:
			rect = Rect2(0, mid_y, WALL_PX, TILE)
		Vector2i.RIGHT:
			rect = Rect2(total.x - WALL_PX, mid_y, WALL_PX, TILE)

	var visual := ColorRect.new()
	visual.position = rect.position
	visual.size = rect.size
	visual.color = COLOR_DOOR_OPEN
	visual.z_index = -4
	add_child(visual)

	var blocker := StaticBody2D.new()
	blocker.collision_layer = 1
	blocker.collision_mask = 0
	var blocker_shape := CollisionShape2D.new()
	var blocker_rect := RectangleShape2D.new()
	blocker_rect.size = rect.size
	blocker_shape.shape = blocker_rect
	blocker.add_child(blocker_shape)
	blocker.position = rect.get_center()
	add_child(blocker)

	var trigger := Area2D.new()
	trigger.collision_layer = 0
	trigger.collision_mask = 2  # player_body
	var trigger_shape := CollisionShape2D.new()
	var trigger_rect := RectangleShape2D.new()
	trigger_rect.size = rect.size
	trigger_shape.shape = trigger_rect
	trigger.add_child(trigger_shape)
	trigger.position = rect.get_center()
	trigger.body_entered.connect(_on_door_trigger.bind(dir))
	add_child(trigger)

	_doors[dir] = { "blocker": blocker, "trigger": trigger, "visual": visual, "open": true }
	_set_door_open(dir, true)


func _set_door_open(dir: Vector2i, open: bool) -> void:
	var door: Dictionary = _doors[dir]
	door["open"] = open
	(door["visual"] as ColorRect).color = COLOR_DOOR_OPEN if open else COLOR_DOOR_SEALED
	# set_deferred: puede llamarse durante el paso de física (body_entered/muertes).
	var blocker_shape: CollisionShape2D = (door["blocker"] as StaticBody2D).get_child(0)
	blocker_shape.set_deferred("disabled", open)
	(door["trigger"] as Area2D).set_deferred("monitoring", open)


func _on_door_trigger(body: Node2D, dir: Vector2i) -> void:
	if body is Player and _doors[dir]["open"]:
		EventBus.door_crossed.emit(grid_pos, dir)


# --- Layout de plantilla (tarea 3.2; la física de obstáculos llega en la 3.5) ---

func _parse_layout(template: Dictionary, legend: Dictionary) -> void:
	var layout: Array = template.get("layout", [])
	for ty in layout.size():
		var row: String = str(layout[ty])
		for tx in row.length():
			match str(legend.get(row[tx], SYM_FLOOR)):
				SYM_ROCK:
					_place_rock(Vector2i(tx, ty))
				SYM_PIT:
					_place_pit(Vector2i(tx, ty))
				SYM_WAX:
					_place_wax(Vector2i(tx, ty))
				SYM_SPAWN:
					_spawn_tiles.append(Vector2i(tx, ty))
				SYM_SPAWN_OPTIONAL:
					if _rng.randf() < float(DataDB.get_balance("salas.spawn_opcional_pct")) / 100.0:
						_spawn_tiles.append(Vector2i(tx, ty))
				SYM_PICKUP:
					# Los pickups llegan con los drops de la Fase 5; guardamos la casilla.
					_pickup_tiles.append(Vector2i(tx, ty))


## Roca: bloquea TODO — cuerpos terrestres, voladores y proyectiles (capa obstacle).
func _place_rock(tile: Vector2i) -> void:
	var rock := StaticBody2D.new()
	rock.collision_layer = 128
	rock.collision_mask = 0
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(28, 28)
	shape.shape = rect
	rock.add_child(shape)
	var visual := Polygon2D.new()
	visual.color = Color(0.42, 0.4, 0.45)
	visual.polygon = PackedVector2Array([
		Vector2(-13, -8), Vector2(-4, -14), Vector2(9, -12), Vector2(14, -2),
		Vector2(10, 11), Vector2(-3, 14), Vector2(-13, 7),
	])
	rock.add_child(visual)
	rock.position = tile_center(tile.x, tile.y)
	rock.add_to_group("rocks")
	add_child(rock)


## Pozo: bloquea solo a terrestres (capa pit); vuelo y proyectiles pasan por encima.
func _place_pit(tile: Vector2i) -> void:
	var pit := StaticBody2D.new()
	pit.collision_layer = 256
	pit.collision_mask = 0
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(TILE, TILE)
	shape.shape = rect
	pit.add_child(shape)
	var visual := ColorRect.new()
	visual.color = Color(0.03, 0.03, 0.06)
	visual.position = -Vector2(TILE, TILE) * 0.5
	visual.size = Vector2(TILE, TILE)
	visual.z_index = -8
	pit.add_child(visual)
	pit.position = tile_center(tile.x, tile.y)
	pit.add_to_group("pits")
	add_child(pit)


## Bloque de cera destructible (escena propia con vida y hurtbox).
func _place_wax(tile: Vector2i) -> void:
	var wax: WaxBlock = WAX_SCENE.instantiate()
	wax.position = tile_center(tile.x, tile.y)
	add_child(wax)


# --- Enemigos y limpieza ---

## Instancia los enemigos: spawns forzados (jefe-placeholder) o casillas de plantilla
## respetando el presupuesto de dificultad (spec §2).
func _spawn_enemies() -> int:
	var count: int = 0
	if not forced_spawns.is_empty():
		# Los forzados (jefe-placeholder) ignoran el presupuesto a propósito.
		var mid: Vector2i = size_tiles / 2
		for i in forced_spawns.size():
			var offset: Vector2i = FORCED_SPAWN_OFFSETS[i % FORCED_SPAWN_OFFSETS.size()]
			count += _spawn_enemy(forced_spawns[i], mid + offset)
		return count
	var pool: Array = DataDB.pools_spawn.get(spawn_pool, [])
	if pool.is_empty():
		return 0
	var budget: int = difficulty_budget
	for tile: Vector2i in _spawn_tiles:
		# Solo candidatos que caben en el presupuesto restante.
		var candidates: Array[String] = []
		for id: Variant in pool:
			if int(DataDB.enemigos.get(id, {}).get("coste_dificultad", 1)) <= budget:
				candidates.append(str(id))
		if candidates.is_empty():
			break
		var chosen: String = candidates[_rng.randi_range(0, candidates.size() - 1)]
		budget -= int(DataDB.enemigos[chosen].get("coste_dificultad", 1))
		count += _spawn_enemy(chosen, tile)
	return count


## Devuelve 1 si el enemigo se creó de verdad (id válido); 0 si no. Contar un id
## inválido dejaría la sala sellada para siempre (muere sin emitir enemy_died).
func _spawn_enemy(id: String, tile: Vector2i) -> int:
	if not DataDB.enemigos.has(id):
		push_error("Room: spawn con id desconocido '%s'" % id)
		return 0
	var enemy: Enemy = ENEMY_SCENE.instantiate()
	enemy.enemy_id = id
	enemy.position = tile_center(tile.x, tile.y)
	add_child(enemy)
	return 1


func _on_enemy_died(enemy: Node) -> void:
	if cleared or not activated or not is_ancestor_of(enemy):
		return
	_alive_enemies -= 1
	if _alive_enemies <= 0:
		_mark_cleared()


func _mark_cleared() -> void:
	cleared = true
	open_doors()
	EventBus.room_cleared.emit(self)
