'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const outline=require('../data/results/outline.json');
module.exports=async function({evaluate,view,navigate,click,cdp,base,artifacts,pass,previewConfigPath,editText}){
 const baseline=fs.readFileSync(previewConfigPath,'utf8'),run=fn=>evaluate('('+fn.toString()+')()'),pages=outline.pages.filter(p=>p.chapter==='results-modular'),lessons=pages.slice(0,-1);
 try{
  await navigate(base+'/presentation-demo/#chapter-cover-results-modular');assert.equal(await run(()=>document.getElementById('slide-title').textContent),'模組化架構與使用方式');
  for(const p of pages){await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),p.id);}await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'chapter-cover-results-principles');
  for(const p of [...pages].reverse()){await click('#previous');assert.equal(await run(()=>window.generalRoadPresentation.page.id),p.id);}
  for(const [old,id]of [['results-modular-rationale','results-module-definition'],['results-phase-three','results-module-hierarchy'],['results-modular','results-module-definition']]){await navigate(base+'/presentation-demo/#'+old);assert.equal(await run(()=>window.generalRoadPresentation.page.id),id);}
  for(const [width,height]of [[1600,1000],[1280,800],[1920,1200],[390,844]]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   for(const p of lessons){await navigate(base+'/presentation-demo/#'+p.id);await view(p.id);
    const a=await run(()=>({title:document.getElementById('slide-title').textContent,intro:document.querySelector('.results-heading>p')?.textContent,items:[...document.querySelectorAll('.results-cards>article')].map(n=>({title:n.querySelector('h2').textContent,text:n.querySelector('p').textContent,includes:n.querySelector('.results-card-includes')?.textContent})),callouts:[...document.querySelectorAll('.results-callouts aside')].map(n=>({title:n.querySelector('h3').textContent,text:n.querySelector('p').innerText})),takeaway:document.querySelector('.results-takeaway')?.textContent,x:document.documentElement.scrollWidth-innerWidth,y:document.getElementById('presentation').scrollHeight-document.getElementById('presentation').clientHeight}));
    assert.equal(a.title,p.title);assert.equal(a.intro,p.intro);assert.equal(a.takeaway,p.takeaway);assert.deepEqual(a.items,(p.items||[]).map(({title,text,includes})=>({title,text,...(includes?{includes}:{})})));assert.deepEqual(a.callouts,(p.callouts||[]).map(({title,text})=>({title,text})));assert(a.x<=1);if(width>900)assert(a.y<=2);
    if(width===1600||width===390){const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,p.id+'-'+width+'.png'),Buffer.from(shot.data,'base64'));}
   }
  }
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  for(const [index,selector]of [[0,'.results-callouts aside p'],[1,'.results-card-includes'],[2,'.results-architecture-table thead p'],[3,'.results-cards article p'],[4,'.results-callouts aside p']]){
   const p=lessons[index];await navigate(base+'/presentation-demo/#'+p.id);await view(p.id);await click('.edit-toggle');const original=await evaluate('document.querySelector('+JSON.stringify(selector)+').innerText');await editText(selector,'測試架構與使用方式文字');await click('[data-vl-action="undo"]');assert.equal(await evaluate('document.querySelector('+JSON.stringify(selector)+').innerText'),original);await click('[data-vl-action="redo"]');fs.writeFileSync(previewConfigPath,await run(()=>window.visualLayoutEditor.store.serialize()));await navigate(base+'/presentation-demo/#'+p.id);assert.equal(await evaluate('document.querySelector('+JSON.stringify(selector)+').textContent'),'測試架構與使用方式文字');fs.writeFileSync(previewConfigPath,baseline);
  }
  pass('module architecture/usage pages retain supplied text, restored hierarchy table, examples, included modules and lookup paths; chapter/aliases/navigation, responsive layouts, text edits, undo/redo and saved reload work');
 }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
