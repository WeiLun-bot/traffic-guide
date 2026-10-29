'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,click,navigate,wait,cdp,base,artifacts,pass,previewConfigPath,previewConfigText,editText}){
  const ids=['M1-01','M1-02','M1-03','M2-02'];
  const shot=async name=>{const data=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(data.data,'base64'));};
  await view('modules-index');assert.equal(await evaluate('document.querySelectorAll(".module-catalog-card small").length'),15);
  const library=await evaluate('window.PresentationModules.contents.filter(content=>'+JSON.stringify(ids)+'.includes(content.id))');assert.equal(library.length,4);
  for(const content of library){
    for(const flow of content.submoduleFlows){
      for(const stage of flow.stages){
        await view(stage.pageId);assert.equal(await evaluate('window.generalRoadPresentation.page.moduleId'),content.id);
        assert.equal(await evaluate('document.querySelector("main>.slide").dataset.moduleStage'),stage.id);
        assert.equal(await evaluate('document.querySelectorAll(".module-subnav").length'),content.submoduleFlows.length>1?1:0);
        if(stage.id==='issues')assert.deepEqual(await evaluate('[...document.querySelectorAll(".module-related-nav .article-chip")].map(node=>node.textContent)'),content.pages.find(page=>page.id===stage.pageId).references.map(reg=>'§ '+reg+content.referenceNames[reg]));
        else assert.equal(await evaluate('document.querySelectorAll(".module-related-nav,.module-reference-row").length'),0);
        if(stage.id==='diagram')for(const topic of stage.topics){
          await click('[data-module-topic="'+topic.id+'"]');
          assert.equal(await evaluate('document.querySelector(".module-topic-title").textContent'),topic.label);
          const source=content.pages.find(page=>page.id===topic.sourcePageId),expected=topic.pointIds||source.points.map(point=>point.id);
          assert.deepEqual(await evaluate('[...document.querySelectorAll(".module-explain-points>li")].map(node=>node.dataset.modulePoint)'),expected);
          assert((await evaluate('[...document.querySelectorAll(".module-diagram")].map(node=>node.getBoundingClientRect().height)')).every(height=>height>=120));
        }
        if(stage.id==='extensions'){
          assert.equal(await evaluate('document.querySelectorAll(".module-extension-card").length'),stage.topics.length);
          for(const topic of stage.topics){const source=content.pages.find(page=>page.id===topic.sourcePageId);assert.deepEqual(await evaluate('[...document.querySelectorAll('+JSON.stringify('.module-extension-card[data-module-topic-id="'+topic.id+'"] .module-explain-points>li')+')].map(node=>node.dataset.modulePoint)'),topic.pointIds||source.points.map(point=>point.id));}
          await shot(content.id+'-'+flow.submoduleId+'-extensions');
        }
      }
    }
    await view(content.submoduleFlows[0].stages[1].pageId);await shot(content.id+'-diagram');
  }
  pass('all four added modules retain three-stage flows, related-article names, diagram tabs, optional extension images and appropriate child navigation');
  const images=await evaluate('(async()=>{const assets=window.PresentationModules.contents.filter(content=>'+JSON.stringify(ids)+'.includes(content.id)).flatMap(content=>Object.values(content.assets));return Promise.all(assets.map(async asset=>{const response=await fetch(asset.file);const image=new Image();image.src=URL.createObjectURL(await response.blob());try{await image.decode();return {file:asset.file,ok:response.ok,mime:response.headers.get("content-type"),width:image.naturalWidth,height:image.naturalHeight};}catch(error){return {file:asset.file,error:error.message};}finally{URL.revokeObjectURL(image.src);}}))})()');
  assert.equal(images.length,25);assert(images.every(image=>image.ok&&image.width>0&&image.height>0),JSON.stringify(images.filter(image=>!image.ok||!image.width)));assert(images.find(image=>image.file.endsWith('.jpeg')).mime.startsWith('image/jpeg'));
  await view('m103-parking-extensions');await click('.module-extension-card[data-module-topic-id="germany"] .module-extension-image-open');assert(await evaluate('document.getElementById("asset-dialog").open'));await evaluate('document.getElementById("asset-dialog").close()');
  await view('m202-roundabout-extensions');assert.equal(await evaluate('document.querySelectorAll(".module-extension-image").length'),0);
  for(const [old,id]of [['module-M1-01','m101-overview'],['submodule-M1-01-2','m101-additional-issues'],['module-M1-02','m102-route-issues'],['module-M1-03','m103-parking-issues'],['module-M2-02','m202-roundabout-issues']]){await navigate(base+'/presentation-demo/#'+old);assert.equal(await evaluate('window.generalRoadPresentation.page.id'),id);}
  await view('m103-parking-issues');await click('[data-module-reference="118"]');assert.match(await evaluate('document.querySelector(".module-info-dialog h2").textContent'),/停車處標誌/);assert(!await evaluate('document.querySelector(".module-info-dialog").textContent.includes("M2-01 資料來源")'));await click('.module-info-dialog [data-close]');
  await click('[data-module-scenario="overview"]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'overview');await click('[data-back-module]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m103-parking-issues');
  await click('[data-module-scenario="scenario-c4-05"]');assert.equal(await evaluate('window.generalRoadPresentation.page.scenarioCode'),'C4-05');await click('[data-back-module]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m103-parking-issues');
  pass('all twenty-five supplied SVG/PNG/JPEG figures decode, image enlargement works, legacy module links resolve and scenario links return to their owning module');
  await view('m102-route-diagram');await click('[data-module-topic="single"]');await click('.edit-toggle');await click('[data-content-action="add-point"]');
  const added=await evaluate('window.PresentationContent.current.model.points.at(-1)'),selector='.module-explain-points>li[data-content-item-id="'+added.id+'"]';
  await editText(selector+' p','路徑指示測試補充。');assert.equal(added.topicId,'single');await click('.edit-toggle');
  fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));await navigate(base+'/presentation-demo/#m102-route-diagram/topic-single');assert.equal(await evaluate('document.querySelector('+JSON.stringify(selector+' p')+').textContent'),'路徑指示測試補充。');await click('[data-module-topic="lanes"]');assert.equal(await evaluate('document.querySelectorAll('+JSON.stringify(selector)+').length'),0);
  await view('m201-stop-layout');assert.equal(await evaluate('document.querySelector("main>.slide").dataset.moduleId'),'M2-01');assert(!await evaluate('document.querySelector(".module-explain-points").textContent.includes("路徑指示測試補充")'));
  fs.writeFileSync(previewConfigPath,previewConfigText);await navigate(base+'/presentation-demo/#m101-lanes-diagram');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  for(const content of library)for(const flow of content.submoduleFlows)for(const stage of flow.stages){await view(stage.pageId);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Overflow: '+stage.pageId);}
  await shot('module-library-mobile');await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  pass('new-module content edits persist through JSON reload without crossing topic or module boundaries; all new stages fit a 390px viewport');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  const button=await evaluate('(()=>{const r=document.getElementById("fullscreen-button").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...button,button:'left',buttons:1,clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...button,button:'left',buttons:0,clickCount:1});await wait('Boolean(document.fullscreenElement)');
  for(const content of library)for(const flow of content.submoduleFlows)for(const stage of flow.stages){
    await view(stage.pageId);assert(await evaluate('document.querySelector("main").scrollHeight<=document.querySelector("main").clientHeight+1'),'Fullscreen slide overflow: '+stage.pageId);
    if(stage.id==='extensions'){
      assert.equal(await evaluate('[...document.querySelectorAll(".module-extension-card")].filter(node=>!node.hidden).length'),Math.min(2,stage.topics.length));
      await shot(content.id+'-'+flow.submoduleId+'-fullscreen');
    }
  }
  await evaluate('document.exitFullscreen()');await wait('!document.fullscreenElement');await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  pass('every new slide fits a 1366×768 fullscreen viewport and extension pages show at most two taller cards at a time');
};
