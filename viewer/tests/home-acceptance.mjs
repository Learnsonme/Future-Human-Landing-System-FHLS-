// Viewer-only lifecycle evidence for acceptance_home B1/B5 and D2/D3.
// The real web/ integration is checked separately; this host does not replace it.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.FHLS_PLAYWRIGHT||'playwright');
const base=process.env.FHLS_TEST_URL||'http://127.0.0.1:8765';
const output='/private/tmp/fhls-viewer-tests';
const browser=await chromium.launch({executablePath:process.env.FHLS_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext(),errors=[],external=[],results=[];
await context.route('**/*',route=>{
  const url=route.request().url();
  if(url.startsWith(base)||url.startsWith('data:'))return route.continue();
  external.push(url);return route.abort();
});
context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const samePosition=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-7,'Camera must remain static');
async function ready(page){await page.evaluate(()=>window.viewerHomeTest.viewer.ready);}
async function diagnostics(page){return page.evaluate(()=>window.viewerHomeTest.viewer.getDiagnostics());}
async function home(page){await page.locator('#home').click();await ready(page);assert.equal(await page.locator('#host canvas').count(),1);}
async function explore(page){await page.locator('#explore').click();await ready(page);}
async function rotation(page){
  const a=(await diagnostics(page)).camera;
  await page.waitForFunction(before=>window.viewerHomeTest.viewer.getDiagnostics().camera.some((v,i)=>Math.abs(v-before[i])>1),a,{timeout:5000});
}
try{
  await mkdir(output,{recursive:true});
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    const page=await context.newPage();await page.setViewportSize(viewport);
    assert.deepEqual(await page.evaluate(()=>({width:innerWidth,height:innerHeight})),viewport);
    await page.goto(base+'/viewer/tests/home-host.html');await ready(page);
    const d=await diagnostics(page),length=Math.hypot(...d.camera);
    const phaseCos=dot(d.camera.map(v=>v/length),d.lightDirection);
    assert.ok(phaseCos>.85 && phaseCos<.89,'F5: first view must be about 30° from the real Sun');
    assert.equal(await page.evaluate(()=>window.viewerHomeTest.viewer.getStatus().synthetic),false);
    await page.screenshot({path:`${output}/sunlit-home-${viewport.width}.png`});
    await rotation(page);
    // The real-site suite covers five cycles; this checks the standalone API.
    for(let cycle=0;cycle<1;cycle++){
      await explore(page);
      await page.evaluate(()=>{window.departing=window.viewerHomeTest.viewer;window.testFlight=window.departing.flyTo(10,40);});
      await page.waitForFunction(()=>window.departing.getDiagnostics().flying);
      assert.equal((await diagnostics(page)).flightDurationMs,1200);
      await home(page);
      assert.equal((await page.evaluate(()=>window.testFlight)).cancelled,true);
      assert.equal(await page.evaluate(()=>window.departing.getDiagnostics().disposed),true);
      const stopped=await page.evaluate(()=>window.departing.getDiagnostics().camera);
      await page.waitForTimeout(100);
      assert.deepEqual(await page.evaluate(()=>window.departing.getDiagnostics().camera),stopped);
      await rotation(page);assert.equal(await page.locator('canvas').count(),1);
      console.log(`PASS standalone viewer B1/B5 ${viewport.width}px`);
    }
    await explore(page);assert.equal((await page.evaluate(()=>window.viewerHomeTest.viewer.flyTo(10,40))).cancelled,false);

    // Real browser media emulation changes both CSS media queries and matchMedia.
    await home(page);await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const still=await diagnostics(page),image=await page.locator('#host canvas').screenshot();
    await page.waitForTimeout(350);
    samePosition((await diagnostics(page)).camera,still.camera);
    assert.ok(image.equals(await page.locator('#host canvas').screenshot()),'D2: Moon and its starfield must stay static');
    await explore(page);
    const cut=await page.evaluate(async()=>{
      const v=window.viewerHomeTest.viewer;const samples=[];
      const timer=setInterval(()=>samples.push(v.getDiagnostics().camera),0);
      await v.flyTo(10,40);clearInterval(timer);
      return {samples,final:v.getDiagnostics()};
    });
    assert.equal(cut.final.flying,false);
    // Verify the cut can complete without a rendering frame at all, below.
    await home(page);
    const staticAgain=(await diagnostics(page)).camera;await page.waitForTimeout(200);
    samePosition((await diagnostics(page)).camera,staticAgain);
    await page.emulateMedia({reducedMotion:'no-preference'});await rotation(page);
    await explore(page);
    await page.evaluate(()=>{window.liveReducedFlight=window.viewerHomeTest.viewer.flyTo(20,60);});
    await page.waitForFunction(()=>window.viewerHomeTest.viewer.getDiagnostics().flying);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>!window.viewerHomeTest.viewer.getDiagnostics().flying);
    assert.equal((await page.evaluate(()=>window.liveReducedFlight)).cancelled,false);
    await home(page);
    results.push({viewport,viewerRows:['B1','B5','D2','D3'],phaseDegrees:+(Math.acos(phaseCos)*180/Math.PI).toFixed(2)});
    await page.evaluate(()=>window.viewerHomeTest.viewer.dispose());await page.close();
  }
  const noFrames=await context.newPage();await noFrames.setViewportSize({width:640,height:480});
  await noFrames.emulateMedia({reducedMotion:'reduce'});
  await noFrames.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await noFrames.goto(base+'/viewer/tests/home-host.html');await ready(noFrames);
  await explore(noFrames);
  const instant=await noFrames.evaluate(async()=>{
    const v=window.viewerHomeTest.viewer,before=v.getDiagnostics().renderFrames;
    const result=await v.flyTo(10,40);return {result,before,after:v.getDiagnostics().renderFrames,flying:v.getDiagnostics().flying,target:v.getDiagnostics().target};
  });
  assert.equal(instant.result.cancelled,false);assert.equal(instant.flying,false);assert.equal(instant.before,instant.after);
  assert.ok(Math.hypot(...instant.target)>1730);
  await noFrames.evaluate(()=>window.viewerHomeTest.viewer.dispose());
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await writeFile(`${output}/viewer-home-acceptance.json`,JSON.stringify({scope:'viewer-only test host; actual web integration is separate',results,instantCutWithoutFrames:true,errors,external},null,2));
  console.log('PASS F5 + standalone viewer B1/B5, D2/D3, instant cut without frames:',JSON.stringify(results));
}finally{await browser.close();}
