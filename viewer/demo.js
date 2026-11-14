import { createViewer } from './index.js';
const $ = id => document.getElementById(id);
const viewer = createViewer($('moon'));
// Exposed by this demonstration only, for the browser smoke test and inspection.
window.fhlsDemo = viewer;
let request = 0;
function showError(error) { $('notice').textContent = error.message; }
async function select(lat, lon) {
  const token = ++request;
  $('latitude').value = lat.toFixed(5); $('longitude').value = lon.toFixed(5);
  $('selection').textContent = `${lat.toFixed(4)}° · ${lon.toFixed(4)}°E`;
  try { const result = await viewer.flyTo(lat, lon); if (token === request && !result.cancelled) $('notice').textContent = 'Location reached. Drag to inspect the relief.'; }
  catch (error) { showError(error); }
}
viewer.onPick(select);
viewer.onStatus(status => {
  $('lighting').textContent = status.lighting === 'ephemeris' ? `Real ephemeris · ${status.time.slice(0, 16).replace('T', ' ')} UTC`
    : status.lighting === 'fixed-development' ? 'Development lighting — fixed Sun' : status.lighting;
  $('precision').textContent = status.terrain === 'LOLA-120m' ? 'LOLA · 120 m sampling'
    : status.terrain === 'global-lower-precision' ? 'Lower precision · global relief'
      : status.terrain === 'LOLA-overview-480m' ? 'LOLA · 480 m overview' : status.terrain;
  $('notice').textContent = status.message;
});
viewer.ready.then(() => { for (const id of ['fly', 'shackleton', 'overview']) $(id).disabled = false; }).catch(showError);
$('location-form').addEventListener('submit', e => { e.preventDefault(); select(Number($('latitude').value), Number($('longitude').value)); });
$('shackleton').addEventListener('click', () => select(-89.45, -137.3));
$('overview').addEventListener('click', () => { ++request; viewer.overview(); $('selection').textContent = 'No point selected'; });
$('time').addEventListener('change', () => { try { $('time').value = viewer.setTime(`${$('time').value}:00Z`).slice(0, 16); } catch (error) { showError(error); } });
$('exaggeration').addEventListener('change', () => viewer.setVerticalExaggeration(Number($('exaggeration').value)));
window.addEventListener('pagehide', () => viewer.dispose(), { once: true });
