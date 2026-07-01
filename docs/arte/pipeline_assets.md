# Spec — Arte, audio y pipeline de assets con IA

## Dirección de arte
- **Estilo**: pixel art "ilustrado" moderno (referentes: Sea of Stars para luz/color, FFIX para diseño de personajes y pueblo, Isaac para iconografía grotesca de la mazmorra, Hades para retratos/UI).
- **Cámara**: top-down ligeramente inclinada en mazmorra; pueblo más escénico.
- **Paletas**: Pueblo = cálida crepuscular (dorados, terracotas). Mazmorra = fría (azules grisáceos, cera hueso, tinta negra) con acentos de elemento.
- **Colores de elemento** (coherentes SIEMPRE, definidos en `data/elementos.json`): fuego #E4572E · agua #4FC3F7 · viento #66BB6A · tierra #8D6E63 · luz #FFD54F · oscuridad #3949AB · trueno #AB47BC · neutro #9E9E9E.

## Especificaciones técnicas
| Asset | Tamaño | Formato |
|---|---|---|
| Sprites personajes | 48–64 px alto, 4 direcciones | PNG hoja de sprites + filas por animación |
| Enemigos piso 1 | 32–48 px | PNG |
| Jefes | 96–160 px | PNG |
| Tiles | 32×32 | PNG tileset en rejilla |
| Retratos diálogo | 96×96 (o 128×128) | PNG, 2–4 expresiones/personaje |
| Iconos de item | 24×24 | PNG |
| UI | 640×360 de referencia | PNG |
- Filtro de textura: **Nearest** (pixel perfect). Sin antialiasing.
- Nombres: `assets/sprites/<entidad>/<entidad>_<anim>_<dir>.png` (ej. `pip_walk_down.png`). Música: `assets/audio/music/<zona>_<nombre>.ogg`. SFX: `assets/audio/sfx/<evento>.ogg`.

## Herramientas de IA (las usa DANIEL, no Claude Code)
- **Sprites/tiles/animación**: PixelLab.ai (plan de pago ~12 €/mes; rotaciones 4/8 direcciones, animación, plugin Aseprite) + retoque en **Aseprite** (pago único). Alternativa ética/local: Retro Diffusion.
- **Retratos JRPG**: Midjourney con `--cref` para consistencia entre expresiones (plan de pago).
- **Música**: Suno **Pro** (el plan gratuito NO da derechos comerciales; descargar y respaldar pronto). Estilo: orquestal de caja de música, leitmotifs por personaje.
- **SFX**: ElevenLabs (plan Starter) — prioridad absoluta: los 4 sonidos de Cadencia (perfecta/buena/fallo/counter) nítidos y distinguibles.
- Publicación: recordar marcar **divulgación de IA generativa** en itch.io (y Content Survey si algún día Steam).

## Flujo de trabajo de assets (IMPORTANTE para Claude Code)
1. Claude Code NUNCA genera binarios ni bloquea tareas por arte: usa placeholders (formas de color; tinte = color del elemento o gris para neutro).
2. Cuando un asset haga falta, Claude Code AÑADE una fila a `ASSETS_PENDIENTES.md` con: ruta esperada, tamaño exacto, nº de frames/direcciones, descripción visual breve (1–2 frases con el tono del juego) y prioridad.
3. Daniel genera el asset con las herramientas de arriba, lo guarda EXACTAMENTE en la ruta indicada y marca la fila.
4. En la siguiente sesión, Claude Code integra los assets marcados (reemplaza placeholder, ajusta AnimatedSprite2D/AtlasTexture) y mueve la fila a "Integrados".

## Audio — dirección
- Pueblo: arpa/celesta/piano, tempo lento, melancolía cálida. Mazmorra: percusión de relojería + cuerdas. Transformación Dragoon: crescendo coral corto (stinger). Jefes: tema propio.
- SFX de Cadencia jugables "de oído" (ver combate.md): esto va antes que cualquier música.
