'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({evaluate,navigate,click,base,previewConfigPath,pass})=>{
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),run=fn=>evaluate('('+fn.toString()+')()');
  const idle=()=>evaluate('window.generalRoadPresentation.whenIdle()');
  const viewing=async()=>{await run(()=>generalRoadEditor.setEditing(false));await idle();};
  const frame=()=>run(()=>{const f=generalRoadPresentation.editorFrames()[0];return {key:f.key,image:f.imageKey,width:f.width,height:f.height};});
  const setBounds=async(kind,values)=>{
    await evaluate('(async()=>{const select=document.querySelector("[data-frame-target]");select.value='+JSON.stringify(kind)+';select.dispatchEvent(new Event("change",{bubbles:true}));await generalRoadPresentation.whenIdle();})()');
    await evaluate('(async()=>{const fields=[...document.querySelectorAll(".editor-highlight-controls [data-bound-index]")];const values='+JSON.stringify(values)+';fields.forEach((field,index)=>field.value=values[index]);fields.at(-1).dispatchEvent(new Event("change",{bubbles:true}));await generalRoadPresentation.whenIdle();})()');
  };
  const configure=async(id,position=0)=>{
    await run(()=>generalRoadEditor.setEditing(true));await idle();await click('[data-module-concept-facility="'+id+'"]');
    const f=await frame(),round=n=>Math.round(n*10)/10;
    const crop=(position?[f.width*.55,f.height*.46,f.width*.36,f.height*.42]:[f.width*.18,f.height*.2,f.width*.45,f.height*.5]).map(round);
    const box=(position?[f.width*.66,f.height*.6,f.width*.08,f.height*.08]:[f.width*.32,f.height*.32,f.width*.08,f.height*.08]).map(round);
    await setBounds('box',box);await setBounds('crop',crop);
    assert.deepEqual(await evaluate('generalRoadEditor.state.highlights['+JSON.stringify(f.key)+'].crop'),crop,'The actual crop controls must save their values');
    const highlight=await evaluate('generalRoadEditor.state.highlights['+JSON.stringify(f.key)+']');return {...f,id,crop,highlight};
  };
  const camera=async image=>evaluate('(()=>{const svg=document.querySelector(".module-map-canvas[data-editor-image-key=\\"'+image+'\\"] svg");return generalRoadViewport.get(svg).read();})()');
  const checkZoom=async target=>{
    await click('[data-module-concept-facility="'+target.id+'"]');
    const result=await evaluate('(()=>{const svg=document.querySelector(".module-map-canvas[data-editor-image-key=\\"'+target.image+'\\"] svg"),crop='+JSON.stringify(target.crop)+';const matrix=svg.getScreenCTM().inverse().multiply(svg.querySelector(".module-artwork").getScreenCTM());const points=[[crop[0],crop[1]],[crop[0]+crop[2],crop[1]],[crop[0],crop[1]+crop[3]],[crop[0]+crop[2],crop[1]+crop[3]]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix)),xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {view:generalRoadViewport.get(svg).read(),bounds:[Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)],ratio:svg.clientWidth/svg.clientHeight,selected:document.querySelector("[data-module-concept-facility=\\"'+target.id+'\\"]").getAttribute("aria-pressed"),editing:generalRoadEditor.editing};})()');
    const [x,y,w,h]=result.view,[bx,by,bw,bh]=result.bounds,close=(a,b)=>Math.abs(a-b)<.05;
    assert.equal(result.editing,false);assert.equal(result.selected,'true');assert(close(x+w/2,bx+bw/2)&&close(y+h/2,by+bh/2),'Camera centers on the saved crop, including image rotation');
    assert(w+.05>=bw&&h+.05>=bh&&close(w/h,result.ratio),'The saved crop fits the actual display frame');
    assert(close(w,bw)||close(h,bh),'Camera uses the saved crop instead of an unrelated full-image or highlight view');
    return result.view;
  };
  try{
    await navigate(base+'/presentation-demo/#m101-lanes-diagram/topic-dotted');
    const first=await configure('advance'),second=await configure('arrows',1);
    const groupedRoute=base+'/presentation-demo/#m301-crossing-diagram/topic-diagonal';
    await navigate(groupedRoute);const grouped=await configure('hours');
    await navigate(base+'/presentation-demo/#m303-turning-diagram/topic-direct');const rotated=await configure('waiting-area');
    // Each full navigation reloads the baseline config, so combine only the test frames.
    const saved=JSON.parse(baseline);for(const item of [first,second,grouped,rotated]){saved.legacyState.highlights[item.key]=item.highlight;delete saved.legacyState.disabledHighlights[item.key];}fs.writeFileSync(previewConfigPath,JSON.stringify(saved));
    await navigate(base+'/presentation-demo/#m101-lanes-diagram/topic-dotted');
    await viewing();
    assert.equal(await run(()=>generalRoadEditor.editing),false);
    assert.equal(await run(()=>document.querySelector('[data-module-concept-facility="advance"]').tagName),'BUTTON');
    const initial=await camera(first.image),before=await run(()=>JSON.stringify({views:visualLayoutEditor.store.config.imageViews,highlights:generalRoadEditor.state.highlights}));
    const firstView=await checkZoom(first),secondView=await checkZoom(second);assert.notDeepEqual(firstView,secondView);assert.notDeepEqual(firstView,initial);
    await click('.module-map-canvas .viewport-tools button');assert.deepEqual(await camera(first.image),initial,'Reset returns to the concept initial view');
    assert.equal(await run(()=>JSON.stringify({views:visualLayoutEditor.store.config.imageViews,highlights:generalRoadEditor.state.highlights})),before,'Presentation clicks do not overwrite saved initial views or frames');
    pass('Saved crop controls trigger on facility buttons in presentation mode, with separate ranges per facility and an unchanged reset/initial view.');

    await navigate(groupedRoute);await viewing();assert.equal(await run(()=>document.querySelector('[data-image-group]').dataset.imageGroup),'representative');await checkZoom(grouped);
    assert.equal(await run(()=>document.querySelector('[data-image-group]').dataset.imageGroup),'signage');
    const sibling=await run(()=>{const svg=[...document.querySelectorAll('.module-map-canvas svg')].find(svg=>svg.closest('[data-editor-image-key]').dataset.editorImageKey!=='module:m301-5e86427a67'),controller=generalRoadViewport.get(svg),view=controller.read();view[0]+=view[2]*.1;controller.write(view,false);return {image:svg.closest('[data-editor-image-key]').dataset.editorImageKey,view:controller.read()};});
    await checkZoom(grouped);assert.deepEqual(await camera(sibling.image),sibling.view,'Zooming one parallel photo preserves the other photo camera');
    pass('Selecting an off-screen facility opens its image group and zooms only the correct photo, preserving the adjacent photo view.');

    await navigate(base+'/presentation-demo/#m303-turning-diagram/topic-direct');await viewing();await checkZoom(rotated);
    pass('Facility zoom accounts for a representative diagram rotated 90 degrees.');
    await run(()=>generalRoadEditor.setEditing(true));await idle();await click('[data-module-concept-facility="waiting-area"]');
    const editingView=await camera(rotated.image);await click('[data-module-concept-facility="waiting-area"]');assert.deepEqual(await camera(rotated.image),editingView,'Editing selects the facility controls without zooming away');assert(await run(()=>Boolean(document.querySelector('[data-frame-target]'))));
    pass('Editing retains the frame/crop controls and current camera rather than triggering presentation zoom.');
  }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
