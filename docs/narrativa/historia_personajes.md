# Spec — Narrativa: mundo, personajes y ATE
Tono: cuento de hadas melancólico (FFIX) + épica elemental (Dragoon) + oscuridad de mazmorra (Isaac). Tema central: **qué significa estar vivo cuando tu tiempo está contado**.

## Mundo: el reino de Vael
La vida se fabrica: los **Encendidos** son muñecos/autómatas con un fragmento de alma prestada y fecha de caducidad. Al "detenerse", su alma vuelve al **Gran Reloj**. Bajo la Catedral de Ceniza está el **Reloj de las Almas**: una mazmorra que se reconfigura cada noche (→ procedural) donde, dicen, se puede renegociar el propio tiempo. Los Encendidos que caen dentro no mueren: despiertan al amanecer en el pueblo, recordando (→ roguelite y Memoria).

## Personajes
- **PIP** (protagonista): niño-marioneta con un ojo de vidrio que marca su tiempo como esfera de reloj. Tartamudea al hablar de "detenerse". Arco (eje Vivi): del pánico existencial a la aceptación — "Si voy a detenerme… quiero detenerme habiendo servido de algo."
- **LADY VESPER** (mentora): Dragoon autómata de otra era, cínica y elegante; enseña los Sellos. Secreto: su tiempo expiró hace años; funciona "de prestado". Arco: de la resignación a volver a creer.
- **EL RELOJERO** (antagonista trágico, eje Kuja): Encendido que rechaza su obsolescencia. Plan: detener el Gran Reloj para que nadie muera jamás — congelando el mundo en un presente sin alma. "Si la vida solo trae la angustia de perderla, aboliré la vida."
- **Pueblo**: MARGO, golem panadera que hornea para clientes que ya no existen; los HERMANOS N.º 7 y N.º 12, que llevan la cuenta de los suyos detenidos; CORO, ave de fuego mascota.

## Estructura (3 actos)
- **Acto I — "Media noche"**: Pip despierta recién encendido; primer descenso; se establece el bucle. Jefe: Guardián de Cera.
- **Acto II — "Las manecillas se aceleran"**: la Bruma se agota; Encendidos se detienen antes de tiempo; Vesper enseña los Sellos. Golpe emocional: se detiene alguien querido del pueblo.
- **Acto III — "La hora cero"**: el plan del Relojero; descenso al corazón del Gran Reloj; elección final — restaurar el ciclo (aceptar la mortalidad, agridulce) o detenerlo. Jefe final en 2 fases + **La Quietud** (la nada al final de todo reloj).

## ATE (Active Time Events)
Escenas cortas OPCIONALES en el pueblo entre runs, estilo FFIX: muestran vida ajena a Pip y a veces dan una recompensa pequeña. Trigger: al volver de una run, el Tablón muestra "◆ Mientras tanto…". Acto I:
1. **"Pan de ayer"** — Margo hornea de madrugada para nadie. (+1 corazón la próxima run)
2. **"La cuenta"** — Los Hermanos discuten si contar a los detenidos es recordarlos o torturarse. (lore)
3. **"El ensayo"** — Vesper practica a solas una Addition que ya no puede completar. (desbloquea diálogo de combate)

## Diálogos de muestra (tono y voz)
> **PIP:** ¿Y si mañana no… no me enciendo?
> **VESPER:** Entonces hoy pesa el doble. Levanta la espada.

> **MARGO:** El pan no sabe a nada si no hay nadie que lo espere. Aun así, se hornea. Aun así, se vive.

> **EL RELOJERO:** Tú cuentas tus horas con miedo, pequeño. Yo solo propongo… dejar de contar.

## Guía de escritura para Claude Code
- Frases cortas, imágenes concretas (cera, cuerda, engranajes, pan, campanas). Nada de jerga épica hueca.
- Humor suave y físico en el pueblo; silencio y eco en la mazmorra.
- Prohibido explicar el tema en voz alta: mostrarlo (nadie dice "la vida importa por ser finita").
- Todo texto visible va a `data/textos_es.json` con claves `dlg.<personaje>.<escena>.<n>`.
