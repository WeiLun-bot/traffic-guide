'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,click,navigate,cdp,base,artifacts,pass}){
  const shot=async name=>{await evaluate('(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))})()');const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  await navigate(base+'/presentation-demo/#modules-M1');
  for(const theme of ['M1','M2','M3','M4']){await view('modules-'+theme);assert.equal(await evaluate('document.querySelectorAll(".module-filters").length'),0);await click('.catalog-back');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'modules-index');assert.equal(await evaluate('document.querySelectorAll(".module-catalog-card").length'),15);assert.equal(await evaluate('document.querySelectorAll(".module-catalog-group").length'),4);assert.equal(await evaluate('document.querySelector("#lecture-chapters .active").dataset.chapter'),'modules-intro');}
  await shot('all-modules-directory');
  for(const id of ['m201-overview','m201-stop-layout','m201-yield-layout','module-M2-02','submodule-M2-04-3']){await view(id);assert.equal(await evaluate('document.querySelector(".module-switcher .scenario-back").textContent'),'全部模組總覽 ↖');await click('.module-switcher .scenario-back');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'modules-index');}
  pass('module subjects have no duplicate theme filter row; all module and submodule back links open the grouped introduction directory');
  await view('contents');await click('.directory-intro-link');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'general-scenarios-index');assert.equal(await evaluate('document.querySelectorAll(".directory-card").length'),18);assert.equal(await evaluate('document.querySelectorAll(".directory-card small.is-ready").length'),4);assert.equal(await evaluate('document.querySelector("#lecture-chapters .active").dataset.chapter'),'intro');await shot('all-general-scenarios');
  for(const [deck,id]of [['general','general-scenarios-index'],['complex','complex-intro']]){
    await view(id);const codes=await evaluate('[...document.querySelectorAll("[data-catalog-scenario]")].map(node=>node.dataset.catalogScenario)');assert.equal(codes.length,18);
    for(const code of codes){await click('[data-catalog-scenario="'+code+'"]');const page=await evaluate('window.generalRoadPresentation.page');assert.equal(page.deckId,deck);assert.equal(await evaluate('document.querySelector(".scenario-directory-switcher .active").dataset.scenarioCode'),code);
      if(!['G1-01','G1-02','G1-03','G1-04'].includes(code)){assert.equal(page.scenarioCode,code);assert(await evaluate('Boolean(document.querySelector(".presentation-empty-space"))'));assert.equal(await evaluate('document.querySelectorAll("main img,main svg").length'),0);}
      await click('.scenario-directory-switcher .scenario-back');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),id);assert.equal(await evaluate('document.querySelectorAll(".directory-card").length'),18);
    }
  }
  await view('complex-intro');await shot('all-complex-scenarios');
  for(const id of ['g1-scenarios','g2','g3','g4','complex-c1','complex-c2','complex-c3','complex-c4']){await view(id);await click('main>.slide>.catalog-back');assert(['general-scenarios-index','complex-intro'].includes(await evaluate('window.generalRoadPresentation.page.id')));}
  await navigate(base+'/presentation-demo/#scenario-c4-06');assert.equal(await evaluate('window.generalRoadPresentation.page.scenarioCode'),'C4-06');await click('.scenario-back');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'complex-intro');
  pass('both introductions list all eighteen PDF scenarios; completed cases keep their original routes and every blank case or chapter returns to its own directory');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  for(const id of ['modules-M1','modules-index','general-scenarios-index','complex-intro','scenario-c1-09','context']){await view(id);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Directory overflow: '+id);}
  await view('general-scenarios-index');await shot('all-scenarios-mobile');await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await view('cover');
  pass('grouped module and scenario directories and their back links fit a 390px viewport');
};
