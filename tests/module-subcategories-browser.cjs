'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,click,navigate,cdp,base,artifacts,pass}){
  const shot=async name=>{await evaluate('(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))})()');const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  const active=()=>evaluate('document.querySelector(".module-subnav [aria-current=page]")?.dataset.submoduleId||null');
  const visible=()=>evaluate('[...document.querySelectorAll(".module-page-nav [data-page]")].map(node=>node.dataset.page)');
  const pages=await evaluate('window.PresentationModules.content.pages.map(page=>({id:page.id,submoduleId:page.submoduleId||null}))');
  const common=pages.filter(page=>!page.submoduleId).map(page=>page.id);
  await view('m201-overview');assert.deepEqual(await evaluate('[...document.querySelectorAll(".module-subnav [data-submodule-id]")].map(node=>node.textContent)'),['總覽','M2-01.1 停管制','M2-01.2 讓管制']);assert.equal(await active(),'overview');assert.deepEqual(await visible(),common);
  const flows=await evaluate('window.PresentationModules.content.submoduleFlows');
  for(const flow of flows){
    await click('.module-subnav [data-submodule-id="'+flow.submoduleId+'"]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),flow.stages[0].pageId);assert.equal(await active(),flow.submoduleId);assert.equal(await evaluate('document.querySelectorAll(".module-topic-nav").length'),0);assert.match(await evaluate('document.getElementById("slide-title").textContent'),/現況議題/);
    assert.match(await evaluate('document.getElementById("slide-title").textContent'),/現況議題與相關條文$/);assert.equal(await evaluate('document.querySelectorAll(".module-explanation .module-reference-row").length'),0);assert(await evaluate('document.querySelector(".module-related-nav").previousElementSibling.classList.contains("module-layout")'));
    const related=await evaluate('[...document.querySelectorAll(".module-related-nav .article-chip")].map(node=>[node.querySelector("span").textContent,node.lastChild.textContent])');assert.deepEqual(related,flow.submoduleId==='M2-01.1'?[['§ 58','停車再開標誌'],['§ 170','停止線'],['§ 177','停標字'],['§ 189','路口行車導引線']]:[['§ 59','讓路標誌'],['§ 149','雙白虛線'],['§ 172','讓路線'],['§ 189','路口行車導引線']]);
    await click('.module-related-nav .article-chip');assert(await evaluate('document.querySelector(".module-info-dialog").open'));await evaluate('document.querySelector(".module-info-dialog").close()');
    await shot('module-flow-'+flow.submoduleId+'-issues');
    for(const stage of flow.stages.slice(1)){
      await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),stage.pageId);assert.match(await evaluate('document.getElementById("slide-title").textContent'),new RegExp(stage.title));assert.equal(await evaluate('document.querySelectorAll(".module-page-nav").length'),0);
      if(stage.id==='extensions'){
        assert.equal(await evaluate('document.querySelectorAll(".module-topic-nav,.module-reference-row,.module-related-nav").length'),0);assert.deepEqual(await evaluate('[...document.querySelectorAll(".module-extension-card-heading h2")].map(node=>node.textContent)'),stage.topics.map(topic=>topic.label));
        assert(await evaluate('[...document.querySelectorAll(".module-extension-thumbnail")].every(image=>getComputedStyle(image).minHeight==="0px"&&image.getBoundingClientRect().bottom<=image.parentElement.getBoundingClientRect().bottom+1)'),'Extension thumbnails should fit inside their image buttons');
        for(const topic of stage.topics){const card='.module-extension-card[data-module-topic-id="'+topic.id+'"]',source=await evaluate('window.PresentationModules.content.pages.find(page=>page.id==='+JSON.stringify(topic.sourcePageId)+')');assert.deepEqual(await evaluate('[...document.querySelectorAll('+JSON.stringify(card+' .module-explain-points>li')+')].map(node=>node.dataset.modulePoint)'),topic.pointIds||source.points.map(point=>point.id));assert.deepEqual(await evaluate('[...document.querySelectorAll('+JSON.stringify(card+' [data-editor-image-key]')+')].map(node=>node.dataset.editorImageKey)'),(topic.assets||source.assets).map(id=>'module:'+id));}
        await shot('module-flow-'+flow.submoduleId+'-'+stage.id);await navigate(base+'/presentation-demo/#'+stage.pageId);assert.equal(await evaluate('document.querySelectorAll(".module-extension-card").length'),stage.topics.length);continue;
      }
      assert.deepEqual(await evaluate('[...document.querySelectorAll(".module-topic-nav button")].map(node=>node.textContent)'),stage.topics.map(topic=>topic.label));
      for(const topic of stage.topics){
        assert.equal(await evaluate('document.querySelectorAll(".module-reference-row,.module-related-nav").length'),0);
        await click('[data-module-topic="'+topic.id+'"]');assert.equal(await active(),flow.submoduleId);assert.equal(await evaluate('window.generalRoadPresentation.page.id'),stage.pageId);assert.equal(await evaluate('document.querySelector(".module-switcher .active").dataset.moduleId'),'M2-01');assert.equal(await evaluate('document.querySelector("[data-module-source-page]").dataset.moduleSourcePage'),topic.sourcePageId);assert.equal(await evaluate('document.querySelectorAll(".module-explanation [data-module-focus],.module-focus-button").length'),0);
        const source=await evaluate('window.PresentationModules.displayContext().source');assert.deepEqual(await evaluate('[...document.querySelectorAll(".module-explain-points>li")].map(node=>node.dataset.modulePoint)'),topic.pointIds||source.points.map(point=>point.id));
        const assets=topic.assets||source.assets;assert.deepEqual(await evaluate('[...document.querySelectorAll(".module-map-canvas")].map(node=>node.dataset.editorImageKey)'),(source.mode==='pair'?assets:[assets[0]]).map(id=>'module:'+id));assert.equal(await evaluate('document.querySelector(".module-topic-nav [aria-pressed=true]").dataset.moduleTopic'),topic.id);
      }
      await shot('module-flow-'+flow.submoduleId+'-'+stage.id);const hash=await evaluate('location.hash');await navigate(base+'/presentation-demo/'+hash);assert.equal(await evaluate('document.querySelector(".module-topic-nav [aria-pressed=true]").dataset.moduleTopic'),stage.topics.at(-1).id);assert.equal(await active(),flow.submoduleId);
    }
  }
  await click('#previous');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m201-yield-layout');await click('#previous');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m201-yield-issues');await click('#previous');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m201-stop-extensions');
  for(const [alias,anchor,topic]of [['m201-stop-crosswalk','m201-stop-extensions','crosswalk'],['m201-stop-warning','m201-stop-extensions','warning'],['m201-yield-crosswalk','m201-yield-extensions','crosswalk'],['m201-yield-buffer','m201-yield-extensions','buffer']]){await navigate(base+'/presentation-demo/#'+alias);assert.equal(await evaluate('window.generalRoadPresentation.page.id'),anchor);assert.equal(await evaluate('document.querySelectorAll(".module-extension-card").length'),4);assert(await evaluate('Boolean(document.querySelector(\'.module-extension-card[data-module-topic-id="'+topic+'"]\'))'));}
  await click('.module-subnav [data-submodule-id="overview"]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m201-overview');await click('.module-page-nav [data-page="m201-applications"]');assert.equal(await active(),'overview');assert.deepEqual(await visible(),common);
  pass('both children retain three stages; diagram tabs and all eight extension cards show the correct content and optional images, with legacy links and reload support');
  const entries=await evaluate('window.PresentationModules.catalog.modules');
  for(const entry of entries.filter(entry=>!entry.ready)){
    await view('module-'+entry.id);
    if(entry.submodules.length>1){
      assert.equal(await evaluate('document.querySelectorAll(".module-subnav [data-submodule-id]").length'),entry.submodules.length+1);assert.equal(await active(),'overview');
      assert(await evaluate('(()=>{const ids=new Set(window.generalRoadPresentation.pages.map(page=>page.id));return [...document.querySelectorAll(".module-subnav [data-page]")].every(button=>ids.has(button.dataset.page))})()'));
      const sub=entry.submodules.at(-1);await click('.module-subnav [data-submodule-id="'+sub.id+'"]');assert.equal(await active(),sub.id);assert.equal(await evaluate('window.generalRoadPresentation.page.submoduleId'),sub.id);assert.match(await evaluate('document.getElementById("slide-title").textContent'),new RegExp(sub.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert(await evaluate('Boolean(document.querySelector(".presentation-empty-space"))'));assert.equal(await evaluate('document.querySelectorAll("main img,main svg").length'),0);
      await click('.module-subnav [data-submodule-id="overview"]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'module-'+entry.id);
    }else{
      assert.equal(await evaluate('document.querySelectorAll(".module-subnav").length'),0);assert.equal(await evaluate('window.generalRoadPresentation.page.submoduleId'),entry.submodules[0].id);assert(await evaluate('document.getElementById("slide-title").textContent.startsWith('+JSON.stringify(entry.submodules[0].id)+')'));
    }
  }
  pass('all unfilled modules provide valid child routes; multiple children have a selector and single children open directly without an extra row');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  for(const id of ['m201-stop-issues','m201-yield-issues','m201-stop-layout','m201-yield-layout','module-M2-04','submodule-M2-04-1','module-M1-02']){
    await view(id);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Subcategory overflow: '+id);assert(await evaluate('(()=>{const nav=document.querySelector(".module-subnav");if(!nav)return true;const b=nav.getBoundingClientRect();return [...nav.querySelectorAll("button")].every(button=>{const r=button.getBoundingClientRect();return r.left>=b.left-1&&r.right<=b.right+1&&r.bottom<=b.bottom+1})})()'));
  }
  await view('m201-stop-layout');await shot('module-subcategories-mobile');await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await view('m201-stop-layout');
  pass('subcategory selectors and filtered content fit a 390px viewport');
};
