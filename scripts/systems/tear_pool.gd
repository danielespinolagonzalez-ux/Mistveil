class_name TearPool
extends ProjectilePool
## Pool de lágrimas de tinta del player. Escucha EventBus.tear_fired.


func _init() -> void:
	projectile_scene = preload("res://scenes/player/tear.tscn")


func _ready() -> void:
	EventBus.tear_fired.connect(spawn)
