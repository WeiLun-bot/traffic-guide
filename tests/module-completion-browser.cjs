'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,click,navigate,wait,cdp,base,artifacts,pass,previewConfigPath,previewConfigText,editText}){
  const chooseImage=async id=>evaluate('(()=>{const select=document.querySelector("[data-module-view-select]");select.value='+JSON.stringify(id)+';select.dispatchEvent(new Event("change",{bubbles:true}))})()');
  const docs=await evaluate('window.PresentationModules.contents.filter(content=>content.source.imageFiles).sort((a,b)=>a.id.localeCompare(b.id))');
  assert.equal(docs.length,10);assert.equal(await evaluate('window.PresentationModules.catalog.modules.filter(entry=>entry.ready).length'),15);
  const shot=async name=>{await evaluate('document.fonts.ready');const image=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(image.data,'base64'));};
  for(const doc of docs){
    for(const flow of doc.submoduleFlows)for(const stage of flow.stages){
      await view(stage.pageId);assert.equal(await evaluate('document.querySelector("main>.slide").dataset.moduleId'),doc.id);
      assert.equal(await evaluate('document.querySelector("main>.slide").dataset.moduleStage'),stage.id);
      if(stage.id==='issues')assert.deepEqual(await evaluate('[...document.querySelectorAll(".module-related-nav [data-module-reference]")].map(node=>node.dataset.moduleReference)'),doc.pages.find(page=>page.id===stage.pageId).references);
      else assert.equal(await evaluate('document.querySelectorAll(".module-related-nav,.module-reference-row").length'),0);
      if(stage.id==='diagram')for(const topic of stage.topics){
        await click('[data-module-topic="'+topic.id+'"]');const source=doc.pages.find(page=>page.id===topic.sourcePageId);
        assert.deepEqual(await evaluate('[...document.querySelectorAll(".module-explain-points>li")].map(node=>node.dataset.modulePoint)'),topic.pointIds||source.points.map(point=>point.id));
        const assetIds=topic.assets||source.assets;
        if(assetIds.length>1)for(const assetId of assetIds)await chooseImage(assetId);
      }
      if(stage.id==='extensions'){
        assert.equal(await evaluate('document.querySelectorAll(".module-extension-card").length'),stage.topics.length);
        for(const topic of stage.topics){const source=doc.pages.find(page=>page.id===topic.sourcePageId);assert.deepEqual(await evaluate('[...document.querySelectorAll('+JSON.stringify('.module-extension-card[data-module-topic-id="'+topic.id+'"] .module-explain-points>li')+')].map(node=>node.dataset.modulePoint)'),topic.pointIds||source.points.map(point=>point.id));}
      }
    }
    await view(doc.submoduleFlows[0].stages[1].pageId);await shot('completed-'+doc.id);
  }
  pass('ten completed modules show all three-stage explanations, exact related-article names, independent diagram topics and extension cards');
  const assets=docs.flatMap(doc=>Object.values(doc.assets));assert.equal(assets.length,79);
  for(let offset=0;offset<assets.length;offset+=6){
    const results=await evaluate('(async()=>{const results=[];for(const asset of '+JSON.stringify(assets.slice(offset,offset+6))+'){const response=await fetch(asset.file),image=new Image(),url=URL.createObjectURL(await response.blob());image.src=url;try{await image.decode();results.push({file:asset.file,ok:response.ok,width:image.naturalWidth,height:image.naturalHeight});}catch(error){results.push({file:asset.file,error:error.message});}finally{image.src="";URL.revokeObjectURL(url);}}return results})()');
    assert(results.every(image=>image.ok&&image.width>0&&image.height>0),JSON.stringify(results));
  }
  for(const doc of docs)for(const [id,asset]of Object.entries(doc.assets).filter(([,asset])=>asset.rotation)){
    const context=doc.submoduleFlows.flatMap(flow=>flow.stages).find(stage=>stage.id==='diagram'&&stage.topics.some(topic=>(topic.assets||doc.pages.find(page=>page.id===topic.sourcePageId).assets).includes(id)));
    if(!context)continue;
    await view(context.pageId);const topic=context.topics.find(topic=>(topic.assets||doc.pages.find(page=>page.id===topic.sourcePageId).assets).includes(id));await click('[data-module-topic="'+topic.id+'"]');
    if((topic.assets||doc.pages.find(page=>page.id===topic.sourcePageId).assets).length>1)await chooseImage(id);
    const width=asset.rotation%180?asset.height:asset.width,height=asset.rotation%180?asset.width:asset.height;
    assert.equal(await evaluate('document.querySelector(".module-diagram").getAttribute("viewBox")'),'0 0 '+width+' '+height);
    assert.equal(await evaluate('window.generalRoadPresentation.data.assetMeta['+JSON.stringify('module:'+id)+'].rotation'),asset.rotation);
    await click('.module-map-card [data-asset]');assert(await evaluate('document.getElementById("asset-dialog").open'));await evaluate('document.getElementById("asset-dialog").close()');
  }
  await view('m302-crossing-reference');assert.equal(await evaluate('document.querySelectorAll(".module-map-card,.module-applications").length'),0);await click('[data-module-route="m302-lane-diagram/topic-crossing"]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m302-lane-diagram');assert.equal(await evaluate('window.PresentationModules.displayContext().topic.id'),'crossing');
  await view('m303-lane-reference');await click('.module-referral-links button');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m101-lanes-extensions');
  pass('all seventy-nine active Typst figures decode; rotations match source orientation and both reference-only sections open the specified module');
  await view('m203-signals-diagram');await click('[data-module-topic="visibility"]');await click('.edit-toggle');await click('[data-content-action="add-point"]');
  const note=await evaluate('window.PresentationContent.current.model.points.at(-1)'),selector='.module-explain-points>li[data-content-item-id="'+note.id+'"]';await editText(selector+' p','號誌可視模板的補充說明。');await click('.edit-toggle');
  fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));await navigate(base+'/presentation-demo/#m203-signals-diagram/topic-visibility');assert.equal(await evaluate('document.querySelector('+JSON.stringify(selector+' p')+').textContent'),'號誌可視模板的補充說明。');
  await click('[data-module-topic="basic"]');assert.equal(await evaluate('document.querySelectorAll('+JSON.stringify(selector)+').length'),0);await view('m401-local-diagram');assert(!await evaluate('document.querySelector(".module-explain-points").textContent.includes("號誌可視模板的補充說明")'));
  fs.writeFileSync(previewConfigPath,previewConfigText);await navigate(base+'/presentation-demo/#m203-signals-issues');
  pass('new explanation items survive JSON reload and remain isolated from other topics and modules');
  const pages=await evaluate('window.PresentationModules.pages().filter(page=>'+JSON.stringify(docs.map(doc=>doc.id))+'.includes(page.moduleId))');assert.equal(pages.length,64);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  for(const page of pages){await view(page.id);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Mobile overflow: '+page.id);}
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  const button=await evaluate('(()=>{const r=document.getElementById("fullscreen-button").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...button,button:'left',buttons:1,clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...button,button:'left',buttons:0,clickCount:1});await wait('Boolean(document.fullscreenElement)');
  for(const page of pages){await view(page.id);assert(await evaluate('document.querySelector("main").scrollHeight<=document.querySelector("main").clientHeight+1'),'Fullscreen overflow: '+page.id);if(page.id.endsWith('-extensions'))assert(await evaluate('[...document.querySelectorAll(".module-extension-card")].filter(node=>!node.hidden).length<=2'));}
  await view('m304-stop-extensions');await shot('completed-bus-fullscreen');await view('m203-signals-diagram');await shot('completed-signals-fullscreen');
  await evaluate('document.exitFullscreen()');await wait('!document.fullscreenElement');await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  pass('all sixty-four new pages fit mobile width and a 1366×768 fullscreen viewport; extensions show at most two taller cards');
};
