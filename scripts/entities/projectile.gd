class_name Projectile
extends HitboxComponent
## Proyectil genérico (lágrimas del player, agujas enemigas…). Es un
## HitboxComponent móvil: los hurtboxes del bando contrario lo reconocen solos.
## Vive en un ProjectilePool: no se libera, se desactiva por alcance o impacto.

## Emitida al desactivarse para que el pool la recicle.
signal expired(projectile: Projectile)

var _direction: Vector2 = Vector2.ZERO
var _speed: float = 0.0
var _range_px: float = 0.0
var _traveled: float = 0.0


func _ready() -> void:
	super._ready()
	hit_landed.connect(_on_hit_landed)
	# Muros y rocas bloquean proyectiles (los pozos no) — spec de generación.
	body_entered.connect(_on_body_entered)
	_deactivate_silent()


## Pone el proyectil en juego. Los stats llegan por parámetro (los posee quien dispara).
func fire(origin: Vector2, direction: Vector2, speed: float, range_px: float, damage_value: float, knockback: float = 0.0) -> void:
	global_position = origin
	_direction = direction.normalized()
	_speed = speed
	_range_px = range_px
	damage = damage_value
	knockback_px_s = knockback
	_traveled = 0.0
	visible = true
	set_physics_process(true)
	monitoring = true
	monitorable = true


func _physics_process(delta: float) -> void:
	var step: Vector2 = _direction * _speed * delta
	global_position += step
	_traveled += step.length()
	if _traveled >= _range_px:
		_deactivate()


func _on_hit_landed(_hurtbox: HurtboxComponent) -> void:
	# El proyectil se disipa al impactar; el daño lo aplica el dueño del hurtbox.
	_deactivate()


func _on_body_entered(_body: Node2D) -> void:
	_deactivate()


func _deactivate() -> void:
	_deactivate_silent()
	expired.emit(self)


func _deactivate_silent() -> void:
	visible = false
	set_physics_process(false)
	# set_deferred: puede llegar durante el procesado de física (area_entered).
	set_deferred("monitoring", false)
	set_deferred("monitorable", false)
