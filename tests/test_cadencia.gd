extends Node
## Test del anillo de sincronía (tarea 2.2). Ejecutar:
##   godot --headless res://tests/test_cadencia.tscn
## La física corre a delta fija (1/60 s ≈ 16,7 ms): los juicios se hacen lejos de
## los bordes de ventana para que un frame arriba/abajo no cambie el resultado.

const PLAYER_SCENE: PackedScene = preload("res://scenes/player/player.tscn")
const ENEMY_SCENE: PackedScene = preload("res://scenes/enemies/enemy.tscn")

var _failures: int = 0


func _ready() -> void:
	await _test_ring_windows()
	await _test_ring_target_lost()
	await _test_player_integration()

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
	player._start_melee()
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
	lonely._start_melee()
	_check("player: melé sin objetivo no activa anillo", not lonely._sync_ring.active)
	lonely.queue_free()


## Avanza frames de física hasta que el anillo alcance (o pase) los ms pedidos.
func _advance_to_ms(ring: SyncRing, target_ms: float) -> void:
	while ring.active and ring.elapsed_ms() < target_ms:
		await get_tree().physics_frame


func _check(nombre: String, ok: bool) -> void:
	print(("  [OK]   " if ok else "  [FALLO] ") + nombre)
	if not ok:
		_failures += 1
