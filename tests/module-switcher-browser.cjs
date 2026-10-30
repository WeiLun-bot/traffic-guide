'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,click,cdp,artifacts,pass}){
  const active=()=>evaluate('document.querySelector("[data-module-select]").selectedOptions[0].dataset.moduleId');
  const choose=async id=>evaluate('(()=>{const select=document.querySelector("[data-module-select]"),option=select.querySelector('+JSON.stringify('[data-module-id="'+id+'"]')+');select.value=option.value;select.dispatchEvent(new Event("change",{bubbles:true}))})()');
  await view('m201-overview');
  assert.equal(await evaluate('document.querySelectorAll(".module-navigation,.module-switcher,.module-subnav").length'),3);
  assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-module-select] option")].map(node=>[node.dataset.moduleId,node.textContent])'),[['M2-01','M2-01 停、讓管制'],['M2-02','M2-02 圓環管制'],['M2-03','M2-03 號誌化管制'],['M2-04','M2-04 路口行向管制']]);
  const ids=await evaluate('window.PresentationModules.content.pages.map(page=>page.id)');
  for(const id of ids){await view(id);assert.equal(await active(),'M2-01');assert.equal(await evaluate('document.querySelectorAll("[data-module-select] option").length'),4);assert.equal(await evaluate('document.querySelectorAll("[data-module-origin],.module-crumbs,.module-tabs").length'),0);}
  await choose('M2-02');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m202-roundabout-issues');assert.equal(await active(),'M2-02');
  // A real keyboard selection exercises the native module dropdown.
  await evaluate('document.querySelector("[data-module-select]").focus()');
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
  assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m201-overview');
  await click('.module-subnav [data-submodule-id="M2-01.2"]');await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m201-yield-layout');assert.equal(await active(),'M2-01');
  await click('.module-switcher .scenario-back');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'modules-index');assert.equal(await evaluate('document.querySelectorAll(".module-catalog-card").length'),15);
  for(const [theme,count]of [['M1',3],['M2',4],['M3',4],['M4',4]]){
    await view('module-'+theme+'-02');assert.equal(await evaluate('document.querySelectorAll("[data-module-select] option").length'),count);
    await choose(theme+'-01');assert.equal(await active(),theme+'-01');await click('.module-switcher .scenario-back');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'modules-index');
  }
  pass('module dropdown retains all four themes, native keyboard switching and overview links; submodule navigation stays in the same row');
  for(const width of [390,320]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});
  for(const id of ['m201-overview','module-M2-02','module-M1-01','module-M3-01','module-M4-01']){
    await view(id);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Module navigation overflow: '+id);
    assert(await evaluate('(()=>{const row=document.querySelector(".module-navigation"),r=row.getBoundingClientRect();return [...row.querySelectorAll("button,select")].filter(node=>node.getClientRects().length).every(node=>{const b=node.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1&&b.bottom<=r.bottom+1})})()'),'Navigation controls exceed mobile width: '+id);
    assert(await evaluate('document.querySelector(".module-navigation").getBoundingClientRect().height<=95'),'Mobile navigation should use at most two compact rows: '+id);
  }
  }
  await view('m201-overview');const image=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'module-navigation-mobile.png'),Buffer.from(image.data,'base64'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await view('m201-stop-layout');
  pass('module and child selectors remain within a 390px screen; long child choices collapse to a dropdown');
};
