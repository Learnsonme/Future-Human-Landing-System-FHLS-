// M13: saved choice overrides the live system preference. Storage may be unavailable.
const KEY = 'fhls.theme';
const SUN = '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>';
const MOON = '<path d="M19.5 15.5A8 8 0 0 1 8.5 4.5a8 8 0 1 0 11 11Z"/>';
export function createThemeToggle(host) {
  const system = matchMedia('(prefers-color-scheme: light)'), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let choice = null, timer = 0, placed = 0;
  const badges = new Set(), badgeResize = new ResizeObserver(() => queuePlace());
  try { const saved = localStorage.getItem(KEY); if (saved === 'light' || saved === 'dark') choice = saved; } catch { /* use system */ }
  const root = document.documentElement, button = document.createElement('button');
  button.type = 'button'; button.className = 'theme-toggle'; button.id = 'theme-toggle';
  host.append(button);
  function render() {
    const light = root.dataset.theme === 'light', label = light ? 'Dark mode' : 'Light mode';
    button.title = label; button.setAttribute('aria-label', `Switch to ${label.toLowerCase()}`);
    button.innerHTML = `<span class="theme-toggle-face"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${light ? MOON : SUN}</svg></span>`;
  }
  function apply() {
    const next = choice || (system.matches ? 'light' : 'dark');
    if (root.dataset.theme !== next) {
      if (!reduced.matches) {
        window.dispatchEvent(new Event('fhls:themebeforechange'));
        root.classList.add('is-changing-theme');
        clearTimeout(timer); timer = setTimeout(() => root.classList.remove('is-changing-theme'), 350);
      }
      root.dataset.theme = next;
      window.dispatchEvent(new CustomEvent('fhls:themechange', { detail: { theme: next } }));
    }
    render();
  }
  button.addEventListener('click', () => {
    choice = root.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(KEY, choice); } catch { /* keep the choice for this visit */ }
    apply();
  });
  system.addEventListener('change', () => { if (!choice) apply(); });
  reduced.addEventListener('change', () => {
    if (reduced.matches) { clearTimeout(timer); root.classList.remove('is-changing-theme'); }
  });
  function place() {
    placed = 0; let bottom = document.fullscreenElement || document.querySelector('.stage.is-fullscreen') ? 100 : 16;
    const left = innerWidth - 60;
    const current = new Set(document.querySelectorAll('#netlify-badge,.netlify-badge,[data-netlify-badge],iframe[title*="Netlify"]'));
    for (const old of badges) if (!current.has(old)) { badgeResize.unobserve(old); badges.delete(old); }
    for (const badge of current) {
      if (!badges.has(badge)) { badges.add(badge); badgeResize.observe(badge); }
      const r = badge.getBoundingClientRect();
      if (r.width && r.height && r.right > left && r.left < innerWidth && r.bottom > innerHeight - 80 && r.top < innerHeight) bottom = Math.max(bottom, innerHeight - r.top + 12);
    }
    button.style.bottom = `${bottom}px`;
  }
  const queuePlace = () => { if (!placed) placed = requestAnimationFrame(place); };
  new MutationObserver(queuePlace).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', queuePlace);
  document.addEventListener('fullscreenchange', () => {
    (document.fullscreenElement || host).append(button); queuePlace();
  });
  apply(); queuePlace(); return button;
}
