'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,wait,mouse,dragFrom,cdp,base,artifacts,pass,previewConfigPath}){
  const Core=require('../assets/visual-editor-core.js');
  const svg='.context-map,.conditions-current-diagram,.module-map-canvas .module-diagram';
  const read=()=>evaluate('window.generalRoadViewport.get(document.querySelector('+JSON.stringify(svg)+')).read()');
  const angle=()=>evaluate('document.querySelector('+JSON.stringify(svg)+').querySelector("[data-initial-view-rotation]")?.transform.baseVal.getItem(0).angle||0');
  const near=(actual,expected)=>actual.forEach((n,i)=>assert(Math.abs(n-expected[i])<1e-6,JSON.stringify({actual,expected})));
  const field=async(name,value)=>evaluate('(()=>{const input=document.querySelector('+JSON.stringify('.iv-panel:not([hidden]) [data-iv-field="'+name+'"]')+');input.value='+JSON.stringify(String(value))+';input.dispatchEvent(new Event("change",{bubbles:true}))})()');
  const action=name=>click('.iv-panel:not([hidden]) [data-iv-action="'+name+'"]');
  const camera=id=>evaluate('window.visualLayoutEditor.store.config.imageViews['+JSON.stringify(id)+']');
  await navigate(base+'/presentation-demo/#context');
  const home=await read(),id=Core.imageView('context','g101-before').id;
  await click('.iv-trigger');assert.equal(await evaluate('document.querySelector(".iv-panel:not([hidden]) [data-iv-field=rotation]").value'),'0');
  await action('rotate-right');assert.equal(await angle(),90);assert.equal((await camera(id)).rotation,90);
  near(await read(),Core.viewBoxFor(home,{zoom:1,x:0,y:0,rotation:90}));
  assert(await evaluate('window.visualLayoutEditor.store.dirty'),'Rotation alone must mark settings unsaved');
  await action('rotate-left');assert.equal(await angle(),0);near(await read(),home);
  await field('rotation',-37.5);await field('zoom',145);await field('x',8);await field('y',-6);
  near(await read(),Core.viewBoxFor(home,{zoom:1.45,x:8,y:-6,rotation:-37.5}));
  await view('g101-conditions');const conditionsHome=await read(),conditionId=Core.imageView('g101-conditions','g101-before').id;
  await click('.iv-trigger');await field('rotation',180);assert.equal(await angle(),180);
  await view('context');assert.equal(await angle(),-37.5);near(await read(),Core.viewBoxFor(home,{zoom:1.45,x:8,y:-6,rotation:-37.5}));
  await view('g101-conditions');assert.equal(await angle(),180);near(await read(),conditionsHome);
  await action('reset');assert.equal(await angle(),0);near(await read(),conditionsHome);
  await click('[data-vl-action="undo"]');assert.equal(await angle(),180);
  await click('[data-vl-action="redo"]');assert.equal(await angle(),0);
  pass('rotation input and quarter-turn buttons preserve independent cameras; reset, undo and redo restore orientation');

  await view('context');
  // Close only for pointer access; stored angle remains while using existing viewport controls.
  await action('close');const point=await evaluate('(()=>{const r=document.querySelector(".context-map").getBoundingClientRect();return {x:r.left+r.width*.35,y:r.top+r.height*.45}})()');
  const before=JSON.stringify(await camera(id));
  await mouse('mouseWheel',point.x,point.y,{deltaY:-90,deltaX:0});await dragFrom(point.x,point.y,30,-18);
  const captured=await read();assert.equal(JSON.stringify(await camera(id)),before);
  await click('.iv-trigger');await action('capture');near(await read(),captured);assert.equal((await camera(id)).rotation,-37.5);
  await action('close');await mouse('mouseWheel',point.x,point.y,{deltaY:-70,deltaX:0});await click('.context-map-canvas .viewport-tools button');near(await read(),captured);assert.equal(await angle(),-37.5);
  fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));
  await navigate(base+'/presentation-demo/#context');near(await read(),captured);assert.equal(await angle(),-37.5);
  await view('g101-conditions');assert.equal(await angle(),0);assert.equal((await camera(conditionId)).rotation,0);
  pass('rotated diagrams still pan, zoom, capture and reset; JSON restores the same camera after a fresh load');

  // Source figures may already be rotated by Typst. User rotation composes with that transform.
  const target=await evaluate('(()=>{for(const doc of window.PresentationModules.contents)for(const flow of doc.submoduleFlows||[])for(const stage of flow.stages)if(stage.id==="diagram")for(const topic of stage.topics){const page=doc.pages.find(p=>p.id===topic.sourcePageId),asset=(topic.assets||page.assets).find(id=>doc.assets[id].rotation===90);if(asset)return {pageId:stage.pageId,topic:topic.id,asset};}})()');
  assert(target);await view(target.pageId);await click('[data-module-topic="'+target.topic+'"]');
  if(await evaluate('Boolean(document.querySelector("[data-module-view-select]"))'))await evaluate('(()=>{const select=document.querySelector("[data-module-view-select]");select.value='+JSON.stringify(target.asset)+';select.dispatchEvent(new Event("change",{bubbles:true}))})()');
  const moduleHome=await read(),sourceTransform=await evaluate('document.querySelector(".module-diagram image").parentElement.getAttribute("transform")');assert.match(sourceTransform,/rotate\(90\)/);
  await click('.iv-trigger');await action('rotate-right');assert.equal(await angle(),90);
  assert.equal(await evaluate('document.querySelector(".module-diagram image").parentElement.getAttribute("transform")'),sourceTransform);
  near(await read(),Core.viewBoxFor(moduleHome,{zoom:1,x:0,y:0,rotation:90}));
  assert.equal(await evaluate('document.querySelectorAll(".module-diagram [data-initial-view-rotation]").length'),1);
  const image=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'initial-rotation-module.png'),Buffer.from(image.data,'base64'));
  await action('reset');assert.equal(await angle(),0);near(await read(),moduleHome);
  assert.equal(await evaluate('document.querySelector(".module-diagram image").parentElement.getAttribute("transform")'),sourceTransform);
  pass('module rotation preserves the source figure orientation and existing drawing layers');

  // Exercise the native Chromium writer on a temporary browser file, never the project JSON.
  await view('context');await click('.iv-trigger');await field('rotation',90);
  await evaluate('(async()=>{const directory=await navigator.storage.getDirectory(),handle=await directory.getFileHandle("rotation-test.json",{create:true});const writable=await handle.createWritable();await writable.write(window.visualLayoutEditor.store.serialize());await writable.close();window.visualLayoutEditor.files.env={isSecureContext:true,indexedDB:window.indexedDB,showOpenFilePicker:async()=>[handle],showSaveFilePicker:async()=>handle}})()');
  await click('[data-vl-action="open"]');await wait('!window.visualLayoutEditor.busy');
  await field('rotation',-90);await action('save');await wait('!window.visualLayoutEditor.busy');
  assert.equal(await evaluate('(async()=>JSON.parse(await (await window.visualLayoutEditor.files.handle.getFile()).text()).imageViews['+JSON.stringify(id)+'].rotation)()'),-90);
  await navigate(base+'/presentation-demo/#context');assert.equal(await angle(),-90);assert.equal((await camera(id)).rotation,-90);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await click('.iv-trigger');
  assert(await evaluate('(()=>{const r=document.querySelector(".iv-panel:not([hidden])").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const panelImage=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'initial-rotation-panel.png'),Buffer.from(panelImage.data,'base64'));
  pass('native file saving and remembered handles restore rotation after reload; settings remain accessible on narrow screens');
};
