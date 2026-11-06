'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,mouse,cdp,base,artifacts,pass,previewConfigPath}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),config=JSON.parse(baseline);config.scenarioOtherArticles={};config.navigationOrders={};fs.writeFileSync(previewConfigPath,JSON.stringify(config));
  const values=group=>evaluate(`[...document.querySelectorAll('[data-article-group="${group}"] [data-order-id]')].map(node=>node.dataset.orderId)`);
  const snapshot=()=>evaluate('window.visualLayoutEditor.store.serialize()');
  async function drag(id,group,target){
    const p=await evaluate(`(()=>{const a=document.querySelector('[data-order-id="${id}"]'),b=document.querySelector(${JSON.stringify(target?'[data-order-id="'+target+'"]':'[data-article-group="'+group+'"] .article-index-items')});b.scrollIntoView({block:'center'});const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return {x:x.left+x.width/2,y:x.top+x.height/2,tx:y.left+(y.width*.2),ty:y.top+y.height/2}})()`);
    await mouse('mouseMoved',p.x,p.y);await mouse('mousePressed',p.x,p.y,{button:'left',buttons:1,clickCount:1});
    for(let i=1;i<=8;i++)await mouse('mouseMoved',p.x+(p.tx-p.x)*i/8,p.y+(p.ty-p.y)*i/8,{button:'left',buttons:1});
    await mouse('mouseReleased',p.tx,p.ty,{button:'left',buttons:0,clickCount:1});await evaluate('new Promise(requestAnimationFrame)');
  }
  await navigate(base+'/presentation-demo/#edge/zoom');
  const original=await values('primary');assert(original.length>=9);assert.deepEqual(await values('other'),[]);
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".article-index-label")].map(node=>node.textContent)'),['主要涉及設施暨條文','其他條文']);
  const before=await snapshot();await drag(original.at(-1),'other');assert.equal(await snapshot(),before);
  await click('.edit-toggle');const camera=await evaluate('window.generalRoadViewport.get(document.querySelector("#main-map")).read()');
  await drag(original.at(-1),'other');assert.deepEqual(await values('other'),[original.at(-1)]);assert.deepEqual(await values('primary'),original.slice(0,-1));
  assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'edge');assert.deepEqual(await evaluate('window.generalRoadViewport.get(document.querySelector("#main-map")).read()'),camera);
  await click('[data-vl-action="undo"]');assert.deepEqual(await values('other'),[]);await click('[data-vl-action="redo"]');assert.deepEqual(await values('other'),[original.at(-1)]);
  await drag(original.at(-2),'other',original.at(-1));assert.deepEqual(await values('other'),original.slice(-2));
  await drag(original.at(-1),'other',original.at(-2));assert.deepEqual(await values('other'),[original.at(-1),original.at(-2)]);
  await evaluate(`document.querySelector('[data-order-id="${original.at(-1)}"]').focus()`);
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',modifiers:1});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp',modifiers:1});
  assert.deepEqual(await values('other'),[original.at(-2)]);
  const savedPrimary=await values('primary'),savedOther=await values('other');fs.writeFileSync(previewConfigPath,await snapshot());
  await navigate(base+'/presentation-demo/#edge/zoom');assert.deepEqual(await values('primary'),savedPrimary);assert.deepEqual(await values('other'),savedOther);
  assert.deepEqual(await evaluate('window.generalRoadPresentation.pages.filter(page=>page.scenario==="g1-01"&&page.article).map(page=>page.id)'),savedPrimary.concat(savedOther));
  await view('g102-overview');assert.deepEqual(await values('other'),[]);await view('edge',1);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await click('.edit-toggle');
  await drag(savedOther[0],'primary',savedPrimary[0]);assert.deepEqual(await values('other'),[]);assert.equal((await values('primary'))[0],savedOther[0]);
  assert(await evaluate('document.querySelector("main").scrollWidth<=innerWidth+1'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'article-groups.png'),Buffer.from(shot.data,'base64'));
  pass('article categories support real cross-category dragging, empty groups, ordering, keyboard moves, undo/redo, reload, independent scenarios and narrow screens');
  fs.writeFileSync(previewConfigPath,baseline);
};
