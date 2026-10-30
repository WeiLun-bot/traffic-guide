'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,wait,cdp,base,artifacts,pass,previewConfigPath}){
  const choose=async(selector,value)=>evaluate('(()=>{const node=document.querySelector('+JSON.stringify(selector)+');node.value='+JSON.stringify(value)+';node.dispatchEvent(new Event("change",{bubbles:true}))})()');
  const shot=async name=>{await evaluate('(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))})()');const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  const fullscreen=async on=>{if(on){const r=await evaluate('(()=>{const r=document.getElementById("fullscreen-button").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...r,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});await wait('Boolean(document.fullscreenElement)');}else{await evaluate('document.exitFullscreen()');await wait('!document.fullscreenElement');}};
  await navigate(base+'/presentation-demo/#m401-local-issues');
  const config=await evaluate('window.VisualLayoutCore.signature(window.visualLayoutEditor.store.config)');
  const assets=await evaluate('window.PresentationModules.displayContext().source.assets');assert.equal(assets.length,2);
  assert.equal(await evaluate('document.querySelectorAll(".module-map-card").length'),1);
  assert.equal(await evaluate('document.querySelectorAll(".module-map-card figcaption,.module-asset-credit,.module-asset-tabs").length'),0);
  assert(await evaluate('document.querySelector("[data-module-view-select]").closest(".map-toolbar")!==null'));
  await click('[data-module-view-step="1"]');assert.equal(await evaluate('document.querySelector("[data-module-view-select]").value'),assets[1]);
  await choose('[data-module-view-select]',assets[0]);assert.equal(await evaluate('document.querySelector(".module-map-canvas").dataset.editorImageKey'),'module:'+assets[0]);
  await click('[data-module-compare]');assert.equal(await evaluate('document.querySelectorAll(".module-map-card").length'),2);
  await click('[data-module-compare]');assert.equal(await evaluate('document.querySelectorAll(".module-map-card").length'),1);
  assert.equal(await evaluate('window.VisualLayoutCore.signature(window.visualLayoutEditor.store.config)'),config,'Navigation and comparison must not edit saved layout');
  assert.equal(await evaluate('document.querySelector(".module-scenario-refs").open'),false);
  await click('.module-scenario-refs>summary');assert(await evaluate('document.querySelector(".module-scenario-refs").open'));
  await click('[data-module-scenario="overview"]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'overview');await click('[data-back-module]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m401-local-issues');
  await shot('module-layout-hazard');
  pass('representatives switch within the figure toolbar, comparison is optional, captions are removed and collapsed scenario links retain round-trip navigation');

  await click('.iv-trigger');
  const set=async(name,value)=>choose('.iv-panel:not([hidden]) [data-iv-field="'+name+'"]',String(value));
  await set('rotation',90);await set('zoom',120);await set('x',5);
  const camera=await evaluate('window.generalRoadViewport.get(document.querySelector(".module-diagram")).read()');
  await click('.iv-panel:not([hidden]) [data-iv-action="close"]');
  await click('[data-module-view-step="1"]');await click('[data-module-view-step="-1"]');
  assert.deepEqual(await evaluate('window.generalRoadViewport.get(document.querySelector(".module-diagram")).read()'),camera);
  await click('[data-module-compare]');assert.deepEqual(await evaluate('window.generalRoadViewport.get(document.querySelector(".module-diagram")).read()'),camera);await click('[data-module-compare]');
  fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));
  await navigate(base+'/presentation-demo/#m401-local-issues');assert.deepEqual(await evaluate('window.generalRoadViewport.get(document.querySelector(".module-diagram")).read()'),camera);
  pass('each representative retains saved rotation, scale and position through image switching, comparison and fresh JSON reload');

  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});await fullscreen(true);
  const pages=await evaluate('window.PresentationModules.pages().filter(page=>page.moduleId&&page.kind==="module").map(page=>page.id)');
  for(const id of pages){
    await view(id);
    assert(await evaluate('(()=>{const main=document.querySelector("main");return main.scrollHeight<=main.clientHeight+1})()'),'Fullscreen page overflow: '+id);
    assert.equal(await evaluate('document.querySelectorAll(".module-map-card figcaption,.module-extension-image figcaption,.module-asset-credit").length'),0);
    assert(await evaluate('(()=>{const row=document.querySelector(".module-navigation"),nav=row.querySelector(".module-switcher"),sub=row.querySelector(".module-subnav");return !sub||Math.abs(nav.getBoundingClientRect().top-sub.getBoundingClientRect().top)<8})()'),'Module navigation should occupy one row: '+id);
    assert(await evaluate('[...document.querySelectorAll(".module-diagram")].every(node=>node.getBoundingClientRect().height>=250)'),'Figure height too small: '+id);
  }
  await view('m401-local-issues');await shot('module-layout-hazard-fullscreen');
  await view('m201-overview');await shot('module-layout-stop-overview-fullscreen');
  await fullscreen(false);
  pass('all '+pages.length+' module content pages fit a 1366×768 fullscreen view; navigation stays in one row and main figures retain at least 250px height');

  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  for(const id of pages){await view(id);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Mobile overflow: '+id);}
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:false});
  await view('m401-local-issues');assert(await evaluate('document.querySelector("[data-module-subselect]").getClientRects().length>0'));
  await choose('[data-module-subselect]',await evaluate('document.querySelector("[data-module-subselect]").options[2].value'));assert.equal(await evaluate('window.generalRoadPresentation.page.submoduleId'),'M4-01.2');
  await shot('module-layout-mobile');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  pass('all module content pages fit mobile width; long child choices use a working dropdown');
};
