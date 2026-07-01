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
