# Spec — Objetos y sinergias
Filosofía (lección de Isaac): priorizar **modificadores de comportamiento** sobre daño plano. Un item debe cambiar CÓMO juegas, no solo cuánto pegas.

## Esquema (data/items.json)
```json
{
  "id": "tinta_dividida",
  "nombre": "Tinta dividida",
  "descripcion": "Tus lágrimas se dividen en dos al impactar.",
  "rareza": "raro",            // comun | raro | legendario
  "pools": ["tesoro", "jefe"],
  "tags": ["lagrimas"],         // lagrimas | cadencia | dragoon | stats | movilidad | activo
  "efectos": [ { "tipo": "tear_flag", "flag": "split_on_hit" } ]
}
```

## Tipos de efecto que el motor debe soportar
| tipo | params | Qué hace |
|---|---|---|
| `stat` | `stat`, `add` y/o `mult` | Modifica stat del player (damage, fire_rate, speed, range, hp_max, luck…). |
| `tear_flag` | `flag` | Activa comportamiento de proyectil: `split_on_hit`, `burn`, `pierce`, `homing_light`, `mirror_back`, `heavy`… |
| `cadencia_mod` | `param`, `add`/`mult` | Modifica Cadencia: tamaño de ventanas, golpes extra de combo, SP por acierto… |
| `dragoon_mod` | `param`, `add`/`mult` | Duración de Sello, coste, poder de D-Addition… |
| `on_event` | `evento`, `accion`, params | Reactivo: p. ej. `evento: addition_finisher` → `accion: shockwave`. |
| `familiar` | `id` | Añade familiar (orbital, disparador…). |
| `element_change` | `elemento` | Cambia el elemento de tus ataques. |
| `activo` | `accion`, `cooldown_salas` | Item activable (tecla propia), recarga limpiando salas. |

Un item = lista de efectos; los efectos se ACUMULAN entre items. Las **sinergias emergentes** salen de combinar flags (ej.: `split_on_hit` + `burn` = lágrimas incendiarias que se dividen). Sinergias EXPLÍCITAS especiales pueden definirse en `sinergias` (items.json, opcional) cuando dos ids juntos deban producir algo único.

## Reglas
- El HUD muestra nombre+descripción 2,5 s al recoger; los pasivos se listan en pausa.
- `rareza` pondera el pool: común 60% / raro 33% / legendario 7% (balance.json).
- Un item recogido sale del pool de la run (sin duplicados salvo tag `stackable`).
- Nunca implementar un item hardcodeado en una escena: TODO pasa por el motor de efectos leyendo items.json. Añadir un item nuevo = añadir JSON (+ código solo si introduce un `tipo` nuevo).

## Los 20 items iniciales (resumen; datos completos en items.json)
1. **Tinta dividida** — lágrimas se dividen al impactar.
2. **Cera caliente** — lágrimas queman (elemento fuego, DoT).
3. **Lágrima pesada** — +daño, −cadencia, atraviesan bloques de cera.
4. **Segundero suelto** — +velocidad de movimiento.
5. **Cuerda extra** — +1 corazón máximo y cura 1.
6. **Manecilla rota** — +1 golpe a todos los combos de Cadencia.
7. **Metrónomo de bolsillo** — ventanas de Cadencia +40%.
8. **Péndulo quieto** — parry perfecto congela la sala 0,5 s.
9. **Campana rasgada** — el primer counter de cada sala se supera solo.
10. **Eco del reloj** — el finisher emite onda expansiva.
11. **Batería de almas** — +50% SP ganado.
12. **Sello agrietado** — +4 s de forma Dragoon.
13. **Ojo de vidrio** — revela el mapa del piso.
14. **Aceite negro** — el dash deja un rastro que daña.
15. **Lágrimas espejo** — también disparas hacia atrás.
16. **Tinta viva** — familiar que dispara contigo.
17. **Polilla lunar** — orbital que bloquea proyectiles.
18. **Páginas perdidas** — las salas del tesoro ofrecen 2 items (eliges 1).
19. **Corazón de lata** — 1 punto de armadura por sala.
20. **Arena del tiempo** (ACTIVO) — cámara lenta global 3 s; recarga: 4 salas.

## Sinergias explícitas de arranque (verificar en Fase 5)
- Tinta dividida + Cera caliente → "Enjambre ardiente": las divisiones heredan el burn.
- Manecilla rota + Eco del reloj → el golpe extra también es finisher (2.ª onda).
