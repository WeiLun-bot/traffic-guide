'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,dragFrom,cdp,base,artifacts,pass,previewConfigPath}){
 const baseline=fs.readFileSync(previewConfigPath,'utf8'),config=JSON.parse(baseline);
 for(const value of Object.values(config.legacyState.highlights))delete value.rotation;
 fs.writeFileSync(previewConfigPath,JSON.stringify(config));
 const choose=async(selector,value)=>evaluate('(()=>{const input=document.querySelector('+JSON.stringify(selector)+');if(!input)throw new Error("Missing field: "+'+JSON.stringify(selector)+');input.value='+JSON.stringify(String(value))+';input.dispatchEvent(new Event("change",{bubbles:true}))})()');
 const frame=()=>evaluate('(()=>{const f=window.generalRoadPresentation.editorFrames()[0];return {key:f.key,box:f.getBox(),crop:f.getCrop?.(),rotation:window.generalRoadEditor.rotation(f.key),width:f.width,height:f.height}})()');
 const enter=async()=>{if(!await evaluate('window.generalRoadEditor.editing'))await click('.edit-toggle');if(!await evaluate('window.generalRoadEditor.adjusting'))await click('.editor-highlight');await evaluate('(async()=>{for(let i=0;i<120;i++){const f=window.generalRoadPresentation.editorFrames()[0];if(f.element.id!=="main-map")break;const v=f.element.getAttribute("viewBox").split(/\\s+/).map(Number);if(v.every((n,j)=>Math.abs(n-[0,0,f.width,f.height][j])<.01))break;await new Promise(requestAnimationFrame)}})()');};
 const leave=async()=>{if(await evaluate('window.generalRoadEditor.editing'))await click('.edit-toggle');};
 const contains=()=>evaluate('(()=>{const f=window.generalRoadPresentation.editorFrames()[0],r=window.VisualLayoutCore.highlightBounds(f.getBox(),window.generalRoadEditor.rotation(f.key)),c=f.getCrop?.()||[0,0,f.width,f.height];return r[0]>=c[0]-.1&&r[1]>=c[1]-.1&&r[0]+r[2]<=c[0]+c[2]+.1&&r[1]+r[3]<=c[1]+c[3]+.1})()');
 const shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
 try{
  await navigate(base+'/presentation-demo/#edge');await enter();assert.equal((await frame()).rotation,0);
  await choose('[data-highlight-rotation]',37);assert.equal((await frame()).rotation,37);assert(await contains());
  assert.match(await evaluate('document.querySelector("#selection-box").getAttribute("transform")'),/^rotate\(37 /);
  assert.match(await evaluate('document.querySelector("#selection-corners").getAttribute("transform")'),/^rotate\(37 /);
  assert.equal(await evaluate('document.querySelector("#selection-label").hasAttribute("transform")'),false);
  assert.match(await evaluate('document.querySelector("#map-shade").getAttribute("d")'),/L/);
  await click('[data-vl-action="undo"]');assert.equal((await frame()).rotation,0);await click('[data-vl-action="redo"]');assert.equal((await frame()).rotation,37);
  await choose('[data-highlight-rotation]',999);assert.equal((await frame()).rotation,37);
  await choose('[data-frame-target]','crop');assert.equal(await evaluate('document.querySelectorAll("[data-highlight-rotation],[data-handle=rotate]").length'),0);await choose('[data-frame-target]','box');
  await click('[data-rotate-highlight="15"]');assert.equal((await frame()).rotation,52);await click('[data-rotate-highlight="0"]');assert.equal((await frame()).rotation,0);
  await choose('[data-highlight-rotation]',37);await shot('highlight-rotation-general');
  pass('general article highlight, corners and shade rotate together; crop contains the rotated frame, invalid input is rejected, and history and quick controls work');

  await leave();fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));await navigate(base+'/presentation-demo/#g204-curve-option-3');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'g204-curve-option-3');await enter();await choose('[data-highlight-rotation]',29);assert.equal((await frame()).rotation,29);assert(await contains());
  assert.match(await evaluate('document.querySelector("#selection-box").getAttribute("transform")'),/^rotate\(29 /);await leave();
  await view('m101-lanes-diagram');await enter();await choose('[data-highlight-rotation]',32);assert.equal((await frame()).rotation,32);
  assert.match(await evaluate('document.querySelector(".module-focus-rect").getAttribute("transform")'),/^rotate\(32 /);
  const saved=await frame();await click('[data-toggle-module-frame]');assert.equal(await evaluate('document.querySelectorAll(".module-focus-rect").length'),0);await click('[data-toggle-module-frame]');assert.equal((await frame()).rotation,32);
  await leave();await view('m101-lanes-diagram');assert.equal((await frame()).rotation,saved.rotation);
  pass('quarter-turn source drawings use the same controls; module preview, deletion and restoration retain each explanation’s own angle');

  const rotated=await evaluate('(()=>{for(const doc of window.PresentationModules.contents)for(const flow of doc.submoduleFlows||[])for(const stage of flow.stages)if(stage.id==="diagram")for(const topic of stage.topics){const source=doc.pages.find(page=>page.id===topic.sourcePageId),asset=(topic.assets||source.assets).find(id=>doc.assets[id].rotation===90);if(asset)return {pageId:stage.pageId,topicId:topic.id,asset};}})()');assert(rotated);
  await view(rotated.pageId);await click('[data-module-topic="'+rotated.topicId+'"]');if(await evaluate('Boolean(document.querySelector("[data-module-view-select]"))'))await choose('[data-module-view-select]',rotated.asset);
  await click('.iv-trigger');await choose('.iv-panel:not([hidden]) [data-iv-field="rotation"]',37);await click('.iv-panel:not([hidden]) [data-iv-action="close"]');await enter();
  if(!(await frame()).box||await evaluate('document.querySelector("[data-toggle-module-frame]").dataset.frameToggleState!=="delete"'))await click('[data-toggle-module-frame]');
  await choose('[data-highlight-rotation]',25);
  await evaluate('document.querySelector(".module-diagram").scrollIntoView({block:"center"})');
  const pointer=await evaluate('(()=>{const f=window.generalRoadPresentation.editorFrames()[0],h=f.element.querySelector("[data-handle=rotate]"),m=f.coordinateElement.getScreenCTM(),p=new DOMPoint(+h.getAttribute("cx"),+h.getAttribute("cy")).matrixTransform(h.parentElement.getScreenCTM()),b=f.getBox(),center=new DOMPoint(b[0]+b[2]/2,b[1]+b[3]/2).matrixTransform(m),a=Math.PI/6,dx=p.x-center.x,dy=p.y-center.y;return {x:p.x,y:p.y,dx:dx*Math.cos(a)-dy*Math.sin(a)-dx,dy:dx*Math.sin(a)+dy*Math.cos(a)-dy}})()');
  const history=await evaluate('window.visualLayoutEditor.store.past.length');await dragFrom(pointer.x,pointer.y,pointer.dx,pointer.dy);assert(Math.abs((await frame()).rotation-55)<.2,JSON.stringify(await frame()));assert.equal(await evaluate('window.visualLayoutEditor.store.past.length'),history+1,'A rotation gesture must be one undo step');
  assert.match(await evaluate('document.querySelector(".module-artwork").getAttribute("transform")'),/rotate\(90\)/);assert(await contains());
  const before=await frame();
  const resize=await evaluate('(()=>{const f=window.generalRoadPresentation.editorFrames()[0],h=f.element.querySelector("[data-handle=se]"),p=new DOMPoint(+h.getAttribute("x")+(+h.getAttribute("width"))/2,+h.getAttribute("y")+(+h.getAttribute("height"))/2).matrixTransform(h.parentElement.getScreenCTM());return {x:p.x,y:p.y}})()');
  await dragFrom(resize.x,resize.y,8,5);const after=await frame();assert.notDeepEqual(after.box,before.box);assert.equal(after.rotation,before.rotation);
  assert(await evaluate('(()=>{const f=window.generalRoadPresentation.editorFrames()[0],b='+JSON.stringify(before.box)+',a=window.VisualLayoutCore.highlightCorners(b,'+before.rotation+')[0],c=window.VisualLayoutCore.highlightCorners(f.getBox(),'+before.rotation+')[0];return Math.hypot(a[0]-c[0],a[1]-c[1])<.3})()'));
  const cancelSnapshot=await evaluate('window.visualLayoutEditor.store.serialize()');
  await evaluate('(()=>{const f=window.generalRoadPresentation.editorFrames()[0],h=f.element.querySelector("[data-handle=rotate]"),p=new DOMPoint(+h.getAttribute("cx"),+h.getAttribute("cy")).matrixTransform(h.parentElement.getScreenCTM());h.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,button:0,pointerId:99,clientX:p.x,clientY:p.y}));h.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,pointerId:99,clientX:p.x+30,clientY:p.y+20}));h.dispatchEvent(new KeyboardEvent("keydown",{bubbles:true,key:"Escape"}));})()');
  assert.equal(await evaluate('window.visualLayoutEditor.store.serialize()'),cancelSnapshot,'Escape must cancel a rotation without modifying JSON or history');
  await evaluate('document.querySelector("[data-handle=rotate]").dispatchEvent(new KeyboardEvent("keydown",{bubbles:true,key:"ArrowRight",shiftKey:true}))');assert.equal((await frame()).rotation,after.rotation+15);
  await evaluate('document.querySelector("[data-handle=rotate]").dispatchEvent(new KeyboardEvent("keydown",{bubbles:true,key:"ArrowLeft"}))');assert.equal((await frame()).rotation,after.rotation+14);
  await shot('highlight-rotation-module');await leave();
  pass('mouse rotation and rotated-corner resizing work with source 90° plus image 37°; one gesture is one undo step, Escape cancels, and keyboard rotation works');

  await view('edge');await enter();await evaluate('window.generalRoadEditor.addPage("compare")');
  if(!await evaluate('window.generalRoadEditor.adjusting'))await click('.editor-highlight');
  assert.equal(await evaluate('window.generalRoadPresentation.editorFrames().length'),2);
  const keys=await evaluate('window.generalRoadPresentation.editorFrames().map(f=>f.key)');
  await choose('[data-controls-key="'+keys[0]+'"] [data-highlight-rotation]',-18);await choose('[data-controls-key="'+keys[1]+'"] [data-highlight-rotation]',41);
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".custom-highlight")].map(n=>n.transform.baseVal.getItem(0).angle)'),[-18,41]);
  const custom=await evaluate('window.generalRoadPresentation.page.id');await leave();
  fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));await navigate(base+'/presentation-demo/#'+custom);
  assert.deepEqual(await evaluate('window.generalRoadPresentation.editorFrames().map(f=>window.generalRoadEditor.rotation(f.key))'),[-18,41]);await view('edge');assert.equal((await frame()).rotation,37);await view('m101-lanes-diagram');assert.equal((await frame()).rotation,32);
  await enter();await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));assert(await evaluate('Boolean(document.querySelector("[data-highlight-rotation]"))'));await shot('highlight-rotation-mobile');
  pass('custom comparison boxes rotate independently; general, module and custom angles survive JSON reload, and the controls fit narrow screens');
 }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
