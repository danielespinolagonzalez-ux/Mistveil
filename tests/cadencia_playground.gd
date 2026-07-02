extends Node2D
## Playground de tuning de la Cadencia (tarea 2.6). NO es un test automático:
## abrir en el editor (o `godot res://tests/cadencia_playground.tscn`), pegar al
## dummy, tocar valores en data/balance.json y pulsar F5 para sentirlos al momento.

const ENEMY_SCENE: PackedScene = preload("res://scenes/enemies/enemy.tscn")
const DUMMY_SPAWN := Vector2(400, 180)

@onready var _info: Label = $Panel/Info
@onready var _sp_label: Label = $Panel/SP
@onready var _quality_label: Label = $Panel/Quality


func _ready() -> void:
	_info.text = DataDB.get_text("debug.playground.info")
	_update_sp(RunState.sp, int(DataDB.get_balance("dragoon.sp_max")))
	EventBus.sp_changed.connect(_update_sp)
	EventBus.cadencia_hit_resolved.connect(_on_hit_resolved)
	EventBus.cadencia_counter_resolved.connect(_on_counter_resolved)
	EventBus.enemy_died.connect(_on_enemy_died)
	_spawn_dummy()


func _spawn_dummy() -> void:
	var dummy: Enemy = ENEMY_SCENE.instantiate()
	dummy.enemy_id = "dummy_entrenamiento"
	dummy.position = DUMMY_SPAWN
	add_child(dummy)


func _update_sp(current: int, max_sp: int) -> void:
	_sp_label.text = "%s %d / %d" % [DataDB.get_text("debug.playground.sp"), current, max_sp]


func _on_hit_resolved(quality: int, hit_index: int, is_finisher: bool) -> void:
	var text: String
	match quality:
		SyncRing.Quality.PERFECT:
			text = DataDB.get_text("debug.playground.perfecta")
		SyncRing.Quality.GOOD:
			text = DataDB.get_text("debug.playground.buena")
		_:
			text = DataDB.get_text("debug.playground.fallo")
	_quality_label.text = "%d· %s%s" % [hit_index, text, " ★" if is_finisher else ""]


func _on_counter_resolved(success: bool) -> void:
	_quality_label.text = DataDB.get_text("debug.playground.parry_ok" if success else "debug.playground.parry_fallo")


func _on_enemy_died(_enemy: Node) -> void:
	# El dummy es (casi) inmortal, pero si cae, reaparece al instante.
	_spawn_dummy.call_deferred()
