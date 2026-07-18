// Sprites pintados (fase R-Assets) — carga assets/sprites/manifest.json y sus
// PNG. SIEMPRE con fallback: si un sprite no existe o aún no ha cargado,
// quien dibuja debe seguir pintando la forma por código de siempre.
// Así el juego funciona idéntico con la carpeta assets/ vacía.

export const Sprites = {
  _imgs: new Map(),
  meta: {},

  async load(base = 'assets/sprites/') {
    // Build de un solo archivo: los sprites vienen incrustados en base64
    // Se espera a que TODAS decodifiquen (o fallen): el horneado de salas usa
    // las texturas en cuanto arranca la primera run. Un png roto → get() null.
    const waits = [];
    const emb = typeof window !== 'undefined' ? window.__MISTVEIL_SPRITES__ : null;
    if (emb) {
      this.meta = emb.manifest;
      for (const [id, dataUrl] of Object.entries(emb.png)) {
        const img = new Image();
        img.src = dataUrl;
        waits.push(img.decode?.().catch(() => {}));
        this._imgs.set(id, img);
      }
      await Promise.allSettled(waits);
      return;
    }
    try {
      const res = await fetch(base + 'manifest.json', { cache: 'no-store' });
      if (!res.ok) return; // sin assets: todo por código, como siempre
      this.meta = await res.json();
      for (const id of Object.keys(this.meta)) {
        const img = new Image();
        img.src = base + id + '.png';
        waits.push(img.decode?.().catch(() => {}));
        this._imgs.set(id, img);
      }
      await Promise.allSettled(waits);
    } catch { /* offline o sin carpeta: fallback silencioso */ }
  },

  // Imagen lista para dibujar, o null (→ el llamador usa su dibujo por código)
  get(id) {
    const img = this._imgs.get(id);
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  },
  info(id) { return this.meta[id] ?? null; },
};
