# GDD — MISTVEIL: El Reloj de las Almas
*(Resumen ejecutivo; las especificaciones detalladas están enlazadas)*

## Pitch
Un cuento de hadas oscuro y rejugable donde encarnas a autómatas de alma prestada que descienden a una catedral-mazmorra viva para robar más tiempo de vida. El disparo por salas de **The Binding of Isaac** + los combos cronometrados y transformaciones dragón de **The Legend of Dragoon** + la melancolía encantadora de **Final Fantasy IX**. Cada muerte te devuelve al pueblo: un poco más cerca de la verdad, un poco más lejos de la inocencia.

- **Género**: action-roguelite twin-stick con combate de timing y narrativa RPG.
- **Run**: 20–45 min · **Historia completa**: 15–25 h · **Plataforma**: PC (itch.io gratis; Steam posible futuro).
- **Motor**: Godot 4.x + GDScript, desarrollado con Claude Code.

## Los tres pilares → qué toma el juego de cada uno
| Pilar | Aporta |
|---|---|
| Isaac | Salas procedurales, twin-stick, items con sinergias, secretos, estructura roguelite. |
| Dragoon | **Cadencia** (Additions en tiempo real), contraataques QTE, Sellos/transformaciones dragón, 8 elementos con oposiciones. |
| FFIX | Pueblo-hub con personajes queribles, ATE, tono de cuento melancólico, tema de la mortalidad (eje Vivi/Kuja). |

## Loop de juego
**Pueblo** (historia, ATE, Árbol de Recuerdos, equipar Sello) → **Descenso** (pisos procedurales: limpiar salas en tiempo real, Cadencia para cargar SP, transformarte en momentos clave, items que rompen el juego) → **Muerte o victoria** → regreso al pueblo con **Memoria** y avance narrativo → repetir, más fuerte en variedad y en verdad.

## El sistema-firma: la Cadencia
Melé con anillo de sincronía SIN pausar la acción: acertar la ventana encadena el combo, sube el daño y carga SP; algunos enemigos contraatacan (anillo rojo → parry). SP lleno = transformación Dragoon elemental temporal con su D-Addition. Riesgo (acercarse y ejecutar timing bajo fuego) ↔ recompensa (poder épico). **Detalle completo: `docs/sistemas/combate.md`.**

## Documentos del proyecto
- Combate híbrido → `docs/sistemas/combate.md`
- Generación procedural → `docs/sistemas/generacion_procedural.md`
- Objetos y sinergias → `docs/sistemas/objetos_sinergias.md`
- Meta-progresión, pueblo y guardado → `docs/sistemas/metaprogresion.md`
- Mundo, personajes, actos, ATE → `docs/narrativa/historia_personajes.md`
- Arte, audio y pipeline IA → `docs/arte/pipeline_assets.md`
- Plan de trabajo → `ROADMAP.md` · Reglas de código → `CLAUDE.md`

## Principios de diseño (desempates)
1. Si una decisión enfrenta profundidad vs legibilidad en combate: gana la **legibilidad**.
2. La meta-progresión añade **variedad antes que poder**.
3. El tema se **muestra**, no se explica.
4. Placeholder hoy > bloqueo esperando arte.
5. Divertido en la sala de pruebas antes que grande en el papel.
