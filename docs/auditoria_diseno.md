# Auditoría de diseño de Mistveil a la luz del estudio de IA

> Fecha: 2026-07-18. Compañera de `docs/estudio_ia_gamedev.md`.
> Método: reviso cada pilar del juego con UNA pregunta —
> **¿este plan hace que la IA COORDINE (su debilidad) o que fabrique PIEZAS
> que el motor cose (su fortaleza)?** Donde coordina, se replantea.

Clasifico en tres cubos: **✅ ya alineado** (reafirmar y no tocar),
**⚠️ replantear** (rema en contra del grano de la IA) y
**🆕 oportunidad** (el perfil de fortalezas destapa algo que antes era caro).

---

## ✅ Ya alineado (decisiones que el estudio VALIDA — no tocar)
- **Salas de la Torre procedurales.** Son aleatorias y necesitan colisión real;
  un fondo pintado fijo no encaja. Texturas + props sueltos = piezas cosidas por
  código. Correcto.
- **Pip y enemigos = pieza pintada + animación por motor.** La decisión de arte
  más importante ya es la correcta.
- **Red de seguridad** (fallback + smoke + captura headless + balance en JSON).
- **Tamaños por tabla de código, no por la imagen.**

Nada que hacer aquí salvo mantener la disciplina.

---

## ⚠️ Replantear (rema contra el grano)

### R-A. Jefes: piezas de ESTADO, no un sprite grande "animado"
El ROADMAP (R3.2) pide "2 fases por jefe". El instinto sería animar la
transformación — y eso es justo lo que la IA NO hace (frames inconsistentes).
**Replanteo:** cada jefe = 2-3 piezas de estado distintas (íntegro / furioso /
roto) que el motor INTERCAMBIA en los cambios de fase, más los patrones y FX por
código. La "animación de fase" son cambios de lámina + partículas, no fotogramas.
Encaja de lleno con la fortaleza (pieza única grande) y con la debilidad #6 de
código (el feel de la pelea lo afinas tú, no la IA).

### R-B. El Redoble (combate por turnos, cámara FIJA) → escena pintada
Hoy El Redoble se dibuja procedural. Pero es una **escena de cámara fija** — el
caso perfecto del pueblo, que ya demostró que **escenario pintado + sprites +
retratos** sube la calidad muchísimo por ~2 créditos. Es la mayor mejora de
calidad barata que queda sin tomar. **Replanteo:** arena de El Redoble como
telón pintado + sprites de enemigo + retratos en los diálogos de combate.

### R-C. Cámaras especiales (fundición/fusión/metrónomo/apuestas) → semi-fijas
Son salas de propósito único, casi fijas. Candidatas a fondo pintado como el
pueblo. **Matiz de coste:** cada fondo pesa ~2 MB; ver R-E. Decisión de Daniel
(cuántas pintar). No bloqueante.

### R-D. Deriva de estilo entre lotes (el "estilo personalizado" sigue caído)
Al añadir biomas 2-3 y más enemigos, sin el estilo personalizado de Recraft el
riesgo es que los lotes tardíos se separen de los primeros. **Replanteo (norma):**
mantener una **"biblia de estilo"** = un set fijo de 3-4 imágenes-referencia
(Pip + un enemigo + una textura) que se ADJUNTA o se usa como entrada i2i en cada
generación; y un **control A/B** al empezar cada lote (regenerar una pieza ya
aprobada y comparar). Barato y evita el drift.

### R-E. Presupuesto de fondos pintados (peso del bundle)
Cada escena pintada ≈ 2 MB. Meta itch.io < 8 MB. **Replanteo (restricción de
diseño explícita):** los fondos pintados son un recurso ESCASO — reservarlos
para escenas fijas de alto impacto (pueblo ✅, victoria, Redoble, y como mucho 1
"plano de establecimiento" por bioma). Las salas de la Torre siguen procedurales
(peso ~0). Si hiciera falta, reescalar/comprimir con Magnific antes de lanzar.

### R-F. Refactor (R4) ANTES, no después — al menos `js/escenas.js`
El estudio lo dejó claro: meter código de integración de arte en el god-file
`main.js` (~3400 líneas) multiplica bugs latentes (como el `x, y` de Una Mano).
Y las tres últimas tandas (sprites, pueblo, fondo) han engordado main.js/rooms.js/
pueblo.js. **Replanteo:** adelantar un TROZO de R4 — extraer un módulo
`js/escenas.js` (fondo pintado + sprites + retratos + cámara de escena) ANTES de
pintar el Redoble y las viñetas. Se hace una vez y todo lo pintado nuevo entra
limpio, sin engordar el god-file.

---

## 🆕 Oportunidades que el estudio DESTAPA (antes eran "caras")

### O-A. Mistveil puede tener MUCHA más alma, barata
El pueblo demostró que **escena pintada + retrato + diálogo = emoción a coste
ínfimo**. Eso cambia el cálculo: la narrativa deja de ser un lujo caro.
**Propuesta:** viñetas de entrada a cada bioma (un plano + 2-3 líneas con
retrato), pequeños arcos de los NPCs entre runs, y un **final de verdad** (R3.4)
como secuencia pintada. Con la técnica del pueblo, todo esto es asequible.

### O-B. Convertir el "defecto" en estética: vecinos pintados
La IA cuela gente en las escenas aunque digas "sin gente". En vez de pelearlo,
**adoptarlo como estilo**: figurantes pintados = ambiente; solo los
interactuables son sprites. Escenas pobladas gratis (muy FFIX). Ya está pasando
en el fondo del pueblo — hacerlo intención, no accidente.

### O-C. Doblar la apuesta por lo que la IA BORDA: bestiario de relojería
Las criaturas de silueta única y temáticas del reloj (cera, latón, polvo) salen
excelentes Y refuerzan el estilo solas. El bestiario puede crecer barato.
**Propuesta de conceptualización:** los enemigos nuevos de biomas 2-3 y los
elementos infrautilizados (luz/oscuridad/trueno, R3.5) se diseñan con ese molde
— "un mecanismo de reloj con una idea clara" — no con conceptos que exijan
multitud, texto o dependencia entre assets.

### O-D. Más vida de Pip, barata (lo que preguntaste el otro día)
Poses clave + hooks de código: **celebrar** (bajar de piso / subir nivel),
**herido**, **canalizar** (Ignición/Arte), **sentarse** (pueblo/descanso). Cada
una ~3 créditos, animadas por el motor. Da vida sin caer en el "hervido" de los
sprite sheets.

---

## Replanteo del ROADMAP (qué cambia, en concreto)
1. **Adelantar** la extracción de `js/escenas.js` (trozo de R4) antes de pintar
   más escenas. → nueva tarea R4.0.
2. **R3.2 (jefes)** se reescribe como "piezas de estado + patrones por código".
3. **Nuevas tareas** en R-Assets/R3: Redoble pintado; viñetas de bioma + final
   pintado; biblia de estilo + control A/B; poses extra de Pip.
4. **Restricción explícita:** presupuesto de fondos pintados (< ~6-7 en total).
5. Lo demás del ROADMAP (salas procedurales, sellos, PWA…) queda **validado**
   por el estudio; no se toca.

## Bifurcaciones que decides TÚ (Daniel)
1. **Ambición de fondos pintados** (belleza ↔ peso): ¿solo pueblo + victoria, o
   también Redoble + cámaras + un plano por bioma?
2. **¿Cuánta narrativa?** ¿Invertimos en alma (viñetas, arcos, final pintado) o
   priorizamos completar contenido/jefes primero?
3. **Orden del arte restante:** ¿cerrar la Torre (enemigos + biomas + jefes) o
   abrir el frente de escenas (Redoble, viñetas)?

## Conclusión
El diseño de Mistveil está, en su mayoría, **ya alineado** con lo que la IA hace
bien — no por suerte, sino porque fuimos corrigiendo sobre la marcha. Los tres
replanteos con más retorno son: **(1)** sacar `escenas.js` antes de pintar más,
**(2)** convertir El Redoble en escena pintada, y **(3)** aprovechar que la
narrativa ya es barata para darle alma. Todo lo demás es mantener disciplina.
