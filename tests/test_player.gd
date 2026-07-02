extends Node
## Test del player: daño por contacto, i-frames y muerte (tarea 1.3). Ejecutar:
##   godot --headless res://tests/test_player.tscn
## Usa await de frames de física (justificado: test de solapes y temporizadores).

const PLAYER_SCENE: PackedScene = preload("res://scenes/player/player.tscn")
const DEFEAT_SCENE: PackedScene = preload("res://scenes/ui/defeat_screen.tscn")

const LAYER_ENEMY_ATTACK := 1 << 4
const LAYER_PLAYER_HURT := 1 << 5

var _failures: int = 0
var _player_died_count: int = 0


func _ready() -> void:
	EventBus.player_died.connect(func() -> void: _player_died_count += 1)

	var player: Player = PLAYER_SCENE.instantiate()
	player.position = Vector2.ZERO
	add_child(player)
	var health: HealthComponent = player.get_node("HealthComponent")
	var hurtbox: HurtboxComponent = player.get_node("HurtboxComponent")

	_check("vida inicial = balance player.max_hp",
		health.max_hp == int(DataDB.get_balance("player.max_hp")) and health.current_hp == health.max_hp)

	# Golpe de contacto: hitbox del bando enemigo solapando al player.
	var hitbox := HitboxComponent.new()
	hitbox.damage = 1.0
	hitbox.collision_layer = LAYER_ENEMY_ATTACK
	hitbox.collision_mask = LAYER_PLAYER_HURT
	var shape := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = 30.0
	shape.shape = circle
	hitbox.add_child(shape)
	add_child(hitbox)
	await get_tree().physics_frame
	await get_tree().physics_frame

	_check("contacto: pierde 1 de vida", health.current_hp == health.max_hp - 1)
	_check("contacto: activa i-frames", hurtbox.invulnerable)

	# Durante los i-frames el solape continuo no vuelve a dañar.
	for i in 10:
		await get_tree().physics_frame
	_check("i-frames: sin daño extra mientras duran", health.current_hp == health.max_hp - 1)

	# Al agotarse (hurt_iframes_s) vuelve a ser vulnerable y visible.
	hitbox.queue_free()
	var iframes_s: float = float(DataDB.get_balance("player.hurt_iframes_s"))
	var frames: int = int(ceil(iframes_s * 60.0)) + 10
	for i in frames:
		await get_tree().physics_frame
	_check("i-frames: expiran y vuelve a ser vulnerable", not hurtbox.invulnerable)
	_check("i-frames: el placeholder queda visible", (player.get_node("Placeholder") as Polygon2D).visible)

	# Muerte → player_died y el player se oculta/desactiva.
	health.take_damage(999)
	_check("muerte: emite EventBus.player_died", _player_died_count == 1)
	await get_tree().physics_frame
	_check("muerte: el player se oculta", not player.visible)

	# Pantalla de derrota: se muestra con textos resueltos al morir.
	var defeat: CanvasLayer = DEFEAT_SCENE.instantiate()
	add_child(defeat)
	await get_tree().process_frame
	_check("derrota: oculta por defecto", not defeat.visible)
	EventBus.player_died.emit()
	_check("derrota: visible tras player_died", defeat.visible)
	_check("derrota: título desde textos_es.json",
		(defeat.get_node("Overlay/Title") as Label).text == DataDB.get_text("ui.muerte"))

	# Melé básico (tarea 2.1): pulsar melee golpea con hitbox frontal hacia el aim.
	var fighter: Player = PLAYER_SCENE.instantiate()
	fighter.position = Vector2(0, 200)
	add_child(fighter)
	var melee_hits: Array[HitboxComponent] = []
	var dummy := HurtboxComponent.new()
	dummy.collision_layer = 1 << 6
	dummy.collision_mask = 1 << 3
	var dummy_shape := CollisionShape2D.new()
	var dummy_circle := CircleShape2D.new()
	dummy_circle.radius = 10.0
	dummy_shape.shape = dummy_circle
	dummy.add_child(dummy_shape)
	dummy.position = fighter.position + Vector2(float(DataDB.get_balance("player.melee_range_px")) * 0.6, 0)
	dummy.hurt_by.connect(func(hitbox: HitboxComponent) -> void: melee_hits.append(hitbox))
	add_child(dummy)
	await get_tree().physics_frame
	Input.action_press("aim_right")  # fija el aim a la derecha (prioridad de stick)
	Input.action_press("melee")
	await get_tree().physics_frame
	Input.action_release("melee")
	# Cubrir windup + ventana activa (timers por delta fija de física).
	var melee_frames: int = int(ceil((float(DataDB.get_balance("player.melee_windup_s"))
		+ float(DataDB.get_balance("player.melee_active_s"))) * 60.0)) + 10
	for i in melee_frames:
		await get_tree().physics_frame
	Input.action_release("aim_right")
	_check("melé: el golpe frontal alcanza al dummy", melee_hits.size() >= 1)
	if melee_hits.size() >= 1:
		_check("melé: daño desde balance player.melee_damage",
			melee_hits[0].damage == float(DataDB.get_balance("player.melee_damage")))
	fighter.queue_free()
	dummy.queue_free()

	# HUD (tarea 1.5): corazones = hp y contador de oro vía señales.
	var hud: CanvasLayer = (load("res://scenes/ui/hud.tscn") as PackedScene).instantiate()
	add_child(hud)
	await get_tree().process_frame
	var hearts: HBoxContainer = hud.get_node("Margin/Rows/Hearts")
	EventBus.player_health_changed.emit(4, 6)
	_check("hud: 6 corazones con máximo 6", hearts.get_child_count() == 6)
	var full_count: int = 0
	for heart in hearts.get_children():
		if (heart as ColorRect).color.r > 0.5:
			full_count += 1
	_check("hud: 4 corazones llenos con vida 4", full_count == 4)
	RunState.add_gold(7)
	_check("hud: contador de oro refleja RunState",
		(hud.get_node("Margin/Rows/GoldRow/GoldLabel") as Label).text == "7")

	if _failures == 0:
		print("TEST PLAYER: OK")
		get_tree().quit(0)
	else:
		print("TEST PLAYER: %d fallo(s)" % _failures)
		get_tree().quit(1)


func _check(nombre: String, ok: bool) -> void:
	print(("  [OK]   " if ok else "  [FALLO] ") + nombre)
	if not ok:
		_failures += 1
