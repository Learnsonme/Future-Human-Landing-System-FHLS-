import * as T from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { loadCore } from '../core/fhls-core.js';
import { R_KM, moonToRender, locationToRender, renderToLocation, validateLocation, parseTime } from './coordinates.js';
import { createGlobe, createStars, decodeMoonTIFF } from './globe.js';
import { Terrain, fetchOK } from './terrain.js';
import { makeFlight, updateFlight } from './navigation.js';

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
  let renderer, camera, controls, scene, light, globe, terrain, terrainGroup, terrainMaterial, stars, core;
  let disposed = false, failed = false, started = options.presentation === false, flight = null, raf = 0, lastFrame = 0;
  let selection = null, generation = 0, pendingPick;
  let status = { phase: 'loading', message: 'Loading lunar imagery and ephemeris…', time: utc, lighting: 'loading', terrain: 'loading', synthetic: true, exaggeration: 1 };
  const picks = new Set(), statuses = new Set(), listeners = [], abort = new AbortController();
  const looseTextures = new Set();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const raycaster = new T.Raycaster(), pointer = new T.Vector2();
  const event = (node, type, fn, opts) => { node.addEventListener(type, fn, opts); listeners.push(() => node.removeEventListener(type, fn, opts)); };
  function notify(patch) {
    if (disposed) return;
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
    if (flight) { flight.resolve({ cancelled: true }); flight = null; if (controls) controls.enabled = true; }
  }
  function clearControlInertia() {
    // OrbitControls keeps private damping deltas after a drag. Flush them before
    // assigning a camera pose so a reset or completed flight stays at that pose.
    const damping = controls.enableDamping;
    controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
  }
  function heightAt(lat, lon) { return (terrain?.heightAt(lat, lon) ?? globe?.heightAt(lat, lon) ?? 0) * (terrain?.exaggeration || 1); }
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
    const local = selection?.lat <= -84, extent = local ? 160 : 2100;
    Object.assign(light.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.1, far: local ? 2400 : 6000 });
    light.shadow.camera.updateProjectionMatrix(); light.castShadow = !!local; light.shadow.needsUpdate = true;
    renderer.shadowMap.needsUpdate = true;
    notify({ time: utc, lighting: core ? (core.synthetic ? 'synthetic' : 'ephemeris') : 'fixed-development' });
  }
  function setTime(value) { checkAlive(); utc = parseTime(value); notify({time:utc}); updateLight(); return utc; }
  function resize() {
    if (!renderer || disposed) return;
    const { width, height } = root.getBoundingClientRect(); if (!width || !height) return;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize); observer.observe(root);
  function safety() {
    const location = renderToLocation(camera.position.toArray()), floor = R_KM + heightAt(location.lat, location.lon) / 1000 + 0.5;
    if (camera.position.length() < floor) camera.position.setLength(floor);
  }
  function animate(now) {
    if (disposed) return; raf = requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000); lastFrame = now;
    if (document.hidden || root.clientWidth === 0 || root.clientHeight === 0 || status.phase === 'context-lost') return;
    if (flight) {
      if (updateFlight(flight, camera, controls, now)) {
        const complete = flight; flight = null; controls.enabled = true; controls.minDistance = 0.8; controls.maxDistance = 11000;
        controls.update(); complete.resolve({ cancelled: false });
      }
    } else controls.update(dt);
    safety(); renderer.render(scene, camera);
  }
  function releaseGraphics() {
    controls?.dispose(); terrain?.dispose();
    const geometries = new Set(), materials = new Set(), textures = new Set();
    if(terrainMaterial)materials.add(terrainMaterial);
    scene?.traverse(obj => { if (obj.geometry) geometries.add(obj.geometry);
      for (const mat of Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []) materials.add(mat); });
    for (const mat of materials) for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
    for(const texture of looseTextures)textures.add(texture);looseTextures.clear();
    for (const resource of [...geometries, ...materials, ...textures]) resource.dispose();
    light?.shadow.dispose(); renderer?.dispose(); renderer?.forceContextLoss();
  }
  function dispose() {
    if (disposed) return; cancelFlight(); disposed = true; abort.abort(); cancelAnimationFrame(raf); observer.disconnect();
    for (const remove of listeners) remove(); releaseGraphics();
    root.remove(); picks.clear(); statuses.clear();
  }
  async function flyTo(lat, lon) {
    checkAlive(); const location = validateLocation(lat, lon); start(); cancelFlight();
    const token = generation;
    try{await ready;}catch(error){if(disposed)return {cancelled:true};throw error;}
    if (disposed || token !== generation) return { cancelled: true };
    clearControlInertia(); selection = location;
    if (terrain) {
      notify({ phase: 'loading-terrain', message: 'Loading nearby LOLA terrain…' });
      try {
        await terrain.select(location.lat, location.lon);
        if (disposed || token !== generation) return { cancelled: true };
        terrain.rebuild(terrainGroup, terrainMaterial);
        notify({ terrain: location.lat <= -84 ? 'LOLA-120m' : 'global-lower-precision' });
      } catch (error) {
        if (disposed || token !== generation) return { cancelled: true };
        terrain.records=[];terrain.rebuild(terrainGroup,terrainMaterial);
        notify({ terrain: 'overview-only', message: `Detail unavailable: ${error.message}. Using overview.` });
      }
    }
    updateLight(); controls.autoRotate = false; controls.enabled = false;
    notify({ phase: 'ready', message: location.lat <= -84 && terrain
      ? status.terrain==='overview-only' ? 'LOLA overview · detail unavailable · lower precision terrain'
        : 'LOLA south polar terrain · rendered shadows are illustrative'
      : 'Global relief · lower precision terrain' });
    return new Promise(resolve => {
      flight = { ...makeFlight(camera, controls, location.lat, location.lon, heightAt(location.lat, location.lon),
        location.lat <= -84 && !!terrain, reduced.matches ? 1 : 1100, performance.now()), resolve };
    });
  }
  function overview() {
    checkAlive(); start(); cancelFlight(); selection = null;
    if (!camera) return;
    clearControlInertia();
    camera.up.set(0, 1, 0); camera.position.set(4600, 1200, 2900); controls.target.set(0, 0, 0);
    controls.minDistance = R_KM + 18; controls.maxDistance = 11000; controls.update(); updateLight();
    notify({ phase: 'ready', message: 'Drag to rotate · scroll or pinch to zoom · click a location' });
  }
  const ready = (async () => {
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setClearColor('#141414');
      renderer.outputColorSpace = T.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false;
      renderer.domElement.setAttribute('aria-label', 'Interactive lunar globe. Drag to rotate, scroll or pinch to zoom.');
      renderer.domElement.tabIndex = 0; root.prepend(renderer.domElement);
      scene = new T.Scene(); camera = new T.PerspectiveCamera(42, 1, 0.1, 25000); camera.position.set(4600, 1200, 2900);
      controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = false;
      controls.minDistance = R_KM + 18; controls.maxDistance = 11000; controls.autoRotate = !started && !reduced.matches; controls.autoRotateSpeed = 1;
      controls.addEventListener('start', () => { cancelFlight(); start(); });
      event(reduced, 'change', () => { controls.autoRotate = !started && !reduced.matches; });
      light = new T.DirectionalLight('#ECE9E2', 3.2); light.shadow.mapSize.set(2048, 2048);
      light.shadow.bias = -0.00001; light.shadow.normalBias = 0.035; scene.add(light, light.target);
      scene.add(new T.AmbientLight('#ECE9E2', 0.035)); stars = createStars(); scene.add(stars);
      terrainGroup = new T.Group(); scene.add(terrainGroup);
      terrainMaterial = new T.MeshStandardMaterial({ color: '#9A978F', roughness: 1, metalness: 0 });
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
        if(disposed||failed)value.dispose();else {terrain = value;terrain.exaggeration=status.exaggeration;}
      })
        .catch(error => { terrainCandidate.dispose(); if(!failed)notify({ terrain: 'unavailable', message: `LOLA tiles unavailable: ${error.message}` }); });
      const [texture, relief] = await Promise.all([texturePromise,
        fetchOK(asset('moon-displacement.tiff'), abort.signal).then(r => r.arrayBuffer()).then(decodeMoonTIFF), corePromise, terrainPromise]);
      if (disposed) { for (const texture of looseTextures) texture.dispose(); terrain?.dispose(); return; }
      globe = createGlobe(texture, relief, terrain); looseTextures.clear(); scene.add(globe.mesh);
      if (terrain) { terrain.rebuild(terrainGroup, terrainMaterial); globe.setPolarDetail(true); }
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
      notify({ phase: 'ready', terrain: terrain ? 'LOLA-overview-480m' : 'unavailable', message: core
        ? 'Drag to rotate · scroll or pinch to zoom · click a location'
        : 'Development lighting — fixed Sun; ephemeris unavailable' });
      raf = requestAnimationFrame(animate);
    } catch (error) {
      if (!disposed) {
        failed=true;abort.abort();observer.disconnect();releaseGraphics();
        startButton.hidden=true;
        notify({ phase: 'error', message: `Viewer unavailable: ${error.message}` }); throw error;
      }
    }
  })();
  // Keep an unobserved initialization failure from becoming an unhandled rejection.
  ready.catch(() => {});
  event(startButton, 'click', start);
  return { ready, start, flyTo, setTime, overview, dispose,
    onPick(callback) { checkAlive(); if (typeof callback !== 'function') throw new TypeError('onPick needs a function.'); picks.add(callback); return () => picks.delete(callback); },
    onStatus(callback) { checkAlive(); if (typeof callback !== 'function') throw new TypeError('onStatus needs a function.'); statuses.add(callback); callback({ ...status }); return () => statuses.delete(callback); },
    getStatus() { return { ...status }; },
    getDiagnostics() { return { camera: camera?.position.toArray(), target: controls?.target.toArray(),
      sunDirection: core ? moonToRender(core.sunDirection(utc)) : null, selected: selection ? { ...selection } : null,
      lightDirection: light?.position.clone().sub(light.target.position).normalize().toArray(),
      shadows: light ? { enabled: light.castShadow, mapSize: light.shadow.mapSize.toArray(),
        extentKm: light.shadow.camera.right, nearKm: light.shadow.camera.near, farKm: light.shadow.camera.far } : null,
      flying: !!flight, terrainMeshes: terrainGroup?.children.length || 0, memory: renderer ? { ...renderer.info.memory } : null }; },
    setVerticalExaggeration(value) {
      checkAlive(); if (![1, 1.25, 1.5].includes(value)) throw new RangeError('Use exaggeration 1, 1.25, or 1.5.');
      if (terrain) {
        const oldCentre=selection?new T.Vector3(...locationToRender(selection.lat,selection.lon,heightAt(selection.lat,selection.lon))):null;
        terrain.exaggeration = value; terrain.rebuild(terrainGroup, terrainMaterial);
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
