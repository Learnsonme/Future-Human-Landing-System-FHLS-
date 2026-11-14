import * as T from './vendor/three.module.js';
import { R_KM, sampleGlobal, renderToLocation } from './coordinates.js';

// Reader for the CGI Moon Kit's uncompressed unsigned 16-bit TIFF displacement.
// Keeping source numerical TIFF values avoids an 8-bit display-image conversion.
export function decodeMoonTIFF(buffer) {
  const bytes = new Uint8Array(buffer), d = new DataView(buffer);
  const little = bytes[0] === 73 && bytes[1] === 73;
  if (!little && !(bytes[0] === 77 && bytes[1] === 77)) throw new Error('Invalid TIFF byte order.');
  const u16 = p => d.getUint16(p, little), u32 = p => d.getUint32(p, little);
  if (u16(2) !== 42) throw new Error('Expected classic TIFF.');
  const ifd = u32(4), count = u16(ifd), tags = new Map();
  for (let i = 0; i < count; i++) {
    const p = ifd + 2 + i * 12, tag = u16(p), type = u16(p + 2), n = u32(p + 4);
    if (type !== 3 && type !== 4) continue;
    const size = type === 3 ? 2 : 4, offset = n * size <= 4 ? p + 8 : u32(p + 8);
    if (n > 1e6 || offset + n * size > bytes.length) throw new Error('Invalid TIFF directory.');
    tags.set(tag, Array.from({ length: n }, (_, j) => type === 3 ? u16(offset + j * size) : u32(offset + j * size)));
  }
  const first = (tag, fallback) => tags.get(tag)?.[0] ?? fallback;
  const width = first(256), height = first(257);
  if (!(width > 1 && height > 1 && width * height < 16e6) || first(258) !== 16 || first(259, 1) !== 1
      || first(277, 1) !== 1 || first(339, 1) !== 1 || first(274, 1) !== 1) throw new Error('Unsupported Moon TIFF encoding.');
  const offsets = tags.get(273), counts = tags.get(279), values = new Float32Array(width * height);
  if (!offsets || !counts || offsets.length !== counts.length) throw new Error('Missing TIFF strips.');
  let k = 0;
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] + counts[i] > bytes.length || counts[i] % 2) throw new Error('Truncated TIFF strip.');
    for (let p = offsets[i]; p < offsets[i] + counts[i]; p += 2) {
      if (k >= values.length) throw new Error('Unexpected TIFF samples.');
      values[k++] = u16(p) * 0.5 - 10000;
    }
  }
  if (k !== values.length) throw new Error('Missing TIFF samples.');
  return { width, height, values };
}

export function createGlobe(texture, relief, terrain) {
  // One-degree latitude rings include the exact −84° terrain boundary.
  const geometry = new T.SphereGeometry(R_KM, 384, 180);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const v = new T.Vector3().fromBufferAttribute(positions, i), { lat, lon } = renderToLocation(v.toArray());
    const h = terrain?.heightAt(lat, lon) ?? sampleGlobal(relief.values, relief.width, relief.height, lat, lon);
    v.setLength(R_KM + h / 1000); positions.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  const material = new T.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 });
  const mesh = new T.Mesh(geometry, material); mesh.receiveShadow = true;
  const fullIndex = Array.from(geometry.index.array);
  return { mesh, heightAt: (lat, lon) => sampleGlobal(relief.values, relief.width, relief.height, lat, lon),
    setPolarDetail(enabled) {
      const index = [];
      for (let i = 0; i < fullIndex.length; i += 3) {
        const a = fullIndex[i], b = fullIndex[i + 1], c = fullIndex[i + 2];
        const centre = new T.Vector3().fromBufferAttribute(positions,a)
          .add(new T.Vector3().fromBufferAttribute(positions,b)).add(new T.Vector3().fromBufferAttribute(positions,c));
        const lat = renderToLocation(centre.toArray()).lat;
        if (!enabled || lat > -84) index.push(a, b, c);
      }
      geometry.setIndex(index);
    } };
}

export function createStars() {
  let seed = 4720; const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  const positions = [];
  for (let i = 0; i < 1600; i++) {
    const z = random() * 2 - 1, phi = random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    positions.push(19000 * r * Math.cos(phi), 19000 * z, 19000 * r * Math.sin(phi));
  }
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  return new T.Points(geometry, new T.PointsMaterial({ color: '#9A978F', size: 1.1, sizeAttenuation: false }));
}
