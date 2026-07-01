class_name EnemyProjectilePool
extends ProjectilePool
## Pool de proyectiles enemigos. Escucha EventBus.enemy_projectile_fired.


func _init() -> void:
	projectile_scene = preload("res://scenes/enemies/enemy_projectile.tscn")


func _ready() -> void:
	EventBus.enemy_projectile_fired.connect(spawn)
