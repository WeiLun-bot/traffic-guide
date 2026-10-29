'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,click,wait,cdp,base,artifacts,pass,setStartupHold,setScriptFailure}){
  const loading='!window.__previousTestDocument && document.readyState==="complete" && document.documentElement.dataset.presentationState==="loading"';
  const ready='!window.__previousTestDocument && document.documentElement.dataset.presentationState==="ready"';
  async function begin(hash,reload=false){
    setStartupHold('/data/presentations.json');
    await evaluate('window.__previousTestDocument=true');
    if(reload)await cdp.send('Page.reload',{ignoreCache:true});
    else await cdp.send('Page.navigate',{url:base+'/presentation-demo/?startup-check='+Date.now()+hash});
    await wait(loading,'Pending metadata must retain the loading screen');
    assert(await evaluate('document.getElementById("presentation-startup").checkVisibility()'));
    assert(await evaluate('[".header","#presentation",".playbar",".reading-progress"].every(selector=>getComputedStyle(document.querySelector(selector)).visibility==="hidden")'),'Incomplete presentation chrome must not be painted');
    assert(await evaluate('document.querySelector(".header").getBoundingClientRect().height>0 && document.getElementById("presentation").clientWidth>0'),'Initialization must retain measurable layout');
    assert.equal(await evaluate('document.querySelectorAll("#chapters button").length'),0,'No hard-coded old chapter navigation');
    assert.equal(await evaluate('document.getElementById("presentation").childElementCount'),0);
    setStartupHold(null);
    await wait(ready,'Initialized presentation must become visible without a timer');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".header")).visibility'),'visible');
    assert.equal(await evaluate('document.getElementById("presentation-startup").checkVisibility()'),false);
    assert.equal(await evaluate('document.getElementById("presentation").getAttribute("aria-busy")'),'false');
  }
  try{
    await begin('#m201-stop-layout');
    assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m201-stop-layout');
    assert.equal(await evaluate('document.querySelector("#chapters .active").dataset.deck'),'modules');
    await begin('#m201-stop-layout',true);
    assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m201-stop-layout');
    assert.equal(await evaluate('document.querySelectorAll("#chapters [data-deck]").length'),4);
    await begin('#overview');
    assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'overview');
    assert.equal(await evaluate('document.querySelector("#chapters .active").dataset.deck'),'general');
    pass('delayed initial load and hard refresh show only the loading screen until the correct deck and deep-linked slide are ready');

    setScriptFailure(true);await evaluate('window.__previousTestDocument=true');
    await cdp.send('Page.navigate',{url:base+'/presentation-demo/?startup-script-failure=1#m201-stop-layout'});
    await wait('!window.__previousTestDocument && document.documentElement.dataset.presentationState==="error" && document.readyState==="complete"','Failed startup script must expose retry');
    assert(await evaluate('document.getElementById("presentation-startup-reload").checkVisibility()'));
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".header")).visibility'),'hidden');
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'startup-recovery.png'),Buffer.from(shot.data,'base64'));
    setScriptFailure(false);await evaluate('window.__previousTestDocument=true');await click('#presentation-startup-reload');
    await wait(ready,'Reload button must recover the requested slide');
    assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'m201-stop-layout');
    pass('failed initialization keeps incomplete chrome hidden and offers a working reload button');
  }finally{setStartupHold(null);setScriptFailure(false);}
};
