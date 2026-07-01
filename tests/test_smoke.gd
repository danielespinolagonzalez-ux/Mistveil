extends Node
## Test de humo de la Fase 0. Ejecutar:
##   godot --headless res://tests/test_smoke.tscn
## Sale con código 0 si todo pasa, 1 si algo falla.

var _failures: int = 0


func _ready() -> void:
	# Los autoloads ya están inicializados (van antes que la escena principal).
	_check("DataDB carga y valida sin errores", DataDB.load_ok)
	_check("balance: player.move_speed > 0", float(DataDB.get_balance("player.move_speed")) > 0.0)
	_check("balance: cadencia.window_perfect_ms > 0", float(DataDB.get_balance("cadencia.window_perfect_ms")) > 0.0)
	_check("textos: ui.titulo resuelve", DataDB.get_text("ui.titulo") != "ui.titulo")
	_check("enemigos: cera_andante definida", DataDB.enemigos.has("cera_andante"))

	var main_scene: PackedScene = load("res://scenes/main/main.tscn")
	_check("main.tscn carga", main_scene != null)
	if main_scene != null:
		var main: Node = main_scene.instantiate()
		add_child(main)
		var player: Node = main.get_node_or_null("Player")
		_check("main.tscn contiene un Player", player is Player)
		var pool: Node = main.get_node_or_null("TearPool")
		_check("main.tscn contiene un TearPool", pool is TearPool)
		if pool is TearPool:
			EventBus.tear_fired.emit(Vector2.ZERO, Vector2.RIGHT, 100.0, 50.0, 1.0, 0.0)
			_check("pooling: disparar activa 1 lágrima", (pool as TearPool).total_count() == 1)
			EventBus.tear_fired.emit(Vector2.ZERO, Vector2.RIGHT, 100.0, 50.0, 1.0, 0.0)
			_check("pooling: segundo disparo simultáneo = 2 lágrimas", (pool as TearPool).total_count() == 2)

	if _failures == 0:
		print("TEST SMOKE: OK")
		get_tree().quit(0)
	else:
		print("TEST SMOKE: %d fallo(s)" % _failures)
		get_tree().quit(1)


func _check(nombre: String, ok: bool) -> void:
	print(("  [OK]   " if ok else "  [FALLO] ") + nombre)
	if not ok:
		_failures += 1
