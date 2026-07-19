// Intérprete de EVENTOS de altar (data/eventos.json). Espejo de items.js: lee el def y
// aplica sus efectos a través de `api` (inyectada por main, que es quien tiene el mundo).
// Aquí NO hay lógica de mundo — solo las reglas del evento. `pickAzar` es PURO y testeable.

// Elige una entrada de la lista por peso. r en [0,1). Devuelve la entrada elegida.
export function pickAzar(lista, r) {
  if (!lista || !lista.length) return null;
  const total = lista.reduce((s, o) => s + (o.peso ?? 1), 0);
  let x = r * total;
  for (const o of lista) { x -= (o.peso ?? 1); if (x < 0) return o; }
  return lista[lista.length - 1];
}

// Aplica un evento. `api` provee lecturas (oro/sp/corazones/comunes) y acciones del mundo
// (addOro/addSp/quitarCorazon/efecto) + rnd(). Devuelve {ok, titulo, sub} para el flash.
// Si no puede pagar el coste, ok=false y NO aplica nada (el altar no se consume).
export function aplicarEvento(def, api) {
  const c = def.coste ?? {};
  if (c.oro && api.oro() < c.oro) return { ok: false, titulo: 'El Reloj no fía', sub: 'hacen falta ' + c.oro + ' de oro' };
  if (c.sp && api.sp() < c.sp) return { ok: false, titulo: 'Espíritu insuficiente', sub: 'hacen falta ' + c.sp + ' de SP' };
  if (c.corazon && api.corazones() <= c.corazon) return { ok: false, titulo: 'Te costaría la vida', sub: 'no arriesgas tanto corazón' };
  // Cobra el coste
  if (c.oro) api.addOro(-c.oro);
  if (c.sp) api.addSp(-c.sp);
  if (c.corazon) api.quitarCorazon(c.corazon);
  // Efectos fijos, en orden
  for (const ef of (def.efectos ?? [])) api.efecto(ef);
  // Azar: una salida ponderada
  let extra = '';
  if (def.azar && def.azar.length) {
    const o = pickAzar(def.azar, api.rnd());
    if (o) { api.efecto(o); extra = o.txt ?? ''; }
  }
  return { ok: true, titulo: def.nombre ?? 'Evento', sub: extra || def.desc || '' };
}
