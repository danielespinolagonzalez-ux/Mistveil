class_name DamageNumbers
extends Node2D
## Números de daño flotantes: escucha EventBus.damage_dealt y hace flotar un
## Label que sube y se desvanece (duración y recorrido desde balance.json).

const FONT_SIZE := 10
const NUMBER_COLOR := Color(1.0, 0.92, 0.7)


func _ready() -> void:
	EventBus.damage_dealt.connect(_on_damage_dealt)


func _on_damage_dealt(world_pos: Vector2, amount: int) -> void:
	var label := Label.new()
	label.text = str(amount)
	label.add_theme_font_size_override("font_size", FONT_SIZE)
	label.add_theme_color_override("font_color", NUMBER_COLOR)
	label.z_index = 100
	add_child(label)
	# Centrado horizontal aproximado sobre el punto del impacto.
	label.global_position = world_pos + Vector2(-label.size.x * 0.5, -16.0)

	var duration: float = float(DataDB.get_balance("feedback.damage_number_duration_s"))
	var rise: float = float(DataDB.get_balance("feedback.damage_number_rise_px"))
	var tween: Tween = label.create_tween()
	tween.set_parallel(true)
	tween.tween_property(label, "position:y", label.position.y - rise, duration)
	tween.tween_property(label, "modulate:a", 0.0, duration)
	tween.chain().tween_callback(label.queue_free)
