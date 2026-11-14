/**
 * design/beginner.js · D1 · Beginner-mode wording + icons (T3). Pure functions, no DOM.
 * Rules: design/beginner.md. Colours: design/style.md tokens (icons use currentColor).
 *
 *   import { beginnerSummary, beginnerNow, ICONS } from "../design/beginner.js";
 *   const r = await core.analyze(lat, lon, { start, end });
 *   const b = beginnerSummary(r, { placeName: "Connecting Ridge", clickLat: lat, clickLon: lon });
 *   b.answers   → [{ key:"sun", icon:"sun", tone:"sun", question, answer, detail }, { key:"earth", … }]
 *   b.sentence  → one plain sentence for the whole spot
 *   b.notes     → small print: precision, computed-for point, the honesty line
 *   beginnerNow(r, k) → { sun: "…", earth: "…", tone } for hour k of the range (date slider)
 *
 * Never say "power" or "radio link" as a promise: we only know what is VISIBLE.
 */

// ───────────── thresholds (percent of hours in the selected range) ─────────────
const SUN_LEVELS = [
  { min: 70, answer: "Yes, most of the time", word: "most of the time",   tone: "sun" },
  { min: 40, answer: "About half the time",   word: "about half the time", tone: "sun" },
  { min: 15, answer: "Part of the time",      word: "part of the time",   tone: "sun" },
  { min: 1,  answer: "Rarely",                word: "rarely",             tone: "none" },
  { min: -1, answer: "No",                    word: "never",              tone: "none" },
];
const EARTH_LEVELS = [
  { min: 95, answer: "Yes, all the time",     word: "all the time",       tone: "earth" },
  { min: 60, answer: "Yes, most of the time", word: "most of the time",   tone: "earth" },
  { min: 40, answer: "About half the time",   word: "about half the time", tone: "earth" },
  { min: 5,  answer: "Part of the time",      word: "part of the time",   tone: "earth" },
  { min: -1, answer: "No",                    word: "never",              tone: "none" },
];
const level = (levels, pct) => levels.find((l) => pct >= l.min);

// ───────────── number phrasing ─────────────
/** 71.4 → "about 7 hours in every 10"; tiny/huge values get plain words. */
export function shareOfTime(pct) {
  if (pct <= 0) return "never";
  if (pct >= 99.5) return "all the time";
  if (pct < 5) return "less than 1 hour in every 20";
  const tenths = Math.round(pct / 10);
  if (tenths === 0) return "about 1 hour in every 20";
  if (tenths === 10) return "almost all the time";
  return `about ${tenths} hour${tenths === 1 ? "" : "s"} in every 10`;
}

/** 412 → "about 17 days"; 30 → "about 30 hours". */
export function duration(hours) {
  if (hours < 1) return "less than an hour";
  if (hours < 48) return `about ${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  if (days < 60) return `about ${days} days`;
  return `about ${Math.round(days / 30.4)} months`;
}

/** Great-circle distance in metres between two lat/lon points on the Moon. */
export function distanceM(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, R = 1737400;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const fmtDistance = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

// ───────────── the summary ─────────────
export function beginnerSummary(result, { placeName = null, clickLat = result.lat, clickLon = result.lon } = {}) {
  const s = result.summary;
  const sun = level(SUN_LEVELS, s.pct_sunlit);
  const earth = level(EARTH_LEVELS, s.pct_earth);
  const allTime = result.hours >= 17000;
  const when = allTime ? "in 2027–2028" : "in the dates you picked";

  const answers = [
    {
      key: "sun", icon: s.pct_sunlit >= 1 ? "sun" : "dark", tone: sun.tone,
      question: "Sunlight for solar panels?",
      answer: sun.answer,
      detail: s.pct_sunlit <= 0
        ? `The Sun never clears the terrain here ${when}.`
        : `Sunlit ${shareOfTime(s.pct_sunlit)}. Longest stretch in the dark: ${duration(s.longest_dark_hours)}.`,
    },
    {
      key: "earth", icon: "earth", tone: earth.tone,
      question: "Earth in view for direct contact?",
      answer: earth.answer,
      detail: s.pct_earth <= 0
        ? `Earth never rises above the terrain here ${when}.`
        : s.pct_earth >= 99.5
          ? "Earth is always above the horizon here."
          : `Earth in view ${shareOfTime(s.pct_earth)}. Longest stretch without it: ${duration(s.longest_no_comms_hours)}.`,
    },
  ];

  const where = placeName || "This spot";
  // Away from the poles the Sun simply rises and sets: ~2 weeks of day, ~2 weeks of night
  const normalDay = s.pct_sunlit >= 40 && s.pct_sunlit <= 60 &&
    s.longest_dark_hours >= 300 && s.longest_dark_hours <= 380;
  let sentence;
  if (normalDay) {
    const earthPart = s.pct_earth >= 99.5 ? "Earth is always in view."
      : s.pct_earth <= 0 ? "Earth is never in view from here, so messages would need a relay satellite."
      : `Earth is in view ${earth.word}.`;
    sentence = `${where} has the normal lunar day: about two weeks of sunlight, then about two weeks of night. ${earthPart}`;
  } else if (s.pct_sunlit <= 0 && s.pct_earth <= 0) {
    sentence = `${where} stays in shadow and out of Earth's view: a cold trap where ice may survive, but hard to work in.`;
  } else if (s.pct_sunlit <= 0) {
    sentence = `${where} never sees the Sun ${when}, so solar panels would not work here, though Earth is in view ${earth.word}.`;
  } else if (s.pct_earth <= 0) {
    sentence = `${where} gets sunlight ${sun.word} but never sees Earth, so messages would need a relay satellite.`;
  } else if (s.pct_both >= 50) {
    sentence = `${where} is a strong spot: Sun and Earth are both in view ${shareOfTime(s.pct_both)}.`;
  } else if (s.pct_both >= 20) {
    sentence = `${where} has Sun and Earth together ${shareOfTime(s.pct_both)}, so a mission would plan around the gaps.`;
  } else {
    sentence = `${where} rarely has Sun and Earth at the same time, so batteries and a relay would be needed.`;
  }
  if (!normalDay && s.pct_sunlit > 0 && s.longest_dark_hours >= 24 * 10) {
    sentence += ` Expect dark spells of ${duration(s.longest_dark_hours)}.`;
  }

  const notes = [];
  if (result.precision === "low") {
    notes.push({ icon: "approx", text: "Lower precision: terrain here is approximate (about 30 km detail). Sun and Earth positions are exact." });
  } else {
    const p = result.horizon && result.horizon.point;
    if (p) {
      const d = distanceM(clickLat, clickLon, p.lat, p.lon);
      if (d >= 20) notes.push({ icon: "terrain", text: `Worked out for a point ${fmtDistance(d)} from your click. Near the pole, sunlight can change within a few hundred metres.` });
    }
  }
  notes.push({ icon: null, text: "Sunlight and a view of Earth are what solar panels and direct radio need. They do not guarantee either." });

  return { answers, sentence, notes, tones: { sun: sun.tone, earth: earth.tone } };
}

// ───────────── "right now" (one hour, for the date slider) ─────────────
export function beginnerNow(result, k) {
  const f = result.sun_fraction[k];
  const sunEl = result.sun_el[k];
  let sun;
  if (f >= 0.999) sun = "The Sun is shining here.";
  else if (f > 0) sun = "The Sun is just peeking over the terrain.";
  else if (sunEl > -0.265) sun = "The Sun is up, but hills or a crater wall block it.";
  else sun = "The Sun is below the horizon.";

  const earthEl = result.earth_el[k];
  let earth;
  if (result.comms[k]) earth = "Earth is in view.";
  else if (earthEl > 0) earth = "Earth is up, but hidden behind the terrain.";
  else earth = "Earth is below the horizon.";

  const tone = result.power[k] && result.comms[k] ? "both" : result.power[k] ? "sun" : result.comms[k] ? "earth" : "none";
  return { sun, earth, tone };
}

// ───────────── short explainers (for an "i" / "Why?" link in Beginner) ─────────────
export const WHY = {
  sun_moves: "Near the pole the Sun never rises high. It circles low around the horizon once every 29.5 days, so hills block it from different sides through the month.",
  seasons: "The Moon is tilted only 1.5°, but that is enough to give mild seasons. Good months shift about 18 days earlier each year.",
  earth_bobs: "Earth stays in nearly the same place in the sky, but wobbles a little each month. Near the pole it can dip below the horizon for about two weeks.",
  shadow: "Some crater floors near the pole have not seen sunlight for billions of years. They are among the coldest places known and may hold ice.",
};

// ───────────── icons: 24×24, 1.5 px line, currentColor (set colour with CSS tokens) ─────────────
const svg = (body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${label}">${body}</svg>`;

export const ICONS = {
  // Sun: disc + 8 short rays
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>', "Sun"),
  // Earth: disc with a tilted orbit-like meridian and equator
  earth: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5s-1.3 6.1-3.9 8.5c-2.6-2.4-3.9-5.2-3.9-8.5s1.3-6.1 3.9-8.5z"/>', "Earth"),
  // Both: small sun top-left, small earth bottom-right
  both: svg('<circle cx="8" cy="8" r="2.6"/><path d="M8 2.5v1.3M8 12.2v1.3M2.5 8h1.3M12.2 8h1.3M4.1 4.1l.9.9M11 11l.9.9M4.1 11.9l.9-.9M11 5l.9-.9"/><circle cx="16" cy="16" r="5"/><path d="M11 16h10M16 11c1.4 1.4 2.1 3 2.1 5s-.7 3.6-2.1 5c-1.4-1.4-2.1-3-2.1-5s.7-3.6 2.1-5z"/>', "Sun and Earth"),
  // Dark: disc with a hatched shadow half (hatches end inside the circle)
  dark: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M12 6h5.2M12 9h7.2M12 12h7.7M12 15h7.2M12 18h5.2"/>', "No sunlight"),
  // Terrain: horizon line with a ridge silhouette
  terrain: svg('<path d="M2.5 18.5h19"/><path d="M2.5 18.5l5-7 3.5 4 4-7.5 6.5 10.5"/>', "Terrain"),
  // Approximate: dashed circle with a tilde
  approx: svg('<circle cx="12" cy="12" r="8.5" stroke-dasharray="2.2 2.2"/><path d="M7.5 12.8c1.2-1.6 2.4-1.6 3.6-.6s2.4 1 3.6-.6"/>', "Lower precision"),
};

/** CSS custom property for a tone: "sun" → "var(--sun)". */
export const toneColor = (tone) => `var(--${tone})`;
