// S10 · South-pole heat map (T3). Reads data/heatmap/ (E13) and builds an overlay for viewer.setOverlay (P9).
//
//   import { loadHeatmap } from "./components/heatmap.js";
//   const heat = await loadHeatmap("../data");
//   const layer = await heat.render({ layer: "sunlit", month: null, fill: "#F2B33D" });
//   viewer.setOverlay(layer.canvas, { x0_km: layer.x0_km, y0_km: layer.y0_km, size_km: layer.size_km, opacity: 0.6 });
//   heat.valueAt(-89.45, -137.3, "sunlit", null)   // → { value: 70.2, unit: "%", grid: "fine_connecting_ridge" } or null
//
// Layers: sunlit · earth · both (% of hours) and dark (longest blackout, days). month: null = all of
// 2027–2028, or 0…23 (Jan 2027 … Dec 2028; the 250 m Artemis boxes exist for the whole period only).
// Colours: a ramp from the page background to one fill colour (style.md: --sun-fill / --earth-fill / --both-fill).

const R_KM = 1737.4, DEG = Math.PI / 180;
const PX_KM = 0.25;                       // composite resolution = the finest grid (250 m)

function toPolar(lat, lon) {
  const rho = 2 * R_KM * Math.tan(((90 + lat) / 2) * DEG);
  return { x: rho * Math.sin(lon * DEG), y: rho * Math.cos(lon * DEG) };
}
const hex = (c) => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(c.trim()); return m ? m.slice(1).map((h) => parseInt(h, 16)) : [242, 179, 61]; };

async function grayImage(url) {
  const img = new Image(); img.decoding = "async"; img.src = url; await img.decode();
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const rgba = g.getImageData(0, 0, c.width, c.height).data, v = new Uint8Array(c.width * c.height);
  for (let i = 0; i < v.length; i++) v[i] = rgba[i * 4];
  return { width: c.width, height: c.height, v };
}

export async function loadHeatmap(dataBase = "../data") {
  const base = String(dataBase).replace(/\/$/, "") + "/heatmap/";
  const index = await (await fetch(base + "index.json")).json();
  const cache = new Map();
  const get = (file) => { if (!cache.has(file)) cache.set(file, grayImage(base + file)); return cache.get(file); };
  const main = index.grids.find((g) => g.id === "south_2km");
  const fine = index.grids.filter((g) => g.id !== "south_2km");

  /** Raw grid values for one grid/layer/month: { width, height, v } (row 0 = max y). */
  async function raw(grid, layer, month) {
    if (month == null) return get(grid.files[layer]);
    const atlas = await get(grid.files[layer + "_months"]);
    const [w, h] = grid.px, col = month % index.month_atlas.columns, row = Math.floor(month / index.month_atlas.columns);
    const v = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) v.set(atlas.v.subarray((row * h + j) * atlas.width + col * w, (row * h + j) * atlas.width + col * w + w), j * w);
    return { width: w, height: h, v };
  }
  const decode = (layer, value) => (layer === "dark" ? value : value / 2.55);

  /** Coloured composite canvas + its placement on the south polar map. */
  async function render({ layer = "sunlit", month = null, fill = "#F2B33D", background = "#141414" } = {}) {
    const [ex, ey] = [main.image_x0_km, main.image_y0_km], [W, H] = main.image_size_km;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(W / PX_KM); canvas.height = Math.round(H / PX_KM);
    const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    const from = hex(background), to = hex(fill), reverse = !!index.layers[layer].reverse;
    const tint = (data) => {
      const c = document.createElement("canvas"); c.width = data.width; c.height = data.height;
      const g = c.getContext("2d"), img = g.createImageData(data.width, data.height);
      for (let i = 0; i < data.v.length; i++) {
        let t = data.v[i] / 255; if (reverse) t = 1 - Math.min(1, data.v[i] / 60);   // blackout: short = bright, ≥ 60 days = dark
        t = Math.sqrt(t);                     // spread the low/mid range: 20 % vs 40 % must look different
        img.data[i * 4] = from[0] + (to[0] - from[0]) * t; img.data[i * 4 + 1] = from[1] + (to[1] - from[1]) * t;
        img.data[i * 4 + 2] = from[2] + (to[2] - from[2]) * t; img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0); return c;
    };
    ctx.drawImage(tint(await raw(main, layer, month)), 0, 0, canvas.width, canvas.height);
    if (month == null) for (const g of fine) {            // sharper 250 m boxes on top
      const [w, h] = g.image_size_km;
      ctx.drawImage(tint(await raw(g, layer, null)), (g.image_x0_km - ex) / PX_KM, (ey + H - (g.image_y0_km + h)) / PX_KM, w / PX_KM, h / PX_KM);
    }
    return { canvas, x0_km: ex, y0_km: ey, size_km: [W, H], layer, month };
  }

  /** Exact stored value at a point (finest grid first), or null outside the south pole map. */
  async function valueAt(lat, lon, layer = "sunlit", month = null) {
    if (lat > -80) return null;
    const { x, y } = toPolar(lat, lon);
    for (const g of month == null ? [...fine, main] : [main]) {
      const [w, h] = g.image_size_km, [nx, ny] = g.px;
      const i = Math.floor((x - g.image_x0_km) / g.spacing_km), j = Math.floor((g.image_y0_km + h - y) / g.spacing_km);
      if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const d = await raw(g, layer, month);
      return { value: Math.round(decode(layer, d.v[j * nx + i]) * 10) / 10, unit: index.layers[layer].unit,
        capped: layer === "dark" && d.v[j * nx + i] === 255, grid: g.id };
    }
    return null;
  }
  return { index, render, valueAt, layers: index.layers, months: index.months };
}
