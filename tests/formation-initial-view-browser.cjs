'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async function({evaluate,view,navigate,click,wait,mouse,dragFrom,cdp,base,pass,previewConfigPath}){
 const baseline=fs.readFileSync(previewConfigPath,'utf8');
 const run=(fn,...args)=>evaluate('('+fn.toString()+')(...'+JSON.stringify(args)+')');
 const camera=()=>run(()=>window.generalRoadViewport.get(document.querySelector('.module-formation-map svg')).read());
 const near=(actual,expected,label)=>actual.forEach((value,index)=>assert(Math.abs(value-expected[index])<.01,label+': '+JSON.stringify({actual,expected})));
 const field=(name,value)=>run((name,value)=>{const node=document.querySelector('.iv-panel:not([hidden]) [data-iv-field="'+name+'"]');node.value=String(value);node.dispatchEvent(new Event('change',{bubbles:true}));},name,value);
 const save=async()=>{await click('.iv-panel:not([hidden]) [data-iv-action="save"]');await wait('!window.visualLayoutEditor.busy','Initial-view save did not finish');};
 const disk=()=>run(async()=>{const directory=await navigator.storage.getDirectory(),handle=await directory.getFileHandle('formation-initial-view.json');return JSON.parse(await(await handle.getFile()).text());});
 const id='modules-formation/module%3Aformation-base';
 try{
  await navigate(base+'/presentation-demo/#modules-formation');await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const original=await camera(),settings={zoom:1.65,x:7.5,y:-4,rotation:13};
  await click('.iv-trigger');for(const [name,value]of Object.entries({...settings,zoom:settings.zoom*100}))await field(name,value);
  const expected=await run((home,settings)=>window.VisualLayoutCore.viewBoxFor(home,settings),original,settings);
  near(await camera(),expected,'Fields must update the current camera');await click('.iv-panel:not([hidden]) [data-iv-action="close"]');
  await view('modules-formation',1);await view('modules-formation',0);near(await camera(),expected,'Returning to the base stage must retain its saved initial camera');
  pass('formation stages restore saved zoom, offsets and rotation rather than forcing a 100% camera');

  await run(async()=>{const directory=await navigator.storage.getDirectory(),handle=await directory.getFileHandle('formation-initial-view.json',{create:true}),writer=await handle.createWritable();await writer.write(window.visualLayoutEditor.store.serialize());await writer.close();window.__formationPickerCalls=0;window.visualLayoutEditor.files.env={isSecureContext:true,indexedDB:window.indexedDB,showOpenFilePicker:async()=>{window.__formationPickerCalls++;return[handle];},showSaveFilePicker:async()=>{window.__formationPickerCalls++;return handle;}};});
  await click('[data-vl-action="open"]');await wait('!window.visualLayoutEditor.busy');await click('.iv-trigger');await field('zoom',175);await save();
  assert.equal((await disk()).imageViews[id].zoom,1.75);assert.equal(await run(()=>window.visualLayoutEditor.store.dirty),false);
  const saved=await camera();await click('.iv-panel:not([hidden]) [data-iv-action="close"]');
  await navigate(base+'/presentation-demo/#modules-formation');near(await camera(),saved,'Reload must apply the native file setting');
  assert.equal(await run(()=>window.visualLayoutEditor.files.handle?.name),'formation-initial-view.json');
  pass('the initial-view Save button writes a real browser file handle; a fresh load reconnects and restores that view');

  const pointer=await run(()=>{const r=document.querySelector('.module-formation-map svg').getBoundingClientRect();return{x:r.left+r.width*.5,y:r.top+r.height*.55};});
  await mouse('mouseWheel',pointer.x,pointer.y,{deltaY:-65,deltaX:0});await dragFrom(pointer.x,pointer.y,23,-14);
  const captured=await camera();await click('.iv-trigger');await click('.iv-panel:not([hidden]) [data-iv-action="capture"]');near(await camera(),captured,'Capture must preserve the current camera');await save();
  const diskView=(await disk()).imageViews[id];assert.notEqual(diskView.zoom,1.75);assert.equal(diskView.rotation,13);
  await click('.iv-panel:not([hidden]) [data-iv-action="close"]');await view('modules-formation',1);await view('modules-formation',0);near(await camera(),captured,'Stage switching must preserve a captured view');
  await dragFrom(pointer.x,pointer.y,19,12);await click('.module-formation-map .viewport-tools button');near(await camera(),captured,'Reset must use the saved initial camera');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});near(await camera(),captured,'Resize must keep the saved camera');await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await view('modules-formation',1);await click('.iv-trigger');await field('zoom',125);await save();const lanes=await camera();
  await click('.iv-panel:not([hidden]) [data-iv-action="close"]');await view('modules-formation',0);near(await camera(),captured,'Another drawing must not overwrite the base settings');
  await navigate(base+'/presentation-demo/#modules-formation');near(await camera(),captured,'Captured camera must survive a fresh document');await view('modules-formation',1);near(await camera(),lanes,'Second drawing must restore its own initial camera');
  pass('mouse zoom/pan capture, reset, resize and multiple saved drawings retain their own cameras after reload');
 }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
