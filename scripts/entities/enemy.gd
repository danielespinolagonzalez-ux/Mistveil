class_name Enemy
extends CharacterBody2D
## Enemigo genérico data-driven: toda su definición (hp, velocidad, comportamiento,
## elemento…) viene de data/enemigos.json vía DataDB. Añadir un enemigo nuevo no
## debe requerir código salvo comportamientos inéditos (regla de oro nº 3).

## Id de la entrada en enemigos.json (p. ej. "cera_andante").
@export var enemy_id: String = "cera_andante"

var _speed: float = 0.0
var _behavior: String = ""

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
	_refresh_balance()
	EventBus.data_reloaded.connect(_refresh_balance)
	_hurtbox.hurt_by.connect(_on_hurt_by)
	_health.died.connect(_on_died)


func _physics_process(_delta: float) -> void:
	match _behavior:
		"chase":
			_chase()
		_:
			# Comportamientos turret/wander_bounce/etc. llegan en la tarea 1.4.
			velocity = Vector2.ZERO
	move_and_slide()


## Persecución en línea recta (cera_andante).
func _chase() -> void:
	var player: Node2D = get_tree().get_first_node_in_group("player") as Node2D
	if player == null:
		velocity = Vector2.ZERO
		return
	velocity = (player.global_position - global_position).normalized() * _speed


func _on_hurt_by(hitbox: HitboxComponent) -> void:
	# Redondeo de la fórmula de daño: entero más cercano, mínimo 1 (combate.md).
	_health.take_damage(maxi(1, roundi(hitbox.damage)))


func _on_died() -> void:
	EventBus.enemy_died.emit(self)
	queue_free()


func _refresh_balance() -> void:
	var def: Dictionary = DataDB.enemigos.get(enemy_id, {})
	if def.is_empty():
		return
	_speed = float(def.get("velocidad", 0.0))
	_behavior = str(def.get("comportamiento", ""))
	_hitbox.damage = float(def.get("dano_contacto", 0.0))
	# Placeholder teñido con el color del elemento (regla de legibilidad).
	var elemento: Dictionary = DataDB.elementos.get(str(def.get("elemento", "neutro")), {})
	_placeholder.color = Color(str(elemento.get("color", "#9E9E9E")))
