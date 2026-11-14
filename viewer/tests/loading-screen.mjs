// P14: actual website, including loading before CSS/JS, gated readiness and failure recovery.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
// This test deliberately screenshots the intro before its font is released.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const {chromium}=await import(process.env.FHLS_PLAYWRIGHT||'playwright');
const base=process.env.FHLS_TEST_URL||'http://127.0.0.1:8765',out='/private/tmp/fhls-viewer-tests';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.FHLS_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[],errors=[],bad=[],external=[];
const appURL=/\/web\/app\.js(?:\?|$)/;
async function pageFor(options={}){
 const p=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'no-preference',...options});
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>{const u=r.request().url();if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return r.continue();external.push(u);return r.abort();});
 return p;
}
async function gone(p){await p.locator('#fhls-loading').waitFor({state:'detached',timeout:18000});assert.equal(await p.locator('#fhls-content').evaluate(n=>n.inert),false);}
async function times(p){return p.evaluate(()=>Object.fromEntries(performance.getEntriesByType('mark').filter(e=>e.name.startsWith('fhls-loading:')).map(e=>[e.name.split(':')[1],e.startTime])));}
try{
 // Hold CSS and app module: the actual initial HTML must still render and animate.
 const p=await pageFor({colorScheme:'light'});const held=new Map();
 p.on('response',r=>{if(r.status()>=400)bad.push(r.url());});p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const gates=[['css','**/web/app.css'],['app',appURL],['font','**/assets/open-sans.woff2'],['ephemeris','**/data/ephemeris.bin'],['sites','**/data/sites.json'],['horizon','**/data/horizon/index.json'],['viewer','**/assets/moon-displacement.tiff']];
 for(const [key,url]of gates)await p.route(url,r=>{held.set(key,r);});
 await p.goto(base+'/web/',{waitUntil:'commit'});await p.waitForSelector('#fhls-loading');
 await p.locator('#loading-logo').evaluate(n=>n.decode());
 assert.equal(await p.locator('#app-styles').evaluate(n=>n.sheet),null);
 assert.equal(await p.evaluate(()=>!!window.FHLS),false);
 assert.equal(await p.locator('#fhls-loading').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(20, 20, 20)');
 assert.equal(await p.locator('#fhls-loading svg.fhls-loading-ship').count(),3);
 const x=await p.locator('.fhls-loading-ship').first().evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).m41);
 await p.waitForTimeout(250);

 assert.ok(await p.locator('.fhls-loading-ship').first().evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).m41)>x);
 await p.screenshot({path:out+'/loading-before-css-js-1280.png'});
 const release=async key=>{for(let i=0;i<100&&!held.has(key);i++)await p.waitForTimeout(25);assert.ok(held.has(key),`missing ${key} request`);const request=held.get(key);held.delete(key);await request.continue();};
 await release('css');await release('app');
 await release('ephemeris');await release('horizon'); // core loads the index before constructing the viewer
 await p.waitForFunction(()=>window.FHLS?.landingViewer);
 await p.waitForTimeout(150);assert.equal(await p.locator('#fhls-loading').isVisible(),true);
 await release('sites');await release('horizon');
 await p.waitForTimeout(100);assert.equal(await p.locator('#fhls-loading').isVisible(),true);
 await release('viewer');await p.evaluate(()=>FHLS.ready);
 assert.equal(await p.locator('#fhls-loading').isVisible(),true,'font readiness must also gate removal');
 await release('font');await gone(p);const normal=await times(p);
 assert.ok(normal.fade-normal.start>=795);assert.ok(normal.end-normal.fade>=390);
 assert.equal(await p.locator('#startup-error').isVisible(),false);
 assert.equal(await p.evaluate(()=>document.fonts.check('400 14px "Open Sans"')),true);
 assert.ok(await p.evaluate(()=>FHLS.core&&FHLS.sites.length>0));
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await p.locator('#start').click();await p.waitForFunction(()=>document.body.dataset.screen==='modes');
 await p.locator('#home-from-modes').click();await p.waitForFunction(()=>document.body.dataset.screen==='landing');
 assert.equal(await p.locator('#fhls-loading').count(),0,'Home must not replay the loader');
 results.push({case:'before-CSS/JS and all readiness gates',timing:normal});await p.close();
 console.log('PASS P14 early HTML/CSS, logo, left-to-right ships, data/font/viewer gates and Home');
 // A fast-ready handoff still waits 800 ms; reduced motion cuts, with no ships.
 for(const width of [375,390]){
  const mobile=await pageFor({viewport:{width,height:844},reducedMotion:'reduce',colorScheme:width===375?'light':'dark'});let app;
  await mobile.route(appURL,r=>{app=r;});
  await mobile.goto(base+'/web/',{waitUntil:'commit'});await mobile.waitForSelector('#fhls-loading');
  assert.equal(await mobile.locator('.fhls-loading-ship').first().isVisible(),false);
  assert.equal(await mobile.locator('.fhls-loading-ship').first().evaluate(n=>getComputedStyle(n).animationName),'none');
  assert.ok(parseFloat(await mobile.locator('#fhls-loading').evaluate(n=>getComputedStyle(n).transitionDuration))<.001);
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await mobile.screenshot({path:out+`/loading-reduced-${width}.png`});
  if(width===390) {
    await app.fulfill({contentType:'application/javascript',body:'/* controlled fast readiness test */'});
    await mobile.evaluate(()=>FHLSLoading.waitFor(Promise.resolve()));
  } else await app.continue();
  await gone(mobile);
  const t=await times(mobile);assert.ok(t.fade-t.start>=795);if(width===390)assert.ok(t.fade-t.start<2000);assert.ok(t.end-t.fade<150);
  assert.equal(await mobile.locator('#start').isEnabled(),true);
  if(width===375) {
    await mobile.evaluate(()=>FHLS.ready);await mobile.locator('#start').click();
    await mobile.waitForFunction(()=>document.body.dataset.screen==='modes');
    await mobile.locator('button.mode[data-mode="beginner"]').click();
    await mobile.waitForFunction(()=>document.body.dataset.screen==='app'&&!!FHLS.viewer);
    await mobile.evaluate(()=>FHLS.viewer.ready);await mobile.locator('#home-from-app').click();
    await mobile.waitForFunction(()=>document.body.dataset.screen==='landing');
    assert.equal(await mobile.locator('#fhls-loading').count(),0);
  }
  results.push({case:`reduced, ${width}px ${width===375?'light, real Start/explorer/Home':'dark, fast-ready minimum'}`,timing:t});await mobile.close();
 }
 console.log('PASS P14 800ms minimum, phone layouts, dark/light, reduced motion');
 // No app module: the early watchdog must release the page around 12 seconds.
 const stalled=await pageFor({reducedMotion:'reduce'});let pending;
 await stalled.route(appURL,r=>{pending=r;});await stalled.goto(base+'/web/',{waitUntil:'commit'});
 await gone(stalled);assert.equal(await stalled.evaluate(()=>document.documentElement.dataset.startup),'timeout');
 assert.match(await stalled.locator('#startup-error').textContent(),/longer than expected/);
 const timeout=await times(stalled);assert.ok(timeout.end-timeout.start>=11900&&timeout.end-timeout.start<15000);
 await pending.continue();await stalled.waitForFunction(()=>!!window.FHLS?.ready);await stalled.evaluate(()=>FHLS.ready);
 await stalled.waitForFunction(()=>document.getElementById('startup-error').hidden);
 results.push({case:'12s watchdog and late recovery',timing:timeout});await stalled.close();
 console.log('PASS P14 independent watchdog and recovery');
 // Recoverable data failure announces a visible error after leaving the intro.
 const failed=await pageFor({reducedMotion:'reduce'});
 await failed.route('**/data/sites.json',r=>r.fulfill({status:503,body:'intentional test failure'}));
 await failed.goto(base+'/web/',{waitUntil:'commit'});await gone(failed);
 assert.equal(await failed.evaluate(()=>document.documentElement.dataset.startup),'error');
 assert.match(await failed.locator('#startup-error').textContent(),/site list could not load/);
 await failed.locator('#start').click();await failed.waitForFunction(()=>document.body.dataset.screen==='modes');
 results.push({case:'site failure: error visible and Start usable'});await failed.close();
 const viewer=await pageFor({reducedMotion:'reduce'});
 await viewer.route('**/assets/moon-displacement.tiff',r=>r.fulfill({status:503,body:'intentional viewer failure'}));
 await viewer.goto(base+'/web/',{waitUntil:'commit'});await gone(viewer);
 assert.equal(await viewer.evaluate(()=>document.documentElement.dataset.startup),'error');
 assert.equal(await viewer.locator('#startup-error').isVisible(),true);
 assert.equal(await viewer.locator('#landing-moon').evaluate(n=>getComputedStyle(n).backgroundImage.includes('moon-poster.webp')),true);
 results.push({case:'viewer failure: error visible, P2 poster retained'});await viewer.close();
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);assert.deepEqual(external,[]);
 await writeFile(out+'/loading-screen.json',JSON.stringify({results,errors,bad,external},null,2));
 console.log('PASS P14 failures, no normal-flow console/page/HTTP errors or external requests');
}finally{await browser.close();}
