// Repository-root static server + external Playwright installation; see README.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { localFrame } from '../coordinates.js';
const { chromium } = await import(process.env.FHLS_PLAYWRIGHT || 'playwright');
const base=process.env.FHLS_TEST_URL || 'http://127.0.0.1:8765';
const browser=await chromium.launch({executablePath:process.env.FHLS_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const external=[],errors=[];
await context.route('**/*',route=>{
  const url=route.request().url();
  if(url.startsWith(base)||url.startsWith('data:'))return route.continue();
  external.push(url);return route.abort();
});
context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
try{
  await mkdir('/private/tmp/fhls-viewer-tests',{recursive:true});
  const page=await context.newPage();await page.goto(base+'/viewer/demo.html');await page.evaluate(()=>window.fhlsDemo.ready);
  await page.evaluate(()=>window.fhlsDemo.flyTo(-89.45,-137.3));
  const dark=await page.locator('canvas').screenshot();
  await page.evaluate(()=>window.fhlsDemo.setTime('2027-01-01T00:00:00Z'));
  await page.waitForTimeout(150);
  const actual=await page.evaluate(()=>window.fhlsDemo.getDiagnostics());
  const bytes=await readFile(new URL('../../data/ephemeris.bin',import.meta.url));
  // Read raw first-hour MOON_ME values independently of the core and viewer.
  const moon=[0,1,2].map(i=>bytes.readFloatLE(i*4)),length=Math.hypot(...moon);
  const expected=[moon[0]/length,moon[2]/length,-moon[1]/length];
  assert.ok(dot(actual.lightDirection,expected)>1-1e-12);
  assert.equal(actual.shadows.enabled,true);assert.deepEqual(actual.shadows.mapSize,[2048,2048]);
  assert.ok(actual.shadows.extentKm>=100 && actual.shadows.farKm>1000);
  assert.equal(await page.evaluate(()=>window.fhlsDemo.getStatus().synthetic),false);
  const lit=await page.locator('canvas').screenshot();assert.ok(!dark.equals(lit),'Time must change the terrain rendering');
  await page.screenshot({path:'/private/tmp/fhls-viewer-tests/terrain-hour-zero.png',fullPage:true});
  await page.evaluate(()=>window.fhlsDemo.dispose());await page.close();

  const fallback=await context.newPage();
  await fallback.route('**/data/ephemeris.bin',route=>route.abort('failed'));
  await fallback.goto(base+'/viewer/demo.html');await fallback.evaluate(()=>window.fhlsDemo.ready);
  assert.equal(await fallback.evaluate(()=>window.fhlsDemo.getStatus().lighting),'fixed-development');
  assert.equal(await fallback.evaluate(()=>window.fhlsDemo.getStatus().synthetic),true);
  await fallback.evaluate(()=>window.fhlsDemo.flyTo(-90,0));
  const direction=await fallback.evaluate(()=>window.fhlsDemo.getDiagnostics().lightDirection);
  assert.ok(Math.abs(Math.asin(dot(direction,localFrame(-90,0).up))*180/Math.PI-1)<1e-8);
  assert.match(await fallback.locator('.fhls-viewer-status').textContent(),/Development lighting — fixed Sun/);
  await fallback.evaluate(()=>window.fhlsDemo.setTime('2028-12-31T23:00:00Z'));
  assert.deepEqual(await fallback.evaluate(()=>window.fhlsDemo.getDiagnostics().lightDirection),direction);
  await fallback.screenshot({path:'/private/tmp/fhls-viewer-tests/fallback.png',fullPage:true});
  await fallback.evaluate(()=>window.fhlsDemo.dispose());
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log('PASS V5: raw MOON_ME Sun matches actual light, real-data metadata, terrain shadows and rendering change with time; missing ephemeris uses visibly labeled synthetic fixed 1° Sun.');
}finally{await browser.close();}
