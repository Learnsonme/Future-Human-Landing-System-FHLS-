import assert from 'node:assert/strict';
const { chromium } = await import(process.env.FHLS_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
try {
 const page = await browser.newPage({viewport:{width:1000,height:800},reducedMotion:'reduce'});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/viewer/tests/embed.html');
 await page.evaluate(async()=>{const v=window.embeddedViewer;v.addMarker('one',12.445,-32.231,1);await v.ready;});
 await page.waitForTimeout(100);
 let pins=await page.evaluate(()=>window.embeddedViewer.getDiagnostics().markers);assert.equal(pins[0].visible,true);
 await page.evaluate(()=>{const v=window.embeddedViewer;v.addMarker('back',-12.445,147.769,2);v.setActiveMarker('one');});
 await page.waitForTimeout(100);pins=await page.evaluate(()=>window.embeddedViewer.getDiagnostics().markers);assert.equal(pins[1].visible,false);
 const box=await page.locator('.fhls-marker[data-id=one]').boundingBox();assert.equal(box.width,12);assert.equal(box.height,12);
 await page.evaluate(async()=>{const v=window.embeddedViewer;v.addMarker('one',-89.45,-137.3,3);await v.flyTo(-89.45,-137.3);});
 await page.waitForFunction(()=>embeddedViewer.getStatus().phase==='ready'&&!embeddedViewer.getDiagnostics().fading);
 await page.waitForFunction(()=>embeddedViewer.getDiagnostics().markers[0]?.visible);
 pins=await page.evaluate(()=>window.embeddedViewer.getDiagnostics().markers);
 if(!pins[0].visible){console.log('terrain pin diagnostics',await page.evaluate(()=>({d:embeddedViewer.getDiagnostics(),s:embeddedViewer.getStatus()})));await page.screenshot({path:'/private/tmp/fhls-viewer-tests/marker-terrain.png'});}
 assert.equal(pins[0].label,'3');assert.equal(pins[0].visible,true);
 assert.equal(await page.locator('canvas').count(),1);
 assert.equal(await page.evaluate(()=>window.embeddedViewer.removeMarker('back')),true);
 assert.equal(await page.evaluate(()=>window.embeddedViewer.removeMarker('missing')),false);
 await page.evaluate(()=>window.embeddedViewer.dispose());assert.equal(await page.locator('.fhls-marker,canvas').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS marker globe/terrain projection, far-side occlusion, ring size, replacement, removal, disposal; one canvas.');
} finally {await browser.close();}
