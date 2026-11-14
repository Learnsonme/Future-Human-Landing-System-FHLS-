// M14: enter text once per screen/panel, never on hour/date/figure updates.
export function createTextEntrances() {
  const shown = new WeakMap(), nodesSeen = new WeakSet(), active = new Set();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const selector = 'h1,h2,h3,h4,p,label,dt,.mode-name,.mode-what';
  function enter(root, key = 'first') {
    if (!root || !root.getClientRects().length || root.closest('[inert]')) return;
    let keys = shown.get(root);
    if (!keys) { keys = new Set(); shown.set(root, keys); }
    if (keys.has(key)) return;
    keys.add(key);
    root.dataset.textEntrances = String(Number(root.dataset.textEntrances || 0) + 1);
    if (reduced.matches || !Element.prototype.animate) return;
    const candidates = [...root.querySelectorAll(selector)].filter(node =>
      node.getClientRects().length && !nodesSeen.has(node) &&
      !node.closest('.fhls-sections,.strip,.stats-ticker,.stage') &&
      !node.closest('[hidden]'));
    let index = 0;
    for (const node of candidates) {
      // Avoid nested opacity/transform effects on the same line.
      if (candidates.some(parent => parent !== node && parent.contains(node))) continue;
      nodesSeen.add(node);
      const rect = node.getBoundingClientRect(), from = rect.left + rect.width / 2 > innerWidth / 2 ? 6 : -6;
      const animation = node.animate([
        { opacity: 0, transform: `translateX(${from}px)` }, { opacity: 1, transform: 'translateX(0)' }
      ], { duration: 380, delay: Math.min(index++, 2) * 50, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'backwards' });
      animation.id = `fhls-text:${key}`; active.add(animation);
      animation.finished.then(() => active.delete(animation), () => active.delete(animation));
    }
  }
  const cancel = () => { for (const animation of active) animation.cancel(); active.clear(); };
  reduced.addEventListener('change', () => { if (reduced.matches) cancel(); });
  window.addEventListener('pagehide', cancel);
  return { enter };
}
