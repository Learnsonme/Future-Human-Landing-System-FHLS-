// Real web/ acceptance at the exact H3 viewports. All test source stays in viewer/.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.FHLS_PLAYWRIGHT||'playwright');
const base=process.env.FHLS_TEST_URL||'http://127.0.0.1:8765';
const output='/private/tmp/fhls-viewer-tests';
const browser=await chromium.launch({executablePath:process.env.FHLS_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext(),errors=[],external=[],failed=[],results=[];
await context.route('**/*',route=>{
  const url=route.request().url();
  if(url.startsWith(base)||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
  external.push(url);return route.abort();
});
context.on('page',page=>{
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
});
const saved=page=>page.evaluate(()=>({site:window.FHLS.state.site,hour:window.FHLS.state.hour,pins:window.FHLS.pins}));
const screen=(page,name)=>page.waitForFunction(target=>document.body.dataset.screen===target && !document.getElementById('transition').classList.contains('is-running'),name,{timeout:15000});
async function landingReady(page){await page.evaluate(()=>window.FHLS.landingViewer.ready);}
async function rotate(page){
  const before=await page.evaluate(()=>window.FHLS.landingViewer.getDiagnostics().camera);
  await page.waitForFunction(a=>window.FHLS.landingViewer.getDiagnostics().camera.some((v,i)=>Math.abs(v-a[i])>1),before,{timeout:5000});
}
async function enter(page,mode){
  await page.locator('#start').click();await screen(page,'modes');
  await page.locator(`button.mode[data-mode="${mode}"]`).click();await screen(page,'app');
  await page.evaluate(()=>window.FHLS.viewer.ready);
}
async function goHome(page){
  await page.locator('#home-from-app').click();await screen(page,'landing');await landingReady(page);
  assert.equal(await page.locator('#landing-moon canvas').count(),1);
  assert.equal(await page.locator('#viewer-slot canvas').count(),0);
  assert.equal(await page.locator('#sky').count(),1);
}
async function fps(page){
  const start=await page.evaluate(()=>({n:window.FHLS.landingViewer.getDiagnostics().renderFrames,t:performance.now()}));
  await page.waitForTimeout(1000);
  const end=await page.evaluate(()=>({n:window.FHLS.landingViewer.getDiagnostics().renderFrames,t:performance.now()}));
  assert.ok(end.n>start.n);return (end.n-start.n)*1000/(end.t-start.t);
}
try{
  await mkdir(output,{recursive:true});
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    const page=await context.newPage();await page.setViewportSize(viewport);
    assert.deepEqual(await page.evaluate(()=>({width:innerWidth,height:innerHeight})),viewport);
    await page.goto(base+'/web/');await page.waitForFunction(()=>window.FHLS?.core,{},{timeout:10000});
    await page.waitForFunction(()=>window.FHLS.landingViewer);await landingReady(page);
    const initial=await page.evaluate(()=>window.FHLS.landingViewer.getDiagnostics());
    const cosine=initial.camera.reduce((sum,v,i)=>sum+v*initial.lightDirection[i],0)/Math.hypot(...initial.camera);
    assert.ok(cosine>.84,'F5: real landing Moon must start on the lit hemisphere');
    await rotate(page);const fpsBefore=await fps(page);
    await page.screenshot({path:`${output}/site-sunlit-home-${viewport.width}.png`});
    const canvasCount=await page.locator('canvas').count();
    let mode='beginner';await enter(page,mode);
    for(const [cycle,nextMode] of ['beginner','intermediate','advanced','beginner','advanced'].entries()){
      // Use the real site-list event → core → fly-to path, then interrupt it.
      await page.locator('.site').first().click();
      await page.waitForFunction(()=>window.FHLS.viewer.getDiagnostics().flying);
      await page.evaluate(()=>{window.departingViewer=window.FHLS.viewer;});
      await goHome(page);
      assert.equal(await page.evaluate(()=>window.departingViewer.getDiagnostics().flying),false);
      assert.equal(await page.evaluate(()=>window.departingViewer.getDiagnostics().disposed),true);
      const stopped=await page.evaluate(()=>window.departingViewer.getDiagnostics().camera);
      await page.waitForTimeout(100);
      assert.deepEqual(await page.evaluate(()=>window.departingViewer.getDiagnostics().camera),stopped);
      const retained=await saved(page);await rotate(page);
      assert.equal(await page.locator('canvas').count(),canvasCount);
      await enter(page,nextMode);
      await page.waitForFunction(()=>!window.FHLS.viewer.getDiagnostics().flying && window.FHLS.viewer.getStatus().terrain==='LOLA-120m');
      assert.deepEqual(await saved(page),retained);assert.equal(await page.evaluate(()=>window.FHLS.state.mode),nextMode);
      if(cycle===0){
        await page.locator('#time-slider').evaluate(el=>{el.value='1000';el.dispatchEvent(new Event('input',{bubbles:true}));});
        await page.waitForFunction(()=>window.FHLS.state.result);
        await page.locator('#pin-site').click();
      }
      mode=nextMode;
      console.log(`PASS real-site B1–B3/B5/B6 ${viewport.width}px round ${cycle+1}/5`);
    }
    // B4: picker Home returns to landing; choosing a mode restores the site.
    const retained=await saved(page);
    await page.locator('#change-mode').click();await screen(page,'modes');
    await page.locator('#home-from-modes').click();await screen(page,'landing');await landingReady(page);await rotate(page);
    assert.deepEqual(await saved(page),retained);
    const fpsAfter=await fps(page);
    assert.ok(fpsAfter>=fpsBefore*.65,`Sustained frame-rate regression: ${fpsBefore} → ${fpsAfter}`);
    // D2: real browser emulation, including the website's separate starfield.
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const still=await page.evaluate(()=>({camera:window.FHLS.landingViewer.getDiagnostics().camera,sky:document.getElementById('sky').toDataURL()}));
    await page.waitForTimeout(350);
    const later=await page.evaluate(()=>({camera:window.FHLS.landingViewer.getDiagnostics().camera,sky:document.getElementById('sky').toDataURL()}));
    assert.ok(Math.hypot(...still.camera.map((v,i)=>v-later.camera[i]))<1e-7);assert.ok(still.sky===later.sky,'D2: separate website starfield must remain static');
    await enter(page,mode);
    await page.waitForFunction(()=>!window.FHLS.viewer.getDiagnostics().flying && window.FHLS.viewer.getStatus().terrain==='LOLA-120m');
    const cut=await page.evaluate(async()=>{
      const v=window.FHLS.viewer,before=v.getDiagnostics().camera,samples=[];
      const timer=setInterval(()=>samples.push(v.getDiagnostics().camera),0);
      await v.flyTo(10,40);clearInterval(timer);return {before,samples,after:v.getDiagnostics().camera,flying:v.getDiagnostics().flying};
    });
    assert.equal(cut.flying,false);
    for(const sample of cut.samples)assert.ok([cut.before,cut.after].some(p=>Math.hypot(...p.map((v,i)=>v-sample[i]))<1e-7),'D3 must have no intermediate camera poses');
    // E: Home remains reachable at the bottom, outside the date field/badge corner.
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    const button=page.locator('#home-from-app'),box=await button.boundingBox();
    assert.ok(box.width>=44&&box.height>=44&&box.y>=-1&&box.y+box.height<=viewport.height);
    assert.equal(await button.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`${output}/site-home-control-${viewport.width}.png`});
    const cancelled=await page.evaluate(async()=>{
      const v=window.FHLS.viewer,pending=v.flyTo(-86,30);
      document.getElementById('home-from-app').click();return pending;
    });
    assert.equal(cancelled.cancelled,true);await screen(page,'landing');await landingReady(page);
    assert.equal(await page.evaluate(()=>window.FHLS.landingViewer.getDiagnostics().flying),false);
    results.push({viewport,passed:['F5','B1','B2','B3','B4','B5','B6','D2','D3','E'],canvasCount,fpsBefore:+fpsBefore.toFixed(1),fpsAfter:+fpsAfter.toFixed(1)});
    await page.evaluate(()=>window.FHLS.landingViewer.dispose());await page.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(failed,[]);
  await writeFile(`${output}/site-home-acceptance.json`,JSON.stringify({results,errors,external,failed},null,2));
  console.log('PASS actual-site F5/H1:',JSON.stringify(results));
}finally{await browser.close();}
