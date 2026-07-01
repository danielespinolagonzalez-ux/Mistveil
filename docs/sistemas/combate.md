# Spec — Sistema de combate híbrido
Fuente de verdad de diseño. Los NÚMEROS viven en `data/balance.json`; aquí se explica el comportamiento.

## Capa 1 — Twin-stick (base Isaac)
- Mover (WASD/stick izq.) y disparar (ratón/stick der.) son independientes.
- Proyectil por defecto: "lágrima de tinta". Stats: daño, cadencia (disparos/s), velocidad, alcance (se disipa), tamaño. Todos modificables por items.
- Dash corto con i-frames breves (cooldown en balance). El dash NO atraviesa pozos salvo item/Sello que lo permita.
- Los enemigos también funcionan por componentes (Health/Hitbox/Hurtbox) y patrones simples: perseguir, orbitar, torreta, embestida telegrafiada.

## Capa 2 — CADENCIA (Additions de Dragoon en tiempo real)
El sistema-firma. Referencia: en Dragoon, el jugador pulsa cuando dos cuadros se alinean y destellan; aquí lo traducimos a un **anillo de sincronía** sin pausar la acción.

### Flujo de un combo
1. Pulsar `melee` cerca de un enemigo → Pip inicia el golpe 1 y sobre el objetivo aparece un **anillo exterior que se contrae** hacia un anillo interior fijo.
2. Cuando los anillos se alinean, hay dos ventanas concéntricas:
   - **Perfecta** (`window_perfect_ms`): destello blanco. Daño ×`mult_perfect`, +`sp_perfect` SP.
   - **Buena** (`window_good_ms`): destello tenue. Daño ×`mult_good`, +`sp_good` SP.
3. Acertar (perfecta o buena) **encadena** el siguiente golpe del combo automáticamente; fallar (pulsar fuera o no pulsar) ejecuta un golpe débil (×`mult_fail`) y **corta el combo**.
4. El combo base tiene 3 golpes; el 3.º es el **finisher** (más daño, pequeño knockback en área). Las ventanas se estrechan un poco en cada golpe (`window_decay`).
5. TODO ocurre en tiempo real: los demás enemigos siguen disparando/moviéndose. Ejecutar Cadencia = riesgo/recompensa espacial. Pip puede cancelar el combo con dash (pierde la cadena, conserva el SP ganado).

### Contraataque QTE (los "cuadros rojos" de Dragoon)
- Enemigos con `counter_chance > 0` pueden interrumpir: en un golpe del combo, el anillo se vuelve **ROJO** y suena una campana.
- El jugador debe pulsar `parry` (NO `melee`) dentro de `counter_window_ms`:
  - Éxito: niega el golpe enemigo, el combo continúa, +bonus SP. (Item `pendulo_quieto`: además congela la sala 0,5 s.)
  - Fallo: recibes `counter_damage`, combo cortado.
- Regla de legibilidad: nunca dos counters seguidos en el mismo combo.

### Reglas de diseño
- Audio es CRÍTICO: cada calidad tiene su sonido distintivo (ding/medio/thunk/campana). El jugador debe poder jugar la Cadencia "de oído".
- Accesibilidad: multiplicador global de tamaño de ventanas (opciones, 100–200%).
- La Cadencia es la ÚNICA fuente de SP: melé arriesgado → transformación. Ese es el bucle.

## Capa 3 — Transformación Dragoon (Sellos)
- Con SP = `sp_max`, pulsar `dragoon` activa el **Sello** equipado (uno por run, elegible en el pueblo o por item).
- Durante `duration_s` (el SP drena hasta 0): forma dragón del elemento del Sello.
  - Vuelo: ignora pozos y obstáculos bajos.
  - Stats: daño ×`dragoon.damage_mult`, daño recibido ×`dragoon.defense_mult`.
  - Proyectiles y melé adquieren el elemento del Sello (visual teñido).
  - El melé se convierte en la **D-Addition**: combo de 4 golpes con ventanas más estrictas (`d_addition_window_ms`) y finisher = onda expansiva elemental en área.
- Al terminar: 1 s de vulnerabilidad ligera (no se puede transformar de nuevo hasta rellenar SP). Sin trampas: si el SP llega a 0 en mitad de una D-Addition, se completa el golpe en curso y se destransforma.

## Capa 4 — Elementos (los 8 de Dragoon)
Definidos en `data/elementos.json`. Oposiciones: Fuego↔Agua, Viento↔Tierra, Luz↔Oscuridad; Trueno y No-Elemental sin opuesto.
- Daño al elemento OPUESTO: ×`elementos.opposite_mult` (por defecto 1.5).
- Daño al MISMO elemento: ×`elementos.same_mult` (por defecto 0.5).
- Resto: ×1.0.
- Cada enemigo tiene elemento (mayoría `neutro` en piso 1; crece la variedad por piso). El color del enemigo/proyectil SIEMPRE comunica su elemento (tabla de colores en elementos.json).

## Fórmula de daño
```
daño = base
     × mult_timing        (perfecta/buena/fallo, solo melé/D-Addition)
     × mult_elemento      (1.5 / 1.0 / 0.5)
     × mult_dragoon       (si transformado)
     × (1 + Σ bonos_items)
```
Redondeo final al entero más cercano, mínimo 1.

## Máquina de estados del player (referencia)
`IDLE/MOVE → SHOOT (superpuesto) → MELEE_WINDUP → MELEE_WINDOW → (HIT→ siguiente golpe | FAIL→ recovery) → COUNTER_QTE (interrupción) → DRAGOON_* (espejo de estados con D-Addition) → HURT (i-frames) → DEAD`.
Implementar con un `StateMachine` simple por nodos o enum+match; documentar transiciones en el script.

## Anti-frustración
- Ventana de "coyote input": inputs 40 ms antes de abrirse la ventana cuentan como dentro (parámetro en balance).
- El anillo se dibuja SIEMPRE por encima de balas enemigas (capa UI del mundo).
- En pausa/hit-stop, los anillos se congelan también (nunca desincronizar).
