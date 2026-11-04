'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const scenarios=require('../data/scenarios/catalog.json'),modules=require('../data/modules/catalog.json');
module.exports=async function({evaluate,view,navigate,click,cdp,base,artifacts,pass,previewConfigPath,editText}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),run=fn=>evaluate('('+fn.toString()+')()'),pages=['results-three-years','results-phase-two','results-phase-three'];
  const shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  try{
    await navigate(base+'/presentation-demo/#results-three-years');assert.equal(await run(()=>Number(document.getElementById('page-total').textContent)),120);
    for(const [index,id]of pages.entries()){
      await view(id);const expected=index<2?scenarios.scenarios.filter(scene=>scene.id.startsWith(index===0?'G':'C')).map(scene=>({id:scene.id,name:scene.name,group:scene.group})):modules.modules.map(module=>({id:module.id,name:module.name,group:module.theme}));
      const actual=await run(()=>[...document.querySelectorAll('[data-framework-row]')].map(row=>({id:row.dataset.frameworkRow,group:row.closest('tbody').dataset.frameworkGroup,text:row.textContent})));
      assert.deepEqual(actual.map(row=>({id:row.id,group:row.group})),expected.map(row=>({id:row.id,group:row.group})));for(const [i,row]of actual.entries()){assert(row.text.includes(expected[i].id));assert(row.text.includes(expected[i].name));}
      assert.equal(await run(()=>document.querySelectorAll('.framework-group').length),4);assert.equal(await run(()=>document.querySelectorAll('.results-framework-panel').length),2);
      assert((await run(()=>document.getElementById('slide-title').textContent)).startsWith(['第一期','第二期','第三期'][index]));
      if(index===1){assert(await run(()=>document.querySelector('[data-framework-row="C4-04"]').textContent.includes('路段中央分隔迴轉道')));assert(!await run(()=>document.querySelector('.results-framework-grid').textContent.includes('生活側道')));}
      if(index===2)assert.deepEqual(await run(()=>[...document.querySelectorAll('[data-framework-child]')].map(node=>({id:node.dataset.frameworkChild,text:node.textContent}))),modules.modules.flatMap(module=>module.submodules.map(child=>({id:child.id,text:child.id+' '+child.name}))));
    }
    await view(pages[0]);for(const id of [pages[1],'chapter-cover-results-modular','results-modular-rationale','results-module-definition','results-module-classification','results-module-hierarchy',pages[2],'results-guide-structure']){await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),id);}await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'chapter-cover-results-principles');await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-principles');await click('#previous');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'chapter-cover-results-principles');
    pass('three phase tables retain all 18 general and 18 complex scenario identities, four parent classifications, 15 modules and 27 current submodules without importing outdated source items');
    for(const [width,height]of [[1366,768],[1280,720],[2560,1440],[390,844]]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      for(const [index,id]of pages.entries()){
        await view(id);const overflow=await run(()=>({width:document.documentElement.scrollWidth-innerWidth,main:document.getElementById('presentation').scrollHeight-document.getElementById('presentation').clientHeight,panels:[...document.querySelectorAll('.results-framework-panel')].map(panel=>panel.scrollHeight-panel.clientHeight)}));
        assert(overflow.width<=1,'Framework overflows width '+width+': '+id);if(width>900)assert(overflow.main<=2&&overflow.panels.every(value=>value<=2),'Framework table must fit desktop without clipped rows: '+id+' '+width+' '+JSON.stringify(overflow));
        if(width===1366||width===390)await shot('phase-'+(index+1)+'-'+width);
      }
    }
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});await view(pages[0]);await click('.edit-toggle');await editText('[data-framework-row="G1-01"] td:last-child p','測試第一期架構表文字');await click('[data-vl-action="undo"]');assert.equal(await run(()=>document.querySelector('[data-framework-row="G1-01"] td:last-child p').textContent),scenarios.scenarios.find(scene=>scene.id==='G1-01').name);await click('[data-vl-action="redo"]');
    fs.writeFileSync(previewConfigPath,await run(()=>window.visualLayoutEditor.store.serialize()));await navigate(base+'/presentation-demo/#results-three-years');assert.equal(await run(()=>document.querySelector('[data-framework-row="G1-01"] td:last-child p').textContent),'測試第一期架構表文字');await navigate(base+'/presentation-demo/#results-phase-three');assert.equal(await run(()=>document.querySelectorAll('[data-framework-child]').length),27);
    pass('all three complete tables fit desktop and phone layouts; titles, classifications and table text retain shared editing, undo/redo, deep links and JSON persistence');
  }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
