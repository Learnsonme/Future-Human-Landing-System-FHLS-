// Numeric PNG reader: grayscale, 16-bit, non-interlaced, all five PNG filters.
// No canvas, gamma conversion, or reduction to 8-bit samples.
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}
const paeth = (a, b, c) => {
  const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c);
  return x <= y && x <= z ? a : y <= z ? b : c;
};

export async function decodePNG16(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  if (bytes.length < 33 || bytes.slice(0, 8).join() !== '137,80,78,71,13,10,26,10') throw new Error('Invalid PNG signature.');
  let width, height, ended = false; const chunks = [];
  for (let p = 8; p + 12 <= bytes.length;) {
    const n = view.getUint32(p), end = p + 12 + n;
    if (end > bytes.length) throw new Error('Truncated PNG chunk.');
    const name = String.fromCharCode(...bytes.slice(p + 4, p + 8));
    if (crc32(bytes.subarray(p + 4, p + 8 + n)) !== view.getUint32(p + 8 + n)) throw new Error('PNG checksum failed.');
    if (name === 'IHDR') {
      width = view.getUint32(p + 8); height = view.getUint32(p + 12);
      if (n !== 13 || bytes[p + 16] !== 16 || bytes[p + 17] !== 0 || bytes[p + 18] || bytes[p + 19] || bytes[p + 20]) {
        throw new Error('Expected non-interlaced 16-bit grayscale PNG.');
      }
      if (!width || !height || width * height > 16e6) throw new Error('Unsupported PNG dimensions.');
    } else if (name === 'IDAT') chunks.push(bytes.slice(p + 8, p + 8 + n));
    else if (name === 'IEND') { ended = true; break; }
    p = end;
  }
  if (!width || !ended || !chunks.length) throw new Error('Incomplete PNG.');
  const stream = new Blob(chunks).stream().pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer()), stride = width * 2;
  if (raw.length !== (stride + 1) * height) throw new Error('PNG data length does not match dimensions.');
  const decoded = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error('Unsupported PNG filter.');
    for (let x = 0; x < stride; x++) {
      const k = y * stride + x, a = x >= 2 ? decoded[k - 2] : 0;
      const b = y ? decoded[k - stride] : 0, c = y && x >= 2 ? decoded[k - stride - 2] : 0;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      decoded[k] = raw[y * (stride + 1) + x + 1] + predictor;
    }
  }
  const values = new Uint16Array(width * height);
  for (let i = 0; i < values.length; i++) values[i] = decoded[i * 2] * 256 + decoded[i * 2 + 1];
  return { width, height, values };
}
