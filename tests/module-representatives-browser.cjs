'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,view,navigate,click,cdp,base,artifacts,pass,wait,projectFixture})=>{
  const run=fn=>evaluate('('+fn.toString()+')()');await navigate(base+'/presentation-demo/#results-modules');
  const ids=['results-modules','results-modules-m2','results-modules-m3','results-modules-m3-2','results-modules-m4'],counts=[5,9,6,8,10],themes=['M1','M2','M3','M3','M4'],covered=new Set(),modules=new Set();
  for(let i=0;i<ids.length;i++){
    await view(ids[i]);assert.equal(await run(()=>window.generalRoadPresentation.page.moduleOverviewTheme),themes[i]);
    const cards=await run(()=>[...document.querySelectorAll('.results-representative-grid>.results-representative-card')].map(b=>({module:b.dataset.resultsModule,subs:b.dataset.resultsSubmodules.split(' '),asset:b.querySelector('[data-asset]').dataset.asset,src:b.querySelector('image')?.getAttribute('href')})));
    assert.equal(cards.length,counts[i]);for(const card of cards){modules.add(card.module);card.subs.forEach(s=>covered.add(s));assert(card.src&&!card.src.includes('undefined'));}
    for(const [width,height]of [[1600,1000],[1280,800]]){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await view(ids[i]);
      const bounds=await run(()=>{const root=document.getElementById('presentation');return {overflow:root.scrollHeight-root.clientHeight,x:document.documentElement.scrollWidth-innerWidth,cards:[...document.querySelectorAll('.results-representative-grid>.results-representative-card')].map(b=>({image:b.querySelector('.results-map-canvas').getBoundingClientRect().height,clipped:b.querySelector('.results-scenario-caption').getBoundingClientRect().bottom-b.getBoundingClientRect().bottom}))};});
      assert(bounds.overflow<=2&&bounds.x<=1,JSON.stringify({id:ids[i],width,bounds}));assert(bounds.cards.every(b=>b.image>=45&&b.clipped<=1),JSON.stringify({id:ids[i],width,bounds}));
      if(width===1600){const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'representatives-'+themes[i]+(i===3?'-2':'')+'.png'),Buffer.from(shot.data,'base64'));}
    }
    await click('.results-representative-card .representative-image-open');assert.equal(await run(()=>document.getElementById('asset-dialog').open),true);assert(await run(()=>document.querySelector('#asset-view svg image').getAttribute('href')));await click('#asset-dialog [data-close]');
    await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),ids[i+1]||'results-module-example');
  }
  assert.equal(modules.size,15);assert.equal(covered.size,27);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});await view(ids[0]);
  assert.equal(await run(()=>document.querySelector('.results-representative-card .results-scenario-caption small')),null);
  assert.equal(await run(()=>document.querySelector('.results-representative-card strong').textContent),'路口與路段車道配置');
  const original=await run(()=>[...document.querySelectorAll('.results-representative-card svg')].map(svg=>svg.getAttribute('viewBox')));
  await click('.edit-toggle');assert.equal(await run(()=>document.querySelectorAll('.results-representative-card .iv-trigger').length),5);await click('.results-representative-card .iv-trigger');
  await wait('document.querySelector(".iv-panel:not([hidden])")','Initial thumbnail controls did not open');
  const camera=await run(()=>{const panel=document.querySelector('.iv-panel:not([hidden])');for(const [field,value]of Object.entries({zoom:180,x:8,y:-6,rotation:90})){const input=panel.querySelector('[data-iv-field="'+field+'"]');input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));}const id=panel.dataset.imageViewId;return {id,view:window.visualLayoutEditor.store.config.imageViews[id]};});
  assert.equal(camera.view.zoom,1.8);assert.equal(camera.view.rotation,90);assert(camera.view.pageId.startsWith('results-representative-'));
  assert.deepEqual(await run(()=>[...document.querySelectorAll('.results-representative-card svg')].slice(1).map(svg=>svg.getAttribute('viewBox'))),original.slice(1),'Editing one thumbnail changed its neighbours');
  assert(await run(()=>document.querySelector('.results-representative-card [data-initial-view-rotation]').getAttribute('transform').includes('90')));
  await click('.iv-panel:not([hidden]) [data-iv-action="save"]');await wait('!window.visualLayoutEditor.busy&&!window.visualLayoutEditor.store.dirty','Thumbnail settings were not saved');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(projectFixture,'layout/presentation-layout.json'),'utf8')).imageViews[camera.id],camera.view);
  await click('.iv-panel:not([hidden]) [data-iv-action="close"]');await navigate(base+'/presentation-demo/#results-modules');
  assert.deepEqual(await run(()=>[...document.querySelectorAll('.results-representative-card svg')].slice(1).map(svg=>svg.getAttribute('viewBox'))),original.slice(1));
  assert.notEqual(await run(()=>document.querySelector('.results-representative-card svg').getAttribute('viewBox')),original[0]);
  assert(await run(()=>document.querySelector('.results-representative-card [data-initial-view-rotation]').getAttribute('transform').includes('90')));
  pass('Two-line captions show only variant differences; each thumbnail has independent zoom, position and rotation controls that survive a real save and reload');
  await view(ids[0]);await click('[data-page="results-modules-m3"]');assert.equal(await run(()=>window.generalRoadPresentation.page.id),ids[2]);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await view(ids[2]);assert(await run(()=>document.documentElement.scrollWidth<=innerWidth+1));
  pass('38 representative diagrams cover all 15 modules and 27 submodules across five overview pages; native next navigation, theme tabs, original-image zoom and 16:10 layout work');
};
