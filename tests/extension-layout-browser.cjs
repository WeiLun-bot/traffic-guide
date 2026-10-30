'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,wait,cdp,base,artifacts,pass,previewConfigPath}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),config=JSON.parse(baseline);config.extensionLayouts={};fs.writeFileSync(previewConfigPath,JSON.stringify(config));
  const cards='.module-extension-card',card=index=>cards+':nth-child('+(index+1)+')';
  const layout=index=>evaluate('document.querySelector('+JSON.stringify(card(index))+').dataset.extensionLayout');
  const choose=async(index,value)=>evaluate('(()=>{const select=document.querySelector('+JSON.stringify(card(index)+' [data-module-extension-layout]')+');select.value='+JSON.stringify(value)+';select.dispatchEvent(new Event("change",{bubbles:true}))})()');
  const geometry=index=>evaluate('(()=>{const card=document.querySelector('+JSON.stringify(card(index))+'),copy=card.querySelector(".module-extension-copy").getBoundingClientRect(),image=card.querySelector(".module-extension-images").getBoundingClientRect(),bounds=card.getBoundingClientRect();return {copy:{x:copy.x,y:copy.y,right:copy.right,bottom:copy.bottom},image:{x:image.x,y:image.y,width:image.width,height:image.height},width:bounds.width}})()');
  const stacked=async index=>{const g=await geometry(index);assert(Math.abs(g.copy.x-g.image.x)<1&&g.copy.bottom<=g.image.y+1,JSON.stringify(g));assert(g.image.width>g.width*.85,JSON.stringify(g));};
  const sideBySide=async index=>{const g=await geometry(index);assert(g.copy.right<=g.image.x+1&&Math.abs(g.copy.y-g.image.y)<1,JSON.stringify(g));};
  const shot=async name=>{await evaluate('(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))})()');const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  await navigate(base+'/presentation-demo/#m101-lanes-extensions');assert.equal(await layout(0),'vertical');assert.equal(await layout(1),'vertical');await stacked(0);await stacked(1);assert.equal(await evaluate('document.querySelectorAll("[data-module-extension-layout]").length'),0);
  const content=await evaluate('[...document.querySelectorAll(".module-extension-copy")].map(node=>node.textContent)'),sources=await evaluate('[...document.querySelectorAll(".module-extension-thumbnail")].map(node=>node.getAttribute("src"))');
  await click('.edit-toggle');assert.equal(await evaluate('document.querySelectorAll("[data-module-extension-layout]").length'),2);assert.equal(await evaluate('document.querySelector("[data-module-extension-layout]").value'),'auto');await stacked(0);
  const past=await evaluate('window.visualLayoutEditor.store.past.length');await choose(0,'horizontal');assert.equal(await layout(0),'horizontal');assert.equal(await layout(1),'vertical');await sideBySide(0);await stacked(1);assert.equal(await evaluate('window.visualLayoutEditor.store.past.length'),past+1);
  await click('[data-vl-action="undo"]');assert.equal(await layout(0),'vertical');await click('[data-vl-action="redo"]');assert.equal(await layout(0),'horizontal');
  await choose(0,'auto');assert.equal(await layout(0),'vertical');assert.equal(await evaluate('Object.keys(window.visualLayoutEditor.store.config.extensionLayouts).length'),0);
  await choose(0,'horizontal');await choose(1,'vertical');await shot('extension-layout-editing');
  fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));await navigate(base+'/presentation-demo/#m101-lanes-extensions');assert.equal(await layout(0),'horizontal');assert.equal(await layout(1),'vertical');await sideBySide(0);await stacked(1);
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".module-extension-copy")].map(node=>node.textContent)'),content);assert.deepEqual(await evaluate('[...document.querySelectorAll(".module-extension-thumbnail")].map(node=>node.getAttribute("src"))'),sources);
  await click(card(1)+' .module-extension-image-open');assert(await evaluate('document.getElementById("asset-dialog").open'));await evaluate('document.getElementById("asset-dialog").close()');
  pass('flat figures default to text above a full-width image; each card switches independently, restores auto mode and retains saved choices through undo/redo and JSON reload without changing content or images');

  await view('m201-stop-extensions');const stopDefault=await layout(0);await click('.edit-toggle');assert.equal(await evaluate('document.querySelectorAll(".module-extension-card.text-only [data-module-extension-layout]").length'),0);await choose(0,stopDefault==='vertical'?'horizontal':'vertical');if(stopDefault==='vertical')await sideBySide(0);else await stacked(0);await choose(0,'auto');assert.equal(await layout(0),stopDefault);await click('.edit-toggle');
  await view('m101-lanes-extensions');assert.equal(await layout(0),'horizontal');assert.equal(await layout(1),'vertical');await click('.edit-toggle');await choose(0,'auto');await click('.edit-toggle');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  const point=await evaluate('(()=>{const r=document.getElementById("fullscreen-button").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
  for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});await wait('Boolean(document.fullscreenElement)');
  const extensionPages=await evaluate('window.PresentationModules.contents.flatMap(doc=>doc.submoduleFlows.flatMap(flow=>flow.stages.filter(stage=>stage.id==="extensions").map(stage=>stage.pageId)))');
  for(const id of extensionPages){await view(id);assert(await evaluate('(()=>{const main=document.querySelector("main");return main.scrollHeight<=main.clientHeight+1})()'),'Fullscreen overflow: '+id);assert((await evaluate('[...document.querySelectorAll(".module-extension-card")].filter(card=>!card.hidden).length'))<=2);
    assert(await evaluate('[...document.querySelectorAll(\'.module-extension-card[data-extension-layout="vertical"]\')].filter(card=>!card.hidden).every(card=>card.querySelector(".module-extension-images").getBoundingClientRect().height>=95)'),'Collapsed image row: '+id);
  }
  await view('m101-lanes-extensions');await stacked(0);await stacked(1);await shot('extension-layout-stacked-fullscreen');
  await view('m201-stop-extensions');await click('[data-module-extension-step="1"]');assert.equal(await evaluate('document.querySelectorAll(".module-extension-card[hidden]").length'),2);
  await evaluate('document.exitFullscreen()');await wait('!document.fullscreenElement');
  pass('all '+extensionPages.length+' extension pages retain two-card fullscreen paging, full-width stacked images and usable image rows without scrolling the presentation');

  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await view('m101-lanes-extensions');await stacked(0);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await click('.edit-toggle');await choose(1,'horizontal');assert(await evaluate('[...document.querySelectorAll("[data-module-extension-layout]")].every(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})'));assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await shot('extension-layout-mobile');
  pass('layout controls remain usable on a 390px screen and text-only cards keep their existing presentation');
  fs.writeFileSync(previewConfigPath,baseline);
};
