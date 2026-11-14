// S20: real core analyses, UI rankings, navigation, export, comparison and edge cases.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.FHLS_PLAYWRIGHT || 'playwright');
const base = process.env.FHLS_TEST_URL || 'http://127.0.0.1:8765';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', colorScheme: 'dark', acceptDownloads: true });
const errors = [], bad = [], external = [];
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
p.on('response', r => { if (r.status() >= 400) bad.push(r.url()); });
await p.route('**/*', r => { const u = r.request().url(); if (u.startsWith(base) || /^(blob|data):/.test(u)) return r.continue(); external.push(u); return r.abort(); });
async function mode(m) {
  await p.locator('#change-mode').click(); await p.locator(`.mode[data-mode=${m}]`).click();
  await p.waitForFunction(() => document.body.dataset.screen === 'app' && !document.getElementById('transition').classList.contains('is-running'));
  await p.evaluate(() => FHLS.viewer.ready);
}
async function select(lat, lon, name) {
  await p.evaluate(([la,lo,n]) => FHLS.setSite(la,lo,n), [lat,lon,name]);
  return p.evaluate(() => {
    const r = FHLS.state.result, kind = r.comms.some(Boolean) ? 'both' : 'power';
    return { kind, ranked: [...r.windows[kind]].sort((a,b) => b.hours-a.hours || a.start-b.start).slice(0,3), blackout:r.summary.longest_dark_hours };
  });
}
async function ranking(expected, count) {
  const buttons = p.locator('#best-dates .best-window');
  assert.equal(await buttons.count(), count);
  for (let i=0; i<count; i++) {
    const w=expected.ranked[i]; assert.ok((await buttons.nth(i).innerText()).includes(`${(w.hours/24).toFixed(1)} days`));
    await buttons.nth(i).click();
    assert.deepEqual(await p.evaluate(() => ({h:FHLS.state.hour,p:+document.getElementById('pano-hour').value,s:+document.getElementById('time-slider').value})), {h:w.start,p:w.start,s:w.start});
    assert.equal(await buttons.nth(i).evaluate(n => n === document.activeElement), true, 'jump must preserve focus');
  }
}
try {
  await p.goto(base+'/web/'); await p.locator('#fhls-loading').waitFor({state:'detached'}); await p.evaluate(() => FHLS.ready);
  await p.locator('#start').click(); await p.locator('.mode[data-mode=beginner]').click(); await p.evaluate(() => FHLS.viewer.ready);
  // S21: a Go click follows blur; the duplicate commit must preserve the boundary hint.
  await p.locator('#exact-date').fill('2029-01-01'); await p.getByRole('button',{name:'Go',exact:true}).click();
  assert.equal(await p.evaluate(() => FHLS.state.hour),17543);
  assert.match(await p.locator('#time-hint').innerText(),/Limited to/);
  await p.locator('#exact-hour').fill('06:00'); assert.equal(await p.locator('#time-hint').innerText(),'');
  await p.locator('#exact-hour').press('Enter'); await p.locator('#time-reset').click();
  const ridge = await select(-89.45,-137.3,'Connecting ridge'); await ranking(ridge,1);
  assert.match(await p.locator('#best-dates').innerText(), /Best time to land here:/);
  assert.ok(ridge.ranked[0].hours > 24);
  await mode('intermediate'); await ranking(ridge,3);
  await p.locator('#pin-site').click();
  const eq = await select(0,0,'Near-side equator'); await ranking(eq,3);
  assert.ok(eq.ranked[0].hours/24 > 13 && eq.ranked[0].hours/24 < 16); await p.locator('#pin-site').click();
  const far = await select(0,180,'Far side'); await ranking(far,3);
  assert.match(await p.locator('#best-dates').innerText(), /No direct line to Earth from here in 2027–2028/);
  assert.match(await p.locator('#best-dates').innerText(), /Best sunlight windows \(no Earth contact\)/);
  assert.equal(far.kind,'power'); await p.locator('#pin-site').click();
  assert.equal(await p.locator('.pin-best-window').count(),3);
  assert.match(await p.locator('.pin-best-window').nth(2).innerText(),/sunlight only; no Earth contact/);
  assert.equal(await p.evaluate(() => FHLS.pins.some(pin => Object.values(pin).some(ArrayBuffer.isView))),false);
  assert.deepEqual(await p.evaluate(() => Object.keys(FHLS.pins[0].bestDates.window)),['start','end','hours']);
  await mode('advanced'); await ranking(far,3);
  assert.match(await p.locator('#best-dates .best-window').first().innerText(), /\d{2}:00 UTC/);
  assert.match(await p.locator('#best-dates').innerText(), /End times are exclusive/);
  const pendingDownload = p.waitForEvent('download');
  await p.locator('#best-dates').getByRole('button',{name:'Download windows CSV'}).click();
  const download = await pendingDownload, csv = await readFile(await download.path(),'utf8');
  const rows = csv.trim().split('\n'); assert.equal(rows.length,4);
  assert.equal(rows[0],'rank,kind,start_utc,end_utc_exclusive,hours,days');
  for(let i=1;i<rows.length;i++) {
    const cols=rows[i].split(','); const w=far.ranked[i-1];
    assert.equal(cols[1],'sunlight_only'); assert.equal(+cols[4],w.hours);
    assert.equal((Date.parse(cols[3])-Date.parse(cols[2]))/3600000,w.hours);
  }
  await mkdir('/private/tmp/fhls-viewer-tests',{recursive:true});
  for(const width of [1280,375]) for(const theme of ['dark','light']) {
    await p.setViewportSize({width,height:900});
    if(await p.evaluate(() => document.documentElement.dataset.theme)!==theme) await p.locator('#theme-toggle').click();
    for (const m of ['beginner','intermediate','advanced']) {
      await p.evaluate(mode => { FHLS.setMode(mode); document.getElementById('time-slider').dispatchEvent(new Event('input',{bubbles:true})); }, m);
      assert.equal(await p.locator('#best-dates .best-window').count(),m==='beginner'?1:3);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth>innerWidth),false,`${width} ${theme} ${m} overflow`);
    }
    await p.locator('#best-dates').scrollIntoViewIfNeeded();
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth>innerWidth),false,`${width} ${theme} overflow`);
    const button=await p.locator('#best-dates .best-window').first().boundingBox(); assert.ok(button.height>=44);
    const bounds=await p.locator('#best-dates').boundingBox(); assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width+1);
    await p.screenshot({path:`/private/tmp/fhls-viewer-tests/best-dates-${width}-${theme}.png`});
  }
  await select(-89.67,129.8,'Shackleton floor');
  assert.match(await p.locator('#best-dates').innerText(),/This spot never gets sunlight in 2027–2028\./);
  assert.equal(await p.locator('#best-dates .best-window').count(),0);
  assert.match(await p.locator('.best-blackout').innerText(),/731.0 days/);
  assert.match(await p.locator('.best-blackout').innerText(),/1 Jan 2029 00:00 UTC/);
  // Clear selection must remove the prior site's dates; Home / return must restore exactly one card.
  await p.getByRole('button',{name:'Clear selection',exact:true}).click(); assert.equal(await p.locator('#best-dates').isVisible(),false);
  await select(0,0,'Near-side equator'); const before=await p.locator('#best-dates').innerText();
  await p.locator('#home-from-app').click(); await p.locator('#start').click(); await p.locator('.mode[data-mode=advanced]').click();
  await p.evaluate(() => FHLS.viewer.ready); assert.equal(await p.locator('#best-dates').innerText(),before);
  assert.equal(await p.locator('#best-dates').count(),1); assert.equal(await p.locator('#viewer-slot canvas').count(),1);
  // While a different site's real horizon tile is pending, previous dates must stay hidden.
  let release; const hold=new Promise(resolve=>{release=resolve;});
  await p.route('**/data/horizon/**/*.bin',async route=>{await hold;await route.continue();});
  await p.evaluate(()=>{window.pendingSite=FHLS.setSite(35,60,'Pending site');});
  assert.equal(await p.locator('#best-dates').isVisible(),false);
  release(); await p.evaluate(()=>window.pendingSite);
  assert.equal(await p.locator('#best-dates').isVisible(),true);
  assert.deepEqual(errors,[]); assert.deepEqual(bad,[]); assert.deepEqual(external,[]);
  console.log('PASS S20: real ridge/equator/far side/shadow; all modes; jumps + focus; UTC CSV exclusive ends; 3 compact compare pins; phone/laptop both themes; clear/Home/pending selection; offline; zero errors');
} finally { await browser.close(); }
