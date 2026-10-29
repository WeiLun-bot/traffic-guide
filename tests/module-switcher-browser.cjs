'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,click,cdp,artifacts,pass}){
  const style=selector=>evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(node);return Object.fromEntries(['fontSize','fontFamily','paddingTop','paddingRight','paddingBottom','paddingLeft','borderWidth','borderColor','borderRadius','backgroundColor','color'].map(key=>[key,s[key]]))})()`);
  const shot=async name=>{await evaluate('(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))})()');const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  await view('context');const activeStyle=await style('.scenario-switcher [data-scenario="g1-01"]'),normalStyle=await style('.scenario-switcher [data-scenario="g1-02"]');
  await click('#chapters [data-deck="modules"]');await view('m201-overview');
  assert.equal(await evaluate('document.querySelectorAll(".module-switcher").length'),1);assert.equal(await evaluate('document.querySelectorAll(".module-crumbs,.module-tabs").length'),0);
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".module-switcher [data-module-id]")].map(node=>[node.dataset.moduleId,node.textContent.trim()])'),[['M2-01','M2-01 停、讓管制'],['M2-02','M2-02 圓環管制'],['M2-03','M2-03 號誌化管制'],['M2-04','M2-04 路口行向管制']]);
  assert.deepEqual(await style('.module-switcher [data-module-id="M2-01"]'),activeStyle);assert.deepEqual(await style('.module-switcher [data-module-id="M2-02"]'),normalStyle);
  const ids=await evaluate('window.PresentationModules.content.pages.map(page=>page.id)');
  for(const id of ids){await view(id);assert.equal(await evaluate('document.querySelector(".module-switcher [aria-current=page]").dataset.moduleId'),'M2-01');assert.equal(await evaluate('document.querySelectorAll(".module-switcher [data-module-id]").length'),4);assert.equal(await evaluate('document.querySelectorAll("[data-module-origin],.module-switcher>span").length'),0);}
  await view('m201-overview');await shot('module-peer-navigation');
  await click('.module-switcher [data-module-id="M2-02"]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m202-roundabout-issues');assert.equal(await evaluate('document.querySelector("main>.slide").dataset.moduleId'),'M2-02');assert.equal(await evaluate('document.querySelector(".module-switcher .active").dataset.moduleId'),'M2-02');
  await evaluate('document.querySelector(\'.module-switcher [data-module-id="M2-01"]\').focus()');assert.equal(await evaluate('document.activeElement.dataset.moduleId'),'M2-01');await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m201-overview');
  await click('.module-subnav [data-submodule-id="M2-01.2"]');await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m201-yield-layout');assert.equal(await evaluate('document.querySelector(".module-switcher .active").dataset.moduleId'),'M2-01');
  await click('.module-switcher .scenario-back');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'modules-index');assert.equal(await evaluate('document.querySelectorAll(".module-catalog-card").length'),15);
  for(const [theme,count]of [['M1',3],['M2',4],['M3',4],['M4',4]]){
    await view('module-'+theme+'-02');assert.equal(await evaluate('document.querySelectorAll(".module-switcher [data-module-id]").length'),count);assert.equal(await evaluate('document.querySelectorAll("[data-module-origin],.module-switcher>span").length'),0);
    await click('.module-switcher [data-module-id="'+theme+'-01"]');assert.equal(await evaluate('document.querySelector(".module-switcher .active").dataset.moduleId'),theme+'-01');
    await click('.module-switcher .scenario-back');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'modules-index');
  }
  await view('m201-stop-layout');
  pass('module peer navigation retains keyboard, selection and overview links across all themes, without the right-hand description or origin button');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1024,height:900,deviceScaleFactor:1,mobile:false});await view('m201-overview');await shot('module-peer-navigation-tablet');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  for(const id of ['m201-overview','module-M2-02','module-M1-01','module-M3-01','module-M4-01']){
    await view(id);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Module peer navigation overflow: '+id);
    assert(await evaluate('(()=>{const nav=document.querySelector(".module-switcher"),buttons=[...nav.querySelectorAll("button")],frame=nav.getBoundingClientRect();return buttons.every(node=>{const b=node.getBoundingClientRect();return b.left>=frame.left-1&&b.right<=frame.right+1&&b.bottom<=frame.bottom+1})})()'),'Module peer buttons extend beyond wrapped navigation: '+id);
  }
  await view('m201-overview');await shot('module-peer-navigation-mobile');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await view('m201-stop-layout');
  pass('module peer buttons wrap within the page on a 390px viewport across all four themes');
};
