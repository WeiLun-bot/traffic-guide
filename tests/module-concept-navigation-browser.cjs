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
      assert.match(await run(()=>document.getElementById('next-label').textContent),/下一個重點 0?2$/);
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
  await next(false);assert.equal((await issueState()).asset,'module:stop-issue-photo-2');
  await next(true);assert.equal((await issueState()).asset,'module:stop-issue-photo-3');
  await next(false);assert.equal((await state()).page,'m201-stop-layout');assert.equal((await state()).topic,'sign');
  await next(false);assert.equal((await state()).topic,'line');await next(false);assert.equal((await state()).page,'m201-stop-extensions');
  const visible=()=>run(()=>[...document.querySelectorAll('.module-extension-card:not([hidden])')].map(node=>node.dataset.moduleTopicId));
  assert.deepEqual(await run(()=>Object.fromEntries([...document.querySelectorAll('.module-extension-card')].map(card=>[card.dataset.moduleTopicId,[...card.querySelectorAll('[data-module-point]')].map(point=>point.dataset.modulePoint)]))),{crosswalk:['pedestrian','second','sign'],refuge:['refuge'],curb:['curb','vehicle']});
  assert.deepEqual(await visible(),['crosswalk','refuge','curb']);assert.equal(await run(()=>document.querySelector('.module-extension-pager').hidden),true);
  await next(false);assert.equal((await state()).page,'m201-yield-issues');
  await click('#previous');assert.deepEqual(await visible(),['crosswalk','refuge','curb']);await next(true);assert.equal((await state()).page,'m201-yield-issues');
  await evaluate('(async()=>{await window.generalRoadPresentation.goPage("m201-stop-layout");await window.generalRoadPresentation.whenIdle();})()');
  await click('[data-module-topic="line"]');await next(false);assert.deepEqual(await visible(),['crosswalk','refuge','curb']);
  pass('Stop-control photos follow 1/2/3; its two concepts advance into three parallel application cards, and Next/PageDown advances to yield control without an extra group.');
  await navigate(base+'/presentation-demo/#m201-yield-layout');
  assert.deepEqual((await state()).topics,['sign','line']);
  assert.equal((await state()).topic,'sign');await next(false);assert.equal((await state()).topic,'line');await next(false);
  assert.equal((await state()).page,'m201-yield-extensions');assert.deepEqual(await visible(),['crosswalk']);
  assert.equal(await run(()=>document.querySelectorAll('.module-extension-card').length),1);
  assert.equal(await run(()=>document.querySelector('.module-extension-pager').hidden),true);
  await next(true);assert.notEqual((await state()).page,'m201-yield-extensions');
  pass('Yield control has two concepts and only the crosswalk application; Next/PageDown leaves without a deleted concept or refuge card.');
  await navigate(base+'/presentation-demo/#m203-signals-issues');
  const photos=()=>run(()=>[...document.querySelectorAll('.module-map-canvas')].map(node=>node.dataset.editorImageKey));
  const firstPhotos=['module:m203-signals-issue-photo-1','module:m203-signals-issue-photo-2'];
  assert.deepEqual((await issueState()).points,['visibility','inspection']);assert.deepEqual(await photos(),firstPhotos);
  await next(false);assert.equal((await issueState()).point,'inspection');assert.deepEqual(await photos(),['module:m203-signals-issue-photo-3']);
  await click('#previous');assert.equal((await issueState()).point,'visibility');assert.deepEqual(await photos(),firstPhotos);
  await next(true);assert.deepEqual(await photos(),['module:m203-signals-issue-photo-3']);await next(false);assert.equal((await state()).page,'m203-signals-diagram');
  await navigate(base+'/presentation-demo/#m202-roundabout-extensions');await next(false);assert.equal((await issueState()).point,'visibility');assert.deepEqual(await photos(),firstPhotos);
  pass('Signal issues switch between the first issue\'s two original photos and the second issue\'s new photo; re-entry, Previous and PageDown keep the correct mapping.');
  await navigate(base+'/presentation-demo/#m203-signals-diagram');
  const signalTopics=['basic','near-far','visibility','start','clearance'];
  const signalPhotos=[['m203-2f27e58a6a'],['m203-f01d41842a','m203-22b38300ee','m203-a3b46fb4f0','m203-3955393bcf'],['m203-upstream-visibility-template','m203-1d1f6b14f8'],['m203-9060c4516f','m203-1f4a9ba99d','m203-205bbd9cba'],['m203-d6e2d6ea4c']];
  for(let i=0;i<signalTopics.length;i++){
    assert.equal((await state()).topic,signalTopics[i]);
    assert.deepEqual(await photos(),signalPhotos[i].map(id=>'module:'+id),'Each concept must show all of its requested images');
    assert.deepEqual(await run(()=>[...document.querySelectorAll('.module-map-card')].map(figure=>figure.dataset.initialViewPage)),signalPhotos[i].map(()=>'modules-concept-m203-signals-diagram-'+signalTopics[i]),'Each gallery image must have its own concept-scoped initial view');
    if(i===3){assert.equal(await run(()=>document.querySelector('.module-concept-gallery').dataset.imageLayout),'row');await click('#previous');assert.equal((await state()).topic,'visibility');await next(false);}
    await next(i%2===1);
  }
  assert.equal((await state()).page,'m203-signals-extensions');await click('#previous');assert.equal((await state()).topic,'clearance');
  await navigate(base+'/presentation-demo/#m203-signals-issues');await next(false);await next(false);assert.equal((await state()).topic,'basic');
  pass('The five signal concepts show all requested images, retain separate initial-view scopes, and navigate forward, backward and on re-entry in the intended order.');
};
