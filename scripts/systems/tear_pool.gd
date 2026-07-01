class_name TearPool
extends Node2D
## TearPool — object pooling de lágrimas de tinta. Escucha EventBus.tear_fired.
## Crece bajo demanda y reutiliza las lágrimas desactivadas (nunca libera nodos).

const TEAR_SCENE: PackedScene = preload("res://scenes/player/tear.tscn")

var _free: Array[Tear] = []


func _ready() -> void:
	EventBus.tear_fired.connect(_on_tear_fired)


func _on_tear_fired(origin: Vector2, direction: Vector2, speed: float, range_px: float, damage: float) -> void:
	_acquire().fire(origin, direction, speed, range_px, damage)


func _acquire() -> Tear:
	if _free.is_empty():
		var tear: Tear = TEAR_SCENE.instantiate()
		add_child(tear)
		tear.expired.connect(_on_tear_expired)
		return tear
	return _free.pop_back()


func _on_tear_expired(tear: Tear) -> void:
	_free.append(tear)


## Nº de lágrimas instanciadas (para tests y debug).
func total_count() -> int:
	return get_child_count()
