'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,navigate,click,base,previewConfigPath,pass})=>{
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),run=fn=>evaluate('('+fn.toString()+')()');
  const idle=()=>evaluate('window.generalRoadPresentation.whenIdle()');
  const editing=async()=>{await run(()=>window.generalRoadEditor.setEditing(true));await idle();};
  const frame=()=>run(()=>{const f=window.generalRoadPresentation.editorFrames()[0];return f?{key:f.key,label:f.label,image:f.imageKey,facility:f.facilityId,hasBox:f.hasBox,box:f.getBox()}:null;});
  const add=async(label,kind='control')=>{
    await evaluate('(()=>{document.querySelector("[data-module-concept-new-facility]").value='+JSON.stringify(label)+';document.querySelector("[data-module-concept-new-kind]").value='+JSON.stringify(kind)+';})()');
    await click('[data-module-concept-add-facility]');
    const id=await run(()=>document.querySelector('[data-module-concept-facility][aria-pressed="true"]').dataset.moduleConceptFacility);
    const current=await frame();assert(current,'A newly added facility needs a frame target');assert.equal(current.facility,id);assert.equal(current.label,label);assert.equal(current.hasBox,false);
    await click('[data-module-concept-frame]');
    const drawn=await frame();assert.equal(drawn.facility,id);assert.equal(drawn.hasBox,true);assert(await evaluate('Boolean(window.generalRoadEditor.state.highlights['+JSON.stringify(drawn.key)+']?.box)'));
    return drawn;
  };
  const group=async asset=>{await evaluate('(async()=>{const select=document.querySelector(".module-group-picker select");select.value='+JSON.stringify(asset)+';select.dispatchEvent(new Event("change",{bubbles:true}));await window.generalRoadPresentation.whenIdle();})()');};
  try{
    await navigate(base+'/presentation-demo/#m301-crossing-diagram/topic-diagonal');await editing();
    const visible=await run(()=>document.querySelector('.module-map-canvas').dataset.editorImageKey);
    const sourceFirst=await run(()=>'module:'+window.PresentationModules.displayContext().source.assets[0]);assert.notEqual(visible,sourceFirst,'Regression fixture needs a different concept image');
    const oldBoxes=await run(()=>JSON.stringify(window.generalRoadEditor.state.highlights));
    const bicycle=await add('測試新增設施的獨立打亮框');assert.equal(bicycle.image,visible);
    const saved=await run(()=>{const snapshot=window.visualLayoutEditor.store.snapshot();snapshot.legacyState=window.VisualLayoutCore.clone(window.generalRoadEditor.state);return window.visualLayoutEditor.store.serialize(snapshot);});
    const restored=JSON.parse(saved);assert.deepEqual(restored.legacyState.highlights[bicycle.key].box,bicycle.box);
    for(const[key,value]of Object.entries(JSON.parse(oldBoxes)))assert.deepEqual(restored.legacyState.highlights[key],value,'Adding a facility must not change another facility highlight');
    fs.writeFileSync(previewConfigPath,saved);await navigate(base+'/presentation-demo/#m301-crossing-diagram/topic-diagonal');await editing();
    await click('[data-module-concept-facility="'+bicycle.facility+'"]');assert.deepEqual(await frame(),bicycle,'Facility target and box must survive a JSON reload');
    pass('New facilities bind to the displayed concept image, receive their own highlight, preserve existing boxes and survive JSON reload.');

    await navigate(base+'/presentation-demo/#m301-crossing-diagram/topic-diagonal');await editing();
    const groups=await run(()=>window.PresentationModules.displayContext().topic.imageGroups);assert.deepEqual(groups.map(g=>g.assets.length),[1,2,2]);
    await group(groups[1].assets[0]);
    const paired=await add('測試並列圖組的新增設施');assert.equal(paired.image,'module:'+groups[1].assets[0]);
    await group(groups[2].assets[0]);assert.equal(await frame(),null,'An off-screen selection must not edit another facility by fallback');
    await click('[data-module-concept-facility="'+paired.facility+'"]');assert.equal(await run(()=>document.querySelector('[data-image-group]').dataset.imageGroup),groups[1].id);assert.deepEqual(await frame(),paired);
    await group(groups[2].assets[0]);await click('[data-module-concept-facility="hours"]');
    assert.equal((await frame()).image,'module:'+groups[2].assets[1]);
    const right=await add('測試右側照片的新增設施');assert.equal(right.image,'module:'+groups[2].assets[1]);
    pass('Grouped photos keep independent facility boxes; selecting an off-screen facility opens its photo, and a new facility can target the selected right-hand photo.');

    await navigate(base+'/presentation-demo/#m301-sidewalk-diagram/topic-continuity');await editing();
    await click('[data-module-concept-facility="barrier"]');const selectedImage=(await frame()).image;
    const design=await add('測試設計要素的打亮框','design');assert.equal(design.image,selectedImage);
    pass('Parallel galleries and design elements use the selected visible photo without falling back to the source page first image.');
  }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
