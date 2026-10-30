'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,mouse,cdp,base,artifacts,pass,previewConfigPath}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),config=JSON.parse(baseline);config.navigationOrders={};fs.writeFileSync(previewConfigPath,JSON.stringify(config));
  const nav='.article-nav[data-navigation-order]',topics=()=>evaluate('[...document.querySelectorAll(".module-topic-nav [data-order-id]")].map(button=>button.dataset.orderId)');
  const articleIds=()=>evaluate('[...document.querySelectorAll(".article-nav [data-order-id]")].map(button=>button.dataset.orderId)');
  const camera=selector=>evaluate('window.generalRoadViewport.get(document.querySelector('+JSON.stringify(selector)+')).read()');
  const snapshot=()=>evaluate('window.visualLayoutEditor.store.serialize()');
  const shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  async function startDrag(id,target,after){
    await evaluate('document.querySelector('+JSON.stringify(nav)+').scrollIntoView({block:"center"})');
    const positions=await evaluate('(()=>{const a=document.querySelector(\'[data-order-id="'+id+'"]\').getBoundingClientRect(),b=document.querySelector(\'[data-order-id="'+target+'"]\').getBoundingClientRect();return {x:a.left+a.width/2,y:a.top+a.height/2,tx:b.left+b.width*( '+(after?'.8':'.2')+' ),ty:b.top+b.height/2}})()');
    await mouse('mouseMoved',positions.x,positions.y);await mouse('mousePressed',positions.x,positions.y,{button:'left',buttons:1,clickCount:1});
    for(let step=1;step<=8;step++)await mouse('mouseMoved',positions.x+(positions.tx-positions.x)*step/8,positions.y+(positions.ty-positions.y)*step/8,{button:'left',buttons:1});
    return positions;
  }
  async function finishDrag(p){await mouse('mouseReleased',p.tx,p.ty,{button:'left',buttons:0,clickCount:1});await evaluate('new Promise(requestAnimationFrame)');}
  async function drag(id,target,after=false){await finishDrag(await startDrag(id,target,after));}
  await navigate(base+'/presentation-demo/#m101-lanes-diagram/topic-guide');
  assert.match(await evaluate('document.querySelector(".module-heading .eyebrow").textContent'),/2\s*\/\s*3/);
  const original=await topics();assert.equal(original.length,6);assert.equal(await evaluate('document.querySelectorAll(".can-reorder").length'),0);
  const preview=await snapshot();await drag(original[0],original.at(-1),true);assert.equal(await snapshot(),preview,'Preview dragging must not modify settings');
  await click('[data-module-topic="guide"]');await click('.edit-toggle');assert.equal(await evaluate('document.querySelectorAll(".can-reorder").length'),6);
  const beforeCamera=await camera('.module-diagram'),frameKey=await evaluate('window.generalRoadPresentation.editorFrames()[0].key'),past=await evaluate('window.visualLayoutEditor.store.past.length');
  const p=await startDrag(original[0],original.at(-1),true);assert(await evaluate('Boolean(document.querySelector(".navigation-order-ghost"))'));assert(await evaluate('Boolean(document.querySelector("[data-drop-side=after]"))'));await shot('navigation-order-dragging');await finishDrag(p);
  let expected=original.slice(1).concat(original[0]);assert.deepEqual(await topics(),expected);assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m101-lanes-diagram');
  assert.equal(await evaluate('window.PresentationModules.displayContext().topic.id'),'guide');assert.equal(await evaluate('window.generalRoadPresentation.editorFrames()[0].key'),frameKey);assert.deepEqual(await camera('.module-diagram'),beforeCamera);assert.equal(await evaluate('window.visualLayoutEditor.store.past.length'),past+1);
  await click('[data-vl-action="undo"]');assert.deepEqual(await topics(),original);await click('[data-vl-action="redo"]');assert.deepEqual(await topics(),expected);
  assert.deepEqual(await camera('.module-diagram'),beforeCamera);
  await evaluate('document.querySelector(\'[data-order-id="'+original[0]+'"]\').focus({preventScroll:true})');
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',modifiers:1});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft',modifiers:1});
  expected=expected.slice(0,-2).concat(expected.at(-1),expected.at(-2));assert.deepEqual(await topics(),expected);
  const cancelPast=await evaluate('window.visualLayoutEditor.store.past.length'),cancelPosition=await startDrag(expected[0],expected.at(-1),true);
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await finishDrag(cancelPosition);
  assert.deepEqual(await topics(),expected);assert.equal(await evaluate('window.visualLayoutEditor.store.past.length'),cancelPast);assert.equal(await evaluate('document.querySelectorAll(".navigation-order-ghost,[data-drop-side]").length'),0);
  const outside=await startDrag(expected[0],expected.at(-1),true);await mouse('mouseMoved',outside.tx,outside.ty-100,{button:'left',buttons:1});await mouse('mouseReleased',outside.tx,outside.ty-100,{button:'left',buttons:0,clickCount:1});assert.deepEqual(await topics(),expected);assert.equal(await evaluate('window.visualLayoutEditor.store.past.length'),cancelPast);
  fs.writeFileSync(previewConfigPath,await snapshot());await navigate(base+'/presentation-demo/#m101-lanes-diagram/topic-guide');assert.deepEqual(await topics(),expected);assert.equal(await evaluate('window.PresentationModules.displayContext().topic.id'),'guide');
  await view('m101-additional-diagram');assert.deepEqual(await topics(),await evaluate('window.PresentationModules.displayContext().stage.topics.map(topic=>topic.id)'));assert.equal(await evaluate('Object.keys(window.visualLayoutEditor.store.config.navigationOrders).length'),1);
  pass('module topic buttons reorder with real pointer dragging and Alt+arrows, preserve content/highlights/cameras, cancel with Escape, and survive undo/redo and reload independently');

  await view('edge',1);const general=await articleIds();assert(general.length>=9);await click('.edit-toggle');const mapCamera=await camera('#main-map');
  await drag(general.at(-1),general[0]);const reordered=[general.at(-1),...general.slice(0,-1)];assert.deepEqual(await articleIds(),reordered);assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'edge');assert.deepEqual(await camera('#main-map'),mapCamera);
  assert.deepEqual(await evaluate('window.generalRoadPresentation.pages.filter(page=>page.scenario==="g1-01"&&page.article).map(page=>page.id)'),reordered);
  await click('[data-vl-action="undo"]');assert.deepEqual(await articleIds(),general);await click('[data-vl-action="redo"]');assert.deepEqual(await articleIds(),reordered);
  assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'edge');assert.deepEqual(await camera('#main-map'),mapCamera);
  fs.writeFileSync(previewConfigPath,await snapshot());await navigate(base+'/presentation-demo/#edge/zoom');assert.deepEqual(await articleIds(),reordered);
  await click('.article-nav [data-page="'+reordered[0]+'"]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),reordered[0]);await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),reordered[1]);
  assert.match(await evaluate('document.querySelector(".explain-index").textContent'),/02\s*\/\s*09/);
  await shot('navigation-order-articles');await view('m101-lanes-diagram');assert.deepEqual(await topics(),expected);
  pass('general-road article buttons, page numbers and previous/next navigation share the saved order while retaining the active article, highlight and image camera');

  const rural=await evaluate('(()=>{const scene=window.generalRoadPresentation.data.scenarios[1];return {id:scene.id,overview:scene.overviewId,comparison:scene.comparisonId,article:window.generalRoadPresentation.data.articles.find(article=>article.scenario===scene.id&&String(article.reg)==="185").id}})()');
  await view(rural.overview);const ruralOrder=await articleIds();assert(!ruralOrder.includes(reordered[0]));await click('.edit-toggle');await drag(rural.article,ruralOrder.filter(id=>id!==rural.article).at(-1),true);
  assert.equal((await articleIds()).at(-1),rural.article);assert(await evaluate('(()=>{const pages=window.generalRoadPresentation.pages;return pages.findIndex(page=>page.id==='+JSON.stringify(rural.comparison)+')===pages.findIndex(page=>page.id==='+JSON.stringify(rural.article)+')+1})()'));
  await click('.edit-toggle');await view('edge',1);assert.deepEqual(await articleIds(),reordered);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:760,height:1000,deviceScaleFactor:1,mobile:false});await click('.edit-toggle');
  const wrapBefore=await articleIds();await drag(wrapBefore.at(-1),wrapBefore[0]);assert.deepEqual(await articleIds(),[wrapBefore.at(-1),...wrapBefore.slice(0,-1)]);assert(await evaluate('document.querySelector("main").scrollWidth<=innerWidth+1'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  pass('scenario orders remain isolated, crosswalk comparison stays with its article, and wrapped button rows support dragging across rows');
  fs.writeFileSync(previewConfigPath,baseline);
};
