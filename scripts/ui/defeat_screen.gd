extends CanvasLayer
## Pantalla de derrota mínima (tarea 1.3). Se muestra al recibir player_died;
## disparar reinicia la escena. Textos desde textos_es.json (nunca hardcodeados).

@onready var _title: Label = $Overlay/Title
@onready var _subtitle: Label = $Overlay/Subtitle
@onready var _prompt: Label = $Overlay/Prompt


func _ready() -> void:
	visible = false
	EventBus.player_died.connect(_on_player_died)


func _on_player_died() -> void:
	_title.text = DataDB.get_text("ui.muerte")
	_subtitle.text = DataDB.get_text("ui.muerte_sub")
	_prompt.text = DataDB.get_text("ui.reiniciar")
	visible = true


func _unhandled_input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("shoot"):
		get_tree().reload_current_scene()
