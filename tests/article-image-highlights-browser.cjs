'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,wait,dragFrom,cdp,base,artifacts,pass,previewConfigPath}){
 const baseline=fs.readFileSync(previewConfigPath,'utf8');
 const geometry=()=>evaluate('(()=>{const api=window.generalRoadPresentation,f=api.editorFrames()[0],scene=window.PresentationScenarios.sceneFor(api.page,api.data),node=f.element.querySelector("image"),asset=api.data.embeddedAssets[scene.overall];return {id:api.page.id,key:f.imageKey,width:f.width,height:f.height,box:f.getBox(),crop:f.getCrop(),rotation:window.generalRoadEditor.rotation(f.key),rendered:{matches:node.getAttribute("href")===asset.url,width:+node.getAttribute("width"),height:+node.getAttribute("height"),transform:node.parentElement.getAttribute("transform")},expected:{width:asset.width,height:asset.height,transform:window.PresentationScenarios.transform(scene)}}})()');
 const choose=async(selector,value)=>evaluate('(()=>{const input=document.querySelector('+JSON.stringify(selector)+');input.value='+JSON.stringify(String(value))+';input.dispatchEvent(new Event("change",{bubbles:true}))})()');
 const settle=()=>wait('(()=>{const f=window.generalRoadPresentation.editorFrames()[0],v=f.element.viewBox.baseVal;return Math.abs(v.x)<.01&&Math.abs(v.y)<.01&&Math.abs(v.width-f.width)<.01&&Math.abs(v.height-f.height)<.01})()','Highlight editor must show the full current image');
 const assertImage=async()=>{const f=await geometry();assert(f.rendered.matches,'Displayed image must match article source: '+f.id);assert.deepEqual({width:f.rendered.width,height:f.rendered.height,transform:f.rendered.transform},f.expected,'Displayed dimensions and orientation must match highlight bounds: '+f.id);return f;};
 const pointer=handle=>evaluate('(()=>{const f=window.generalRoadPresentation.editorFrames()[0],b=f.getBox(),h=f.element.querySelector("[data-handle='+handle+']"),p='+ (handle==='move'?'new DOMPoint(b[0]+b[2]/2,b[1]+b[3]/2).matrixTransform(f.element.getScreenCTM())':'new DOMPoint(+h.getAttribute("x")+(+h.getAttribute("width"))/2,+h.getAttribute("y")+(+h.getAttribute("height"))/2).matrixTransform(h.parentElement.getScreenCTM())')+';return {x:p.x,y:p.y}})()');
 const saved=[];
 try{
  await navigate(base+'/presentation-demo/#g201-waiting/zoom');
  // Exercise in-document transitions: a direct load alone cannot expose stale artwork.
  for(const id of ['g201-checklist','g201-visible','g201-protected','g201-gap','g201-pedestrian','g202-checklist','g202-glare','edge']){await view(id,1);assert.equal((await assertImage()).id,id);}
  pass('article image, native dimensions and quarter-turn orientation stay synchronized when switching within and between scenarios');
  for(const id of ['g201-checklist','g201-visible']){
   await view(id,1);if(!await evaluate('window.generalRoadEditor.editing'))await click('.edit-toggle');if(!await evaluate('window.generalRoadEditor.adjusting'))await click('.editor-highlight');await settle();
   const f=await assertImage();
   await choose('[data-highlight-rotation]',0);
   for(const [index,value]of [[2,f.width*.2],[3,f.height*.2],[0,f.width*.35],[1,f.height*.35]])await choose('[data-bound-index="'+index+'"]',value);
   await settle();const start=await geometry(),p=await pointer('move');
   const expected=await evaluate('(()=>{const m=window.generalRoadPresentation.editorFrames()[0].element.getScreenCTM();return {dx:32/m.a,dy:22/m.d}})()');
   const history=await evaluate('window.visualLayoutEditor.store.past.length');
   await dragFrom(p.x,p.y,32,22);const moved=await geometry();assert(Math.abs(moved.box[0]-start.box[0]-expected.dx)<.2);assert(Math.abs(moved.box[1]-start.box[1]-expected.dy)<.2);assert.equal(await evaluate('window.visualLayoutEditor.store.past.length'),history+1);
   await click('[data-vl-action="undo"]');assert.deepEqual((await geometry()).box,start.box);await click('[data-vl-action="redo"]');assert.deepEqual((await geometry()).box,moved.box);await settle();
   const corner=await pointer('se');await dragFrom(corner.x,corner.y,18,12);const resized=await geometry();assert(resized.box[2]>moved.box[2]);assert(resized.box[3]>moved.box[3]);
   for(const target of [[f.width-resized.box[2]-2,f.height-resized.box[3]-2],[2,2],[f.width*.35,f.height*.35]]){
    const p=await pointer('move'),delta=await evaluate('(()=>{const f=window.generalRoadPresentation.editorFrames()[0],b=f.getBox(),m=f.element.getScreenCTM();return {dx:('+target[0]+'-b[0])*m.a,dy:('+target[1]+'-b[1])*m.d}})()');
    await dragFrom(p.x,p.y,delta.dx,delta.dy);const box=(await geometry()).box;assert(Math.abs(box[0]-target[0])<.2&&Math.abs(box[1]-target[1])<.2,'The highlight must reach all parts of its actual image: '+id);
   }
   await choose('[data-highlight-rotation]',27);assert.equal((await geometry()).rotation,27);
   saved.push(await geometry());await click('.edit-toggle');
   const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'article-image-'+id+'.png'),Buffer.from(shot.data,'base64'));
  }
  pass('both independent-image pages allow mouse movement, corner resizing and rotation with undo and redo');
  fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));await navigate(base+'/presentation-demo/#g201-waiting/zoom');
  for(const previous of saved){await view(previous.id,1);const restored=await assertImage();assert.deepEqual(restored.box,previous.box);assert.deepEqual(restored.crop,previous.crop);assert.equal(restored.rotation,previous.rotation);}
  pass('native-coordinate highlight boxes, crops and angles survive JSON save and reload for upright and rotated images');
 }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
