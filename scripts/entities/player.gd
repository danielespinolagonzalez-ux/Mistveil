class_name Player
extends CharacterBody2D
## Pip — movimiento twin-stick de 8 direcciones con aceleración/fricción.
## Todos los valores vienen de balance.json vía DataDB; se releen con F5 (data_reloaded).

var _move_speed: float = 0.0
var _acceleration: float = 0.0
var _friction: float = 0.0


func _ready() -> void:
	_refresh_balance()
	EventBus.data_reloaded.connect(_refresh_balance)


func _physics_process(delta: float) -> void:
	var input_dir: Vector2 = Input.get_vector("move_left", "move_right", "move_up", "move_down")
	if input_dir != Vector2.ZERO:
		velocity = velocity.move_toward(input_dir * _move_speed, _acceleration * delta)
	else:
		velocity = velocity.move_toward(Vector2.ZERO, _friction * delta)
	move_and_slide()


func _refresh_balance() -> void:
	_move_speed = float(DataDB.get_balance("player.move_speed"))
	_acceleration = float(DataDB.get_balance("player.acceleration"))
	_friction = float(DataDB.get_balance("player.friction"))
