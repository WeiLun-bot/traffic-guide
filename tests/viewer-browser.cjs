'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,click,navigate,wait,cdp,base,artifacts,pass,previewConfigPath,setConfigFailure}){
  const saved=fs.readFileSync(previewConfigPath);
  const spy=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.__viewerFileAccess=0;window.__viewerDatabaseAccess=0;
    window.showOpenFilePicker=window.showSaveFilePicker=()=>{window.__viewerFileAccess++;throw new Error('Unexpected file picker');};
    const originalOpen=IDBFactory.prototype.open;
    IDBFactory.prototype.open=function(...args){window.__viewerDatabaseAccess++;return originalOpen.apply(this,args);};
  `});
  const editControls='[data-editor-ui]:not([data-editor-ui="viewport-controls"]):not([data-editor-ui="results-image-picker"]),[data-editor-help]';
  async function checkViewer(){
    assert(await evaluate('window.PresentationMode.readOnly'));
    assert.equal(await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(editControls)})).filter(node=>node.getClientRects().length).length`),0);
    assert.equal(await evaluate('document.querySelectorAll("[contenteditable]:not([contenteditable=false])").length'),0);
    assert.equal(await evaluate('window.generalRoadEditor.editing||window.visualLayoutEditor.editing||window.generalRoadEditor.adjusting'),false);
  }
  await navigate(base+'/presentation-demo/viewer.html#context');
  await wait('document.documentElement.dataset.presentationState==="ready"');
  assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'context');
  assert.equal(await evaluate('new URL(location.href).searchParams.get("mode")'),'view');
  assert.equal(await evaluate('document.querySelector(".footer-label").textContent'),'純瀏覽模式');
  assert.equal(await evaluate('window.__viewerDatabaseAccess'),0,'Viewer must not restore editor file handles');
  await checkViewer();
  const before=await evaluate('window.visualLayoutEditor.store.serialize()');
  await evaluate(`(async()=>{
    window.generalRoadEditor.setEditing(true);window.generalRoadEditor.setAdjusting(true);window.visualLayoutEditor.setMode(true);
    window.visualLayoutEditor.transact(next=>{next.legacyState.texts.viewerTest='changed';});
    window.generalRoadEditor.setComparisonTransform('g101-conditions','before',{x:100});
    window.generalRoadEditor.addPage('intro');window.generalRoadEditor.removePage('context');window.generalRoadEditor.movePage('context',1);
    await window.generalRoadEditor.replaceImage('overall','data:image/png;base64,AA==');
    document.querySelector('.edit-toggle').click();
    for(const name of ['save','open','import','export'])document.querySelector('[data-vl-action="'+name+'"]').click();
    document.querySelector('.editor-download').click();
  })()`);
  assert.equal(await evaluate('window.visualLayoutEditor.store.serialize()'),before);
  assert.equal(await evaluate('window.__viewerFileAccess'),0);
  await checkViewer();
  pass('viewer entry preserves deep links, reads the project layout without restoring file handles, hides editing controls and refuses editing and save actions');
  await view('g101-conditions');await checkViewer();
  await view('context');
  const initial=await evaluate('(window.__viewerMap=document.querySelector("main svg.interactive-viewport")).getAttribute("viewBox")');
  const center=await evaluate('(()=>{const r=window.__viewerMap.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:center.x,y:center.y,deltaY:-120,deltaX:0});
  await wait('window.__viewerMap.getAttribute("viewBox")!=='+JSON.stringify(initial),'Viewer zoom must work');
  assert(await evaluate('document.querySelector(".viewport-tools button").getClientRects().length>0'));
  await click('.viewport-tools button');
  assert.equal(await evaluate('window.__viewerMap.getAttribute("viewBox")'),initial);
  await click('#help-button');await checkViewer();await click('#help-dialog [data-close]');
  for(const page of ['m201-stop-crosswalk','results-scenario-c4-02-strategy','presentations']){await view(page);await checkViewer();}
  assert.equal(await evaluate('document.querySelectorAll(".presentation-card").length'),4);
  await click('#next');assert.notEqual(await evaluate('window.generalRoadPresentation.page.id'),'presentations');
  await view('context');
  const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'viewer.png'),Buffer.from(shot.data,'base64'));
  pass('viewer retains all four presentations, module and scenario navigation, image zoom/reset, current-condition views and help');
  setConfigFailure(true);
  await cdp.send('Page.navigate',{url:base+'/presentation-demo/index.html?mode=view&failure-test=1'});
  await wait('document.documentElement.dataset.presentationState==="error"','Viewer should report a missing layout');
  assert.equal(await evaluate('document.getElementById("presentation-startup-import").getClientRects().length'),0);
  assert(await evaluate('document.getElementById("presentation-startup-reload").getClientRects().length>0'));
  setConfigFailure(false);await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:spy.identifier});
  await navigate(base+'/presentation-demo/#context');await click('.edit-toggle');
  assert(await evaluate('window.generalRoadEditor.editing'));
  await click('[data-vl-action="mode"]');assert(await evaluate('window.visualLayoutEditor.editing'));
  await click('.edit-toggle');
  assert(saved.equals(fs.readFileSync(previewConfigPath)));
  pass('viewer errors offer reload without importing settings; the standard editor still supports content and visual editing; saved layout is unchanged');
};
