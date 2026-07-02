extends CanvasLayer
## Controles táctiles virtuales (para builds web/móvil). Solo se activan si hay
## pantalla táctil. Traducen toques a las MISMAS acciones del Input Map, así el
## resto del juego no sabe nada de touch:
##  - Mitad izquierda: stick virtual de movimiento (move_*).
##  - Mitad derecha (fuera de botones): stick de apuntado (aim_*; disparo automático).
##  - Botones: melé, parry y dash.

const STICK_RADIUS_PX := 44.0
const STICK_DEADZONE := 0.25
const BUTTON_ALPHA := 0.35

## Zonas de botones en coordenadas del viewport (640×360).
const BUTTONS := {
	"melee": { "center": Vector2(588, 296), "radius": 30.0 },
	"parry": { "center": Vector2(520, 322), "radius": 24.0 },
	"dash": { "center": Vector2(524, 252), "radius": 20.0 },
}
const MOVE_ACTIONS := { "left": "move_left", "right": "move_right", "up": "move_up", "down": "move_down" }
const AIM_ACTIONS := { "left": "aim_left", "right": "aim_right", "up": "aim_up", "down": "aim_down" }

# Estado por dedo: index → info del toque.
var _move_touch_index: int = -1
var _move_origin: Vector2 = Vector2.ZERO
var _move_vector: Vector2 = Vector2.ZERO
var _aim_touch_index: int = -1
var _aim_origin: Vector2 = Vector2.ZERO
var _aim_vector: Vector2 = Vector2.ZERO
var _button_touches: Dictionary = {}  # index → nombre de acción

@onready var _canvas: Node2D = $Canvas


func _ready() -> void:
	var enabled: bool = DisplayServer.is_touchscreen_available()
	visible = enabled
	set_process_input(enabled)
	if not enabled:
		return
	_canvas.draw.connect(_on_canvas_draw)
	_canvas.queue_redraw()
	for name: String in BUTTONS:
		var label := Label.new()
		label.text = DataDB.get_text("touch." + name)
		label.add_theme_font_size_override("font_size", 8)
		label.modulate = Color(1, 1, 1, 0.7)
		var center: Vector2 = BUTTONS[name]["center"]
		label.position = center + Vector2(-16, -6)
		_canvas.add_child(label)


func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			_on_touch_start(touch.index, touch.position)
		else:
			_on_touch_end(touch.index)
		_canvas.queue_redraw()
	elif event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		_on_touch_drag(drag.index, drag.position)
		_canvas.queue_redraw()


func _on_touch_start(index: int, pos: Vector2) -> void:
	# 1º los botones (tienen prioridad sobre el stick de apuntado).
	for name: String in BUTTONS:
		if pos.distance_to(BUTTONS[name]["center"]) <= BUTTONS[name]["radius"]:
			_button_touches[index] = name
			Input.action_press(name)
			return
	var half_width: float = get_viewport().get_visible_rect().size.x * 0.5
	if pos.x < half_width and _move_touch_index == -1:
		_move_touch_index = index
		_move_origin = pos
		_move_vector = Vector2.ZERO
	elif _aim_touch_index == -1:
		_aim_touch_index = index
		_aim_origin = pos
		_aim_vector = Vector2.ZERO


func _on_touch_drag(index: int, pos: Vector2) -> void:
	if index == _move_touch_index:
		_move_vector = _stick_vector(_move_origin, pos)
		_apply_axis(MOVE_ACTIONS, _move_vector)
	elif index == _aim_touch_index:
		_aim_vector = _stick_vector(_aim_origin, pos)
		_apply_axis(AIM_ACTIONS, _aim_vector)


func _on_touch_end(index: int) -> void:
	if _button_touches.has(index):
		Input.action_release(_button_touches[index])
		_button_touches.erase(index)
	elif index == _move_touch_index:
		_move_touch_index = -1
		_move_vector = Vector2.ZERO
		_release_axis(MOVE_ACTIONS)
	elif index == _aim_touch_index:
		_aim_touch_index = -1
		_aim_vector = Vector2.ZERO
		_release_axis(AIM_ACTIONS)


func _stick_vector(origin: Vector2, pos: Vector2) -> Vector2:
	var v: Vector2 = (pos - origin) / STICK_RADIUS_PX
	if v.length() > 1.0:
		v = v.normalized()
	return Vector2.ZERO if v.length() < STICK_DEADZONE else v


func _apply_axis(actions: Dictionary, v: Vector2) -> void:
	Input.action_press(actions["left"], maxf(0.0, -v.x))
	Input.action_press(actions["right"], maxf(0.0, v.x))
	Input.action_press(actions["up"], maxf(0.0, -v.y))
	Input.action_press(actions["down"], maxf(0.0, v.y))
	if v == Vector2.ZERO:
		_release_axis(actions)


func _release_axis(actions: Dictionary) -> void:
	for key: String in actions:
		Input.action_release(actions[key])


## Dibujo de los controles (llamado vía la señal draw del Canvas hijo).
func _on_canvas_draw() -> void:
	for name: String in BUTTONS:
		var pressed: bool = _button_touches.values().has(name)
		var alpha: float = 0.7 if pressed else BUTTON_ALPHA
		_canvas.draw_arc(BUTTONS[name]["center"], BUTTONS[name]["radius"], 0.0, TAU, 24,
			Color(1.0, 1.0, 1.0, alpha), 2.0)
	if _move_touch_index != -1:
		_draw_stick(_move_origin, _move_vector, Color(0.6, 0.9, 1.0, 0.5))
	if _aim_touch_index != -1:
		_draw_stick(_aim_origin, _aim_vector, Color(1.0, 0.8, 0.5, 0.5))


func _draw_stick(origin: Vector2, v: Vector2, color: Color) -> void:
	_canvas.draw_arc(origin, STICK_RADIUS_PX, 0.0, TAU, 32, color, 1.5)
	_canvas.draw_circle(origin + v * STICK_RADIUS_PX, 10.0, color)
