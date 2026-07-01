class_name Player
extends CharacterBody2D
## Pip — movimiento twin-stick de 8 direcciones y disparo de lágrimas de tinta.
## Todos los valores vienen de balance.json vía DataDB; se releen con F5 (data_reloaded).

## Distancia del centro al punto de salida del proyectil (ligada al tamaño del placeholder).
const MUZZLE_OFFSET_PX := 10.0

var _move_speed: float = 0.0
var _acceleration: float = 0.0
var _friction: float = 0.0
var _tear_speed: float = 0.0
var _tear_range_px: float = 0.0
var _tear_rate_per_s: float = 0.0
var _tear_damage: float = 0.0

var _shoot_cooldown_s: float = 0.0


func _ready() -> void:
	_refresh_balance()
	EventBus.data_reloaded.connect(_refresh_balance)


func _physics_process(delta: float) -> void:
	_process_movement(delta)
	_process_shooting(delta)


func _process_movement(delta: float) -> void:
	var input_dir: Vector2 = Input.get_vector("move_left", "move_right", "move_up", "move_down")
	if input_dir != Vector2.ZERO:
		velocity = velocity.move_toward(input_dir * _move_speed, _acceleration * delta)
	else:
		velocity = velocity.move_toward(Vector2.ZERO, _friction * delta)
	move_and_slide()


func _process_shooting(delta: float) -> void:
	_shoot_cooldown_s = maxf(0.0, _shoot_cooldown_s - delta)
	var stick_aim: Vector2 = Input.get_vector("aim_left", "aim_right", "aim_up", "aim_down")
	# Convención twin-stick: desviar el stick derecho ya dispara; con ratón hace falta `shoot`.
	var wants_shoot: bool = stick_aim != Vector2.ZERO or Input.is_action_pressed("shoot")
	if not wants_shoot or _shoot_cooldown_s > 0.0:
		return
	var aim: Vector2 = _aim_direction(stick_aim)
	if aim == Vector2.ZERO:
		return
	EventBus.tear_fired.emit(global_position + aim * MUZZLE_OFFSET_PX, aim, _tear_speed, _tear_range_px, _tear_damage)
	_shoot_cooldown_s = 1.0 / _tear_rate_per_s


## El stick derecho tiene prioridad; si está en reposo se apunta al ratón.
func _aim_direction(stick_aim: Vector2) -> Vector2:
	if stick_aim != Vector2.ZERO:
		return stick_aim.normalized()
	return (get_global_mouse_position() - global_position).normalized()


func _refresh_balance() -> void:
	_move_speed = float(DataDB.get_balance("player.move_speed"))
	_acceleration = float(DataDB.get_balance("player.acceleration"))
	_friction = float(DataDB.get_balance("player.friction"))
	_tear_speed = float(DataDB.get_balance("player.tear_speed"))
	_tear_range_px = float(DataDB.get_balance("player.tear_range_px"))
	_tear_rate_per_s = maxf(0.1, float(DataDB.get_balance("player.tear_rate_per_s")))
	_tear_damage = float(DataDB.get_balance("player.tear_damage"))
