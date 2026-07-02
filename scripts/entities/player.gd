class_name Player
extends CharacterBody2D
## Pip — movimiento twin-stick de 8 direcciones, disparo de lágrimas y vida con i-frames.
## Todos los valores vienen de balance.json vía DataDB; se releen con F5 (data_reloaded).

## Distancia del centro al punto de salida del proyectil (ligada al tamaño del placeholder).
const MUZZLE_OFFSET_PX := 10.0

## Geometría del arco de melé relativa a melee_range_px (el alcance vive en balance).
const MELEE_OFFSET_FACTOR := 0.6

## Fases del ataque melé (spec combate.md: WINDUP → ventana ACTIVA → recuperación).
enum MeleePhase { NONE, WINDUP, ACTIVE, RECOVERY }

var _move_speed: float = 0.0
var _acceleration: float = 0.0
var _friction: float = 0.0
var _tear_speed: float = 0.0
var _tear_range_px: float = 0.0
var _tear_rate_per_s: float = 0.0
var _tear_damage: float = 0.0
var _tear_knockback: float = 0.0
var _hurt_iframes_s: float = 0.0
var _hurt_blink_hz: float = 1.0

var _melee_damage: float = 0.0
var _melee_range_px: float = 0.0
var _melee_windup_s: float = 0.0
var _melee_active_s: float = 0.0
var _melee_recovery_s: float = 0.0
var _ring_contract_ms: float = 0.0
var _window_perfect_ms: float = 0.0
var _window_good_ms: float = 0.0
var _target_range_px: float = 0.0

var _shoot_cooldown_s: float = 0.0
var _iframes_left_s: float = 0.0
var _dead: bool = false
var _melee_phase: MeleePhase = MeleePhase.NONE
var _melee_timer_s: float = 0.0
var _sync_ring: SyncRing = null

@onready var _health: HealthComponent = $HealthComponent
@onready var _hurtbox: HurtboxComponent = $HurtboxComponent
@onready var _placeholder: Polygon2D = $Placeholder
@onready var _melee_hitbox: HitboxComponent = $MeleeHitbox
@onready var _melee_swing: Polygon2D = $MeleeHitbox/Swing


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
	# Anillo de sincronía de la Cadencia (se posiciona solo sobre el objetivo).
	_sync_ring = SyncRing.new()
	add_child(_sync_ring)


func _physics_process(delta: float) -> void:
	if _dead:
		return
	_process_iframes(delta)
	_process_movement(delta)
	_process_melee(delta)
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
	EventBus.tear_fired.emit(global_position + aim * MUZZLE_OFFSET_PX, aim, _tear_speed, _tear_range_px, _tear_damage, _tear_knockback)
	_shoot_cooldown_s = 1.0 / _tear_rate_per_s


## Máquina de estados del melé básico (tarea 2.1). El anillo de sincronía y la
## cadena de golpes de la Cadencia se montan encima en las tareas 2.2-2.3.
func _process_melee(delta: float) -> void:
	match _melee_phase:
		MeleePhase.NONE:
			if Input.is_action_just_pressed("melee"):
				_start_melee()
		MeleePhase.WINDUP:
			_melee_timer_s -= delta
			if _melee_timer_s <= 0.0:
				_melee_phase = MeleePhase.ACTIVE
				_melee_timer_s = _melee_active_s
				_set_melee_hitbox_enabled(true)
		MeleePhase.ACTIVE:
			_melee_timer_s -= delta
			if _melee_timer_s <= 0.0:
				_melee_phase = MeleePhase.RECOVERY
				_melee_timer_s = _melee_recovery_s
				_set_melee_hitbox_enabled(false)
		MeleePhase.RECOVERY:
			_melee_timer_s -= delta
			if _melee_timer_s <= 0.0:
				_melee_phase = MeleePhase.NONE


func _start_melee() -> void:
	_melee_phase = MeleePhase.WINDUP
	_melee_timer_s = _melee_windup_s
	# El arco queda fijado hacia donde se apuntaba al iniciar el golpe.
	var aim: Vector2 = _aim_direction(Input.get_vector("aim_left", "aim_right", "aim_up", "aim_down"))
	if aim == Vector2.ZERO:
		aim = Vector2.RIGHT
	_melee_hitbox.position = aim * _melee_range_px * MELEE_OFFSET_FACTOR
	_melee_hitbox.rotation = aim.angle()
	# Con objetivo cerca aparece el anillo de sincronía sobre él (tarea 2.2;
	# el encadenado de golpes según la calidad llega en la 2.3).
	var target: Node2D = _find_melee_target()
	if target != null:
		_sync_ring.start(target, _ring_contract_ms, _window_perfect_ms, _window_good_ms)


## Enemigo más cercano dentro del radio de fijado de la Cadencia (o null).
func _find_melee_target() -> Node2D:
	var best: Node2D = null
	var best_distance: float = _target_range_px
	for enemy: Node in get_tree().get_nodes_in_group("enemies"):
		var enemy_2d := enemy as Node2D
		if enemy_2d == null:
			continue
		var distance: float = (enemy_2d.global_position - global_position).length()
		if distance <= best_distance:
			best = enemy_2d
			best_distance = distance
	return best


func _set_melee_hitbox_enabled(enabled: bool) -> void:
	# set_deferred: los cambios de área en pleno paso de física deben aplazarse.
	_melee_hitbox.set_deferred("monitoring", enabled)
	_melee_hitbox.set_deferred("monitorable", enabled)
	_melee_swing.visible = enabled


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
		# Empujón en la dirección contraria al golpe; la fricción lo frena sola.
		var push_dir: Vector2 = (global_position - hitbox.global_position).normalized()
		velocity += push_dir * hitbox.knockback_px_s


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
	_tear_knockback = float(DataDB.get_balance("feedback.tear_knockback_px_s"))
	_melee_damage = float(DataDB.get_balance("player.melee_damage"))
	_melee_range_px = float(DataDB.get_balance("player.melee_range_px"))
	_melee_windup_s = float(DataDB.get_balance("player.melee_windup_s"))
	_melee_active_s = float(DataDB.get_balance("player.melee_active_s"))
	_melee_recovery_s = float(DataDB.get_balance("player.melee_recovery_s"))
	_melee_hitbox.damage = _melee_damage
	_melee_hitbox.knockback_px_s = float(DataDB.get_balance("feedback.melee_knockback_px_s"))
	_ring_contract_ms = float(DataDB.get_balance("cadencia.ring_contract_ms"))
	_window_perfect_ms = float(DataDB.get_balance("cadencia.window_perfect_ms"))
	_window_good_ms = float(DataDB.get_balance("cadencia.window_good_ms"))
	_target_range_px = float(DataDB.get_balance("cadencia.target_range_px"))
	_hurt_iframes_s = float(DataDB.get_balance("player.hurt_iframes_s"))
	_hurt_blink_hz = maxf(1.0, float(DataDB.get_balance("player.hurt_blink_hz")))
