'use strict';
const assert=require('node:assert/strict');
module.exports=async({evaluate,click,navigate,cdp,base,pass})=>{
  const run=fn=>evaluate('('+fn.toString()+')()');
  await navigate(base+'/presentation-demo/#m101-lanes-issues');
  const flows=await run(()=>window.PresentationModules.contents.find(doc=>doc.id==='M1-01').submoduleFlows.map(flow=>Object.fromEntries(flow.stages.map(stage=>[stage.id,stage.pageId]))));
  const config=await run(()=>{const c=window.visualLayoutEditor.store.config;return JSON.stringify({imageViews:c.imageViews,highlights:c.legacyState.highlights,texts:c.legacyState.texts});});
  const state=()=>run(()=>{const c=window.PresentationModules.displayContext();return {page:window.generalRoadPresentation.page.id,topic:c.topic?.id,topics:c.stage?.topics?.map(topic=>topic.id)};});
  const issueState=()=>run(()=>({page:window.generalRoadPresentation.page.id,point:document.querySelector('.is-module-point-active')?.dataset.modulePoint,points:[...document.querySelectorAll('.module-explain-points>[data-module-point]')].map(node=>node.dataset.modulePoint),asset:document.querySelector('.module-map-canvas')?.dataset.editorImageKey}));
  const next=async keyboard=>{
    if(!keyboard){await click('#next');return;}
    await run(()=>document.activeElement?.blur());
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'PageDown',code:'PageDown'});
    await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'PageDown',code:'PageDown'});
    await evaluate('window.generalRoadPresentation.whenIdle()');
  };
  for(const flow of flows){
    await evaluate(`(async()=>{await window.generalRoadPresentation.goPage(${JSON.stringify(flow.issues)});await window.generalRoadPresentation.whenIdle();})()`);
    const issuePoints=(await issueState()).points;assert(issuePoints.length>1);
    const firstAsset=await evaluate(`'module:'+window.PresentationModules.displayContext().source.points.find(point=>point.id===${JSON.stringify(issuePoints[0])}).focus.asset`);
    for(const keyboard of [false,true]){
      await click('[data-module-point="'+issuePoints.at(-1)+'"]');
      assert.equal((await issueState()).point,issuePoints.at(-1));
      await evaluate('window.generalRoadPresentation.refresh()');
      assert.equal((await issueState()).point,issuePoints.at(-1),'Same-page refresh must keep the current issue');
      if(!keyboard){
        await click('.edit-toggle');assert.equal((await issueState()).point,issuePoints.at(-1),'Editing must keep the current issue');
        await click('.edit-toggle');assert.equal((await issueState()).point,issuePoints.at(-1));
      }
      const previous=await evaluate('window.PresentationStructure.navigationTarget(-1).id');
      await evaluate(`(async()=>{await window.generalRoadPresentation.goPage(${JSON.stringify(previous)});await window.generalRoadPresentation.whenIdle();})()`);
      await next(keyboard);
      assert.deepEqual(await issueState(),{page:flow.issues,point:issuePoints[0],points:issuePoints,asset:firstAsset},'Re-entering from the previous slide must start at the first issue and its photo');
      assert.match(await run(()=>document.getElementById('next-label').textContent),/02/);
      for(const point of issuePoints.slice(1)){await next(keyboard);assert.equal((await issueState()).point,point,'Issues must still advance in order');}
      if(!keyboard){await click('#previous');assert.equal((await issueState()).point,issuePoints.at(-2));await next(false);assert.equal((await issueState()).point,issuePoints.at(-1));}
      if(keyboard){await next(true);assert.equal((await state()).page,flow.diagram);}
    }
    await evaluate(`(async()=>{await window.generalRoadPresentation.goPage(${JSON.stringify(flow.diagram)});await window.generalRoadPresentation.whenIdle();})()`);
    const topics=(await state()).topics;assert(topics.length>1);
    for(const keyboard of [false,true]){
      await click('[data-module-topic="'+topics.at(-1)+'"]');
      await click('#presentation .module-subnav [data-page="'+flow.issues+'"]');
      assert.equal((await state()).page,flow.issues);
      for(let i=0;i<12&&(await state()).page!==flow.diagram;i++)await next(keyboard);
      assert.deepEqual(await state(),{page:flow.diagram,topic:topics[0],topics},'Re-entering from issues must start at the first concept');
      for(const topic of topics.slice(1)){await next(keyboard);assert.equal((await state()).topic,topic,'Concepts must still advance in order');}
      await next(keyboard);assert.equal((await state()).page,flow.extensions);
      await click('#previous');assert.equal((await state()).topic,topics.at(-1),'Previous should retain the concept last presented');
    }
    await click('[data-module-topic="'+topics[1]+'"]');
    await evaluate('window.generalRoadPresentation.refresh()');
    assert.equal((await state()).topic,topics[1],'Refreshing or editing a concept must keep its selection');
    await navigate(base+'/presentation-demo/#'+flow.diagram+'/topic-'+topics.at(-1));
    assert.equal((await state()).topic,topics.at(-1),'Explicit topic URLs must still open the requested concept');
  }
  assert.equal(await run(()=>{const c=window.visualLayoutEditor.store.config;return JSON.stringify({imageViews:c.imageViews,highlights:c.legacyState.highlights,texts:c.legacyState.texts});}),config,'Navigation must preserve saved views, frames and text');
  pass('Both M1-01 submodules restart at the first issue/photo and first concept on forward entry; Next/PageDown, Previous, same-page refresh, editing and explicit topic links retain their intended behavior.');
  await navigate(base+'/presentation-demo/#m201-stop-issues');
  const stopIssues=await issueState();assert.equal(stopIssues.asset,'module:stop-issue-photo-1');
  await next(false);assert.equal((await issueState()).asset,'module:stop-issue-photo-1');
  await next(true);assert.equal((await issueState()).asset,'module:stop-issue-photo-2');
  await next(false);assert.equal((await state()).page,'m201-stop-layout');assert.equal((await state()).topic,'sign');
  await next(false);assert.equal((await state()).topic,'line');await next(false);assert.equal((await state()).page,'m201-stop-extensions');
  const visible=()=>run(()=>[...document.querySelectorAll('.module-extension-card:not([hidden])')].map(node=>node.dataset.moduleTopicId));
  assert.deepEqual(await visible(),['crosswalk','refuge']);await next(false);assert.deepEqual(await visible(),['warning']);
  await click('#previous');assert.deepEqual(await visible(),['crosswalk','refuge']);await next(true);assert.deepEqual(await visible(),['warning']);
  await evaluate('(async()=>{await window.generalRoadPresentation.goPage("m201-stop-layout");await window.generalRoadPresentation.whenIdle();})()');
  await click('[data-module-topic="line"]');await next(false);assert.deepEqual(await visible(),['crosswalk','refuge']);
  pass('Stop-control photos follow 1/1/2, its two concepts advance into application groups, and application Next/PageDown, Previous and re-entry keep the correct group.');
};
