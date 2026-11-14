// S9 · Play / Pause for time (T3). Moves the app's hour forward so the Sun and Earth travel across the
// panorama (and the terrain lighting follows). Never starts by itself; under reduced motion it still
// plays only when asked, and scrubbing the timeline always works.
//
//   createTimePlayer(mountElement, { getHour, setHour, lastHour })
const SPEEDS = [["1 h/s", 1], ["1 day/s", 24], ["1 week/s", 168]];
const STEP_MS = 66;                   // ≈ 15 updates per second keeps the panels responsive

const CSS = `.time-player{display:flex;gap:10px;align-items:center}
.time-play{min-width:56px}.time-play[aria-pressed="true"]{color:var(--text)}
.time-speed{font:400 12px var(--mono,monospace);color:var(--text,#ECE9E2);background:var(--bg,#141414);border:1px solid var(--line,#2E2E2E);padding:3px 4px}
.time-speed:focus-visible{outline:2px solid var(--sun,#F2B33D);outline-offset:2px}`;

export function createTimePlayer(mount, { getHour, setHour, lastHour }) {
  if (!document.querySelector("style[data-time-player]")) {
    const st = document.createElement("style"); st.dataset.timePlayer = ""; st.textContent = CSS; document.head.append(st);
  }
  const wrap = document.createElement("div"); wrap.className = "time-player";
  const play = document.createElement("button"); play.type = "button"; play.className = "btn btn--quiet time-play";
  const speed = document.createElement("select"); speed.className = "time-speed"; speed.setAttribute("aria-label", "Playback speed");
  for (const [label, hps] of SPEEDS) { const o = document.createElement("option"); o.textContent = label; o.value = String(hps); speed.append(o); }
  speed.value = "24";
  wrap.append(play, speed); mount.append(wrap);
  let timer = 0, carry = 0, last = 0;
  const render = () => { play.textContent = timer ? "Pause" : "Play"; play.setAttribute("aria-pressed", String(!!timer)); };
  function stop() { clearInterval(timer); timer = 0; render(); }
  function tick() {
    if (!wrap.isConnected || !wrap.offsetParent) return stop();       // panel hidden / left the screen
    const now = performance.now(), dt = (now - last) / 1000; last = now;
    carry += dt * Number(speed.value);
    const step = Math.floor(carry); if (!step) return;
    carry -= step;
    const next = getHour() + step;
    setHour(Math.min(lastHour, next));
    if (next >= lastHour) stop();
  }
  play.addEventListener("click", () => {
    if (timer) return stop();
    if (getHour() >= lastHour) setHour(0);
    last = performance.now(); carry = 0; timer = setInterval(tick, STEP_MS); render();
  });
  render();
  return { stop, get playing() { return !!timer; } };
}
