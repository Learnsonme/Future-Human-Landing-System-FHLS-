import * as T from './vendor/three.module.js';
import { decodePNG16 } from './png16.js';
import { locationToPolar, polarToLocation, locationToRender, locationToUV, sampleGrid } from './coordinates.js';

export async function fetchOK(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url.pathname || url}: HTTP ${response.status}`);
  return response;
}

export class Terrain {
  constructor(base, signal) {
    this.base = base; this.signal = signal; this.cache = new Map(); this.records = [];
    this.detail = []; this.generation = 0; this.exaggeration = 1;
  }
  async initialize() {
    this.manifest = await (await fetchOK(new URL('terrain/index.json', this.base), this.signal)).json();
    if (this.manifest.R_km !== 1737.4 || !Array.isArray(this.manifest.tiles)) throw new Error('Unsupported terrain datum/manifest.');
    if (this.manifest.synthetic !== false) throw new Error('Expected the real LOLA terrain manifest.');
    this.overview = await this.load(this.manifest.tiles.find(t => t.lod === 0));
    return this;
  }
  async load(meta) {
    if (!meta || meta.projection !== 'polar_stereographic_south' || meta.px < 2
        || !Number.isFinite(meta.min_m) || !(meta.max_m > meta.min_m)
        || Math.abs(meta.size_km - (meta.px - 1) * meta.spacing_km) > 1e-6) throw new Error('Unsupported terrain tile metadata.');
    if (!this.cache.has(meta.id)) {
      const promise = (async () => {
        const png = await decodePNG16(await (await fetchOK(new URL(`terrain/${meta.file}`, this.base), this.signal)).arrayBuffer());
        if (png.width !== meta.px || png.height !== meta.px) throw new Error('Terrain dimensions disagree with manifest.');
        const heights = Float32Array.from(png.values, v => meta.min_m + v / 65535 * (meta.max_m - meta.min_m));
        return { meta, heights };
      })();
      this.cache.set(meta.id, promise);
      promise.catch(() => this.cache.delete(meta.id));
    }
    return this.cache.get(meta.id);
  }
  contains(meta, x, y) {
    return x >= meta.x0_km && x <= meta.x0_km + meta.size_km && y >= meta.y0_km && y <= meta.y0_km + meta.size_km;
  }
  heightAt(lat, lon) {
    if (!this.overview || lat > -84) return null;
    const { x, y } = locationToPolar(lat, lon);
    const tile = this.records.find(t => this.contains(t.meta, x, y)) || this.overview;
    if (!this.contains(tile.meta, x, y)) return null;
    const m = tile.meta;
    return sampleGrid(tile.heights, m.px, m.px, (x - m.x0_km) / m.spacing_km,
      (m.y0_km + m.size_km - y) / m.spacing_km);
  }
  async select(lat, lon) {
    const generation = ++this.generation;
    if (lat > -84 || !this.overview) { this.records = []; return false; }
    const { x, y } = locationToPolar(lat, lon);
    // A 90 km neighbourhood supplies nearby ridges and shadow casters; at most four tiles.
    const metas = this.manifest.tiles.filter(t => t.lod === 1).map(meta => ({ meta,
      d: Math.hypot(meta.x0_km + meta.size_km / 2 - x, meta.y0_km + meta.size_km / 2 - y) }))
      .sort((a, b) => a.d - b.d).slice(0, 4).map(t => t.meta);
    const tiles = await Promise.all(metas.map(meta => this.load(meta)));
    if (generation !== this.generation) return false;
    this.records = tiles;
    const keep = new Set([this.overview.meta.id, ...metas.map(t => t.id)]);
    for (const key of this.cache.keys()) if (!keep.has(key)) this.cache.delete(key);
    return true;
  }
  mesh(tile, material, stride, omit = []) {
    const { meta: m, heights } = tile;
    const n = Math.ceil((m.px - 1) / stride) + 1, positions = [], uv = [], polar = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const col = Math.min(m.px - 1, i * stride), row = Math.min(m.px - 1, j * stride);
      const x = m.x0_km + col * m.spacing_km, y = m.y0_km + m.size_km - row * m.spacing_km;
      const { lat, lon } = polarToLocation(x, y), tex = locationToUV(lat, lon);
      let h = heights[row * m.px + col];
      // Canonical border height avoids independent per-tile quantization cracks.
      if (m.lod === 1 && (col === 0 || row === 0 || col === m.px - 1 || row === m.px - 1)) {
        const owner = [...this.records].sort((a, b) => a.meta.id.localeCompare(b.meta.id)).find(t => this.contains(t.meta, x, y));
        if (owner) h = sampleGrid(owner.heights, owner.meta.px, owner.meta.px,
          (x - owner.meta.x0_km) / owner.meta.spacing_km, (owner.meta.y0_km + owner.meta.size_km - y) / owner.meta.spacing_km);
      }
      positions.push(...locationToRender(lat, lon, h * this.exaggeration)); uv.push(tex.u, tex.v); polar.push({ x, y, lat });
    }
    const indices = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      const mid = { x: (polar[a].x + polar[d].x) / 2, y: (polar[a].y + polar[d].y) / 2 };
      if (polarToLocation(mid.x, mid.y).lat > -84) continue;
      if (omit.some(t => this.contains(t.meta, mid.x, mid.y))) continue;
      indices.push(a, c, b, b, c, d);
    }
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    // Polar UVs cross the longitude seam; terrain uses a procedural lunar grey material.
    const mesh = new T.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  rebuild(group, material) {
    for (const child of [...group.children]) { group.remove(child); child.geometry.dispose(); }
    if (this.overview) group.add(this.mesh(this.overview, material, 4, this.records));
    for (const tile of this.records) group.add(this.mesh(tile, material, 2));
  }
  dispose() { this.generation++; this.records = []; this.cache.clear(); }
}
