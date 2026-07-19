# CUERDAQUEDA — La villa que se enciende. Diseño integral del hub

> Documento de diseño creativo **y** de construcción. Reformula el "pueblo" plano
> actual en una **ciudad modular, con profundidad, viva y que se desbloquea
> rescatando a su gente en la Torre**. Todo lo que aquí se propone respeta las
> reglas de oro de `CLAUDE.md` (data-driven, señales del EventBus, input por
> acciones, persistencia versionada, arte con *fallback* por código) y se apoya en
> sistemas que YA existen. Los `sujeto:` de arte van en inglés porque el pipeline
> de Recraft (`docs/pipeline_recraft.md`) los sigue mejor.

Índice
1. [La visión](#1-la-visión)
2. [Diagnóstico: por qué el pueblo actual sabe a poco](#2-diagnóstico)
3. [Los tres pilares del rediseño](#3-los-tres-pilares)
4. [El plano: una villa en terrazas (no cuadrada)](#4-el-plano)
5. [Los distritos (tabla maestra)](#5-los-distritos)
6. [La gente de Cuerdaqueda](#6-la-gente)
7. [Rescates en la Torre → desbloqueo en la ciudad](#7-rescates)
8. [La re-iluminación progresiva (ruina → viva) + música por capas](#8-reiluminación)
9. [Arquitectura técnica (cómo se construye)](#9-arquitectura)
10. [Assets de Recraft (catálogo listo para producir)](#10-assets)
11. [Plan por fases (orden de construcción)](#11-plan)
12. [Decisiones abiertas para Daniel](#12-decisiones)

---

## 1. La visión

**Cuerdaqueda** es la última villa habitada antes del Reloj de las Almas: un
puñado de casas encaramadas a las **terrazas de un reloj colosal que se detuvo**.
Como el tiempo se rompió, el sol **nunca termina de ponerse** — la villa vive en
una hora dorada perpetua, melancólica y cálida, de cera y latón.

Cuando Pip llega por primera vez, Cuerdaqueda está **medio apagada**: la mayoría
de sus vecinos quedaron atrapados en la Torre cuando el mecanismo se paró, y sus
casas están a oscuras, entabladas, con el farol frío. Solo **Margo la panadera**
sigue ahí, horneando pan que nadie espera, y **la Puerta del Reloj** aguarda al
este.

La promesa emocional: **cada descenso puede devolver a alguien**. Encuentras a un
vecino atrapado en una celda de engranajes en algún piso, rompes su cerrojo *al
compás*, y vuelve a casa contigo. Al regresar a la villa, **su distrito se
enciende**: se abren las contras, prende el farol, entra un instrumento nuevo en
la música del pueblo, y esa persona empieza a **pasear por su calle** y a
ofrecerte su oficio (la fragua, el conservatorio, la atalaya…).

Cuerdaqueda **no es una pantalla de menús con forma de plaza**: es el marcador
diegético de tu campaña. Cuanto más profundo llegas y más gente salvas, **más
viva, más luminosa y más útil** se vuelve. Descender es peligro; volver es
hogar, y el hogar crece.

> **Nombre**: propongo *Cuerdaqueda* (de *cuerda* = el muelle real del reloj +
> *queda* = la campana del atardecer / lo que queda quieto). Alternativas si no
> convence: *Villa Repique*, *La Antesala*, *El Compás* (doble sentido con la
> mecánica), *Ocaso* (choca con el sello Ocaso). Decides tú.

---

## 2. Diagnóstico

Por qué el pueblo actual (`js/pueblo.js` + `renderPueblo` en `main.js`) se siente
"muy cuadrado" y corto — sin acritud, para saber qué atacar:

| Problema | Causa concreta en el código | Se nota como… |
|---|---|---|
| **Es una tira plana** | `PLAZA = {w:560, h:190}`, un único rectángulo; Pip solo se mueve izquierda-derecha y la cámara solo hace scroll en X | "un pasillo con gente", sin profundidad ni descubrimiento |
| **Todo está desde el minuto 1** | Los 7 NPCs se pintan siempre (`NPCS.map` fijo); nada se desbloquea | no hay progreso visible en el hub, no invita a volver |
| **Sin vida** | Solo Pip pasea; el resto son "estaciones" quietas (farol + emblema) | vacío, poco acogedor |
| **Layout rígido** | NPCs a `x` fijas en fila (`P.x + 68`, `+158`, `+238`…) sobre una línea | rejilla, "cuadrado" |
| **La lámina y las estaciones son dos lenguajes** | ya se arregló parcialmente (estaciones por código), pero la lámina pintada es un cuadro fijo, no una ciudad con capas | el fondo "no responde" a lo que haces |

La base técnica, en cambio, es **buena y reutilizable**: el fondo ya va anclado al
mundo (`SX/SY` dentro de `scale(ZOOM)`), hay *y-sorting* (`sortables.sort`),
retratos pintados en diálogo, y un HUD mínimo. **No tiramos nada; lo hacemos
crecer.**

---

## 3. Los tres pilares

### Pilar A — Profundidad (romper lo cuadrado)
La villa deja de ser un rectángulo y pasa a **tres terrazas** conectadas por
rampas, recorridas por una **calle curva**. Se consigue con técnicas que el motor
2.5D ya soporta:
- **Bandas de profundidad (y)**: los distritos se reparten en 3 alturas; la
  `KY` (achatado) que ya usamos da la sensación de subir.
- **Parallax de 3 capas** (cielo / tejados / calle) a velocidades distintas.
- **Oclusores en primer plano** (la fuente, un arco, banderolas) por los que Pip
  **pasa por detrás** — el *y-sort* actual ya lo permite.
- **Borde de plaza irregular** (polígono / clamp suave) en vez de un `rect`.
- **Calle en arco**: las estaciones se colocan sobre una curva, no una fila.

### Pilar B — Ciudad modular que se enciende
La villa es un conjunto de **solares** (`barrios`) data-driven. Cada uno tiene un
estado **`ruina`** (oscuro, entablado, farol frío) o **`viva`** (encendido,
abierto, con su vecino y su servicio). El estado se **deriva** de a quién has
rescatado / qué hitos has cumplido (no se guarda por separado → nunca hay
desincronía). Encender un distrito es el *payoff* visual del rescate.

### Pilar C — Vida en las calles
Cada vecino rescatado **pasea por su distrito** (sprite con *bob* procedural,
como Pip). Aparecen **niños y una mascota** (Tuerca) cuando la villa se anima,
más **motas de polvo dorado**, humo de chimeneas, ropa tendida, el ave **Coro**
(ya existe) y **transeúntes genéricos**. Cuantos más rescates, más bulle.

---

## 4. El plano

Vista lateral esquemática (Pip sube de la Puerta, a la derecha, hacia el
Mirador, arriba a la izquierda). No es a escala; ilustra las 3 terrazas, la calle
en arco y los oclusores:

```
   TERRAZA ALTA  (mirador sobre la niebla, cerca del cielo)
   ┌─ Mirador del Péndulo ─┐   ┌ Conservatorio ┐   ┌ Atalaya ┐
   │  (Vesper · Santuario) │   │  (Luthier)    │   │ (Vigía) │
   └───────────△───────────┘   └──────△────────┘   └────△────┘
        rampa ╱                  rampa │             rampa
   TERRAZA MEDIA  (el corazón: mercado, oficios)
   ┌ Contaduría ┐  ⛲(fuente)  ┌ Fragua ┐   ┌ Botica ┐   ┌ El Redoble ┐
   │ (Hermanos) │   oclusor    │(Herrera)│   │(Cerera)│   │  (arena)  │
   └─────△──────┘              └───△────┘   └───△────┘   └─────△─────┘
        rampa  ╲___ calle en arco ___________________________╱
   TERRAZA BAJA  (llegada)
   ┌ Hornacina de Margo ┐ ······· Pip aparece ······· ┌ Puerta del Reloj ┐
   │  (siempre viva)    │                              │   (descenso)     │
   └────────────────────┘                              └──────────────────┘
        ↑ el farol de Margo es lo único encendido al principio
```

- **Cámara**: sigue haciendo scroll en X, pero ahora la villa es más ancha
  (≈3 pantallas) y **más alta**; añadimos un leve *pan* vertical suave cuando Pip
  sube de terraza (interpolado, como ya hace `cam.x`).
- **Movimiento**: Pip camina en las 4 direcciones dentro de la banda transitable;
  las rampas son zonas donde `y` transitable sube. Nada de física nueva: es el
  mismo `roomCtx.clampPlayer`, con el `clamp` leído de un **polígono** en vez de
  un rect.

---

## 5. Los distritos

Cada distrito vive en `data/ciudad.json` (nuevo). El pueblo pasa de **7 puntos en
fila** a **~11 distritos en terrazas**, la mayoría desbloqueables.

| Distrito | Vecino | Servicio (lo que ya hace hoy o nuevo) | Desbloqueo | Terraza | Acento |
|---|---|---|---|---|---|
| **La Hornacina** | Margo | Bendición "Pan de ayer" (+1 corazón) | **Inicio** (ancla) | baja | ámbar `#ffb15a` |
| **La Puerta del Reloj** | — | Descender a la Torre | **Inicio** | baja | violeta `#a892f0` |
| **El Tablón** | Pregonero (voz) | Avisos/lore + **Gremio** (contratos) | **Inicio** (Gremio: nivel 2) | baja | crema `#e8c98a` |
| **La Contaduría** | Hermanos Nº7 y Nº12 | +Memoria; luego **archivo del Códice** | **Rescate** (piso 1-3) | media | oro `#f0d67a` |
| **La Fragua de Cuerda** | Herrera *Yelmo* | **Forja de Sellos** (hoy vive escondida en el Santuario) | **Rescate** (piso 3-6) | media | bronce `#e0873a` |
| **La Botica de Cera** | Cerera *Nébula* | Bendiciones consumibles (cura, antorcha, ungüento) | **Rescate** (piso 2-5) | media | turquesa `#7ee8e0` |
| **El Redoble** | Maestro de duelos | Liga del Redoble (combate por turnos) | **Hito**: batir el piso 3 | media | oro cálido `#f0c24a` |
| **El Mirador del Péndulo** | Lady Vesper | Santuario + Esfera (meta-progresión) | Primera muerte (como hoy) | alta | lila `#b98ff0` |
| **El Conservatorio** | Luthier *Sostenido* | **Ensayo de Cadencia**: sube de nivel un compás; añade capa musical | **Rescate** (piso 4-6) | alta | rosa `#f0a0c8` |
| **La Atalaya** | Vigía *Alondra* | **Intel de la Torre**: revela el mapa del piso / avisa del minijefe / mejora recompensa | **Rescate** (piso 6-9) | alta | azul `#8fb0f0` |
| **La Plaza (ambiente)** | Niños + mascota Tuerca | Vida, lore emergente, secretos | Aparece con **≥3 rescatados** | media | — |

Notas de diseño:
- **La Fragua** le da por fin un *hogar diegético* a la Forja de Sellos (hoy es un
  botón perdido en el Santuario). Narrativamente: "solo Yelmo sabe reavivar un
  sello; hasta que no la rescates, la Forja está fría".
- **El Conservatorio** ata el hub al **corazón rítmico** del juego: practicar
  Cadencia (subir un compás gastando Memoria) y **cada distrito vivo suma un
  instrumento** al tema del pueblo (§8).
- **La Atalaya** convierte "volver al hub" en decisión estratégica: antes de
  descender puedes pagar intel del próximo piso.

---

## 6. La gente

Perfiles cortos (para diálogos y retratos). Tono: relojería melancólica, cálida,
con humor seco — el registro que ya tienen Margo y los Hermanos.

**Ya existentes (se conservan, se les da casa y calle):**
- **Margo** — la panadera que se quedó. Ancla emocional. Hornea "por si acaso".
- **Lady Vesper** — grabadora de recuerdos en el Péndulo (Santuario). Elegante,
  fatalista, maternal a su pesar.
- **Hermanos Nº7 y Nº12** — dos autómatas contables que discuten si *contar* es lo
  mismo que *recordar*. Los primeros a rescatar (el ejemplo de Daniel).

**Nuevos (rescatables):**
- **Herrera Yelmo** (Fragua) — herrera de sellos, brazos de latón, habla a golpe
  de yunque. "Un sello frío no es más que una piedra con nostalgia."
- **Cerera Nébula** (Botica) — cerera y boticaria; funde velas que son medio
  hechizo. Susurra, huele a mirra. Da consumibles para el descenso.
- **Luthier Sostenido** (Conservatorio) — lutier de campanas y cuerdas; le falta
  un dedo y aun así marca el compás mejor que nadie. Te enseña a afinar.
- **Vigía Alondra** (Atalaya) — antigua cartógrafa de la Torre; ve en la niebla.
  Seca, precisa, un punto paranoica. Te vende ojos para el próximo piso.

**Ambiente (no interactivos, dan vida):**
- **Tuerca** — la mascota mecánica de la villa (ya mencionada en el arte). Corre
  entre las piernas, persigue a Coro.
- **Niños de cuerda** (2-3) — juegan a "detener el tiempo" en la plaza.
- **Vecinos genéricos** (3-4 siluetas) — pasean por los distritos ya vivos;
  aparecen/desaparecen según cuántos rescates.
- **Coro** — el ave de fuego (ya existe), ahora sobrevuela toda la villa.

Cada vecino rescatable tiene **dos apariencias**: *cautivo* (gris, apagado,
preso en la Torre) y *vivo* (a color, en su calle). Ver §7 y §10.

---

## 7. Rescates

El mecanismo que Daniel pidió: **encontrarte a alguien tirado en una sala de la
Torre y salvarlo** para desbloquearlo en la ciudad.

### 7.1 La sala de rescate (nuevo tipo de sala)
Reutiliza el andamiaje de las **salas-evento** (`type:'evento'` en `rooms.js`,
que ya colocan un "altar" interactivo que gestiona `main.js`). Añadimos
`type:'rescate'`:

- **Aparición**: rara (`prob` ~0.15), **máx. 1 por run**, y **solo si queda algún
  vecino elegible** para el rango de pisos actual (si ya rescataste a todos, no
  sale). El generador (`buildTower`) la elige igual que hoy elige `evento` /
  `sincronia`.
- **Puesta en escena**: una celda. El vecino aparece **cautivo** —preso en una
  **jaula de engranajes** o hundido en cera— gris y translúcido, con un **cerrojo
  rítmico** (altar con su color de acento). Guardias: 2-3 enemigos del bioma
  velan la celda.
- **Liberación (al compás, muy on-theme)**:
  1. Limpias a los guardias (combate normal).
  2. Te acercas al cerrojo → salta **un anillo de contraataque** (reutiliza
     `cad.counter` + el aro con púas/​glifo de **E5**): **rompes el cerrojo en el
     golpe perfecto**. (Alternativa más simple si se prefiere: solo tocar el
     cerrojo tras limpiar guardias.)
  3. Estallido de color: el vecino pasa de gris a **encendido**, te da las
     gracias (2 líneas), suelta **+Memoria** y **sale caminando** (fundido).
- **Señal**: `EventBus.emit('npc_rescatado', id)` (nombre en pasado, regla 1).
- **Si fallas / la saltas**: el vecino **sigue preso**; puede reaparecer en otra
  run (no se "consume" hasta liberarlo). Nunca se pierde para siempre.

### 7.2 Datos: `data/rescates.json` (nuevo, data-driven puro)
Añadir un rescate = **una entrada JSON**, sin código nuevo (mismo espíritu que
`eventos.json`):

```json
{
  "_nota": "Vecinos cautivos en la Torre. Al liberarlos: GameState.rescatados += id y su distrito pasa a 'viva'. tipo de recompensa reutiliza eventos.js (memoria/oro/item).",
  "rescates": [
    {
      "id": "hermanos",
      "barrio": "contaduria",
      "npc_cautivo": "cautivo_hermanos",
      "pisos": [1, 3],
      "guardias": { "n": 2, "elite": false },
      "cerrojo": "cadencia",
      "intro": "Dos siluetas de latón, apagadas tras una reja de engranajes. Una talla muescas en el aire que ya no cuenta nada.",
      "liberado": "—¡La cuenta! ¡Volvió la cuenta! Hermano, nos ha... nos ha destrabado.",
      "recompensa": { "memoria": 8 }
    }
  ]
}
```

Campos: `id` (= id del barrio/vecino), `barrio` (qué distrito enciende), `pisos`
(rango `[min,max]` de aparición — misma convención que enemigos/plantillas),
`guardias`, `cerrojo` (`cadencia`|`toque`), textos, `recompensa` (la interpreta
`eventos.js`, ya sabe dar memoria/oro/item).

### 7.3 Persistencia
- `GameState.rescatados: []` (array de ids). **Sube `SaveManager` a schema 4**,
  con migración defensiva (`rescatados ??= []`), como se hizo con `pactos`.
- El estado `viva`/`ruina` de cada barrio **se computa** en el punto de uso desde
  `rescatados` + `flags` + `nivel` (no se guarda aparte → sin desincronía):

```js
// js/ciudad.js — deriva el estado del barrio (F5-friendly, sin números mágicos)
export function barrioVivo(b) {
  const u = b.unlock; // { tipo:'inicio'|'rescate'|'nivel'|'flag'|'rescatados_min', ref }
  switch (u.tipo) {
    case 'inicio':          return true;
    case 'rescate':         return GameState.rescatados.includes(b.id);
    case 'nivel':           return GameState.nivel >= u.ref;
    case 'flag':            return !!GameState.flags?.[u.ref];
    case 'rescatados_min':  return GameState.rescatados.length >= u.ref;
    default:                return false;
  }
}
```

---

## 8. Re-iluminación progresiva

El *payoff* que hace que rescatar se **sienta**. Un distrito `ruina` y el mismo
`viva`:

| Rasgo | `ruina` | `viva` |
|---|---|---|
| Fachada | oscura, contras cerradas, tablas cruzadas | iluminada, puertas abiertas, ventanas cálidas |
| Farol | frío (gris) | encendido, pulsa al *beatClock* |
| Vecino | ausente (o silueta cautiva de recuerdo) | pasea por su calle |
| Emblema | apagado | brilla con su color de acento |
| Partículas | ninguna | motas doradas, humo, vida |

**Cómo se dibuja (fallback-first):** cada distrito tiene **una fachada pintada**
(§10). El estado `viva` **no requiere una segunda pintura**: se logra por código
encima de la misma lámina —velo oscuro + tablas cruzadas en `ruina`; en `viva`,
*glow* cálido, ventanas encendidas dibujadas y el farol vivo—. Esto reutiliza
exactamente el lenguaje de luz que ya usa `drawNPC`/`drawPuebloBackdrop`. (Opción
de lujo, más cara: dos láminas `_ruina`/`_viva`; queda como *stretch*.)

**Transición**: al volver de una run con un rescate nuevo, `main.js` detecta el
delta y dispara `EventBus.emit('barrio_iluminado', id)`. La ciudad reproduce una
**secuencia de encendido** (el farol prende, las contras se abren con un
crujido, sube el *glow*, entra el instrumento) + un `flash` "Cuerdaqueda recuerda
a *Nombre*". Un momento, no un *pop*.

**Música por capas (reutiliza A5 / audio generativo):** `mus_pueblo` arranca
**escaso** (un dron + el latido del horno de Margo). **Cada distrito vivo añade su
instrumento**: Contaduría = pizzicato de ábaco, Fragua = yunque grave,
Conservatorio = cuerdas, Redoble = campanas, Atalaya = flauta lejana. Se hace con
el mismo enfoque de capas condicionadas que ya usa la música reactiva a la racha
(`AudioManager`, sin ficheros). Una villa más poblada **suena** más llena. Señal:
al `barrio_iluminado`, el director de música activa la capa.

---

## 9. Arquitectura

Cómo encaja sin romper `CLAUDE.md` ni el *god-file*.

### 9.1 Ficheros
| Fichero | Cambio |
|---|---|
| **`js/ciudad.js`** (nuevo; absorbe `pueblo.js`) | Escena de la ciudad: lee `ciudad.json`, coloca distritos en terrazas, dibuja `ruina`/`viva`, parallax, vecinos ambientales, diálogos. **Cumple parte de E1** (sacar la escena del god-file). |
| **`js/main.js`** | `renderPueblo`/`updatePueblo` adelgazan y **delegan** en `Ciudad.render/update` (patrón de inyección `cad.getSolids = …`). Hook de `npc_rescatado` → `barrio_iluminado`. |
| **`data/ciudad.json`** (nuevo) | Distritos: `{id, nombre, x, y(terraza), unlock, npc, servicio, fachada, acento, dialogo}`. |
| **`data/rescates.json`** (nuevo) | Vecinos cautivos (§7.2). |
| **`data/textos_es.json`** | Diálogos de los nuevos vecinos + textos de rescate (regla 5: textos visibles fuera del código). |
| **`js/rooms.js`** | Nuevo `type:'rescate'` (clon de `evento`): coloca el altar-cerrojo + guardias; `enter()` siembra el cautivo. |
| **`js/state.js`** | `GameState.rescatados=[]`; `SaveManager` **schema 4** + migración. |
| **`js/eventos.js`** | Reutilizado para pagar la `recompensa` del rescate (ya sabe memoria/oro/item). |
| **`data/balance.json`** | `ciudad` (parallax, prob de sala rescate, terrazas), `rescate` (guardias base). Todo F5. |
| **`tests/test_smoke.html`** | Asserts nuevos (§11). |

### 9.2 Señales (EventBus, en pasado, sin `off`)
- `npc_rescatado` (id) — emitida al liberar en la Torre.
- `barrio_iluminado` (id) — emitida en el hub al detectar un distrito nuevo vivo.
- (Ambas se consumen por *polling* en el bucle o con `on` permanente — nunca
  suscripciones temporales, que el bus no tiene `off`.)

### 9.3 Reglas respetadas
- **Data-driven**: distritos, rescates, vecinos, textos → JSON; el código
  interpreta. Añadir un vecino/distrito ≈ una entrada JSON + su arte.
- **Cero números mágicos**: posiciones de terraza, parallax, probabilidades y
  costes en `data/*.json`, leídos en el punto de uso con `?? defecto`.
- **Fallback-first**: si falta una fachada/sprite, se dibuja la estación por
  código actual (`drawNPC`) → **el juego nunca se rompe** durante el build, y el
  *smoke* sigue verde sin un solo asset nuevo.
- **Input por acciones**, **inglés motor / español dominio**, **persistencia
  versionada** con migración campo a campo.

### 9.4 Riesgo del god-file
Sacar la escena a `js/ciudad.js` **reduce** `main.js`. Es el momento natural de
saldar **E1** del ROADMAP (extraer `js/escenas.js`); este rediseño lo empuja.

---

## 10. Assets de Recraft

Catálogo listo para volcar a `tools/encargo.json` (mismo formato: `id`, `tipo`,
`clase`, `sujeto` en inglés, `targetH`, `face`, `estado`). Se produce **por lotes
con visto bueno de Daniel entre lote y lote** (protocolo de `pipeline_recraft.md`).
Presupuesto total estimado **≈130 créditos** de los 1.000/mes. **Todo con
fallback por código**: se puede construir la ciudad entera y luego ir vistiéndola.

> Recordatorio: reactivar el conector Recraft (claude.ai → Ajustes → Conectores);
> reintentar `create_style` desde `assets/estilo_refs/` (mayor palanca de
> consistencia); `remove_background` de Recraft SIEMPRE; `n=2` y elegir.

### LOTE CIUDAD-1 — Esqueleto visual (parallax + suelo) · ~18 cr
Capas panorámicas anchas (3:1) y textura de suelo. Nueva `plantilla_escena` =
como `plantilla_sprite` pero "wide painterly scene, no single subject, no cutout".

- `ciudad_cielo` — *"Eternal golden-hour sky over a broken clockwork town; far silhouette of a colossal STOPPED clock-tower and hazy terraced rooftops climbing into amber mist; melancholic, painterly, no foreground detail."*
- `ciudad_lejos` — *"Mid-distance terraced rooftops of a clockwork village clinging to giant gear-terraces, sparse warm-lit windows, chimneys, hanging laundry, brass weathervanes; painterly, edges fade to violet haze."*
- `ciudad_calle` — *"Foreground cobbled terrace street of a clockwork town at golden hour, curved path with low stone ramps and worn steps, gutters of dim brass, empty market space; even light so it tiles horizontally."*
- `tex_ciudad_adoquin` (`plantilla_textura`) — *"cobblestone plaza of warm honey-grey stones with brass seams, worn smooth."*

### LOTE CIUDAD-2 — Fachadas de distrito · ~30 cr
Una lámina de **fachada** por distrito (edificio de frente, recortada). El estado
`viva`/`ruina` lo hace el código encima.

- `fachada_hornacina` — *"a small warm bakery built into a gear-terrace, brick oven glowing, bread on the sill, copper chimney."*
- `fachada_contaduria` — *"a narrow counting-house of dark wood and brass abaci, tall shuttered windows, a hanging ledger sign."*
- `fachada_fragua` — *"a seal-forge workshop, stone arch, anvil and glowing hearth, hung with brass seals and tongs."*
- `fachada_botica` — *"a chandler-apothecary of dripping wax and dark bottles, candle-lanterns, herb bundles, turquoise glass."*
- `fachada_mirador` — *"a high pendulum-sanctuary of pale stone and a great swinging pendulum-crystal, lilac stained glass, contemplative."*
- `fachada_conservatorio` — *"a small music hall of carved wood, bells and stringed clock-instruments hanging, rose window."*
- `fachada_atalaya` — *"a slender watchtower of dark stone leaning over the mist, spyglass and maps, a single blue lantern."*
- `fachada_redoble` — *"a duel pavilion built around a huge bronze bell hung from a stopped pendulum, banners, sand ring."*
- `fachada_puerta` — *"a monumental clock-gate arch of dark stone, a great clock-face keystone, warm light spilling from the threshold (the descent)."*
- `fachada_tablon` — *"a covered notice plaza, cork-and-wax boards thick with pinned papers, a bronze guild seal."*

### LOTE CIUDAD-3 — Vecinos de calle (sprites cuerpo entero) · ~34 cr
`plantilla_sprite`, `clase:"townsfolk character"`, `targetH` ~62-70, `face:right`.
Los que pasean llevan además un `_paso` (2º fotograma; el motor anima el resto).

- `npc_margo`, `npc_vesper`, `npc_hermano7`, `npc_hermano12` (rehacer, coherentes)
- `npc_herrera` — *"a brass-armed clockwork blacksmith woman, leather apron, soot-marked, holding tongs; warm and gruff."*
- `npc_cerera` — *"a hooded chandler-apothecary, wax-stained robes, a lit candle in cupped hands, whispering, mysterious."*
- `npc_luthier` — *"a slender clockwork luthier missing one finger, tuning a small bell-lyre, tender and precise."*
- `npc_vigia` — *"a lean watchwoman-cartographer with a brass spyglass and a rolled map, sharp-eyed, wary."*
- `npc_nino` — *"a tiny clockwork child mid-run, laughing, an oversized key on the back."* (+ `npc_nino_paso`)
- `mascota_tuerca` — *"a small brass mechanical pet like a cog-cat, one glowing eye, mid-trot."* (+ `mascota_tuerca_paso`)
- `vecino_a/b/c` — *"a generic clockwork townsperson walking, muted cloak, {a: elderly / b: hooded youth / c: portly}."* (+ `_paso` c/u)

### LOTE CIUDAD-4 — Retratos de diálogo (bustos) · ~20 cr
`plantilla_sprite`, `face` hacia el texto, busto, para la caja de diálogo (como
`retrato_margo`).
- `retrato_herrera`, `retrato_cerera`, `retrato_luthier`, `retrato_vigia`, `retrato_nino`.

### LOTE CIUDAD-5 — Props y oclusores · ~24 cr
`plantilla_sprite`, `clase:"prop"`, sin cara.
- `prop_fuente` — *"an ornate dry clockwork fountain, gears instead of water, brass basin (foreground occluder)."*
- `prop_farol_ciudad` — *"a tall ornate wrought-iron street lantern with warm amber glass."*
- `prop_yunque` — *"a worn blacksmith anvil with a hanging brass seal."*
- `prop_campana_duelo` — *"a huge bronze duel-bell hung from a stopped iron pendulum."*
- `prop_puesto` — *"a small covered market stall, striped awning, crates of clock-parts."*
- `prop_escalinata` — *"a short flight of worn stone steps with a brass handrail (terrace ramp)."*
- `prop_banderola` — *"a hanging festival banner with a clock-face crest, golden-hour light through cloth."*
- `prop_cajas` — *"a stack of wooden crates and a barrel, brass-bound."*

### LOTE CIUDAD-6 — Cautivos (lado Torre) · ~14 cr
El cautivo **puede resolverse por código** (tomar el `npc_*` y pintarlo gris +
jaula de engranajes por encima). Arte dedicado opcional para el impacto:
- `jaula_engranajes` (`prop`) — *"a cage woven from turning brass gears, cold and dim."*
- `cautivo_hermanos`, `cautivo_herrera`, `cautivo_cerera`, `cautivo_luthier`,
  `cautivo_vigia` — *"the same character, greyed-out and dimmed, slumped and bound inside a cage of gears, faint dying glow."* (o *stretch*: solo overlay de código.)

**Resumen de créditos**: 18+30+34+20+24+14 ≈ **140 cr** (con los cautivos como
código: ≈126). Muy dentro del plan. Se produce a lo largo de varias sesiones.

---

## 11. Plan por fases

Orden pensado para que **cada fase sea jugable y verificable** (smoke verde,
captura in-game), y para que el arte llegue **después** del esqueleto (todo con
fallback por código). Estilo ROADMAP, marcable con checkbox.

**CIUDAD-0 · Cimientos (código, sin arte)**
- `data/ciudad.json` con los 11 distritos y su `unlock`; `js/ciudad.js` lee y
  coloca en 3 terrazas + calle en arco; migrar los 7 NPCs actuales a datos.
- Estado `ruina`/`viva` derivado (§7.3); dibujo `viva` = estación actual,
  `ruina` = estación apagada + tablas. `GameState.rescatados` + **schema 4**.
- *Verif.*: smoke (distritos válidos, `barrioVivo` puro, migración) + captura de
  la villa con solo Margo/Puerta vivos y el resto en ruina.

**CIUDAD-1 · El rescate (bucle completo con placeholders)**
- `data/rescates.json`; `type:'rescate'` en `rooms.js`; QTE de cerrojo (reusa
  `cad.counter`); `npc_rescatado`→`barrio_iluminado`; secuencia de encendido +
  `flash`. Recompensa vía `eventos.js`.
- *Verif.*: smoke (sala rescate se genera en su rango, liberar setea `rescatados`
  y enciende el barrio, no reaparece si ya está) + captura del rescate y del
  distrito encendiéndose.

**CIUDAD-2 · Profundidad y vida (código)**
- Parallax de 3 capas (con fallback a cielo degradado); oclusores en primer plano;
  vecinos ambientales que pasean por distritos vivos; niños/Tuerca al superar
  `rescatados_min`; *pan* vertical al subir de terraza.
- *Verif.*: captura escritorio + **móvil** (parallax pegado, *y-sort* correcto,
  Pip pasa tras la fuente), smoke sin regresión.

**CIUDAD-3 · Servicios nuevos**
- Mover la **Forja de Sellos** a la Fragua; **Conservatorio** (ensayo de compás +
  capa musical); **Atalaya** (intel del piso); **Botica** (consumibles).
- *Verif.*: smoke por servicio + capturas.

**CIUDAD-4..9 · Vestido de arte (lotes Recraft, uno por sesión)**
- LOTE CIUDAD-1…6 en orden, cada uno con captura comparativa y visto bueno de
  Daniel. El juego ya es completo y jugable *antes* de esta fase.

> Cada fase termina como manda el flujo: smoke headless verde → checkbox →
> `ESTADO.md` → commit convencional → push a la rama.

---

## 12. Decisiones abiertas para Daniel

Bifurcaciones de diseño que prefiero consultar antes de construir (el resto lo
decido y avanzo):

1. **Nombre de la villa** — ¿*Cuerdaqueda*? ¿otro de la lista del §1?
2. **Alcance del rescate** — 5 vecinos rescatables (Hermanos, Herrera, Cerera,
   Luthier, Vigía). ¿Te cuadra ese número, o quieres más/menos?
3. **Cerrojo rítmico vs. simple** — ¿romper el cerrojo con un QTE de contraataque
   (más on-theme, algo más difícil) o solo tocarlo tras limpiar guardias (más
   accesible, mejor para móvil/Una Mano)?
4. **Re-iluminación** — ¿código encima de una sola fachada (barato, recomendado)
   o dos láminas pintadas `ruina`/`viva` por distrito (más caro, más *wow*)?
5. **Por dónde empiezo** — recomiendo **CIUDAD-0 + CIUDAD-1** (los cimientos y el
   bucle de rescate completo, con placeholders de código): así *juegas* la idea
   entera —rescatar y ver encenderse un barrio— antes de gastar un solo crédito
   de Recraft. Luego vestimos con arte por lotes.

---

*Documento vivo. Al construir cada fase se actualizan `ROADMAP.md` y `ESTADO.md`.*
