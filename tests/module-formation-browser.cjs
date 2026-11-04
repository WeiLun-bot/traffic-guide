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
    const p=await run(()=>{const r=document.getElementById('fullscreen-button').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});
    await wait('Boolean(document.fullscreenElement)==='+enabled,'Real fullscreen transition failed');
  };
  const choose=async(selector,value)=>run((selector,value)=>{const input=document.querySelector(selector);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));},selector,String(value));
  try{
    await navigate(base+'/presentation-demo/#modules-structure');await click('#next');assert.equal((await state()).page,'modules-index');await click('#next');assert.deepEqual(await state(),{page:'modules-formation',phase:0,fullPeek:false});
    const total=await run(()=>document.getElementById('page-total').textContent),pageNumber=await run(()=>document.getElementById('page-number').textContent);
    assert.equal(await run(()=>document.querySelectorAll('[data-module-formation-step]').length),stages.length);
    assert.equal(await run(()=>document.querySelectorAll('.module-formation-aside').length),0);
    const standalone=await run(()=>document.querySelector('.module-formation-map').getBoundingClientRect().width);
    for(let index=0;index<stages.length;index++){
      if(index)await click('#next');const current=await state();assert.equal(current.page,'modules-formation');assert.equal(current.phase,index);
      assert.equal(await run(()=>document.getElementById('page-number').textContent),pageNumber);assert.equal(await run(()=>document.getElementById('page-total').textContent),total);
      assert.equal(await run(()=>document.querySelector('[data-module-formation-step][aria-current=step]').dataset.moduleFormationStep),String(index));
      assert(await run(async file=>{const node=document.querySelector('.module-formation-map image'),image=new Image();image.src=node.getAttribute('href');await image.decode();return image.naturalWidth>0&&image.src.endsWith(file);},formation.assets[stages[index].asset].file));
      assert.equal(await run(()=>document.querySelector('.module-formation-map svg').getAttribute('preserveAspectRatio')),'xMidYMid meet');
      assert.equal(await run(()=>document.querySelectorAll('.module-formation-map .iv-trigger').length),1);
      if(index){
        assert.equal(await run(()=>document.querySelector('.module-formation-aside [data-directory-module]').dataset.directoryModule),stages[index].moduleId);
        assert.equal(await run(()=>document.querySelectorAll('.module-formation-aside [data-directory-asset]').length),await run(id=>window.PresentationModules.directoryAssets(id).length,stages[index].moduleId));
        assert(await run(width=>document.querySelector('.module-formation-map').getBoundingClientRect().width<width,standalone));
      }
      await shot('module-formation-stage-'+(index+1));
    }
    await key('ArrowLeft');assert.equal((await state()).phase,last-1);await key('ArrowRight');assert.equal((await state()).phase,last);const nextTitle=await run(()=>document.getElementById('next-label').textContent);await click('#next');assert.equal((await state()).page,'chapter-cover-modules-M1');assert.equal(await run(()=>document.getElementById('slide-title').textContent),nextTitle);await click('#previous');assert.equal((await state()).phase,last);assert.equal((await state()).page,'modules-formation');
    await click('[data-module-formation-step="0"]');assert.equal((await state()).phase,0);await click('[data-module-formation-step="2"]');assert.equal((await state()).phase,2);assert.equal(await run(()=>location.hash),'#modules-formation/step-2');
    await navigate(base+'/presentation-demo/#modules-formation/step-2');assert.equal((await state()).phase,2);assert.equal(await run(()=>document.querySelector('.module-formation-aside [data-directory-module]').dataset.directoryModule),'M1-02');
    await click('#toc-button');assert.equal(await run(()=>document.querySelectorAll('[data-toc-presentation=modules] [data-page=modules-formation]').length),1);assert(await run(()=>Boolean(document.querySelector('[data-toc-presentation=modules] [data-page=modules-index]').compareDocumentPosition(document.querySelector('[data-toc-presentation=modules] [data-page=modules-formation]'))&Node.DOCUMENT_POSITION_FOLLOWING)));await run(()=>document.getElementById('toc-dialog').close());
    pass('all ten intro stages use the requested eight drawings and module cards, including three separate 7.svg stages; footer, keyboard, stage buttons, deep links and contents all agree');

    const saved=await configurationSignature();
    for(const [width,height]of [[1920,1080],[1366,768],[1280,720]]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await fullscreen(true);
      for(let phase=0;phase<stages.length;phase++){
        await view('modules-formation',phase);
        assert(await run(()=>{
          const main=document.querySelector('main'),bounds=main.getBoundingClientRect(),image=document.querySelector('.module-formation-map'),card=document.querySelector('.module-formation-aside .module-catalog-card'),box=image.getBoundingClientRect();
          return main.scrollHeight<=main.clientHeight+1&&document.documentElement.scrollWidth<=innerWidth+1&&box.top>=bounds.top&&box.bottom<=bounds.bottom+1&&box.height>250&&(!card||card.scrollHeight<=card.clientHeight+1);
        }),'Formation must fit one fullscreen viewport: '+width+'x'+height+', phase '+phase);
      }
      if(width===1366)await shot('module-formation-fullscreen-1366');await fullscreen(false);
    }
    assert.equal(await configurationSignature(),saved,'Presentation steps must not overwrite saved configuration');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    for(let phase=0;phase<stages.length;phase++){await view('modules-formation',phase);assert(await run(()=>document.documentElement.scrollWidth<=innerWidth+1));}
    await shot('module-formation-mobile');await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    pass('all ten stages fit in real fullscreen at three desktop sizes; mobile stacks naturally and presentation controls leave saved settings untouched');

    await view('modules-formation',1);await click('.iv-trigger');await choose('.iv-panel:not([hidden]) [data-iv-field="zoom"]',120);await click('.iv-panel:not([hidden]) [data-iv-action="close"]');
    assert(await run(()=>Object.values(window.visualLayoutEditor.store.config.imageViews).some(view=>view.pageId==='modules-formation'&&view.assetKey==='module:formation-lanes'&&view.zoom===1.2)));
    fs.writeFileSync(previewConfigPath,await run(()=>window.visualLayoutEditor.store.serialize()));await navigate(base+'/presentation-demo/#modules-formation/step-1');
    assert(await run(()=>Object.values(window.visualLayoutEditor.store.config.imageViews).some(view=>view.pageId==='modules-formation'&&view.assetKey==='module:formation-lanes'&&view.zoom===1.2)));
    await view('modules-formation',0);assert(await run(()=>!Object.values(window.visualLayoutEditor.store.config.imageViews).some(view=>view.pageId==='modules-formation'&&view.assetKey==='module:formation-base'&&view.zoom!==1)));
    await view('modules-formation',1);await click('.edit-toggle');assert.equal(await run(()=>document.querySelectorAll('.module-formation-map [data-replace-image]').length),1);await click('.edit-toggle');
    await click('.module-formation-aside [data-directory-module=M1-01]');assert.equal((await state()).page,'m101-overview');
    pass('each source drawing retains its own editable image and saved initial view; module cards still open their complete explanation');

    const camera=()=>run(()=>window.generalRoadViewport.get(document.querySelector('.module-formation-map svg')).read());
    const frame=()=>run(()=>{const frame=window.generalRoadPresentation.editorFrames()[0];return {key:frame.key,box:frame.getBox(),crop:frame.getCrop(),angle:window.generalRoadEditor.rotation(frame.key)};});
    const focused=()=>run(()=>document.querySelector('[data-formation-focus=toggle]').getAttribute('aria-pressed')==='true');
    const settled=async()=>{
      const expected=await run(()=>{
        const frame=window.generalRoadPresentation.editorFrames()[0],svg=frame.element,[x,y,w,h]=frame.getCrop(),matrix=svg.getScreenCTM().inverse().multiply(frame.coordinateElement.getScreenCTM()),points=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix)),xs=points.map(p=>p.x),ys=points.map(p=>p.y),view=[Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)],ratio=svg.clientWidth/svg.clientHeight;
        if(view[2]/view[3]>ratio){const height=view[2]/ratio;view[1]-=(height-view[3])/2;view[3]=height;}else{const width=view[3]*ratio;view[0]-=(width-view[2])/2;view[2]=width;}return view;
      });
      await wait('window.generalRoadViewport.get(document.querySelector(".module-formation-map svg")).read().every((value,index)=>Math.abs(value-'+JSON.stringify(expected)+'[index])<.1)','Automatic focus did not reach its saved crop');
    };
    await view('modules-formation',6);assert.equal(await focused(),false);const full=await camera();await click('#next');assert.equal((await state()).phase,7);assert(await focused());await settled();const bicycle=await frame(),bicycleView=await camera();assert(bicycleView[2]<full[2]*.7);
    const start=await run(()=>{window.generalRoadPresentation.goPage('modules-formation',8);return window.generalRoadViewport.get(document.querySelector('.module-formation-map svg')).read();});
    start.forEach((value,index)=>assert(Math.abs(value-bicycleView[index])<.1,'Shared-image transition should start from the previous zoom, without a full-view flash'));
    assert(await focused());await settled();const motorcycle=await frame();assert.notEqual(motorcycle.key,bicycle.key);assert.notDeepEqual(motorcycle.crop,bicycle.crop);assert.notDeepEqual(await camera(),bicycleView);
    await shot('module-formation-motorcycle-focus');await click('#next');assert.equal((await state()).phase,9);assert.equal(await focused(),false);await shot('module-formation-warning');
    pass('7.svg starts full for pedestrians, automatically zooms for bicycles, then pans directly to a distinct motorcycle crop; 8.svg returns to the full drawing');

    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await view('modules-formation',7);await settled();await click('.edit-toggle');await click('.editor-highlight');await choose('[data-bound-index="0"]',bicycle.box[0]+20);await choose('[data-highlight-rotation]',11);await choose('[data-frame-target]','crop');await choose('[data-bound-index="0"]',bicycle.crop[0]+20);const edited=await frame();await click('.edit-toggle');await settled();
    await view('modules-formation',8);assert.deepEqual(await frame(),motorcycle,'Editing the bicycle focus must leave the motorcycle frame untouched');await settled();
    await view('modules-formation',6);assert.equal(await focused(),false);assert.equal(await run(()=>document.querySelectorAll('.module-focus-rect').length),0);
    await view('modules-formation',7);await click('.edit-toggle');await click('.editor-highlight');await click('[data-toggle-module-frame]');await click('.edit-toggle');assert.equal(await focused(),false);await click('#next');assert.equal((await state()).phase,8);assert(await focused());
    await view('modules-formation',7);await click('.edit-toggle');await click('.editor-highlight');await click('[data-toggle-module-frame]');await click('.edit-toggle');await settled();assert.deepEqual(await frame(),edited);
    fs.writeFileSync(previewConfigPath,await run(()=>window.visualLayoutEditor.store.serialize()));await navigate(base+'/presentation-demo/#modules-formation/step-7');assert(await focused());await settled();assert.deepEqual(await frame(),edited);await view('modules-formation',8);await settled();assert.deepEqual(await frame(),motorcycle);
    pass('shared drawing stages retain separate editable boxes, angles, crops and deletion state across JSON reload, with existing first-four-stage settings preserved');

    await view('modules-formation',5);const unchanged=await configurationSignature(),leftView=await camera();
    const sidebar=await run(()=>{const node=document.querySelector('.module-formation-aside'),rect=node.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,height:node.clientHeight,scrollHeight:node.scrollHeight,thumbnailHeight:node.querySelector('.module-catalog-thumbnail').getBoundingClientRect().height};});
    assert(sidebar.thumbnailHeight>=240,'Formation representatives must remain large rather than shrink to fit');assert(sidebar.scrollHeight>sidebar.height+300,'Multiple representatives should scroll inside the right panel');
    await shot('module-formation-large-representatives');
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:sidebar.x,y:sidebar.y,deltaX:0,deltaY:10000});await wait('document.querySelector(".module-formation-aside").scrollTop>100','Mouse wheel did not scroll the right panel');
    assert(await run(()=>{const panel=document.querySelector('.module-formation-aside'),last=panel.querySelector('.module-catalog-figure:last-child').getBoundingClientRect(),rect=panel.getBoundingClientRect();return last.bottom<=rect.bottom+1&&document.querySelector('main').scrollTop===0;}),'Wheel should reveal the last representative while the presentation stays fixed');
    assert.deepEqual(await camera(),leftView);assert.equal((await state()).phase,5);assert.equal(await configurationSignature(),unchanged);await shot('module-formation-large-representatives-bottom');
    pass('large right-side representatives scroll to the final image with a real mouse wheel while the left camera, stage and saved settings stay unchanged');
  }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
