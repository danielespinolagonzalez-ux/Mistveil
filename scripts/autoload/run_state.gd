extends Node
## RunState — estado de la run actual (piso, items, oro, SP, semilla). Se resetea al morir.
## Fase 1: solo oro. Piso/items/SP/semilla llegan en fases posteriores.

var gold: int = 0
var sp: int = 0


func add_gold(amount: int) -> void:
	gold = maxi(0, gold + amount)
	EventBus.gold_changed.emit(gold)


## SP (Espíritu): SOLO sube acertando Cadencia (regla de combate.md).
func add_sp(amount: int) -> void:
	var sp_max: int = int(DataDB.get_balance("dragoon.sp_max"))
	sp = clampi(sp + amount, 0, sp_max)
	EventBus.sp_changed.emit(sp, sp_max)


## Vuelta al estado inicial de run (se llamará al morir/empezar run).
func reset() -> void:
	gold = 0
	sp = 0
	EventBus.gold_changed.emit(gold)
	EventBus.sp_changed.emit(sp, int(DataDB.get_balance("dragoon.sp_max")))
