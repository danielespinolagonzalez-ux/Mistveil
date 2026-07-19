# Balance de la Torre — guía de afinado por F5

> Todo lo de abajo vive en `data/balance.json` y se recarga **en caliente con F5** dentro
> del juego (no recarga la página). Edita, F5, y vuelve a entrar a un piso para ver el
> cambio. Medido con 30 torres por piso (headless).

## Curva medida (con los valores actuales)

| Piso | Salas | Salas de combate | Enemigos | Élites/piso |
|-----:|------:|-----------------:|---------:|------------:|
| 1  | ~12 | 4.2 | 13 | 1.1 |
| 2  | ~13 | 5.4 | 21 | 1.7 |
| 4  | ~15 | 6.3 | 27 | 2.7 |
| 6  | ~15 | 6.1 | 25 | 3.3 |
| 8  | ~14 | 5.7 | 24 | 3.2 |
| 10 | ~15 | 6.6 | 28 | 4.5 |
| 12 | ~15 | 6.4 | 27 | 4.6 |

- El **nº de enemigos** sube rápido hasta el piso 4 y luego se estabiliza en ~25-28: a
  partir de ahí el presupuesto compra enemigos **más caros** (y algún élite), no más
  bultos. Es a propósito (calidad > cantidad al final).
- Los **élites** (minijefes) van de ~1 a ~4.6 por piso, con **tope de 2 por sala** para
  que ninguna sala sea un muro de esponjas.
- Cada piso garantiza **tesoro + tienda + jefe**; además, por azar: maldita (~55%),
  evento (~50%), desafío (~40%) y una cámara de gremio (fundición/metrónomo/apuestas).

## Los diales (qué tocar para subir/bajar)

### Densidad de combate — `run`
- `dificultad_sala_base` (6): enemigos por sala en el piso 1. **Súbelo para más dura de
  salida.** Baja a 4-5 si el arranque es demasiado.
- `dificultad_por_piso` (3.0): cuánto crece el presupuesto por piso. Es el que hace el
  salto piso 1→2. Bájalo a ~2.2 si la subida se siente brusca.
- `escalado_hp_por_piso` (0.3) / `escalado_dano_por_piso` (0.25): vida y daño enemigos
  por piso. **Sube `dano` con cuidado** (es el "daño bruto" que Daniel no quería abusar).
- `drop_corazon_pct` (9): probabilidad de corazón al limpiar. **Bájalo para menos sostén
  (más difícil), súbelo si mueres por falta de curación.**

### Minijefes — `elite`
- `prob_base` (0.06) + `prob_por_piso` (0.014), tope `prob_max` (0.20): frecuencia de
  élites. **Súbelos para más minijefes.** `max_por_sala` (2) evita el slog.
- `hp_mult` (2.4): cuánto aguantan. `recompensa_*`: su botín.
- Rasgos: `acorazado_dano_mult` (0.55 = encaja 45% menos), `veloz_speed_mult` (1.55),
  `iracundo_speed_mult`/`iracundo_cadencia_mult`.

### Salas nuevas — `run.evento_prob` (0.55), `run.desafio_prob` (0.40)
- Probabilidad de que un piso tenga una sala-evento / sala-desafío. A 0 desaparecen.

### Desafío — `desafio`
- `presupuesto_mult` (1.8): cuánto más duro que una cámara normal.
- `tiempo_base_s` (22) + `tiempo_por_piso_s` (1.5): margen para el BONUS.
- `bonus_oro` (18) / `bonus_corazon_pct` (45): la recompensa por limpiarlo a tiempo.

### Forma del laberinto — `run.laberinto_*`
- `laberinto_camino_base` (5) / `_max` (9): largo del camino principal (más = pisos más
  largos). `_ancho_max` (3): cuánto se abre a los lados. `_ramas_base` (2) / `_ramas_var`
  (3): nº de callejones. `_bucles_max` (2): atajos/ciclos.

## Recomendación de arranque
Los valores actuales apuntan a "claramente más difícil que antes, pero justo". Si al
probar en el iPhone se siente:
- **Demasiado fácil aún** → sube `dificultad_por_piso` a 3.5 y `elite.prob_base` a 0.08.
- **Demasiado duro al empezar** → baja `dificultad_sala_base` a 5 y `dificultad_por_piso`
  a 2.4.
- **Los minijefes cansan** → baja `elite.prob_max` a 0.15 o `max_por_sala` a 1.
