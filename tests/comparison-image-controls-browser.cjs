'use strict';
const assert=require('node:assert/strict');
module.exports=async({evaluate,navigate,view,click,wait,mouse,dragFrom,base,pass})=>{
  const pages=['g106-comparison','g302-comparison','g304-comparison'];
  const card=side=>'.scenario-compare-card:nth-child('+(side+1)+')';
  const panel='.iv-panel:not([hidden])';
  const cameras=()=>evaluate('structuredClone(window.visualLayoutEditor.store.config.imageViews)');
  const read=side=>evaluate('window.generalRoadViewport.get(document.querySelector('+JSON.stringify(card(side)+' .interactive-viewport')+')).read()');
  const near=(actual,expected)=>actual.forEach((value,index)=>assert(Math.abs(value-expected[index])<1e-6,JSON.stringify({actual,expected})));
  const setField=async(name,value)=>{
    const selector=panel+' [data-iv-field="'+name+'"]';await click(selector);
    await evaluate('(()=>{const field=document.querySelector('+JSON.stringify(selector)+');field.value='+JSON.stringify(String(value))+';field.dispatchEvent(new Event("change",{bubbles:true}));})()');
  };
  await navigate(base+'/presentation-demo/#'+pages[0]);
  await evaluate(`(()=>{
    generalRoadEditor.setEditing(true);
    window.__replacementPickers=0;
    document.getElementById('editor-image-file').click=()=>{window.__replacementPickers++;};
  })()`);
  const images=await evaluate('JSON.stringify(generalRoadEditor.state.images)');
  const expected={},expectedViews={};
  for(const page of pages){
    await view(page);assert.equal(await evaluate('generalRoadPresentation.page.id'),page);
    assert.equal(await evaluate('document.querySelectorAll(".scenario-compare-card").length'),2);
    for(const side of [0,1]){
      const prefix=card(side),menu=prefix+' .viewport-display-options';
      const picks=await evaluate('__replacementPickers');
      await click(menu+'>summary');
      assert.equal(await evaluate('__replacementPickers'),picks,'Opening the display menu must not open the replacement picker: '+page);
      assert(await evaluate('document.querySelector('+JSON.stringify(menu)+').open'));
      await click(menu+' [data-viewport-action="width"]');
      assert.equal(await evaluate('document.querySelector('+JSON.stringify(prefix+' .interactive-viewport')+').dataset.imageFitExplicit'),'width');
      await click(menu+' [data-viewport-action="initial"]');
      assert(await evaluate('Boolean(document.querySelector('+JSON.stringify(panel)+'))'));
      await setField('zoom',135+side*15);await setField('x',side?7:-5);await setField('y',side?-4:6);
      await click(panel+' [data-iv-action="rotate-right"]');
      const id=await evaluate('document.querySelector('+JSON.stringify(panel)+').dataset.imageViewId');
      const before=(await cameras())[id];
      assert.equal(before.zoom,side?1.5:1.35);assert.equal(before.rotation,90);
      await click(panel+' [data-iv-action="close"]');
      await click(prefix+' .iv-trigger');
      assert(await evaluate('Boolean(document.querySelector('+JSON.stringify(panel)+'))'),'Direct initial-view trigger must open the panel');
      await click(panel+' [data-iv-action="close"]');
      const position=await evaluate('(()=>{const r=document.querySelector('+JSON.stringify(prefix+' .interactive-viewport')+').getBoundingClientRect();return {x:r.left+r.width*.5,y:r.top+r.height*.5};})()');
      await mouse('mouseWheel',position.x,position.y,{deltaY:-100,deltaX:0});await dragFrom(position.x,position.y,25,-15);
      const captured=await read(side);
      await click(prefix+' .iv-trigger');await click(panel+' [data-iv-action="capture"]');
      expected[id]=(await cameras())[id];
      assert.notEqual(expected[id].zoom,before.zoom,'Wheel zoom must be captured');
      near(await read(side),captured);expectedViews[id]=await read(side);
      await click(panel+' [data-iv-action="close"]');
      assert.equal(await evaluate('__replacementPickers'),picks,'Image controls must never select a replacement');
      // Explicit replacement and clicking the artwork still invoke the picker.
      await evaluate('new Promise(resolve=>setTimeout(resolve,460))');
      await click(prefix+' [data-replace-image]');assert.equal(await evaluate('__replacementPickers'),picks+1);
      await evaluate('document.querySelector('+JSON.stringify(prefix+' .interactive-viewport')+').dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}))');assert.equal(await evaluate('__replacementPickers'),picks+2);
    }
    pass(page+': both display menus and initial-view triggers work while replacement remains available');
  }
  assert.equal(await evaluate('JSON.stringify(generalRoadEditor.state.images)'),images);
  for(const [id,camera]of Object.entries(expected))assert.deepEqual((await cameras())[id],camera,'Each diagram keeps an independent camera');
  // Save through the actual browser file writer, using a temporary file instead of project content.
  await evaluate(`(async()=>{
    const directory=await navigator.storage.getDirectory(),handle=await directory.getFileHandle('comparison-image-controls.json',{create:true});
    const writer=await handle.createWritable();await writer.write(visualLayoutEditor.store.serialize());await writer.close();
    visualLayoutEditor.files.env={isSecureContext:true,indexedDB,showOpenFilePicker:async()=>[handle],showSaveFilePicker:async()=>handle};
  })()`);
  await click('[data-vl-action="open"]');await wait('!visualLayoutEditor.busy');
  await click(card(1)+' .iv-trigger');await setField('rotation',-90);
  const finalId=await evaluate('document.querySelector('+JSON.stringify(panel)+').dataset.imageViewId');expected[finalId]=(await cameras())[finalId];
  expectedViews[finalId]=await read(1);
  await click(panel+' [data-iv-action="save"]');await wait('!visualLayoutEditor.busy');
  assert.equal(await evaluate('visualLayoutEditor.store.dirty'),false);
  const saved=await evaluate('(async()=>PresentationDocument.parse(await (await visualLayoutEditor.files.handle.getFile()).text()).imageViews)()');
  for(const [id,camera]of Object.entries(expected))assert.deepEqual(saved[id],camera);
  await navigate(base+'/presentation-demo/#'+pages[0]);
  await evaluate('generalRoadEditor.setEditing(true)');
  for(const page of pages){
    await view(page);
    for(const side of [0,1]){
      const key=await evaluate('document.querySelector('+JSON.stringify(card(side)+' [data-editor-image-key]')+').dataset.editorImageKey');
      const id=await evaluate('VisualLayoutCore.imageView('+JSON.stringify(page)+','+JSON.stringify(key)+').id');
      assert.deepEqual((await cameras())[id],expected[id]);
      near(await read(side),expectedViews[id]);
    }
  }
  pass('All six cameras save through the native file writer and restore after a fresh page load');
};
