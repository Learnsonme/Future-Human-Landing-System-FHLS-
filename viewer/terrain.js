import * as T from './vendor/three.module.js';
import { decodePNG16 } from './png16.js';
import { locationToPolar, polarToLocation, locationToRender, locationToUV, sampleGrid, normalizeLongitude, poleOf } from './coordinates.js';

export async function fetchOK(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url.pathname || url}: HTTP ${response.status}`);
  return response;
}

const CAP_LAT = 84;              // polar tiles own |lat| ≥ 84°; the whole-Moon tiles own the rest
const GLOBAL_DEG = 8;            // data/terrain/index_global.json tile size

/**
 * LOLA terrain for the viewer (T3 · V8).
 *   South cap  data/terrain/index.json        480 m overview + 120 m tiles (lod 1)   [required]
 *   Artemis    data/terrain/index_detail.json 40 m tiles (lod 2) inside the south cap [optional]
 *   North cap  data/terrain/index_north.json  480 m overview + 120 m tiles            [optional]
 *   Whole Moon data/terrain/index_global.json 474 m equirectangular 8° tiles          [optional]
 * `manifest`/`overview` stay the south cap so existing callers and tests are unchanged.
 * `records` are the detail tiles loaded around the current selection.
 */
export class Terrain {
  constructor(base, signal) {
    this.base = base; this.signal = signal; this.cache = new Map(); this.records = [];
    this.detail = []; this.generation = 0; this.exaggeration = 1;
    this.north = null; this.globalIndex = null; this.detailIndex = null; this.kind = null;
  }
  async initialize() {
    this.manifest = await (await fetchOK(new URL('terrain/index.json', this.base), this.signal)).json();
    if (this.manifest.R_km !== 1737.4 || !Array.isArray(this.manifest.tiles)) throw new Error('Unsupported terrain datum/manifest.');
    if (this.manifest.synthetic !== false) throw new Error('Expected the real LOLA terrain manifest.');
    this.overview = await this.load(this.manifest.tiles.find(t => t.lod === 0));
    return this;
  }
  /** Optional layers; each one that fails is simply left out (south cap keeps working). */
  async initializeExtras() {
    const json = name => fetchOK(new URL(`terrain/${name}`, this.base), this.signal).then(r => r.json())
      .then(m => (m.R_km === 1737.4 && m.synthetic === false && Array.isArray(m.tiles) ? m : null)).catch(() => null);
    const [north, global, detail] = await Promise.all([json('index_north.json'), json('index_global.json'), json('index_detail.json')]);
    if (north) {
      try { this.north = { manifest: north, overview: await this.load(north.tiles.find(t => t.lod === 0)) }; }
      catch { this.north = null; }
    }
    if (global) {
      this.globalIndex = global;
      this.globalTiles = new Map(global.tiles.map(t => [`${t.lon0},${t.lat0}`, t]));
    }
    if (detail) this.detailIndex = detail;
    return { north: !!this.north, global: !!this.globalIndex, detail: !!this.detailIndex };
  }
  async load(meta) {
    const polar = meta && (meta.projection === 'polar_stereographic_south' || meta.projection === 'polar_stereographic_north');
    const equi = meta && meta.projection === 'equirectangular';
    if (!meta || !(polar || equi) || meta.px < 2 || !Number.isFinite(meta.min_m) || !(meta.max_m > meta.min_m)
        || (polar && Math.abs(meta.size_km - (meta.px - 1) * meta.spacing_km) > 1e-6)
        || (equi && Math.abs(meta.size_deg - (meta.px - 1) * meta.spacing_deg) > 1e-9)) throw new Error('Unsupported terrain tile metadata.');
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
  /** Equirectangular tile contains lat/lon (inclusive edges, longitude wraps). */
  containsLL(meta, lat, lon) {
    const dl = ((normalizeLongitude(lon) - meta.lon0) % 360 + 360) % 360;
    return lat >= meta.lat0 && lat <= meta.lat0 + meta.size_deg && (dl <= meta.size_deg || 360 - dl < 1e-9);
  }
  covers(tile, lat, lon) {
    const m = tile.meta;
    if (m.projection === 'equirectangular') return Math.abs(lat) < CAP_LAT + 1e-9 && this.containsLL(m, lat, lon);
    const pole = poleOf(m);
    if ((pole === 'south' && lat > -CAP_LAT) || (pole === 'north' && lat < CAP_LAT)) return false;
    const { x, y } = locationToPolar(lat, lon, pole);
    return this.contains(m, x, y);
  }
  sample(tile, lat, lon) {
    const m = tile.meta;
    if (m.projection === 'equirectangular') {
      const dl = ((normalizeLongitude(lon) - m.lon0) % 360 + 360) % 360;
      return sampleGrid(tile.heights, m.px, m.px, Math.min(dl, m.size_deg) / m.spacing_deg, (m.lat0 + m.size_deg - lat) / m.spacing_deg);
    }
    const { x, y } = locationToPolar(lat, lon, poleOf(m));
    return sampleGrid(tile.heights, m.px, m.px, (x - m.x0_km) / m.spacing_km, (m.y0_km + m.size_km - y) / m.spacing_km);
  }
  /** Finest loaded tile at lat/lon: Artemis 40 m → polar 120 m / global 474 m → cap overview. */
  tileAt(lat, lon) {
    const byLod = [...this.records].sort((a, b) => (b.meta.lod || 0) - (a.meta.lod || 0));
    const hit = byLod.find(t => this.covers(t, lat, lon));
    if (hit) return hit;
    if (lat <= -CAP_LAT && this.overview && this.covers(this.overview, lat, lon)) return this.overview;
    if (lat >= CAP_LAT && this.north?.overview && this.covers(this.north.overview, lat, lon)) return this.north.overview;
    return null;
  }
  heightAt(lat, lon) {
    const tile = this.tileAt(lat, lon);
    return tile ? this.sample(tile, lat, lon) : null;
  }
  /** Name of the finest terrain at lat/lon, for the viewer status. */
  describe(lat, lon) {
    const tile = this.tileAt(lat, lon);
    if (!tile) return 'global-lower-precision';
    if (tile.meta.lod === 2) return 'LOLA-40m';
    if (tile.meta.projection === 'equirectangular') return 'LOLA-474m';
    return tile.meta.lod === 0 ? 'LOLA-overview-480m' : 'LOLA-120m';
  }
  async select(lat, lon) {
    const generation = ++this.generation;
    let metas = [], kind = null;
    const nearest4 = (manifest, pole) => {
      const { x, y } = locationToPolar(lat, lon, pole);
      // A 90 km neighbourhood supplies nearby ridges and shadow casters; at most four tiles.
      return manifest.tiles.filter(t => t.lod === 1).map(meta => ({ meta,
        d: Math.hypot(meta.x0_km + meta.size_km / 2 - x, meta.y0_km + meta.size_km / 2 - y) }))
        .sort((a, b) => a.d - b.d).slice(0, 4).map(t => t.meta);
    };
    if (lat <= -CAP_LAT && this.overview) {
      kind = 'south'; metas = nearest4(this.manifest, 'south');
      const { x, y } = locationToPolar(lat, lon, 'south');
      for (const meta of this.detailIndex?.tiles || []) if (this.contains(meta, x, y)) metas.push(meta);
    } else if (lat >= CAP_LAT && this.north) {
      kind = 'north'; metas = nearest4(this.north.manifest, 'north');
    } else if (Math.abs(lat) < CAP_LAT && this.globalTiles) {
      // The tile under the point plus its neighbours toward the point: a 2 × 2 block (≈ 480 km).
      kind = 'global';
      const nx = 360 / GLOBAL_DEG, fx = (normalizeLongitude(lon) + 180) / GLOBAL_DEG, fy = (lat + 88) / GLOBAL_DEG;
      const tx = Math.floor(fx) % nx, ty = Math.max(0, Math.min(21, Math.floor(fy)));
      const dx = fx - Math.floor(fx) < 0.5 ? -1 : 1, dy = fy - Math.floor(fy) < 0.5 ? -1 : 1;
      for (const [ix, iy] of [[tx, ty], [tx + dx, ty], [tx, ty + dy], [tx + dx, ty + dy]]) {
        const meta = this.globalTiles.get(`${-180 + ((ix % nx + nx) % nx) * GLOBAL_DEG},${-88 + iy * GLOBAL_DEG}`);
        if (meta && !metas.includes(meta)) metas.push(meta);
      }
    }
    if (!kind) { this.records = []; this.kind = null; return false; }
    const tiles = await Promise.all(metas.map(meta => this.load(meta)));
    if (generation !== this.generation) return false;
    this.records = tiles; this.kind = kind;
    const keep = new Set([this.overview.meta.id, this.north?.overview.meta.id, ...metas.map(t => t.id)]);
    for (const key of this.cache.keys()) if (!keep.has(key)) this.cache.delete(key);
    return kind;
  }
  /** Polar (stereographic) tile mesh. Unchanged behaviour for the south cap; north uses its own projection. */
  mesh(tile, material, stride, omit = []) {
    const { meta: m, heights } = tile, pole = poleOf(m);
    const n = Math.ceil((m.px - 1) / stride) + 1, positions = [], uv = [], polar = [];
    const owners = [...this.records].filter(t => t.meta.projection === m.projection && t.meta.lod === 1)
      .sort((a,b) => a.meta.id.localeCompare(b.meta.id));
    const capRadius = locationToPolar(-CAP_LAT,0).y;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const col = Math.min(m.px - 1, i * stride), row = Math.min(m.px - 1, j * stride);
      const x = m.x0_km + col * m.spacing_km, y = m.y0_km + m.size_km - row * m.spacing_km;
      const { lat, lon } = polarToLocation(x, y, pole), tex = locationToUV(lat, lon);
      let h = heights[row * m.px + col];
      // Canonical border height avoids independent per-tile quantization cracks.
      if (m.lod === 1 && (col === 0 || row === 0 || col === m.px - 1 || row === m.px - 1)) {
        const owner = owners.find(t => this.contains(t.meta, x, y));
        if (owner) h = sampleGrid(owner.heights, owner.meta.px, owner.meta.px,
          (x - owner.meta.x0_km) / owner.meta.spacing_km, (owner.meta.y0_km + owner.meta.size_km - y) / owner.meta.spacing_km);
      }
      positions.push(...locationToRender(lat, lon, h * this.exaggeration)); uv.push(tex.u, tex.v); polar.push({ x, y, lat, h });
    }
    const indices = [];
    const intersections = new Map();
    const inside = i => Math.hypot(polar[i].x,polar[i].y) <= capRadius + 1e-8;
    function intersection(a,b) {
      const key = [a,b].sort((a,b)=>a-b).join(':');
      if (intersections.has(key)) return intersections.get(key);
      const p=polar[a],q=polar[b],dx=q.x-p.x,dy=q.y-p.y;
      const A=dx*dx+dy*dy,B=2*(p.x*dx+p.y*dy),C=p.x*p.x+p.y*p.y-capRadius*capRadius;
      const d=Math.sqrt(Math.max(0,B*B-4*A*C));
      const roots=[(-B-d)/(2*A),(-B+d)/(2*A)];
      const t=Math.max(0,Math.min(1,roots.find(t=>t>=-1e-8&&t<=1+1e-8)));
      const x=p.x+t*dx,y=p.y+t*dy,h=p.h+t*(q.h-p.h),loc=polarToLocation(x,y,pole),tex=locationToUV(loc.lat,loc.lon);
      const i=positions.length/3;
      positions.push(...locationToRender(loc.lat,loc.lon,h*this.exaggeration));uv.push(tex.u,tex.v);
      polar.push({x,y,h,lat:loc.lat});intersections.set(key,i);return i;
    }
    // Same winding on both caps: the north map's y = −ρ·cos(lon) mirror and viewing the sphere from
    // the opposite pole cancel out (checked by tests/terrain-v8.test.mjs, outward faces).
    const addTriangle = triangle => {
      const clipped=[];
      for(let j=0;j<3;j++){
        const a=triangle[j],b=triangle[(j+1)%3],ain=inside(a),bin=inside(b);
        if(ain) clipped.push(a);
        if(ain!==bin) clipped.push(intersection.call(this,a,b));
      }
      for(let j=1;j+1<clipped.length;j++)indices.push(clipped[0],clipped[j],clipped[j+1]);
    };
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      const mid = { x: (polar[a].x + polar[d].x) / 2, y: (polar[a].y + polar[d].y) / 2 };
      if (omit.some(t => t.meta.projection === m.projection && (t.meta.lod === 2
        ? [a, b, c, d].every(k => this.contains(t.meta, polar[k].x, polar[k].y))      // only cells wholly under 40 m
        : this.contains(t.meta, mid.x, mid.y)))) continue;
      addTriangle([a,c,b]);addTriangle([b,c,d]);
    }
    const surfaceIndexCount = indices.length;
    // 40 m tiles get no skirts: the 120 m surface continues under their edge, and a lit vertical
    // skirt would show as a bright line under the grazing polar Sun.
    if (m.lod !== 2) this.addSkirts(indices, positions, uv, (a, b) => {
      const mid={x:(polar[a].x+polar[b].x)/2,y:(polar[a].y+polar[b].y)/2};
      // Shared detail edges already agree exactly. An internal skirt would
      // introduce a vertical shadow caster underneath that continuous surface.
      return m.lod===1 && owners.some(t=>t!==tile && this.contains(t.meta,mid.x,mid.y));
    }, 1);
    return this.finish(positions, uv, indices, material, surfaceIndexCount);
  }
  /** Whole-Moon equirectangular tile mesh (474 m), clipped to |lat| < 84° where the polar caps take over. */
  meshGlobal(tile, material, stride = 1) {
    const { meta: m, heights } = tile;
    const n = Math.ceil((m.px - 1) / stride) + 1, positions = [], uv = [], ll = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const col = Math.min(m.px - 1, i * stride), row = Math.min(m.px - 1, j * stride);
      const lat = m.lat0 + m.size_deg - row * m.spacing_deg, lon = m.lon0 + col * m.spacing_deg;
      const tex = locationToUV(lat, lon);
      positions.push(...locationToRender(lat, lon, heights[row * m.px + col] * this.exaggeration));
      uv.push(tex.u, tex.v); ll.push({ lat, lon });
    }
    const indices = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      if (Math.abs((ll[a].lat + ll[d].lat) / 2) > CAP_LAT) continue;      // polar caps own this
      indices.push(a, c, b, b, c, d);
    }
    const surfaceIndexCount = indices.length;
    const others = this.records.filter(t => t !== tile && t.meta.projection === 'equirectangular');
    this.addSkirts(indices, positions, uv, (a, b) => {
      const lat = (ll[a].lat + ll[b].lat) / 2, lon = (ll[a].lon + ll[b].lon) / 2;
      // Between two loaded whole-Moon tiles the seam is exact (no skirt); at the edge of the patch
      // and at the ±84° cap boundary a skirt hides the step down to the coarser globe/overview.
      return Math.abs(lat) < CAP_LAT - 1e-9 && others.some(t => this.containsLL(t.meta, lat, lon));
    }, 4);
    return this.finish(positions, uv, indices, material, surfaceIndexCount);
  }
  addSkirts(indices, positions, uv, skip, depthKm) {
    // Hide small height differences at LOD joins with vertical skirts.
    // Surface vertices and scientific elevations remain unchanged.
    const edges = new Map();
    for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){
      const a=indices[i+j],b=indices[i+(j+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
      if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);
    }
    for(const [a,b] of edges.values()){
      if(skip(a,b))continue;
      const lower=[];
      for(const i of [a,b]){
        const v=new T.Vector3(...positions.slice(i*3,i*3+3));v.setLength(v.length()-depthKm);
        lower.push(positions.length/3);positions.push(...v.toArray());uv.push(uv[i*2],uv[i*2+1]);
      }
      indices.push(a,lower[0],b,b,lower[0],lower[1]);
    }
  }
  finish(positions, uv, indices, material, surfaceIndexCount) {
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    // Polar UVs cross the longitude seam; terrain uses a procedural lunar grey material.
    const mesh = new T.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.surfaceIndexCount = surfaceIndexCount;
    return mesh;
  }
  /** Is lat/lon under a loaded whole-Moon tile? (the globe hides its coarse surface there) */
  globalCovers(lat, lon) {
    return Math.abs(lat) < CAP_LAT && this.records.some(t => t.meta.projection === 'equirectangular' && this.containsLL(t.meta, lat, lon));
  }
  /**
   * Rebuild meshes. `detailMaterial` is used for the selection's detail tiles (it fades in, M1).
   * With omit:false the cap overviews are built whole underneath the detail (used while fading).
   */
  rebuild(group, material, detailMaterial = material, { omit = true, finestMaterial = detailMaterial } = {}) {
    for (const child of [...group.children]) { group.remove(child); child.geometry.dispose(); }
    const polarRecords = pole => this.records.filter(t => t.meta.projection !== 'equirectangular' && poleOf(t.meta) === pole);
    if (this.overview) group.add(this.mesh(this.overview, material, 4, omit ? polarRecords('south') : []));
    if (this.north?.overview) group.add(this.mesh(this.north.overview, material, 4, omit ? polarRecords('north') : []));
    for (const tile of this.records) {
      const mesh = tile.meta.projection === 'equirectangular' ? this.meshGlobal(tile, detailMaterial, 1)
        : this.mesh(tile, tile.meta.lod === 2 ? finestMaterial : detailMaterial, 1,
          tile.meta.lod === 1 ? this.records.filter(t => t.meta.lod === 2) : []);
      mesh.userData.detail = true; group.add(mesh);
    }
  }
  dispose() { this.generation++; this.records = []; this.cache.clear(); }
}
