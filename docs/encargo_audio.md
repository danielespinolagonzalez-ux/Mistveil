# Encargo de Audio — MISTVEIL: El Reloj de las Almas

Guía para generar **efectos de sonido (SFX)** y **músicas ambientales** de todo el
juego, con el estilo pedido por Daniel: **Nobuo Uematsu × Masayoshi Soken × The
Legend of Dragoon**. Mismo espíritu que `encargo_arte.md`: catálogo machine-readable,
prompts de producción en **inglés** (las herramientas los siguen mejor), y una
integración con **red de seguridad** sobre el `AudioManager` que ya existe.

> Documento de diseño/proceso. Nada aquí se genera solo: cuando decidamos la
> herramienta, se produce lote a lote, se verifica y se integra con fallback.

---

## 0. Herramientas para generar el audio

> **Corrección** (respecto a lo que dije primero): el **producto clásico de Magnific**
> es de imagen (upscaling/relight/reimagine), pero el **conector de esta sesión**
> (plataforma Magnific/Freepik) **sí genera audio**: música por prompt (motores Google
> Lyria y ElevenLabs) y TTS. Ya lo usé para las dos pruebas de estilo.

Opciones reales:

| Vía | Qué hace | Notas |
|---|---|---|
| **Conector de audio de la sesión** (`audio_music_generate`, `audio_tts`) | Música (Lyria / **ElevenLabs**) y voz por prompt | Usado para el pase de validación (`elevenlabs-music-generation-v2`, instrumental, 40 s). Devuelve MP3 192 kbps 48 kHz. |
| **ElevenLabs MCP** (auto-alojado, §8) | `text_to_sound_effects`, `text_to_speech`, voces | Lo mejor para **SFX** one-shot y voces; requiere tu API key. |
| **Suno / Udio** | Música por prompt | Alternativa musical; export wav/mp3 y se recorta el loop. |
| **Síntesis procedural (lo actual)** | WebAudio en `state.js` | **Se queda** para los SFX rítmicos de Cadencia (latencia cero) y como fallback. |

Recomendación: **híbrido** (ver §2). Música ambiental = loops generados; SFX de
ritmo = seguir sintetizados; SFX one-shot = muestras generadas opcionales.

> ⚠️ **Filtro de ToS (aprendido en las pruebas)**: los generadores **rechazan los
> prompts que nombran artistas/franquicias reales** ("Uematsu", "Final Fantasy",
> "FFXIV", "Legend of Dragoon"…). Hay que describir el **estilo/época** sin nombres
> propios: p. ej. *"PS1-era orchestral warmth"*, *"late-90s / early-2000s RPG
> soundtrack"*, *"melancholic gothic-clockwork dark fantasy"*. Las plantillas de §6
> ya están corregidas para esto.

---

## 1. Visión sonora — la fusión de los tres

- **Uematsu (Final Fantasy)**: melodía memorable y *leitmotiv*. Un tema de Pip que
  reaparezca transformado (título → pueblo → derrota). Emoción por encima de todo,
  con guiños de jazz/prog en los combates.
- **Soken (FFXIV)**: producción moderna y **capas dinámicas**. Los jefes suben de
  intensidad por fases (una capa de coro/metal entra en la Fase 2) con transiciones
  sin costura. Orquesta + metal + electrónica conviven.
- **The Legend of Dragoon (Takeo Miratsu / Dennis Martin)**: melancolía épica
  *PS1-era*, orquestal-sintético con arpa, celesta y coros etéreos; temas de pueblo
  cálidos y nostálgicos, percusión ceremonial.

**Síntesis para Mistveil** (relojería + almas + ritmo):
- **Paleta firma**: celesta / carillón / glockenspiel, arpa, cuerdas de cámara,
  órgano lejano, **tic-tac de reloj como percusión**, coro etéreo "aah", metales
  suaves para el clímax, y un **piano melancólico** para el tema de Pip.
- **Modo**: menor melódico / dórico (melancolía noble); el Reloj impone el pulso.
- **Ritmo**: la Cadencia es el corazón del juego → la música respira al **compás**
  del combate (percusión de reloj marcando el beat que el jugador debe clavar). Los
  loops de combate se generan a un **BPM fijo por bioma** para poder alinearlos con
  el sistema de Cadencia más adelante.

---

## 2. Arquitectura de integración (procedural → híbrido)

**Hoy**: `AudioManager` (en `js/state.js`) es 100% procedural — música = dron de
órgano lejano + campanas esporádicas + tic-tac; SFX = beeps WebAudio. El bundle es
autocontenido, sin ficheros de audio.

**Propuesta (a validar con Daniel)** — pasar a **híbrido** sin romper lo anterior:
1. **Músicas ambientales** = loops generados (OGG Vorbis, ~30–60 s, *seamless*),
   en `assets/audio/`. Un `manifest.json` lista id→fichero.
2. **SFX de Cadencia/combate a tiempo** = **siguen sintetizados** (WebAudio da
   latencia cero; una muestra llegaría tarde y rompería el "de oído").
3. **SFX one-shot ambientales** (puerta, cofre, campanada de piso…) = muestras
   opcionales con **fallback al beep** actual.

**Coste de tamaño (importante)**: un loop OGG a 96 kbps de 45 s pesa ~0,5 MB. Con
~12 pistas son ~6 MB. El bundle autocontenido crecería mucho. Opciones:
- (a) **OGG comprimido** (64–96 kbps) embebido solo en una build "completa";
- (b) **carga bajo demanda** por `fetch` (rompe el offline puro del bundle);
- (c) **dos builds**: `mistveil_bundle.html` (ligero, procedural) y
  `mistveil_bundle_audio.html` (con música).
- **Recomendado**: (a)+(c). El juego servido por HTTP carga los OGG de
  `assets/audio/`; el bundle "con audio" los embebe en base64; si falta un fichero,
  `AudioManager` cae al dron procedural.

**API propuesta para `AudioManager`** (nueva, aditiva):
```
playTrack(id, { loop = true, fadeIn = 1.5 })   // arranca/cambia la pista de fondo
crossfadeTo(id, seg = 1.5)                       // transición sin costura entre escenas
addLayer(id, { fadeIn })                         // capa extra (Fase 2 de jefe, estilo Soken)
removeLayer(id, { fadeOut })
stopMusic(fadeOut = 1.0)
sample(id)                                       // one-shot con fallback a sfx(beep)
```
Respetan `GameState.opciones.vol_musica` / `vol_sfx` (ya existen). Emitir por
`EventBus` los cambios de escena y que un pequeño "director de audio" en `main.js`
llame a `crossfadeTo`/`addLayer` (los sistemas no llaman al audio directamente).

**Loop limpio**: pedir "seamless loop" a la herramienta y/o cortar en cruce por cero;
anotar los puntos de loop en el manifest. Normalizar a **-14 LUFS**.

---

## 3. Catálogo de MÚSICAS

`bpm` fijo para poder alinear con Cadencia. Prompts base en §6.

| id | escena / disparador | duración | mood | instrumentación firma | bpm |
|---|---|---|---|---|---|
| `mus_titulo` | pantalla de título | 40–60 s | sublime, melancólico, esperanzado | tema de Pip en celesta+arpa sobre cuerdas y coro lejano | 72 |
| `mus_pueblo` | hub del pueblo | 60 s | cálido, hogareño, nostálgico (town de Dragoon) | acordeón/arpa/celesta, cuerdas suaves, bajo cálido | 92 |
| `mus_pendulos` | combate biomas 1–3 | 45 s | tenso, rítmico, noble | carillón + cuerdas staccato al compás, tic-tac marcado | 120 |
| `mus_archivo` | combate biomas 4–6 | 45 s | misterioso, acuático, tinta | coro etéreo + glass harmonica + arpa, cuerdas graves | 110 |
| `mus_invertida` | combate biomas 7–9 | 45 s | vals roto, tiempo del revés | piano ligeramente desafinado + cuerdas en 3/4 irregular | 132 |
| `mus_truenos` | combate biomas 10–12 | 45 s | épico, eléctrico, tormenta | órgano + metales + percusión de trueno, coro | 138 |
| `mus_jefe` | jefes de raid — Fase 1 | 50 s | Soken dinámico, amenaza | riff de metal + orquesta + carillón grave | 140 |
| `mus_jefe_capa2` | jefe — Fase 2 (capa que ENTRA sobre `mus_jefe`) | 50 s | clímax | coro épico + doble tempo de percusión (se suma, no reemplaza) | 140 |
| `mus_redoble` | El Redoble (combate por turnos) | 50 s | jazzy battle de FF, juguetón-tenso | órgano+bajo walking+swing, metales | 128 |
| `mus_santuario` | Santuario (Memoria) | 40 s | reverente, etéreo | coro + arpa + campanas, reverb larga | 66 |
| `mus_victoria` | victoria de run | 15 s (no loop) | fanfarria triunfal-melancólica | metales + coro + celesta, cadencia resuelta | — |
| `mus_derrota` | game over | 20 s (no loop) | duelo íntimo | piano solo con el tema de Pip **roto**/incompleto | — |
| `sting_ignicion` | activar Ignición | 2–3 s (one-shot) | subida, "encendido del alma" | coro que asciende + campana brillante | — |
| `sting_piso` | descender de piso | 2 s (one-shot) | transición, respiro | glissando de arpa + campanada | — |

*Opcional (ambición alta)*: un tema por jefe en vez de `mus_jefe` genérico —
Campanero (bronce ceremonial), Archivera (coro acuático), Relojero (vals trágico),
Carillón (órgano de tormenta). Empezar por el genérico + capa2.

---

## 4. Catálogo de SFX

Los que ya existen como beep viven en `AudioManager.sfx(name)` (`state.js`). Un
one-shot generado los puede **sustituir** manteniendo el mismo `name` (fallback al
beep si falta la muestra). **NO** sustituir los de Cadencia marcados con ⏱ (necesitan
latencia cero → seguir sintetizados).

| id / `sfx` | evento | descripción de sonido | ¿muestra o sigue beep? |
|---|---|---|---|
| `ui_tap` | pulsar botón táctil | tick suave de mecanismo | muestra opcional |
| `cad_perfect` ⏱ | golpe de Cadencia perfecto | campanita cristalina que resuena | **beep** (tiempo real) |
| `cad_good` ⏱ | golpe bueno | click de engranaje afinado | **beep** |
| `cad_fail` ⏱ | fallo de ritmo | cuerda destemplada/madera | **beep** |
| `parry` ⏱ | Parada exitosa | *ting* metálico brillante + chispa | **beep** (o muestra muy corta) |
| `cad_counter` | ventana de contraataque (anillo rojo) | campanada de alarma noble | muestra opcional |
| `ignicion` | activar Ignición | *whoosh* de llama + coro breve (ver `sting_ignicion`) | muestra |
| `cast_nova`/`cast_onda`/`cast_cono` | Artes de Tinta | tinta que estalla / ola / abanico de fuego | muestra |
| `hit` | impacto en enemigo | golpe seco de metal/cera | muestra opcional |
| `enemy_die` | enemigo derrotado | mecanismo que se para + suspiro | muestra |
| `hurt` | Pip recibe daño | cristal/cerámica que se raja | muestra |
| `dash` | Dash | deslizamiento de aire corto | muestra opcional |
| `wax_break` | romper bloque de cera | crujido blando + goteo | muestra |
| `explode` | explosión (velón, etc.) | estallido grave con cola | muestra |
| `gold` | recoger oro | monedita clara | muestra opcional |
| `heart` | recoger corazón/curar | dos campanitas ascendentes cálidas | muestra opcional |
| `door_open` / `door_seal` | puerta de sala abre/sella | mecanismo pesado / cerrojo | muestra |
| `equip` / `tome` | equipar reliquia / aprender Arte | arpegio ascendente de "logro" | muestra |
| `boss_telegraph` (nuevo) | aviso de mecánica de jefe (aro que se cierra) | zumbido/coro de tensión que crece | muestra |
| `boss_resolve` (nuevo) | mecánica de jefe estalla | impacto orquestal + trueno | muestra |
| `boss_phase` (nuevo) | cambio de fase de jefe | campanada grave + el coro entra | muestra (dispara `mus_jefe_capa2`) |

---

## 5. Flujo de producción (por lote, cuando elijamos herramienta)

**Música**
1. Generar loop de 30–60 s con el prompt (§6), pidiendo *seamless loop* y el `bpm`.
2. Recortar a un loop limpio (cruce por cero), export **OGG Vorbis 64–96 kbps**.
3. Normalizar a −14 LUFS. Nombrar `assets/audio/<id>.ogg`. Registrar en el manifest.
4. Integrar: añadir la llamada `crossfadeTo('<id>')` en el director de audio al
   entrar en la escena/bioma. Probar el loop sin costura y el fallback (borrar el
   fichero → debe sonar el dron procedural sin romper).

**SFX**
1. Generar mono, corto, seco (sin música/reverb). Export OGG/WAV.
2. Recortar silencios. `assets/audio/sfx/<id>.ogg`.
3. Integrar en `AudioManager.sample('<id>')` con fallback a `sfx('<id>')` (beep).

**Build**
- `build_artifact.mjs`: opción de embeber los OGG en base64 (build "con audio") o
  saltarlos (build ligera). Documentar el peso resultante.

**Verificación** (como con el arte): smoke test verde, arranque del bundle sin
errores, y una pasada a oído en escritorio + iPhone (volúmenes `vol_musica`/`vol_sfx`).

---

## 6. Prompts base (plantillas en inglés)

**Plantilla MÚSICA** — sustituir `{MOOD}`, `{INSTR}`, `{KEY}`, `{BPM}`. **Sin nombres
propios** (ver aviso de ToS en §0): la fusión Uematsu×Soken×Dragoon se expresa por
la ÉPOCA y las texturas, no por los nombres.
```
An instrumental video game {MOOD} track, a seamless loop featuring {INSTR}. The mood
is melancholic gothic-clockwork dark fantasy in {KEY} minor at around {BPM} BPM, with
an emotive, memorable melody. Evoke the orchestral warmth of late-90s / early-2000s
JRPG soundtracks (PS1-era) with modern clarity and tasteful reverb. Seamless loop,
consistent tempo, no abrupt ending, no speech, no sound effects.
```
*(Validado: este formato pasa el filtro; el que nombraba compositores fue rechazado.)*
Ejemplos rellenos:
- `mus_titulo`: MOOD=*sublime and melancholic yet hopeful*, INSTR=*solo celesta and
  harp stating a wistful main theme over soft strings and distant choir*, KEY=*D*, BPM=72.
- `mus_pueblo`: MOOD=*warm, cozy, nostalgic town theme*, INSTR=*accordion, harp,
  celesta, gentle strings and warm upright bass*, KEY=*G*, BPM=92.
- `mus_truenos`: MOOD=*epic, electric, stormy battle*, INSTR=*cathedral organ, brass,
  thunder percussion, driving low strings and heroic choir*, KEY=*E*, BPM=138.
- `mus_jefe`: MOOD=*dynamic, menacing boss battle*, INSTR=*distorted guitar riff with
  full orchestra, low carillon bells and staccato strings*, KEY=*C*, BPM=140.

**Plantilla SFX** — sustituir `{SUBJECT}`:
```
{SUBJECT}, a single short sound effect for a dark clockwork-fantasy video game,
mono, dry, close-mic, punchy, no music, no reverb tail.
```
Ejemplos: *"a crystalline bell chime that rings out, rewarding a perfect rhythm
hit"* (`cad_perfect`), *"a bright metallic ting with a spark, a successful parry"*
(`parry`), *"a heavy brass mechanism unlocking and a door grinding open"*
(`door_open`), *"a tense rising choral swell that crescendos, warning of danger"*
(`boss_telegraph`).

---

## 7. Orden sugerido de lotes

1. **Lote M0 (validación)**: `mus_pueblo` + `mus_pendulos` + `sting_ignicion`
   (una escena tranquila, una de combate, un stinger) → validar estilo y bucle.
2. **Lote M1 (biomas)**: `mus_archivo`, `mus_invertida`, `mus_truenos`.
3. **Lote M2 (jefes)**: `mus_jefe` + `mus_jefe_capa2` (probar las capas de fase).
4. **Lote M3 (marco)**: `mus_titulo`, `mus_redoble`, `mus_santuario`,
   `mus_victoria`, `mus_derrota`.
5. **Lote S0 (SFX)**: los `boss_*` nuevos + reemplazos one-shot (puerta, cofre,
   ignición, artes). Cadencia se queda sintetizada.

Antes de nada: **Daniel decide** (a) herramienta de audio y (b) si aceptamos el
peso extra en el bundle o vamos con build "con audio" aparte. Con eso, se produce
M0 y se valida el estilo a oído.

---

## 8. Activar el conector de ElevenLabs (elegido por Daniel)

Daniel eligió **ElevenLabs** (`github.com/elevenlabs/elevenlabs-mcp`) — excelente
para **SFX** (`text_to_sound_effects`) y **voces/TTS** (`text_to_speech`,
`text_to_voice`); para las **músicas** ambientales, según qué exponga la versión del
MCP, se usa su generación musical o, si no, Suno/Udio y se importa el loop.

> **Importante**: Claude **no puede autoinstalarse el conector** en la sesión — es un
> servidor MCP **auto-alojado** que necesita **tu clave de API** y se registra en la
> config MCP de Claude Code. La clave es un **secreto**: **nunca** la pegues en el
> chat ni la subas al repo.

Ya dejé listo en la raíz `**.mcp.json**` (lee la clave de la variable de entorno,
sin secreto dentro):
```json
{ "mcpServers": { "ElevenLabs": {
  "command": "uvx", "args": ["elevenlabs-mcp"],
  "env": { "ELEVENLABS_API_KEY": "${ELEVENLABS_API_KEY}", "ELEVENLABS_MCP_OUTPUT_MODE": "files" }
} } }
```

**Cómo encenderlo, según dónde uses Claude Code:**

- **CLI / escritorio (local):**
  1. Instala `uv` (trae `uvx`): `curl -LsSf https://astral.sh/uv/install.sh | sh`.
  2. Exporta tu clave en la shell: `export ELEVENLABS_API_KEY=sk_...`
     (o ponla en tu gestor de secretos; **no** en el repo).
  3. Abre Claude Code en la carpeta del repo: detecta `.mcp.json` y te pide
     **aprobar** el servidor del proyecto. Acéptalo.
  4. Comprueba con `/mcp` que aparece **ElevenLabs** conectado; sus herramientas
     (`text_to_sound_effects`, `text_to_speech`…) ya estarán disponibles.
  - Alternativa sin `.mcp.json`: `claude mcp add ElevenLabs -e ELEVENLABS_API_KEY=sk_... -- uvx elevenlabs-mcp`.

- **Claude Code en la web (este entorno remoto):** el `.mcp.json` del repo puede no
  bastar (el sandbox web gestiona los MCP por *entorno* y hace falta que `uvx`/Python
  estén disponibles). Añádelo en los **ajustes del entorno / conectores** de Claude
  con `ELEVENLABS_API_KEY` como **secreto** del entorno. (El conector "ElevenLabs" del
  directorio de un clic **no** sirve: ese gestiona *agentes de voz*, no genera SFX.)

Cuando el conector esté activo y yo vea sus herramientas en la sesión, **empiezo por
el lote S0 (SFX)** — es lo más fuerte de ElevenLabs — y luego la música (§7), todo
con el flujo de §5 y guardando en `assets/audio/`.

**Mientras tanto**, si quieres arrancar ya, en esta sesión hay otro conector de audio
(música + TTS) con el que puedo hacer un primer pase de prueba del estilo.
