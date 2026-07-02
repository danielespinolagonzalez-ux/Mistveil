extends Node
## Test del anillo de sincronía (tarea 2.2). Ejecutar:
##   godot --headless res://tests/test_cadencia.tscn
## La física corre a delta fija (1/60 s ≈ 16,7 ms): los juicios se hacen lejos de
## los bordes de ventana para que un frame arriba/abajo no cambie el resultado.

const PLAYER_SCENE: PackedScene = preload("res://scenes/player/player.tscn")
const ENEMY_SCENE: PackedScene = preload("res://scenes/enemies/enemy.tscn")

var _failures: int = 0


var _hits: Array[Dictionary] = []


func _ready() -> void:
	EventBus.cadencia_hit_resolved.connect(
		func(quality: int, hit_index: int, is_finisher: bool) -> void:
			_hits.append({"quality": quality, "index": hit_index, "finisher": is_finisher}))

	await _test_ring_windows()
	await _test_ring_target_lost()
	await _test_player_integration()
	await _test_combo_chain()
	await _test_combo_fail_cuts()

	if _failures == 0:
		print("TEST CADENCIA: OK")
		get_tree().quit(0)
	else:
		print("TEST CADENCIA: %d fallo(s)" % _failures)
		get_tree().quit(1)


func _test_ring_windows() -> void:
	# Tiempos de test redondos e independientes de balance: contracción 600 ms,
	# perfecta ±60 (120), buena ±115 (230), coyote 40.
	var target := Node2D.new()
	add_child(target)
	var ring := SyncRing.new()
	add_child(ring)
	# Contador en array: las lambdas de GDScript capturan los int por valor.
	var closed: Array[int] = [0]
	ring.window_closed.connect(func() -> void: closed[0] += 1)
	ring.start(target, 600.0, 120.0, 230.0)

	_check("anillo: activo y visible al arrancar", ring.active and ring.visible)

	await _advance_to_ms(ring, 100.0)  # muy pronto
	_check("anillo: pulsar muy pronto = FAIL (ni con coyote)",
		ring.judge_now(40.0) == SyncRing.Quality.FAIL)

	# ~90 ms antes: fuera de la perfecta (±60) pero el coyote (40) la alcanza.
	await _advance_to_ms(ring, 510.0)
	_check("anillo: adelanto salvado por coyote = PERFECT",
		ring.judge_now(40.0) == SyncRing.Quality.PERFECT)
	_check("anillo: mismo instante sin coyote = GOOD",
		ring.judge_now() == SyncRing.Quality.GOOD)

	await _advance_to_ms(ring, 600.0)  # alineación exacta
	_check("anillo: en la alineación = PERFECT", ring.judge_now() == SyncRing.Quality.PERFECT)

	await _advance_to_ms(ring, 690.0)  # +90 ms tarde: buena, no perfecta
	_check("anillo: tarde dentro de buena = GOOD", ring.judge_now() == SyncRing.Quality.GOOD)
	_check("anillo: sigue el objetivo", ring.global_position == target.global_position)

	# Pasada la mitad tardía de la buena (600+115) el anillo cierra y avisa.
	for i in 20:
		await get_tree().physics_frame
	_check("anillo: cierra tras la ventana buena", closed[0] == 1 and not ring.active)
	ring.queue_free()
	target.queue_free()


func _test_ring_target_lost() -> void:
	var target := Node2D.new()
	add_child(target)
	var ring := SyncRing.new()
	add_child(ring)
	var closed: Array[int] = [0]
	ring.window_closed.connect(func() -> void: closed[0] += 1)
	ring.start(target, 600.0, 120.0, 230.0)
	await get_tree().physics_frame
	target.free()
	await get_tree().physics_frame
	_check("anillo: objetivo eliminado → cierra y avisa", closed[0] == 1 and not ring.active)
	ring.queue_free()


func _test_player_integration() -> void:
	# Melé cerca de un enemigo → el anillo arranca sobre él con valores de balance.
	var player: Player = PLAYER_SCENE.instantiate()
	player.position = Vector2(300, 300)
	add_child(player)
	var enemy: Enemy = ENEMY_SCENE.instantiate()
	enemy.enemy_id = "cera_andante"
	enemy.position = player.position + Vector2(30, 0)
	add_child(enemy)
	await get_tree().physics_frame
	player._begin_melee()
	_check("player: melé cerca de enemigo activa el anillo", player._sync_ring.active)
	_check("player: el anillo está sobre el enemigo",
		player._sync_ring.global_position.distance_to(enemy.global_position) < 20.0)
	player.queue_free()
	enemy.queue_free()

	# Sin enemigos cerca no hay anillo.
	var lonely: Player = PLAYER_SCENE.instantiate()
	lonely.position = Vector2(-500, -500)
	add_child(lonely)
	await get_tree().physics_frame
	lonely._begin_melee()
	_check("player: melé sin objetivo no activa anillo", not lonely._sync_ring.active)
	lonely.queue_free()


## Combo completo (tarea 2.3): 3 aciertos encadenan y el 3.º es finisher.
func _test_combo_chain() -> void:
	_hits.clear()
	RunState.reset()
	var player: Player = PLAYER_SCENE.instantiate()
	player.position = Vector2(600, 600)
	add_child(player)
	# Campanero: 22 hp aguanta 2 perfectos (8+8) y muere con el finisher (12).
	var enemy: Enemy = ENEMY_SCENE.instantiate()
	enemy.enemy_id = "campanero"
	enemy.position = player.position + Vector2(30, 0)
	add_child(enemy)
	var enemy_health: HealthComponent = enemy.get_node("HealthComponent")
	await get_tree().physics_frame

	var contract_ms: float = float(DataDB.get_balance("cadencia.ring_contract_ms"))
	var sp_perfect: int = int(DataDB.get_balance("cadencia.sp_perfect"))
	var combo_hits: int = int(DataDB.get_balance("cadencia.combo_hits_base"))

	await _tap_melee()  # inicia el combo (anillo 1)
	_check("combo: anillo 1 en marcha", player._sync_ring.active)

	for hit in combo_hits:
		# La detección del input llega 1-2 frames tras action_press: pulsamos un
		# pelín antes de la alineación para caer dentro de la perfecta.
		await _advance_to_ms(player._sync_ring, contract_ms - 30.0)
		await _tap_melee()  # pulsación en la alineación = perfecta
		# Esperar a que el golpe termine y (si toca) arranque el siguiente anillo.
		for i in 30:
			await get_tree().physics_frame
			if player._sync_ring.active or player._melee_phase == Player.MeleePhase.RECOVERY \
					or player._melee_phase == Player.MeleePhase.NONE:
				break

	_check("combo: 3 golpes resueltos", _hits.size() == combo_hits)
	if _hits.size() == combo_hits:
		var all_perfect: bool = true
		for hit in _hits:
			if hit["quality"] != SyncRing.Quality.PERFECT:
				all_perfect = false
		_check("combo: todos los golpes perfectos", all_perfect)
		_check("combo: el último es finisher y los demás no",
			_hits[combo_hits - 1]["finisher"] and not _hits[0]["finisher"])
	_check("combo: SP ganado por calidad", RunState.sp == sp_perfect * combo_hits)
	# Daño: 2 golpes ×1.6 (8) + finisher ×1.6×1.5 (12) = 28 ≥ 22 → muere.
	_check("combo: el campanero cae con el finisher", not is_instance_valid(enemy) or enemy_health.is_dead)
	player.queue_free()
	if is_instance_valid(enemy):
		enemy.queue_free()


## Fallar (timeout del anillo) ejecuta golpe débil y corta el combo (tarea 2.3).
func _test_combo_fail_cuts() -> void:
	_hits.clear()
	RunState.reset()
	var player: Player = PLAYER_SCENE.instantiate()
	player.position = Vector2(900, 900)
	add_child(player)
	var enemy: Enemy = ENEMY_SCENE.instantiate()
	enemy.enemy_id = "campanero"
	enemy.position = player.position + Vector2(30, 0)
	add_child(enemy)
	var enemy_health: HealthComponent = enemy.get_node("HealthComponent")
	await get_tree().physics_frame

	await _tap_melee()  # inicia combo; no volvemos a pulsar → timeout = fallo
	for i in 90:
		await get_tree().physics_frame
		if _hits.size() > 0:
			break
	_check("fallo: timeout resuelve como FAIL",
		_hits.size() == 1 and _hits[0]["quality"] == SyncRing.Quality.FAIL)
	_check("fallo: sin SP", RunState.sp == 0)
	# Golpe débil: 5 × 0.4 = 2 de daño.
	for i in 20:
		await get_tree().physics_frame
	_check("fallo: golpe débil aplicado", enemy_health.current_hp == enemy_health.max_hp - 2)
	_check("fallo: el combo queda cortado (sin anillo nuevo)",
		not player._sync_ring.active and _hits.size() == 1)
	player.queue_free()
	enemy.queue_free()


func _tap_melee() -> void:
	# Dos frames pulsado: is_action_just_pressed se ve en el frame siguiente al press.
	Input.action_press("melee")
	await get_tree().physics_frame
	await get_tree().physics_frame
	Input.action_release("melee")


## Avanza frames de física hasta que el anillo alcance (o pase) los ms pedidos.
func _advance_to_ms(ring: SyncRing, target_ms: float) -> void:
	while ring.active and ring.elapsed_ms() < target_ms:
		await get_tree().physics_frame


func _check(nombre: String, ok: bool) -> void:
	print(("  [OK]   " if ok else "  [FALLO] ") + nombre)
	if not ok:
		_failures += 1
