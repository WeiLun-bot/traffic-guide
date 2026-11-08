'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,view,click,navigate,wait,cdp,base,artifacts,pass})=>{
 const metrics=(width,height,dpr=1,screenHeight=height)=>cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight,deviceScaleFactor:dpr,mobile:false});
 const font=selector=>evaluate(`(()=>{const s=getComputedStyle(document.querySelector(${JSON.stringify(selector)}));return {size:parseFloat(s.fontSize),weight:s.fontWeight,color:s.color,line:s.lineHeight}})()`);
 await metrics(1536,864,1.25);await navigate(base+'/presentation-demo/?mode=view#context');
 const signature=await evaluate('VisualLayoutCore.signature(visualLayoutEditor.store.config)');
 await view('g401-left-waiting',1);const articleHeading=await font('#explanation h2'),articleBody=await font('#explanation .explain-points>li>span');
 const scenes=await evaluate('generalRoadPresentation.data.scenarios.filter(s=>s.code.startsWith("G")).map(s=>({code:s.code,context:s.contextId,overview:s.overviewId,review:s.reviewId}))');
 for(const scene of scenes){
  await view(scene.context);const body=await font('.context-issues .issue-row p'),number=await font('.context-issues .issue-row>span');assert.equal((await font('.context-issues h2')).size,28);
  await view(scene.overview);assert.equal((await font('.strategy-title')).size,articleHeading.size,scene.code+' strategy title should match article headings');assert.deepEqual(await font('.explain-intro'),body);assert.deepEqual(await font('.strategy-number'),number);assert.equal((await font('.strategy-ref')).size,articleBody.size);
  await view(scene.review);const m=await evaluate(`(()=>{const f=s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize);return {title:f('.review #slide-title'),right:f('.review-row h2'),topic:f('.review-topic'),body:f('.review-copy'),rightBody:f('.review-row p'),buttons:[...document.querySelectorAll('.review .opening-actions button')].map(n=>parseFloat(getComputedStyle(n).fontSize))}})()`);
  assert(Math.abs(m.title-25.92*1.25)<.02,JSON.stringify({scene,m}));assert(Math.abs(m.right-24)<.02);assert(Math.abs(m.body/m.rightBody-1.25)<.002,JSON.stringify({scene,m}));assert.equal(m.topic,m.body);for(const size of m.buttons)assert(Math.abs(size-m.rightBody)<.02);
 }
 pass('All 18 improvement-goal headings use reference 28px; strategy titles and article references match the explanation heading and body sizes; summary proportions are preserved');
 const tables=await evaluate('generalRoadPresentation.pages.filter(p=>p.deckId==="general"&&p.article?.table).map(p=>({id:p.id,phase:1}))'),report=[];
 for(const [w,h,dpr,sh]of [[1920,1080,1,1080],[1536,864,1.25,864],[1463,914,1.75,914],[1028,720,3,720],[1280,960,1,960],[1536,720,1.25,864]]){
  await metrics(w,h,dpr,sh);
  for(const {id,phase}of tables){
   await view(id,phase);
   const m=await evaluate(`(()=>{const root=document.getElementById('explanation'),r=root.getBoundingClientRect(),table=root.querySelector('.scenario-article-table'),t=table.getBoundingClientRect(),out=[...root.querySelectorAll('.explain-topline,h2,.scenario-related-links button,.explain-footer button,.source-line,.scenario-checklist-open')].filter(n=>n.getClientRects().length).map(n=>{const b=n.getBoundingClientRect();return {label:n.textContent.trim(),top:b.top,bottom:b.bottom}});return {overflow:root.scrollHeight-root.clientHeight,table:t.height,tableOverflow:table.scrollHeight-table.clientHeight,top:r.top,bottom:r.bottom,items:out}})()`);
   report.push({w,h,sh,id,...m});fs.writeFileSync(path.join(artifacts,'table-heights.json'),JSON.stringify(report,null,2));
   assert(m.overflow<=2,'Only the table should scroll: '+JSON.stringify({w,h,id,...m}));for(const item of m.items)assert(item.top>=m.top-1&&item.bottom<=m.bottom+2,'Surrounding content should remain visible: '+JSON.stringify({w,h,id,item,m}));assert(m.table>20);assert(Math.abs(m.bottom-m.items.at(-1).bottom)<=3,'The table should fill the remaining height instead of leaving empty space below the source: '+JSON.stringify({w,h,id,...m}));
  }
 }
 await metrics(1920,1080);await view('g403-checklist',1);const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'g403-checklist.png'),Buffer.from(shot.data,'base64'));await click('[data-table-preview]');assert(await evaluate('document.getElementById("source-dialog").open'));await click('#source-dialog [data-close]');
 pass('Every general-road article table fills the remaining sidebar height with its own scrolling; surrounding text and links stay visible without empty space below the source across desktop sizes and a shorter window');
 assert.equal(await evaluate('VisualLayoutCore.signature(visualLayoutEditor.store.config)'),signature);
 await navigate(base+'/presentation-demo/#g401-overview');await click('.edit-toggle');const editingFont=await font('.strategy-title');assert(Math.abs(editingFont.size-30)<.05);await view('g401-review');assert(Math.abs((await font('.review-copy')).size-27)<.05);
 pass('Editing uses the same typography, and layout changes do not rewrite authored content or saved formatting');
};
