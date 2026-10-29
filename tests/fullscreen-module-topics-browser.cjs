'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,wait,cdp,base,artifacts,pass}){
  const metrics=()=>evaluate('(()=>{const page=document.querySelector(".module-topic-index"),back=page.querySelector(".catalog-back"),heading=page.querySelector(".module-heading"),card=page.querySelector(".module-catalog-card"),grid=page.querySelector(".module-catalog-grid"),s=getComputedStyle(card),label=document.createRange(),r=node=>{const b=node.getBoundingClientRect();return [b.left,b.top,b.width,b.height]};label.selectNodeContents(back);return {display:getComputedStyle(page).display,columns:getComputedStyle(grid).gridTemplateColumns.split(" ").length,cardPadding:s.padding,cardMin:s.minHeight,gap:getComputedStyle(grid).gap,back:r(back),heading:r(heading),labelLines:label.getClientRects().length,fonts:[page.querySelector("h1"),heading.querySelector("p"),card.querySelector("h2"),card.querySelector("li")].map(node=>getComputedStyle(node).fontSize)}})()');
  const fullscreen=async enable=>{
    if(await evaluate('Boolean(document.fullscreenElement)')===enable)return;
    const p=await evaluate('(()=>{const r=document.getElementById("fullscreen-button").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});
    await wait('Boolean(document.fullscreenElement)==='+enable,'Fullscreen button did not '+(enable?'enter':'exit')+' the real Fullscreen API');await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  };
  const shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  await navigate(base+'/presentation-demo/#modules-M3');
  for(const size of [[1920,1080],[1440,900],[1366,768],[1280,720],[768,1024]]){
    const [width,height]=size;await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    const normal=new Map();for(const theme of ['M1','M2','M3','M4']){await view('modules-'+theme);normal.set(theme,await metrics());}
    const saved=await evaluate('window.visualLayoutEditor.store.serialize()');await fullscreen(true);
    for(const theme of ['M1','M2','M3','M4']){
      await view('modules-'+theme);const actual=await metrics(),before=normal.get(theme);
      assert.equal(actual.display,'grid');assert.equal(actual.columns,before.columns,'Fullscreen must preserve the existing card column count');assert.deepEqual(actual.fonts,before.fonts,'Fullscreen must preserve title and body font sizes');assert(actual.back[1]+actual.back[3]<=actual.heading[1]+1,'Return link should occupy its own row above the heading');assert(Math.abs(actual.back[0]-actual.heading[0])<1,'Return link and heading should share the same left edge');assert.equal(actual.labelLines,1,'Return label should remain on one line');
      assert(await evaluate('(()=>{const main=document.querySelector("main"),b=main.getBoundingClientRect();return main.scrollHeight<=main.clientHeight+1&&[...document.querySelectorAll(".module-catalog-card,.module-source-note")].every(node=>{const r=node.getBoundingClientRect();return r.top>=b.top-1&&r.bottom<=b.bottom+1&&node.scrollHeight<=node.clientHeight+1})})()'),'Module topic should fit one viewport without clipping: '+theme+' at '+width+'x'+height);
    }
    await view('modules-M3');if(width===1366)await shot('fullscreen-module-m3-1366');if(width===1920)await shot('fullscreen-module-m3-1920');
    assert.equal(await evaluate('window.visualLayoutEditor.store.serialize()'),saved,'Fullscreen presentation styles must not modify the JSON configuration');await fullscreen(false);const restored=await metrics();assert.deepEqual(restored,normal.get('M3'),'Leaving fullscreen must restore the original topic layout');
  }
  pass('all four module topics fit at 1920×1080, 1440×900, 1366×768, 1280×720 and 768×1024; card columns and font sizes are preserved');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});await view('modules-M3');const before=await metrics();await fullscreen(true);await click('.edit-toggle');const edit=await metrics();assert.equal(edit.display,before.display);assert.equal(edit.cardPadding,before.cardPadding);assert.equal(edit.cardMin,before.cardMin);assert.equal(edit.gap,before.gap);assert.equal(edit.labelLines,1,'Editing should retain the original single-line return label');await click('.edit-toggle');assert.equal((await metrics()).display,'grid');
  await view('modules-index');assert.equal(await evaluate('Boolean(document.querySelector(".module-topic-index"))'),false);assert(await evaluate('document.querySelector("main").scrollHeight>document.querySelector("main").clientHeight&&getComputedStyle(document.querySelector("main")).overflowY==="auto"'),'The longer all-module directory should remain scrollable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:640,height:720,deviceScaleFactor:1,mobile:false});await view('modules-M3');assert.notEqual((await metrics()).display,'grid');assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Narrow fullscreen should wrap naturally');
  await fullscreen(false);await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await view('cover');
  pass('real fullscreen entry/exit and editing restore normal layout; narrow screens and long directories retain natural scrolling without changing JSON');
  for(const [width,height]of [[1920,1080],[1366,768],[1280,720]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await view('m201-stop-extensions');await fullscreen(true);
    for(const id of ['m201-stop-extensions','m201-yield-extensions']){
      await view(id);const topicIds=await evaluate('[...document.querySelectorAll(".module-extension-card")].map(card=>card.dataset.moduleTopicId)'),shown=()=>evaluate('[...document.querySelectorAll(".module-extension-card:not([hidden])")].map(card=>card.dataset.moduleTopicId)');
      if(await evaluate('!document.querySelector(\'[data-module-extension-step="-1"]\').disabled'))await click('[data-module-extension-step="-1"]');
      assert.deepEqual(await shown(),topicIds.slice(0,2));assert.equal(await evaluate('document.querySelector("[data-extension-range]").textContent'),'1–2 / 4');
      assert(await evaluate('[...document.querySelectorAll(".module-extension-pager button:not(:disabled)")].every(button=>{const r=button.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest("button")===button})'),'Group controls must remain clickable above any preview status message');
      const saved=await evaluate('window.visualLayoutEditor.store.serialize()');
      assert(await evaluate('(()=>{const main=document.querySelector("main"),b=main.getBoundingClientRect(),cards=[...document.querySelectorAll(".module-extension-card:not([hidden])")];return cards.length===2&&main.scrollHeight<=main.clientHeight+1&&cards.every(card=>{const r=card.getBoundingClientRect(),copy=card.querySelector(".module-extension-copy");return r.top>=b.top&&r.bottom<=b.bottom+1&&copy.clientHeight>=100})})()'),'Two taller extension cards must fit at '+width+'x'+height+': '+id);
      await click('.module-extension-card:not([hidden]) [data-asset]');assert(await evaluate('document.getElementById("asset-dialog").open'));await evaluate('document.getElementById("asset-dialog").close()');
      if(width===1366)await shot(id+'-two-cards-fullscreen');
      await click('[data-module-extension-step="1"]');assert.deepEqual(await shown(),topicIds.slice(2));assert.equal(await evaluate('window.generalRoadPresentation.page.id'),id);assert.equal(await evaluate('document.querySelector("[data-extension-range]").textContent'),'3–4 / 4');
      await click('#previous');assert.deepEqual(await shown(),topicIds.slice(0,2));assert.equal(await evaluate('document.getElementById("next-label").textContent'),'下一組延伸應用');
      await evaluate('document.activeElement.blur()');await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});assert.deepEqual(await shown(),topicIds.slice(2));
      assert.equal(await evaluate('window.visualLayoutEditor.store.serialize()'),saved,'Changing visible groups must not modify saved settings');
      if(width===1366){await click('.edit-toggle');assert.equal((await shown()).length,4);assert(await evaluate('document.querySelector(".module-extension-pager").hidden'));await click('.edit-toggle');assert.deepEqual(await shown(),topicIds.slice(2));}
      const nextPage=await evaluate('(()=>{const app=window.generalRoadPresentation;return app.pages[app.pages.findIndex(page=>page.id===app.page.id)+1].id})()');await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),nextPage);
    }
    await view('m201-stop-extensions');await fullscreen(false);assert.equal(await evaluate('document.querySelectorAll(".module-extension-card:not([hidden])").length'),4);assert(await evaluate('document.querySelector(".module-extension-pager").hidden'));
  }
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await view('cover');pass('fullscreen shows two taller extension cards with image enlargement; group buttons, footer and keyboard traverse both groups while editing and windowed preview restore all four');
};
