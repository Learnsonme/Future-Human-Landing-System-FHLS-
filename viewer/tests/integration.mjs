// Exercises T2's committed app as a consumer of the viewer. Does not edit web/.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.FHLS_PLAYWRIGHT||'playwright');
const base=process.env.FHLS_TEST_URL||'http://127.0.0.1:8765';
const browser=await chromium.launch({executablePath:process.env.FHLS_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],external=[],failed=[];
await context.route('**/*',route=>{
  const url=route.request().url();
  if(url.startsWith(base)||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
  external.push(url);return route.abort();
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
try{
  await page.goto(base+'/web/');await page.waitForFunction(()=>window.FHLS?.core);
  await page.locator('#start').click();await page.locator('[data-mode="intermediate"]').click();
  await page.waitForFunction(()=>window.FHLS.viewer);await page.evaluate(()=>window.FHLS.viewer.ready);
  const canvas=page.locator('#viewer-slot canvas');assert.equal(await canvas.isVisible(),true);
  // A real canvas click must reach T2's selection → analysis → flight path.
  const box=await canvas.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await page.waitForFunction(()=>window.FHLS.state.site && window.FHLS.viewer.getDiagnostics().selected && !window.FHLS.viewer.getDiagnostics().flying);
  const picked=await page.evaluate(()=>({site:window.FHLS.state.site,selected:window.FHLS.viewer.getDiagnostics().selected}));
  assert.ok(Math.abs(picked.site.lat-picked.selected.lat)<1e-8);
  await page.evaluate(()=>window.FHLS.setSite(-89.45,-137.3,'Shackleton rim'));
  await page.waitForFunction(()=>window.FHLS.viewer.getDiagnostics().selected?.lat===-89.45 && !window.FHLS.viewer.getDiagnostics().flying && window.FHLS.viewer.getStatus().terrain==='LOLA-120m');
  assert.match(await page.locator('#r-title').textContent(),/Shackleton rim/);
  await page.locator('#time-slider').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.evaluate(()=>window.FHLS.viewer.getStatus().time),'2027-01-01T00:00:00.000Z');
  const before=await page.evaluate(()=>window.FHLS.viewer.getDiagnostics().lightDirection);
  await page.locator('#time-slider').evaluate(el=>{el.value='1000';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.evaluate(()=>window.FHLS.state.hour),1000);
  const after=await page.evaluate(()=>window.FHLS.viewer.getDiagnostics().lightDirection);
  assert.ok(after.some((v,i)=>Math.abs(v-before[i])>.1));
  await mkdir('/private/tmp/fhls-viewer-tests',{recursive:true});
  await page.screenshot({path:'/private/tmp/fhls-viewer-tests/t2-integration.png',fullPage:true});
  await page.evaluate(()=>window.FHLS.viewer.dispose());
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(failed,[]);
  console.log('PASS T2 integration: real app Start/mode, visible viewer, canvas picking → analysis/flight, polar site selection, results title and slider → real Sun; zero external requests or page errors.');
}finally{await browser.close();}
