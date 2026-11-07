'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,cdp,base,artifacts,pass}){
 const shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
 await navigate(base+'/presentation-demo/#modules-index');
 assert.equal(await evaluate('document.querySelectorAll("[data-directory-module]").length'),15);
 const ids=await evaluate('window.PresentationModules.catalog.modules.map(entry=>entry.id)');
 for(const id of ids){
  const selector='[data-directory-module="'+id+'"]';
  const actual=await evaluate('[...document.querySelectorAll('+JSON.stringify(selector+' [data-directory-asset]')+')].map(node=>node.dataset.directoryAsset)');
  assert.deepEqual(actual,await evaluate('window.PresentationModules.directoryAssets('+JSON.stringify(id)+')'));assert(actual.length>0);
  assert(await evaluate('(()=>{const card=document.querySelector('+JSON.stringify(selector)+'),bounds=card.getBoundingClientRect(),figures=[...card.querySelectorAll(".module-catalog-figure")];return figures.every((node,i)=>{const r=node.getBoundingClientRect(),previous=figures[i-1]?.getBoundingClientRect();return r.left>=bounds.left&&r.right<=bounds.right&&r.top>=bounds.top&&r.bottom<=bounds.bottom&&r.height>150&&(!previous||r.top>=previous.bottom+8)})})()'),'Representatives must stack inside their own card: '+id);
 }
 assert.equal(await evaluate('document.querySelectorAll("[data-directory-module=M3-02] .module-catalog-figure").length'),1);
 assert.equal(await evaluate('document.querySelectorAll("[data-directory-module=M2-04] .module-catalog-figure").length'),5);
 assert(await evaluate('(async()=>{for(const node of document.querySelectorAll(".module-catalog-thumbnail image")){const image=new Image();image.src=node.getAttribute("href");await image.decode();if(!image.naturalWidth||!image.naturalHeight)return false;}return true})()'),'Every directory representative must decode');
 assert(await evaluate('(()=>{const all=new Map(window.PresentationModules.contents.flatMap(doc=>Object.entries(doc.assets)));return [...document.querySelectorAll("[data-directory-asset]")].every(node=>{const asset=all.get(node.dataset.directoryAsset),svg=node.querySelector("svg"),view=svg.getAttribute("viewBox").split(/\\s+/).map(Number),swap=(asset.rotation||0)%180;return view[2]===(swap?asset.height:asset.width)&&view[3]===(swap?asset.width:asset.height)&&svg.getAttribute("preserveAspectRatio")==="xMidYMid meet"})})()'),'Native rotations and complete drawings must be retained');
 await shot('module-directory-representatives');
 const signature=await evaluate('window.VisualLayoutCore.signature(window.visualLayoutEditor.store.config)');
 const target=await evaluate('(()=>{const node=document.querySelector("[data-directory-asset=stop-basic] svg");node.scrollIntoView({block:"center"});const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
 await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...target});await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...target,button:'left',buttons:1,clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...target,button:'left',buttons:0,clickCount:1});assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m201-stop-issues');
 await view('modules-index');await click('[data-directory-module=M1-02] .module-catalog-figure');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m102-route-issues');
 assert.equal(await evaluate('window.VisualLayoutCore.signature(window.visualLayoutEditor.store.config)'),signature);
 for(const [id,modules]of [['modules-M2',['M2-01','M2-02']],['modules-M2-2',['M2-03','M2-04']]]){
  await view(id);assert.equal(await evaluate('document.querySelectorAll(".module-catalog-figure").length'),id==='modules-M2-2'?3:2);assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-directory-module]")].map(node=>node.dataset.directoryModule)'),modules);
 }
 pass('all fifteen directory cards show complete representative drawings, retain module entry links, and split the junction control overview into two illustrated pairs');
 for(const width of [1920,1366,768,390]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await view('modules-index');
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Directory overflow at '+width);
  assert(await evaluate('[...document.querySelectorAll(".module-catalog-figure")].every(node=>{const r=node.getBoundingClientRect(),c=node.closest(".module-catalog-card").getBoundingClientRect();return r.left>=c.left&&r.right<=c.right&&r.bottom<=c.bottom})'),'Figure escaped its card at '+width);
  if(width===390)await shot('module-directory-representatives-mobile');
 }
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await view('modules-index');await click('.edit-toggle');assert.equal(await evaluate('document.querySelectorAll(".module-catalog-thumbnail").length'),await evaluate('window.PresentationModules.catalog.modules.reduce((n,entry)=>n+window.PresentationModules.directoryAssets(entry.id).length,0)'));await click('.edit-toggle');
 pass('representative cards remain contained at desktop, tablet and mobile widths; editing and preview both display every drawing');
};
