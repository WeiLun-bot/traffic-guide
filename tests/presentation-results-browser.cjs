'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,click,navigate,wait,cdp,base,artifacts,pass}){
  const shot=async name=>{await evaluate('(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))})()');const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  await navigate(base+'/presentation-demo/#results-intro');
  assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-intro');
  assert.equal(await evaluate('window.generalRoadPresentation.page.deckId'),'results');
  assert.equal(await evaluate('document.querySelectorAll("#lecture-chapters button").length'),8);
  assert.equal(await evaluate('Number(document.getElementById("page-total").textContent)'),121);
  assert(await evaluate('window.generalRoadPresentation.pages.filter(page=>page.kind==="results"&&page.stage==="issue").every(page=>document.querySelector(\'#toc-content [data-page="\'+page.id+\'"]\').textContent===page.resultsScenario+" "+page.sceneName+"現況議題")'));
  assert(await evaluate('window.generalRoadPresentation.pages.filter(page=>page.kind==="results"&&page.stage==="strategy").every(page=>document.querySelector(\'#toc-content [data-page="\'+page.id+\'"]\').textContent===page.resultsScenario+" 佈設成果")'));
  await click('#toc-button');await evaluate('document.querySelector(\'#toc-content [data-chapter="results-general"]\').scrollIntoView({block:"start"})');await shot('results-toc-scenario-names');await evaluate('document.getElementById("toc-dialog").close()');
  await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-outline');
  await click('.results-outline [data-page="chapter-cover-results-general"]');await click('#next');
  assert.equal(await evaluate('document.querySelectorAll("[data-results-scenario]").length'),18);
  assert.equal(await evaluate('document.querySelectorAll(".results-scenario-thumb image").length'),18);
  await click('[data-results-scenario="G1-01"]');
  assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-scenario-g1-01');
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".results-case-images [data-editor-image-key]")].map(node=>node.dataset.editorImageKey)'),['g101-before','results:g1-01-photo-1']);
  assert.equal(await evaluate('document.querySelectorAll(".results-points>li").length'),3);
  assert.equal(await evaluate('document.querySelectorAll(".results-case-nav,.results-heading>h2").length'),0);
  assert.equal(await evaluate('document.querySelectorAll(".results-map-card .iv-trigger").length'),2);
  await shot('results-g101-issues');await click('.results-map-card [data-asset="results:g1-01-photo-1"]');
  assert(await evaluate('document.getElementById("asset-dialog").open'));await evaluate('document.getElementById("asset-dialog").close()');
  await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-scenario-g1-01-strategy');
  assert.equal(await evaluate('document.querySelectorAll(".results-points>li").length'),4);await shot('results-g101-strategy');
  await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-scenario-g1-02');
  assert.equal(await evaluate('document.querySelectorAll(".results-diagram").length'),2);assert.equal(await evaluate('document.querySelectorAll(".results-case-nav,.results-heading>h2").length'),0);await shot('results-g102-simplified');
  await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-scenario-g1-02-strategy');assert.equal(await evaluate('document.querySelectorAll(".results-points>li").length'),3);
  await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-scenario-g1-03');await view('results-scenario-g1-02');await click('#previous');
  assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-scenario-g1-01-strategy');
  await view('results-complex');assert.equal(await evaluate('document.querySelectorAll("[data-results-scenario]").length'),18);
  await click('[data-results-scenario="C1-01"]');assert.equal(await evaluate('window.generalRoadPresentation.page.deckId'),'results');
  await click('#lecture-chapters [data-chapter="results-complex"]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'chapter-cover-results-complex');
  await view('results-modules');assert.equal(await evaluate('document.querySelectorAll("[data-results-module]").length'),15);
  await view('results-module-list-2');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-modules');assert.equal(await evaluate('document.querySelectorAll("[data-results-module]").length'),15);
  await view('results-module-example');assert.equal(await evaluate('document.querySelectorAll(".results-diagram image").length'),2);
  assert(await evaluate('[...document.querySelectorAll(".results-diagram image")].every(node=>Boolean(node.getAttribute("href")))'));
  pass('results deck has eight chapters, all 36 scenario slots, 15 modules and a complete two-page G1-01 example with figures and navigation');

  const cases=await evaluate('window.generalRoadPresentation.pages.filter(page=>page.stage==="issue").map(page=>({id:page.id,code:page.resultsScenario}))');
  assert.deepEqual(await evaluate('(async()=>{const assets=Object.values(window.PresentationResults.outline.assets);const checks=await Promise.all(assets.map(async asset=>{const response=await fetch(encodeURI(asset.file),{method:"HEAD"});return response.ok?null:asset.file;}));return checks.filter(Boolean);})()'),[],'All archived files must be available through the published relative paths');
  for(const scene of cases){
    await view(scene.id);
    assert.equal(await evaluate('document.querySelectorAll(".results-case-nav,.results-heading>h2").length'),0,'Removed subtitle and local navigation must stay absent: '+scene.id);
    const detail=await evaluate('(()=>{const page=window.generalRoadPresentation.page;return {diagrams:document.querySelectorAll(".results-diagram").length,points:document.querySelectorAll(".results-points>li").length,missing:page.content.sourceMissing,keys:[...document.querySelectorAll(".results-map-canvas")].map(node=>node.dataset.editorImageKey)};})()');
    if(detail.missing){assert.equal(detail.diagrams,0);continue;}
    assert(detail.diagrams>=1&&detail.points>=2,scene.id+' is incomplete');
    assert.equal(await evaluate('window.generalRoadPresentation.page.example.sourceSlides.length'),2);
    assert(await evaluate('[...document.querySelectorAll(".results-diagram image")].every(node=>Boolean(node.getAttribute("href")))'));
    const images=await evaluate('window.generalRoadPresentation.page.content.images');
    for(const image of images)assert(image.key==='g101-before'||image.key.startsWith('results:'+scene.code.toLowerCase()+'-'),'Foreign current image: '+scene.code);
    if(scene.code[0]==='C'){
      const hasPhoto=images.some(image=>image.role==='photo');
      assert.equal(await evaluate('Boolean(document.querySelector("[data-results-missing=photo]"))'),!hasPhoto);
      if(!hasPhoto)assert.equal(await evaluate('document.querySelector("[data-results-missing=photo]").textContent.includes("未附獨立現況照片")'),true);
    }
  }
  await view('results-scenario-c1-01');
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".results-map-canvas")].map(node=>node.dataset.editorImageKey)'),['results:c1-01-diagram-1','results:c1-01-photo-1']);
  assert(await evaluate('(async()=>{const node=document.querySelector(".results-map-card:last-child image"),image=new Image();image.src=node.getAttribute("href");await image.decode();return image.naturalWidth===2542&&image.naturalHeight===871})()'));
  assert.equal(await evaluate('document.querySelectorAll(".results-map-card:last-child .iv-trigger").length'),1);await shot('results-c101-supplemental-photo');
  await click('[data-asset="results:c1-01-photo-1"]');assert(await evaluate('document.getElementById("asset-dialog").open'));await evaluate('document.getElementById("asset-dialog").close()');
  await navigate(base+'/presentation-demo/#results-scenario-c1-01');assert.equal(await evaluate('document.querySelector(".results-map-card:last-child [data-editor-image-key]").dataset.editorImageKey'),'results:c1-01-photo-1');
  await view('results-scenario-g1-01');
  const before=await evaluate('window.generalRoadViewport.get(document.querySelector(".results-diagram")).read()');
  await click('[data-results-image-step="1"][data-results-image-role="photo"]');
  assert.equal(await evaluate('document.querySelector("[data-results-image-select=photo]").value'),'1');
  assert.deepEqual(await evaluate('window.generalRoadViewport.get(document.querySelector(".results-diagram")).read()'),before);
  await evaluate('(()=>{const select=document.querySelector("[data-results-image-select=photo]");select.value="0";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
  assert.equal(await evaluate('document.querySelector("[data-results-image-select=photo]").value'),'0');
  await view('results-scenario-c1-06');assert.equal(await evaluate('document.querySelectorAll("[data-results-image-select=diagram] option").length'),2);
  await click('[data-results-image-step="1"][data-results-image-role="diagram"]');
  assert.equal(await evaluate('document.querySelector("[data-results-image-select=diagram]").value'),'1');await shot('results-c106-current');
  await view('results-scenario-g4-04');await shot('results-g404-current');
  await view('results-scenario-c4-04');const reuseSource=await evaluate('({text:[...document.querySelectorAll(".results-points li")].map(node=>[node.querySelector("h3").textContent,node.querySelector("p").textContent]),images:[...document.querySelectorAll(".results-diagram image")].map(node=>node.getAttribute("href"))})');
  await view('results-scenario-c2-02');assert.equal(await evaluate('document.getElementById("slide-title").textContent'),'平行匝道型交流道');assert.equal(await evaluate('document.querySelectorAll("[data-results-missing],.results-source-missing").length'),0);
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".results-points li")].map(node=>[node.querySelector("h3").textContent,node.querySelector("p").textContent])'),reuseSource.text);assert.equal(await evaluate('document.querySelectorAll(".results-diagram image").length'),2);
  assert(await evaluate('(async()=>{for(const node of document.querySelectorAll(".results-diagram image")){const image=new Image();image.src=node.getAttribute("href");await image.decode();if(!image.naturalWidth)return false;}return true;})()'));
  assert(await evaluate('[...document.querySelectorAll(".results-map-canvas")].every(node=>node.dataset.editorImageKey.startsWith("results:c2-02-"))'));await shot('results-c202-reused-issue');
  await click('.edit-toggle');await evaluate('(()=>{const node=document.querySelector(".results-points p");node.textContent="測試 C2-02 獨立說明";node.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText"}));})()');
  await view('results-scenario-c4-04');assert.deepEqual(await evaluate('[...document.querySelectorAll(".results-points li")].map(node=>[node.querySelector("h3").textContent,node.querySelector("p").textContent])'),reuseSource.text);
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".results-diagram image")].map(node=>node.getAttribute("href"))'),reuseSource.images);
  await click('[data-vl-action="undo"]');await click('.edit-toggle');
  pass('all 36 current-condition cases include the approved C2-02 reuse with independent editing and original-image controls; gallery choices and C4-04 remain independent');

  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  const ids=await evaluate('window.generalRoadPresentation.pages.filter(page=>page.deckId==="results").map(page=>page.id)');
  for(const id of ids){await view(id);const overflow=await evaluate('(()=>{const main=document.getElementById("presentation"),slide=main.firstElementChild;return {main:main.scrollHeight-main.clientHeight,slide:slide.scrollHeight-slide.clientHeight,width:document.documentElement.scrollWidth-innerWidth};})()');assert(overflow.main<=2&&overflow.slide<=2&&overflow.width<=1,'Results page overflows at 1366×768: '+id+' '+JSON.stringify(overflow));}
  await view('results-scenario-g1-01-strategy');await shot('results-g101-strategy-1366');
  await click('.edit-toggle');await wait('window.generalRoadEditor.editing');
  assert(await evaluate('document.getElementById("slide-title").isContentEditable'));
  const textKey=await evaluate('document.getElementById("slide-title").dataset.editKey');
  assert.equal(textKey,'results-scenario-g1-01-strategy|results|title');
  await evaluate('(()=>{const n=document.querySelector(".results-points p");n.textContent="測試佈設說明";n.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText"}));})()');
  await view('results-scenario-g1-01');await view('results-scenario-g1-01-strategy');assert.equal(await evaluate('document.querySelector(".results-points p").textContent'),'測試佈設說明');
  await click('.edit-toggle');await wait('!window.generalRoadEditor.editing');
  await navigate(base+'/presentation-demo/#results-scenario-g1-01-strategy');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-scenario-g1-01-strategy');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  for(const id of ['results-intro','results-outline','results-modules','results-module-list-2','results-general','results-complex','results-scenario-c1-01','results-scenario-g1-01','results-scenario-g1-01-strategy']){await view(id);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Mobile results overflow: '+id);}
  await shot('results-g101-mobile');
  await click('#toc-button');await evaluate('document.querySelector(\'#toc-content [data-chapter="results-general"]\').scrollIntoView({block:"start"})');assert(await evaluate('document.getElementById("toc-dialog").scrollWidth<=document.getElementById("toc-dialog").clientWidth+1'));await shot('results-toc-scenario-names-mobile');await evaluate('document.getElementById("toc-dialog").close()');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await view('results-wrap');await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'chapter-cover-results-intro');
  await click('#previous');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'presentations');
  await view('overview');assert.equal(await evaluate('window.generalRoadPresentation.page.deckId'),'general');assert(await evaluate('Boolean(document.querySelector(".compare-stage"))'));
  pass('all 121 results slides fit a 1366×768 viewport; sample text edits, mobile layout, deep links, deck boundaries and original general presentation remain usable');
};
