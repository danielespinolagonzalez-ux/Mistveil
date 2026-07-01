extends Node
## RunState — estado de la run actual (piso, items, oro, SP, semilla). Se resetea al morir.
## Fase 1: solo oro. Piso/items/SP/semilla llegan en fases posteriores.

var gold: int = 0


func add_gold(amount: int) -> void:
	gold = maxi(0, gold + amount)
	EventBus.gold_changed.emit(gold)


## Vuelta al estado inicial de run (se llamará al morir/empezar run).
func reset() -> void:
	gold = 0
	EventBus.gold_changed.emit(gold)
