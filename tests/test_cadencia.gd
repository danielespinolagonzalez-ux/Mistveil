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
	await _test_dash_cancels_combo()
	await _test_counter_qte()
	await _test_audio_placeholders()
	await _test_hot_reload_and_playground()

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
	var sp_counter: int = int(DataDB.get_balance("cadencia.sp_counter_bonus"))
	var combo_hits: int = int(DataDB.get_balance("cadencia.combo_hits_base"))

	await _tap_melee()  # inicia el combo (anillo 1)
	_check("combo: anillo 1 en marcha", player._sync_ring.active)

	# El campanero puede intercalar counters (45%): si el anillo es rojo se hace
	# parry (el combo continúa en el mismo golpe); si es blanco, perfecta.
	var parries: int = 0
	var safety: int = combo_hits * 4
	while _hits.size() < combo_hits and safety > 0 and is_instance_valid(enemy):
		safety -= 1
		# Esperar a que haya anillo en marcha.
		for i in 40:
			if player._sync_ring.active:
				break
			await get_tree().physics_frame
		if not player._sync_ring.active:
			break
		# La detección del input llega 1-2 frames tras action_press: pulsamos un
		# pelín antes de la alineación para caer dentro de la ventana.
		await _advance_to_ms(player._sync_ring, contract_ms - 30.0)
		if player._counter_active:
			parries += 1
			await _tap_parry()
		else:
			await _tap_melee()
		# Dejar que el golpe/QTE termine.
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
	_check("combo: SP por calidad (+ bonus de parries si hubo)",
		RunState.sp == sp_perfect * combo_hits + sp_counter * parries)
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
	# cera_andante: counter_chance 0 → sin anillos rojos, test determinista.
	var enemy: Enemy = ENEMY_SCENE.instantiate()
	enemy.enemy_id = "cera_andante"
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


## Dash a mitad de combo: pierde la cadena pero conserva el SP (subtarea 2.3b).
func _test_dash_cancels_combo() -> void:
	_hits.clear()
	RunState.reset()
	var player: Player = PLAYER_SCENE.instantiate()
	player.position = Vector2(1200, 1200)
	add_child(player)
	# cera_andante: sin counters → la secuencia perfecta+dash es determinista.
	var enemy: Enemy = ENEMY_SCENE.instantiate()
	enemy.enemy_id = "cera_andante"
	enemy.position = player.position + Vector2(30, 0)
	add_child(enemy)
	await get_tree().physics_frame

	var contract_ms: float = float(DataDB.get_balance("cadencia.ring_contract_ms"))
	var sp_perfect: int = int(DataDB.get_balance("cadencia.sp_perfect"))

	await _tap_melee()  # anillo 1
	await _advance_to_ms(player._sync_ring, contract_ms - 30.0)
	await _tap_melee()  # perfecta → SP ganado, encadena anillo 2
	for i in 30:
		await get_tree().physics_frame
		if player._sync_ring.active:
			break
	_check("dash-cancel: anillo 2 en marcha antes del dash", player._sync_ring.active)

	Input.action_press("move_up")
	Input.action_press("dash")
	await get_tree().physics_frame
	await get_tree().physics_frame
	Input.action_release("dash")
	Input.action_release("move_up")
	_check("dash-cancel: el anillo se apaga", not player._sync_ring.active)
	_check("dash-cancel: combo cortado (fase NONE)", player._melee_phase == Player.MeleePhase.NONE)
	_check("dash-cancel: el SP ganado se conserva", RunState.sp == sp_perfect)
	_check("dash-cancel: solo se resolvió 1 golpe", _hits.size() == 1)
	player.queue_free()
	enemy.queue_free()


## QTE de contraataque (tarea 2.4): parry niega, botón equivocado/timeout castiga.
func _test_counter_qte() -> void:
	_hits.clear()
	RunState.reset()
	var counter_events: Array[Dictionary] = []
	EventBus.cadencia_counter_started.connect(func() -> void: counter_events.append({"started": true}))
	EventBus.cadencia_counter_resolved.connect(func(success: bool) -> void: counter_events.append({"success": success}))

	var player: Player = PLAYER_SCENE.instantiate()
	player.position = Vector2(1500, 1500)
	add_child(player)
	var player_health: HealthComponent = player.get_node("HealthComponent")
	var enemy: Enemy = ENEMY_SCENE.instantiate()
	enemy.enemy_id = "campanero"
	enemy.position = player.position + Vector2(30, 0)
	add_child(enemy)
	await get_tree().physics_frame

	var contract_ms: float = float(DataDB.get_balance("cadencia.ring_contract_ms"))
	var sp_counter: int = int(DataDB.get_balance("cadencia.sp_counter_bonus"))
	var counter_damage: int = int(DataDB.get_balance("cadencia.counter_damage"))

	# Counter forzado (sin depender del azar del 45%).
	await _tap_melee()
	player._sync_ring.stop()
	player._start_counter_ring()
	_check("counter: anillo rojo activo", player._counter_active and player._sync_ring.counter_mode)
	_check("counter: avisa por EventBus", counter_events.size() >= 1 and counter_events[0].has("started"))

	# Éxito: parry dentro de la ventana → SP bonus y el combo continúa (anillo normal).
	await _advance_to_ms(player._sync_ring, contract_ms - 30.0)
	await _tap_parry()
	_check("counter: parry a tiempo niega y da SP", RunState.sp == sp_counter)
	_check("counter: el combo continúa con anillo normal",
		player._sync_ring.active and not player._sync_ring.counter_mode and not player._counter_active)

	# Botón equivocado: melee durante el counter = golpe encajado y corte.
	player._sync_ring.stop()
	player._start_counter_ring()
	var hp_before: int = player_health.current_hp
	await _tap_melee()
	_check("counter: melee (botón equivocado) castiga con counter_damage",
		player_health.current_hp == hp_before - counter_damage)
	_check("counter: combo cortado tras fallo", not player._sync_ring.active and not player._counter_active)

	# Timeout: no pulsar nada también castiga.
	for i in 60:
		await get_tree().physics_frame
		if player._melee_phase == Player.MeleePhase.NONE:
			break
	await _tap_melee()  # nuevo combo (el anillo puede salir rojo por azar: da igual)
	player._sync_ring.stop()
	player._start_counter_ring()
	hp_before = player_health.current_hp
	for i in 90:
		await get_tree().physics_frame
		if not player._sync_ring.active:
			break
	await get_tree().physics_frame
	_check("counter: timeout también castiga", player_health.current_hp == hp_before - counter_damage)

	player.queue_free()
	enemy.queue_free()


## Audio placeholder (tarea 2.5): 4 beeps sintetizados y disparo por señales.
func _test_audio_placeholders() -> void:
	for id: String in ["cadencia_perfecta", "cadencia_buena", "cadencia_fallo", "cadencia_counter"]:
		_check("audio: sfx '%s' disponible" % id, AudioManager.has_sfx(id))
	# La señal de golpe perfecto pone una voz a sonar.
	EventBus.cadencia_hit_resolved.emit(SyncRing.Quality.PERFECT, 1, false)
	await get_tree().process_frame
	var any_playing: bool = false
	for child in AudioManager.get_children():
		if child is AudioStreamPlayer and (child as AudioStreamPlayer).playing:
			any_playing = true
	_check("audio: un golpe perfecto dispara una voz", any_playing)


## Recarga en caliente (tarea 2.6): data_reloaded fuerza releer todos los parámetros.
func _test_hot_reload_and_playground() -> void:
	var player: Player = PLAYER_SCENE.instantiate()
	player.position = Vector2(1800, 1800)
	add_child(player)
	await get_tree().physics_frame
	player._window_perfect_ms = 9999.0
	player._mult_perfect = -1.0
	EventBus.data_reloaded.emit()
	_check("F5: los parámetros de Cadencia se releen al recargar",
		player._window_perfect_ms == float(DataDB.get_balance("cadencia.window_perfect_ms"))
		and player._mult_perfect == float(DataDB.get_balance("cadencia.mult_perfect")))
	player.queue_free()

	# El playground carga con su dummy de entrenamiento.
	var playground: Node2D = (load("res://tests/cadencia_playground.tscn") as PackedScene).instantiate()
	add_child(playground)
	await get_tree().physics_frame
	await get_tree().physics_frame
	var dummy_found: bool = false
	for child in playground.get_children():
		if child is Enemy and (child as Enemy).enemy_id == "dummy_entrenamiento":
			dummy_found = true
	_check("playground: carga con dummy de entrenamiento", dummy_found)
	playground.queue_free()


func _tap_melee() -> void:
	# Dos frames pulsado: is_action_just_pressed se ve en el frame siguiente al press.
	Input.action_press("melee")
	await get_tree().physics_frame
	await get_tree().physics_frame
	Input.action_release("melee")


func _tap_parry() -> void:
	Input.action_press("parry")
	await get_tree().physics_frame
	await get_tree().physics_frame
	Input.action_release("parry")


## Avanza frames de física hasta que el anillo alcance (o pase) los ms pedidos.
func _advance_to_ms(ring: SyncRing, target_ms: float) -> void:
	while ring.active and ring.elapsed_ms() < target_ms:
		await get_tree().physics_frame


func _check(nombre: String, ok: bool) -> void:
	print(("  [OK]   " if ok else "  [FALLO] ") + nombre)
	if not ok:
		_failures += 1
