extends Node
## Test del enemigo data-driven (tarea 1.2). Ejecutar:
##   godot --headless res://tests/test_enemy.tscn
## Usa await de frames de física para probar persecución e impactos (justificado: test).

const ENEMY_SCENE: PackedScene = preload("res://scenes/enemies/enemy.tscn")

const LAYER_PLAYER_ATTACK := 1 << 3
const LAYER_ENEMY_HURT := 1 << 6

var _failures: int = 0
var _died_events: Array[Node] = []


func _ready() -> void:
	EventBus.enemy_died.connect(func(enemy: Node) -> void: _died_events.append(enemy))

	# Stub del player: al enemigo solo le importa el grupo "player" y la posición.
	var player_stub := Node2D.new()
	player_stub.add_to_group("player")
	player_stub.position = Vector2.ZERO
	add_child(player_stub)

	var enemy: Enemy = ENEMY_SCENE.instantiate()
	enemy.enemy_id = "cera_andante"
	enemy.position = Vector2.ZERO
	add_child(enemy)

	var health: HealthComponent = enemy.get_node("HealthComponent")
	var def: Dictionary = DataDB.enemigos["cera_andante"]
	_check("carga hp desde enemigos.json", health.max_hp == int(def["hp"]))
	_check("hitbox de contacto con daño del JSON",
		(enemy.get_node("HitboxComponent") as HitboxComponent).damage == float(def["dano_contacto"]))

	# Daño: un hitbox del bando player solapando su hurtbox (como una lágrima parada).
	var hitbox := HitboxComponent.new()
	hitbox.damage = 3.5
	hitbox.collision_layer = LAYER_PLAYER_ATTACK
	hitbox.collision_mask = LAYER_ENEMY_HURT
	var shape := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = 30.0
	shape.shape = circle
	hitbox.add_child(shape)
	add_child(hitbox)
	await get_tree().physics_frame
	await get_tree().physics_frame
	# roundi(3.5) = 4 según la fórmula (entero más cercano, mínimo 1).
	_check("recibe daño redondeado vía hurt_by", health.current_hp == health.max_hp - 4)
	hitbox.queue_free()

	# Persecución: player lejos a la izquierda → el enemigo debe moverse hacia él.
	player_stub.position = Vector2(-300, 0)
	var start_x: float = enemy.position.x
	for i in 10:
		await get_tree().physics_frame
	_check("chase: se mueve hacia el player", enemy.position.x < start_x)

	# Muerte: al llegar a 0 emite enemy_died por EventBus y se libera.
	health.take_damage(999)
	_check("al morir emite EventBus.enemy_died", _died_events.size() == 1 and _died_events[0] == enemy)
	await get_tree().physics_frame
	_check("al morir se libera de la escena", not is_instance_valid(enemy))

	# Torreta (tejedor_horas): no se mueve y dispara hacia el player con su cadencia.
	var shots: Array = []
	EventBus.enemy_projectile_fired.connect(
		func(origin: Vector2, dir: Vector2, speed: float, range_px: float, damage: float) -> void:
			shots.append({"origin": origin, "dir": dir, "speed": speed, "range": range_px, "damage": damage}))
	player_stub.position = Vector2(200, 0)
	var turret: Enemy = ENEMY_SCENE.instantiate()
	turret.enemy_id = "tejedor_horas"
	turret.position = Vector2.ZERO
	add_child(turret)
	var turret_def: Dictionary = DataDB.enemigos["tejedor_horas"]
	var cadence_frames: int = int(ceil(float(turret_def["proyectil"]["cadencia_s"]) * 60.0)) + 15
	for i in cadence_frames:
		await get_tree().physics_frame
	_check("turret: dispara al menos una vez tras su cadencia", shots.size() >= 1)
	if shots.size() >= 1:
		_check("turret: apunta hacia el player", shots[0]["dir"].x > 0.9)
		_check("turret: stats del proyectil desde el JSON",
			shots[0]["speed"] == float(turret_def["proyectil"]["velocidad"])
			and shots[0]["range"] == float(turret_def["proyectil"]["alcance_px"])
			and shots[0]["damage"] == float(turret_def["proyectil"]["dano"]))
	_check("turret: permanece anclada", turret.position == Vector2.ZERO)
	turret.queue_free()

	# Volador errático (engranaje_errante): se mueve solo, sin necesidad de player.
	var wanderer: Enemy = ENEMY_SCENE.instantiate()
	wanderer.enemy_id = "engranaje_errante"
	wanderer.position = Vector2(320, 180)
	add_child(wanderer)
	var wander_start: Vector2 = wanderer.position
	for i in 20:
		await get_tree().physics_frame
	_check("wander_bounce: se mueve errático", wanderer.position.distance_to(wander_start) > 10.0)
	wanderer.queue_free()

	# Pool de proyectiles enemigos: la señal activa una bala reutilizable.
	var pool := EnemyProjectilePool.new()
	add_child(pool)
	EventBus.enemy_projectile_fired.emit(Vector2.ZERO, Vector2.RIGHT, 100.0, 50.0, 1.0)
	_check("pool enemigo: disparar activa 1 proyectil", pool.total_count() == 1)
	pool.queue_free()

	# Id desconocido: error claro y se autodestruye sin romper la escena.
	var bad: Enemy = ENEMY_SCENE.instantiate()
	bad.enemy_id = "no_existe"
	add_child(bad)
	await get_tree().physics_frame
	_check("id desconocido se autodestruye", not is_instance_valid(bad) or bad.is_queued_for_deletion())

	if _failures == 0:
		print("TEST ENEMY: OK")
		get_tree().quit(0)
	else:
		print("TEST ENEMY: %d fallo(s)" % _failures)
		get_tree().quit(1)


func _check(nombre: String, ok: bool) -> void:
	print(("  [OK]   " if ok else "  [FALLO] ") + nombre)
	if not ok:
		_failures += 1
