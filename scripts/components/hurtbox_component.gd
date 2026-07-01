class_name HurtboxComponent
extends Area2D
## Zona que RECIBE daño. Emite hurt_by cuando la toca un hitbox rival; el dueño
## conecta la señal a su HealthComponent (los componentes no se conocen entre sí).

signal hurt_by(hitbox: HitboxComponent)

## Con true se ignoran los golpes (i-frames, tarea 1.3).
var invulnerable: bool = false


func _ready() -> void:
	area_entered.connect(_on_area_entered)


func _on_area_entered(area: Area2D) -> void:
	if invulnerable:
		return
	if area is HitboxComponent:
		hurt_by.emit(area)
