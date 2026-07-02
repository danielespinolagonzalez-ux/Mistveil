class_name Enemy
extends CharacterBody2D
## Enemigo genérico data-driven: toda su definición (hp, velocidad, comportamiento,
## elemento…) viene de data/enemigos.json vía DataDB. Añadir un enemigo nuevo no
## debe requerir código salvo comportamientos inéditos (regla de oro nº 3).
## Comportamientos implementados: chase, turret, wander_bounce.

## Id de la entrada en enemigos.json (p. ej. "cera_andante").
@export var enemy_id: String = "cera_andante"

var _speed: float = 0.0
var _behavior: String = ""
var _projectile_def: Dictionary = {}
var _flies: bool = false

var _fire_timer_s: float = 0.0
var _wander_dir: Vector2 = Vector2.ZERO
var _wander_timer_s: float = 0.0
var _rng := RandomNumberGenerator.new()
var _knockback_vel: Vector2 = Vector2.ZERO
var _knockback_decay: float = 0.0

@onready var _health: HealthComponent = $HealthComponent
@onready var _hurtbox: HurtboxComponent = $HurtboxComponent
@onready var _hitbox: HitboxComponent = $HitboxComponent
@onready var _placeholder: Polygon2D = $Placeholder


func _ready() -> void:
	var def: Dictionary = DataDB.enemigos.get(enemy_id, {})
	if def.is_empty():
		push_error("Enemy: id desconocido '%s' (no está en enemigos.json)" % enemy_id)
		queue_free()
		return
	# La vida inicial solo se fija al nacer; F5 no debe curar/matar enemigos vivos.
	_health.max_hp = int(def.get("hp", 1))
	_health.current_hp = _health.max_hp
	_rng.randomize()
	_refresh_balance()
	# La torreta espera un ciclo completo antes del primer disparo (legibilidad al entrar).
	_fire_timer_s = float(_projectile_def.get("cadencia_s", 0.0))
	_pick_wander_direction()
	EventBus.data_reloaded.connect(_refresh_balance)
	_hurtbox.hurt_by.connect(_on_hurt_by)
	_health.died.connect(_on_died)


func _physics_process(delta: float) -> void:
	match _behavior:
		"chase":
			_chase()
		"turret":
			_turret(delta)
		"wander_bounce":
			_wander_bounce(delta)
		_:
			# Comportamientos aún no implementados (orbit_shoot, chase_explode…): quieto.
			velocity = Vector2.ZERO
	# El knockback se suma al movimiento del comportamiento y decae solo.
	velocity += _knockback_vel
	_knockback_vel = _knockback_vel.move_toward(Vector2.ZERO, _knockback_decay * delta)
	move_and_slide()


## Persecución en línea recta (cera_andante).
func _chase() -> void:
	var player: Node2D = _find_player()
	if player == null:
		velocity = Vector2.ZERO
		return
	velocity = (player.global_position - global_position).normalized() * _speed


## Torreta anclada: dispara agujas al player con la cadencia del JSON (tejedor_horas).
func _turret(delta: float) -> void:
	velocity = Vector2.ZERO
	if _projectile_def.is_empty():
		return
	var player: Node2D = _find_player()
	if player == null:
		return
	_fire_timer_s -= delta
	if _fire_timer_s > 0.0:
		return
	_fire_timer_s = float(_projectile_def.get("cadencia_s", 1.0))
	var dir: Vector2 = (player.global_position - global_position).normalized()
	if dir == Vector2.ZERO:
		return
	EventBus.enemy_projectile_fired.emit(
		global_position, dir,
		float(_projectile_def.get("velocidad", 0.0)),
		float(_projectile_def.get("alcance_px", 0.0)),
		float(_projectile_def.get("dano", 0.0)),
		0.0)  # Las agujas no empujan; el knockback al player es del contacto.


## Vuelo errático: dirección aleatoria, rebota en colisiones y bordes (engranaje_errante).
func _wander_bounce(delta: float) -> void:
	_wander_timer_s -= delta
	if _wander_timer_s <= 0.0:
		_pick_wander_direction()
	velocity = _wander_dir * _speed
	# Rebota contra lo que choque: muros de la sala, rocas y puertas selladas.
	var collision: KinematicCollision2D = get_last_slide_collision()
	if collision != null:
		_wander_dir = _wander_dir.bounce(collision.get_normal()).normalized()


func _pick_wander_direction() -> void:
	_wander_dir = Vector2.from_angle(_rng.randf_range(0.0, TAU))
	# Sin cambio_dir_s en el JSON solo cambia de rumbo al rebotar.
	_wander_timer_s = float(DataDB.enemigos.get(enemy_id, {}).get("cambio_dir_s", INF))


func _find_player() -> Node2D:
	return get_tree().get_first_node_in_group("player") as Node2D


func _on_hurt_by(hitbox: HitboxComponent) -> void:
	# Redondeo de la fórmula de daño: entero más cercano, mínimo 1 (combate.md).
	var amount: int = maxi(1, roundi(hitbox.damage))
	_health.take_damage(amount)
	EventBus.damage_dealt.emit(global_position, amount)
	var push_dir: Vector2 = (global_position - hitbox.global_position).normalized()
	_knockback_vel = push_dir * hitbox.knockback_px_s


func _on_died() -> void:
	EventBus.enemy_died.emit(self)
	queue_free()


func _refresh_balance() -> void:
	var def: Dictionary = DataDB.enemigos.get(enemy_id, {})
	if def.is_empty():
		return
	_speed = float(def.get("velocidad", 0.0))
	_behavior = str(def.get("comportamiento", ""))
	_projectile_def = def.get("proyectil", {})
	_flies = bool(def.get("vuela", false))
	# Terrestres chocan con rocas Y pozos; los voladores solo con muros y rocas
	# (la roca "bloquea todo"; el pozo no bloquea el vuelo — spec generación).
	collision_mask = (1 | 2 | 128) if _flies else (1 | 2 | 128 | 256)
	_hitbox.damage = float(def.get("dano_contacto", 0.0))
	# Sin daño de contacto (dummy, velón…) el hitbox se apaga del todo: el redondeo
	# "mínimo 1" del receptor convertiría un 0 en golpe real.
	var harmless: bool = _hitbox.damage <= 0.0
	_hitbox.set_deferred("monitoring", not harmless)
	_hitbox.set_deferred("monitorable", not harmless)
	_hitbox.knockback_px_s = float(DataDB.get_balance("feedback.contact_knockback_px_s"))
	_knockback_decay = float(DataDB.get_balance("feedback.knockback_decay_px_s2"))
	# Placeholder teñido con el color del elemento (regla de legibilidad).
	var elemento: Dictionary = DataDB.elementos.get(str(def.get("elemento", "neutro")), {})
	_placeholder.color = Color(str(elemento.get("color", "#9E9E9E")))
