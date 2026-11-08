'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=async function({evaluate,view,navigate,click,wait,cdp,base,artifacts,pass,previewConfigPath}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8');
  // User-created frames add intentional preview steps; exercise the built-in sequence in isolation.
  const fixture=JSON.parse(baseline);
  for(const name of ['highlights','disabledHighlights'])for(const key of Object.keys(fixture.legacyState[name]))if(key.startsWith('module:modules-formation:'))delete fixture.legacyState[name][key];
  fs.writeFileSync(previewConfigPath,JSON.stringify(fixture));
  const formation=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/modules/formation.json'),'utf8')),stages=formation.stages,last=stages.length-1;
  const run=(fn,...args)=>evaluate('('+fn.toString()+')(...'+JSON.stringify(args)+')');
  const configurationSignature=async()=>crypto.createHash('sha256').update(await run(()=>window.VisualLayoutCore.signature(window.visualLayoutEditor.store.config))).digest('hex');
  const state=()=>run(()=>window.generalRoadPresentation.state);
  const shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  const key=async key=>{await run(()=>document.activeElement.blur());await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key});};
  const fullscreen=async enabled=>{
    if(await run(()=>Boolean(document.fullscreenElement))===enabled)return;
    await cdp.send('Runtime.evaluate',{expression:enabled?'document.documentElement.requestFullscreen()':'document.exitFullscreen()',userGesture:true,awaitPromise:true});
    await wait('Boolean(document.fullscreenElement)==='+enabled,'Real fullscreen transition failed');
  };
  const choose=async(selector,value)=>run((selector,value)=>{const input=document.querySelector(selector);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));},selector,String(value));
  try{
    await navigate(base+'/presentation-demo/#modules-structure');await click('#next');assert.equal((await state()).page,'modules-index');await click('#next');assert.deepEqual(await state(),{page:'modules-formation',phase:0,fullPeek:false});
    const total=await run(()=>document.getElementById('page-total').textContent),pageNumber=await run(()=>document.getElementById('page-number').textContent);
    assert.equal(await run(()=>document.querySelectorAll('[data-module-formation-theme]').length),4);
    assert.equal(await run(()=>document.querySelectorAll('.module-formation-aside').length),1);
    const standalone=await run(()=>document.querySelector('.module-formation-map').getBoundingClientRect().width);
    for(let index=0;index<stages.length;index++){
      if(index)await click('#next');const current=await state();assert.equal(current.page,'modules-formation');assert.equal(current.phase,index);
      assert.equal(await run(()=>document.getElementById('page-number').textContent),pageNumber);assert.equal(await run(()=>document.getElementById('page-total').textContent),total);
      const expectedTheme=stages[index].moduleId?.slice(0,2)||null;assert.equal(await run(()=>document.querySelector('[data-module-formation-theme][aria-current=step]')?.dataset.moduleFormationTheme||null),expectedTheme);
      assert(await run(async file=>{const node=document.querySelector('.module-formation-map image'),image=new Image();image.src=node.getAttribute('href');await image.decode();return image.naturalWidth>0&&image.src.endsWith(file);},formation.assets[stages[index].asset].file));
      assert.equal(await run(()=>document.querySelector('.module-formation-map svg').getAttribute('preserveAspectRatio')),'xMidYMid meet');
      assert.equal(await run(()=>document.querySelectorAll('.module-formation-map .iv-trigger').length),1);
      if(index){
        assert.equal(await run(()=>document.querySelector('.module-formation-aside [data-formation-member].is-current').dataset.formationMember),stages[index].moduleId);
        assert.equal(await run(()=>document.querySelectorAll('.module-formation-theme-detail:not([hidden])').length),1);
        assert(await run(width=>Math.abs(document.querySelector('.module-formation-map').getBoundingClientRect().width-width)<1,standalone));
      }
      await shot('module-formation-stage-'+(index+1));
    }
    await key('ArrowLeft');assert.equal((await state()).phase,last-1);await key('ArrowRight');assert.equal((await state()).phase,last);const nextTitle=await run(()=>document.getElementById('next-label').textContent);await click('#next');assert.equal((await state()).page,'modules-explanation-order');assert.equal(await run(()=>document.getElementById('slide-title').textContent),nextTitle);await click('#previous');assert.equal((await state()).phase,last);assert.equal((await state()).page,'modules-formation');
    await click('.module-formation-stage-controls [data-module-formation-step="0"]');assert.equal((await state()).phase,0);await click('[data-module-formation-theme="M1"]');await click('.module-formation-stage-controls [aria-label="下一張道路圖"]');assert.equal((await state()).phase,2);assert.equal(await run(()=>location.hash),'#modules-formation/step-2');
    await navigate(base+'/presentation-demo/#modules-formation/step-2');assert.equal((await state()).phase,2);assert.equal(await run(()=>document.querySelector('.module-formation-aside [data-formation-member].is-current').dataset.formationMember),'M1-02');
    await click('#toc-button');assert.equal(await run(()=>document.querySelectorAll('[data-toc-presentation=modules] [data-page=modules-formation]').length),1);assert(await run(()=>Boolean(document.querySelector('[data-toc-presentation=modules] [data-page=modules-index]').compareDocumentPosition(document.querySelector('[data-toc-presentation=modules] [data-page=modules-formation]'))&Node.DOCUMENT_POSITION_FOLLOWING)));await run(()=>document.getElementById('toc-dialog').close());
    pass('all ten intro stages use the requested eight drawings and four grouped theme buttons, including three separate 7.svg stages; footer, keyboard, stage buttons, deep links and contents all agree');

    const saved=await configurationSignature();
    for(const [width,height]of [[1464,915],[1280,800]]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1.75,mobile:false});await fullscreen(true);
      for(let phase=0;phase<stages.length;phase++){
        await view('modules-formation',phase);
        const fit=await run(()=>{
          const main=document.querySelector('main'),bounds=main.getBoundingClientRect(),image=document.querySelector('.module-formation-map'),aside=document.querySelector('.module-formation-aside'),box=image.getBoundingClientRect();
          return {overflow:main.scrollHeight-main.clientHeight,horizontal:document.documentElement.scrollWidth-innerWidth,top:box.top-bounds.top,bottom:box.bottom-bounds.bottom,height:box.height,aside:aside.scrollHeight-aside.clientHeight,ratio:box.width/(box.width+aside.getBoundingClientRect().width)};
        });assert(fit.overflow<=1&&fit.horizontal<=1&&fit.top>=-1&&fit.bottom<=1&&fit.height>250&&fit.aside<=1&&Math.abs(fit.ratio-.65)<.005,'Formation must fit '+width+'x'+height+', phase '+phase+': '+JSON.stringify(fit));
      }
      if(width===1464)await shot('module-formation-fullscreen-1464');await fullscreen(false);
    }
    assert.equal(await configurationSignature(),saved,'Presentation steps must not overwrite saved configuration');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    for(let phase=0;phase<stages.length;phase++){await view('modules-formation',phase);assert(await run(()=>document.documentElement.scrollWidth<=innerWidth+1));}
    await shot('module-formation-mobile');await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    pass('all ten stages fit the 65/35 layout in real fullscreen at both 16:10 sizes; mobile stacks naturally and presentation controls leave saved settings untouched');

    await view('modules-formation',1);await click('.iv-trigger');await choose('.iv-panel:not([hidden]) [data-iv-field="zoom"]',120);await click('.iv-panel:not([hidden]) [data-iv-action="close"]');
    assert(await run(()=>Object.values(window.visualLayoutEditor.store.config.imageViews).some(view=>view.pageId==='modules-formation'&&view.assetKey==='module:formation-lanes'&&view.zoom===1.2)));
    fs.writeFileSync(previewConfigPath,await run(()=>window.visualLayoutEditor.store.serialize()));await navigate(base+'/presentation-demo/#modules-formation/step-1');
    assert(await run(()=>Object.values(window.visualLayoutEditor.store.config.imageViews).some(view=>view.pageId==='modules-formation'&&view.assetKey==='module:formation-lanes'&&view.zoom===1.2)));
    await view('modules-formation',0);assert.deepEqual(await run(()=>window.visualLayoutEditor.store.config.imageViews['modules-formation/module%3Aformation-base']),fixture.imageViews['modules-formation/module%3Aformation-base']);
    await view('modules-formation',1);await click('.edit-toggle');assert.equal(await run(()=>document.querySelectorAll('.module-formation-map [data-replace-image]').length),1);await click('.edit-toggle');
    await click('[data-module-formation-theme="M1"]');assert.equal((await state()).phase,1);
    pass('each source drawing retains its own editable image and saved initial view; theme buttons select their first matching drawing');

    const initialView=()=>run(()=>{const svg=document.querySelector('.module-formation-map svg'),asset=PresentationModules.formation.assets[PresentationModules.formation.stages[generalRoadPresentation.state.phase].asset],key='module:'+PresentationModules.formation.stages[generalRoadPresentation.state.phase].asset,defaults=VisualLayoutCore.imageView('modules-formation',key),settings=visualLayoutEditor.store.config.imageViews[defaults.id]||defaults;return {actual:generalRoadViewport.get(svg).read(),expected:VisualLayoutCore.viewBoxFor([0,0,asset.width,asset.height],settings),crop:typeof generalRoadPresentation.editorFrames()[0].getCrop,buttons:document.querySelectorAll('[data-formation-focus]').length};});
    for(const phase of [6,7,8,9]){await view('modules-formation',phase);const image=await initialView();assert.deepEqual(image.actual,image.expected);assert.equal(image.crop,'undefined');assert.equal(image.buttons,0);if(phase<9){await click('#next');assert.equal((await state()).phase,phase+1,'Next must advance directly without a zoom step');}}
    await view('modules-formation',7);await key('ArrowRight');assert.equal((await state()).phase,8);await key('ArrowLeft');assert.equal((await state()).phase,7);
    pass('shared-image stages retain their saved initial views and original highlights; buttons and keyboard advance directly without automatic zoom or crop controls');
    await view('modules-formation',5);const unchanged=await configurationSignature();
    for(const [theme,phase]of [['M1',1],['M2',4],['M3',6],['M4',9]]){await click('[data-module-formation-theme="'+theme+'"]');assert.equal((await state()).phase,phase);assert.equal(await run(()=>document.querySelector('.module-formation-theme.active').dataset.moduleFormationTheme),theme);}
    assert.equal(await run(()=>document.querySelectorAll('.module-formation-theme-detail:not([hidden])').length),1);assert.equal(await configurationSignature(),unchanged);
    pass('each theme opens its first drawing; only that theme expands and browsing leaves saved settings unchanged');
  }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
