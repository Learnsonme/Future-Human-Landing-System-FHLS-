// P1/P2/P8: actual landing ticker/poster plus an accelerated shooting-star check.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.FHLS_PLAYWRIGHT||'playwright');
const base=process.env.FHLS_TEST_URL||'http://127.0.0.1:8765',out='/private/tmp/fhls-viewer-tests';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={};
try{
 const early=await browser.newPage({viewport:{width:375,height:812}});let held;
 await early.route('**/web/app.js',r=>{held=r;});
 await early.goto(base+'/web/',{waitUntil:'commit'});await early.waitForSelector('#landing-moon');
 await early.waitForFunction(()=>performance.getEntriesByType('resource').some(r=>r.name.endsWith('moon-poster.webp')&&r.responseEnd>0));
 assert.ok(held);assert.equal(await early.evaluate(()=>!!window.FHLS),false);
 assert.match(await early.locator('#landing-moon').evaluate(n=>getComputedStyle(n).backgroundImage),/moon-poster.webp/);
 await early.locator('#landing-moon').scrollIntoViewIfNeeded();
 await early.screenshot({path:out+'/poster-before-javascript-375.png'});
 report.poster={visibleBeforeAppJavaScript:true,resourceMs:await early.evaluate(()=>performance.getEntriesByType('resource').find(r=>r.name.endsWith('moon-poster.webp')).responseEnd)};
 await held.continue();await early.waitForFunction(()=>window.FHLS?.landingViewer);
 await early.evaluate(()=>FHLS.landingViewer.ready);await early.waitForSelector('.fhls-viewer.is-live');
 await early.locator('.fhls-viewer-poster').waitFor({state:'detached'});
 assert.equal(await early.locator('#landing-moon').evaluate(n=>getComputedStyle(n).backgroundImage),'none');await early.close();
 for(const width of [1440,375]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/web/');await page.waitForSelector('.stats-ticker-track');await page.waitForTimeout(1000);
  await page.locator('.stats-ticker').scrollIntoViewIfNeeded();await page.mouse.move(0,0);
  const track=page.locator('.stats-ticker-track');const x=()=>track.evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).m41);
  const before=await x();await page.waitForTimeout(300);assert.ok(await x()>before,'strip must drift right');
  const committed=()=>track.evaluate(n=>Promise.all(n.getAnimations().map(a=>a.ready)).then(()=>{}));
  const ticker=page.locator('.stats-ticker-viewport');await ticker.focus();await committed();let at=await x();await page.waitForTimeout(200);assert.ok(Math.abs(await x()-at)<.1);
  await page.locator('.stats-ticker button').click();await page.locator('#start').focus();await page.mouse.move(0,0);await committed();at=await x();await page.waitForTimeout(200);assert.ok(Math.abs(await x()-at)<.1);
  await page.locator('.stats-ticker button').click();await page.locator('#start').focus();await page.mouse.move(0,0);await committed();at=await x();await page.waitForTimeout(200);assert.ok(await x()>at);
  await page.locator('.stats-ticker-viewport').hover();await committed();at=await x();await page.waitForTimeout(200);assert.ok(Math.abs(await x()-at)<.1);
  assert.equal(await page.locator('#live-readout').count(),1);assert.equal(await page.locator('.strip[aria-hidden=true] [id]').count(),0);
  await page.locator('#live-readout').evaluate(n=>{n.firstChild.textContent='Updated real-time check';});
  await page.waitForFunction(()=>document.querySelector('.strip[aria-hidden=true]').textContent.includes('Updated real-time check'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const coverage=await track.evaluate(n=>{const r=n.getBoundingClientRect(),v=n.parentElement.getBoundingClientRect();return r.left<=v.left+.1&&r.right>=v.right-.1;});assert.ok(coverage);
  await page.screenshot({path:out+`/ticker-${width}.png`});
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
  assert.equal(await track.evaluate(n=>getComputedStyle(n).animationName),'none');
  assert.equal(await page.locator('.strip[aria-hidden=true]').isVisible(),false);
  assert.equal(await page.locator('.strip:not([aria-hidden]) > div').count(),3);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);report[`ticker${width}`]={rightward:true,hoverPause:true,focusPause:true,togglePause:true,cloneIds:0,liveCopy:true,reducedStatic:true};await page.close();
 }
 // Use a controlled clock, keeping the actual scheduling and drawing implementation.
 const sky=await browser.newPage({viewport:{width:500,height:400}});await sky.clock.install();
 await sky.goto(base+'/viewer/tests/polish-host.html');await sky.evaluate(()=>polishViewer.dispose());
 await sky.evaluate(async()=>{
  document.body.dataset.screen='landing';document.body.innerHTML='<canvas id="sky" style="width:500px;height:400px"></canvas><section id="screen-landing"><p style="position:fixed;inset:0;margin:0">Protected text area</p></section>';
  const {createStarfield}=await import('/web/components/starfield.js');window.testSky=createStarfield(document.getElementById('sky'),{density:'landing'});
  window.skyPixels=()=>document.getElementById('sky').toDataURL();
  const ctx=document.getElementById('sky').getContext('2d'), stroke=ctx.stroke.bind(ctx);
  ctx.stroke=()=>{
    const before=ctx.getImageData(0,0,500,400).data;stroke();const after=ctx.getImageData(0,0,500,400).data;
    window.strokeDelta=0;for(let i=0;i<after.length;i++)if(after[i]!==before[i])window.strokeDelta++;
  };
 });
 await sky.clock.runFor(100);
 let diag=await sky.evaluate(()=>testSky.getDiagnostics());const now=await sky.evaluate(()=>performance.now());assert.ok(diag.nextShootingAt-now>=5000&&diag.nextShootingAt-now<=14000);
 await sky.clock.fastForward(Math.ceil(diag.nextShootingAt-now)+100);await sky.clock.runFor(400);
 diag=await sky.evaluate(()=>testSky.getDiagnostics());assert.equal(diag.shooting,true);assert.ok(diag.trail>=70&&diag.trail<=150);
 assert.equal(await sky.evaluate(()=>window.strokeDelta),0,'shooting star must never paint over text');
 await sky.evaluate(()=>document.querySelector('#screen-landing p').remove());await sky.clock.runFor(100);
 assert.ok(await sky.evaluate(()=>window.strokeDelta)>0,'trail should draw in empty background');
 await sky.evaluate(()=>{document.body.dataset.screen='app';testSky.setDensity('beginner');});await sky.clock.fastForward(50000);assert.equal(await sky.evaluate(()=>testSky.getDiagnostics().shooting),false);
 await sky.emulateMedia({reducedMotion:'reduce'});await sky.waitForTimeout(100);await sky.clock.runFor(100);await sky.evaluate(()=>{document.body.dataset.screen='landing';testSky.setDensity('landing');});
 const still=await sky.evaluate(()=>skyPixels());await sky.clock.fastForward(60000);assert.ok(await sky.evaluate(()=>skyPixels())===still);assert.equal(await sky.evaluate(()=>testSky.getDiagnostics().running),false);
 report.shootingStars={intervalMs:[6000,14000],trailPx:[70,150],protectedText:true,landingOnly:true,reducedNone:true};await sky.close();
 await writeFile(out+'/landing-polish.json',JSON.stringify(report,null,2));console.log('PASS landing polish',JSON.stringify(report));
}finally{await browser.close();}
