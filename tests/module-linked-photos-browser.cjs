'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,view,click,navigate,cdp,base,artifacts,pass})=>{
  const run=fn=>evaluate('('+fn.toString()+')()');
  const page='m301-crossing-issues',photo1='module:m301-crossing-issue-photo-1',photo2='module:m301-crossing-issue-photo-2';
  const photos=()=>run(()=>[...document.querySelectorAll('.module-map-canvas')].map(n=>n.dataset.editorImageKey));
  const inspect=async expected=>{assert.deepEqual(await photos(),expected);assert.equal(await run(()=>document.querySelectorAll('.module-applications').length),0);};
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1464,height:915,deviceScaleFactor:1,mobile:false});
  await navigate(base+'/presentation-demo/#'+page);
  const before=await run(()=>window.visualLayoutEditor.store.config.content.modules['m301-crossing-issues']);
  await evaluate(`window.visualLayoutEditor.transact(next=>{next.content.modules[${JSON.stringify(page)}]={points:[
    {id:'marking',title:'穿越道方向',titleKey:'test|marking|title',text:'第一張照片',textKey:'test|marking|text'},
    {id:'custom-connection',title:'行穿線銜接',titleKey:'test|connection|title',text:'新增議題沿用前一張照片',textKey:'test|connection|text'},
    {id:'distance',title:'穿越距離',titleKey:'test|distance|title',text:'第一張照片',textKey:'test|distance|text'},
    {id:'signals',title:'行人燈號',titleKey:'test|signals|title',text:'第二張照片',textKey:'test|signals|text'}]};},true)`);
  await click('[data-module-point="marking"]');await inspect([photo1]);
  const originalFrame=await run(()=>window.generalRoadPresentation.editorFrames()[0].key);
  await click('#next');await inspect([photo1]);
  assert.equal(await run(()=>document.querySelector('.is-module-point-active').dataset.modulePoint),'custom-connection');
  assert.notEqual(await run(()=>window.generalRoadPresentation.editorFrames()[0].key),originalFrame,'New issues need independent highlight frames');
  const shot=await cdp.send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(artifacts,'added-crossing-issue.png'),Buffer.from(shot.data,'base64'));
  await click('#next');await inspect([photo1]);await click('#next');await inspect([photo2]);
  pass('Added crossing issues retain the preceding photo, keep independent frames and never show stop/yield application cards');
  await evaluate(`window.visualLayoutEditor.transact(next=>{const points=next.content.modules[${JSON.stringify(page)}].points;points.unshift({id:'custom-first',title:'新增首項',titleKey:'test|first|title',text:'使用第一張照片',textKey:'test|first|text'});points.push({id:'custom-last',title:'新增末項',titleKey:'test|last|title',text:'使用上一張照片',textKey:'test|last|text'});},true)`);
  await click('[data-module-point="custom-first"]');await inspect([photo1]);
  await click('[data-module-point="custom-last"]');await inspect([photo2]);
  await evaluate('window.generalRoadPresentation.refresh()');await inspect([photo2]);
  await evaluate(`window.visualLayoutEditor.transact(next=>{next.content.modules[${JSON.stringify(page)}].points=[];},true)`);
  await inspect([photo1]);
  pass('A new first or last issue and an empty issue list all retain valid photos after refresh');
  await view('m302-lane-issues');
  const group=await run(()=>window.PresentationModules.displayContext().source.points.find(p=>p.focus?.assets?.length===2));
  assert(group,'Bicycle issue fixture should include a paired-photo issue');
  await evaluate(`window.visualLayoutEditor.transact(next=>{next.content.modules['m302-lane-issues']={points:[{id:${JSON.stringify(group.id)},title:'自行車動線',titleKey:'test|bicycle|title',text:'兩張照片',textKey:'test|bicycle|text'},{id:'custom-pair',title:'補充說明',titleKey:'test|pair|title',text:'保留並列照片',textKey:'test|pair|text'}]};},true)`);
  await click('[data-module-point="custom-pair"]');await inspect(group.focus.assets.map(id=>'module:'+id));
  pass('Added bicycle issues retain paired photos rather than collapsing to a single photo');
  await navigate(base+'/presentation-demo/#'+page);
  assert.deepEqual(await run(()=>window.visualLayoutEditor.store.config.content.modules['m301-crossing-issues']),before,'Isolated test changes must not overwrite saved content');
  const savedAdded=await run(()=>window.PresentationContent.current.model.points.find(p=>p.id.startsWith('point-'))?.id);
  if(savedAdded){await click('[data-module-point="'+savedAdded+'"]');await inspect([photo1]);}
};
