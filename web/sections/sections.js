// S1–S8, S12 · Scroll-down sections below the landing screen (T3).
// Included once in web/index.html:   <script type="module" src="sections/sections.js"></script>
// It wraps the existing landing content in a full-screen .fs-hero (with a quiet "Scroll ↓" cue) and appends
// sections.html after it inside #screen-landing, so the sections scroll below the hero and disappear with
// the landing screen.
//
// S12/S22: set VIDEO (Beginner walkthrough) and VIDEO_PITCH (one-minute pitch) to their URLs: an .mp4/.webm file (plays muted
// with captions if CAPTIONS is set) or a YouTube link (embedded player, lazy-loaded). Empty = placeholder.
const VIDEO = "https://youtu.be/xXaZwpt-LBo";   // Beginner walkthrough (D3)
const VIDEO_PITCH = "";         // S22: the one-minute pitch video; empty = Moon poster + "Video coming soon"
const CAPTIONS = "";            // optional .vtt file for an .mp4/.webm video

const here = new URL("./", import.meta.url);

async function mount() {
  const landing = document.getElementById("screen-landing");
  if (!landing || landing.querySelector(".fhls-sections")) return;
  const css = document.createElement("link"); css.rel = "stylesheet"; css.href = new URL("sections.css" + new URL(import.meta.url).search, here).href;
  document.head.append(css);
  const html = await (await fetch(new URL("sections.html" + new URL(import.meta.url).search, here))).text();
  const tpl = document.createElement("template"); tpl.innerHTML = html;
  // relative URLs in the partial are written from web/, which is where index.html lives
  const hero = wrapHero(landing);
  landing.append(tpl.content);
  setupVideo(landing.querySelector('[data-video-slot="beginner"]'), VIDEO, "How to use FHLS · Beginner mode");
  setupVideo(landing.querySelector('[data-video-slot="pitch"]'), VIDEO_PITCH, "FHLS in a minute · NASA Space Apps 2026");
  fillTeamNames(landing);
  scrollCue(hero, landing.querySelector("#demo"));
  reveal(landing.querySelectorAll(".fs-reveal"));
}

// S12: the landing's own content becomes one full-screen block, so the first screen looks as before.
function wrapHero(landing) {
  const hero = document.createElement("div"); hero.className = "fs-hero";
  hero.append(...landing.childNodes);
  landing.append(hero);
  return hero;
}

// S12: quiet "Scroll ↓" at the bottom of the hero; fades away once the page is scrolled.
function scrollCue(hero, target) {
  if (!target) return;
  const cue = document.createElement("a"); cue.className = "fs-cue"; cue.href = "#demo";
  cue.innerHTML = 'Scroll <span aria-hidden="true">↓</span>';
  cue.addEventListener("click", (e) => {
    e.preventDefault();
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  });
  hero.append(cue);
  let queued = false;
  const update = () => { queued = false; cue.classList.toggle("is-gone", scrollY > 40); };
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

// S6/S12: the footer lists the same names as the Team block, so names are edited in one place.
function fillTeamNames(root) {
  const slot = root.querySelector("[data-team-names]");
  if (!slot) return;
  const names = [...root.querySelectorAll(".fs-team .fs-name")].map((n) => n.textContent.trim()).filter(Boolean);
  slot.textContent = names.length ? `Team: ${names.join(" · ")}` : "";
}

// S1: fade + rise once as each section enters the screen; instant under reduced motion.
function reveal(nodes) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    for (const n of nodes) n.classList.add("is-in"); return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
  for (const n of nodes) io.observe(n);
}

// S2/S12: placeholder now; the Beginner walkthrough later, muted with captions, no sound until the viewer asks.
function setupVideo(slot, url, title) {
  if (!slot || !url) return;
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(url);
  slot.querySelector(".fs-video-note")?.remove();
  if (yt) {
    // The YouTube player sits in the frame with its own poster and play button; lazy so it never slows the landing.
    const f = document.createElement("iframe");
    f.src = `https://www.youtube-nocookie.com/embed/${yt[1]}?cc_load_policy=1&rel=0`;
    f.title = title; f.loading = "lazy";
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.allowFullscreen = true;
    slot.replaceChildren(f);
    return;
  }
  // .mp4/.webm: muted, captions if set, no sound until the viewer asks.
  const play = document.createElement("button"); play.type = "button"; play.className = "fs-play"; play.textContent = "Play video";
  slot.append(play);
  play.addEventListener("click", () => {
    const v = document.createElement("video"); v.src = url; v.muted = true; v.controls = true; v.playsInline = true; v.autoplay = true;
    v.title = title;
    if (CAPTIONS && url === VIDEO) { const t = document.createElement("track"); t.kind = "captions"; t.srclang = "en"; t.label = "English"; t.src = CAPTIONS; t.default = true; v.append(t); }
    slot.replaceChildren(v);
  }, { once: true });
}

// Light mode: the FHLS wordmark switches to its ink version (design/logo/fhls-logo-ink.png, same size and
// placement), because the cream lettering disappears on paper. The Moon and lander are unchanged.
function syncWordmark() {
  const img = document.querySelector(".wordmark"); if (!img) return;
  const ink = document.documentElement.dataset.theme === "light";
  const want = new URL(`../design/logo/${ink ? "fhls-logo-ink.png" : "fhls-logo-transparent.png"}`, new URL("../", here)).href;
  if (img.src !== want) img.src = want;
}
new MutationObserver(syncWordmark).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
syncWordmark();

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
