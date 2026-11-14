// Rank the core's existing windows. Ends are exclusive; returned indices are absolute.
export function bestWindows(result, n = 3) {
  const offset = result.start_index;
  const absolute = w => ({ start: w.start + offset, end: w.end + offset, hours: w.hours });
  const noEarth = !result.comms.some(Boolean);
  const neverSunlit = !result.power.some(Boolean);
  const kind = noEarth ? 'power' : 'both';
  const ranked = [...result.windows[kind]]
    .sort((a, b) => b.hours - a.hours || a.start - b.start)
    .slice(0, n).map(absolute);

  // Find the dates of the longest blackout; its length comes from the core summary.
  const hours = result.summary.longest_dark_hours;
  let run = 0, blackout = null;
  if (hours) for (let i = 0; i < result.power.length; i++) {
    run = result.power[i] ? 0 : run + 1;
    if (run === hours) { blackout = absolute({ start: i + 1 - hours, end: i + 1, hours }); break; }
  }
  return { ranked, blackout, kind, noEarth, neverSunlit };
}

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export function utcDateLabel(date, exact = false) {
  const d = new Date(date);
  return dayFormat.format(d) + (exact ? ` ${d.toISOString().slice(11, 16)} UTC` : '');
}

export function windowLabel(window, timeOf, exact = false) {
  return `${utcDateLabel(timeOf(window.start), exact)} – ${utcDateLabel(timeOf(window.end), exact)}, ${(window.hours / 24).toFixed(1)} days`;
}

export function windowsCsv(summary, timeOf) {
  return ['rank,kind,start_utc,end_utc_exclusive,hours,days', ...summary.ranked.map((w, i) =>
    `${i + 1},${summary.kind === 'both' ? 'sunlight_and_earth' : 'sunlight_only'},${new Date(timeOf(w.start)).toISOString()},${new Date(timeOf(w.end)).toISOString()},${w.hours},${(w.hours / 24).toFixed(1)}`
  )].join('\n') + '\n';
}
