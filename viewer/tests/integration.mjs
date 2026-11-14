// Exercises T2's committed app as a consumer of the viewer. Does not edit web/.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.FHLS_PLAYWRIGHT||'playwright');
const base=process.env.FHLS_TEST_URL||'http://127.0.0.1:8765';
const browser=await chromium.launch({executablePath:process.env.FHLS_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[],external=[],failed=[];
await context.route('**/*',route=>{
  const url=route.request().url();
  if(url.startsWith(base)||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
  external.push(url);return route.abort();
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
const waitScreen=screen=>page.waitForFunction(name=>document.body.dataset.screen===name && !document.getElementById('transition').classList.contains('is-running'),screen);
const readyExplorer=async()=>{
  await waitScreen('app');await page.waitForFunction(()=>window.FHLS.viewer);
  await page.evaluate(()=>window.FHLS.viewer.ready);
};
const startMode=async mode=>{
  await page.locator('#start').click();await waitScreen('modes');
  await page.locator(`button.mode[data-mode="${mode}"]`).click();await readyExplorer();
};
const snapshot=()=>page.evaluate(()=>({mode:window.FHLS.state.mode,site:window.FHLS.state.site,hour:window.FHLS.state.hour,pins:window.FHLS.pins}));
const home=async()=>{
  await page.locator('#home-from-app').click();await waitScreen('landing');
  await page.evaluate(()=>window.FHLS.landingViewer.ready);
  assert.equal(await page.locator('#viewer-slot canvas').count(),0);
  assert.equal(await page.locator('#landing-moon canvas').count(),1);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'landing-title');
};
try{
  await page.goto(base+'/web/');await page.waitForFunction(()=>window.FHLS?.core);
  await page.waitForFunction(()=>window.FHLS.landingViewer);await page.evaluate(()=>window.FHLS.landingViewer.ready);
  const intro=page.locator('#landing-moon canvas');assert.equal(await intro.isVisible(),true);
  assert.equal(await page.locator('.globe svg').count(),0);
  const first=await page.evaluate(()=>window.FHLS.landingViewer.getDiagnostics().camera);
  await page.waitForTimeout(350);
  assert.ok((await page.evaluate(()=>window.FHLS.landingViewer.getDiagnostics().camera)).some((v,i)=>Math.abs(v-first[i])>1),'Home Moon must rotate');
  await mkdir('/private/tmp/fhls-viewer-tests',{recursive:true});
  await page.screenshot({path:'/private/tmp/fhls-viewer-tests/home-moon.png',fullPage:true});
  // Decorative Moon must not add a second Start button or consume keyboard focus.
  assert.equal(await page.locator('#landing-moon').evaluate(el=>el.inert),true);
  assert.equal(await page.getByRole('button',{name:'Start exploration',exact:true}).isVisible(),false);
  await page.locator('#start').click();
  await waitScreen('modes');
  assert.equal(await page.evaluate(()=>window.FHLS.landingViewer),null);
  assert.equal(await page.locator('#landing-moon canvas').count(),0);
  await page.locator('#back-to-landing').click();
  await waitScreen('landing');
  await page.evaluate(()=>window.FHLS.landingViewer.ready);
  await page.emulateMedia({reducedMotion:'reduce'});
  const still=await page.evaluate(()=>window.FHLS.landingViewer.getDiagnostics().camera);
  await page.waitForTimeout(250);
  assert.deepEqual(await page.evaluate(()=>window.FHLS.landingViewer.getDiagnostics().camera),still);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.ok((await intro.boundingBox()).height>=240);
  await page.screenshot({path:'/private/tmp/fhls-viewer-tests/home-moon-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await startMode('intermediate');
  const canvas=page.locator('#viewer-slot canvas');assert.equal(await canvas.isVisible(),true);
  // A real canvas click must reach T2's selection → analysis → flight path.
  const box=await canvas.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await page.waitForFunction(()=>window.FHLS.state.site && window.FHLS.viewer.getDiagnostics().selected && !window.FHLS.viewer.getDiagnostics().flying);
  const picked=await page.evaluate(()=>({site:window.FHLS.state.site,selected:window.FHLS.viewer.getDiagnostics().selected}));
  assert.ok(Math.abs(picked.site.lat-picked.selected.lat)<1e-8);
  await page.evaluate(()=>window.FHLS.setSite(-89.45,-137.3,'Shackleton rim'));
  await page.waitForFunction(()=>window.FHLS.viewer.getDiagnostics().selected?.lat===-89.45 && !window.FHLS.viewer.getDiagnostics().flying && window.FHLS.viewer.getStatus().terrain==='LOLA-40m');
  assert.match(await page.locator('#r-title').textContent(),/Shackleton rim/);
  await page.locator('#time-slider').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.evaluate(()=>window.FHLS.viewer.getStatus().time),'2027-01-01T00:00:00.000Z');
  const before=await page.evaluate(()=>window.FHLS.viewer.getDiagnostics().lightDirection);
  await page.locator('#time-slider').evaluate(el=>{el.value='1000';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.evaluate(()=>window.FHLS.state.hour),1000);
  const after=await page.evaluate(()=>window.FHLS.viewer.getDiagnostics().lightDirection);
  assert.ok(after.some((v,i)=>Math.abs(v-before[i])>.1));
  // Preserve a concrete site, hour and pin across every mode and Home round trip.
  await page.evaluate(()=>window.FHLS.pin());
  const beforeHome=await snapshot();
  const canvasCount=await page.locator('canvas').count();
  for(const mode of ['intermediate','beginner','advanced','beginner','advanced']){
    await home();
    assert.deepEqual(await snapshot(),beforeHome);
    await startMode(mode);
    await page.waitForFunction(()=>!window.FHLS.viewer.getDiagnostics().flying && window.FHLS.viewer.getStatus().terrain==='LOLA-40m');
    const current=await snapshot();assert.equal(current.mode,mode);
    assert.deepEqual(current.site,beforeHome.site);assert.deepEqual(current.pins,beforeHome.pins);assert.equal(current.hour,beforeHome.hour);
    assert.equal(await page.locator('canvas').count(),canvasCount);
    assert.equal(await page.locator('#sky').count(),1);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'home-from-app');
    beforeHome.mode=mode;
  }
  // Change → Back returns to the explorer; Home on the picker always means landing.
  await page.locator('#change-mode').click();await waitScreen('modes');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'modes-title');
  await page.locator('#back-to-landing').click();await readyExplorer();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'change-mode');
  await page.locator('#change-mode').click();await waitScreen('modes');
  await page.locator('#home-from-modes').focus();await page.keyboard.press('Enter');await waitScreen('landing');
  await page.evaluate(()=>window.FHLS.landingViewer.ready);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'landing-title');
  await startMode('beginner');
  // Persistent header works while inspecting a table or pins far down the page.
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  const homeBox=await page.locator('#home-from-app').boundingBox();
  assert.ok(homeBox.width>=44&&homeBox.height>=44);assert.ok(homeBox.y>=-1&&homeBox.y+homeBox.height<=844);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/private/tmp/fhls-viewer-tests/home-button-mobile.png',fullPage:true});
  await page.locator('#home-from-app').focus();await page.keyboard.press('Space');await waitScreen('landing');
  await page.evaluate(()=>window.FHLS.landingViewer.ready);
  await page.setViewportSize({width:1440,height:1000});await startMode('intermediate');
  // Home must cancel a real animated flight before the screen transition runs.
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForFunction(()=>!window.FHLS.viewer.getDiagnostics().flying);
  const interrupted = await page.evaluate(async()=>{
    window.departingViewer=window.FHLS.viewer;
    window.pendingFlight=window.departingViewer.flyTo(10,40);
    await Promise.resolve();
    const active=window.departingViewer.getDiagnostics().flying;
    document.getElementById('home-from-app').click();
    return active;
  });
  assert.equal(interrupted,true,'activate the real Home handler while the flight is active');
  await waitScreen('landing');await page.evaluate(()=>window.FHLS.landingViewer.ready);
  assert.equal((await page.evaluate(()=>window.pendingFlight)).cancelled,true);
  assert.equal(await page.evaluate(()=>window.departingViewer.getDiagnostics().flying),false);
  const stopped=await page.evaluate(()=>window.departingViewer.getDiagnostics().camera);
  await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(()=>window.departingViewer.getDiagnostics().camera),stopped);
  const rotatingHome=await page.evaluate(()=>window.FHLS.landingViewer.getDiagnostics().camera);
  await page.waitForFunction(before=>window.FHLS.landingViewer.getDiagnostics().camera.some((v,i)=>Math.abs(v-before[i])>1),rotatingHome,{timeout:10000});
  await page.emulateMedia({reducedMotion:'reduce'});await startMode('intermediate');
  await page.waitForFunction(()=>!window.FHLS.viewer.getDiagnostics().flying);
  await mkdir('/private/tmp/fhls-viewer-tests',{recursive:true});
  await page.screenshot({path:'/private/tmp/fhls-viewer-tests/t2-integration.png',fullPage:true});
  await page.evaluate(()=>window.FHLS.viewer.dispose());
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(failed,[]);
  console.log('PASS Home integration: all modes, five state-preserving round trips, picker Home/Back, sticky 44px mobile control, keyboard/focus, flight cancellation, rotating/static home Moon, single canvases, explorer picking/terrain/time; zero external requests or page errors.');
}finally{await browser.close();}
