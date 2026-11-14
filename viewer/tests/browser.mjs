// Start a repository-root static server, then run with Playwright installed outside the repo.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.FHLS_PLAYWRIGHT || 'playwright');
const base = process.env.FHLS_TEST_URL || 'http://127.0.0.1:8765';
const browser = await chromium.launch({ executablePath: process.env.FHLS_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
const errors = [], failed = [], external = [];
await context.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(base) || url.startsWith('data:')) return route.continue();
  external.push(url); return route.abort();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
const diagnostics = () => page.evaluate(() => window.fhlsDemo.getDiagnostics());
const fly = (lat, lon) => page.evaluate(([a,b]) => window.fhlsDemo.flyTo(a,b), [lat,lon]);
await mkdir('/private/tmp/fhls-viewer-tests', { recursive: true });
try {
  await page.goto(base + '/viewer/demo.html');
  await page.evaluate(() => window.fhlsDemo.ready);
  assert.equal(await page.evaluate(() => window.fhlsDemo.getStatus().lighting), 'ephemeris');
  const rotating = (await diagnostics()).camera;
  await page.waitForTimeout(250);
  assert.ok((await diagnostics()).camera.some((v,i) => Math.abs(v-rotating[i]) > 1));
  const imagery = await page.evaluate(async () => {
    const img = new Image(); img.src = './assets/moon-color-2k.jpg'; await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  });
  assert.deepEqual(imagery, [2048,1024]);
  await page.screenshot({ path: '/private/tmp/fhls-viewer-tests/globe.png', fullPage: true });
  await page.getByRole('button', { name: 'Start exploration' }).click();
  assert.equal(await page.getByRole('button', { name: 'Start exploration' }).isVisible(), false);
  if (process.env.FHLS_CHECK === 'V1') {
    assert.deepEqual(external,[]);assert.deepEqual(failed,[]);assert.deepEqual(errors,[]);
    console.log('PASS V1 browser: real local NASA texture, globe, starfield, intro rotation and Start; zero external requests.');
  } else {
  await page.getByRole('button', { name: 'Shackleton rim', exact: true }).click();
  await page.waitForFunction(() => window.fhlsDemo.getDiagnostics().selected?.lat === -89.45 && !window.fhlsDemo.getDiagnostics().flying && window.fhlsDemo.getStatus().phase === 'ready');
  assert.equal(await page.evaluate(() => window.fhlsDemo.getStatus().terrain), 'LOLA-40m');
  await page.screenshot({ path: '/private/tmp/fhls-viewer-tests/terrain.png', fullPage: true });
  const sunBefore = (await diagnostics()).sunDirection;
  await page.evaluate(() => window.fhlsDemo.setTime('2027-01-29T12:00:00Z'));
  const sunAfter = (await diagnostics()).sunDirection;
  assert.ok(sunAfter.some((v,i) => Math.abs(v - sunBefore[i]) > .1));
  await page.evaluate(() => window.fhlsDemo.setVerticalExaggeration(1.25));
  assert.equal(await page.evaluate(() => window.fhlsDemo.getStatus().exaggeration), 1.25);
  await page.evaluate(() => window.fhlsDemo.setVerticalExaggeration(1));
  for (const point of [[-90,0],[90,0],[0,179.9],[0,-179.9],[-84,0]]) {
    assert.equal((await fly(...point)).cancelled, false);
    const d = await diagnostics(); assert.ok(d.camera.every(Number.isFinite));
    assert.ok(Math.hypot(...d.camera) > 1728); assert.ok(Math.abs(d.selected.lat-point[0]) < 1e-8);
  }
  const cancelled = await page.evaluate(async () => {
    const a = window.fhlsDemo.flyTo(20,20), b = window.fhlsDemo.flyTo(-20,-20);
    return Promise.all([a,b]);
  });
  assert.equal(cancelled[0].cancelled,true);assert.equal(cancelled[1].cancelled,false);
  // Independent host uses precisely the API T2 will import.
  await page.goto(base + '/viewer/tests/embed.html'); await page.evaluate(() => window.embeddedViewer.ready);
  const canvas = page.locator('canvas'), box = await canvas.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();await page.mouse.move(box.x+box.width/2+90,box.y+box.height/2+50,{steps:12});await page.mouse.up();
  assert.equal(await page.evaluate(()=>window.pickCount),0);
  await page.evaluate(()=>window.embeddedViewer.overview());
  await page.waitForTimeout(150);
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await page.waitForFunction(()=>window.pickCount===1);
  const pick=await page.evaluate(()=>window.lastPick);
  const r=Math.hypot(4600,1200,2900);
  assert.ok(Math.abs(pick.lat-Math.asin(1200/r)*180/Math.PI)<.2,JSON.stringify(pick));
  assert.ok(Math.abs(pick.lon-Math.atan2(-2900,4600)*180/Math.PI)<.2,JSON.stringify(pick));
  await page.waitForFunction(()=>!window.embeddedViewer.getDiagnostics().flying);
  // Wheel input must change the camera distance without selecting a site.
  await page.evaluate(()=>window.embeddedViewer.overview());
  const zoomBefore = Math.hypot(...await page.evaluate(()=>window.embeddedViewer.getDiagnostics().camera));
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.wheel(0,-250);await page.waitForTimeout(200);
  const zoomAfter = Math.hypot(...await page.evaluate(()=>window.embeddedViewer.getDiagnostics().camera));
  assert.ok(zoomAfter < zoomBefore);assert.equal(await page.evaluate(()=>window.pickCount),1);
  // A pinch is never a pick.
  const session=await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:350,y:280,id:1},{x:450,y:320,id:2}]});
  const pinchBefore = Math.hypot(...await page.evaluate(()=>window.embeddedViewer.getDiagnostics().camera));
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:320,y:260,id:1},{x:480,y:340,id:2}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await page.evaluate(()=>window.pickCount),1);
  const pinchAfter = Math.hypot(...await page.evaluate(()=>window.embeddedViewer.getDiagnostics().camera));
  assert.ok(pinchAfter < pinchBefore);
  await page.evaluate(()=>{document.getElementById('host').style.width='500px';document.getElementById('host').style.height='350px';});
  await page.waitForTimeout(100);const size=await canvas.boundingBox();assert.equal(size.width,500);assert.equal(size.height,350);
  await page.evaluate(()=>window.embeddedViewer.dispose());assert.equal(await page.locator('canvas').count(),0);
  // Reduced motion and a narrow screen still render and navigate.
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/viewer/demo.html');await page.evaluate(()=>window.fhlsDemo.ready);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await fly(-89.45,-137.3);await page.screenshot({path:'/private/tmp/fhls-viewer-tests/mobile.png',fullPage:true});
  assert.deepEqual(external,[]);assert.deepEqual(failed,[]);assert.deepEqual(errors,[]);
  console.log('PASS browser: rendering, real Sun, terrain, API embedding, picks, drag/pinch, poles, wrapping, cancellation, resize, disposal, mobile, reduced motion; zero external requests.');
  }
} finally { await browser.close(); }
