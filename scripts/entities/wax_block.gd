class_name WaxBlock
extends StaticBody2D
## Bloque de cera destructible ('O' en plantillas). Obstáculo sólido que las
## lágrimas y el melé pueden romper (hurtbox en la capa enemy_hurt). Su vida
## viene de balance (salas.cera_hp).

@onready var _health: HealthComponent = $HealthComponent
@onready var _hurtbox: HurtboxComponent = $HurtboxComponent


func _ready() -> void:
	_health.max_hp = int(DataDB.get_balance("salas.cera_hp"))
	_health.current_hp = _health.max_hp
	_hurtbox.hurt_by.connect(_on_hurt_by)
	_health.died.connect(_on_died)


func _on_hurt_by(hitbox: HitboxComponent) -> void:
	# Redondeo de la fórmula de daño: entero más cercano, mínimo 1 (combate.md).
	var amount: int = maxi(1, roundi(hitbox.damage))
	_health.take_damage(amount)
	EventBus.damage_dealt.emit(global_position, amount)


func _on_died() -> void:
	queue_free()
