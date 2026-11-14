// UTC input validation only. The core still maps dates to its hourly table.
export function parseUtcFields(day, hour) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:00$/.test(hour)) return null;
  const iso = `${day}T${hour}:00.000Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && new Date(ms).toISOString() === iso ? ms : null;
}

export function sliderHour(key, shift, current, last) {
  const step = shift ? 24 : 1;
  const next = { ArrowLeft: current - step, ArrowRight: current + step, Home: 0, End: last }[key];
  return next === undefined ? null : Math.max(0, Math.min(last, next));
}
