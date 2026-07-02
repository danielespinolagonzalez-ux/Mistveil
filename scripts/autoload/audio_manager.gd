extends Node
## AudioManager — música y SFX. Fase 2: SFX de la Cadencia con beeps sintetizados
## en memoria (AudioStreamWAV generado por código; sin binarios en el repo).
## Si existe el .ogg real en assets/audio/sfx/<id>.ogg se usa ese en su lugar.
## Buses y música llegan en la Fase 10.

const SFX_DIR := "res://assets/audio/sfx"
const SAMPLE_RATE := 22050
const VOICES := 6  # reproductores simultáneos de SFX

## Sonidos placeholder: id → [frecuencias Hz, duración s, decaimiento].
## El jugador debe poder jugar la Cadencia "de oído": timbres bien diferenciados.
const PLACEHOLDER_DEFS := {
	"cadencia_perfecta": { "freqs": [1320.0, 2640.0], "duration_s": 0.14, "decay": 22.0 },
	"cadencia_buena": { "freqs": [660.0], "duration_s": 0.1, "decay": 26.0 },
	"cadencia_fallo": { "freqs": [110.0, 95.0], "duration_s": 0.12, "decay": 30.0 },
	"cadencia_counter": { "freqs": [520.0, 1230.0, 780.0], "duration_s": 0.45, "decay": 7.0 },
}

var _sfx: Dictionary = {}
var _voices: Array[AudioStreamPlayer] = []


func _ready() -> void:
	_load_or_synth_sfx()
	for i in VOICES:
		var voice := AudioStreamPlayer.new()
		add_child(voice)
		_voices.append(voice)
	EventBus.cadencia_hit_resolved.connect(_on_cadencia_hit_resolved)
	EventBus.cadencia_counter_started.connect(_on_counter_started)


func play_sfx(id: String) -> void:
	if not _sfx.has(id):
		push_error("AudioManager: sfx desconocido '%s'" % id)
		return
	for voice in _voices:
		if not voice.playing:
			voice.stream = _sfx[id]
			voice.play()
			return
	# Todas las voces ocupadas: roba la primera (los beeps son cortos).
	_voices[0].stream = _sfx[id]
	_voices[0].play()


func has_sfx(id: String) -> bool:
	return _sfx.has(id)


func _on_cadencia_hit_resolved(quality: int, _hit_index: int, _is_finisher: bool) -> void:
	match quality:
		SyncRing.Quality.PERFECT:
			play_sfx("cadencia_perfecta")
		SyncRing.Quality.GOOD:
			play_sfx("cadencia_buena")
		_:
			play_sfx("cadencia_fallo")


func _on_counter_started() -> void:
	play_sfx("cadencia_counter")


func _load_or_synth_sfx() -> void:
	for id: String in PLACEHOLDER_DEFS:
		var real_path := "%s/%s.ogg" % [SFX_DIR, id]
		if ResourceLoader.exists(real_path):
			# Asset real de Daniel: se integra automáticamente.
			_sfx[id] = load(real_path)
			continue
		var def: Dictionary = PLACEHOLDER_DEFS[id]
		_sfx[id] = _synth_tone(def["freqs"], def["duration_s"], def["decay"])


## Sintetiza un tono corto (suma de senos con decaimiento exponencial) como WAV 16-bit.
func _synth_tone(freqs: Array, duration_s: float, decay: float) -> AudioStreamWAV:
	var frames: int = int(duration_s * SAMPLE_RATE)
	var data := PackedByteArray()
	data.resize(frames * 2)
	for i in frames:
		var t: float = float(i) / SAMPLE_RATE
		var envelope: float = exp(-decay * t)
		var sample: float = 0.0
		for freq: float in freqs:
			sample += sin(TAU * freq * t)
		sample = clampf(sample / freqs.size(), -1.0, 1.0) * envelope * 0.5
		data.encode_s16(i * 2, int(sample * 32767.0))
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = SAMPLE_RATE
	wav.stereo = false
	wav.data = data
	return wav
