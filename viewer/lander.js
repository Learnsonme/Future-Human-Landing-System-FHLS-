import { Vector3 } from './vendor/three.module.js';
import { locationToRender, validateLocation } from './coordinates.js';

// S16 · A small lunar-lander glyph on the currently selected spot (one at a time).
// DOM + inline SVG like the pin markers: constant size on screen, always facing the viewer, and never
// hidden by terrain at the chosen point (only when the spot is on the far side of the Moon or off screen).
// Our own simple drawing: ascent cabin, descent stage, four legs with pads.
const SVG = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6.5 12.5 3 20M17.5 12.5 21 20M9.5 14 8.5 20M14.5 14l1 6"/>
    <path d="M1.8 20h2.6M19.6 20h2.6M7.3 20h2.4M14.3 20h2.4"/>
    <path class="fhls-lander-stage" d="M6 8.5h12v5.5H6z"/>
    <path class="fhls-lander-cabin" d="M9 3.8h6l2 4.7H7z"/>
    <path d="M10.9 14h2.2l.6 1.8h-3.4z"/>
  </g>
  <path class="fhls-lander-window" d="M10.6 5.3h2.8v1.7h-2.8z"/>
</svg>`;

export class Lander {
  constructor(root, heightAt) {
    this.root = root; this.heightAt = heightAt; this.at = null;
    this.node = document.createElement('div'); this.node.className = 'fhls-lander'; this.node.hidden = true;
    this.node.setAttribute('role', 'img');
    this.node.innerHTML = `${SVG}<span class="fhls-lander-label"></span>`;
    this.label = this.node.querySelector('.fhls-lander-label');
    root.append(this.node);
  }
  /** Put the lander on (lat, lon); a new spot replays the single touchdown. */
  show(lat, lon, label = '') {
    const location = validateLocation(lat, lon);
    const moved = !this.at || this.at.lat !== location.lat || this.at.lon !== location.lon;
    this.at = location;
    const text = String(label || '').slice(0, 60);
    this.label.textContent = text; this.label.hidden = !text;
    this.node.setAttribute('aria-label', `Selected: ${text || 'picked point'}, ${location.lat.toFixed(2)}°, ${location.lon.toFixed(2)}°`);
    if (moved) { this.node.classList.remove('is-landing'); void this.node.offsetWidth; this.node.classList.add('is-landing'); }
  }
  clear() { this.at = null; this.node.hidden = true; this.node.classList.remove('is-landing'); }
  update(camera, width, height) {
    if (!this.at) { this.node.hidden = true; return; }
    camera.updateMatrixWorld();
    const point = new Vector3(...locationToRender(this.at.lat, this.at.lon, this.heightAt(this.at.lat, this.at.lon) + 2));
    const view = camera.position.clone().sub(point), screen = point.clone().project(camera);
    // facing the camera (not round the far side) and on screen; terrain never hides it
    const visible = point.dot(view) > 0 && Math.abs(screen.x) <= 1.05 && Math.abs(screen.y) <= 1.05 && screen.z >= -1 && screen.z <= 1;
    this.node.hidden = !visible;
    if (visible) { this.node.style.left = `${(screen.x + 1) * width / 2}px`; this.node.style.top = `${(1 - screen.y) * height / 2}px`; }
  }
  diagnostics() { return this.at ? { ...this.at, label: this.label.textContent, visible: !this.node.hidden } : null; }
  dispose() { this.node.remove(); this.at = null; }
}
