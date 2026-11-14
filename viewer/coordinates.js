// Public coordinates are planetocentric degrees, positive-east longitude, MOON_ME.
export const R_KM = 1737.4;
export const DEG = Math.PI / 180;
export const normalizeLongitude = lon => ((lon + 180) % 360 + 360) % 360 - 180;

export function validateLocation(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) {
    throw new RangeError('Latitude must be −90…90 degrees; longitude must be finite.');
  }
  return { lat, lon: Math.abs(lat) === 90 ? 0 : normalizeLongitude(lon) };
}

export const moonToRender = ([x, y, z]) => [x, z, -y];
export const renderToMoon = ([x, y, z]) => [x, -z, y];

export function locationToRender(lat, lon, heightM = 0) {
  const r = R_KM + heightM / 1000, c = Math.cos(lat * DEG);
  return [r * c * Math.cos(lon * DEG), r * Math.sin(lat * DEG), -r * c * Math.sin(lon * DEG)];
}

export function renderToLocation([x, y, z]) {
  return validateLocation(Math.atan2(y, Math.hypot(x, z)) / DEG, Math.atan2(-z, x) / DEG);
}

export function locationToUV(lat, lon) {
  return { u: (normalizeLongitude(lon) + 180) / 360, v: (lat + 90) / 180 };
}

export function polarToLocation(x, y) {
  return { lat: 2 * Math.atan(Math.hypot(x, y) / (2 * R_KM)) / DEG - 90,
    lon: Math.hypot(x, y) < 1e-9 ? 0 : Math.atan2(x, y) / DEG };
}

export function locationToPolar(lat, lon) {
  const rho = 2 * R_KM * Math.tan((90 + lat) * DEG / 2);
  return { x: rho * Math.sin(lon * DEG), y: rho * Math.cos(lon * DEG) };
}

export function localFrame(lat, lon) {
  if (Math.abs(lat) === 90) lon = 0;
  const p = lat * DEG, l = lon * DEG;
  return { up: locationToRender(lat, lon).map(v => v / R_KM),
    east: [-Math.sin(l), 0, -Math.cos(l)],
    north: [-Math.sin(p) * Math.cos(l), Math.cos(p), Math.sin(p) * Math.sin(l)] };
}

export function sampleGrid(values, width, height, x, y) {
  x = Math.max(0, Math.min(width - 1, x)); y = Math.max(0, Math.min(height - 1, y));
  const i = Math.min(width - 2, Math.floor(x)), j = Math.min(height - 2, Math.floor(y));
  const a = x - i, b = y - j, k = j * width + i;
  return (values[k] * (1 - a) + values[k + 1] * a) * (1 - b)
    + (values[k + width] * (1 - a) + values[k + width + 1] * a) * b;
}

// Raster rows run north to south. Pixel centres are half a sample from map edges.
export function sampleGlobal(values, width, height, lat, lon) {
  const { u, v } = locationToUV(lat, lon);
  const x = u * width - 0.5, y = Math.max(0, Math.min(height - 1, (1 - v) * height - 0.5));
  const ix = Math.floor(x), iy = Math.min(height - 2, Math.floor(y)), a = x - ix, b = y - iy;
  const col = i => (i % width + width) % width;
  const row = j => values[j * width + col(ix)] * (1 - a) + values[j * width + col(ix + 1)] * a;
  return row(iy) * (1 - b) + row(iy + 1) * b;
}

export function parseTime(utc) {
  if (typeof utc !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?Z$/.test(utc)) {
    throw new TypeError('Use an ISO UTC string ending in Z.');
  }
  const ms = Date.parse(utc), start = Date.parse('2027-01-01T00:00:00Z');
  const end = Date.parse('2028-12-31T23:00:00Z');
  if (!Number.isFinite(ms) || ms < start || ms > end) throw new RangeError('Time must be within 2027–2028 hourly coverage.');
  if(new Date(ms).toISOString().slice(0,16)!==utc.slice(0,16))throw new RangeError('Use a valid UTC calendar date and time.');
  return new Date(start + Math.round((ms - start) / 3600000) * 3600000).toISOString();
}
