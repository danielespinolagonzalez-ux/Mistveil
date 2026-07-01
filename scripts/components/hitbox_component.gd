class_name HitboxComponent
extends Area2D
## Zona que INFLIGE daño. Detecta hurtboxes rivales (por capas/máscaras de la
## escena que lo use) y emite hit_landed; no aplica el daño directamente.

signal hit_landed(hurtbox: HurtboxComponent)

## Daño base en bruto; los multiplicadores (timing, elemento…) se aplican fuera.
@export var damage: float = 1.0


func _ready() -> void:
	area_entered.connect(_on_area_entered)


func _on_area_entered(area: Area2D) -> void:
	if area is HurtboxComponent and not (area as HurtboxComponent).invulnerable:
		hit_landed.emit(area)
