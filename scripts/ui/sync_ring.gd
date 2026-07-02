class_name SyncRing
extends Node2D
## Anillo de sincronía de la Cadencia (combate.md §Capa 2): un anillo exterior se
## contrae hacia el anillo interior fijo sobre el objetivo. judge_now() devuelve la
## calidad si se pulsara ahora. Es "tonto": las ventanas y tiempos se los pasa quien
## lo usa (desde balance.json); él solo mide y dibuja.
##
## - Avanza con el reloj de FÍSICA: con el árbol en pausa/hit-stop se congela solo.
## - z_index alto absoluto: se dibuja SIEMPRE por encima de balas (regla de legibilidad).

## La ventana pasó sin resolverse (o el objetivo dejó de existir).
signal window_closed

enum Quality { PERFECT, GOOD, FAIL }

# Geometría/colores placeholder del anillo (visual, no balance).
const RADIUS_INNER_PX := 11.0
const RADIUS_OUTER_PX := 30.0
const LINE_WIDTH_PX := 1.5
const ARC_POINTS := 40
const COLOR_BASE := Color(0.95, 0.95, 0.9, 0.85)
const COLOR_INNER := Color(0.8, 0.8, 0.75, 0.45)
const COLOR_GOOD := Color(1.0, 0.98, 0.75, 0.95)
const COLOR_PERFECT := Color(1.0, 1.0, 1.0, 1.0)

var active: bool = false

var _target: Node2D = null
var _contract_ms: float = 0.0
var _perfect_ms: float = 0.0
var _good_ms: float = 0.0
var _elapsed_ms: float = 0.0


func _ready() -> void:
	z_as_relative = false
	z_index = 200
	visible = false
	set_physics_process(false)


## Arranca la contracción sobre `target` con los tiempos dados (en ms).
func start(target: Node2D, contract_ms: float, perfect_ms: float, good_ms: float) -> void:
	_target = target
	_contract_ms = contract_ms
	_perfect_ms = perfect_ms
	_good_ms = good_ms
	_elapsed_ms = 0.0
	active = true
	visible = true
	set_physics_process(true)
	_follow_target()
	queue_redraw()


## Detiene y oculta el anillo sin emitir señal (cancelaciones, resoluciones).
func stop() -> void:
	active = false
	visible = false
	set_physics_process(false)


## Calidad del golpe si el jugador pulsara AHORA. El coyote perdona el adelanto
## (inputs hasta coyote_ms antes de abrirse la ventana cuentan como dentro).
func judge_now(coyote_ms: float = 0.0) -> Quality:
	var dt: float = _elapsed_ms - _contract_ms
	if dt < 0.0:
		dt = minf(dt + coyote_ms, 0.0)
	var width: float = absf(dt) * 2.0
	if width <= _perfect_ms:
		return Quality.PERFECT
	if width <= _good_ms:
		return Quality.GOOD
	return Quality.FAIL


func elapsed_ms() -> float:
	return _elapsed_ms


func _physics_process(delta: float) -> void:
	_elapsed_ms += delta * 1000.0
	if not is_instance_valid(_target):
		stop()
		window_closed.emit()
		return
	_follow_target()
	# Cierre: pasada la mitad tardía de la ventana buena ya no hay golpe posible.
	if _elapsed_ms > _contract_ms + _good_ms * 0.5:
		stop()
		window_closed.emit()
		return
	queue_redraw()


func _follow_target() -> void:
	if is_instance_valid(_target):
		global_position = _target.global_position


func _draw() -> void:
	if not active:
		return
	# El color comunica la ventana abierta (sin coyote: el destello es honesto).
	var quality: Quality = judge_now()
	var color: Color = COLOR_BASE
	var width: float = LINE_WIDTH_PX
	match quality:
		Quality.PERFECT:
			color = COLOR_PERFECT
			width = LINE_WIDTH_PX * 2.0
		Quality.GOOD:
			color = COLOR_GOOD
	var t: float = clampf(_elapsed_ms / _contract_ms, 0.0, 1.0)
	var outer_radius: float = lerpf(RADIUS_OUTER_PX, RADIUS_INNER_PX, t)
	draw_arc(Vector2.ZERO, RADIUS_INNER_PX, 0.0, TAU, ARC_POINTS, COLOR_INNER, 1.0)
	draw_arc(Vector2.ZERO, outer_radius, 0.0, TAU, ARC_POINTS, color, width)
