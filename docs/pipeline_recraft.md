# Pipeline de arte con Recraft (optimizado tras la prueba del 2026-07-18)

Sustituye el flujo manual con ChatGPT de `docs/encargo_arte.md` (que queda como
referencia de diseño). Todo lo operativo vive en `tools/encargo.json`.

## Qué aprendimos en la prueba (la cera andante)
1. **El prompt en inglés y con ancla dura funciona.** El primer intento "suave"
   salió acuarela infantil; con el bloque `CRITICAL STYLE: dark romanticist OIL
   PAINTING… NOT cute, NOT pastel, NOT watercolor` clavó el estilo de los Pips
   de Daniel. Esa fórmula es ahora `plantilla_sprite` en encargo.json.
2. **Fondo oscuro pintado + `remove_background` de Recraft SIEMPRE.** Pedimos
   fondo "very dark muted violet" (el estilo gana dramatismo) y el recorte lo
   hace la IA de Recraft (1 crédito): los umbrales locales del troceador se
   comían los mantos oscuros. El troceador local queda para dameros de ChatGPT
   y transparencias reales.
3. **El endpoint de estilos personalizados (`create_style`) devolvía 500** el
   día de la prueba (probado 6 veces, 3 fuentes de URL). REINTENTAR: es la
   mayor palanca de consistencia. Las referencias ya están públicas en
   `assets/estilo_refs/` (URLs raw de GitHub, que es lo que acepta su API).
4. Las imágenes llegan como **WebP aunque se llamen .png** — irrelevante:
   Chromium las decodifica igual en el troceador.
5. **n=2 por generación** basta para elegir; regenerar sale más barato que
   pedir n grandes.

## El flujo por asset (≈3-4 créditos cada uno)
```
1. generate_image  n=2, image_size 1:1, plantilla + sujeto de encargo.json
                   (con input_style_id cuando el estilo personalizado exista)
2. elegir la candidata (criterio: silueta legible + material correcto + paleta)
3. remove_background sobre la elegida            [1 crédito]
4. curl la image_url resultante → assets/src/<id>.png
5. node tools/slice_assets.mjs                   (lee config del catálogo)
6. integrar (drawPlayer/drawEnemy ya tienen rama de sprite; nuevos tipos la
   ganan al llegar su primer asset) + captura in-game
```

## Protocolo de lotes (aprobación de Daniel entre lote y lote)
| Lote | Contenido | Créditos aprox. |
|---|---|---|
| A (validación, en curso) | 3 enemigos piso 1 + velón | ~14 |
| B | resto de enemigos (5) + pip_dash + Tuerca | ~25 |
| C | 3 jefes | ~12 |
| D | pueblo: 8 NPCs + puerta | ~32 |
| E | retratos (8) | ~28 |
| F | props (12) | ~42 |
| G | texturas de suelo/muro (6) — integración aparte (patrón en room.canvas) | ~21 |
| H | hojas de iconos (5) — el troceador ganará modo multi-recorte por celdas | ~18 |
| I | portada 16:9 | ~4 |

Total estimado ≤ 250 créditos de los 1.000/mes del plan Basic.

## Reglas operativas
- **Una tanda por sesión de trabajo**, capturas comparativas SIEMPRE antes de
  dar un lote por bueno; Daniel veta/bendice (dirección de arte suya).
- Cada asset aprobado: commit de `assets/src` NO (gitignorado), commit de
  `assets/sprites/` troceado SÍ + bundle + artifact.
- Si `create_style` vuelve a funcionar: crear el estilo desde
  `assets/estilo_refs/`, regenerar 1 asset ya aprobado como control A/B y, si
  mejora, usar `style_id` en todo lo siguiente (y acortar la plantilla).
- Presupuesto: consultar `get_user` al abrir y cerrar tanda; anotar el gasto en
  ESTADO.md.
- El conector MCP de Recraft se desconecta entre sesiones: reactivarlo en
  claude.ai → Ajustes → Conectores antes de producir.
