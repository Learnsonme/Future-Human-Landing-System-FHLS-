import { Vector3 } from './vendor/three.module.js';
import { locationToRender, renderToLocation, validateLocation, R_KM } from './coordinates.js';

// DOM labels keep their size at every zoom and do not allocate extra canvases.
export class Markers {
  constructor(root, heightAt) { this.root = root; this.heightAt = heightAt; this.items = new Map(); }
  add(id, lat, lon, label) {
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('Marker id must be a nonempty string.');
    const location = validateLocation(lat, lon);
    if (!/^[123]$/.test(String(label))) throw new RangeError('Marker label must be 1, 2, or 3.');
    if (!this.items.has(id) && this.items.size === 3) throw new RangeError('At most three markers are supported.');
    const node = this.items.get(id)?.node || document.createElement('span');
    node.className = 'fhls-marker'; node.hidden = true;
    node.textContent = String(label); node.setAttribute('aria-label', `Pin ${label}: ${location.lat}°, ${location.lon}°`);
    node.dataset.id = id; this.root.append(node);
    this.items.set(id, { id, ...location, label: String(label), node });
    this.setActive(this.active);
  }
  remove(id) {
    const item = this.items.get(id); if (!item) return false;
    item.node.remove(); this.items.delete(id); if (this.active === id) this.active = null;
    return true;
  }
  setActive(id = null) {
    this.active = id;
    for (const item of this.items.values()) item.node.classList.toggle('is-active', item.id === id);
  }
  update(camera, width, height) {
    camera.updateMatrixWorld();
    for (const item of this.items.values()) {
      const point = new Vector3(...locationToRender(item.lat, item.lon, this.heightAt(item.lat, item.lon) + 4));
      const view = camera.position.clone().sub(point), screen = point.clone().project(camera);
      let visible = point.dot(view) > 0 && Math.abs(screen.x) <= 1 && Math.abs(screen.y) <= 1 && screen.z >= -1 && screen.z <= 1;
      // Test the line of sight against local relief, including a nearby ridge.
      // Quadratic spacing concentrates samples near the surface label.
      if (visible) for (let i = 1; i <= 48; i++) {
        const sample = point.clone().addScaledVector(view, (i / 48) ** 2);
        if (sample.length() > R_KM + 15) break;
        const loc = renderToLocation(sample.toArray());
        if (sample.length() < R_KM + this.heightAt(loc.lat, loc.lon) / 1000) { visible = false; break; }
      }
      item.node.hidden = !visible;
      if (visible) { item.node.style.left = `${(screen.x + 1) * width / 2}px`; item.node.style.top = `${(1 - screen.y) * height / 2}px`; }
    }
  }
  diagnostics() { return [...this.items.values()].map(({ node, ...item }) => ({ ...item, visible: !node.hidden })); }
  dispose() { for (const item of this.items.values()) item.node.remove(); this.items.clear(); }
}
