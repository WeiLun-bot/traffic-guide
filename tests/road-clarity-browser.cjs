'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,view,navigate,click,wait,cdp,base,artifacts,pass,previewConfigPath,projectFixture})=>{
  const run=fn=>evaluate('('+fn.toString()+')()');
  await navigate(base+'/presentation-demo/#results-wrap');await click('#next');
  assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-road-clarity');
  const source=await run(()=>document.querySelector('.road-clarity-figure image').getAttribute('href'));
  assert(decodeURI(source).endsWith('materials/05-複雜道路情境/C1-08/C1-08_渦輪圓環交通設施設置圖例.svg'));
  assert.equal(await run(()=>document.querySelectorAll('.road-flow-dot,[data-road-dot]').length),0);
  const style=await run(()=>[...document.querySelectorAll('.road-flow-path')].map(p=>{const s=getComputedStyle(p);return {stroke:s.stroke,glow:s.filter,dash:s.strokeDasharray};}));
  assert.equal(style.length,3);assert.equal(new Set(style.map(s=>s.stroke)).size,3);for(const s of style){assert.notEqual(s.stroke,'none');assert.match(s.glow,/drop-shadow/);assert.notEqual(s.dash,'none');assert(Math.abs(parseFloat(s.dash)-40/3)<.001);}
  const alignment=await run(async()=>{
    const image=new Image();image.src=document.querySelector('.road-clarity-figure image').getAttribute('href');await image.decode();
    const canvas=document.createElement('canvas');canvas.width=2275;canvas.height=1924;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,2275,1924);const pixels=ctx.getImageData(0,0,2275,1924).data;
    return [...document.querySelectorAll('.road-flow-path')].map(path=>{const length=path.getTotalLength();let samples=0,onRoad=0;for(let i=1;i<100;i++){const point=path.getPointAtLength(i/100*length),x=Math.round(point.x),y=Math.round(point.y);if(x<0||x>=2275||y<0||y>=1924)continue;const offset=(y*2275+x)*4,[r,g,b,a]=pixels.slice(offset,offset+4);samples++;if(a>200&&r>165&&r<215&&Math.max(r,g,b)-Math.min(r,g,b)<8)onRoad++;}return {route:path.dataset.roadRoute,samples,onRoad};});
  });
  for(const route of alignment)assert(route.onRoad/route.samples>.9,'Vehicle path leaves the road or follows painted lines: '+JSON.stringify(route));
  assert.deepEqual(await run(()=>[...document.querySelectorAll('.road-clarity-copy h2')].map(node=>node.textContent)),['車道流向的自明性','行駛動線的明確性']);
  const offsets=()=>run(async()=>{const p=document.querySelector('.road-flow-path'),a=getComputedStyle(p).strokeDashoffset;await new Promise(resolve=>setTimeout(resolve,180));return [a,getComputedStyle(p).strokeDashoffset];});
  const moving=await offsets();assert.notEqual(moving[0],moving[1]);
  await click('[data-road-flow-toggle]');const paused=await offsets();assert.equal(paused[0],paused[1]);await click('[data-road-flow-toggle]');
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});const reduced=await offsets();assert.equal(reduced[0],reduced[1]);await cdp.send('Emulation.setEmulatedMedia',{features:[]});
  for(const [width,height]of [[1600,1000],[1280,800],[1920,1200],[1326,830],[390,844]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await view('results-road-clarity');
    const bounds=await run(()=>{const main=document.getElementById('presentation'),cards=[...document.querySelectorAll('.road-clarity-copy article')];return {x:document.documentElement.scrollWidth-innerWidth,y:main.scrollHeight-main.clientHeight,cards:cards.map(card=>({overflow:card.scrollHeight-card.clientHeight,clipped:card.querySelector('p').getBoundingClientRect().bottom-card.getBoundingClientRect().bottom}))};});assert(bounds.x<=1,JSON.stringify({width,bounds}));if(width>900)assert(bounds.y<=2,JSON.stringify({width,bounds}));for(const card of bounds.cards)assert(card.overflow<=2&&card.clipped<=2,JSON.stringify({width,bounds}));
    if(width===1600){const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'road-clarity-1600.png'),Buffer.from(shot.data,'base64'));}
  }
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});await view('results-road-clarity');
  await click('.edit-toggle');await click('[data-road-path-edit]');
  assert.equal(await run(()=>window.RoadFlowEditor.isOpen),true);
  await run(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
  const node=await run(()=>{const svg=document.querySelector('.road-clarity-figure svg'),r=svg.getBoundingClientRect();for(const node of document.querySelectorAll('[data-road-node]')){const b=node.getBoundingClientRect();if(b.left>r.left+40&&b.right<r.right-40&&b.top>r.top+40&&b.bottom<r.bottom-40)return {index:Number(node.dataset.roadNode),x:b.left+b.width/2,y:b.top+b.height/2};}return null;});assert(node,'No visible route node');
  const originalPaths=await run(()=>[...document.querySelectorAll('.road-flow-path')].map(path=>path.getAttribute('d')));
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:node.x,y:node.y,button:'left',buttons:1,clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:node.x,y:node.y,button:'left',buttons:0,clickCount:1});
  assert.equal(await run(()=>Boolean(window.visualLayoutEditor.store.config.roadFlowPaths['results-road-clarity'])),false,'Selecting a node changed the saved path');
  await run(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  Object.assign(node,await run(()=>{const b=document.querySelector('.road-path-node.is-selected').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};}));
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:node.x,y:node.y});await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:node.x,y:node.y,button:'left',buttons:1,clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:node.x+16,y:node.y-10,buttons:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:node.x+16,y:node.y-10,button:'left',buttons:0,clickCount:1});
  const stored=await run(()=>window.visualLayoutEditor.store.config.roadFlowPaths['results-road-clarity']);assert(stored&&stored.routes.length===1);assert.equal(stored.assetKey,'results:c1-08-layout');
  const edited=await run(()=>document.querySelector('.road-flow-path').getAttribute('d'));assert.notEqual(edited,originalPaths[0]);assert.deepEqual(await run(()=>[...document.querySelectorAll('.road-flow-path')].slice(1).map(path=>path.getAttribute('d'))),originalPaths.slice(1));
  const count=stored.routes[0].points.length;await click('[data-rp-add]');
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:node.x+22,y:node.y+12,button:'left',buttons:1,clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:node.x+22,y:node.y+12,button:'left',buttons:0,clickCount:1});
  assert.equal(await run(()=>document.querySelectorAll('[data-road-node]').length),count+1);await click('[data-rp-remove]');assert.equal(await run(()=>document.querySelectorAll('[data-road-node]').length),count);
  assert.equal(await run(()=>document.querySelector('.road-flow-path').getAttribute('d')),edited);
  const editorShot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'road-path-editor-1600.png'),Buffer.from(editorShot.data,'base64'));
  await click('[data-rp-reset]');assert.equal(await run(()=>document.querySelector('.road-flow-path').getAttribute('d')),originalPaths[0]);
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:2});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers:2});
  await wait('document.querySelector(".road-flow-path")?.getAttribute("d")==='+JSON.stringify(edited),'Undo did not restore the route');
  await click('[data-rp-save]');
  await wait('document.querySelector(".road-path-note").textContent.includes("路線已寫入專案")','Route save was not confirmed');
  const disk=JSON.parse(fs.readFileSync(path.join(projectFixture,'layout/presentation-layout.json'),'utf8'));assert.deepEqual(disk.roadFlowPaths['results-road-clarity'],stored,'Actual save endpoint dropped route geometry');
  assert.equal(await run(()=>window.visualLayoutEditor.store.dirty),false);
  await click('[data-rp-close]');await navigate(base+'/presentation-demo/#results-road-clarity');
  assert.equal(await run(()=>document.querySelector('.road-flow-path').getAttribute('d')),edited,'Saved route did not survive reload');
  await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-road-system');await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-guide-experience-1');await click('#previous');await click('#previous');await click('#previous');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-wrap');
  pass('Road clarity: original muted short flowing streaks without circular heads, pause/reduced motion, draggable/addable/removable route nodes, independent paths, reset/undo, saved reload, 16:10 layout and slide order');
};
