# Estudio: fortalezas y límites de la IA para Mistveil (imagen + código)

> Fecha: 2026-07-18. Escrito con evidencia REAL de este proyecto (no teoría
> genérica): cada punto lleva "lo vimos cuando…". Objetivo: diseñar Mistveil
> jugando a favor de lo que la IA hace bien y esquivando lo que hace mal, para
> ir más rápido y con mejor resultado.

## Idea central (si solo lees esto)
La IA es un **motor de piezas**, no un **director de escena**. Brilla generando
*una cosa aislada y bien acotada* (un personaje, un prop, una textura, un
sistema de código con patrón claro). Falla cuando tiene que *coordinar varias
cosas entre sí* (que dos imágenes casen, que un personaje sea el mismo en 6
poses, que el código encaje geométricamente sin ver el resultado).

**Regla que emerge de todo el estudio:**
> Que la IA genere PIEZAS; que el MOTOR (código) las componga, las anime, las
> escale y las coloque; y que SIEMPRE haya verificación visual + un plan B.

Todo lo que ya funciona bien en Mistveil (Pip pintado + animado por código, el
pueblo pintado + sprites encima, el troceador, los fallbacks) es exactamente
esta regla aplicada. Todo lo que dio problemas fue pedirle a la IA que
coordinara.

---

## PARTE 1 — Generación de imágenes

### Fortalezas (aprovechar sin miedo)
1. **Un sujeto único, centrado, sobre fondo neutro.** Es su terreno estrella.
   *Lo vimos:* Pip, los 4 enemigos del piso 1, los NPCs, los props del muro —
   todos salieron bien a la 1ª o 2ª. Coste ridículo (~3-4 créditos/pieza).
2. **Texturas y escenarios "clonando" una referencia.** Con *imagen-a-imagen*
   partiendo de un recorte, hereda paleta y pincelada con fidelidad.
   *Lo vimos:* el suelo/muro de Péndulos y el emblema del suelo salieron del
   recorte de TU mockup → clavaron el tono malva oscuro que un prompt de texto
   no acertaba.
3. **Quitar fondo (remove_background) de sujeto oscuro sobre fondo oscuro.**
   Su IA de recorte gana a cualquier truco de umbrales por código.
   *Lo vimos:* el manto índigo de la cera se lo comía nuestro recorte local;
   el de Recraft lo dejó perfecto.
4. **Anclar el estilo.** Pegar una imagen de referencia + un bloque de prompt
   duro ("CRITICAL STYLE… NOT cute, NOT watercolor") mantiene coherencia entre
   piezas distintas sorprendentemente bien. *Lo vimos:* los 30+ sprites parecen
   del mismo juego sin usar siquiera el "estilo personalizado".
5. **Iteración baratísima.** Pedir 2 variantes y elegir es más barato que
   pelear un prompt. Regenerar sale a céntimos.

### Debilidades (diseñar ESQUIVÁNDOLAS)
1. **Consistencia del MISMO personaje entre generaciones.** Pedir "Pip saltando"
   desde cero da un Pip distinto. *Mitigación que funciona:* imagen-a-imagen
   partiendo del sprite base. *Lo vimos:* el retrato de Pip salió idéntico a su
   sprite porque lo generamos DESDE su sprite.
   → **Consecuencia:** nunca generar una variante de un personaje "a pelo";
   siempre desde una imagen suya.
2. **Animación cuadro a cuadro.** No mantiene el personaje estable entre frames:
   una tira de "andar en 6 fotogramas" sale con el cuerpo "hirviendo". *Por eso*
   pedimos 1-3 poses y anima el motor (balanceo, inclinación, squash). Es la
   decisión más importante del proyecto en arte.
   → **Consecuencia:** cero sprite sheets de animación. Poses clave + código.
3. **Texto y rótulos.** Escribe letras que parecen texto pero son ilegibles.
   *Lo vimos:* el "GUILD NOTICE" del tablón salió como jeroglífico; hubo que
   regenerar prohibiendo letras.
   → **Consecuencia:** TODO el texto del juego lo pone el motor con la fuente
   VT323. La IA solo hace el marco/ilustración, nunca el texto.
4. **"Deriva a lo mono".** Los sujetos entrañables se van a peluche infantil.
   *Lo vimos:* el velón inestable salió "peluche triste"; se arregló con
   negativas duras ("menacing, grotesque, NO fur").
   → **Consecuencia:** en enemigos que deban dar miedo, cargar el prompt de
   amenaza desde el inicio.
5. **Mete cosas que NO pides.** En escenas pone gente, en muros pone velas,
   aunque digas "sin gente". *Lo vimos:* el fondo del pueblo trajo vecinos
   pintados; los muros, candelabros. *Mitigación:* o se aceptan como "figurantes
   de fondo" (muy FFIX) o se recorta una franja limpia.
   → **Consecuencia:** no depender de que una escena salga "vacía"; diseñar para
   que lo pintado de más sea aceptable.
6. **Encuadre sesgado.** Tiende a bustos y a cortar cuerpos por la cintura,
   sobre todo tras un mostrador. *Lo vimos:* Margo salió cortada; hubo que pedir
   "FULL BODY, head to feet".
7. **No sabe ESCALAS ni RELACIONES entre piezas.** Cada asset vive en su lienzo;
   la IA no sabe que la Puerta debe ser 3× Pip. *Lo vimos:* por eso los tamaños
   los decide el MOTOR (nuestra tabla `ALTURAS` del pueblo), no la imagen.
   → **Consecuencia:** el tamaño relativo es SIEMPRE decisión de código.
8. **Perspectiva top-down consistente.** Cuesta que todos los assets compartan
   el mismo ángulo cenital 3/4. Se controla con el bloque técnico del prompt,
   pero hay que vigilarlo pieza a pieza.
9. **Tileabilidad real.** Las texturas "repetibles" traen costuras, viñeta o un
   objeto focal. *Lo vimos:* los muros salían como "paisaje con muralla" hasta
   forzar encuadre macro; el suelo hubo que recortarlo.
10. **Herramientas inestables.** El endpoint de "estilo personalizado" de Recraft
    lleva días devolviendo error 500; los conectores MCP se caen entre sesiones.
    → **Consecuencia:** no diseñar un flujo que DEPENDA de una función concreta;
    tener plan B (prompt anclado en vez de estilo personalizado).

---

## PARTE 2 — Generación de código

### Fortalezas
1. **Sistemas nuevos con patrón claro.** Data-driven, pub/sub, un módulo con
   entradas/salidas definidas: los escribe rápido y bien. *Lo vimos:* el
   cargador de sprites con fallback, el troceador, el bundle de un archivo.
2. **Andamiaje y tuberías (pipelines).** Herramientas que transforman datos
   (troceo por transparencia, multi-recorte de hojas, empaquetado en base64)
   son ideales: entrada y salida verificables.
3. **Refactor mecánico y "glue".** Conectar piezas existentes, mover código,
   adaptar formatos. Bajo riesgo.
4. **Matemáticas CUANDO se pueden ver.** Layout medido con `measureText`,
   proyección 2.5D: acierta si hay una captura que valide.
5. **Volumen y velocidad.** Genera mucho código coherente rápido, y documenta.

### Debilidades
1. **Bugs latentes en código que nadie ejercita.** Escribe rutas que "parecen"
   correctas y nunca se ejecutan hasta que un caso las toca. *Lo vimos HOY:* el
   `ReferenceError` de Una Mano (usaba `x, y` inexistentes) llevaba ahí desde
   antes; solo apareció al probar el táctil.
   → **Consecuencia:** verificación headless de cada camino, no solo del feliz.
2. **Geometría/coordenadas SIN ver el resultado.** El código "compila" pero
   coloca mal. *Lo vimos:* el fondo del pueblo necesitó 4-5 iteraciones con
   captura para que Pip pisara el adoquinado. La IA no "ve" el encaje.
   → **Consecuencia:** todo lo visual se ajusta a golpe de captura, no de
   razonamiento.
3. **Casos límite y plataformas.** Olvida el "y en móvil, con ZOOM 1.45…".
   *Lo vimos:* el fondo del pueblo hubo que revalidarlo aparte en móvil.
4. **Coherencia en un archivo gigante.** `main.js` (~3400 líneas) es terreno
   donde es fácil introducir contradicciones. *Consecuencia:* trocearlo (fase
   R4) hará que la IA (y cualquiera) trabaje más seguro.
5. **"Alucinar" APIs, valores o firmas** que suenan plausibles pero no existen.
   Se caza compilando/ejecutando, no leyendo.
6. **No siente el GAME FEEL.** Puede ajustar un número, pero si 0.14s de
   i-frames "se sienten" bien lo decides tú jugando. La IA no juega.

### La red de seguridad que YA usamos (y por qué es correcta)
- **Fallback siempre:** sin un asset, el juego dibuja/suena como antes. Un PNG
  roto o un conector caído nunca rompe el juego.
- **Smoke test verde antes de cada commit** (82 asserts): caza roturas
  estructurales.
- **Captura headless de cada pantalla tocada:** la IA "se ve" a sí misma; es lo
  único que caza los fallos de geometría y de estilo.
- **Todo el balance en JSON (F5):** el game feel lo afina Daniel jugando, sin
  tocar código.

---

## PARTE 3 — Decisiones de diseño para Mistveil
(Lo que este estudio recomienda ADOPTAR como norma.)

| Ámbito | Decisión | Por qué (fortaleza/debilidad) |
|---|---|---|
| **Personajes** | 1-3 poses pintadas por personaje; anima el motor. Cero sprite sheets. | Debilidad #2 imagen (animación) |
| **Variantes de un personaje** | Siempre imagen-a-imagen DESDE su sprite base. | Debilidad #1 imagen (consistencia) |
| **Texto en pantalla** | Siempre por código (VT323). La IA solo marco/ilustración. | Debilidad #3 imagen (texto) |
| **Tamaños relativos** | Los fija el motor (tabla de alturas), nunca la imagen. | Debilidad #7 imagen (escalas) |
| **Escenas (pueblo, y quizá cámaras/jefes)** | Fondo pintado a pantalla + actores sprite encima (validado en el pueblo). | Fortaleza #1/#2 imagen |
| **Salas de la Torre** | Mantener PROCEDURAL (texturas + props sueltos), NO fondos pintados: son aleatorias y necesitan colisión real; un fondo fijo no encaja. | Debilidad #7 imagen + necesidad de gameplay |
| **Enemigos con miedo** | Prompt cargado de amenaza desde el inicio ("grotesque, NO fur"). | Debilidad #4 imagen |
| **Jefes** | Pieza pintada grande + patrones y FX por código. | Fortaleza imagen + debilidad #6 código (feel) |
| **Iconos con texto/rótulo** | Ilustración por IA, el texto lo compone el motor. | Debilidad #3 imagen |
| **Audio** | Seguir procedural; efectos puntuales por IA con fallback. Música SIEMPRE por código (identidad). | Mismo principio: pieza vs composición |
| **Código nuevo** | Preferir módulos data-driven con entrada/salida claras + smoke + captura. | Fortalezas código + red de seguridad |
| **Todo lo visual** | No se da por bueno sin captura headless (escritorio Y móvil). | Debilidad #1/#2 código |

### Conceptualización: qué buscar y qué evitar al INVENTAR contenido
- **Buscar** enemigos/NPCs/props de **silueta única y clara** (la IA los borda),
  temáticos del reloj (cera, latón, polvo) para que el estilo se auto-refuerce.
- **Evitar** conceptos que exijan: multitudes coherentes, texto legible en el
  arte, o que un asset "sepa" de otro (tamaños, encajes). Eso es trabajo de
  motor, no de imagen.
- **Aprovechar el "defecto" como estética:** los figurantes que la IA pinta de
  más en las escenas → vecinos de fondo (muy FFIX). Convertir límites en estilo.

---

## PARTE 4 — Riesgos a vigilar (no bloqueantes, pero presentes)
- **Peso del bundle:** ya en ~2 MB (el fondo del pueblo pesa). Meta < 8 MB para
  itch.io; vigilar por lote. Opción futura: reescalar/comprimir con Magnific.
- **Deriva de estilo entre lotes:** si el "estilo personalizado" no vuelve,
  vigilar que los lotes tardíos no se separen de los primeros (control A/B).
- **Dependencia de conectores que se caen:** trabajar por tandas y tener el
  material listo para disparar cuando el conector esté vivo.
- **Divulgación de IA generativa** obligatoria en itch.io (ya en el ROADMAP R5.5).
- **Coste:** ~55 assets × 3-4 créditos ≈ 250 de 1000/mes. Holgado, pero las
  regeneraciones suman.

## Conclusión operativa
No hemos ido "probando"; sin saberlo ya estábamos aplicando la regla de oro. Este
estudio la hace explícita para no desviarnos: **la IA fabrica piezas excelentes;
Mistveil las cose por código.** Cada vez que una tarea future huela a "que la IA
coordine/anime/escale/escriba texto/case dos cosas", la partimos: pieza(s) por
IA + composición por motor + captura que lo valide.
