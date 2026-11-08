'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,view,click,navigate,wait,cdp,base,artifacts,pass})=>{
 const metrics=async(width,height,dpr=1)=>cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:dpr,mobile:false});
 const escape=()=>cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 const unload=()=>evaluate(`(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented})()`);
 await metrics(1536,864,1.25);
 await navigate(base+'/presentation-demo/?mode=view#g401-checklist');
 const pages=await evaluate('generalRoadPresentation.pages.filter(p=>p.deckId==="general"&&p.article).map(p=>p.id)');
 let links=0,points=0;
 for(const id of pages){
  await view(id,1);
  const m=await evaluate(`(()=>{const root=document.getElementById('presentation'),font=n=>parseFloat(getComputedStyle(n).fontSize),probe=document.createElement('div');probe.className='explain-footer';probe.innerHTML='<button class="text-button">reference style</button>';root.append(probe);const base=font(probe.firstElementChild);probe.remove();return {base,links:[...root.querySelectorAll('.scenario-related-links button,.scenario-module-link')].map(n=>({label:n.textContent,font:font(n)})),points:[...root.querySelectorAll('.explain-points>li:not([data-user-block])')].map(n=>{const s=getComputedStyle(n,'::before');return {content:s.content,font:parseFloat(s.fontSize),body:font(n.querySelector('span'))}})}})()`);
  for(const link of m.links){assert(Math.abs(link.font-m.base)<.05,id+' link size: '+JSON.stringify(link));links++;}
  for(const point of m.points){assert(!point.content.includes('leading-zero'),id+' must use natural numbering');assert(point.font>=15.99,id+' point numbers must be readable');points++;}
 }
 assert(links>10&&points>50);pass('All general-road article reference buttons share the supplementary/source link size, and explanation numbers are enlarged without leading zeros');
 for(const id of ['g401-checklist','g402-checklist','g403-checklist','g404-checklist']){
  await view(id,1);
  assert(await evaluate(`(()=>{const b=document.querySelector('[data-table-preview]');return Boolean(b.closest('caption'))&&document.querySelectorAll('[data-table-preview]').length===1&&b.textContent==='表：各方向號誌檢核 ↗'&&document.querySelector('.scenario-article-table thead th').textContent==='檢核項目'})()`));
  await click('[data-table-preview]');assert(await evaluate('document.getElementById("source-dialog").open'));await click('#source-dialog [data-close]');
 }
 pass('Direction checklist popups are linked from the existing table caption without another row');
 const reviews=await evaluate('generalRoadPresentation.pages.filter(p=>p.deckId==="general"&&p.kind==="review").map(p=>p.id)');
 for(const id of reviews){await view(id);assert.equal(await evaluate('document.getElementById("slide-title").textContent'),'情境小結');assert(await evaluate('!document.querySelector(".review-rows").textContent.includes("§")&&!document.querySelector(".review-rows small")'));}
 pass('All 18 summary pages use 情境小結 and omit article references from their right column');
 const report=[];
 for(const [w,h,dpr]of [[1920,1080,1],[1536,864,1.25],[1463,914,1.75],[1280,720,1],[1024,768,1]]){
  await metrics(w,h,dpr);
  for(const id of ['g1-scenarios','g2','g3','g4']){
   await view(id);
   const m=await evaluate(`(()=>{const main=document.querySelector('main'),cards=[...main.querySelectorAll('.scenario-card')];return {overflow:main.scrollHeight-main.clientHeight,cards:cards.map(n=>{const image=n.querySelector('.scenario-card-visual'),copy=n.querySelector('.scenario-card-copy'),r=image.getBoundingClientRect(),c=n.getBoundingClientRect(),s=getComputedStyle(copy.querySelector('p'));return {image:r.height,card:c.height,copy:copy.getBoundingClientRect().height,heading:parseFloat(getComputedStyle(copy.querySelector('h2')).fontSize),body:parseFloat(s.fontSize),weight:s.fontWeight,wrap:s.whiteSpace,bottom:n.querySelector('.scenario-card-footer').getBoundingClientRect().bottom<=c.bottom+1}})}})()`);
   report.push({w,h,id,...m});assert(m.cards.length>=4);
   for(const card of m.cards){assert(card.image>45,'Image must fill the free card height: '+JSON.stringify({w,h,id,card}));assert(card.wrap==='normal');assert(card.bottom,'Card text must stay inside the card');}
  }
 }
 fs.writeFileSync(path.join(artifacts,'directory-layouts.json'),JSON.stringify(report,null,2));
 await metrics(1920,1080);await view('g4');const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'g4-directory.png'),Buffer.from(shot.data,'base64'));
 pass('All four chapter directories give remaining card height to images and use current-condition text sizes across desktop aspect ratios');
 await navigate(base+'/presentation-demo/#g401-checklist');assert(await evaluate('Boolean(visualLayoutEditor.files.local)'));await click('.edit-toggle');
 await evaluate(`(()=>{const n=document.querySelector('#slide-title');n.textContent='儲存狀態回歸測試';n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 assert(await unload(),'Unsaved edits must warn');
 await click('[data-vl-action="save"]');await wait('!visualLayoutEditor.busy');assert(!await unload(),'A successful save must not warn');
 await evaluate('generalRoadEditor.state.updatedAt+=1');assert(!await unload(),'Passive runtime state must not become an edit when checking unload');
 await escape();assert(!await evaluate('generalRoadEditor.editing||visualLayoutEditor.editing'));assert(!await unload());
 for(const id of ['g4','g404-review','edge','g401-checklist']){await view(id);assert(!await unload(),'Viewing another page must not require saving');}
 await click('.edit-toggle');await click('[data-vl-action="mode"]');assert(await evaluate('visualLayoutEditor.editing'));await escape();assert(!await evaluate('generalRoadEditor.editing||visualLayoutEditor.editing'));assert(!await unload(),'Changing edit modes without modifying content must stay clean');
 pass('Saved sessions close cleanly, navigation stays clean, and Esc leaves both content editing and advanced layout editing');
 await click('.edit-toggle');await click('[data-table-preview]');await escape();await wait('!document.getElementById("source-dialog").open');assert(await evaluate('generalRoadEditor.editing'),'First Escape closes the active dialog before leaving editing');
 await evaluate(`(()=>{const n=document.querySelector('#slide-title');n.focus();n.textContent='未儲存的內容';n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await escape();assert(!await evaluate('generalRoadEditor.editing'));assert.equal(await evaluate('document.getElementById("slide-title").textContent'),'未儲存的內容');assert(await unload(),'Escape retains unsaved changes and their warning');
 await evaluate(`window.__normalSave=visualLayoutEditor.files.save;visualLayoutEditor.files.save=async()=>{throw new Error('模擬寫入失敗')}`);
 await evaluate('visualLayoutEditor.save()');assert(await unload(),'A failed save must keep warning');
 await evaluate('visualLayoutEditor.files.save=window.__normalSave;visualLayoutEditor.save()');await wait('!visualLayoutEditor.busy');assert(!await unload());
 pass('Esc preserves unsaved text, dialogs get first priority, and failed saves continue warning until a successful save');
};
