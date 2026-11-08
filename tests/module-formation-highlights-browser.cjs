'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,view,navigate,click,cdp,base,pass,previewConfigPath})=>{
 const baseline=fs.readFileSync(previewConfigPath,'utf8'),fixture=JSON.parse(baseline),run=fn=>evaluate('('+fn.toString()+')()');
 for(const name of ['highlights','disabledHighlights'])for(const key of Object.keys(fixture.legacyState[name]))if(key.startsWith('module:modules-formation:'))delete fixture.legacyState[name][key];fs.writeFileSync(previewConfigPath,JSON.stringify(fixture));
 const idle=()=>evaluate('generalRoadPresentation.whenIdle()'),camera=()=>run(()=>generalRoadViewport.get(document.querySelector('.module-formation-map svg')).read());
 const frame=()=>run(()=>{const f=generalRoadPresentation.editorFrames()[0];return {key:f.key,box:f.getBox(),rotation:generalRoadEditor.rotation(f.key),cropSupported:typeof f.getCrop==='function'};});
 const edit=async value=>{await evaluate('generalRoadEditor.setEditing('+value+')');await idle();if(value){await run(()=>generalRoadEditor.setAdjusting(true));await idle();}};
 try{
  await navigate(base+'/presentation-demo/#modules-formation/step-1');const initial=await camera();await edit(true);
  assert.equal((await frame()).cropSupported,false);assert.deepEqual(await run(()=>[...document.querySelector('[data-frame-target]').options].map(o=>o.value)),['box']);await click('[data-toggle-module-frame]');
  await run(async()=>{const fields=[...document.querySelectorAll('[data-bound-index]')];[1100,850,700,350].forEach((v,i)=>fields[i].value=v);fields.at(-1).dispatchEvent(new Event('change',{bubbles:true}));await generalRoadPresentation.whenIdle();});
  await run(async()=>{const angle=document.querySelector('[data-highlight-rotation]');angle.value=23;angle.dispatchEvent(new Event('change',{bubbles:true}));await generalRoadPresentation.whenIdle();});const saved=await frame();assert.equal(saved.rotation,23);
  await click('[data-vl-action=undo]');assert.equal((await frame()).rotation,0);await click('[data-vl-action=redo]');assert.deepEqual(await frame(),saved);
  assert.equal(await evaluate('Object.hasOwn(generalRoadEditor.state.highlights['+JSON.stringify(saved.key)+'],"crop")'),false);await edit(false);assert.deepEqual(await camera(),initial);
  assert.equal(await run(()=>document.querySelectorAll('[data-formation-focus]').length),0);await run(()=>document.querySelector('.module-focus-rect').dispatchEvent(new MouseEvent('click',{bubbles:true})));assert.deepEqual(await camera(),initial);
  await click('#next');assert.equal(await run(()=>generalRoadPresentation.state.phase),2);await click('#previous');assert.equal(await run(()=>generalRoadPresentation.state.phase),1);
  pass('Highlights remain editable, rotatable and undoable; no crop controls or zoom action remains, and Next/Previous change drawings directly.');
  fs.writeFileSync(previewConfigPath,await run(()=>{const snapshot=visualLayoutEditor.store.snapshot();snapshot.legacyState=VisualLayoutCore.clone(generalRoadEditor.state);return visualLayoutEditor.store.serialize(snapshot);}));await navigate(base+'/presentation-demo/#modules-formation/step-1');assert.deepEqual(await frame(),saved);assert.deepEqual(await camera(),initial);
  await edit(true);await click('[data-toggle-module-frame]');assert.equal(await run(()=>document.querySelectorAll('.module-focus-rect').length),0);await click('[data-toggle-module-frame]');assert.deepEqual(await frame(),saved);await edit(false);
  await view('modules-formation',7);const bicycle=await frame(),bicycleView=await camera();await click('#next');assert.equal(await run(()=>generalRoadPresentation.state.phase),8);assert.equal((await frame()).cropSupported,false);assert.deepEqual(await camera(),bicycleView);await click('#previous');assert.deepEqual(await frame(),bicycle);
  const config=await run(()=>JSON.stringify({views:visualLayoutEditor.store.config.imageViews,highlights:generalRoadEditor.state.highlights}));await run(()=>document.activeElement?.blur());await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'PageDown',code:'PageDown'});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'PageDown',code:'PageDown'});await idle();assert.equal(await run(()=>generalRoadPresentation.state.phase),8);assert.equal(await run(()=>JSON.stringify({views:visualLayoutEditor.store.config.imageViews,highlights:generalRoadEditor.state.highlights})),config);
  pass('Saved boxes and initial views survive JSON reload and deletion/restoration; shared-image stages and keyboard navigation never add a zoom step.');
 }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
