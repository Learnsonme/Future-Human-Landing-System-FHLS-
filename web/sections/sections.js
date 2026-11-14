// S1–S8 · Scroll-down sections below the landing screen (T3).
// T2 includes this once in web/index.html:   <script type="module" src="sections/sections.js"></script>
// It appends sections.html to the end of #screen-landing, so the sections scroll below the hero and
// disappear with the landing screen.
//
// S2: when the demo video is ready, set VIDEO to its URL: an .mp4/.webm file (plays muted with captions
// if CAPTIONS is set) or a YouTube link (loads only after a click). Leave it empty for the placeholder.
const VIDEO = "";
const CAPTIONS = "";            // optional .vtt file for an .mp4/.webm video

const here = new URL("./", import.meta.url);

async function mount() {
  const landing = document.getElementById("screen-landing");
  if (!landing || landing.querySelector(".fhls-sections")) return;
  const css = document.createElement("link"); css.rel = "stylesheet"; css.href = new URL("sections.css", here).href;
  document.head.append(css);
  const html = await (await fetch(new URL("sections.html", here))).text();
  const tpl = document.createElement("template"); tpl.innerHTML = html;
  // relative URLs in the partial are written from web/, which is where index.html lives
  landing.append(tpl.content);
  setupVideo(landing.querySelector("[data-video-slot]"));
  reveal(landing.querySelectorAll(".fs-reveal"));
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

// S2: placeholder now; the real demo later, muted with captions, no sound until the viewer asks.
function setupVideo(slot) {
  if (!slot || !VIDEO) return;
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(VIDEO);
  slot.querySelector(".fs-video-note")?.remove();
  const play = document.createElement("button"); play.type = "button"; play.className = "fs-play"; play.textContent = "Play demo";
  slot.append(play);
  play.addEventListener("click", () => {
    slot.replaceChildren();
    if (yt) {
      const f = document.createElement("iframe");
      f.src = `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&mute=1&cc_load_policy=1&rel=0`;
      f.title = "FHLS demo video"; f.allow = "autoplay; encrypted-media; picture-in-picture"; f.allowFullscreen = true;
      slot.append(f);
    } else {
      const v = document.createElement("video"); v.src = VIDEO; v.muted = true; v.controls = true; v.playsInline = true; v.autoplay = true;
      if (CAPTIONS) { const t = document.createElement("track"); t.kind = "captions"; t.srclang = "en"; t.label = "English"; t.src = CAPTIONS; t.default = true; v.append(t); }
      slot.append(v);
    }
  }, { once: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
