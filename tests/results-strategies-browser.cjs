'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,wait,cdp,base,artifacts,pass,previewConfigPath}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8');
  const shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  await navigate(base+'/presentation-demo/#results-general');
  assert.equal(await evaluate('Number(document.getElementById("page-total").textContent)'),120);
  const pages=await evaluate('window.generalRoadPresentation.pages.filter(page=>page.deckId==="results"&&page.stage==="strategy").map(page=>({id:page.id,code:page.resultsScenario,key:page.content.images[0].key,count:page.content.items.length}))');assert.equal(pages.length,36);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  for(const entry of pages){
    const issue=entry.id.replace(/-strategy$/,'');await view(issue);await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),entry.id);
    await evaluate('(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))})()');
    assert.equal(await evaluate('document.querySelectorAll(".results-points>li").length'),entry.count);
    assert.equal(await evaluate('document.querySelector(".results-map-canvas").dataset.editorImageKey'),entry.key);
    assert.match(await evaluate('document.querySelector(".results-heading .eyebrow").textContent'),/2\s*\/\s*2/);
    assert(await evaluate('(async()=>{const image=new Image();image.src=document.querySelector(".results-diagram image").getAttribute("href");await image.decode();return image.naturalWidth>0&&image.naturalHeight>0})()'),'Could not decode strategy image: '+entry.code);
    assert(await evaluate('(()=>{const main=document.getElementById("presentation"),slide=main.firstElementChild;return main.scrollHeight<=main.clientHeight+2&&slide.scrollHeight<=slide.clientHeight+2&&document.documentElement.scrollWidth<=innerWidth+1})()'),'Strategy overflow: '+entry.code);
    assert.equal(await evaluate('document.querySelectorAll(".results-map-card .iv-trigger").length'),1);
    assert(await evaluate('Boolean(document.querySelector(\'#toc-content [data-page="'+entry.id+'"]\'))'));
    if(['G1-02','G1-03','G1-06','G4-01','G4-02','G4-04','C1-01','C1-05','C2-02','C4-02','C4-06'].includes(entry.code))await shot('results-strategy-'+entry.code.toLowerCase());
    await click('#previous');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),issue);
  }
  await view('results-scenario-g4-04-strategy');await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'chapter-cover-results-complex');
  await view('results-scenario-c4-06-strategy');await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'chapter-cover-results-wrap');
  pass('all 36 general and complex scenarios play issue then strategy, decode their complete SVG and retain navigation within a 1366×768 viewport');
  for(const [code,other]of [['g1-03','g1-04'],['c4-02','c4-03']]){
  const page='results-scenario-'+code+'-strategy',otherPage='results-scenario-'+other+'-strategy';
  await navigate(base+'/presentation-demo/#'+page);await click('.edit-toggle');
  const original=await evaluate('document.querySelector(".results-points p").textContent');
  await evaluate('(()=>{const node=document.querySelector(".results-points p");node.textContent="測試整體佈設重點";node.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText"}))})()');
  await view(otherPage);await view(page);assert.equal(await evaluate('document.querySelector(".results-points p").textContent'),'測試整體佈設重點');
  await click('[data-vl-action="undo"]');assert.equal(await evaluate('document.querySelector(".results-points p").textContent'),original);await click('[data-vl-action="redo"]');assert.equal(await evaluate('document.querySelector(".results-points p").textContent'),'測試整體佈設重點');
  await click('.iv-trigger');
  for(const [field,value]of [['rotation',90],['zoom',125],['x',3],['y',-2]])await evaluate('(()=>{const node=document.querySelector(\'.iv-panel:not([hidden]) [data-iv-field="'+field+'"]\');node.value='+value+';node.dispatchEvent(new Event("change",{bubbles:true}))})()');
  const camera=await evaluate('window.generalRoadViewport.get(document.querySelector(".results-diagram")).read()');await click('.iv-panel:not([hidden]) [data-iv-action="close"]');
  fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));
  await navigate(base+'/presentation-demo/#'+page);assert.equal(await evaluate('document.querySelector(".results-points p").textContent'),'測試整體佈設重點');assert.deepEqual(await evaluate('window.generalRoadViewport.get(document.querySelector(".results-diagram")).read()'),camera);
  const viewBox=await evaluate('document.querySelector(".results-diagram").getAttribute("viewBox")');
  await click('[data-asset="results:'+code+'-strategy"]');assert(await evaluate('document.getElementById("asset-dialog").open'));await evaluate('document.getElementById("asset-dialog").close()');
  await view(code[0]==='g'?'results-general':'results-complex');assert.equal(await evaluate('document.querySelector(\'[data-results-scenario="'+code.toUpperCase()+'"] svg\').getAttribute("viewBox")'),viewBox);
  }
  pass('general and complex strategy text and independent cameras survive editing, undo/redo, JSON reload and enlargement; overview thumbnails follow the saved view');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  for(const entry of pages){await view(entry.id);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));}
  await shot('results-strategy-mobile');pass('strategy slides remain usable at 390px without horizontal overflow');
  fs.writeFileSync(previewConfigPath,baseline);
};
