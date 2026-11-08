'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,navigate,view,click,cdp,base,artifacts,pass,previewConfigPath})=>{
 const run=fn=>evaluate('('+fn.toString()+')()');
 const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const edit=value=>evaluate('generalRoadEditor.setEditing('+value+')');
 const change=async(selector,value)=>evaluate('(()=>{const input=document.querySelector('+JSON.stringify(selector)+');input.value='+JSON.stringify(String(value))+';input.dispatchEvent(new Event("change",{bubbles:true}));})()');
 const shot=async name=>{const s=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(s.data,'base64'));};
 await navigate(base+'/presentation-demo/#contents');
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:1536,height:864,screenWidth:1536,screenHeight:864,deviceScaleFactor:1,mobile:false});
 for(const [width,height]of [[1536,864],[1024,768],[390,844]]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1,mobile:width<621});await view('contents');
  const rows=await run(()=>{const p=document.querySelector('.contents-slide .section-heading>p');return {lines:[...p.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>{const range=document.createRange();range.selectNode(n);return range.getClientRects().length}),overflow:document.documentElement.scrollWidth>innerWidth+1};});
  assert(rows.lines.every(n=>n===1),JSON.stringify(rows));assert(!rows.overflow);
 }
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:1536,height:864,screenWidth:1536,screenHeight:864,deviceScaleFactor:1,mobile:false});
 await view('g1-scenarios');await edit(true);await click('[data-scenario-card-layout="horizontal"]');await click('[data-scenario-card-default]');
 for(const id of ['g2','g3','g4']){await view(id);assert.equal(await run(()=>document.querySelector('.slide').dataset.scenarioCardLayout),'horizontal');}
 fs.writeFileSync(previewConfigPath,await run(()=>visualLayoutEditor.store.serialize()));
 await navigate(base+'/presentation-demo/#g1-scenarios');assert.equal(await run(()=>document.querySelector('.slide').dataset.scenarioCardLayout),'horizontal');
 assert(await run(()=>document.querySelector('[data-scenario-card-default-label]').textContent.includes('圖左文右')));
 pass('category descriptions retain two authored lines; a global chapter-card default survives project reload');
 await view('g2');await edit(true);await click('[data-scenario-card-layout="vertical"]');await click('[data-scenario-card-chapter-default]');
 await view('g3');assert.equal(await run(()=>document.querySelector('.slide').dataset.scenarioCardLayout),'horizontal','A chapter default must not change another chapter');
 fs.writeFileSync(previewConfigPath,await run(()=>visualLayoutEditor.store.serialize()));await navigate(base+'/presentation-demo/#g2');
 assert.equal(await run(()=>document.querySelector('.slide').dataset.scenarioCardLayout),'vertical');assert(await run(()=>document.querySelector('[data-scenario-card-default-label]').textContent.includes('本章節')));
 await edit(true);await click('[data-scenario-card-use-global]');assert.equal(await run(()=>document.querySelector('.slide').dataset.scenarioCardLayout),'horizontal');await edit(false);
 pass('a chapter-specific default overrides the global default, survives reload and can return to the global default');
 await view('g103-overview');
 const assertPairs=async()=>{
  const pairs=await run(()=>[...document.querySelectorAll('.comparison-control-pair')].map(p=>({class:p.className,labels:[...p.children].map(n=>n.dataset.comparisonSide||n.textContent.trim()),positions:[...p.children].filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right};}),edge:p.closest('figure').getBoundingClientRect().right})));
  for(const pair of pairs){assert.deepEqual(pair.labels,pair.class.includes('original')?['現況原圖 ↗','改善原圖 ↗']:['before','after']);if(pair.positions.length===2){assert(pair.positions[0].left<pair.positions[1].left);assert(Math.abs(pair.positions[0].top-pair.positions[1].top)<2);assert(pair.positions[1].right<=pair.edge+1,'Control pairs must stay inside the toolbar');}}
 };
 await assertPairs();assert.deepEqual(await run(()=>[...document.querySelectorAll('.compare-range-label>span')].map(n=>n.textContent)),['現況','改善']);assert.equal(await run(()=>getComputedStyle(document.querySelector('.compare-range')).direction),'rtl');
 const initialSignature=await run(()=>VisualLayoutCore.signature(visualLayoutEditor.store.config));
 await click('.viewport-display-options[data-comparison-side="after"] [data-viewport-action="width"]');
 assert.equal(await run(()=>VisualLayoutCore.signature(visualLayoutEditor.store.config)),initialSignature,'Presentation display changes must not save an initial camera');
 await click('.viewport-display-options[data-comparison-side="after"] [data-viewport-action="initial"]');
 assert.equal(await run(()=>document.querySelectorAll('.iv-panel:not([hidden])').length),0);
 assert(await run(()=>[...document.querySelectorAll('.viewport-display-options')].every(n=>n.closest('.map-toolbar')&&n.getBoundingClientRect().bottom<=document.querySelector('.compare-stage').getBoundingClientRect().top+1)));
 await shot('presentation-toolbar');
 await edit(true);await settle();
 await assertPairs();
 assert(await run(()=>document.querySelector('[data-compare-direct]').checked));
 const key=await run(()=>document.querySelector('.compare-stage').dataset.comparisonKey);
 const transform=side=>evaluate('generalRoadEditor.getComparisonTransform('+JSON.stringify(key)+','+JSON.stringify(side)+')');
 const selectSide=side=>change('[data-compare-edit-side]',side);
 const point=await run(()=>{const r=document.querySelector('.compare-stage').getBoundingClientRect();return {x:r.left+r.width*.55,y:r.top+r.height*.55};});
 await selectSide('before');const beforeStart=await transform('before'),afterStart=await transform('after');
 await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
 for(let i=1;i<=4;i++)await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+60*i/4,y:point.y+24*i/4,button:'left',buttons:1});
 await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+60,y:point.y+24,button:'left',buttons:0,clickCount:1});
 const alignedBefore=await transform('before');assert.notDeepEqual(alignedBefore,beforeStart,'Dragging must move the selected before image');assert.deepEqual(await transform('after'),afterStart);
 await selectSide('after');await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaY:-120,deltaX:0});await settle();
 const alignedAfter=await transform('after');assert.notDeepEqual(alignedAfter,afterStart,'Wheel zoom must affect only the selected after image');assert.deepEqual(await transform('before'),alignedBefore);
 await run(()=>{const outer=document.querySelector('.compare-after'),c=generalRoadViewport.get(outer),v=c.read();window.__beforeCamera=document.querySelector('.compare-before').getAttribute('viewBox');c.write([v[0]+10,v[1],v[2],v[3]]);});
 assert(await run(()=>document.querySelector('.compare-before').getAttribute('viewBox')===window.__beforeCamera),'Editing must not synchronize the outer cameras');
 await click('.viewport-display-options[data-comparison-side="after"] [data-viewport-action="initial"]');assert(await run(()=>generalRoadEditor.editing));
 await click('.iv-panel:not([hidden]) [data-iv-action="capture"]');assert(await run(()=>document.querySelector('.iv-panel:not([hidden]) .iv-status').textContent.includes('設定成功')));
 await change('.iv-panel:not([hidden]) [data-iv-field="zoom"]','20001');assert(await run(()=>document.querySelector('.iv-panel:not([hidden]) .iv-status').dataset.error==='true'));
 await change('.iv-panel:not([hidden]) [data-iv-field="zoom"]','100');assert(await run(()=>document.querySelector('.iv-panel:not([hidden]) .iv-status').dataset.error==='false'));
 await click('.iv-panel:not([hidden]) [data-iv-action="close"]');await shot('independent-image-editor');
 await edit(false);await settle();assert.deepEqual(await transform('before'),alignedBefore);assert.deepEqual(await transform('after'),alignedAfter);
 await run(()=>{const c=generalRoadViewport.get(document.querySelector('.compare-after')),v=c.read();c.write([v[0]+12,v[1]+5,v[2],v[3]]);});
 assert(await run(()=>document.querySelector('.compare-before').getAttribute('viewBox')===document.querySelector('.compare-after').getAttribute('viewBox')),'Presentation mode synchronizes camera movement');
 fs.writeFileSync(previewConfigPath,await run(()=>visualLayoutEditor.store.serialize()));await navigate(base+'/presentation-demo/#g103-overview');
 assert.deepEqual(await transform('before'),alignedBefore);assert.deepEqual(await transform('after'),alignedAfter);
 pass('display menus use the toolbar; initial settings require edit mode and report success/failure; real drag and wheel events independently adjust before/after images and persist, while presentation cameras remain linked');
 await view('g201-overview');await settle();
 const refs=await run(()=>[...document.querySelectorAll('.strategy-row.strategy-wrap .strategy-refs')].map(n=>({align:getComputedStyle(n).textAlign,right:n.getBoundingClientRect().right,rowRight:n.closest('.strategy-row').getBoundingClientRect().right})));
 assert(refs.length>0);for(const ref of refs){assert.equal(ref.align,'right');assert(Math.abs(ref.right-ref.rowRight)<2);}
 await shot('right-aligned-references');
 for(const [width,height]of [[1024,768],[390,844]]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1,mobile:width<621});await view('g103-overview');await assertPairs();await edit(true);await settle();await assertPairs();await edit(false);
 }
 pass('wrapped long references align to the right without compressing their titles');
};
