extends Node
## DataDB — carga y valida todos los data/*.json al arrancar. Acceso de SOLO lectura.
## F5 (acción `debug_reload_data`, solo builds debug) recarga en caliente y emite
## EventBus.data_reloaded para que los sistemas relean sus valores.

const BALANCE_PATH := "res://data/balance.json"
const ELEMENTOS_PATH := "res://data/elementos.json"
const ENEMIGOS_PATH := "res://data/enemigos.json"
const ITEMS_PATH := "res://data/items.json"
const SELLOS_PATH := "res://data/sellos.json"
const TEXTOS_PATH := "res://data/textos_es.json"
const SALAS_DIR := "res://data/salas"

## Claves obligatorias de balance.json por sección (validación con errores claros).
const BALANCE_REQUIRED := {
	"player": [
		"max_hp", "move_speed", "acceleration", "friction",
		"dash_speed", "dash_duration_s", "dash_cooldown_s", "dash_iframes_s",
		"hurt_iframes_s", "tear_damage", "tear_rate_per_s", "tear_speed",
		"tear_range_px", "melee_damage", "melee_range_px",
	],
	"cadencia": [
		"combo_hits_base", "window_perfect_ms", "window_good_ms", "window_decay_per_hit",
		"coyote_input_ms", "mult_perfect", "mult_good", "mult_fail",
		"finisher_mult", "finisher_knockback", "sp_perfect", "sp_good",
		"sp_counter_bonus", "counter_window_ms", "counter_damage",
	],
	"dragoon": [
		"sp_max", "duration_s", "damage_mult", "defense_mult",
		"d_addition_hits", "d_addition_window_ms", "d_finisher_shockwave_radius",
		"post_transform_vulnerable_s",
	],
	"elementos": ["opposite_mult", "same_mult", "neutral_mult"],
	"run": [
		"floors_total", "rooms_min", "rooms_max", "grid_w", "grid_h",
		"dificultad_sala_base", "escalado_hp_por_piso", "escalado_dano_por_piso",
		"drop_corazon_pct", "drop_oro_pct", "oro_min", "oro_max",
	],
	"items_rareza_pct": ["comun", "raro", "legendario"],
	"meta": ["memoria_por_jefe", "memoria_por_reto", "memoria_por_descubrimiento"],
}

const ENEMIGO_REQUIRED := [
	"id", "nombre", "pisos", "hp", "velocidad", "dano_contacto",
	"elemento", "comportamiento", "counter_chance", "coste_dificultad",
]
const ITEM_REQUIRED := ["id", "nombre", "descripcion", "rareza", "pools", "tags", "efectos"]
const SELLO_REQUIRED := ["id", "nombre", "elemento", "estado", "rasgo", "d_finisher"]
const PLANTILLA_REQUIRED := ["id", "pisos", "peso", "layout"]

var balance: Dictionary = {}
var elementos: Dictionary = {}
var enemigos: Dictionary = {}      # id -> definición
var jefes: Dictionary = {}         # id -> definición
var pools_spawn: Dictionary = {}
var items: Dictionary = {}         # id -> definición
var sinergias: Array = []
var sellos: Dictionary = {}        # id -> definición
var textos: Dictionary = {}
var salas: Dictionary = {}         # nombre de archivo (sin .json) -> contenido

var load_ok: bool = false
var load_errors: PackedStringArray = []


func _ready() -> void:
	reload_data()


func _unhandled_input(event: InputEvent) -> void:
	if OS.is_debug_build() and event.is_action_pressed("debug_reload_data"):
		reload_data()
		get_viewport().set_input_as_handled()


## (Re)carga todos los JSON, valida y emite data_reloaded. Idempotente.
func reload_data() -> void:
	load_errors = []

	balance = _load_dict(BALANCE_PATH)
	elementos = _load_dict(ELEMENTOS_PATH)
	textos = _load_dict(TEXTOS_PATH)

	var enemigos_raw: Dictionary = _load_dict(ENEMIGOS_PATH)
	enemigos = _index_by_id(enemigos_raw.get("enemigos", []), ENEMIGOS_PATH, ENEMIGO_REQUIRED)
	jefes = _index_by_id(enemigos_raw.get("jefes", []), ENEMIGOS_PATH, ["id", "nombre", "piso", "hp", "elemento", "fases"])
	pools_spawn = enemigos_raw.get("pools_spawn", {})
	if pools_spawn.is_empty():
		_fail(ENEMIGOS_PATH, "falta la clave 'pools_spawn'")

	var items_raw: Dictionary = _load_dict(ITEMS_PATH)
	items = _index_by_id(items_raw.get("items", []), ITEMS_PATH, ITEM_REQUIRED)
	sinergias = items_raw.get("sinergias", [])

	var sellos_raw: Variant = _load_json(SELLOS_PATH)
	sellos = {}
	if sellos_raw is Array:
		sellos = _index_by_id(sellos_raw, SELLOS_PATH, SELLO_REQUIRED)
	else:
		_fail(SELLOS_PATH, "la raíz debe ser un array de sellos")

	_load_salas()
	_validate_balance()
	_validate_elementos()
	_validate_cross_references()

	# Solo lectura: ningún sistema puede mutar los datos cargados.
	for data: Variant in [balance, elementos, enemigos, jefes, pools_spawn, items, sinergias, sellos, textos, salas]:
		_make_read_only_recursive(data)

	load_ok = load_errors.is_empty()
	if load_ok:
		print("DataDB: datos cargados y validados (%d enemigos, %d items, %d sellos, %d textos)." % [
			enemigos.size(), items.size(), sellos.size(), textos.size()])
	else:
		push_error("DataDB: carga con %d error(es). Revisa la salida anterior." % load_errors.size())
	EventBus.data_reloaded.emit()


## Valor de balance por ruta con puntos, p. ej. get_balance("player.move_speed").
## Error claro y null si la clave no existe: así los typos se detectan al instante.
func get_balance(path: String) -> Variant:
	var node: Variant = balance
	for part: String in path.split("."):
		if node is Dictionary and (node as Dictionary).has(part):
			node = node[part]
		else:
			push_error("DataDB: clave de balance no encontrada: '%s'" % path)
			return null
	return node


## Texto visible del juego por clave de textos_es.json. Devuelve la clave si falta.
func get_text(key: String) -> String:
	if textos.has(key):
		return str(textos[key])
	push_error("DataDB: texto no encontrado: '%s'" % key)
	return key


# --- Carga interna ---

func _load_json(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		_fail(path, "el archivo no existe")
		return null
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(path)) != OK:
		_fail(path, "sintaxis JSON inválida en línea %d: %s" % [json.get_error_line(), json.get_error_message()])
		return null
	return json.data


func _load_dict(path: String) -> Dictionary:
	var data: Variant = _load_json(path)
	if data is Dictionary:
		return data
	if data != null:
		_fail(path, "la raíz debe ser un objeto JSON")
	return {}


func _load_salas() -> void:
	salas = {}
	var dir := DirAccess.open(SALAS_DIR)
	if dir == null:
		_fail(SALAS_DIR, "no se puede abrir el directorio")
		return
	for file: String in dir.get_files():
		# En builds exportadas los .json aparecen como .json.remap; normalizamos.
		var real_name := file.trim_suffix(".remap")
		if not real_name.ends_with(".json"):
			continue
		var path := SALAS_DIR + "/" + real_name
		var contenido: Dictionary = _load_dict(path)
		if contenido.is_empty():
			continue
		for key: String in ["leyenda", "tamano", "plantillas"]:
			if not contenido.has(key):
				_fail(path, "falta la clave '%s'" % key)
		_validate_plantillas(contenido, path)
		salas[real_name.trim_suffix(".json")] = contenido


func _index_by_id(list: Variant, path: String, required: Array) -> Dictionary:
	var out: Dictionary = {}
	if not list is Array:
		_fail(path, "se esperaba un array")
		return out
	for entry: Variant in list:
		if not entry is Dictionary:
			_fail(path, "entrada que no es objeto: %s" % str(entry))
			continue
		var dict := entry as Dictionary
		for key: String in required:
			if not dict.has(key):
				_fail(path, "a la entrada '%s' le falta la clave '%s'" % [dict.get("id", "?"), key])
		var id := str(dict.get("id", ""))
		if id.is_empty():
			continue
		if out.has(id):
			_fail(path, "id duplicado: '%s'" % id)
		out[id] = dict
	return out


# --- Validaciones ---

func _validate_balance() -> void:
	for section: String in BALANCE_REQUIRED:
		if not balance.has(section):
			_fail(BALANCE_PATH, "falta la sección '%s'" % section)
			continue
		var sub: Variant = balance[section]
		if not sub is Dictionary:
			_fail(BALANCE_PATH, "la sección '%s' debe ser un objeto" % section)
			continue
		for key: String in BALANCE_REQUIRED[section]:
			if not (sub as Dictionary).has(key):
				_fail(BALANCE_PATH, "falta la clave '%s.%s'" % [section, key])


func _validate_elementos() -> void:
	for id: String in elementos:
		var elem: Variant = elementos[id]
		if not elem is Dictionary:
			_fail(ELEMENTOS_PATH, "el elemento '%s' debe ser un objeto" % id)
			continue
		for key: String in ["nombre", "opuesto", "color"]:
			if not (elem as Dictionary).has(key):
				_fail(ELEMENTOS_PATH, "al elemento '%s' le falta la clave '%s'" % [id, key])
		var opuesto: Variant = (elem as Dictionary).get("opuesto")
		if opuesto != null and not elementos.has(opuesto):
			_fail(ELEMENTOS_PATH, "el opuesto '%s' de '%s' no existe" % [opuesto, id])


func _validate_plantillas(contenido: Dictionary, path: String) -> void:
	var leyenda: Dictionary = contenido.get("leyenda", {})
	var tamano: Array = contenido.get("tamano", [0, 0])
	for plantilla: Variant in contenido.get("plantillas", []):
		var dict := plantilla as Dictionary
		if dict == null:
			continue
		var id := str(dict.get("id", "?"))
		for key: String in PLANTILLA_REQUIRED:
			if not dict.has(key):
				_fail(path, "a la plantilla '%s' le falta la clave '%s'" % [id, key])
		var layout: Array = dict.get("layout", [])
		if layout.size() != int(tamano[1]):
			_fail(path, "plantilla '%s': %d filas, se esperaban %d" % [id, layout.size(), int(tamano[1])])
		for row: Variant in layout:
			var row_str := str(row)
			if row_str.length() != int(tamano[0]):
				_fail(path, "plantilla '%s': fila de %d columnas, se esperaban %d" % [id, row_str.length(), int(tamano[0])])
			for ch: String in row_str:
				if not leyenda.has(ch):
					_fail(path, "plantilla '%s': símbolo '%s' no está en la leyenda" % [id, ch])


## Comprobaciones cruzadas entre archivos: referencias rotas se avisan al cargar.
func _validate_cross_references() -> void:
	for id: String in enemigos:
		var elemento := str(enemigos[id].get("elemento", ""))
		if not elementos.has(elemento):
			_fail(ENEMIGOS_PATH, "el enemigo '%s' referencia el elemento inexistente '%s'" % [id, elemento])
	for pool: String in pools_spawn:
		for enemigo_id: Variant in pools_spawn[pool]:
			if not enemigos.has(enemigo_id):
				_fail(ENEMIGOS_PATH, "el pool '%s' referencia el enemigo inexistente '%s'" % [pool, enemigo_id])
	for id: String in sellos:
		var elemento := str(sellos[id].get("elemento", ""))
		if not elementos.has(elemento):
			_fail(SELLOS_PATH, "el sello '%s' referencia el elemento inexistente '%s'" % [id, elemento])
	var rarezas: Dictionary = balance.get("items_rareza_pct", {})
	for id: String in items:
		var rareza := str(items[id].get("rareza", ""))
		if not rarezas.is_empty() and not rarezas.has(rareza):
			_fail(ITEMS_PATH, "el item '%s' tiene rareza desconocida '%s'" % [id, rareza])


func _make_read_only_recursive(data: Variant) -> void:
	if data is Dictionary:
		for value: Variant in (data as Dictionary).values():
			_make_read_only_recursive(value)
		(data as Dictionary).make_read_only()
	elif data is Array:
		for value: Variant in (data as Array):
			_make_read_only_recursive(value)
		(data as Array).make_read_only()


func _fail(path: String, message: String) -> void:
	var full := "DataDB [%s]: %s" % [path, message]
	load_errors.append(full)
	push_error(full)
