class_name ProjectilePool
extends Node2D
## Pool genérico de proyectiles. Crece bajo demanda y reutiliza los desactivados
## (nunca libera nodos). Las subclases conectan la señal de EventBus que les toca.

## Escena del proyectil a instanciar (la fijan las subclases o la escena).
@export var projectile_scene: PackedScene

var _free: Array[Projectile] = []


func spawn(origin: Vector2, direction: Vector2, speed: float, range_px: float, damage: float) -> void:
	_acquire().fire(origin, direction, speed, range_px, damage)


func _acquire() -> Projectile:
	if _free.is_empty():
		var projectile: Projectile = projectile_scene.instantiate()
		add_child(projectile)
		projectile.expired.connect(_on_projectile_expired)
		return projectile
	return _free.pop_back()


func _on_projectile_expired(projectile: Projectile) -> void:
	_free.append(projectile)


## Nº de proyectiles instanciados (para tests y debug).
func total_count() -> int:
	return get_child_count()
