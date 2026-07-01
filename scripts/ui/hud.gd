extends CanvasLayer
## HUD de la run: corazones de vida (1 hp = 1 corazón) y contador de oro.
## Solo escucha EventBus; no conoce al player ni a RunState salvo el estado inicial.

# Colores placeholder hasta tener sprites (ver ASSETS_PENDIENTES.md).
const HEART_FULL_COLOR := Color(0.85, 0.2, 0.25)
const HEART_EMPTY_COLOR := Color(0.25, 0.1, 0.12)
const HEART_SIZE := Vector2(10, 10)

@onready var _hearts: HBoxContainer = $Margin/Rows/Hearts
@onready var _gold_label: Label = $Margin/Rows/GoldRow/GoldLabel


func _ready() -> void:
	EventBus.player_health_changed.connect(_on_health_changed)
	EventBus.gold_changed.connect(_on_gold_changed)
	_on_gold_changed(RunState.gold)


func _on_health_changed(current: int, max_hp: int) -> void:
	# Ajusta el nº de corazones al máximo y pinta llenos/vacíos.
	while _hearts.get_child_count() < max_hp:
		var heart := ColorRect.new()
		heart.custom_minimum_size = HEART_SIZE
		_hearts.add_child(heart)
	while _hearts.get_child_count() > max_hp:
		var last: Node = _hearts.get_child(_hearts.get_child_count() - 1)
		_hearts.remove_child(last)
		last.free()
	for i in _hearts.get_child_count():
		(_hearts.get_child(i) as ColorRect).color = HEART_FULL_COLOR if i < current else HEART_EMPTY_COLOR


func _on_gold_changed(total: int) -> void:
	_gold_label.text = str(total)
