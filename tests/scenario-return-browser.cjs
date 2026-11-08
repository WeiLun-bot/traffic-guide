'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,navigate,view,click,wait,cdp,base,artifacts,pass})=>{
  const run=fn=>evaluate('('+fn.toString()+')()');
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const state=()=>run(()=>JSON.stringify(generalRoadPresentation.state));
  const report=[];
  await navigate(base+'/presentation-demo/?mode=view#g102-overview');
  const signature=await run(()=>VisualLayoutCore.signature(visualLayoutEditor.store.config));
  const comparisons=await run(()=>generalRoadPresentation.pages.filter(page=>page.kind==='scenario-comparison').map(page=>({id:page.id,scene:generalRoadPresentation.data.scenarios.find(scene=>scene.id===page.scenario)})));
  for(const {id,scene}of comparisons){
    await view(scene.overviewId);
    await run(()=>{const svg=document.querySelector('.compare-after')||document.getElementById('main-map'),controller=svg&&generalRoadViewport.get(svg);if(controller){controller.showFull();const box=controller.read();controller.write([box[0]+box[2]*.1,box[1]+box[3]*.1,box[2]*.8,box[3]*.8]);}document.getElementById('explanation').scrollTop=40;});
    const original=await run(()=>({state:JSON.stringify(generalRoadPresentation.state),view:(document.querySelector('.compare-after')||document.getElementById('main-map'))?.getAttribute('viewBox'),scroll:document.getElementById('explanation').scrollTop}));
    await click('.explain-footer [data-page="'+id+'"]');
    assert.equal(await run(()=>generalRoadPresentation.page.id),id);
    assert.equal(await run(()=>document.querySelector('[data-return-scenario]')?.textContent),'↶ 返回 '+scene.code);
    if(scene.code==='G1-02'){const image=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'g102-comparison-return.png'),Buffer.from(image.data,'base64'));}
    await click('[data-return-scenario]');await wait('generalRoadPresentation.page.id==='+JSON.stringify(scene.overviewId));await settle();await settle();
    assert.equal(await state(),original.state);assert.equal(await run(()=>(document.querySelector('.compare-after')||document.getElementById('main-map'))?.getAttribute('viewBox')),original.view);assert.equal(await run(()=>document.getElementById('explanation').scrollTop),original.scroll);
    assert.equal(await run(()=>document.querySelectorAll('[data-return-scenario]').length),0);
    report.push({origin:scene.overviewId,target:id,type:'comparison'});
  }
  pass('All '+comparisons.length+' comparison links show the correct return button and restore the original page, step, camera and scroll');
  const sources=await run(()=>generalRoadPresentation.pages.filter(page=>page.scenario&&(page.article||generalRoadPresentation.data.scenarios.some(scene=>scene.overviewId===page.id))).map(page=>({id:page.id,phase:page.article?1:0,code:generalRoadPresentation.data.scenarios.find(scene=>scene.id===page.scenario).code})));
  for(const source of sources){
    await view(source.id,source.phase);
    const links=await run(()=>[...document.querySelectorAll('#presentation [data-open-module],#presentation [data-module-route],#presentation [data-reference-page],#presentation [data-table-preview],#presentation [data-reference-preview],#presentation .scenario-related-links [data-page]')].map(button=>{const attr=['data-open-module','data-module-route','data-reference-page','data-table-preview','data-reference-preview','data-page'].find(attr=>button.hasAttribute(attr));return {attr,value:button.getAttribute(attr)};}));
    for(const {attr,value}of links){
      const original=await state();await click('#presentation ['+attr+'='+JSON.stringify(value)+']');
      if(['data-reference-page','data-table-preview','data-reference-preview'].includes(attr)){
        await wait('Boolean(document.querySelector("dialog[open]"))','Popup did not open: '+source.id+' '+value);
        assert.equal(await state(),original);await click('dialog[open] [data-close]');
      }else{
        await wait('Boolean(document.querySelector("[data-return-scenario]"))','Missing return: '+source.id+' '+value);
        assert.equal(await run(()=>document.querySelector('[data-return-scenario]').textContent),'↶ 返回 '+source.code);
        await click('[data-return-scenario]');await wait('generalRoadPresentation.page.id==='+JSON.stringify(source.id));await settle();
      }
      assert.equal(await state(),original,'Reference must restore its source: '+source.id+' '+value);
      report.push({origin:source.id,target:value,type:attr});
    }
  }
  pass('Audited '+sources.length+' overview/explanation pages and '+(report.length-comparisons.length)+' module/table/figure reference entries; all return to their source or close in place');
  await navigate(base+'/presentation-demo/?mode=view#g102-comparison');
  assert.equal(await run(()=>document.querySelector('[data-return-scenario]')?.textContent),'↶ 返回 G1-02');
  await click('[data-return-scenario]');assert.equal(await run(()=>generalRoadPresentation.page.id),'g102-overview');
  await view('g102-overview');await click('.explain-footer [data-page="g102-comparison"]');
  // Keep the comparison return through a refresh and a nested module reference.
  await run(()=>generalRoadPresentation.refresh());
  await run(()=>{const button=document.createElement('button');button.dataset.moduleRoute='m203-signals-diagram';document.querySelector('main>.slide').append(button);button.click();});
  await wait('generalRoadPresentation.page.deckId==="modules"');await click('[data-return-scenario]');await wait('generalRoadPresentation.page.id==="g102-comparison"');
  assert.equal(await run(()=>document.querySelector('[data-return-scenario]')?.textContent),'↶ 返回 G1-02');
  await click('[data-return-scenario]');await wait('generalRoadPresentation.page.id==="g102-overview"');
  await click('.explain-footer [data-page="g102-comparison"]');await view('context');assert.equal(await run(()=>document.querySelectorAll('[data-return-scenario]').length),0);
  pass('Direct comparison URLs have a return; refreshes and nested references retain the return chain; switching scenarios clears stale returns');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,screenWidth:390,screenHeight:844,deviceScaleFactor:3,mobile:true});
  await view('g102-overview');await click('.explain-footer [data-page="g102-comparison"]');
  const mobile=await run(()=>{const button=document.querySelector('[data-return-scenario]'),r=button.getBoundingClientRect();return {visible:r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1};});
  assert(mobile.visible);assert(!mobile.overflow);await click('[data-return-scenario]');await wait('generalRoadPresentation.page.id==="g102-overview"');
  assert.equal(await run(()=>VisualLayoutCore.signature(visualLayoutEditor.store.config)),signature,'Browsing references must not alter saved content or layout');
  fs.writeFileSync(path.join(artifacts,'scenario-return-audit.json'),JSON.stringify({pages:sources.length,comparisons:comparisons.length,entries:report},null,2));
  pass('Mobile comparison returns remain visible within the viewport; saved content and layout stay unchanged');
};
