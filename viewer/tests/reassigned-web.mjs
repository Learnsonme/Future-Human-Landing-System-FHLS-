// M7/M8/M13/M14: real website integration, no synthetic astronomy or external traffic.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.FHLS_PLAYWRIGHT||'playwright');
const base=process.env.FHLS_TEST_URL||'http://127.0.0.1:8765',out='/private/tmp/fhls-viewer-tests';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],bad=[],external=[],results=[];
async function make(options={}){
 const p=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce',colorScheme:'light',...options});
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 p.on('response',r=>{if(r.status()>=400)bad.push(r.url());});
 await p.route('**/*',r=>{const u=r.request().url();if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return r.continue();external.push(u);return r.abort();});
 return p;
}
async function boot(p){await p.goto(base+'/web/');await p.locator('#fhls-loading').waitFor({state:'detached'});await p.evaluate(()=>FHLS.ready);}
async function screen(p,name){await p.waitForFunction(n=>document.body.dataset.screen===n&&!document.getElementById('transition').classList.contains('is-running'),name);}
async function enter(p,mode){await p.locator('#start').click();await screen(p,'modes');await p.locator(`.mode[data-mode=${mode}]`).click();await screen(p,'app');await p.evaluate(()=>FHLS.viewer.ready);}
const pins=p=>p.evaluate(()=>FHLS.viewer.getDiagnostics().markers);
async function contrast(p) {
 const palette=await p.evaluate(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(['text','muted','sun','earth','both','bg','surface'].map(k=>[k,s.getPropertyValue('--'+k).trim()]));});
 const lum=hex=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
 for(const key of ['text','muted','sun','earth','both'])for(const bg of ['bg','surface']){const a=lum(palette[key]),b=lum(palette[bg]);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${key} against ${bg} lacks contrast`);}
}
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
try{
 const p=await make();await boot(p);
 assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'light');await contrast(p);
 await p.locator('.mission-credit').scrollIntoViewIfNeeded();
 await p.locator('.mission-credit img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));
 const logos=await p.locator('.mission-credit img').evaluateAll(nodes=>nodes.map(n=>({src:n.getAttribute('src'),height:n.getBoundingClientRect().height,ready:n.complete&&n.naturalWidth>0,filter:getComputedStyle(n).filter,opacity:getComputedStyle(n).opacity})));
 assert.equal(logos.length,2);for(const l of logos){assert.equal(l.height,32);assert.equal(l.ready,true);assert.equal(l.filter,'none');assert.equal(l.opacity,'0.8');}
 assert.ok(logos[0].src.includes('app_logo-64h.png'));assert.ok(logos[1].src.includes('fhls-mark-512.png'));
 assert.equal(await p.locator('link[rel=icon]').count(),1);
 await p.emulateMedia({colorScheme:'dark'});await p.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 await p.emulateMedia({colorScheme:'light'});await p.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 const toggle=p.locator('#theme-toggle');await toggle.click();assert.equal(await p.evaluate(()=>localStorage.getItem('fhls.theme')),'dark');
 await p.emulateMedia({colorScheme:'light'});assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'dark');
 await p.reload();await p.locator('#fhls-loading').waitFor({state:'detached'});assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'dark');
 await p.locator('#theme-toggle').click();assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'light');
 await p.evaluate(()=>{const b=document.createElement('div');b.id='netlify-badge';Object.assign(b.style,{position:'fixed',right:'0',bottom:'0',width:'180px',height:'64px'});document.body.append(b);});
 await p.waitForFunction(()=>parseFloat(document.getElementById('theme-toggle').style.bottom)>=76);
 const bt=await p.locator('#theme-toggle').boundingBox(),nb=await p.locator('#netlify-badge').boundingBox();
 assert.equal(overlap(bt,nb),false,JSON.stringify({bt,nb,style:await p.locator('#theme-toggle').evaluate(n=>({position:getComputedStyle(n).position,bottom:getComputedStyle(n).bottom,transform:getComputedStyle(n).transform,parent:n.parentElement.id}))}));
 await p.locator('#netlify-badge').evaluate(n=>{n.style.height='96px';});
 await p.waitForFunction(()=>parseFloat(document.getElementById('theme-toggle').style.bottom)>=108);
 await p.locator('#netlify-badge').evaluate(n=>n.remove());await p.waitForFunction(()=>document.getElementById('theme-toggle').style.bottom==='16px');
 await enter(p,'beginner');
 assert.equal(await p.locator('#screen-app').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(244, 242, 237)');
 assert.equal(await p.locator('#date').evaluate(n=>getComputedStyle(n).colorScheme),'light');
 assert.equal(await p.locator('#viewer-slot').evaluate(n=>getComputedStyle(n).getPropertyValue('--text').trim()),'#ECE9E2');
 const canvasCount=await p.locator('canvas').count();
 for(const [lat,lon,name]of [[12,-32,'Near side'],[-30,-10,'Southern test'],[60,-20,'Northern test']]){
  await p.evaluate(([lat,lon,name])=>FHLS.setSite(lat,lon,name),[lat,lon,name]);
  await p.locator('#pin-site').click();
 }
 let markers=await pins(p);assert.equal(markers.length,3);assert.deepEqual(markers.map(m=>m.label),['1','2','3']);
 assert.deepEqual(await p.locator('.pin-number').allTextContents(),['1','2','3']);
 const ids=markers.map(m=>m.id);
 await p.getByRole('button',{name:'Remove pin 2: Southern test',exact:true}).click();
 markers=await pins(p);assert.deepEqual(markers.map(m=>m.id),[ids[0],ids[2]]);assert.deepEqual(markers.map(m=>m.label),['1','2']);
 assert.deepEqual(await p.locator('.pin-number').allTextContents(),['1','2']);
 assert.equal(await p.locator('.fhls-marker.is-active').count(),1);
 await p.setViewportSize({width:375,height:812});await p.locator('#compare').scrollIntoViewIfNeeded();
 let button=await p.locator('#theme-toggle').boundingBox();for(const card of await p.locator('.pin-card').all())assert.equal(overlap(button,await card.boundingBox()),false);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await p.screenshot({path:out+'/reassigned-light-pins-375.png'});
 for(const mode of ['beginner','intermediate','advanced']){
  await p.locator('#home-from-app').click();await screen(p,'landing');await p.evaluate(()=>FHLS.landingViewer.ready);
  await enter(p,mode);assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'light');
  assert.deepEqual((await pins(p)).map(m=>[m.id,m.label]),[[ids[0],'1'],[ids[2],'2']]);
  assert.equal(await p.locator('canvas').count(),canvasCount);
 }
 await p.locator('#theme-toggle').focus();await p.keyboard.press('Space');assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'dark');
 await p.waitForTimeout(50);assert.equal(await p.locator('.theme-chart-snapshot').count(),0,'reduced motion must not create chart fades');
 await contrast(p);await p.screenshot({path:out+'/reassigned-dark-app-375.png'});
 await p.locator('[data-cam=full]').click();
 await p.waitForFunction(()=>document.fullscreenElement||document.querySelector('.stage.is-fullscreen'));
 assert.equal(await p.locator('#theme-toggle').isVisible(),true);
 const fsbox=await p.locator('#theme-toggle').boundingBox();assert.ok(fsbox.y>=0&&fsbox.y+fsbox.height<=await p.evaluate(()=>innerHeight));
 await p.locator('.fs-exit').click();
 await p.waitForFunction(()=>!document.fullscreenElement&&!document.querySelector('.stage.is-fullscreen'));
 await p.locator('#clear-pins').click();assert.equal((await pins(p)).length,0);assert.equal(await p.locator('.pin-card').count(),0);
 results.push({case:'logos, themes, pin IDs/renumber/removal, all modes, Home, 375px layout',pass:true});await p.close();
 console.log('PASS M7/M8/M13 integrated desktop/mobile, all modes, retained pins and theme');
 // Without storage the system default and manual toggle must still work.
 const blocked=await make();await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('blocked','SecurityError');}}));
 await boot(blocked);assert.equal(await blocked.evaluate(()=>document.documentElement.dataset.theme),'light');await blocked.locator('#theme-toggle').click();assert.equal(await blocked.evaluate(()=>document.documentElement.dataset.theme),'dark');
 results.push({case:'blocked storage',pass:true});await blocked.close();
 // Native motion: timing, inward-only movement, no re-entry on live figure changes.
 const motion=await make({reducedMotion:'no-preference',colorScheme:'dark'});await boot(motion);
 await motion.locator('#start').click();await motion.waitForFunction(()=>document.body.dataset.screen==='modes');
 const effects=await motion.evaluate(()=>document.getElementById('screen-modes').getAnimations({subtree:true}).filter(a=>a.id.startsWith('fhls-text:')).map(a=>({timing:a.effect.getTiming(),frames:a.effect.getKeyframes()})));
 assert.ok(effects.length>0);for(const e of effects){assert.ok(e.timing.duration+e.timing.delay<=500);assert.equal(e.timing.easing,'cubic-bezier(0.4, 0, 0.2, 1)');assert.ok(e.frames[0].transform.includes('translateX('));}
 await motion.emulateMedia({reducedMotion:'reduce'});await motion.waitForFunction(()=>!document.getElementById('screen-modes').getAnimations({subtree:true}).some(a=>a.id.startsWith('fhls-text:')));
 await motion.locator('.mode[data-mode=advanced]').click();await screen(motion,'app');await motion.evaluate(()=>FHLS.viewer.ready);
 await motion.emulateMedia({reducedMotion:'no-preference'});
 await motion.evaluate(()=>FHLS.setSite(12,-32,'Motion test'));await motion.waitForTimeout(600);
 const entry=await motion.locator('#r-body').getAttribute('data-text-entrances');assert.ok(entry);
 await motion.locator('#time-slider').evaluate(n=>{n.value='1000';n.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await motion.locator('#r-body').getAttribute('data-text-entrances'),entry);
 assert.equal(await motion.locator('#r-body').evaluate(n=>n.getAnimations({subtree:true}).filter(a=>a.id.startsWith('fhls-text:')).length),0);
 const before=await motion.evaluate(()=>FHLS.viewer.getDiagnostics().sunDirection);
 await motion.locator('#theme-toggle').click();assert.equal(await motion.evaluate(()=>document.documentElement.dataset.theme),'light');
 await motion.waitForTimeout(400);assert.equal(await motion.locator('.theme-chart-snapshot').count(),0);
 assert.deepEqual(await motion.evaluate(()=>FHLS.viewer.getDiagnostics().sunDirection),before);
 await motion.screenshot({path:out+'/reassigned-light-app-1280.png'});
 await motion.locator('#home-from-app').click();await screen(motion,'landing');await motion.locator('#start').click();await motion.waitForFunction(()=>document.body.dataset.screen==='modes');
 assert.equal(await motion.locator('#screen-modes').getAttribute('data-text-entrances'),'1');
 assert.equal(await motion.locator('#screen-modes').evaluate(n=>n.getAnimations({subtree:true}).filter(a=>a.id.startsWith('fhls-text:')).length),0);
 results.push({case:'motion timings, live reduced setting, no replay on hour/Home, chart theme redraw and real Sun unchanged',pass:true});await motion.close();
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);assert.deepEqual(external,[]);
 await writeFile(out+'/reassigned-web.json',JSON.stringify({results,errors,bad,external},null,2));console.log('PASS M14 and all reassigned task checks');
}finally{await browser.close();}
