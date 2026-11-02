'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,cdp,base,artifacts,pass,previewConfigPath}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8');
  const run=(fn,...args)=>evaluate('('+fn.toString()+')(...'+JSON.stringify(args)+')');
  const signature=()=>run(()=>window.VisualLayoutCore.signature(window.visualLayoutEditor.store.config));
  const shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  const choose=(field,value)=>run((field,value)=>{const input=document.querySelector('.iv-panel:not([hidden]) [data-iv-field="'+field+'"]');input.value=String(value);input.dispatchEvent(new Event('change',{bubbles:true}));},field,value);
  const thumbnail=code=>run(code=>{const node=document.querySelector('[data-catalog-scenario="'+code+'"] .directory-card-visual');return {view:node.querySelector('svg').getAttribute('viewBox'),rotation:node.querySelector('[data-results-thumbnail-rotation]').getAttribute('transform'),source:node.querySelector('image').getAttribute('href'),page:node.querySelector('[data-thumbnail-page]').dataset.thumbnailPage};},code);
  try{
    await navigate(base+'/presentation-demo/#general-scenarios-index');const original=await signature();
    assert.equal(await run(()=>document.querySelectorAll('[data-catalog-scenario]').length),18);
    assert.equal(await run(()=>document.querySelectorAll('.directory-card-visual image').length),18);
    assert.equal(await run(()=>document.querySelectorAll('.directory-card small.is-ready').length),0);
    assert.deepEqual(await run(()=>[...document.querySelectorAll('[data-directory-group]')].map(node=>node.dataset.directoryGroup)),['G1','G2','G3','G4']);
    assert(await run(async()=>{const images=await Promise.all([...document.querySelectorAll('.directory-card-visual image')].map(async node=>{const image=new Image();image.src=node.getAttribute('href');await image.decode();return image.naturalWidth>0;}));return images.every(Boolean);}));
    assert(await run(()=>[...document.querySelectorAll('.directory-card-visual')].every(node=>node.getBoundingClientRect().height>=150)));
    for(const code of ['G1-01','G1-06','G2-04','G3-02','G4-04']){await click('[data-catalog-scenario="'+code+'"]');assert.equal(await run(()=>window.generalRoadPresentation.data.scenarios.find(scene=>scene.id===window.generalRoadPresentation.page.scenario).code),code);await click('.scenario-directory-switcher .scenario-back');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'general-scenarios-index');}
    await shot('general-directory-thumbnails');assert.equal(await signature(),original,'Browsing directory thumbnails must not change settings');
    pass('all 18 general scenarios show decoded full-layout thumbnails in G1–G4 groups, omit ready badges and retain their scenario routes');

    for(const [code,rotation]of [['G1-01',33],['G1-06',-90]]){
      await view('general-scenarios-index');const source=await thumbnail(code);await view(source.page);await click('.iv-trigger');
      for(const [field,value]of [['zoom',165],['x',7],['y',-4],['rotation',rotation]])await choose(field,value);
      await click('.iv-panel:not([hidden]) [data-iv-action="close"]');
      const actual=await run(()=>{const svg=document.querySelector('.results-map-card svg.results-diagram');return {view:svg.getAttribute('viewBox'),rotation:svg.querySelector('[data-initial-view-rotation]').getAttribute('transform'),source:svg.querySelector('image').getAttribute('href')};});
      await view('general-scenarios-index');const changed=await thumbnail(code);assert.equal(changed.view,actual.view);assert.equal(changed.rotation,actual.rotation);assert.equal(changed.source,actual.source);
      await view('results-general');assert.equal(await run(code=>document.querySelector('[data-results-scenario="'+code+'"] svg').getAttribute('viewBox'),code),changed.view);
    }
    await view('general-scenarios-index');const saved=await thumbnail('G1-06');fs.writeFileSync(previewConfigPath,await run(()=>window.visualLayoutEditor.store.serialize()));await navigate(base+'/presentation-demo/#general-scenarios-index');assert.deepEqual(await thumbnail('G1-06'),saved);
    await shot('general-directory-saved-views');
    pass('thumbnails exactly match the saved initial zoom, offsets, rotation and source of the full-layout slides; both directories stay consistent after JSON reload');

    const beforeSizes=await signature();
    for(const [width,height]of [[1920,1080],[1280,720],[390,844]]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await view('general-scenarios-index');
      assert(await run(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await run(()=>[...document.querySelectorAll('.directory-card')].every(node=>node.scrollWidth<=node.clientWidth+1)));
      if(width===390)await shot('general-directory-thumbnails-mobile');
    }
    assert.equal(await signature(),beforeSizes);await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await view('complex-intro');assert.equal(await run(()=>document.querySelectorAll('[data-catalog-scenario]').length),18);assert.equal(await run(()=>document.querySelectorAll('.directory-card-visual').length),0);assert.equal(await run(()=>document.querySelectorAll('.directory-card small').length),18);
    pass('directory thumbnails fit desktop and mobile widths without changing camera settings; complex-scenario placeholders remain intact');
  }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
