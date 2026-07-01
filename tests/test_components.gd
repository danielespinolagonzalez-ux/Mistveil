extends Node
## Test de los componentes de combate (tarea 1.1). Ejecutar:
##   godot --headless res://tests/test_components.tscn
## Nota: usa await de frames de física para probar el solape de áreas (justificado: es un test).

# Bits de capa según [layer_names] de project.godot (capa N = 1 << (N-1)).
const LAYER_PLAYER_ATTACK := 1 << 3
const LAYER_ENEMY_HURT := 1 << 6

var _failures: int = 0
var _hit_landed_count: int = 0
var _hurt_by_count: int = 0


func _ready() -> void:
	_test_health()
	await _test_hitbox_hurtbox()

	if _failures == 0:
		print("TEST COMPONENTS: OK")
		get_tree().quit(0)
	else:
		print("TEST COMPONENTS: %d fallo(s)" % _failures)
		get_tree().quit(1)


func _test_health() -> void:
	var health := HealthComponent.new()
	health.max_hp = 5
	add_child(health)

	var events: Array[String] = []
	health.damaged.connect(func(amount: int) -> void: events.append("damaged:%d" % amount))
	health.healed.connect(func(amount: int) -> void: events.append("healed:%d" % amount))
	health.died.connect(func() -> void: events.append("died"))

	_check("health: arranca con la vida al máximo", health.current_hp == 5)
	health.take_damage(2)
	_check("health: daño resta vida", health.current_hp == 3)
	health.heal(99)
	_check("health: la cura se acota al máximo", health.current_hp == 5)
	health.take_damage(-3)
	_check("health: daño negativo se ignora", health.current_hp == 5)
	health.take_damage(5)
	_check("health: llega a 0 y muere", health.current_hp == 0 and health.is_dead)
	health.take_damage(1)
	health.heal(1)
	_check("health: muerto no recibe daño ni cura", health.current_hp == 0)
	_check("health: secuencia de señales correcta",
		events == ["damaged:2", "healed:2", "damaged:5", "died"])
	health.queue_free()


func _test_hitbox_hurtbox() -> void:
	var hitbox := HitboxComponent.new()
	hitbox.damage = 3.5
	hitbox.collision_layer = LAYER_PLAYER_ATTACK
	hitbox.collision_mask = LAYER_ENEMY_HURT
	hitbox.add_child(_make_shape())
	hitbox.hit_landed.connect(func(_hurtbox: HurtboxComponent) -> void: _hit_landed_count += 1)

	var hurtbox := HurtboxComponent.new()
	hurtbox.collision_layer = LAYER_ENEMY_HURT
	hurtbox.collision_mask = LAYER_PLAYER_ATTACK
	hurtbox.add_child(_make_shape())
	hurtbox.hurt_by.connect(func(_hitbox: HitboxComponent) -> void: _hurt_by_count += 1)

	add_child(hitbox)
	add_child(hurtbox)
	# Ambos en el origen: deben solaparse en cuanto la física procese un paso.
	await get_tree().physics_frame
	await get_tree().physics_frame

	_check("hitbox: detecta el hurtbox y emite hit_landed", _hit_landed_count == 1)
	_check("hurtbox: detecta el hitbox y emite hurt_by", _hurt_by_count == 1)

	# Invulnerable: al reactivar el solape no debe emitir.
	hurtbox.invulnerable = true
	hitbox.position = Vector2(1000, 0)
	await get_tree().physics_frame
	await get_tree().physics_frame
	hitbox.position = Vector2.ZERO
	await get_tree().physics_frame
	await get_tree().physics_frame
	_check("hurtbox invulnerable: no emite hurt_by", _hurt_by_count == 1)
	_check("hitbox: respeta la invulnerabilidad del hurtbox", _hit_landed_count == 1)

	hitbox.queue_free()
	hurtbox.queue_free()


func _make_shape() -> CollisionShape2D:
	var shape := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = 8.0
	shape.shape = circle
	return shape


func _check(nombre: String, ok: bool) -> void:
	print(("  [OK]   " if ok else "  [FALLO] ") + nombre)
	if not ok:
		_failures += 1
