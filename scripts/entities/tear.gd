class_name Tear
extends Area2D
## Lágrima de tinta — proyectil del player. Vive en un pool: no se libera,
## se desactiva al agotar su alcance y TearPool la reutiliza.

## Emitida al desactivarse para que el pool la recicle.
signal expired(tear: Tear)

var _direction: Vector2 = Vector2.ZERO
var _speed: float = 0.0
var _range_px: float = 0.0
var _traveled: float = 0.0


func _ready() -> void:
	_deactivate_silent()


## Pone la lágrima en juego. Los stats llegan por parámetro (los posee el player).
func fire(origin: Vector2, direction: Vector2, speed: float, range_px: float) -> void:
	global_position = origin
	_direction = direction.normalized()
	_speed = speed
	_range_px = range_px
	_traveled = 0.0
	visible = true
	set_physics_process(true)


func _physics_process(delta: float) -> void:
	var step: Vector2 = _direction * _speed * delta
	global_position += step
	_traveled += step.length()
	if _traveled >= _range_px:
		_deactivate()


func _deactivate() -> void:
	_deactivate_silent()
	expired.emit(self)


func _deactivate_silent() -> void:
	visible = false
	set_physics_process(false)
