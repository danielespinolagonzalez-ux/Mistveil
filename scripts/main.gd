extends Node2D
## Escena principal. Fase 3: monta el piso de prueba de 6 salas conectadas a mano.
## ANDAMIAJE TEMPORAL: la Fase 4 sustituye TEST_FLOOR por el generador procedural.

## normal×4 (la inicial vacía cuenta como normal), tesoro y jefe-placeholder.
const TEST_FLOOR := {
	Vector2i(0, 0): { "tipo": "normal" },  # inicial: vacía y segura (spec §3)
	Vector2i(1, 0): { "tipo": "normal", "plantilla": "p1_pilares_01" },
	Vector2i(2, 0): { "tipo": "normal", "plantilla": "p1_cruce_01" },
	Vector2i(1, -1): { "tipo": "tesoro" },
	Vector2i(1, 1): { "tipo": "normal", "plantilla": "p1_pasillo_01" },
	Vector2i(3, 0): { "tipo": "jefe", "enemigos": ["campanero", "campanero"] },
}

@onready var _floor_manager: FloorManager = $FloorManager


func _ready() -> void:
	_floor_manager.build_floor(TEST_FLOOR, Vector2i.ZERO)
