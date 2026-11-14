// S21: real hourly data, all modes, UTC inputs, panorama and viewer lighting.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.FHLS_PLAYWRIGHT || 'playwright');
const base = process.env.FHLS_TEST_URL || 'http://127.0.0.1:8765';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [], bad = [], external = [];
const p = await browser.newPage({ viewport: { width: 1280, height: 850 }, reducedMotion: 'reduce', timezoneId: 'Pacific/Honolulu', colorScheme: 'dark' });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
p.on('response', r => { if (r.status() >= 400) bad.push(r.url()); });
await p.route('**/*', r => { const url = r.request().url(); if (url.startsWith(base) || /^(blob|data):/.test(url)) return r.continue(); external.push(url); return r.abort(); });
async function check(iso) {
  const actual = await p.evaluate(() => ({
    iso: FHLS.core.timeOf(FHLS.state.hour).toISOString(), range: +document.getElementById('time-slider').value,
    hour: FHLS.state.hour, pano: +document.getElementById('pano-hour').value,
    date: document.getElementById('exact-date').value, time: document.getElementById('exact-hour').value,
    header: document.getElementById('date').value, light: FHLS.viewer.getStatus().time,
    marker: parseFloat(document.getElementById('time-marker').style.left),
  }));
  assert.equal(actual.iso, iso);
  assert.equal(actual.range, actual.hour); assert.equal(actual.pano, actual.hour);
  assert.equal(actual.date, iso.slice(0, 10)); assert.equal(actual.header, actual.date); assert.equal(actual.time, iso.slice(11, 16));
  assert.equal(new Date(actual.light).toISOString(), iso);
  assert.ok(Math.abs(actual.marker - actual.hour / 17543 * 100) < .01);
}
try {
  await p.goto(base + '/web/'); await p.locator('#fhls-loading').waitFor({ state: 'detached' }); await p.evaluate(() => FHLS.ready);
  await p.locator('#start').click(); await p.locator('.mode[data-mode=intermediate]').click();
  await p.evaluate(() => FHLS.viewer.ready); await p.evaluate(() => FHLS.setSite(0, 0, 'Equator'));
  for (const mode of ['beginner', 'intermediate', 'advanced']) {
    await p.evaluate(m => FHLS.setMode(m), mode);
    await p.locator('#exact-date').fill('2028-02-29'); await p.locator('#exact-hour').fill('06:00'); await p.locator('#exact-hour').press('Enter');
    await check('2028-02-29T06:00:00.000Z');
    await p.locator('[data-time-step="24"]').click(); await check('2028-03-01T06:00:00.000Z');
    await p.locator('[data-time-step="-24"]').click(); await p.locator('[data-time-step="1"]').click();
    await p.locator('[data-time-step="-1"]').click(); await check('2028-02-29T06:00:00.000Z');
  }
  await p.locator('#exact-hour').fill('08:00'); await p.locator('#exact-hour').blur(); await check('2028-02-29T08:00:00.000Z');
  await p.locator('#exact-hour').fill('08:30'); await p.locator('#exact-hour').press('Enter');
  assert.match(await p.locator('#time-hint').innerText(), /whole UTC hour/);
  await p.locator('#exact-hour').fill('08:00'); await p.locator('#exact-hour').press('Enter');
  await p.locator('#exact-date').fill('2026-12-31'); await p.locator('#exact-date').press('Enter');
  await check('2027-01-01T00:00:00.000Z'); assert.match(await p.locator('#time-hint').innerText(), /Limited to/);
  await p.locator('#exact-date').fill('2029-01-01'); await p.locator('#exact-date').press('Enter');
  await check('2028-12-31T23:00:00.000Z'); assert.match(await p.locator('#time-hint').innerText(), /Limited to/);
  await p.locator('#time-slider').press('Home'); await check('2027-01-01T00:00:00.000Z');
  await p.locator('#time-slider').press('ArrowRight'); await check('2027-01-01T01:00:00.000Z');
  await p.locator('#time-slider').press('Shift+ArrowRight'); await check('2027-01-02T01:00:00.000Z');
  await p.locator('#time-slider').press('Shift+ArrowLeft'); await check('2027-01-01T01:00:00.000Z');
  await p.locator('#time-slider').press('End'); await check('2028-12-31T23:00:00.000Z');
  // Independent panorama scrub still works; a main time change brings it back in sync.
  await p.locator('#pano-hour').evaluate(n => { n.value = '100'; n.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await p.evaluate(() => FHLS.state.hour), 17543);
  await p.locator('#time-reset').click(); await check('2027-01-01T00:00:00.000Z');
  await mkdir('/private/tmp/fhls-viewer-tests', { recursive: true });
  for (const width of [1280, 375]) for (const theme of ['light', 'dark']) {
    await p.setViewportSize({ width, height: 850 });
    if (await p.evaluate(() => document.documentElement.dataset.theme) !== theme) await p.locator('#theme-toggle').click();
    for (const mode of ['beginner','intermediate','advanced']) {
      await p.evaluate(m => { FHLS.setMode(m); document.getElementById('time-slider').dispatchEvent(new Event('input',{bubbles:true})); }, mode);
      await check('2027-01-01T00:00:00.000Z');
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,`${width} ${theme} ${mode} overflow`);
    }
    await p.locator('#exact-time').scrollIntoViewIfNeeded();
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width} ${theme} overflow`);
    // Touch targets on phones; the desktop row is compact (32 px) on purpose.
    if (width <= 600) for (const id of ['exact-date', 'exact-hour']) assert.ok((await p.locator('#' + id).boundingBox()).height >= 44);
    await p.screenshot({ path: `/private/tmp/fhls-viewer-tests/exact-time-${width}-${theme}.png` });
  }
  assert.deepEqual(errors, []); assert.deepEqual(bad, []); assert.deepEqual(external, []);
  console.log('PASS S21: exact UTC / leap day / steps / keyboard / bounds / independent panorama / lighting / three modes / phone + laptop / both themes / offline / zero errors');
} finally { await browser.close(); }
