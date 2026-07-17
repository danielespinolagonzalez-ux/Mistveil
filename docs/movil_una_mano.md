# Modo Una Mano (móvil) — IMPLEMENTADO

Activar/desactivar: pausa (II) → botón "✋ MODO UNA MANO". Persiste en opciones.

## Concepto
Jugar Mistveil con UN pulgar. El juego apunta y dispara solo; el jugador se concentra
en moverse y en el RITMO — que es donde vive la diversión del juego.

## Reglas de diseño
1. **Un solo stick** (mitad inferior de pantalla completa, flotante donde poses el pulgar).
2. **Auto-disparo**: siempre al enemigo fijado (el aim assist actual, `game_feel.aim_assist_*`,
   pasa de cono 13° a 360° con prioridad = último dañado > más cercano).
3. **Cadencia por tap**: con enemigo a rango de melé (`cadencia.acquire_range_px`), un TAP
   (soltar el stick y tocar) inicia/continúa el combo. El anillo de sincronía ya es el QTE.
4. **Dash = flick** (ya implementado en `input.js`, gesto >34px a >0.28px/ms).
5. **Parada = tap durante anillo rojo** (contextual: si hay counter activo, el tap es parry,
   no golpe — resuelve la ambigüedad por contexto, nunca por posición del dedo).
6. **Arte de Tinta = mantener pulsado 250ms** (long-press) — sin botón.
7. **Ignición = agitar** (ya implementado) o doble-tap con SP lleno.

## Cambios técnicos previstos
- `input.js`: nuevo esquema `'una_mano'` en `Input.setScheme()`; mapear TouchTap
  contextual (golpe/parry/confirmar) en un resolvedor central `tapIntent()`.
- `entities.js` (Player.update): si esquema una_mano → `shooting()` devuelve true
  con enemigos vivos en sala; aim = resolvedor de fijado.
- `balance.json`: bloque `una_mano: { autofire: true, lock_priority: [...], longpress_ms: 250 }`.
- HUD: indicador de fijado (rombo sobre el enemigo objetivo), y el botón ≡ se conserva.
- Menús/batalla por turnos ya son 100% tap — no requieren cambios.

## Estado de implementación (v1)
- input.js: esquema 'una_mano' — stick flotante en TODA la pantalla, tap seco = TouchA,
  long-press 250ms = TouchHold (Arte), doble-tap <300ms = TouchDouble (Ignición),
  flick = dash (compartido). aimVector inerte; Player escribe el aim vía Input.setAim.
- entities.js: fijado pegajoso (lock_range_px 260, histéresis ×1.3, el más cercano) +
  auto-disparo con enemigo fijado (balance.una_mano.autofire).
- cadencia.js: cad.tapEsParry — durante anillo ROJO el tap cuenta como parada (contextual).
- main.js: toggle en PAUSA (táctil), TOUCH_BTNS_1MANO (solo ≡ + pausa), rombo dorado
  pulsante sobre el enemigo fijado.

## Ampliaciones futuras
- Prioridad de fijado "último dañado" (ahora: más cercano con histéresis).
- Cambio manual de objetivo (tap sobre otro enemigo lejano).
- lock_memoria_s: recordar el fijado unos segundos al salir de rango (campo ya en balance).
- Tutorial de gestos la primera vez que se activa.

## Métricas de éxito
- Cero botones en pantalla durante el juego normal (solo ≡ y pausa).
- Un combo completo de Cadencia + parry + Arte ejecutable sin recolocar la mano.
