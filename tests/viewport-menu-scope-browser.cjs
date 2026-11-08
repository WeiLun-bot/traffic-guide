'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,navigate,view,click,cdp,base,artifacts,pass})=>{
  const run=fn=>evaluate('('+fn.toString()+')()');
  const shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  await navigate(base+'/presentation-demo/#results-modules');
  const signature=await run(()=>VisualLayoutCore.signature(visualLayoutEditor.store.config));
  const galleries=['results-modules','results-modules-m2','results-modules-m3','results-modules-m3-2','results-modules-m4'];
  for(const [width,height]of [[2560,1600],[1536,864],[1024,768],[390,844]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1,mobile:width<621});
    for(const id of galleries){
      await view(id);
      const actual=await run(()=>{
        const root=document.getElementById('presentation'),bounds=n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,height:r.height};};
        return {page:generalRoadPresentation.page.id,menus:root.querySelectorAll('.viewport-display-options').length,horizontal:document.documentElement.scrollWidth-innerWidth,overflow:root.scrollHeight-root.clientHeight,cards:[...root.querySelectorAll('.results-representative-card')].map(card=>{const header=bounds(card.querySelector('.map-toolbar')),image=bounds(card.querySelector('.results-map-canvas')),button=bounds(card.querySelector('.results-original'));return {header,image,button};})};
      });
      assert(actual.cards.length>0);
      assert.equal(actual.menus,0,'General-road menus must not be injected into '+id);
      assert(actual.horizontal<=1,JSON.stringify(actual));
      if(width>900)assert(actual.overflow<=2,JSON.stringify(actual));
      for(const {header,image,button}of actual.cards){assert(image.height>40,JSON.stringify(actual));assert(button.top>=header.top-1&&button.bottom<=header.bottom+1,JSON.stringify(actual));assert(image.top>=header.bottom-1,JSON.stringify(actual));}
      if(width===1536)await shot('viewport-scope-'+id);
    }
  }
  pass('All five representative galleries retain compact controls and contained image/card layouts on desktop, tablet and phone');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1536,height:864,screenWidth:1536,screenHeight:864,deviceScaleFactor:1,mobile:false});
  await view('results-modules');await click('.results-representative-card .representative-image-open');
  assert(await run(()=>document.getElementById('asset-dialog').open));
  assert.equal(await run(()=>document.querySelectorAll('#asset-dialog .viewport-display-options').length),0);
  await click('#asset-dialog [data-close]');
  for(const id of ['m401-local-issues','c101-conditions','results-module-example']){
    await view(id);assert.equal(await run(()=>document.querySelectorAll('#presentation .viewport-display-options').length),0,id);
    assert(await run(()=>document.querySelector('#presentation .interactive-viewport')),'Expected an interactive image on '+id);
  }
  await view('results-modules');await run(()=>generalRoadEditor.setEditing(true));await click('.results-representative-card .iv-trigger');
  assert(await run(()=>Boolean(document.querySelector('.iv-panel:not([hidden]) [data-iv-action="capture"]'))));
  assert(await run(()=>Boolean(document.querySelector('.iv-panel:not([hidden]) [data-iv-display="all"]'))));
  await click('.iv-panel:not([hidden]) [data-iv-action="close"]');await run(()=>generalRoadEditor.setEditing(false));
  assert.equal(await run(()=>VisualLayoutCore.signature(visualLayoutEditor.store.config)),signature,'Reading and opening image controls must not modify saved settings');
  pass('Non-general original-image dialogs, viewport controllers and initial-view editing remain available without extra display menus');
  // Cross-deck navigation must use the destination page, even before the body deck marker updates.
  for(const id of ['context','results-modules','g201-overview','m401-local-issues','g201-conditions']){
    await view(id);
    const actual=await run(()=>({general:generalRoadPresentation.page.deckId==='general',images:document.querySelectorAll('#presentation .interactive-viewport:not(.compare-diagram)').length,menus:document.querySelectorAll('#presentation .viewport-display-options').length}));
    assert.equal(actual.menus>0,actual.general,JSON.stringify({id,...actual}));
  }
  const menu='#presentation .viewport-display-options';await click(menu+'>summary');await click(menu+' [data-viewport-action="all"]');
  assert(await run(()=>Boolean(document.querySelector('#presentation [data-image-fit-explicit="all"]'))));
  await run(()=>generalRoadEditor.setEditing(true));await click(menu+' [data-viewport-action="initial"]');
  assert(await run(()=>Boolean(document.querySelector('.iv-panel:not([hidden])'))));
  await click('.iv-panel:not([hidden]) [data-iv-action="close"]');await run(()=>generalRoadEditor.setEditing(false));
  await view('g201-overview');assert.equal(await run(()=>document.querySelectorAll('.comparison-display-pair .viewport-display-options').length),2);
  pass('General-road full-image/initial-view controls and paired before/after menus survive repeated cross-deck navigation');
  for(const id of ['results-modules','m101-lanes-diagram','modules-formation','c101-conditions']){
    await view(id);await run(()=>generalRoadEditor.setEditing(true));await click('#presentation .iv-trigger');
    const before=await run(()=>{
      const panel=document.querySelector('.iv-panel:not([hidden])'),asset=decodeURIComponent(panel.dataset.imageViewId.split('/').at(-1));
      const svg=[...document.querySelectorAll('#presentation svg.interactive-viewport')].find(n=>n.closest('[data-editor-image-key]')?.dataset.editorImageKey===asset);
      if(!svg)throw new Error('Initial-view image not found: '+asset);window.__crossDeckSvg=svg;
      const controller=generalRoadViewport.get(svg),v=controller.read();controller.start();controller.write([v[0]+v[2]*.12,v[1]+v[3]*.09,v[2]*.7,v[3]*.7]);
      return controller.read();
    });
    await click('.iv-panel:not([hidden]) [data-iv-action="capture"]');
    for(const delay of [0,800]){
      if(delay)await evaluate('new Promise(r=>setTimeout(r,800))');
      const after=await run(()=>generalRoadViewport.get(window.__crossDeckSvg).read());
      before.forEach((value,index)=>assert(Math.abs(value-after[index])<1e-6,JSON.stringify({id,before,after})));
    }
    await click('.iv-panel:not([hidden]) [data-iv-action="close"]');await run(()=>generalRoadEditor.setEditing(false));
  }
  pass('Results, module diagrams, formation stages and complex-scenario photos capture the exact camera immediately and after animation');
  await view('m101-lanes-diagram');await run(()=>generalRoadEditor.setEditing(true));await click('.editor-highlight');
  const initial=await run(()=>generalRoadPresentation.editorFrames().map(frame=>({key:frame.key,box:frame.getBox(),hasBox:frame.hasBox})));
  assert(initial.length>0);assert(initial[0].hasBox);
  const deleted=()=>run(()=>Boolean(generalRoadEditor.state.highlights[generalRoadPresentation.editorFrames()[0].key]?.deleted));
  assert.equal(await deleted(),false);
  await click('[data-toggle-module-frame]');assert.equal(await deleted(),true);
  await click('[data-vl-action="undo"]');assert.equal(await deleted(),false);
  await click('[data-vl-action="redo"]');assert.equal(await deleted(),true);
  await click('[data-toggle-module-frame]');
  assert.equal(await deleted(),false);
  const restored=await run(()=>generalRoadPresentation.editorFrames().map(frame=>({key:frame.key,box:frame.getBox(),hasBox:frame.hasBox})));
  assert.deepEqual(restored.map(({key,hasBox})=>({key,hasBox})),initial.map(({key,hasBox})=>({key,hasBox})));
  restored.forEach((frame,index)=>frame.box.forEach((value,axis)=>assert(Math.abs(value-initial[index].box[axis])<1e-9)));
  await click('.editor-highlight');await run(()=>generalRoadEditor.setEditing(false));
  pass('Existing module highlight deletion, restore and undo/redo preserve all independently configured frames');
};
