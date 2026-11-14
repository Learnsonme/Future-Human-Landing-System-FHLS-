import * as T from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { loadCore } from '../core/fhls-core.js';
import { R_KM, moonToRender, locationToRender, renderToLocation, validateLocation, parseTime } from './coordinates.js';
import { createGlobe, createStars, decodeMoonTIFF } from './globe.js';
import { Terrain, fetchOK } from './terrain.js';
import { makeFlight, updateFlight, sunlitCameraPosition } from './navigation.js';
import { Markers } from './markers.js';
import { Lander } from './lander.js';

const HERE = new URL('./', import.meta.url);
const asset = name => new URL(`assets/${name}`, HERE);

/** Framework-independent FHLS viewer. All paths are relative to this module. */
export function createViewer(container, options = {}) {
  if (!(container instanceof HTMLElement)) throw new TypeError('createViewer needs an HTML container.');
  // Validate synchronous inputs before adding DOM, observers or GPU resources.
  let utc = parseTime(options.time || '2027-01-15T12:00:00Z');
  const dataBase = new URL(options.dataBase || '../data/', HERE); if (!dataBase.pathname.endsWith('/')) dataBase.pathname += '/';
  const root = document.createElement('div'); root.className = 'fhls-viewer';
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('viewer.css', HERE).href;
  const message = document.createElement('div'); message.className = 'fhls-viewer-status'; message.setAttribute('role', 'status');
  const startButton = document.createElement('button'); startButton.className = 'fhls-viewer-start'; startButton.textContent = 'Start exploration';
  startButton.disabled = true; root.append(css, message, startButton); container.append(root);
  let renderer, camera, controls, scene, light, globe, terrain, terrainGroup, terrainMaterial, detailMaterial, finestMaterial, stars, core;
  let sky = null, siteHorizon = null;   // real Sun and Earth in the 3D sky (explorer only)
  let lookingAt = null, skyNoteTimer = 0; // body the camera is facing (Look at …), if any
  let terrainReady = Promise.resolve(null), extrasReady = null, fade = null, firstFrame = false;
  let needsRender = true, hiddenAt = null, posterTimer = 0, cameraClearanceKm = null;
  const presentation = options.presentation !== false;
  // P9: one shared overlay (heat map) draped over the south polar terrain by the terrain shaders.
  const overlay = { uOverlay: { value: null }, uOverlayRect: { value: new T.Vector4(0, 0, 1, 1) },
    uOverlayOpacity: { value: 0 }, uOverlayOn: { value: 0 } };
  function withOverlay(material) {
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, overlay);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOverlayPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOverlayPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D uOverlay; uniform vec4 uOverlayRect; uniform float uOverlayOpacity; uniform float uOverlayOn;
varying vec3 vOverlayPos;`).replace('#include <opaque_fragment>', `if (uOverlayOn > 0.5) {
  // render (x, y, z) = MOON_ME (x, z, −y); south polar stereographic: x = 2R·(−u.z)/(1 − u.y), y = 2R·u.x/(1 − u.y)
  vec3 u = normalize(vOverlayPos);
  if (u.y < -0.5) {
    vec2 xy = vec2(-u.z, u.x) * (2.0 * 1737.4 / (1.0 - u.y));
    vec2 uv = (xy - uOverlayRect.xy) / uOverlayRect.zw;
    if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
      vec4 o = texture2D(uOverlay, uv);
      // After lighting: the map colour reads the same in sunlight and in the long polar shadows,
      // while (1 − opacity) of the lit relief still shows through.
      outgoingLight = mix(outgoingLight, o.rgb, o.a * uOverlayOpacity);
    }
  }
}
#include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'fhls-overlay';
    return material;
  }
  // M3: show a matching still of the Moon at once; the live globe crossfades in after its first frame.
  let poster = null;
  if (presentation) {
    poster = document.createElement('img'); poster.className = 'fhls-viewer-poster'; poster.alt = '';
    poster.decoding = 'async'; poster.setAttribute('fetchpriority', 'high'); poster.src = asset('moon-poster.webp').href;
    poster.addEventListener('error', () => poster?.remove(), { once: true });
    root.classList.add('fhls-viewer--transparent'); root.append(poster);
  }
  let disposed = false, failed = false, started = options.presentation === false, flight = null, raf = 0, lastFrame = 0;
  let selection = null, generation = 0, pendingPick;
  let status = { phase: 'loading', message: 'Loading lunar imagery and ephemeris…', time: utc, lighting: 'loading', terrain: 'loading', synthetic: true, exaggeration: 1 };
  const picks = new Set(), statuses = new Set(), listeners = [], abort = new AbortController();
  const looseTextures = new Set();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const markers = new Markers(root, (lat, lon) => heightAt(lat, lon));
  const lander = new Lander(root, (lat, lon) => heightAt(lat, lon));   // S16: the current selection
  const raycaster = new T.Raycaster(), pointer = new T.Vector2();
  const event = (node, type, fn, opts) => { node.addEventListener(type, fn, opts); listeners.push(() => node.removeEventListener(type, fn, opts)); };
  function notify(patch) {
    if (disposed) return;
    needsRender = true;
    status = { ...status, ...patch }; message.textContent = status.message;
    status.synthetic = core ? !!core.synthetic : true;
    if(status.lighting==='fixed-development' && !status.message.startsWith('Development lighting — fixed Sun'))message.textContent = `Development lighting — fixed Sun · ${status.message}`;
    if(status.lighting==='synthetic')message.textContent = `Synthetic ephemeris · ${status.message}`;
    root.dataset.phase = status.phase;
    for (const cb of statuses) { try { cb({ ...status }); } catch (e) { console.error(e); } }
  }
  function checkAlive() { if (disposed) throw new Error('Viewer has been disposed.'); }
  function start() {
    checkAlive(); started = true; startButton.hidden = true;
    if (controls) controls.autoRotate = false;
  }
  function cancelFlight() {
    generation++; pendingPick = null;
    if (terrain) terrain.generation++;
    root.setAttribute('aria-busy', 'false');
    if (fade) finishFade();
    if (flight) { flight.resolve({ cancelled: true }); flight = null; if (controls) controls.enabled = true; }
    if (status.phase === 'loading-terrain') notify({ phase: 'ready', message: 'Terrain loading cancelled · using current relief' });
  }
  // M1: the globe → terrain handover. While fading, the detail sits over a whole globe/overview
  // (polygon offset wins the depth test); once opaque, the coarse surface under it is cut away.
  const FADE_FROM = 0.35;     // fade starts at 35 % of the 1.8 s flight and lasts FADE_MS (M11: 400–600 ms)
  const FADE_MS = 540;
  function setFade(opacity) {
    for (const material of [detailMaterial, finestMaterial]) {
      material.opacity = opacity; const transparent = opacity < 1;
      if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
    }
  }
  function capHoles(lat) { return (lat <= -84 && !!terrain?.overview) || (lat >= 84 && !!terrain?.north?.overview); }
  function finishFade() {
    fade = null; if (!terrain || disposed) return;
    needsRender = true;
    setFade(1);
    terrain.rebuild(terrainGroup, terrainMaterial, detailMaterial, { omit: true, finestMaterial });
    globe?.refreshHeights((lat, lon) => terrain.heightAt(lat, lon), terrain.exaggeration);
    globe?.setHoles((lat, lon) => capHoles(lat) || terrain.globalCovers(lat, lon));
    if (renderer) renderer.shadowMap.needsUpdate = true;
  }
  function clearControlInertia() {
    // OrbitControls keeps private damping deltas after a drag. Flush them before
    // assigning a camera pose so a reset or completed flight stays at that pose.
    const damping = controls.enableDamping;
    controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
  }
  function heightAt(lat, lon) {
    const detail = terrain?.heightAt(lat, lon);
    return detail != null ? detail * terrain.exaggeration : globe?.heightAt(lat, lon) ?? 0;
  }
  function updateLight() {
    if (!light) return;
    const centre = selection ? new T.Vector3(...locationToRender(selection.lat, selection.lon, heightAt(selection.lat, selection.lon))) : new T.Vector3();
    let direction;
    if (core) direction = new T.Vector3(...moonToRender(core.sunDirection(utc))).normalize();
    else {
      // Explicit development-only fallback: ~1 degree above the selected site's horizon.
      const up = centre.length() ? centre.clone().normalize() : new T.Vector3(1, 0, 0);
      let tangent = new T.Vector3(0, 1, 0).addScaledVector(up, -up.y);
      if (tangent.lengthSq() < 1e-8) tangent = new T.Vector3(0, 0, -1);
      direction = tangent.normalize().multiplyScalar(Math.cos(Math.PI / 180)).addScaledVector(up, Math.sin(Math.PI / 180));
    }
    light.target.position.copy(centre); light.position.copy(centre).addScaledVector(direction, 1000);
    // Shadow-map half-size (km). 2048² texels: 80 km → 78 m texels for the 120 m regions and 40 m Artemis
    // tiles (close camera), 160 km for the polar caps, 320 km for the 474 m whole-Moon patch.
    const local = !!selection && !!terrain?.records.length;
    const fine = local && (terrain.regionAt(selection.lat, selection.lon) || terrain.describe(selection.lat, selection.lon) === 'LOLA-40m');
    const extent = !local ? 2100 : fine ? 80 : terrain.kind === 'global' ? 320 : 160;
    Object.assign(light.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.1, far: local ? 2400 : 6000 });
    light.shadow.camera.updateProjectionMatrix(); light.castShadow = !!local; light.shadow.needsUpdate = true;
    renderer.shadowMap.needsUpdate = true;
    notify({ time: utc, lighting: core ? (core.synthetic ? 'synthetic' : 'ephemeris') : 'fixed-development' });
  }
  function setTime(value) { checkAlive(); utc = parseTime(value); notify({time:utc}); updateLight(); checkLookingAt(); return utc; }

  // ── The real Sun and Earth in the sky (explorer only) ───────────────────────────────────────
  // Drawn "at infinity" (just inside the far plane) along their true directions from the camera,
  // at true angular size (Sun 0.53°, Earth ≈ 1.9°), so terrain and the Moon hide them exactly as
  // they would. Earth is a sphere lit by the scene's Sun, so it shows its real phase.
  const SUN_R_KM = 696000, EARTH_R_KM = 6371;
  function createSky() {
    const sun = new T.Mesh(new T.SphereGeometry(1, 32, 16), new T.MeshBasicMaterial({ color: '#F2B33D' }));
    const earth = new T.Mesh(new T.SphereGeometry(1, 48, 24), new T.MeshStandardMaterial({ color: '#4C9BE8', roughness: 0.9, metalness: 0 }));
    for (const m of [sun, earth]) { m.frustumCulled = false; m.renderOrder = -1; scene.add(m); }
    const label = text => { const n = document.createElement('span'); n.className = 'fhls-sky-label'; n.textContent = text; n.hidden = true; root.append(n); return n; };
    const bar = document.createElement('div'); bar.className = 'fhls-sky-look'; bar.hidden = true;
    const look = (text, body) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
      b.addEventListener('click', () => lookAt(body)); bar.append(b); return b; };
    look('Look at Sun', 'sun'); look('Look at Earth', 'earth'); root.append(bar);
    const note = document.createElement('p'); note.className = 'fhls-sky-note'; note.setAttribute('role', 'status'); note.hidden = true; root.append(note);
    return { sun, earth, labels: { sun: label('Sun'), earth: label('Earth') }, bar, note };
  }
  function bodyRender(name) {
    const p = core?.bodyPositions?.(utc); if (!p) return null;
    return new T.Vector3(...moonToRender(p[name]));
  }
  function horizonBlocked(name) {
    if (!selection || !siteHorizon || !core) return null;
    const a = core.at(selection.lat, selection.lon, utc)[name];
    const n = siteHorizon.values.length, f = ((a.az % 360) + 360) % 360 / (360 / n), i = Math.floor(f) % n, t = f - Math.floor(f);
    const h = siteHorizon.values[i] * (1 - t) + siteHorizon.values[(i + 1) % n] * t;
    return a.el <= h;
  }
  function updateSky() {
    if (!sky) return;
    const D = camera.far * 0.9, w = root.clientWidth, h = root.clientHeight;
    for (const [name, mesh, radius] of [['sun', sky.sun, SUN_R_KM], ['earth', sky.earth, EARTH_R_KM]]) {
      const P = bodyRender(name), node = sky.labels[name];
      if (!P) { mesh.visible = false; node.hidden = true; continue; }
      // with a site chosen, a body the site's skyline hides is not drawn at all (user request: no globe
      // poking out from behind the terrain); the "not in sight" message says where it is instead
      if (outOfSight(name)) { mesh.visible = false; node.hidden = true; continue; }
      const dir = P.clone().sub(camera.position), dist = dir.length(); dir.normalize();
      mesh.visible = true;
      mesh.position.copy(camera.position).addScaledVector(dir, D);
      mesh.scale.setScalar(D * Math.tan(Math.asin(Math.min(1, radius / dist))));
      // label: on screen, in front, not behind the Moon's limb; dimmed when the site's skyline hides it
      const screen = mesh.position.clone().project(camera);
      const camToCentre = camera.position.clone().negate(), along = camToCentre.dot(dir);
      const behindMoon = along > 0 && camToCentre.lengthSq() - along * along < R_KM * R_KM;
      const show = screen.z < 1 && Math.abs(screen.x) <= 1 && Math.abs(screen.y) <= 1 && !behindMoon;
      node.hidden = !show;
      if (show) {
        node.textContent = name === 'sun' ? 'Sun' : 'Earth';
        node.style.left = `${(screen.x + 1) * w / 2}px`; node.style.top = `${(1 - screen.y) * h / 2}px`;
      }
    }
    sky.bar.hidden = !selection || !core;
  }
  /** Why a body can't be seen from the selected site right now, or null if it can. */
  function outOfSight(name) {
    if (!selection || !core) return null;
    const { el } = core.at(selection.lat, selection.lon, utc)[name];
    if (el <= 0) return 'below the horizon';
    return horizonBlocked(name) ? 'behind the terrain' : null;
  }
  function showSkyNote(text) {
    if (!sky) return;
    sky.note.textContent = text; sky.note.hidden = false;
    clearTimeout(skyNoteTimer); skyNoteTimer = setTimeout(() => { if (sky) sky.note.hidden = true; }, 5000);
  }
  /** While facing a body, time moved on and it left the sky: say so. The camera stays where it is. */
  function checkLookingAt() {
    if (!lookingAt) return;
    const why = outOfSight(lookingAt);
    if (why) {
      showSkyNote(`${lookingAt === 'sun' ? 'The Sun' : 'Earth'} has gone ${why} here.`);
      lookingAt = null;
    }
  }
  /** Swing the camera to face the Sun or Earth over the selected site's skyline. */
  function lookAt(name) {
    if (!selection || !core || disposed) return;
    const why = outOfSight(name);
    if (why) {
      // message only: the camera keeps its angle (user request)
      showSkyNote(`${name === 'sun' ? 'The Sun is' : 'Earth is'} not in sight from this area right now: it is ${why}.`);
      return Promise.resolve();
    }
    const P = bodyRender(name); if (!P) return;
    lookingAt = name;
    cancelFlight(); clearControlInertia();
    const site = new T.Vector3(...locationToRender(selection.lat, selection.lon, heightAt(selection.lat, selection.lon)));
    const up = site.clone().normalize(), v = P.clone().sub(site).normalize();
    let hzn = v.clone().addScaledVector(up, -v.dot(up)); if (hzn.lengthSq() < 1e-8) hzn = new T.Vector3(1, 0, 0); hzn.normalize();
    // stand 20 km back from the site, 4 km up, and aim straight at the body: it sits in the middle of
    // the view, and for a low (polar) Sun or Earth the site and its skyline fill the lower half
    const position = site.clone().addScaledVector(hzn, -20).addScaledVector(up, 4);
    const target = position.clone().addScaledVector(v, 30);
    const matrix = new T.Matrix4().lookAt(position, target, up);
    controls.enabled = false;
    const done = new Promise(resolve => {
      flight = { start: performance.now(), duration: reduced.matches ? 0.001 : 900, fromPosition: camera.position.clone(), position,
        fromTarget: controls.target.clone(), target, fromQ: camera.quaternion.clone(),
        toQ: new T.Quaternion().setFromRotationMatrix(matrix), up, resolve };
      if (reduced.matches) { updateFlight(flight, camera, controls, flight.start + 1); finishFlight(); }
    });
    return done;
  }
  function overviewMaxDistance() {
    // A portrait canvas needs more distance to fit the whole disc. Keep the
    // Moon large in the narrower dimension instead of imposing a desktop cap.
    const halfAngle = Math.atan(Math.tan(camera.fov * Math.PI / 360) * Math.min(1, camera.aspect));
    return Math.min(camera.far - 2 * R_KM, Math.max(4 * R_KM, 1.25 * R_KM / Math.sin(halfAngle)));
  }
  function resize() {
    if (!renderer || disposed) return;
    const { width, height } = root.getBoundingClientRect(); if (!width || !height) return;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    if (controls && !selection) controls.maxDistance = overviewMaxDistance();
    needsRender = true;
  }
  const observer = new ResizeObserver(resize); observer.observe(root);
  function safety() {
    const location = renderToLocation(camera.position.toArray()), floor = R_KM + heightAt(location.lat, location.lon) / 1000 + 0.5;
    if (camera.position.length() < floor) camera.position.setLength(floor);
    cameraClearanceKm = camera.position.length() - floor + 0.5;
  }
  function finishFlight() {
    const complete = flight; flight = null;
    controls.enabled = true; controls.minDistance = 2; controls.maxDistance = 3 * R_KM;
    controls.update(); complete.resolve({ cancelled: false });
  }
  function animate(now) {
    raf = 0;
    if (disposed || failed || document.hidden) return;
    scheduleFrame();
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000); lastFrame = now;
    if (document.hidden || root.clientWidth === 0 || root.clientHeight === 0 || status.phase === 'context-lost') return;
    if (fade) { needsRender = true; const f = (now - fade.start) / FADE_MS; if (f >= 1) finishFade(); else setFade(Math.max(0, f)); }
    if (flight) {
      needsRender = true;
      if (updateFlight(flight, camera, controls, now)) {
        finishFlight();
      }
    } else controls.update(dt);
    // OrbitControls emits change while dragging, zooming, damping or rotating.
    // An idle scene (including a reduced-motion Moon) needs no GPU redraws.
    if (!needsRender && firstFrame) return;
    needsRender = false;
    safety(); updateSky(); renderer.render(scene, camera); markers.update(camera, root.clientWidth, root.clientHeight); lander.update(camera, root.clientWidth, root.clientHeight);
    if (!firstFrame) {
      firstFrame = true; root.classList.add('is-live');
      if (poster) posterTimer = setTimeout(() => { poster?.remove(); poster = null; }, reduced.matches ? 0 : 300);
    }
  }
  function scheduleFrame() {
    if (globe && !disposed && !failed && !document.hidden && !raf) raf = requestAnimationFrame(animate);
  }
  event(document, 'visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = performance.now(); cancelAnimationFrame(raf); raf = 0;
    } else {
      if (hiddenAt != null) {
        const pause = performance.now() - hiddenAt;
        if (flight) flight.start += pause;
        if (fade) fade.start += pause;
      }
      hiddenAt = null; lastFrame = 0; needsRender = true; scheduleFrame();
    }
  });
  function releaseGraphics() {
    controls?.dispose(); terrain?.dispose();
    const geometries = new Set(), materials = new Set(), textures = new Set();
    for (const m of [terrainMaterial, detailMaterial, finestMaterial]) if (m) materials.add(m);
    scene?.traverse(obj => { if (obj.geometry) geometries.add(obj.geometry);
      for (const mat of Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []) materials.add(mat); });
    for (const mat of materials) for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
    for(const texture of looseTextures)textures.add(texture);looseTextures.clear();
    if (overlay.uOverlay.value) textures.add(overlay.uOverlay.value);
    for (const resource of [...geometries, ...materials, ...textures]) resource.dispose();
    light?.shadow.dispose(); renderer?.dispose(); renderer?.forceContextLoss();
  }
  function dispose() {
    if (disposed) return; cancelFlight(); clearTimeout(skyNoteTimer); clearTimeout(posterTimer); disposed = true; abort.abort(); cancelAnimationFrame(raf); observer.disconnect();
    for (const remove of listeners) remove(); releaseGraphics();
    markers.dispose(); lander.dispose(); root.remove(); picks.clear(); statuses.clear();
  }
  async function flyTo(lat, lon) {
    checkAlive(); const location = validateLocation(lat, lon); start(); cancelFlight();
    const token = generation;
    try{await ready;}catch(error){if(disposed)return {cancelled:true};throw error;}
    if (disposed || token !== generation) return { cancelled: true };
    clearControlInertia(); selection = location; siteHorizon = null; lookingAt = null;
    core?.getHorizon?.(location.lat, location.lon).then(h => { if (selection === location) siteHorizon = h; }).catch(() => {});
    controls.autoRotate = false; controls.enabled = false;
    // M1: the flight starts immediately; nearby LOLA tiles load meanwhile and fade in (FADE_MS)
    // from 35 % of the flight, or as soon as they arrive if that is later.
    const near = Math.abs(location.lat) >= 84 || terrain?.regionAt(location.lat, location.lon) ? true : 'mid';
    const arrival = new Promise(resolve => {
      flight = { ...makeFlight(camera, controls, location.lat, location.lon, heightAt(location.lat, location.lon),
        near, 1800, performance.now()), resolve };
      if (reduced.matches) { updateFlight(flight, camera, controls, flight.start + flight.duration); finishFlight(); }
    });
    const fadeFrom = performance.now() + FADE_FROM * 1800;
    root.setAttribute('aria-busy', 'true');
    notify({ phase: 'loading-terrain', message: 'Loading nearby LOLA terrain…' });
    (async () => {
      await terrainReady;
      if (disposed || token !== generation) return;
      if (terrain) {
        try {
          extrasReady ||= terrain.initializeExtras();
          await extrasReady;
          if (disposed || token !== generation) return;
          await terrain.select(location.lat, location.lon);
          if (disposed || token !== generation) return;
          // Build the new detail transparent over a whole globe/overview; finishFade() cuts the holes.
          terrain.rebuild(terrainGroup, terrainMaterial, detailMaterial, { omit: false, finestMaterial });
          globe.setHoles(lat => capHoles(lat));
          setFade(0); fade = { start: Math.max(performance.now(), fadeFrom) };
          if (reduced.matches) finishFade();
          notify({ terrain: terrain.describe(location.lat, location.lon) });
        } catch (error) {
          if (disposed || token !== generation) return;
          terrain.records=[];terrain.kind=null;fade=null;setFade(1);
          terrain.rebuild(terrainGroup,terrainMaterial,detailMaterial,{finestMaterial});
          // Restore the whole globe before abandoning a patch: its previous
          // site's cutout must never survive a failed tile request.
          globe.refreshHeights((lat, lon) => terrain.heightAt(lat, lon), terrain.exaggeration);
          globe.setHoles(lat => capHoles(lat));
          notify({ terrain: 'overview-only', message: `Detail unavailable: ${error.message}. Using overview.` });
        }
      }
      updateLight();
      root.setAttribute('aria-busy', 'false');
      const kind = terrain?.records.length ? terrain.kind : null;
      notify({ phase: 'ready', message: status.terrain === 'overview-only' ? 'LOLA overview · detail unavailable · lower precision terrain'
        : terrain?.loadFailures?.length ? 'Some terrain tiles unavailable · coarser relief fills gaps · lower precision terrain'
        : status.terrain === 'LOLA-40m' ? 'LOLA 40 m terrain · Artemis site · rendered shadows are illustrative'
        : kind === 'south' ? 'LOLA south polar terrain · rendered shadows are illustrative'
        : kind === 'north' ? 'LOLA north polar terrain · rendered shadows are illustrative'
        : kind === 'global' && status.terrain === 'LOLA-120m' ? `LOLA 120 m terrain · ${terrain.regionAt(location.lat, location.lon)?.name || 'detailed region'} · rendered shadows are illustrative`
        : kind === 'global' ? 'LOLA 474 m terrain · lower precision horizon · rendered shadows are illustrative'
        : 'Global relief · lower precision terrain' });
    })().catch(error => console.error(error));
    return arrival;
  }
  function overview() {
    checkAlive(); start(); cancelFlight(); selection = null; siteHorizon = null; lookingAt = null; lander.clear(); needsRender = true;
    if (!camera) return;
    clearControlInertia();
    camera.up.set(0, 1, 0); camera.position.set(4600, 1200, 2900); controls.target.set(0, 0, 0);
    controls.minDistance = R_KM + 18; controls.maxDistance = overviewMaxDistance(); controls.update(); updateLight();
    notify({ phase: 'ready', message: 'Drag to rotate · scroll or pinch to zoom · click a location' });
  }
  const ready = (async () => {
    try {
      // M2: the landing Moon has no box: a transparent canvas lets the page's own starfield show
      // around it. The explorer stays opaque with its own stars (an opaque working surface).
      renderer = new T.WebGLRenderer({ antialias: true, alpha: presentation, premultipliedAlpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setClearColor('#141414', presentation ? 0 : 1);
      renderer.outputColorSpace = T.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false;
      renderer.domElement.setAttribute('aria-label', 'Interactive lunar globe. Drag to rotate, scroll or pinch to zoom.');
      renderer.domElement.tabIndex = 0; root.prepend(renderer.domElement);
      scene = new T.Scene(); camera = new T.PerspectiveCamera(42, 1, 0.1, 25000); camera.position.set(4600, 1200, 2900);
      controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = false;
      controls.minDistance = R_KM + 18; controls.maxDistance = 4 * R_KM; controls.autoRotate = !started && !reduced.matches; controls.autoRotateSpeed = 1;
      controls.addEventListener('change', () => { needsRender = true; });
      controls.addEventListener('start', () => { cancelFlight(); start(); lookingAt = null; });
      event(reduced, 'change', () => {
        controls.autoRotate = !started && !reduced.matches;
        if (reduced.matches) {
          // Drop the intro's stored damping delta without moving the camera.
          // Otherwise it drifts for several frames after reduced motion is set.
          const position = camera.position.clone(), target = controls.target.clone();
          clearControlInertia(); camera.position.copy(position); controls.target.copy(target);
          controls.update();
        }
        if (reduced.matches && flight) {
          updateFlight(flight, camera, controls, flight.start + flight.duration);
          finishFlight();
        }
        if (reduced.matches && fade) finishFade();
        needsRender = true;
      });
      light = new T.DirectionalLight('#ECE9E2', 3.2); light.shadow.mapSize.set(2048, 2048);
      light.shadow.bias = -0.00001; light.shadow.normalBias = 0.035; scene.add(light, light.target);
      scene.add(new T.AmbientLight('#ECE9E2', 0.035));
      if (!presentation) { stars = createStars(); scene.add(stars); sky = createSky(); }
      terrainGroup = new T.Group(); scene.add(terrainGroup);
      terrainMaterial = new T.MeshStandardMaterial({ color: '#9A978F', roughness: 1, metalness: 0 });
      detailMaterial = terrainMaterial.clone();
      Object.assign(detailMaterial, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      finestMaterial = terrainMaterial.clone();      // 40 m Artemis tiles win over the 120 m strip beneath
      Object.assign(finestMaterial, { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      for (const m of [terrainMaterial, detailMaterial, finestMaterial]) withOverlay(m);
      const loader = new T.TextureLoader();
      const texturePromise = loader.loadAsync(asset('moon-color-2k.jpg').href).then(texture => {
        if(disposed||failed){texture.dispose();return texture;}
        looseTextures.add(texture); texture.colorSpace = T.SRGBColorSpace; texture.wrapS = T.RepeatWrapping;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return texture;
      });
      const corePromise = Promise.resolve(options.core || loadCore(dataBase.href.replace(/\/$/, ''))).then(value => {
        if(!value || typeof value.sunDirection!=='function')throw new TypeError('core must provide sunDirection(time).');
        if(!disposed&&!failed)core = value;
      })
        .catch(error => { if(!failed)notify({ lighting: 'fixed-development', message: `Development lighting — fixed Sun. ${error.message}` }); });
      const terrainCandidate = new Terrain(dataBase, abort.signal);
      const terrainPromise = terrainCandidate.initialize().then(value => {
        if(disposed||failed){value.dispose();return null;} return value;
      })
        .catch(error => { terrainCandidate.dispose(); if(!failed)notify({ terrain: 'unavailable', message: `LOLA tiles unavailable: ${error.message}` }); return null; });
      const [texture, relief] = await Promise.all([texturePromise,
        fetchOK(asset('moon-displacement.tiff'), abort.signal).then(r => r.arrayBuffer()).then(decodeMoonTIFF), corePromise]);
      if (disposed) { for (const texture of looseTextures) texture.dispose(); terrainPromise.then(t => t?.dispose()); return; }
      globe = createGlobe(texture, relief, null); looseTextures.clear(); scene.add(globe.mesh);
      // LOLA cap terrain streams in after the first frame instead of delaying it.
      terrainReady = terrainPromise.then(value => {
        if (!value || disposed) return null;
        terrain = value; terrain.exaggeration = status.exaggeration;
        globe.refreshHeights((lat, lon) => terrain.heightAt(lat, lon), terrain.exaggeration);
        terrain.rebuild(terrainGroup, terrainMaterial, detailMaterial, { finestMaterial }); globe.setHoles(lat => capHoles(lat));
        renderer.shadowMap.needsUpdate = true;
        if (status.terrain === 'loading') notify({ terrain: 'LOLA-overview-480m' });
        if (!presentation) extrasReady ||= terrain.initializeExtras();
        return terrain;
      });
      if (!started && core) {
        camera.position.copy(sunlitCameraPosition(core.sunDirection(utc), camera.position.length()));
        const rotating = controls.autoRotate;
        controls.autoRotate = false; controls.update(); controls.autoRotate = rotating;
      }
      updateLight(); resize();
      const canvas = renderer.domElement, active = new Set();
      event(canvas, 'pointerdown', e => {
        active.add(e.pointerId); if (active.size > 1) pendingPick = null;
        else if (e.button === 0) pendingPick = { id: e.pointerId, x: e.clientX, y: e.clientY, distance: 0 };
      });
      event(canvas, 'pointermove', e => { if (pendingPick?.id === e.pointerId) pendingPick.distance = Math.max(pendingPick.distance,
        Math.hypot(e.clientX - pendingPick.x, e.clientY - pendingPick.y)); });
      event(canvas, 'pointerup', e => {
        const pick = pendingPick; pendingPick = null; active.delete(e.pointerId);
        if (!pick || pick.id !== e.pointerId || pick.distance > 5 || active.size || e.button !== 0) return;
        const rect = canvas.getBoundingClientRect(); pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects([globe.mesh, ...terrainGroup.children], false)[0];
        if (!hit) return; const { lat, lon } = renderToLocation(hit.point.toArray());
        for (const callback of picks) { try { callback(lat, lon); } catch (error) { console.error(error); } }
      });
      event(canvas, 'pointercancel', e => { active.delete(e.pointerId); pendingPick = null; });
      event(canvas, 'wheel', () => { pendingPick = null; }, { passive: true });
      event(canvas, 'webglcontextlost', e => { e.preventDefault(); notify({ phase: 'context-lost', message: 'Graphics context lost. Waiting for recovery…' }); });
      event(canvas, 'webglcontextrestored', () => { notify({ phase: 'ready', message: 'Graphics restored.' }); resize(); updateLight(); });
      startButton.disabled = false; startButton.hidden = started;
      notify({ phase: 'ready', message: core
        ? 'Drag to rotate · scroll or pinch to zoom · click a location'
        : 'Development lighting — fixed Sun; ephemeris unavailable' });
      scheduleFrame();
    } catch (error) {
      if (!disposed) {
        failed=true;abort.abort();observer.disconnect();cancelAnimationFrame(raf);raf=0;
        for (const remove of listeners) remove();
        releaseGraphics();
        startButton.hidden=true;
        notify({ phase: 'error', message: `Viewer unavailable: ${error.message}` }); throw error;
      }
    }
  })();
  // Keep an unobserved initialization failure from becoming an unhandled rejection.
  ready.catch(() => {});
  event(startButton, 'click', start);
  return { ready, start, flyTo, setTime, overview, dispose,
    addMarker(id, lat, lon, label) { checkAlive(); markers.add(id, lat, lon, label); needsRender = true; },
    /**
     * P9 · drape an image or canvas over the south polar terrain (e.g. the heat map).
     * Image row 0 = max y; it covers x0_km … x0_km + width, y0_km … y0_km + height on the south polar
     * stereographic map (same projection as data/terrain and data/heatmap). size_km: number or [w, h].
     */
    setOverlay(image, { projection = 'polar_stereographic_south', x0_km, y0_km, size_km, opacity = 0.6 } = {}) {
      checkAlive();
      if (projection !== 'polar_stereographic_south') throw new RangeError('Only the south polar overlay is supported.');
      const [w, h] = Array.isArray(size_km) ? size_km : [size_km, size_km];
      if (![x0_km, y0_km, w, h, opacity].every(Number.isFinite) || w <= 0 || h <= 0) throw new TypeError('setOverlay needs x0_km, y0_km, size_km.');
      const old = overlay.uOverlay.value;
      const texture = new T.Texture(image); texture.colorSpace = T.SRGBColorSpace; texture.needsUpdate = true;
      texture.minFilter = T.LinearFilter; texture.magFilter = T.LinearFilter; texture.generateMipmaps = false;
      overlay.uOverlay.value = texture; overlay.uOverlayRect.value.set(x0_km, y0_km, w, h);
      overlay.uOverlayOpacity.value = Math.max(0, Math.min(1, opacity)); overlay.uOverlayOn.value = 1;
      needsRender = true;
      if (old && old !== texture) old.dispose();
    },
    /** Swing the camera to face 'sun' or 'earth' over the selected site's skyline. */
    lookAt(body) { checkAlive(); if (body !== 'sun' && body !== 'earth') throw new RangeError("lookAt('sun' | 'earth')"); return lookAt(body); },
    clearOverlay() {
      checkAlive(); overlay.uOverlayOn.value = 0;
      overlay.uOverlay.value?.dispose(); overlay.uOverlay.value = null;
      needsRender = true;
    },
    removeMarker(id) { checkAlive(); return markers.remove(id); },
    /** S16 · show the lander glyph on the selected spot (one at a time; a new spot moves it). */
    showLander(lat, lon, label = '') { checkAlive(); lander.show(lat, lon, label); needsRender = true; },
    clearLander() { checkAlive(); lander.clear(); needsRender = true; },
    setActiveMarker(id) { checkAlive(); markers.setActive(id); needsRender = true; },
    onPick(callback) { checkAlive(); if (typeof callback !== 'function') throw new TypeError('onPick needs a function.'); picks.add(callback); return () => picks.delete(callback); },
    onStatus(callback) { checkAlive(); if (typeof callback !== 'function') throw new TypeError('onStatus needs a function.'); statuses.add(callback); callback({ ...status }); return () => statuses.delete(callback); },
    getStatus() { return { ...status }; },
    getDiagnostics() { return { camera: camera?.position.toArray(), target: controls?.target.toArray(),
      sunDirection: core ? moonToRender(core.sunDirection(utc)) : null, selected: selection ? { ...selection } : null, lander: lander.diagnostics(),
      lightDirection: light?.position.clone().sub(light.target.position).normalize().toArray(),
      shadows: light ? { enabled: light.castShadow, mapSize: light.shadow.mapSize.toArray(),
        extentKm: light.shadow.camera.right, nearKm: light.shadow.camera.near, farKm: light.shadow.camera.far } : null,
      flying: !!flight, flightDurationMs: flight?.duration || 0, renderFrames: renderer?.info.render.frame || 0,
      fading: !!fade, pendingFrame: !!raf, dpr: renderer?.getPixelRatio(), cameraClearanceKm,
      zoomLimits: controls ? { minKm: controls.minDistance, maxKm: controls.maxDistance } : null,
      terrainTiles: terrain?.records.map(t => t.meta.id) || [], terrainLoadFailures: [...(terrain?.loadFailures || [])],
      globeTriangles: (globe?.mesh.geometry.index.count || 0) / 3,
      disposed, markers: markers.diagnostics(), terrainMeshes: terrainGroup?.children.length || 0, memory: renderer ? { ...renderer.info.memory } : null }; },
    setVerticalExaggeration(value) {
      checkAlive(); if (![1, 1.25, 1.5].includes(value)) throw new RangeError('Use exaggeration 1, 1.25, or 1.5.');
      if (terrain) {
        const oldCentre=selection?new T.Vector3(...locationToRender(selection.lat,selection.lon,heightAt(selection.lat,selection.lon))):null;
        terrain.exaggeration = value; if (fade) finishFade(); terrain.rebuild(terrainGroup, terrainMaterial, detailMaterial, { finestMaterial });
        globe?.refreshHeights((lat, lon) => terrain.heightAt(lat, lon), value);
        if(oldCentre){
          const shift=new T.Vector3(...locationToRender(selection.lat,selection.lon,heightAt(selection.lat,selection.lon))).sub(oldCentre);
          controls.target.add(shift);camera.position.add(shift);
          if(flight){flight.target.add(shift);flight.position.add(shift);flight.fromTarget.add(shift);flight.fromPosition.add(shift);}
        }
        updateLight();
      }
      notify({ exaggeration: value });
    }
  };
}
