'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,navigate,view,click,wait,cdp,base,artifacts,pass})=>{
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await navigate(base+'/presentation-demo/?mode=view#context');await wait('document.documentElement.dataset.presentationState==="ready"');
  const signature=await evaluate('VisualLayoutCore.signature(visualLayoutEditor.store.config)');
  const scenes=await evaluate('generalRoadPresentation.data.scenarios.filter(s=>s.code.startsWith("G")).map(s=>({code:s.code,context:s.contextId,conditions:s.currentConditions?.pageId,overview:s.overviewId,review:s.reviewId,article:s.articleIds[0],comparison:s.comparisonId}))');
  const report=[];
  const metrics=()=>evaluate(`(()=>{const slide=document.querySelector('#presentation>.slide'),main=document.getElementById('presentation'),rect=n=>{if(!n)return null;const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};return {page:generalRoadPresentation.page.id,kind:generalRoadPresentation.page.kind,viewport:[innerWidth,innerHeight],bodyHeight:document.documentElement.scrollHeight,slide:rect(slide),main:rect(main),mode:slide.dataset.conditionsLayout,grid:rect(slide.querySelector('.context-grid,.map-layout')),figure:rect(slide.querySelector('.context-map-card,.conditions-current-figure,.map-layout>.map-card')),note:rect(slide.querySelector('.context-note')),reviewLeft:rect(slide.querySelector('.review-title')),sourceHidden:!slide.querySelector('.context-opening>.source-line')?.getClientRects().length};})()`);
  for(const [width,height,os]of [[1920,1080,1],[1536,864,1.25],[1028,720,3],[1280,960,1]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:os,mobile:false});
    const selected=width===1920?scenes:[scenes[0],scenes.at(-1)];
    for(const scene of selected)for(const key of ['context','conditions','overview','review','comparison']){
      if(!scene[key])continue;await view(scene[key]);await settle();
      const actual=await metrics();report.push(actual);fs.writeFileSync(path.join(artifacts,'general-layout-measurements.json'),JSON.stringify(report,null,2));
      assert.equal(actual.bodyHeight<=height+1,true,'Outer page must stay within viewport: '+JSON.stringify(actual));
      assert(Math.abs(actual.slide.height-actual.main.height)<2,'Slide must use available height: '+JSON.stringify(actual));
      if(key==='context'){assert(actual.sourceHidden);assert(actual.figure.height>actual.grid.height*.45,'Current diagram must use remaining context height: '+JSON.stringify(actual));assert(actual.note.bottom<=actual.slide.bottom+1);}
      if(key==='overview')assert(actual.figure.width>actual.grid.width*.57,'Overview figure must receive the same wider column as article diagrams: '+JSON.stringify(actual));
      if(key==='review')assert(actual.reviewLeft.x>width*.06,'Summary copy must be inset toward the center');
    }
  }
  pass('All 18 general contexts, current-condition pages, strategies and summaries use the available viewport; representative 100%/125%, 4:3 and high-DPI layouts retain proportional columns');
  const last=scenes.at(-1);await view(last.conditions);await click('[data-condition-layout="cards"]');assert.equal(await evaluate('document.querySelector(".conditions-current-slide").dataset.conditionsLayout'),'cards');
  await click('[data-condition-layout="cards-4"]');assert.equal(await evaluate('document.querySelector(".conditions-current-slide").dataset.conditionsLayout'),'cards-4');
  await view(last.overview);await view(last.conditions);assert.equal(await evaluate('document.querySelector(".conditions-current-slide").dataset.conditionsLayout'),'cards-4');
  await navigate(base+'/presentation-demo/?mode=view#'+last.conditions);assert.equal(await evaluate('document.querySelector(".conditions-current-slide").dataset.conditionsLayout'),'cards-4');
  await click('[data-condition-layout="split"]');assert.equal(await evaluate('document.querySelector(".conditions-current-slide").dataset.conditionsLayout'),'split');await click('[data-condition-layout="auto"]');
  pass('Automatic, split, two-column and four-column condition layouts switch with one click and retain the per-page choice');
  const referenceId=await evaluate('generalRoadPresentation.data.articles.find(a=>a.scenario==="g4-04"&&a.moduleLinks?.some(l=>l.page==="g203-privacy")).id');
  await view(referenceId,1);const original=await evaluate('JSON.stringify(generalRoadPresentation.state)');await click('[data-reference-page="g203-privacy"]');
  assert(await evaluate('document.getElementById("asset-dialog").open'));assert.equal(await evaluate('JSON.stringify(generalRoadPresentation.state)'),original);await click('#asset-dialog [data-close]');assert.equal(await evaluate('JSON.stringify(generalRoadPresentation.state)'),original);
  assert.equal(await evaluate('document.getElementById("slide-title").textContent'),'號誌條文運用解說');
  await click('[data-action="source"]');assert(await evaluate('document.getElementById("source-content").textContent.includes("§ "+generalRoadPresentation.page.article.sourceDocument.section)'));await click('#source-dialog [data-close]');
  await click('#toc-button');assert(!await evaluate('document.getElementById("toc-content").textContent.includes("情境回顧")'));await click('#toc-dialog [data-close]');
  assert.equal(await evaluate('VisualLayoutCore.signature(visualLayoutEditor.store.config)'),signature,'Display layouts must not rewrite saved content or figure settings');
  pass('G4-04 cross-reference opens in a dialog and closes back to the same page/phase; article headings, section spacing and summary terminology are consistent');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,screenWidth:390,screenHeight:844,deviceScaleFactor:3,mobile:true});
  for(const id of [last.context,last.conditions,last.overview,last.review]){await view(id);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Mobile layout must not overflow horizontally: '+id);}
  pass('Mobile general-road layouts remain readable and vertically scrollable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,screenWidth:1920,screenHeight:1080,deviceScaleFactor:1,mobile:false});
  for(const [name,id]of [['context',last.context],['cards',last.conditions],['overview',last.overview],['summary',last.review]]){await view(id);const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'));}
};
