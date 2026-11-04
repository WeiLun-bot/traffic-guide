'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,wait,cdp,base,artifacts,pass,previewConfigPath,editText}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  await navigate(base+'/presentation-demo/#results-modules');assert.equal(await evaluate('Number(document.getElementById("page-total").textContent)'),120);
  const modules=await evaluate('window.generalRoadPresentation.pages.filter(page=>page.resultsModule).map(page=>({id:page.id,code:page.resultsModule,images:page.content.images,count:page.content.items.length}))');assert.equal(modules.length,15);
  assert.equal(await evaluate('document.querySelectorAll("[data-results-module]").length'),15);assert.equal(await evaluate('document.querySelectorAll(".results-heading>p").length'),0);
  for(const [width,height,columns]of [[1366,768,5],[1920,1080,5],[768,1024,3],[390,844,2]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await view('results-modules');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".results-module-thumbnail-grid")).gridTemplateColumns.split(" ").length'),columns);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    if(width>900)assert(await evaluate('(()=>{const main=document.querySelector("main"),bounds=main.getBoundingClientRect(),cards=[...document.querySelectorAll("[data-results-module]")];return main.scrollHeight<=main.clientHeight+2&&cards.every(card=>card.getBoundingClientRect().bottom<=bounds.bottom+1)})()'));
    await shot('module-overview-'+width);
  }
  assert(await evaluate('(async()=>{for(const node of document.querySelectorAll(".results-module-thumbnail-grid image")){const image=new Image();image.src=node.getAttribute("href");await image.decode();if(!image.naturalWidth||!image.naturalHeight)return false;}return true;})()'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  for(const module of modules){
    await view('results-modules');await click('[data-results-module="'+module.code+'"]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),module.id);
    await view(module.id);
    assert.equal(await evaluate('document.querySelectorAll(".results-points>li").length'),module.count);assert.equal(await evaluate('document.querySelectorAll(".results-map-card").length'),2);assert.equal(await evaluate('document.querySelectorAll(".results-map-card .iv-trigger").length'),2);
    const keys=await evaluate('[...document.querySelectorAll(".results-map-canvas")].map(node=>node.dataset.editorImageKey)');assert.deepEqual(keys,[module.images.find(image=>image.role==='current').key,module.images.find(image=>image.role==='module').key]);
    assert(await evaluate('(async()=>{for(const node of document.querySelectorAll(".results-diagram image")){const image=new Image();image.src=node.getAttribute("href");await image.decode();if(!image.naturalWidth||!image.naturalHeight)return false;}return true;})()'));
    const geometry=await evaluate('(()=>{const main=document.querySelector("main"),frames=[...document.querySelectorAll(".results-map-canvas")].map(node=>node.getBoundingClientRect());return {overflow:main.scrollHeight-main.clientHeight,width:document.documentElement.scrollWidth-innerWidth,top:frames[0].top-frames[1].top,height:frames[0].height-frames[1].height};})()');assert(geometry.overflow<=2&&geometry.width<=1&&Math.abs(geometry.top)<=1&&Math.abs(geometry.height)<=1,module.code+' '+JSON.stringify(geometry));
    assert.equal(await evaluate('document.querySelectorAll(\'.results-diagram[preserveAspectRatio="xMidYMid meet"]\').length'),2);
    if(['M1-01','M2-01','M3-03','M4-04'].includes(module.code))await shot('module-comparison-'+module.code);
  }
  await view(modules[0].id);await click('#previous');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-modules');await view(modules.at(-1).id);await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'chapter-cover-results-review');
  pass('all 15 module thumbnails and photo/diagram comparisons decode, retain equal frames and fit desktop, tablet and phone layouts');
  const first=modules[0],diagram=first.images.find(image=>image.role==='module').key;
  await view(first.id);await click('[data-asset="'+diagram+'"]');assert(await evaluate('document.getElementById("asset-dialog").open'));await evaluate('document.getElementById("asset-dialog").close()');
  await click('.results-map-card:last-child .iv-trigger');assert(await evaluate('document.querySelector(".iv-panel:not([hidden]) .iv-note").textContent.includes("模組總覽縮圖")'));
  for(const [field,value]of [['zoom',130],['x',5],['y',-4],['rotation',37]])await evaluate('(()=>{const input=document.querySelector(\'.iv-panel:not([hidden]) [data-iv-field="'+field+'"]\');input.value='+value+';input.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await click('.iv-panel:not([hidden]) [data-iv-action="close"]');const camera=await evaluate('document.querySelector(".results-map-card:last-child .results-diagram").getAttribute("viewBox")');
  await evaluate('(()=>{const select=document.querySelector("[data-results-image-select=current]");select.value="1";select.dispatchEvent(new Event("change",{bubbles:true}));})()');assert.equal(await evaluate('document.querySelector(".results-map-card:last-child .results-diagram").getAttribute("viewBox")'),camera);
  await click('.edit-toggle');await click('[data-content-action="add-point"]');const added=await evaluate('window.PresentationContent.current.model.points.at(-1)'),selector='.results-points>li[data-content-item-id="'+added.id+'"] p';await editText(selector,'模組對照新增說明');await click('[data-vl-action="undo"]');await click('[data-vl-action="redo"]');await click('.edit-toggle');
  fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));await navigate(base+'/presentation-demo/#'+first.id);assert.equal(await evaluate('document.querySelector('+JSON.stringify(selector)+').textContent'),'模組對照新增說明');assert.equal(await evaluate('document.querySelector(".results-map-card:last-child .results-diagram").getAttribute("viewBox")'),camera);
  await view('results-modules');assert.equal(await evaluate('document.querySelector(\'[data-results-module="M1-01"] svg\').getAttribute("viewBox")'),camera);
  await navigate(base+'/presentation-demo/#results-module-list-2');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-modules');await navigate(base+'/presentation-demo/#results-module-m2-01');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-module-example');assert.equal(await evaluate('window.generalRoadPresentation.page.resultsModule'),'M2-01');
  pass('photo selection, enlargement, editable notes, undo/redo, saved independent cameras, thumbnail synchronization and old module links work');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});for(const module of modules){await view(module.id);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),module.code);}
  await shot('module-comparison-mobile');fs.writeFileSync(previewConfigPath,baseline);pass('all 15 module comparison pages remain usable at 390px without horizontal overflow');
};
