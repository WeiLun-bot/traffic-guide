'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,wait,dragFrom,cdp,base,artifacts,pass,previewConfigPath,editText}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),config=JSON.parse(baseline);
  for(const name of ['highlights','disabledHighlights','images'])for(const key of Object.keys(config.legacyState[name]))if(key.startsWith('module:'))delete config.legacyState[name][key];
  fs.writeFileSync(previewConfigPath,JSON.stringify(config));
  const frame=()=>evaluate('(()=>{const frame=window.generalRoadPresentation.editorFrames()[0];return {key:frame.key,box:frame.getBox(),hasBox:frame.hasBox}})()');
  const rects=()=>evaluate('document.querySelectorAll(".module-focus-rect").length');
  const choose=async(selector,value)=>evaluate('(()=>{const node=document.querySelector('+JSON.stringify(selector)+');node.value='+JSON.stringify(String(value))+';node.dispatchEvent(new Event("change",{bubbles:true}))})()');
  const toggle=()=>click('[data-toggle-module-frame]');
  const shot=async name=>{await evaluate('document.fonts.ready');const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  await navigate(base+'/presentation-demo/#m101-lanes-diagram');assert.equal(await rects(),1);assert.equal((await frame()).key,'module:m101-lanes-diagram:dotted-width');
  await click('[data-module-point="dotted-length"]');assert.equal((await frame()).key,'module:m101-lanes-diagram:dotted-length');
  assert(await evaluate('document.querySelector("[data-module-point=dotted-length]").getAttribute("aria-pressed")==="true"'));
  for(const topic of ['arrows','advance','guide','channel','waiting']){await click('[data-module-topic="'+topic+'"]');assert.equal(await rects(),1);assert((await frame()).hasBox);}
  await shot('module-highlight-preview');
  pass('all six M1-01.1 diagram topics show their own highlight; selecting a description changes the highlighted position');

  await click('.edit-toggle');await click('.editor-highlight');assert(await evaluate('Boolean(document.querySelector("[data-module-highlight-point]"))'));
  const before=await frame();await choose('.editor-highlight-controls [data-bound-index="0"]',before.box[0]+5);assert.equal((await frame()).box[0],before.box[0]+5);
  await toggle();assert.equal(await rects(),0);assert(await evaluate('document.querySelector("[data-toggle-module-frame]").textContent==="恢復打亮框"'));assert.equal(await evaluate('document.querySelectorAll(".editor-handle-layer").length'),0);
  assert(await evaluate('window.generalRoadEditor.state.highlights['+JSON.stringify(before.key)+'].deleted'));
  await click('[data-vl-action="undo"]');assert.equal(await rects(),1);await click('[data-vl-action="redo"]');assert.equal(await rects(),0);
  await toggle();assert.equal(await rects(),1);assert.equal((await frame()).box[0],before.box[0]+5);
  await toggle();await click('.edit-toggle');fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));await navigate(base+'/presentation-demo/#m101-lanes-diagram/topic-waiting');assert.equal(await rects(),0);
  await click('.edit-toggle');await click('.editor-highlight');await toggle();assert.equal(await rects(),1);assert.equal((await frame()).box[0],before.box[0]+5);await click('.edit-toggle');
  pass('frame edits, deletion, restore, undo/redo and JSON reload retain the chosen position and deletion state');

  const rotated=await evaluate('(()=>{for(const doc of window.PresentationModules.contents)for(const flow of doc.submoduleFlows||[])for(const stage of flow.stages)if(stage.id==="diagram")for(const topic of stage.topics){const source=doc.pages.find(page=>page.id===topic.sourcePageId),asset=(topic.assets||source.assets).find(id=>doc.assets[id].rotation===90);if(asset)return {pageId:stage.pageId,topicId:topic.id,asset};}})()');assert(rotated);
  await view(rotated.pageId);await click('[data-module-topic="'+rotated.topicId+'"]');
  if(await evaluate('Boolean(document.querySelector("[data-module-view-select]"))'))await choose('[data-module-view-select]',rotated.asset);
  assert.equal(await rects(),0);assert((await frame()).hasBox===false);
  await click('.iv-trigger');await choose('.iv-panel:not([hidden]) [data-iv-field="rotation"]',37);await click('.iv-panel:not([hidden]) [data-iv-action="close"]');
  await click('.edit-toggle');assert.equal(await evaluate('document.querySelector(".editor-highlight").disabled'),false);await click('.editor-highlight');assert.equal(await evaluate('document.querySelector("[data-toggle-module-frame]").textContent'),'新增打亮框');
  await toggle();assert.equal(await rects(),1);const newFrame=await frame();
  await evaluate('document.querySelector(".module-diagram").scrollIntoView({block:"center"})');
  const pointer=await evaluate('(()=>{const frame=window.generalRoadPresentation.editorFrames()[0],box=frame.getBox(),point=new DOMPoint(box[0]+box[2]/2,box[1]+box[3]/2).matrixTransform(frame.coordinateElement.getScreenCTM());const m=frame.coordinateElement.getScreenCTM().inverse(),a=new DOMPoint(point.x,point.y).matrixTransform(m),b=new DOMPoint(point.x+20,point.y+12).matrixTransform(m);return {x:point.x,y:point.y,dx:b.x-a.x,dy:b.y-a.y}})()');
  await dragFrom(pointer.x,pointer.y,20,12);const moved=await frame();assert(Math.abs(moved.box[0]-newFrame.box[0]-pointer.dx)<.3,JSON.stringify({newFrame,moved,pointer}));assert(Math.abs(moved.box[1]-newFrame.box[1]-pointer.dy)<.3,JSON.stringify({newFrame,moved,pointer}));
  assert.match(await evaluate('document.querySelector(".module-artwork").getAttribute("transform")'),/rotate\(90\)/);
  const transform=await evaluate('(()=>{const svg=document.querySelector(".module-diagram"),layer=svg.querySelector(".module-hotspot-layer"),handle=svg.querySelector(".editor-handle-layer");return [layer.parentElement.classList.contains("module-artwork"),handle.parentElement===layer.parentElement,svg.querySelector("[data-initial-view-rotation]").transform.baseVal.getItem(0).angle]})()');assert.deepEqual(transform,[true,true,37]);
  await shot('module-highlight-rotated-editing');
  await click('.editor-highlight');await click('.edit-toggle');
  await view('m303-turning-diagram');await click('[data-module-topic="t-junction"]');await click('.edit-toggle');await click('.editor-highlight');await toggle();await click('.editor-highlight');await click('.edit-toggle');
  const select=await evaluate('document.querySelector("[data-module-view-select]")?.options[1]?.value');assert(select);await choose('[data-module-view-select]',select);assert.equal(await rects(),0);assert.equal((await frame()).hasBox,false);
  await choose('[data-module-view-select]',await evaluate('document.querySelector("[data-module-view-select]").options[0].value'));assert.equal(await rects(),1);
  pass('unmapped diagrams can create highlights; dragging works with the source 90° rotation plus a saved 37° rotation, and representatives keep independent boxes');

  await view('m101-lanes-diagram');await click('[data-module-topic="arrows"]');await click('.edit-toggle');await click('[data-content-action="add-point"]');
  const added=await evaluate('window.PresentationContent.current.model.points.at(-1)');await editText('[data-module-point="'+added.id+'"] h3','可自行打亮的新說明');await click('.editor-highlight');await choose('[data-module-highlight-point]',added.id);assert.equal((await frame()).hasBox,false);await toggle();assert.equal(await rects(),1);assert((await frame()).key.includes(added.id));await click('.edit-toggle');
  fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));await navigate(base+'/presentation-demo/#m101-lanes-diagram/topic-arrows');await click('[data-module-point="'+added.id+'"]');assert.equal(await rects(),1);assert((await frame()).key.includes(added.id));
  await view('m201-stop-layout');assert((await frame()).key.startsWith('module:m201-stop-layout:'));assert.equal(await rects(),1);
  await view('edge',1);assert(await evaluate('document.querySelector("#selection-group").style.display!=="none"'),'General-road article highlights must remain available');
  pass('new explanation items can own highlights and survive JSON reload; legacy M2-01 keys and general-road article highlights remain intact');
  fs.writeFileSync(previewConfigPath,baseline);
};
