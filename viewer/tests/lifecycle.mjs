import assert from 'node:assert/strict';
const {chromium}=await import(process.env.FHLS_PLAYWRIGHT||'playwright');
const base=process.env.FHLS_TEST_URL||'http://127.0.0.1:8765';
const browser=await chromium.launch({executablePath:process.env.FHLS_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({reducedMotion:'reduce'}),errors=[],external=[];
await context.route('**/*',route=>{
  const url=route.request().url();
  if(url.startsWith(base)||url.startsWith('data:'))return route.continue();
  external.push(url);return route.abort();
});
context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
try{
  // Keep an asset pending to make unmount-during-initialization deterministic.
  const pending=await context.newPage();let held;
  await pending.route('**/assets/moon-displacement.tiff',route=>{held=route;});
  await pending.goto(base+'/viewer/tests/embed.html');
  const cancelled=await pending.evaluate(async()=>{
    const v=window.embeddedViewer;
    v.setTime('2028-12-31T23:00:00Z');
    if(v.getStatus().time!=='2028-12-31T23:00:00.000Z')throw Error('Queued time was not published');
    const flight=v.flyTo(-90,0);v.dispose();v.dispose();await v.ready;return flight;
  });
  assert.equal(cancelled.cancelled,true);assert.equal(await pending.locator('.fhls-viewer').count(),0);
  if(held)await held.abort().catch(()=>{});await pending.close();

  const page=await context.newPage();await page.goto(base+'/viewer/tests/embed.html');await page.evaluate(()=>window.embeddedViewer.ready);
  assert.equal(await page.evaluate(async()=>{
    const {createViewer}=await import('../index.js'),host=document.getElementById('host'),before=host.children.length;
    try{createViewer(host,{time:'2027-02-30T00:00:00Z'});return false;}catch{return host.children.length===before;}
  }),true);
  const lost=await page.evaluate(()=>{
    const gl=document.querySelector('canvas').getContext('webgl2');window.testGL=gl;
    window.testLose=gl.getExtension('WEBGL_lose_context');window.testLose.loseContext();return !!window.testLose;
  });assert.equal(lost,true);
  await page.waitForFunction(()=>window.embeddedViewer.getStatus().phase==='context-lost');
  await page.waitForTimeout(150);await page.evaluate(()=>window.testLose.restoreContext());
  await page.waitForFunction(()=>window.embeddedViewer.getStatus().phase==='ready');
  await page.evaluate(()=>window.embeddedViewer.dispose());
  await page.waitForFunction(()=>window.testGL.isContextLost());
  assert.equal(await page.locator('canvas').count(),0);await page.close();

  const detail=await context.newPage();await detail.goto(base+'/viewer/tests/embed.html');await detail.evaluate(()=>window.embeddedViewer.ready);
  await detail.route('**/data/terrain/south/*_*.png',route=>route.abort('failed'));
  await detail.route('**/data/terrain/detail/*.png',route=>route.abort('failed'));
  await detail.evaluate(()=>window.embeddedViewer.flyTo(-89.45,-137.3));
  await detail.waitForFunction(()=>window.embeddedViewer.getStatus().phase==='ready');
  assert.equal(await detail.evaluate(()=>window.embeddedViewer.getStatus().terrain),'overview-only');
  assert.match(await detail.locator('.fhls-viewer-status').textContent(),/detail unavailable.*lower precision/);
  await detail.evaluate(()=>window.embeddedViewer.dispose());await detail.close();

  const noTerrain=await context.newPage();await noTerrain.route('**/data/terrain/index.json',route=>route.abort('failed'));
  await noTerrain.goto(base+'/viewer/tests/embed.html');await noTerrain.evaluate(()=>window.embeddedViewer.ready);
  await noTerrain.evaluate(()=>window.embeddedViewer.flyTo(-90,0));
  await noTerrain.waitForFunction(()=>window.embeddedViewer.getStatus().phase==='ready');
  assert.equal(await noTerrain.evaluate(()=>window.embeddedViewer.getStatus().terrain),'unavailable');
  assert.match(await noTerrain.locator('.fhls-viewer-status').textContent(),/Global relief.*lower precision/);
  await noTerrain.evaluate(()=>window.embeddedViewer.dispose());await noTerrain.close();

  const broken=await context.newPage();await broken.route('**/assets/moon-displacement.tiff',route=>route.abort('failed'));
  await broken.goto(base+'/viewer/tests/embed.html');
  const failed=await broken.evaluate(()=>window.embeddedViewer.ready.then(()=>false,()=>true));assert.equal(failed,true);
  assert.equal(await broken.evaluate(()=>window.embeddedViewer.getStatus().phase),'error');
  assert.match(await broken.locator('.fhls-viewer-status').textContent(),/Viewer unavailable/);
  await broken.evaluate(()=>window.embeddedViewer.dispose());assert.equal(await broken.locator('canvas').count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS lifecycle: invalid input leaves no DOM; queued time, disposal during loading, cancelled flights, idempotent unmount, context recovery/release, honest missing-terrain fallbacks and fatal-asset cleanup.');
}finally{await browser.close();}
