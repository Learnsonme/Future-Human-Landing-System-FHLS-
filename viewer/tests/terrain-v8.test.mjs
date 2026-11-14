// V8 · north, whole-Moon (474 m) and Artemis (40 m) terrain meshes.  node --test viewer/tests/terrain-v8.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Vector3, MeshStandardMaterial } from '../vendor/three.module.js';
import { renderToLocation, locationToPolar, polarToLocation, normalizeLongitude } from '../coordinates.js';
import { decodePNG16 } from '../png16.js';
import { Terrain } from '../terrain.js';

const data = new URL('../../data/', import.meta.url);
const json = async name => JSON.parse(await readFile(new URL('terrain/' + name, data), 'utf8'));
const tile = async meta => {
  const png = await decodePNG16((await readFile(new URL('terrain/' + meta.file, data))).buffer);
  return { meta, heights: Float32Array.from(png.values, v => meta.min_m + v / 65535 * (meta.max_m - meta.min_m)) };
};
const near = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b}`);
const material = new MeshStandardMaterial();
function outward(mesh) {
  const p = mesh.geometry.attributes.position, index = mesh.geometry.index;
  for (let i = 0; i < mesh.userData.surfaceIndexCount; i += 3 * 997) {
    const a = new Vector3().fromBufferAttribute(p, index.getX(i)), b = new Vector3().fromBufferAttribute(p, index.getX(i + 1)),
      c = new Vector3().fromBufferAttribute(p, index.getX(i + 2));
    assert.ok(b.sub(a).cross(c.sub(a)).dot(a) > 0, 'triangle faces inward');
  }
}

test('North polar projection round-trips and is not mirrored', () => {
  for (const [lat, lon] of [[86.2, 77], [89.9, -150], [84, 0], [85, 180]]) {
    const { x, y } = locationToPolar(lat, lon, 'north'), back = polarToLocation(x, y, 'north');
    near(back.lat, lat, 1e-9); near(normalizeLongitude(back.lon - lon), 0, 1e-9);
  }
  // lon 0 lies toward −y and lon 90°E toward +x on the north map (DATA_CONTRACT proposal / engine/dem.py)
  assert.ok(locationToPolar(85, 0, 'north').y < 0 && locationToPolar(85, 90, 'north').x > 0);
});

test('North tiles: registration, outward faces and physical heights', async () => {
  const manifest = await json('index_north.json'), terrain = new Terrain(data);
  const meta = manifest.tiles.find(t => t.file === 'north/2_2.png');
  terrain.north = { manifest, overview: await tile(manifest.tiles.find(t => t.lod === 0)) };
  terrain.records = [await tile(meta)];
  const mesh = terrain.mesh(terrain.records[0], material, 1), p = mesh.geometry.attributes.position;
  for (const [row, col] of [[0, 0], [256, 256], [512, 512]]) {
    const v = new Vector3().fromBufferAttribute(p, row * 513 + col), loc = renderToLocation(v.toArray()), xy = locationToPolar(loc.lat, loc.lon, 'north');
    near(xy.x, meta.x0_km + col * meta.spacing_km, 2e-4); near(xy.y, meta.y0_km + meta.size_km - row * meta.spacing_km, 2e-4);
    near((v.length() - 1737.4) * 1000, terrain.records[0].heights[row * 513 + col], 0.2);
  }
  outward(mesh); outward(terrain.mesh(terrain.north.overview, material, 4));
  const h = terrain.heightAt(88, 30); assert.ok(Number.isFinite(h), 'north heightAt');
});

test('Whole-Moon 474 m tiles: registration, outward faces, exact seams incl. the date line', async () => {
  const index = await json('index_global.json'), get = (lon0, lat0) => index.tiles.find(t => t.lon0 === lon0 && t.lat0 === lat0);
  const terrain = new Terrain(data); terrain.overview = { meta: { id: 'x' } };
  const [east, west] = [await tile(get(172, 0)), await tile(get(-180, 0))];
  terrain.records = [east, west];
  const me = terrain.meshGlobal(east, material), mw = terrain.meshGlobal(west, material);
  const pe = me.geometry.attributes.position, pw = mw.geometry.attributes.position;
  for (const [row, col] of [[0, 0], [100, 400], [512, 512]]) {
    const v = new Vector3().fromBufferAttribute(pe, row * 513 + col), loc = renderToLocation(v.toArray());
    near(loc.lat, east.meta.lat0 + 8 - row / 64, 1e-6); near(normalizeLongitude(loc.lon - (172 + col / 64)), 0, 1e-6);
    near((v.length() - 1737.4) * 1000, east.heights[row * 513 + col], 0.2);
  }
  for (let row = 0; row < 513; row++) {     // east tile's right edge (lon 180) = west tile's left edge (lon −180)
    const a = new Vector3().fromBufferAttribute(pe, row * 513 + 512), b = new Vector3().fromBufferAttribute(pw, row * 513);
    near(a.distanceTo(b), 0, 1e-6, `seam row ${row}`);
  }
  outward(me); outward(mw);
  near(terrain.heightAt(4, 179.9), terrain.sample(east, 4, 179.9), 1e-9);
  assert.equal(terrain.describe(4, 179.9), 'LOLA-474m');
});

test('Whole-Moon tiles stop at ±84° where the polar caps take over', async () => {
  const index = await json('index_global.json'), terrain = new Terrain(data); terrain.overview = { meta: { id: 'x' } };
  const t = await tile(index.tiles.find(t => t.lon0 === 4 && t.lat0 === -88)); terrain.records = [t];
  const mesh = terrain.meshGlobal(t, material), p = mesh.geometry.attributes.position, idx = mesh.geometry.index;
  for (let i = 0; i < mesh.userData.surfaceIndexCount; i += 3) {
    const c = new Vector3().fromBufferAttribute(p, idx.getX(i)).add(new Vector3().fromBufferAttribute(p, idx.getX(i + 1))).add(new Vector3().fromBufferAttribute(p, idx.getX(i + 2)));
    assert.ok(renderToLocation(c.toArray()).lat > -84 - 1e-6);
  }
});

test('Artemis 40 m tiles: registration, priority over 120 m, outward faces', async () => {
  const detail = await json('index_detail.json'), south = await json('index.json');
  const meta = detail.tiles.find(t => t.site === 'connecting_ridge'), terrain = new Terrain(data);
  terrain.manifest = south; terrain.overview = await tile(south.tiles.find(t => t.lod === 0));
  const d = await tile(meta); terrain.records = [d];
  const mesh = terrain.mesh(d, material, 1), p = mesh.geometry.attributes.position;
  for (const [row, col] of [[0, 0], [256, 256], [512, 512]]) {
    const v = new Vector3().fromBufferAttribute(p, row * 513 + col), loc = renderToLocation(v.toArray()), xy = locationToPolar(loc.lat, loc.lon);
    near(xy.x, meta.x0_km + col * 0.04, 2e-4); near(xy.y, meta.y0_km + meta.size_km - row * 0.04, 2e-4);
  }
  outward(mesh);
  assert.equal(terrain.describe(-89.53432, -150.05233), 'LOLA-40m');
});
