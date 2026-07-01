# Spec — Generación procedural del Reloj
Modelo Isaac: layout de piso en rejilla + salas de plantillas prediseñadas.

## 1. Layout del piso
Rejilla lógica de 9×8 celdas. Algoritmo (por semilla, guardada en `RunState.seed`):
1. `n_salas = run.rooms_min + piso*2 + rand(0..2)` (valores en balance.json).
2. Colocar sala inicial en el centro. Cola de expansión: tomar una sala existente al azar, intentar añadir vecina en dirección aleatoria si la celda está libre y la vecina resultante no tocaría >2 salas ya colocadas (evita bloques macizos). Repetir hasta `n_salas`.
3. Identificar **callejones sin salida** (salas con 1 vecina). Asignar especiales:
   - **Jefe**: el callejón MÁS LEJANO (distancia BFS) de la inicial.
   - **Tesoro**: otro callejón (garantizado; si no hay, crear uno).
   - **Tienda**: otro callejón (pisos 1–3 garantizada).
   - **Secreta**: celda vacía adyacente a ≥2 salas normales (entrada por pared bombeable/rompible; fase futura si no hay bombas aún: pared agrietada visible).
4. Validar con BFS que TODAS las salas son alcanzables; si no, regenerar (máx. 20 intentos, luego fallback a layout lineal).
5. Debug: `--seed=1234` por línea de comandos y semilla visible en pantalla de pausa.

## 2. Salas (plantillas)
- Interior jugable de **13×7 tiles** (32 px). Puertas en el punto medio de cada borde según conexiones del layout.
- Plantillas en `data/salas/*.json`. Formato:
```json
{
  "id": "p1_cruce_01",
  "pisos": ["piso1"],
  "peso": 10,
  "puertas_requeridas": [],
  "layout": [
    "PPP.......PPP",
    "P...........P",
    "..#..E.E..#..",
    ".....O.O.....",
    "..#..E.E..#..",
    "P...........P",
    "PPP.......PPP"
  ]
}
```
- **Leyenda de símbolos**: `.` suelo · `#` roca (bloquea todo) · `P` pozo (bloquea terrestres, no vuelo/proyectiles) · `O` bloque de cera destructible · `E` punto de spawn de enemigo · `e` spawn opcional (50%) · `$` posible pickup.
- Selección: filtrar plantillas por piso y compatibilidad de puertas → elegir por `peso` → 50% de espejar horizontalmente.
- Los `E` se rellenan desde el pool de enemigos del piso (tabla `spawns` en enemigos.json) respetando un **presupuesto de dificultad** por sala (`dificultad_sala` en balance × nº de piso).

## 3. Tipos de sala
| Tipo | Contenido |
|---|---|
| Normal | Plantilla + enemigos; drop aleatorio al limpiar (tabla en balance). |
| Tesoro | Sin enemigos; 1 pedestal de item (pool tesoro). |
| Tienda | 3 productos con precio; tendero placeholder. |
| Jefe | Arena limpia 13×7; jefe del piso; al morir: item de pool jefe + trampilla. |
| Secreta | 1–2 recompensas; entrada oculta. |
| Inicial | Vacía y segura. |

## 4. Escalado por piso
`hp_enemigo = base × (1 + piso × escalado_hp)`; ídem daño. Nuevos enemigos entran al pool por piso (campo `pisos` en enemigos.json). El Acto/bioma cambia paleta y pool cada 2 pisos (fase de contenido futura).

## 5. Tests obligatorios
- Generar 500 pisos: 0 errores, jefe siempre alcanzable, nº de salas dentro de rango.
- Ninguna plantilla puede bloquear una puerta requerida (validador de plantillas en DataDB al cargar: casillas frente a puertas deben ser `.`).
