// P1 (T1): a reusable ticker around the existing semantic definition list.
// Usage: mountStatsTicker(dl). destroy() restores the original list.
const mounted = new WeakMap();
export function mountStatsTicker(list) {
  if (mounted.has(list)) return mounted.get(list);
  const parent = list.parentElement, hadWrapClass = parent.classList.contains('stats-ticker-wrap');
  parent.classList.add('stats-ticker-wrap');
  const shell = document.createElement('div'); shell.className = 'stats-ticker';
  const controls = document.createElement('div'); controls.className = 'stats-ticker-controls';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn--quiet';
  button.textContent = 'Pause statistics'; button.setAttribute('aria-pressed', 'false'); controls.append(button);
  const viewport = document.createElement('div'); viewport.className = 'stats-ticker-viewport';
  viewport.tabIndex = 0; viewport.setAttribute('aria-label', 'Mission statistics. Motion pauses while focused.');
  const track = document.createElement('div'); track.className = 'stats-ticker-track';
  list.before(shell); shell.append(controls, viewport); viewport.append(track); track.append(list);
  let copy;
  const sync = () => {
    const next = list.cloneNode(true); next.setAttribute('aria-hidden', 'true'); next.inert = true;
    next.removeAttribute('id'); next.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    if (copy) copy.replaceWith(next); else track.append(next); copy = next;
  };
  sync();
  const mutations = new MutationObserver(sync); mutations.observe(list, { childList: true, subtree: true, characterData: true });
  const resize = new ResizeObserver(() => shell.style.setProperty('--stats-cycle', `${Math.max(960, viewport.clientWidth)}px`));
  resize.observe(viewport);
  const toggle = () => {
    const paused = shell.classList.toggle('is-paused');
    button.textContent = paused ? 'Resume statistics' : 'Pause statistics'; button.setAttribute('aria-pressed', String(paused));
  };
  button.addEventListener('click', toggle);
  const visibility = () => shell.classList.toggle('is-hidden-tab', document.hidden);
  document.addEventListener('visibilitychange', visibility); visibility();
  const result = { destroy() {
    mutations.disconnect(); resize.disconnect(); document.removeEventListener('visibilitychange', visibility);
    button.removeEventListener('click', toggle); shell.before(list); shell.remove(); mounted.delete(list);
    if (!hadWrapClass) parent.classList.remove('stats-ticker-wrap');
  } };
  mounted.set(list, result); return result;
}

if (!document.querySelector('link[data-stats-ticker]')) {
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('stats-ticker.css', import.meta.url);
  css.dataset.statsTicker = ''; document.head.append(css);
}
document.querySelectorAll('#screen-landing dl.strip').forEach(mountStatsTicker);
