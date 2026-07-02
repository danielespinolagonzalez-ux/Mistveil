class_name Player
extends CharacterBody2D
## Pip — twin-stick (mover + disparar), Cadencia melé (combo de golpes con anillo
## de sincronía, spec combate.md §Capa 2) y vida con i-frames.
## Todos los valores vienen de balance.json vía DataDB; se releen con F5 (data_reloaded).

## Distancia del centro al punto de salida del proyectil (ligada al tamaño del placeholder).
const MUZZLE_OFFSET_PX := 10.0

## Geometría del arco de melé relativa a melee_range_px (el alcance vive en balance).
const MELEE_OFFSET_FACTOR := 0.6

## Estados del melé/Cadencia (spec: MELEE_WINDUP → MELEE_WINDOW → HIT|FAIL → recovery).
## WINDUP solo se usa en el golpe suelto sin objetivo; en combo el anillo es la espera.
enum MeleePhase { NONE, WINDUP, RING_WAIT, STRIKE, RECOVERY }

# --- Balance cacheado (se relee con F5) ---
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
var _melee_knockback: float = 0.0
var _ring_contract_ms: float = 0.0
var _window_perfect_ms: float = 0.0
var _window_good_ms: float = 0.0
var _window_decay_per_hit: float = 1.0
var _coyote_input_ms: float = 0.0
var _target_range_px: float = 0.0
var _combo_hits: int = 3
var _mult_perfect: float = 1.0
var _mult_good: float = 1.0
var _mult_fail: float = 1.0
var _finisher_mult: float = 1.0
var _finisher_knockback: float = 0.0
var _sp_perfect: int = 0
var _sp_good: int = 0

# --- Estado ---
var _dash_speed: float = 0.0
var _dash_duration_s: float = 0.0
var _dash_cooldown_s: float = 0.0
var _dash_iframes_s: float = 0.0

var _shoot_cooldown_s: float = 0.0
var _iframes_left_s: float = 0.0
var _dash_iframes_left_s: float = 0.0
var _dashing: bool = false
var _dash_dir: Vector2 = Vector2.ZERO
var _dash_timer_s: float = 0.0
var _dash_cooldown_left_s: float = 0.0
var _dead: bool = false
var _melee_phase: MeleePhase = MeleePhase.NONE
var _melee_timer_s: float = 0.0
var _sync_ring: SyncRing = null
var _combo_target: Node2D = null
var _combo_hit_index: int = 0
var _combo_cut: bool = false

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
	_sync_ring.window_closed.connect(_on_ring_window_closed)


func _physics_process(delta: float) -> void:
	if _dead:
		return
	_process_iframes(delta)
	_process_dash(delta)
	_process_movement(delta)
	_process_melee(delta)
	_process_shooting(delta)


func _process_movement(delta: float) -> void:
	if _dashing:
		# Durante el dash la velocidad es fija; no responde a input.
		velocity = _dash_dir * _dash_speed
		move_and_slide()
		return
	var input_dir: Vector2 = Input.get_vector("move_left", "move_right", "move_up", "move_down")
	if input_dir != Vector2.ZERO:
		velocity = velocity.move_toward(input_dir * _move_speed, _acceleration * delta)
	else:
		velocity = velocity.move_toward(Vector2.ZERO, _friction * delta)
	move_and_slide()


## Dash corto con i-frames breves (spec Capa 1). Cancela el combo conservando SP.
func _process_dash(delta: float) -> void:
	_dash_cooldown_left_s = maxf(0.0, _dash_cooldown_left_s - delta)
	if _dashing:
		_dash_timer_s -= delta
		if _dash_timer_s <= 0.0:
			_dashing = false
		return
	if Input.is_action_just_pressed("dash") and _dash_cooldown_left_s == 0.0:
		_start_dash()


func _start_dash() -> void:
	var dir: Vector2 = Input.get_vector("move_left", "move_right", "move_up", "move_down")
	if dir == Vector2.ZERO:
		dir = _aim_direction(Input.get_vector("aim_left", "aim_right", "aim_up", "aim_down"))
	if dir == Vector2.ZERO:
		return
	_dashing = true
	_dash_dir = dir.normalized()
	_dash_timer_s = _dash_duration_s
	_dash_cooldown_left_s = _dash_cooldown_s
	_dash_iframes_left_s = _dash_iframes_s
	# Invulnerable desde el instante del dash (no esperar al siguiente frame).
	_hurtbox.invulnerable = true
	# Cancelar el combo con dash pierde la cadena pero CONSERVA el SP ganado (spec).
	_cancel_combo()


func _cancel_combo() -> void:
	if _melee_phase == MeleePhase.NONE:
		return
	_sync_ring.stop()
	_set_melee_hitbox_enabled(false)
	_combo_target = null
	_melee_phase = MeleePhase.NONE


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


# --- Cadencia (combo melé) ---

func _process_melee(delta: float) -> void:
	match _melee_phase:
		MeleePhase.NONE:
			if Input.is_action_just_pressed("melee"):
				_begin_melee()
		MeleePhase.WINDUP:
			_melee_timer_s -= delta
			if _melee_timer_s <= 0.0:
				_strike(_melee_damage, _melee_knockback)
		MeleePhase.RING_WAIT:
			if Input.is_action_just_pressed("melee"):
				_resolve_hit(_sync_ring.judge_now(_coyote_input_ms))
		MeleePhase.STRIKE:
			_melee_timer_s -= delta
			if _melee_timer_s <= 0.0:
				_set_melee_hitbox_enabled(false)
				_after_strike()
		MeleePhase.RECOVERY:
			_melee_timer_s -= delta
			if _melee_timer_s <= 0.0:
				_melee_phase = MeleePhase.NONE


## Pulsación inicial: con objetivo cerca arranca el combo (anillo); sin él, golpe suelto.
func _begin_melee() -> void:
	_combo_target = _find_melee_target()
	_combo_hit_index = 1
	_combo_cut = false
	if _combo_target == null:
		# Golpe suelto hacia el aim, con windup clásico y daño base.
		_combo_cut = true
		_aim_melee_hitbox(_aim_direction(Input.get_vector("aim_left", "aim_right", "aim_up", "aim_down")))
		_melee_phase = MeleePhase.WINDUP
		_melee_timer_s = _melee_windup_s
	else:
		_start_ring_for_current_hit()


func _start_ring_for_current_hit() -> void:
	# Las ventanas se estrechan un poco en cada golpe del combo (window_decay).
	var decay: float = pow(_window_decay_per_hit, _combo_hit_index - 1)
	_sync_ring.start(_combo_target, _ring_contract_ms, _window_perfect_ms * decay, _window_good_ms * decay)
	_melee_phase = MeleePhase.RING_WAIT


## Resuelve el golpe actual del combo con la calidad dada (pulsación o timeout).
func _resolve_hit(quality: SyncRing.Quality) -> void:
	_sync_ring.stop()
	if not is_instance_valid(_combo_target):
		# El objetivo murió a mitad de combo: se termina sin golpe (sin castigo).
		_combo_target = null
		_melee_phase = MeleePhase.RECOVERY
		_melee_timer_s = _melee_recovery_s
		return

	var mult: float = _mult_fail
	var sp_gain: int = 0
	match quality:
		SyncRing.Quality.PERFECT:
			mult = _mult_perfect
			sp_gain = _sp_perfect
		SyncRing.Quality.GOOD:
			mult = _mult_good
			sp_gain = _sp_good

	var is_finisher: bool = quality != SyncRing.Quality.FAIL and _combo_hit_index >= _combo_hits
	if is_finisher:
		mult *= _finisher_mult
	# Fallar (pulsar fuera o no pulsar) ejecuta golpe débil y CORTA el combo.
	_combo_cut = quality == SyncRing.Quality.FAIL or _combo_hit_index >= _combo_hits
	if sp_gain > 0:
		RunState.add_sp(sp_gain)
	EventBus.cadencia_hit_resolved.emit(quality, _combo_hit_index, is_finisher)
	_aim_melee_hitbox((_combo_target.global_position - global_position).normalized())
	# Solo el finisher empuja (spec): si los golpes intermedios tuvieran knockback,
	# alejarían al objetivo y romperían la cadena espacialmente.
	_strike(_melee_damage * mult, _finisher_knockback if is_finisher else 0.0)


## Ejecuta el golpe físico: activa el hitbox frontal durante melee_active_s.
func _strike(damage: float, knockback: float) -> void:
	_melee_hitbox.damage = damage
	_melee_hitbox.knockback_px_s = knockback
	_set_melee_hitbox_enabled(true)
	_melee_phase = MeleePhase.STRIKE
	_melee_timer_s = _melee_active_s


## Tras el golpe: encadenar el siguiente anillo o pasar a recuperación.
func _after_strike() -> void:
	if not _combo_cut and is_instance_valid(_combo_target) and _combo_hit_index < _combo_hits:
		_combo_hit_index += 1
		_start_ring_for_current_hit()
	else:
		_melee_phase = MeleePhase.RECOVERY
		_melee_timer_s = _melee_recovery_s


func _on_ring_window_closed() -> void:
	# No pulsar a tiempo (o perder el objetivo) durante la espera = fallo.
	if _melee_phase == MeleePhase.RING_WAIT:
		_resolve_hit(SyncRing.Quality.FAIL)


func _aim_melee_hitbox(direction: Vector2) -> void:
	var aim: Vector2 = direction if direction != Vector2.ZERO else Vector2.RIGHT
	_melee_hitbox.position = aim * _melee_range_px * MELEE_OFFSET_FACTOR
	_melee_hitbox.rotation = aim.angle()


func _set_melee_hitbox_enabled(enabled: bool) -> void:
	# set_deferred: los cambios de área en pleno paso de física deben aplazarse.
	_melee_hitbox.set_deferred("monitoring", enabled)
	_melee_hitbox.set_deferred("monitorable", enabled)
	_melee_swing.visible = enabled


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


# --- Vida / daño ---

## Invulnerabilidad: i-frames de daño (con parpadeo) e i-frames breves del dash.
func _process_iframes(delta: float) -> void:
	var had_hurt_iframes: bool = _iframes_left_s > 0.0
	_iframes_left_s = maxf(0.0, _iframes_left_s - delta)
	_dash_iframes_left_s = maxf(0.0, _dash_iframes_left_s - delta)
	_hurtbox.invulnerable = _iframes_left_s > 0.0 or _dash_iframes_left_s > 0.0
	if _iframes_left_s > 0.0:
		_placeholder.visible = int(_iframes_left_s * _hurt_blink_hz * 2.0) % 2 == 0
	elif had_hurt_iframes:
		_placeholder.visible = true


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
	_sync_ring.stop()
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
	_hurt_iframes_s = float(DataDB.get_balance("player.hurt_iframes_s"))
	_dash_speed = float(DataDB.get_balance("player.dash_speed"))
	_dash_duration_s = float(DataDB.get_balance("player.dash_duration_s"))
	_dash_cooldown_s = float(DataDB.get_balance("player.dash_cooldown_s"))
	_dash_iframes_s = float(DataDB.get_balance("player.dash_iframes_s"))
	_hurt_blink_hz = maxf(1.0, float(DataDB.get_balance("player.hurt_blink_hz")))
	_melee_damage = float(DataDB.get_balance("player.melee_damage"))
	_melee_range_px = float(DataDB.get_balance("player.melee_range_px"))
	_melee_windup_s = float(DataDB.get_balance("player.melee_windup_s"))
	_melee_active_s = float(DataDB.get_balance("player.melee_active_s"))
	_melee_recovery_s = float(DataDB.get_balance("player.melee_recovery_s"))
	_melee_knockback = float(DataDB.get_balance("feedback.melee_knockback_px_s"))
	_ring_contract_ms = float(DataDB.get_balance("cadencia.ring_contract_ms"))
	_window_perfect_ms = float(DataDB.get_balance("cadencia.window_perfect_ms"))
	_window_good_ms = float(DataDB.get_balance("cadencia.window_good_ms"))
	_window_decay_per_hit = float(DataDB.get_balance("cadencia.window_decay_per_hit"))
	_coyote_input_ms = float(DataDB.get_balance("cadencia.coyote_input_ms"))
	_target_range_px = float(DataDB.get_balance("cadencia.target_range_px"))
	_combo_hits = int(DataDB.get_balance("cadencia.combo_hits_base"))
	_mult_perfect = float(DataDB.get_balance("cadencia.mult_perfect"))
	_mult_good = float(DataDB.get_balance("cadencia.mult_good"))
	_mult_fail = float(DataDB.get_balance("cadencia.mult_fail"))
	_finisher_mult = float(DataDB.get_balance("cadencia.finisher_mult"))
	_finisher_knockback = float(DataDB.get_balance("cadencia.finisher_knockback"))
	_sp_perfect = int(DataDB.get_balance("cadencia.sp_perfect"))
	_sp_good = int(DataDB.get_balance("cadencia.sp_good"))
	_melee_hitbox.damage = _melee_damage
	_melee_hitbox.knockback_px_s = _melee_knockback
