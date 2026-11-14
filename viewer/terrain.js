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
    const owners = [...this.records].sort((a,b) => a.meta.id.localeCompare(b.meta.id));
    const capRadius = locationToPolar(-84,0).y;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const col = Math.min(m.px - 1, i * stride), row = Math.min(m.px - 1, j * stride);
      const x = m.x0_km + col * m.spacing_km, y = m.y0_km + m.size_km - row * m.spacing_km;
      const { lat, lon } = polarToLocation(x, y), tex = locationToUV(lat, lon);
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
      const x=p.x+t*dx,y=p.y+t*dy,h=p.h+t*(q.h-p.h),loc=polarToLocation(x,y),tex=locationToUV(loc.lat,loc.lon);
      const i=positions.length/3;
      positions.push(...locationToRender(loc.lat,loc.lon,h*this.exaggeration));uv.push(tex.u,tex.v);
      polar.push({x,y,h,lat:loc.lat});intersections.set(key,i);return i;
    }
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
      if (omit.some(t => this.contains(t.meta, mid.x, mid.y))) continue;
      addTriangle([a,c,b]);addTriangle([b,c,d]);
    }
    // Hide small overview/detail height differences at LOD joins with vertical
    // skirts. Surface vertices and scientific elevations remain unchanged.
    const edges = new Map();
    for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){
      const a=indices[i+j],b=indices[i+(j+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
      if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);
    }
    const surfaceIndexCount = indices.length;
    for(const [a,b] of edges.values()){
      const mid={x:(polar[a].x+polar[b].x)/2,y:(polar[a].y+polar[b].y)/2};
      // Shared detail edges already agree exactly. An internal skirt would
      // introduce a vertical shadow caster underneath that continuous surface.
      if(m.lod===1 && owners.some(t=>t!==tile && this.contains(t.meta,mid.x,mid.y)))continue;
      const lower=[];
      for(const i of [a,b]){
        const v=new T.Vector3(...positions.slice(i*3,i*3+3));v.setLength(v.length()-1);
        lower.push(positions.length/3);positions.push(...v.toArray());uv.push(uv[i*2],uv[i*2+1]);
      }
      indices.push(a,lower[0],b,b,lower[0],lower[1]);
    }
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    // Polar UVs cross the longitude seam; terrain uses a procedural lunar grey material.
    const mesh = new T.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.surfaceIndexCount = surfaceIndexCount;
    return mesh;
  }
  rebuild(group, material) {
    for (const child of [...group.children]) { group.remove(child); child.geometry.dispose(); }
    if (this.overview) group.add(this.mesh(this.overview, material, 4, this.records));
    for (const tile of this.records) group.add(this.mesh(tile, material, 1));
  }
  dispose() { this.generation++; this.records = []; this.cache.clear(); }
}
