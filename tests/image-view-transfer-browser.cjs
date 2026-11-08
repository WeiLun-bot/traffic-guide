'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,navigate,view,click,wait,mouse,dragFrom,cdp,base,artifacts,pass})=>{
  const run=fn=>evaluate('('+fn.toString()+')()'),panel='.iv-panel:not([hidden])';
  const near=(a,b)=>a.forEach((n,i)=>assert(Math.abs(n-b[i])<1e-6,JSON.stringify({a,b})));
  const delay=ms=>evaluate('new Promise(resolve=>setTimeout(resolve,'+ms+'))');
  const camera=()=>run(()=>generalRoadViewport.get(document.getElementById('main-map')).read());
  const matrix=()=>run(()=>{const m=document.querySelector('#main-map image').getScreenCTM();return [m.a,m.b,m.c,m.d,m.e,m.f];});
  const change=(selector,value)=>evaluate('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');n.value='+JSON.stringify(String(value))+';n.dispatchEvent(new Event("change",{bubbles:true}));})()');
  const action=name=>click(panel+' [data-iv-action="'+name+'"]');
  const shot=async name=>{const s=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(s.data,'base64'));};
  await navigate(base+'/presentation-demo/#g106-comparison');await run(()=>generalRoadEditor.setEditing(true));
  for(const [width,height]of [[1536,864],[1024,768],[390,844]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1,mobile:width<621});
    for(const id of ['g106-comparison','g302-comparison','g304-comparison']){
      await view(id);
      for(const side of [1,2]){
        const menu='.scenario-compare-card:nth-child('+side+') .viewport-display-options';await click(menu+'>summary');await delay(40);
        assert(await evaluate('document.querySelector('+JSON.stringify(menu+'>div')+').matches(":popover-open")'));
        if(width===1536&&id==='g106-comparison'&&side===1){
          await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
          assert.equal(await evaluate('document.querySelector('+JSON.stringify(menu)+').open'),false);assert(await run(()=>generalRoadEditor.editing),'Escape closes only the menu');await click(menu+'>summary');await delay(40);
        }
        const item=await evaluate('(()=>{const m=document.querySelector('+JSON.stringify(menu+'>div')+'),b=m.querySelector("[data-viewport-action=initial]");b.scrollIntoView({block:"nearest"});const r=m.getBoundingClientRect(),a=b.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,x:a.left+a.width/2,y:a.top+a.height/2,hit:b.contains(document.elementFromPoint(a.left+a.width/2,a.top+a.height/2))};})()');
        assert(item.left>=0&&item.top>=0&&item.right<=width+1&&item.bottom<=height+1,JSON.stringify({id,width,item}));assert(item.hit,'The last menu action must be clickable outside the image frame');
        if(width===1024&&id==='g106-comparison'&&side===1)await shot('comparison-menu');
        await mouse('mousePressed',item.x,item.y,{button:'left',buttons:1,clickCount:1});await mouse('mouseReleased',item.x,item.y,{button:'left',buttons:0,clickCount:1});await delay(40);
        assert(await run(()=>Boolean(document.querySelector('.iv-panel:not([hidden])'))));await action('close');
      }
    }
  }
  pass('All six comparison menus remain fully accessible on desktop, tablet and phone, including the last action');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1536,height:1000,screenWidth:1536,screenHeight:1000,deviceScaleFactor:1,mobile:false});
  await run(()=>{visualLayoutEditor.transact(config=>{delete config.imageViews[VisualLayoutCore.imageView('edge-zoom','overall').id];},false);});
  await view('edge',1);await delay(750);await click('.iv-trigger');
  const oldCrop=await run(()=>[...generalRoadPresentation.page.article.crop]);
  await change(panel+' [data-iv-field="rotation"]',37);
  const point=await run(()=>{const r=document.getElementById('main-map').getBoundingClientRect();return {x:r.left+r.width*.4,y:r.top+r.height*.5};});
  await mouse('mouseWheel',point.x,point.y,{deltaY:-80,deltaX:0});await dragFrom(point.x,point.y,31,-19);
  const before=await camera(),beforeMatrix=await matrix();await action('capture');near(await camera(),before);near(await matrix(),beforeMatrix);await delay(800);near(await camera(),before);near(await matrix(),beforeMatrix);
  assert.deepEqual(await run(()=>generalRoadPresentation.page.article.crop),oldCrop,'Capturing an initial view must not change the highlight crop');
  await click(panel+' .view-parameter-tools>summary');await action('copy');const text=await evaluate('document.querySelector('+JSON.stringify(panel+' [data-iv-parameters]')+').value');assert.equal(JSON.parse(text).kind,'traffic-camera');
  await action('close');await view('crosswalk',1);await delay(750);await click('.iv-trigger');await click(panel+' .view-parameter-tools>summary');await change(panel+' [data-iv-parameters]',text);await action('paste');near(await camera(),before);await delay(750);near(await camera(),before);
  await action('use-crop');await delay(750);await click('.iv-trigger');await click(panel+' .view-parameter-tools>summary');await change(panel+' [data-iv-source]','edge');await action('inherit');near(await camera(),before);
  await change(panel+' [data-iv-parameters]','{"kind":"traffic-camera","version":1,"view":{"zoom":-4}}');const valid=await camera();await action('paste');near(await camera(),valid);assert(await evaluate('document.querySelector('+JSON.stringify(panel+' .iv-status')+').dataset.error==="true"'));await action('close');
  pass('Article capture preserves the exact drawing matrix immediately and after animations; copy, paste and inheritance preserve it without changing crop bounds');
  await view('edge',1);await click('.editor-highlight');await delay(750);
  const initial=await run(()=>JSON.stringify(visualLayoutEditor.store.config.imageViews));
  near(await camera(),await run(()=>[...generalRoadPresentation.fullView]));
  await change('[data-frame-target]','crop');await click('.editor-highlight-controls .view-parameter-tools>summary');
  const fullCrop=await run(()=>{const f=generalRoadPresentation.editorFrames()[0];return VisualLayoutCore.focusParameters([0,0,f.width,f.height],f.width,f.height,'crop');});
  await change('[data-focus-parameters]',fullCrop);await click('[data-focus-action="paste"]');
  assert.equal(await run(()=>JSON.stringify(visualLayoutEditor.store.config.imageViews)),initial);
  await click('.editor-highlight-controls .view-parameter-tools>summary');await click('[data-focus-action="copy"]');const focus=await run(()=>document.querySelector('[data-focus-parameters]').value);
  await click('.editor-highlight');await view('crosswalk',1);await click('.editor-highlight');await delay(750);await change('[data-frame-target]','crop');await click('.editor-highlight-controls .view-parameter-tools>summary');await change('[data-focus-parameters]',focus);await click('[data-focus-action="paste"]');
  near(await run(()=>generalRoadPresentation.editorFrames()[0].getCrop()),await run(()=>[...generalRoadPresentation.fullView]));
  await click('.editor-highlight-controls .view-parameter-tools>summary');await change('[data-focus-source]','edge');await click('[data-focus-action="inherit"]');
  assert.equal(await run(()=>JSON.stringify(visualLayoutEditor.store.config.imageViews)),initial);
  await click('.editor-highlight');await click('.iv-trigger');await action('use-crop');await delay(750);near(await camera(),await run(()=>[...generalRoadPresentation.fullView]));
  pass('Highlight editing uses the full coordinate system; crop parameters copy/paste and inherit independently; opting back into crop removes only the explanation camera');
  const reviews=await run(()=>generalRoadPresentation.pages.filter(p=>p.deckId==='general'&&p.kind==='review').map(p=>p.id));assert.equal(reviews.length,18);
  for(const id of reviews){await view(id);assert(await run(()=>{const rows=[...document.querySelectorAll('.review-row')];return rows.length>1&&rows.every(row=>row.querySelectorAll('.review-order-tools button').length===2)&&rows[0].querySelector('[data-review-move="-1"]').disabled&&rows.at(-1).querySelector('[data-review-move="1"]').disabled;}),id);}
  await view('g304-review');
  const original=await run(()=>[...document.querySelectorAll('.review-row')].map(row=>({id:row.dataset.reviewRow,title:row.querySelector('h2').textContent,text:row.querySelector('p').textContent,key:row.querySelector('h2').dataset.editKey})));
  await run(()=>{const h=document.querySelector('.review-row h2');h.textContent='排序後仍保留的標題';h.dispatchEvent(new Event('input',{bubbles:true}));});
  await click('[data-review-row="row-0"] [aria-label="下移這個小結列點"]');
  assert.deepEqual(await run(()=>[...document.querySelectorAll('.review-row')].map(row=>row.dataset.reviewRow)),['row-1','row-0','row-2']);
  assert.equal(await run(()=>document.querySelector('[data-review-row="row-0"] h2').textContent),'排序後仍保留的標題');assert.equal(await run(()=>document.querySelector('[data-review-row="row-0"] p').textContent),original[0].text);
  await click('[data-vl-action="undo"]');assert.deepEqual(await run(()=>[...document.querySelectorAll('.review-row')].map(row=>row.dataset.reviewRow)),['row-0','row-1','row-2']);await click('[data-vl-action="redo"]');
  await shot('review-order');
  await run(async()=>{const dir=await navigator.storage.getDirectory(),handle=await dir.getFileHandle('camera-transfer-test.json',{create:true}),writer=await handle.createWritable();await writer.write(visualLayoutEditor.store.serialize());await writer.close();visualLayoutEditor.files.env={isSecureContext:true,indexedDB,showOpenFilePicker:async()=>[handle],showSaveFilePicker:async()=>handle};});
  await click('[data-vl-action="open"]');await wait('!visualLayoutEditor.busy');await click('[data-vl-action="save"]');await wait('!visualLayoutEditor.busy');
  await navigate(base+'/presentation-demo/#g304-review');assert.deepEqual(await run(()=>[...document.querySelectorAll('.review-row')].map(row=>row.dataset.reviewRow)),['row-1','row-0','row-2']);assert.equal(await run(()=>document.querySelector('[data-review-row="row-0"] h2').textContent),'排序後仍保留的標題');
  await view('edge',1);await delay(800);near(await camera(),before);
  pass('Summary up/down ordering preserves text identity, supports undo/redo, and restores with exact cameras after native saving and reload');
};
