class_name Player
extends CharacterBody2D
## Pip — movimiento twin-stick de 8 direcciones, disparo de lágrimas y vida con i-frames.
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
var _hurt_iframes_s: float = 0.0
var _hurt_blink_hz: float = 1.0

var _shoot_cooldown_s: float = 0.0
var _iframes_left_s: float = 0.0
var _dead: bool = false

@onready var _health: HealthComponent = $HealthComponent
@onready var _hurtbox: HurtboxComponent = $HurtboxComponent
@onready var _placeholder: Polygon2D = $Placeholder


func _ready() -> void:
	_refresh_balance()
	EventBus.data_reloaded.connect(_refresh_balance)
	_health.max_hp = int(DataDB.get_balance("player.max_hp"))
	_health.current_hp = _health.max_hp
	_hurtbox.hurt_by.connect(_on_hurt_by)
	_health.died.connect(_on_died)
	_health.health_changed.connect(_on_health_changed)
	# Estado inicial para el HUD (la asignación directa de hp no emite señal).
	EventBus.player_health_changed.emit(_health.current_hp, _health.max_hp)


func _physics_process(delta: float) -> void:
	if _dead:
		return
	_process_iframes(delta)
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


## Cuenta atrás de invulnerabilidad tras un golpe, con parpadeo del placeholder.
func _process_iframes(delta: float) -> void:
	if _iframes_left_s <= 0.0:
		return
	_iframes_left_s -= delta
	if _iframes_left_s <= 0.0:
		_placeholder.visible = true
		_hurtbox.invulnerable = false
	else:
		_placeholder.visible = int(_iframes_left_s * _hurt_blink_hz * 2.0) % 2 == 0


## El stick derecho tiene prioridad; si está en reposo se apunta al ratón.
func _aim_direction(stick_aim: Vector2) -> Vector2:
	if stick_aim != Vector2.ZERO:
		return stick_aim.normalized()
	return (get_global_mouse_position() - global_position).normalized()


func _on_hurt_by(hitbox: HitboxComponent) -> void:
	# Redondeo de la fórmula de daño: entero más cercano, mínimo 1 (combate.md).
	_health.take_damage(maxi(1, roundi(hitbox.damage)))
	if not _dead:
		_hurtbox.invulnerable = true
		_iframes_left_s = _hurt_iframes_s


func _on_health_changed(current: int, max_hp: int) -> void:
	EventBus.player_health_changed.emit(current, max_hp)


func _on_died() -> void:
	_dead = true
	EventBus.player_died.emit()
	visible = false
	# set_deferred: la muerte puede llegar durante el procesado de física.
	set_deferred("process_mode", Node.PROCESS_MODE_DISABLED)


func _refresh_balance() -> void:
	_move_speed = float(DataDB.get_balance("player.move_speed"))
	_acceleration = float(DataDB.get_balance("player.acceleration"))
	_friction = float(DataDB.get_balance("player.friction"))
	_tear_speed = float(DataDB.get_balance("player.tear_speed"))
	_tear_range_px = float(DataDB.get_balance("player.tear_range_px"))
	_tear_rate_per_s = maxf(0.1, float(DataDB.get_balance("player.tear_rate_per_s")))
	_tear_damage = float(DataDB.get_balance("player.tear_damage"))
	_hurt_iframes_s = float(DataDB.get_balance("player.hurt_iframes_s"))
	_hurt_blink_hz = maxf(1.0, float(DataDB.get_balance("player.hurt_blink_hz")))
