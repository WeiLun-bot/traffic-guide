'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,navigate,view,click,cdp,base,artifacts,pass,previewConfigPath})=>{
 const run=fn=>evaluate('('+fn.toString()+')()');
 const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
 const shot=async name=>{const s=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(s.data,'base64'));};
 const align=async(grid,card,parts)=>{
  const result=await evaluate(`(()=>{const rows=[];for(const grid of document.querySelectorAll(${JSON.stringify(grid)})){const groups=[];for(const card of grid.querySelectorAll(':scope>'+${JSON.stringify(card)})){const top=card.getBoundingClientRect().top;let row=groups.find(r=>Math.abs(r.top-top)<3);if(!row)groups.push(row={top,cards:[]});row.cards.push(card);}for(const row of groups)if(row.cards.length>1)for(const selector of ${JSON.stringify(parts)}){const nodes=row.cards.map(c=>c.querySelector(selector)).filter(Boolean);if(nodes.length>1){const ys=nodes.map(n=>n.getBoundingClientRect().top);rows.push({selector,spread:Math.max(...ys)-Math.min(...ys)});}}}return rows;})()`);
  for(const row of result)assert(row.spread<2,'Card sections must align: '+JSON.stringify(row));
 };
 await navigate(base+'/presentation-demo/#contents');
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:1536,height:864,screenWidth:1536,screenHeight:864,deviceScaleFactor:1,mobile:false});
 const scenes=await run(()=>generalRoadPresentation.data.scenarios.filter(s=>s.code.startsWith('G')).map(s=>({code:s.code,context:s.contextId,conditions:s.currentConditions?.pageId,overview:s.overviewId,review:s.reviewId,comparison:s.comparisonId})));
 await view('contents');await settle();await align('.contents-grid','.chapter-card',['.card-top','.road-symbol','h2','.card-bottom']);
 assert(await run(()=>[...document.querySelectorAll('.chapter-card')].every(c=>c.querySelector('.road-symbol').getBoundingClientRect().width>c.clientWidth*.8)));
 await shot('chapter-category-cards');
 await view('general-scenarios-index');await settle();await align('.directory-card-grid','.directory-card',['.directory-card-code','h3','.directory-card-visual','.directory-card-bottom']);
 for(const id of ['g1-scenarios','g2','g3','g4']){
  await view(id);await settle();await align('.scenario-card-grid','.scenario-card',['.scenario-card-top','.scenario-card-visual','.scenario-card-copy h2','.scenario-card-copy p','.scenario-card-footer']);
  await click('[data-scenario-card-layout="horizontal"]');await settle();
  assert.equal(await run(()=>getComputedStyle(document.querySelector('.scenario-card-grid')).gridTemplateColumns.split(' ').length),2,'Horizontal cards use two columns so the text has enough width');
  const boundaries=await run(()=>[...document.querySelectorAll('.scenario-card')].map(c=>{const card=c.getBoundingClientRect(),image=c.querySelector('.scenario-card-visual').getBoundingClientRect(),copy=c.querySelector('.scenario-card-copy').getBoundingClientRect();return {width:card.width,right:image.right-card.left,left:copy.left-card.left,imageTop:image.top,copyTop:copy.top};}));
  for(const b of boundaries){assert(b.left>=b.right-1);assert(Math.abs(b.imageTop-b.copyTop)<2);assert(Math.abs(b.left-boundaries[0].left)<2);assert(Math.abs(b.right-boundaries[0].right)<2);}
  await shot('horizontal-'+id);await view('contents');await view(id);assert.equal(await run(()=>document.querySelector('.slide').dataset.scenarioCardLayout),'horizontal');
 }
 for(const scene of scenes){
  await view(scene.overview);await settle();
  assert.equal(await run(()=>document.querySelectorAll('#presentation .source-line,#presentation [data-action="source"]').length),0);
  const rows=await run(()=>[...document.querySelectorAll('.strategy-row')].map(r=>({wrap:r.classList.contains('strategy-wrap'),title:r.querySelector('.strategy-title')?.getBoundingClientRect().width,row:r.clientWidth,refs:r.querySelector('.strategy-refs')?.getBoundingClientRect().width})));
  for(const r of rows)if(r.wrap)assert(r.title>Math.min(160,r.row*.4),'Wrapped references must leave the title readable');
  if(scene.conditions){await view(scene.conditions);await click('[data-condition-layout="cards"]');await settle();await align('.conditions-issues','.condition-issue',['.condition-card-heading','.condition-photo','.condition-points']);}
 }
 await view('g201-overview');assert(await run(()=>[...document.querySelectorAll('.strategy-row')].some(r=>r.textContent.includes('逐項檢核')&&r.classList.contains('strategy-wrap'))));await shot('long-strategy-references');
 for(const id of ['review','g103-review']){await view(id);assert(!await run(()=>document.getElementById('presentation').textContent.includes('本情境涵蓋路面邊線')));assert.equal(await run(()=>document.querySelectorAll('.source-line').length),0);}
 await view('review');assert.equal(await run(()=>document.querySelector('.review-row h2').dataset.editKey),'review|0|text-3','Removing the summary note must preserve saved row text and formatting keys');
 await view('urban-merge-arrows',1);assert(!await run(()=>document.getElementById('presentation').textContent.includes('如圖2.3-2所示')));
 pass('category, directory, chapter and current-condition cards align; all four chapter card layouts switch and persist; all general overview references and source cleanup verified');
 await view('g103-overview');
 await evaluate('generalRoadEditor.setEditing(true)');
 assert(await run(()=>document.querySelector('.compare-range-label').classList.contains('comparison-ui-hidden')));
 await click('[data-comparison-ui="slider"]');assert(!await run(()=>document.querySelector('.compare-range-label').classList.contains('comparison-ui-hidden')));
 await click('[data-comparison-ui="hints"]');
 const imageId=side=>evaluate('(()=>{const n=document.querySelector('+JSON.stringify('svg[data-comparison-side="'+side+'"]')+');return VisualLayoutCore.imageView(generalRoadPresentation.page.id,n.dataset.editorImageKey).id})()');
 const afterId=await imageId('after'),beforeId=await imageId('before');
 const initialBefore=await evaluate('JSON.stringify(visualLayoutEditor.store.config.imageViews['+JSON.stringify(beforeId)+'])');
 const action=async(side,value)=>{await click('.viewport-display-options[data-comparison-side="'+side+'"] [data-viewport-action="'+value+'"]');await settle();};
 await action('after','width');assert.equal(await evaluate('visualLayoutEditor.store.config.imageViews['+JSON.stringify(afterId)+'].fit'),'width');
 assert.equal(await evaluate('JSON.stringify(visualLayoutEditor.store.config.imageViews['+JSON.stringify(beforeId)+'])'),initialBefore);
 await action('after','flip-x');assert.equal(await evaluate('visualLayoutEditor.store.config.imageViews['+JSON.stringify(afterId)+'].flipX'),true);
 await action('before','height');await action('before','flip-y');
 await action('after','reset');assert(await run(()=>{const n=document.querySelector('svg[data-comparison-side="after"]'),view=generalRoadViewport.get(n).read();return n.getAttribute('preserveAspectRatio')==='xMidYMid meet'&&view[0]===0&&view[1]===0;}));
 assert.equal(await evaluate('visualLayoutEditor.store.config.imageViews['+JSON.stringify(beforeId)+'].flipY'),true);
 await action('after','initial');assert(await run(()=>Boolean(document.querySelector('.iv-panel:not([hidden])'))));
 await click('.iv-panel:not([hidden]) [data-iv-action="capture"]');await click('.iv-panel:not([hidden]) [data-iv-action="close"]');
 await shot('independent-image-controls');
 await view('g102-comparison');assert.equal(await run(()=>document.querySelectorAll('.scenario-compare-card .viewport-display-options').length),2);
 await click('.scenario-compare-card:first-child [data-viewport-action="reset"]');await click('.scenario-compare-card:last-child [data-viewport-action="height"]');
 await click('.scenario-compare-card:last-child [data-viewport-action="flip-x"]');
 await shot('crosswalk-image-controls');
 const tables=await run(()=>generalRoadPresentation.pages.filter(p=>p.deckId==='general'&&p.article?.table).map(p=>({id:p.id,name:p.article.name})));
 assert(tables.length>0);
 for(const table of tables){await view(table.id,1);const caption=await run(()=>document.querySelector('.scenario-article-table caption')?.textContent);assert(caption?.startsWith('表：'),table.id);await click('[data-table-preview]');assert(await run(()=>document.getElementById('source-dialog').open));await click('#source-dialog [data-close]');}
 const signal=await run(()=>generalRoadPresentation.pages.find(p=>p.deckId==='general'&&p.article?.category==='號誌'));
 await view(signal.id,1);assert(await run(()=>document.querySelector('#main-map')&&document.querySelector('.viewport-display-options')));
 await click('[data-viewport-action="reset"]');await click('[data-viewport-action="height"]');await click('[data-viewport-action="rotate-right"]');await click('[data-viewport-action="flip-y"]');
 await click('[data-viewport-action="initial"]');await click('.iv-panel:not([hidden]) [data-iv-action="capture"]');await click('.iv-panel:not([hidden]) [data-iv-action="close"]');
 await view(scenes.find(s=>s.code==='G2-01').overview);
 const remote=await run(()=>generalRoadPresentation.data.articles.find(a=>a.id==='g201-left')?.mapAsset);
 assert(remote,'The G2-01 remote signal illustration must be available');
 await evaluate('generalRoadPresentation.showAsset('+JSON.stringify(remote)+')');assert(await run(()=>document.getElementById('asset-dialog').open));await click('#asset-view [data-viewport-action="reset"]');await click('#asset-view [data-viewport-action="height"]');await click('#asset-view [data-viewport-action="flip-x"]');
 await click('#asset-view [data-viewport-action="initial"]');assert(await run(()=>document.querySelector('.iv-panel:not([hidden])').closest('dialog')?.id==='asset-dialog'),'Image settings must remain interactive in the modal layer');await click('.iv-panel:not([hidden]) [data-iv-action="close"]');await click('#asset-dialog [data-close]');
 await view('g201-left',1);await click('#presentation [data-viewport-action="reset"]');
 const resetView=await run(()=>generalRoadViewport.get(document.getElementById('main-map')).read());
 await evaluate('new Promise(r=>setTimeout(r,750))');assert.deepEqual(await run(()=>generalRoadViewport.get(document.getElementById('main-map')).read()),resetView,'The previous zoom animation must not overwrite reset');
 await view(scenes[0].conditions);
 assert(await run(()=>Boolean(document.querySelector('.condition-photo-open>img'))),'Current-condition photos must support the same image controls');
 await run(()=>{const image=document.querySelector('.condition-photo-open>img');generalRoadViewport.get(image).imageAction('width');generalRoadViewport.get(image).imageAction('rotate-right');generalRoadViewport.get(image).imageAction('flip-x');});
 const photoView=await run(()=>generalRoadViewport.get(document.querySelector('.condition-photo-open>img')).read());
 await run(()=>generalRoadViewport.get(document.querySelector('.condition-photo-open>img')).imageAction('initial'));
 await click('.iv-panel:not([hidden]) [data-iv-action="capture"]');
 const capturedPhoto=await run(()=>generalRoadViewport.get(document.querySelector('.condition-photo-open>img')).read());
 photoView.forEach((v,i)=>assert(Math.abs(v-capturedPhoto[i])<.01,'Photo capture must preserve its fit and camera'));
 await click('.iv-panel:not([hidden]) [data-iv-action="close"]');
 fs.writeFileSync(previewConfigPath,await evaluate('visualLayoutEditor.store.serialize()'));
 await navigate(base+'/presentation-demo/#g103-overview');
 assert.equal(await evaluate('visualLayoutEditor.store.config.imageViews['+JSON.stringify(beforeId)+'].flipY'),true);
 assert.equal(await evaluate('visualLayoutEditor.store.config.imageViews['+JSON.stringify(afterId)+'].fit'),'all');
 assert(!await run(()=>document.querySelector('.compare-range-label').classList.contains('comparison-ui-hidden')));
 assert(await run(()=>document.querySelector('.compare-help').classList.contains('comparison-ui-hidden')));
 pass('independent before/after fit, reset and mirror settings, initial camera capture, comparison UI switches, paired images, signal illustrations, table dialogs and project reload verified');
 for(const [width,height]of [[1920,1080],[1024,768],[390,844]]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1,mobile:width<621});
  for(const id of ['contents','g1-scenarios','general-scenarios-index','g103-overview','g201-overview','g102-comparison',scenes[0].conditions]){
   await view(id);await settle();assert(await run(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow: '+width+' '+id);
  }
 }
 pass('desktop, narrow desktop and mobile layouts have no horizontal page overflow');
};
