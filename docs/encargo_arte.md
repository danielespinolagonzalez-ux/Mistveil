# Encargo de arte — MISTVEIL (pipeline Daniel → ChatGPT → troceado automático)

> Decisión 2026-07-18: se abre la capa de assets pintados (antes "todo por código").
> Daniel genera las imágenes con ChatGPT; Claude las trocea (`tools/slice_assets.mjs`,
> pendiente) e integra con **fallback al dibujo por código** (si falta una imagen,
> el juego dibuja lo de siempre: nada se rompe).

## Estilo elegido
**Romanticismo pictórico** (Caspar David Friedrich, Turner: luz dorada, melancolía,
atmósfera) **+ fantasía encantadora de Final Fantasy IX/XIV**: proporciones
chibi-medievales, materiales creíbles pintados a mano, siluetas claras.

---

## CÓMO USARLO (leer antes de generar nada)

1. **Genera primero la LLAVE DE ESTILO (PROMPT 0)**. Guárdala.
2. **En cada petición posterior, ADJUNTA la llave de estilo** y empieza el mensaje
   con: *"Usa EXACTAMENTE el estilo, paleta y acabado de la imagen adjunta."*
3. **Una imagen por mensaje** (salvo las hojas de iconos, que van en rejilla).
4. Pide siempre **PNG con fondo 100% transparente**. Si ChatGPT no lo respeta,
   pide *"fondo liso magenta puro (#FF00FF), sin degradados"* — yo lo recorto.
5. **Guarda cada PNG con el nombre de archivo indicado** (columna `archivo`).
6. Si un resultado se sale del estilo: *"Más fiel a la referencia adjunta: misma
   paleta, mismo acabado de óleo, misma luz dorada."*
7. Tamaño: el que dé ChatGPT (1024×1024 o 1536×1024 apaisado). Yo reduzco.

### BLOQUE TÉCNICO (pégalo AL FINAL de todos los prompts de sprites)
```
Requisitos técnicos:
— Vista de tres cuartos cenital (top-down ~30–35°), como un JRPG clásico de 16/32 bits en HD.
— Fondo 100% TRANSPARENTE (PNG). Sin suelo, sin sombra proyectada, sin peana, sin viñeta.
— Un solo sujeto, centrado, ocupando ~80% del lienzo, con márgenes limpios.
— Sin texto, sin firma, sin marca de agua, sin marco.
— Silueta clara y legible aunque se reduzca a tamaño muy pequeño.
— Luz cálida dorada de "hora dorada" desde arriba a la izquierda.
— Paleta: ámbar, miel y latón envejecido; sombras violeta-índigo; acentos turquesa apagado y púrpura crepuscular.
— Estilo: óleo romanticista (Friedrich, Turner) con fantasía de Final Fantasy IX: encantador, melancólico, artesanal.
```

---

## PROMPT 0 — LLAVE DE ESTILO (generar UNA vez, adjuntar SIEMPRE)
> archivo: `llave_estilo.png`
```
Ilustración de referencia de estilo para un videojuego: "MISTVEIL, el Reloj de las Almas".
Un pequeño autómata relojero llamado Pip —cuerpo de latón y porcelana, capa índigo con
capucha, una llave de cuerda dorada girando lentamente en su espalda, ojos como dos
lucecitas cálidas— de pie en una gran sala de relojería gótica en penumbra, iluminada
por candelabros: péndulos de bronce colgando, engranajes enormes, estandartes púrpura,
bruma dorada. Ambiente de óleo romanticista (Caspar David Friedrich, Turner): luz de
hora dorada, melancolía luminosa, pinceladas visibles; con el encanto de fantasía de
Final Fantasy IX. Paleta: ámbar, miel, latón envejecido, sombras violeta-índigo,
acentos turquesa apagado. Sin texto, sin marca de agua.
```

## PLANTILLA para todos los sprites (sustituir la línea SUJETO)
```
Usa EXACTAMENTE el estilo, paleta y acabado de la imagen adjunta.
Sprite para videojuego: [SUJETO].
+ BLOQUE TÉCNICO
```

---

## LOTE 1 — Pip y compañía (5 imágenes) · PRIORIDAD MÁXIMA
| archivo | SUJETO (línea a sustituir en la plantilla) |
|---|---|
| `pip_idle.png` | Pip, pequeño autómata relojero de latón y porcelana con capa índigo con capucha, llave de cuerda dorada en la espalda, ojos de lucecita cálida; de pie, relajado, visto de tres cuartos mirando hacia abajo-derecha |
| `pip_paso.png` | El MISMO Pip de la imagen adjunta, a mitad de un paso de caminar, pierna derecha adelantada, capa con leve vuelo |
| `pip_ataque.png` | El MISMO Pip, golpeando con una pequeña llave inglesa-martillo dorada, en plena embestida hacia la derecha, capa ondeando |
| `pip_dash.png` | El MISMO Pip, en carrera explosiva inclinado hacia delante, capa horizontal al viento, estela sutil de engranajes espectrales |
| `tuerca_mascota.png` | Tuerca, mascota diminuta: un engranaje de latón con dos ojazos cálidos y patitas cortas, expresión curiosa y adorable |

*(Con `pip_idle` + `pip_paso` alternándose y las inclinaciones que ya hace el motor
basta para caminar; NO pedimos hojas de animación: ChatGPT no mantiene la
consistencia entre fotogramas y el motor ya anima por código.)*

## LOTE 2 — Enemigos (10 imágenes)
Familias: **cera** (cálida, goteante) · **latón** (bruñido, mecánico) · **polvo** (frío, etéreo).
| archivo | SUJETO |
|---|---|
| `enemigo_cera_andante.png` | Montoncito de cera ámbar fundida que camina, con una llama tenue por cabeza, gotas resbalando, expresión ausente |
| `enemigo_velon_inestable.png` | Velón grueso y abombado de cera, llama nerviosa y chisporroteante, grietas incandescentes: a punto de estallar |
| `enemigo_cerero_errante.png` | Figura encorvada encapuchada hecha de cera, vertiendo cera ardiente de un farol-cazo, huellas derretidas |
| `enemigo_tejedor_horas.png` | Araña mecánica de latón con patas hechas de manecillas de reloj, abdomen de esfera de reloj, hilo de bronce |
| `enemigo_engranaje_errante.png` | Engranaje de latón grande que rueda, con un único ojo mecánico en el eje, dientes desgastados |
| `enemigo_campanero.png` | Campana de bronce robusta con brazos, el badajo asoma como puño, yugo de madera como hombreras |
| `enemigo_cuco_de_cuerda.png` | Pájaro cuco mecánico de madera pintada y latón, saltando de un resorte, ojos desorbitados |
| `enemigo_minutero_gemelo.png` | Esgrimista esbelto hecho de dos manecillas de minutero gemelas, en guardia, elegante y afilado |
| `enemigo_polilla_del_polvo.png` | Polilla gris-lavanda de polvo lunar, alas con dibujos de esferas de reloj, antenas de resorte, halo de motas |
| `enemigo_afinador.png` | Figura etérea de polvo compactado que sostiene un gran diapasón vibrando, rostro sereno e inquietante |

## LOTE 3 — Jefes (3 imágenes, más grandes y dramáticos)
| archivo | SUJETO |
|---|---|
| `jefe_campanero_mayor.png` | El Campanero Mayor: campana ceremonial enorme de bronce grabado con brazos poderosos, corona de velas encendidas, cadenas rotas colgando, presencia imponente |
| `jefe_archivera_anegada.png` | La Archivera Anegada: gran polilla-bibliotecaria empapada de tinta índigo, alas como páginas mojadas a medio deshacer, gafas diminutas, páginas y gotas de tinta flotando a su alrededor |
| `jefe_primer_relojero.png` | El Primer Relojero: autómata venerable y roto, majestuoso y triste, pecho abierto mostrando engranajes dorados aún girando, barba de virutas de cobre, bastón-manecilla; aura de tragedia romanticista |

## LOTE 4 — Pueblo (8 sprites + 8 retratos)
Sprites (misma plantilla):
| archivo | SUJETO |
|---|---|
| `npc_ferran.png` | Ferrán, maestro relojero anciano y afable: delantal de cuero, lupa de joyero en la frente, manos de latón remendadas |
| `npc_margo.png` | Margo, tendera robusta y risueña con cofia, delantal lleno de engranajes y frascos, balanza pequeña |
| `npc_vesper.png` | Lady Vesper, dama aristocrática y enigmática de vestido crepuscular con velo, abanico de manecillas |
| `npc_hermanos.png` | Los Hermanos Nº7 y Nº12: dos autómatas gemelos pequeños, uno pulcro y otro desastrado, hombro con hombro |
| `npc_templanza.png` | Estatua-santuario de la Templanza: figura orante de mármol y latón con un péndulo quieto en las manos |
| `npc_virtuoso.png` | Estatua-santuario del Virtuosismo: figura danzante de mármol y latón con campanillas |
| `npc_eco_bronce.png` | El Eco de Bronce: busto antiguo de bronce que canta, boca abierta, ondas sonoras sutiles talladas |
| `prop_puerta_reloj.png` | La Puerta del Reloj: portón monumental con esfera de reloj incrustada, números romanos, oro y roble oscuro |

Retratos (para los diálogos — aquí SÍ brilla el estilo FFIX; formato distinto):
```
Usa EXACTAMENTE el estilo de la imagen adjunta. Retrato de busto para cuadro de
diálogo de videojuego: [PERSONAJE, misma descripción que su sprite], tres cuartos,
mirando levemente a la izquierda, fondo transparente, encuadre de hombros hacia
arriba, expresivo y con carácter. Sin texto.
```
| archivo | personaje |
|---|---|
| `retrato_pip.png` · `retrato_ferran.png` · `retrato_margo.png` · `retrato_vesper.png` · `retrato_hermanos.png` · `retrato_templanza.png` · `retrato_virtuoso.png` · `retrato_eco.png` | (descripciones de arriba) |

## LOTE 5 — Entorno por bioma (3×~7 + comunes)
**Texturas repetibles** (prompt distinto — SIN fondo transparente):
```
Usa EXACTAMENTE el estilo de la imagen adjunta. Textura REPETIBLE SIN COSTURAS
(tileable) para suelo de videojuego, vista cenital: [DESCRIPCIÓN]. La imagen debe
poder repetirse en mosaico sin que se note el borde. Sin texto, sin viñeta, luz
uniforme.
```
| archivo | DESCRIPCIÓN |
|---|---|
| `suelo_pendulos.png` | grandes losas de piedra ámbar con vetas de miel, juntas oscuras, desgaste de siglos, algún engranaje diminuto incrustado |
| `muro_pendulos.png` | sillería de piedra cálida con molduras de latón, franja horizontal (para muro visto de frente) |
| `suelo_archivo.png` | tarima de madera noble entintada, charcos finos de tinta índigo, páginas sueltas pegadas |
| `muro_archivo.png` | estanterías empotradas de roble con libros goteando tinta, franja horizontal |
| `suelo_invertida.png` | baldosas de cobre y esmalte crepuscular con relieves de esferas de reloj derretidas |
| `muro_invertida.png` | pared de mecanismo expuesto: engranajes de cobre y lavanda entre piedra, franja horizontal |

**Props** (plantilla de sprite normal):
| archivo | SUJETO |
|---|---|
| `prop_pendulo_colgante.png` | gran péndulo de bronce con cadena, visto colgando |
| `prop_candelabro.png` | candelabro de pie de tres brazos, velas encendidas goteando |
| `prop_estandarte.png` | estandarte púrpura colgante con emblema de reloj bordado en oro, borde inferior raído |
| `prop_estanteria_tinta.png` | estantería alta rebosante de libros que gotean tinta índigo |
| `prop_pila_libros.png` | pila inestable de libros antiguos con un tintero encima |
| `prop_engranaje_flotante.png` | engranaje de cobre grande, flotando, levemente fantasmal |
| `prop_reloj_derretido.png` | reloj de pared derritiéndose como cera (homenaje a Dalí), números escurriendo |
| `prop_trampilla.png` | trampilla circular de madera y latón con esfera de reloj grabada, entreabierta hacia la oscuridad |
| `prop_pedestal.png` | pedestal de piedra y latón con cojín de terciopelo, vacío |
| `prop_mostrador_tienda.png` | mostrador de tienda de madera con toldo pequeño a rayas púrpura y oro |
| `prop_roca.png` | roca de piedra ámbar musgosa, tamaño obstáculo |
| `prop_bloque_cera.png` | bloque cúbico de cera ámbar translúcida con una mecha apagada, rompible |
| `hoja_altares.png` | REJILLA 2×2, cuatro altares pequeños del mismo tamaño: (1) altar con corazón de cera, (2) altar con dos engranajes fundiéndose, (3) altar con metrónomo, (4) altar con dados y esfera de reloj. Separados, fondo transparente |

## LOTE 6 — Iconos (5 hojas en rejilla; los troceo yo por transparencia)
Plantilla iconos:
```
Usa EXACTAMENTE el estilo de la imagen adjunta. HOJA DE ICONOS para videojuego:
rejilla [N×M] de iconos del MISMO tamaño, bien separados entre sí, fondo 100%
transparente, cada icono centrado en su celda, sin texto. Estilo: miniaturas de
óleo romanticista con borde luminoso sutil. Iconos, en orden de lectura: [LISTA].
```
| archivo | rejilla | LISTA (en orden) |
|---|---|---|
| `hoja_iconos_reliquias.png` | 4×5 | tintero partido en dos · vela derretida abrazando un frasco · lágrima de cristal enorme · segundero suelto girando · cuerda de reloj enrollada · manecilla rota afilada · metrónomo de bolsillo · péndulo quieto en campana de cristal · campana rasgada · caracola con esfera de reloj · batería de frascos con almas · sello de lacre agrietado · ojo de vidrio · gota de aceite negro · dos lágrimas gemelas reflejadas · gota de tinta con ojos vivos · polilla plateada lunar · páginas sueltas atadas con cordel · corazón de hojalata con remaches · reloj de arena dorado |
| `hoja_iconos_artes.png` | 1×3 | corona de tinta índigo estallando · media luna de espuma turquesa · abanico de ascuas ardientes |
| `hoja_iconos_sellos.png` | 2×4 | sello de lacre con llama (ascuas) · con ola (marea) · con ráfaga de viento (vendaval) · con lágrima (pena) · con sol naciente (alba) · con sol poniente (ocaso) · con rayo (trueno) · sello de lacre incoloro translúcido |
| `hoja_iconos_ui.png` | 2×4 | corazón de cera lleno · corazón de cera a la mitad · corazón de cera vacío apagado · moneda-engranaje de oro · engranaje plateado · gota de espíritu azul-violeta luminosa · rombo-gema de racha púrpura · reloj de arena pequeño |
| `hoja_botones_tactiles.png` | 2×3 | seis BOTONES CIRCULARES de interfaz estilo medallón: marco de oro forjado con gema central, cada uno con un símbolo distinto: espada · nota musical · campana · pluma estilográfica · llama · mano abierta. Como medallones de bronce y oro de un JRPG |

## LOTE 7 — Pantallas y marcos (3)
| archivo | prompt propio |
|---|---|
| `portada_titulo.png` | Usa el estilo de la referencia. Ilustración APAISADA 16:9 de portada: la Torre-Reloj de Mistveil alzándose entre bruma dorada al atardecer, monumental y melancólica, con Pip diminuto de espaldas ante la puerta (composición romanticista de figura pequeña ante lo sublime, como Friedrich). Espacio despejado en el tercio superior para el título. Sin texto |
| `marco_dialogo.png` | Usa el estilo de la referencia. MARCO ornamental rectangular apaisado para cuadro de diálogo de videojuego: borde de oro forjado con filigrana de manecillas y engranajes, esquinas con gemas, CENTRO COMPLETAMENTE VACÍO Y TRANSPARENTE. Sin texto |
| `marco_panel.png` | Igual que el anterior pero cuadrado y más sobrio (para menús). Centro vacío y transparente. Sin texto |

---

## Qué NO hay que generar (lo sigue haciendo el motor)
- **Efectos de las Artes, parry, Ignición, estelas del dash**: son animaciones
  procedurales (partículas); una imagen estática los empeoraría.
- **Hojas de animación fotograma a fotograma**: ChatGPT no mantiene consistencia;
  el motor anima (balanceo, inclinación, squash) sobre el sprite estático.
- **Sombras bajo los personajes**: las pinta el motor (elipse), por eso los
  sprites van SIN sombra.

## Orden recomendado de producción (validar el pipeline pronto)
1. `llave_estilo` → 2. `pip_idle` + `pip_paso` → 3. `enemigo_cera_andante`,
   `enemigo_tejedor_horas`, `enemigo_campanero` → 4. `suelo_pendulos` +
   `muro_pendulos` → 5. `hoja_iconos_reliquias`.
   **Con esos 8 monto la integración de punta a punta** (troceado → carga →
   fallback) y vemos el juego "vestido" en el piso 1 antes de encargar el resto.

## Pipeline técnico (lado Claude, para referencia)
- `assets/src/` (lo que sube Daniel, tal cual) → `tools/slice_assets.mjs`
  (recorte por componentes de transparencia vía Chromium headless, sin
  dependencias nuevas) → `assets/sprites/*.png` + `assets/manifest.json`.
- Carga en runtime con **fallback**: si el sprite no existe, se dibuja la forma
  por código como hasta ahora. `data/*.json` gana el campo opcional `sprite`.
- El bundle (`build_artifact.mjs`) incrusta los PNG en base64 (subirá de peso:
  vigilar; objetivo < 8 MB).
- itch.io: marcar **divulgación de IA generativa** (ya está en R5.5).
