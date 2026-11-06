'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,view,click,navigate,wait,cdp,base,artifacts,pass})=>{
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const fullscreen=async enabled=>{
    if(await evaluate('Boolean(document.fullscreenElement)')===enabled)return;
    const result=await cdp.send('Runtime.evaluate',{expression:enabled?'document.documentElement.requestFullscreen()':'document.exitFullscreen()',userGesture:true,awaitPromise:true});assert(!result.exceptionDetails);await settle();
  };
  const fonts=()=>evaluate(`(()=>{const host=document.getElementById('presentation');return [...host.querySelectorAll('[data-screen-font-size]')].filter(n=>n.getClientRects().length&&[...n.childNodes].some(c=>c.nodeType===Node.TEXT_NODE&&c.textContent.trim())).map(n=>{const s=getComputedStyle(n);return {key:n.tagName+'|'+n.textContent.trim().slice(0,80),size:parseFloat(s.fontSize),fraction:parseFloat(s.fontSize)/screen.height,line:s.lineHeight,font:s.fontFamily};});})()`);
  const display=async(width,height,os,chrome=0)=>{await cdp.send('Emulation.setDeviceMetricsOverride',{width:Math.round(width/os),height:Math.round(height/os-chrome),screenWidth:Math.round(width/os),screenHeight:Math.round(height/os),deviceScaleFactor:os,mobile:false});await settle();};
  const chromeMetrics=()=>evaluate(`(()=>{const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};return {screenHeight:screen.height,viewport:[innerWidth,innerHeight],header:rect(document.querySelector('.header')),footer:rect(document.querySelector('.playbar')),main:rect(document.getElementById('presentation')),toolbarHeight:document.getElementById('editor-toolbar').getBoundingClientRect().height,pageHeight:document.documentElement.scrollHeight,controls:[...document.querySelectorAll('.header button,.playbar button')].filter(n=>!n.closest('#chapters')&&n.getClientRects().length).map(n=>({id:n.id||n.className,bar:n.closest('.header')?'header':'footer',...rect(n)}))};})()`);
  const checkChrome=async()=>{
    const metrics=await chromeMetrics(),scale=metrics.screenHeight/1080,expected=50*scale;
    for(const bar of ['header','footer'])assert(Math.abs(metrics[bar].height-expected)<.1,JSON.stringify(metrics));
    assert(Math.abs(metrics.header.width-metrics.viewport[0])<1&&Math.abs(metrics.footer.width-metrics.viewport[0])<1,'Scaled bars must fill the viewport width');
    assert(Math.abs(metrics.main.y-metrics.header.bottom-metrics.toolbarHeight)<.1,'Content must start directly after the header/editor toolbar');
    assert(Math.abs(metrics.footer.bottom-metrics.viewport[1])<1,'Footer must reach the viewport bottom');
    assert(metrics.pageHeight<=metrics.viewport[1]+1,'Only content should scroll; the outer page must fit');
    for(const control of metrics.controls){const bar=metrics[control.bar];assert(control.y>=bar.y-1&&control.bottom<=bar.bottom+1,'Controls must fit within their scaled bar: '+JSON.stringify(control));assert(Math.abs(control.height-40*scale)<.1,'Navigation buttons must use the same 40/1080 ratio: '+JSON.stringify(control));}
    const details=await evaluate(`(()=>{const header=document.querySelector('.header'),toc=document.getElementById('toc-button'),edit=header.querySelector('.edit-toggle'),r=header.getBoundingClientRect(),t=toc.getBoundingClientRect(),hasEdit=Boolean(edit?.getClientRects().length),e=hasEdit?edit.getBoundingClientRect():null,scale=Number(document.documentElement.style.getPropertyValue('--screen-chrome-scale'));return {rightGap:r.right-(e||t).right,padding:parseFloat(getComputedStyle(header).paddingRight)*scale,lastIsEdit:header.lastElementChild===edit,correctOrder:!hasEdit||e.left>=t.right,wrongText:[...document.querySelectorAll('.header *,.playbar *')].filter(n=>n.getClientRects().length&&[...n.childNodes].some(c=>c.nodeType===Node.TEXT_NODE&&c.textContent.trim())).map(n=>({text:n.textContent.trim().slice(0,30),size:parseFloat(getComputedStyle(n).fontSize)})).filter(n=>Math.abs(n.size-14)>.01)};})()`);
    assert.deepEqual(details.wrongText,[],'Header/footer text must use the 14px reference size');
    assert(details.lastIsEdit&&details.correctOrder,'Editing controls must follow TOC in both visual and keyboard order');
    assert(Math.abs(details.rightGap-details.padding)<1,'Visible rightmost control must align to the right content gutter');
    return metrics;
  };
  await navigate(base+'/presentation-demo/?mode=view#context');await wait('document.documentElement.dataset.presentationState==="ready"');
  await wait('document.documentElement.dataset.screenFonts==="active"');
  const config=await evaluate('VisualLayoutCore.signature(visualLayoutEditor.store.config)');
  assert.equal(await evaluate('document.querySelectorAll(".display-options,#navigation-density-toggle,#presentation-layout-select").length'),0,'Layout switches must be withdrawn');
  const cases=await evaluate(`(()=>{const seen=new Set();return generalRoadPresentation.pages.filter(p=>{const type=p.kind==='results'?p.kind+':'+p.resultType:p.kind==='module'?p.moduleId||p.id:p.kind;if(seen.has(type))return false;seen.add(type);return true;}).map(p=>p.id);})()`);
  for(const id of ['context','g101-conditions','overview','edge','modules-index','m201-stop-layout','results-module-example'])if(!cases.includes(id))cases.push(id);
  const baseline=new Map(),report=[];
  await display(1920,1080,1.25);
  await fullscreen(true);
  for(const id of cases){
    await view(id);await settle();const active=await fonts();baseline.set(id,active);
    if(!active.length)continue; // Embedded document viewers have no HTML content fonts to normalize.
    // At the reference viewport, normalized sizes must retain the colleague's authored sizes.
    const comparison=await evaluate(`(()=>{return [...document.querySelectorAll('#presentation [data-screen-font-size]')].filter(n=>n.getClientRects().length).map(n=>({text:n.textContent.slice(0,40),active:parseFloat(getComputedStyle(n).fontSize),native:PresentationFontHeight.baseFontSize(n)})).filter(x=>Math.abs(x.active-x.native)>.1);})()`);
    assert.deepEqual(comparison,[],id+' reference text must retain upstream font sizes');
  }
  pass('all page families retain authored base sizes at the 1920x1080 / 125% calibration; old layout controls are absent');
  for(const [pixels,os]of [[[3072,1920],2],[[3084,2160],3],[[1920,1080],1],[[1920,1080],1.25],[[2560,1600],1.75]]){
    await display(...pixels,os);
    await checkChrome();
    for(const id of cases){
      await view(id);await settle();const actual=await fonts(),expected=baseline.get(id),byKey=new Map(expected.map(n=>[n.key,n]));
      const mismatches=[];for(const item of actual){const before=byKey.get(item.key);if(before&&Math.abs(item.fraction/before.fraction-1)>.012)mismatches.push({key:item.key,before:before.fraction,after:item.fraction});}
      report.push({id,pixels,os,count:actual.length,mismatches});
      fs.writeFileSync(path.join(artifacts,'font-height-measurements.json'),JSON.stringify(report,null,2));assert.deepEqual(mismatches,[],id+' text height/screen height must remain constant');
    }
  }
  pass('text/screen-height fractions stay within 1.2% across all requested display settings at browser 100%');
  pass('50px navigation bars, 40px buttons and 14px text scale together; viewer TOC aligns right and editor controls follow TOC');
  await view('edge',1);assert.equal(await evaluate('getComputedStyle(document.getElementById("selection-label-outline")).stroke'),'rgb(0, 0, 0)','Black article-number outline must be retained');
  await view('modules-index');assert(await evaluate('document.getElementById("presentation").scrollHeight>document.getElementById("presentation").clientHeight'),'Long module directory must remain scrollable');
  assert.equal(await evaluate('VisualLayoutCore.signature(visualLayoutEditor.store.config)'),config,'Display scaling must not modify saved font/layout settings');
  assert.equal(await evaluate('visualLayoutEditor.store.serialize().includes("--screen-font-")'),false,'Rendering variables must not enter saved settings');
  await fullscreen(false);await navigate(base+'/presentation-demo/#results-module-example');
  const example=()=>evaluate(`(()=>{const nodes=['設置要點','以停車再開標誌明確宣告停管制'].map(text=>[...document.querySelectorAll('main h2,main h3')].find(n=>n.textContent.trim()===text));nodes.push(document.querySelector('main .results-points p'));return nodes.map(n=>({size:parseFloat(getComputedStyle(n).fontSize),line:parseFloat(getComputedStyle(n).lineHeight)/parseFloat(getComputedStyle(n).fontSize),key:n.dataset.editKey}));})()`);
  const exact=[];
  for(const editing of [false,true]){
    if(editing)await click('.edit-toggle');
    for(const os of [1.25,1])for(const chrome of [0,110,240]){
      await display(1920,1080,os,chrome);await view('results-module-example');await settle();
      assert.equal(await evaluate('document.documentElement.dataset.screenFonts'),'active');
      const actual=await example(),factor=1.25/os;
      actual.forEach((n,i)=>{assert(Math.abs(n.size-[24,24,16][i]*factor)<.01,JSON.stringify({editing,os,chrome,actual}));assert(Math.abs(n.line-1.4)<.001);});
      const bars=await checkChrome();
      exact.push({editing,os,chrome,actual,bars});
      if(!editing&&chrome===0){const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'reading-os-'+os*100+'.png'),Buffer.from(shot.data,'base64'));}
    }
  }
  pass('reading and editing show exactly 24/16px at 125% and 30/20px at 100%, independently of browser chrome/window height');
  await click('.editor-format');await settle();
  const selectText=async key=>{await evaluate(`(()=>{const select=document.querySelector('[data-format-object]');select.value=${JSON.stringify(key)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);await settle();};
  const paragraphKey=(await example())[2].key;
  await selectText(paragraphKey);
  assert.equal(await evaluate('Number(document.querySelector("[data-format-property=fontSize]").value)'),16,'Editor must show the authored base size, not the rendered 20px');
  await evaluate(`(()=>{const n=[...document.querySelectorAll('main [data-layout-id]')].find(n=>n.dataset.editKey===${JSON.stringify(paragraphKey)});visualLayoutEditor.transact(next=>{next.elements[n.dataset.layoutId].fontSize=18;next.elements[n.dataset.layoutId].lineHeight=1.4});})()`);await settle();
  assert(Math.abs((await example())[2].size-22.5)<.01,'Individual inline !important overrides must scale too');
  await view('results-module-example');await selectText(paragraphKey);
  assert.equal(await evaluate('Number(document.querySelector("[data-format-property=fontSize]").value)'),18);
  await evaluate(`(()=>{const input=document.querySelector('[data-format-property=fontSize]');input.value='16';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await settle();
  assert(Math.abs((await example())[2].size-20)<.01);
  assert.equal(await evaluate(`generalRoadEditor.state.styles[${JSON.stringify(paragraphKey)}].fontSize`),16,'Editing must save the base value without display scaling');
  await view('context');await view('results-module-example');await selectText(paragraphKey);
  assert.equal(await evaluate('Number(document.querySelector("[data-format-property=fontSize]").value)'),16);
  assert(Math.abs((await example())[2].size-20)<.01,'New styles must survive rerender without repeated scaling');
  await cdp.send('Emulation.setEmulatedMedia',{media:'print'});await evaluate("dispatchEvent(new Event('beforeprint'))");await settle();assert.equal((await example())[2].size,16);
  await cdp.send('Emulation.setEmulatedMedia',{media:''});await evaluate("dispatchEvent(new Event('afterprint'))");await settle();assert.equal((await example())[2].size,20);
  const serialized=await evaluate('generalRoadEditor.serialize()');assert(!serialized.includes('id="screen-font-height-baseline"'),'Downloaded HTML must rebuild runtime font rules');
  assert(!serialized.includes('--screen-chrome-scale:'),'Downloaded HTML must recalculate navigation scaling on the next computer');
  await click('.edit-toggle');await display(1920,1080,1.25);await view('results-module-example');
  const pointerClick=async selector=>{const center=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...center,button:'left',buttons:1,clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...center,button:'left',buttons:0,clickCount:1});await settle();};
  await pointerClick('#presentation-picker-toggle');assert.equal(await evaluate('document.getElementById("presentation-picker-toggle").getAttribute("aria-expanded")'),'true','Scaled header menu must accept pointer clicks');
  assert(await evaluate('document.getElementById("chapters").getBoundingClientRect().bottom<innerHeight'),'Chapter menu must remain inside the viewport');
  await pointerClick('#presentation-picker-toggle');
  await pointerClick('#help-button');assert(await evaluate('document.getElementById("help-dialog").open'),'Scaled footer must accept pointer clicks');await click('#help-dialog [data-close]');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,screenWidth:390,screenHeight:844,deviceScaleFactor:3,mobile:true});await settle();
  assert.equal(await evaluate('document.documentElement.dataset.screenFonts'),'suspended');
  assert.equal(await evaluate('document.querySelector(".header").getBoundingClientRect().height'),108,'Mobile two-row header must retain its native height');
  assert.equal(await evaluate('document.querySelector(".playbar").getBoundingClientRect().height'),65,'Mobile footer must retain its native height');
  assert(await evaluate('document.querySelector(".edit-toggle").getBoundingClientRect().left>=document.getElementById("toc-button").getBoundingClientRect().right'),'Mobile editor button must also follow TOC on the right');
  await display(1920,1080,1.25);await view('results-module-example');
  fs.writeFileSync(path.join(artifacts,'exact-font-sizes.json'),JSON.stringify(exact,null,2));
  pass('base-size editing, individual font overrides, rerendering, print, saved settings, long scrolling and black article outlines are preserved');
  pass('scaled navigation accepts real pointer clicks; mobile navigation retains its original heights');
  const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'normalized-fonts.png'),Buffer.from(shot.data,'base64'));
};
