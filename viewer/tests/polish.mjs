// P2–P7: real Chrome input, loading failures and rendering lifecycle.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.FHLS_PLAYWRIGHT||'playwright');
const base=process.env.FHLS_TEST_URL||'http://127.0.0.1:8765';
const out='/private/tmp/fhls-viewer-tests';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.FHLS_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={};
try{
 const context=await browser.newContext({viewport:{width:375,height:812},deviceScaleFactor:3,hasTouch:true,isMobile:true});
 const loading=await context.newPage();let held;
 await loading.route('**/assets/moon-displacement.tiff',route=>{held=route;});
 await loading.goto(base+'/viewer/tests/home-host.html');
 await loading.waitForSelector('.fhls-viewer-poster');
 await loading.evaluate(()=>{
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));
 });
 await loading.waitForTimeout(150);
 assert.equal(await loading.locator('.fhls-viewer.is-live').count(),0,'visibility must not remove the poster before a real Moon frame');
 assert.equal(await loading.evaluate(()=>viewerHomeTest.viewer.getDiagnostics().renderFrames),0);
 await held.continue();await loading.evaluate(()=>viewerHomeTest.viewer.ready);
 await loading.waitForSelector('.fhls-viewer.is-live');await loading.close();
 report.loadingPoster={survivesVisibilityChangeBeforeAssets:true};
 const page=await context.newPage(),errors=[],bad=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)bad.push(r.url());});
 await page.route('**/*',r=>{if(r.request().url().startsWith(base)||r.request().url().startsWith('data:'))return r.continue();external.push(r.request().url());return r.abort();});
 await page.goto(base+'/viewer/tests/polish-host.html');await page.evaluate(()=>polishViewer.ready);
 const d=()=>page.evaluate(()=>polishViewer.getDiagnostics());
 const settled=()=>page.waitForFunction(()=>polishViewer.getStatus().phase==='ready'&&!polishViewer.getDiagnostics().flying&&!polishViewer.getDiagnostics().fading);
 assert.equal((await d()).dpr,2);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 // One-finger drag and two-finger pinch are real CDP touch events, not mouse events.
 const cdp=await context.newCDPSession(page);const touch=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
 let before=(await d()).camera;
 await touch('touchStart',[{x:160,y:240,id:1}]);
 for(let i=1;i<=6;i++)await touch('touchMove',[{x:160+i*12,y:240+i*4,id:1}]);
 await touch('touchEnd',[]);await page.waitForTimeout(300);
 assert.ok(Math.hypot(...(await d()).camera.map((v,i)=>v-before[i]))>10);assert.equal(await page.evaluate(()=>polishPicks.length),0);
 await page.evaluate(()=>polishViewer.overview());await page.waitForTimeout(100);before=(await d()).camera;
 await touch('touchStart',[{x:145,y:260,id:1},{x:230,y:320,id:2}]);
 await touch('touchMove',[{x:115,y:240,id:1},{x:260,y:340,id:2}]);
 await touch('touchEnd',[]);await page.waitForTimeout(200);
 assert.ok(Math.hypot(...(await d()).camera)<Math.hypot(...before));assert.equal(await page.evaluate(()=>polishPicks.length),0);
 // The pinch's remaining finger must not become a spurious pick; a fresh tap must pick.
 await page.evaluate(()=>polishViewer.overview());await page.waitForTimeout(100);
 await touch('touchStart',[{x:187,y:320,id:1}]);await touch('touchEnd',[]);
 await page.waitForFunction(()=>polishPicks.length===1);await page.evaluate(()=>window.pickedFlight);await settled();
 before=(await d()).camera;await page.waitForTimeout(400);const after=(await d()).camera;
 assert.ok(Math.hypot(...after.map((v,i)=>v-before[i]))<1e-5,'camera drifts after arrival');
 report.touch375={rotate:true,pinch:true,tap:true,spuriousPicks:0,dpr:(await d()).dpr};
 // Wheel limits and collision clearance work after landing as well as in overview.
 await page.mouse.move(187,300);await page.mouse.wheel(0,-30000);await page.waitForTimeout(300);
 assert.ok((await d()).cameraClearanceKm>=.4999);
 await page.mouse.wheel(0,30000);await page.waitForTimeout(300);
 const far=await d();assert.ok(Math.hypot(...far.camera.map((v,i)=>v-far.target[i]))<=far.zoomLimits.maxKm+.01);
 await page.evaluate(()=>polishViewer.overview());await page.mouse.wheel(0,30000);await page.waitForTimeout(200);
 const overview=await d();assert.ok(Math.hypot(...overview.camera)<=overview.zoomLimits.maxKm+.01);
 const hostBox=await page.locator('#host').boundingBox();
 const half=Math.atan(Math.tan(21*Math.PI/180)*Math.min(1,hostBox.width/hostBox.height));
 const angularRadius=Math.asin(1737.4/overview.zoomLimits.maxKm);
 assert.ok(angularRadius<half && angularRadius>half*.5,'the full Moon fits a portrait view without becoming a dot');
 report.zoom={surfaceClearance:true,maxDistance:true,portraitFraming:true};
 // Stable scenes stop GPU redraws; switching time still invalidates the scene.
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(400);
 let frames=(await d()).renderFrames;await page.waitForTimeout(300);assert.equal((await d()).renderFrames,frames);
 await page.evaluate(()=>polishViewer.setTime('2027-01-29T12:00:00Z'));await page.waitForFunction(n=>polishViewer.getDiagnostics().renderFrames>n,frames);
 // Simulate the browser's visibility event, checking cancellation of the RAF as well as render count.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
 frames=(await d()).renderFrames;assert.equal((await d()).pendingFrame,false);await page.waitForTimeout(200);assert.equal((await d()).renderFrames,frames);
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(n=>polishViewer.getDiagnostics().renderFrames>n,frames);
 report.rendering={idleDraws:0,hiddenDraws:0,hiddenRaf:false,timeInvalidates:true};
 await page.screenshot({path:out+'/polish-375.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);assert.deepEqual(external,[]);await context.close();
 // A failed 40 m tile keeps the successful 120 m neighbours; complete failure restores the globe.
 const fail=await browser.newPage({viewport:{width:900,height:700},reducedMotion:'reduce'});
 const runtime=[];fail.on('pageerror',e=>runtime.push(e.message));
 await fail.goto(base+'/viewer/tests/polish-host.html');await fail.evaluate(()=>polishViewer.ready);
 await fail.route('**/terrain/detail/*.png',r=>r.fulfill({status:503,body:'test tile unavailable'}));
 await fail.evaluate(()=>polishViewer.flyTo(-89.53432,-150.05233));
 await fail.waitForFunction(()=>polishViewer.getStatus().phase==='ready'&&!polishViewer.getDiagnostics().fading);
 let fd=await fail.evaluate(()=>polishViewer.getDiagnostics());assert.ok(fd.terrainTiles.length>=4);assert.ok(fd.terrainLoadFailures.length>0);
 assert.equal(await fail.evaluate(()=>polishViewer.getStatus().terrain),'LOLA-120m');
 assert.match(await fail.locator('.fhls-viewer-status').textContent(),/coarser relief/);
 await fail.evaluate(()=>polishViewer.flyTo(-20,160));await fail.waitForFunction(()=>polishViewer.getStatus().phase==='ready');
 const cutoutTriangles=await fail.evaluate(()=>polishViewer.getDiagnostics().globeTriangles);
 await fail.route('**/terrain/global/*.png',r=>r.fulfill({status:503,body:'test tile unavailable'}));
 await fail.evaluate(()=>polishViewer.flyTo(10,60));await fail.waitForFunction(()=>polishViewer.getStatus().phase==='ready');
 assert.equal(await fail.evaluate(()=>polishViewer.getStatus().terrain),'overview-only');
 assert.ok(await fail.evaluate(()=>polishViewer.getDiagnostics().globeTriangles)>cutoutTriangles,'failed load must restore previous globe cutouts');
 assert.equal(await fail.locator('.fhls-viewer').getAttribute('aria-busy'),'false');
 await fail.screenshot({path:out+'/polish-fallback.png'});
 // Retry the same selection after recovery: failed promises must not poison the cache.
 await fail.unroute('**/terrain/global/*.png');await fail.evaluate(()=>polishViewer.flyTo(10,60));await fail.waitForFunction(()=>polishViewer.getStatus().phase==='ready');
 assert.equal(await fail.evaluate(()=>polishViewer.getStatus().terrain),'LOLA-474m');assert.deepEqual(runtime,[]);
 report.fallback={partialKeepsCoarse:true,totalRestoresGlobe:true,retryRecovers:true};await fail.close();
 await writeFile(out+'/polish.json',JSON.stringify(report,null,2));console.log('PASS P2–P7 viewer checks',JSON.stringify(report));
}finally{await browser.close();}
