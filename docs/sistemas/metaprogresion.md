# Spec — Meta-progresión, pueblo y guardado

## Filosofía
Modelo híbrido Hades/Isaac: la meta-progresión hace al jugador **algo** más fuerte pero sobre todo añade **variedad** (nuevos items al pool, nuevas salas, nuevos Sellos). La habilidad de cada run debe seguir importando siempre.

## Moneda: MEMORIA
- Fragmentos de Memoria caen de: jefes (`memoria_por_jefe`), retos de sala opcionales (`memoria_por_reto`), primera vez que se descubre algo (bestiario).
- Se CONSERVA al morir (diegético: los Encendidos recuerdan entre amaneceres).
- El oro y los items de la run se PIERDEN al morir.

## Árbol de Recuerdos (en el pueblo)
8 nodos iniciales (coste en Memoria; datos finales en balance.json → `arbol`):
| Nodo | Efecto | Tipo |
|---|---|---|
| Recuerdo de cuerda | +1 corazón base permanente | poder (suave) |
| Pulso constante | Ventanas de Cadencia +10% | poder (suave) |
| Sello de Marea | Desbloquea el Sello de agua (elegible) | variedad |
| Estantería de Margo | +5 items al pool general | variedad |
| Llave del sótano | Añade salas de reto al generador | variedad |
| Bolsillo cosido | Empiezas cada run con 5 de oro | comodidad |
| Diario de Vesper | Desbloquea consejos de combate (tutorial ampliado) | comodidad |
| Cuarto de la penumbra | Modo "Cuerda Tensa" (dificultad ascendente tras 1.ª victoria) | reto |
Regla: máx. 2 nodos de "poder" al inicio; el resto variedad/comodidad/reto. NO trivializar el juego.

## Pueblo (hub)
- Escena propia con Pip caminando. Interactuables mínimos: **Vesper** (equipar Sello, consejos), **Margo** (tienda meta: nodos de árbol/cosméticos futuros), **Puerta del Reloj** (iniciar run), **Tablón** (ATE disponibles).
- Los diálogos avanzan según contadores de progreso (`GameState.deaths`, `bosses_beaten`, flags de ATE), estilo Hades: morir alimenta la historia.

## Guardado (SaveManager)
- Archivo: `user://save.json`, con `schema_version` (empezar en 1) para migraciones futuras.
- Guardar: al salir del pueblo, al recoger Memoria, al comprar nodo, al cerrar. Carga al arrancar; si falta o está corrupto → save nuevo + backup del corrupto.
- Contenido: memoria, nodos_comprados[], sellos_desbloqueados[], flags_narrativa{}, estadísticas{runs, muertes, victorias, mejor_tiempo}, opciones{volúmenes, escala_ventanas, remapeos}.
- NUNCA guardar estado de run a mitad (v1: las runs no se reanudan; anotar como mejora futura).
