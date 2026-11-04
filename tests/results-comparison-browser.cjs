'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,wait,dragFrom,cdp,base,artifacts,pass,previewConfigPath,editText}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),run=fn=>evaluate('('+fn.toString()+')()');
  const state=()=>run(()=>({page:window.generalRoadPresentation.page.id,phase:window.generalRoadPresentation.state.phase,frames:window.generalRoadPresentation.editorFrames().map(frame=>({key:frame.key,image:frame.imageKey,box:frame.getBox(),crop:frame.getCrop(),rotation:window.generalRoadEditor.rotation(frame.key)}))}));
  const shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  const field=async(key,index,value)=>evaluate('(()=>{const node=[...document.querySelectorAll(".editor-highlight-controls")].find(node=>node.dataset.controlsKey==='+JSON.stringify(key)+').querySelector('+JSON.stringify(index==='rotation'?'[data-highlight-rotation]':'[data-bound-index="'+index+'"]')+');node.value='+JSON.stringify(String(value))+';node.dispatchEvent(new Event("change",{bubbles:true}))})()');
  try{
    const fixture=JSON.parse(baseline);delete fixture.content.results['results-review'];for(const key of Object.keys(fixture.legacyState.texts))if(key.startsWith('results-review|'))delete fixture.legacyState.texts[key];for(const field of ['highlights','disabledHighlights'])for(const key of Object.keys(fixture.legacyState[field]))if(key.startsWith('results:results-review:'))delete fixture.legacyState[field][key];fs.writeFileSync(previewConfigPath,JSON.stringify(fixture));
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});await navigate(base+'/presentation-demo/#results-review');
    assert.equal((await state()).frames.length,2);assert(await run(()=>[...document.querySelectorAll('.results-points h3,.results-points p')].every(node=>node.textContent==='')));
    assert(await run(async()=>{for(const node of document.querySelectorAll('.results-diagram image')){const image=new Image();image.src=node.getAttribute('href');await image.decode();}return true;}));
    const first=await state();assert.equal(first.phase,0);assert.equal(await run(()=>document.querySelectorAll('.results-focus-rect').length),2);await shot('comparison-first');
    await click('#next');assert.equal((await state()).page,'results-review');assert.equal((await state()).phase,1);assert.notEqual((await state()).frames[0].key,first.frames[0].key);assert.notDeepEqual((await state()).frames[0].box,first.frames[0].box);await view('results-review',1);await shot('comparison-second');
    await click('#previous');assert.equal((await state()).phase,0);await click('.results-comparison-switcher [data-results-comparison-step="1"]');assert.equal((await state()).phase,1);await click('#next');assert.equal((await state()).page,'chapter-cover-results-general');await click('#previous');assert.equal((await state()).phase,1);
    await navigate(base+'/presentation-demo/#results-review/step-99');assert.equal((await state()).page,'results-review');assert.equal((await state()).phase,1);
    await run(()=>document.querySelector('.results-points li:first-child').dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true})));assert.equal((await state()).phase,0);
    await navigate(base+'/presentation-demo/#results-review/step-1');assert.equal((await state()).phase,1);await click('.edit-toggle');await click('.editor-highlight');await wait('document.querySelectorAll(".editor-highlight-controls").length===2');
    const second=await state(),left=second.frames[0],right=second.frames[1];await field(left.key,0,left.box[0]+30);await field(left.key,'rotation',19);const moved=await state();assert.equal(moved.frames[0].rotation,19);assert.deepEqual(moved.frames[1].box,right.box);
    await click('[data-vl-action="undo"]');assert.equal((await state()).frames[0].rotation,0);await click('[data-vl-action="redo"]');assert.equal((await state()).frames[0].rotation,19);
    await click('.results-comparison-switcher [data-results-comparison-step="0"]');assert.deepEqual((await state()).frames[0].box,first.frames[0].box);await click('.results-comparison-switcher [data-results-comparison-step="1"]');assert.deepEqual((await state()).frames[0].box,moved.frames[0].box);
    const pointer=await run(()=>{const frame=window.generalRoadPresentation.editorFrames()[1],b=frame.getBox(),p=new DOMPoint(b[0]+b[2]/2,b[1]+b[3]/2).matrixTransform(frame.coordinateElement.getScreenCTM());return{x:p.x,y:p.y};});await dragFrom(pointer.x,pointer.y,12,8);assert.notDeepEqual((await state()).frames[1].box,right.box);await shot('comparison-highlight-edit');
    await click('.editor-highlight');await editText('.results-points li:first-child h3','自行車道顏色');await editText('.results-points li:first-child p','自行填寫的新舊版差異。');await click('[data-content-action="add-point"]');
    assert.equal(await run(()=>window.generalRoadPresentation.stops.filter(stop=>window.generalRoadPresentation.pages[stop.page].id==='results-review').length),3);assert.equal(await run(()=>document.querySelector('.results-points li:last-child h3').textContent),'');
    await click('.results-comparison-switcher [data-results-comparison-step="2"]');const third=await state();assert.equal(third.frames.length,2);assert(!third.frames.some(frame=>moved.frames.some(other=>other.key===frame.key)));
    await click('.results-points li:last-child [data-content-action="up"]');assert.equal(await run(()=>window.PresentationContent.current.model.points[1].id),third.frames[0].key.split(':')[2]);
    await click('[data-vl-action="undo"]');await click('[data-vl-action="redo"]');
    fs.writeFileSync(previewConfigPath,await run(()=>window.visualLayoutEditor.store.serialize()));await navigate(base+'/presentation-demo/#results-review/step-2');assert.equal((await state()).phase,2);assert.equal(await run(()=>document.querySelector('.results-points h3').textContent),'自行車道顏色');assert.equal((await state()).frames[0].rotation,19);
    await click('.edit-toggle');await click('.results-points li:last-child [data-content-action="remove"]');assert.equal((await state()).page,'results-review');assert.equal((await state()).phase,1);await click('[data-vl-action="undo"]');assert.equal(await run(()=>document.querySelectorAll('.results-points li').length),3);await click('.edit-toggle');
    pass('paired difference highlights switch through next/previous, direct selection and deep links; note additions, ordering, deletion, undo/redo and JSON reload retain independent boxes');
    for(const [width,height]of [[1366,768],[1024,768],[390,844]]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await view('results-review',0);
      assert(await run(()=>document.documentElement.scrollWidth<=innerWidth+1),'Comparison must fit width '+width);
      if(width>900)assert(await run(()=>{const cards=[...document.querySelectorAll('.results-map-card')].map(node=>node.getBoundingClientRect());return Math.abs(cards[0].height-cards[1].height)<1&&document.getElementById('presentation').scrollHeight-document.getElementById('presentation').clientHeight<3;}),'Comparison must retain equal frames and fit desktop height');
      await shot('comparison-'+width);
    }
    pass('requested original files decode with equal proportion-preserving frames, blank editable note styling and usable desktop/tablet/phone layouts');
  }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
