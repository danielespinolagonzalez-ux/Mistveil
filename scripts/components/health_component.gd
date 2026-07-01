class_name HealthComponent
extends Node
## Vida de una entidad. Sin acoplamiento: solo emite señales; el dueño (player,
## enemigo, bloque de cera…) decide qué hacer al recibirlas.

signal health_changed(current: int, max_hp: int)
signal damaged(amount: int)
signal healed(amount: int)
signal died

@export var max_hp: int = 1

var current_hp: int = 1
var is_dead: bool = false


func _ready() -> void:
	current_hp = max_hp


func take_damage(amount: int) -> void:
	if is_dead or amount <= 0:
		return
	current_hp = maxi(0, current_hp - amount)
	damaged.emit(amount)
	health_changed.emit(current_hp, max_hp)
	if current_hp == 0:
		is_dead = true
		died.emit()


func heal(amount: int) -> void:
	if is_dead or amount <= 0:
		return
	var before: int = current_hp
	current_hp = mini(max_hp, current_hp + amount)
	if current_hp != before:
		healed.emit(current_hp - before)
		health_changed.emit(current_hp, max_hp)


## Cambia el máximo (items tipo "+1 corazón"). Mantiene la vida actual acotada.
func set_max_hp(value: int) -> void:
	max_hp = maxi(1, value)
	current_hp = mini(current_hp, max_hp)
	health_changed.emit(current_hp, max_hp)
