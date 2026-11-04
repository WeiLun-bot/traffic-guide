'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=require('../materials/00-計畫緣起/modular-rationale-source.json');
module.exports=async function({evaluate,view,navigate,click,cdp,base,artifacts,pass,previewConfigPath,editText}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),run=fn=>evaluate('('+fn.toString()+')()'),shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  try{
    await navigate(base+'/presentation-demo/#chapter-cover-results-modular');await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-modular-rationale');await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-module-definition');await click('#previous');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-modular-rationale');
    assert.equal(await run(()=>document.getElementById('slide-title').textContent),source.title);
    const expected=source.sections.flatMap(section=>[section.title,...section.paragraphs.map(p=>p.text)]);assert.deepEqual(await run(()=>[...document.querySelectorAll('.results-rationale [data-block-edit-key]')].map(node=>node.textContent)),expected);
    const photos=await run(async()=>{const result=[];for(const node of document.querySelectorAll('.rationale-photo image')){const image=new Image();image.src=node.getAttribute('href');await image.decode();result.push({src:decodeURI(node.getAttribute('href')),width:image.naturalWidth,height:image.naturalHeight});}return result;});assert.deepEqual(photos,Object.values(source.images).map(image=>({src:image.file,width:image.width,height:image.height})));
    for(const [width,height]of [[1366,768],[1280,720],[1920,1080],[390,844]]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await view('results-modular-rationale');
      const bounds=await run(()=>({overflow:document.documentElement.scrollWidth-innerWidth,main:document.getElementById('presentation').scrollHeight-document.getElementById('presentation').clientHeight,photos:[...document.querySelectorAll('.rationale-photo')].map(node=>node.getBoundingClientRect().height),panels:[...document.querySelectorAll('.rationale-panel')].map(node=>node.scrollHeight-node.clientHeight)}));
      assert(bounds.overflow<=1,JSON.stringify({width,bounds}));assert(bounds.photos.every(height=>height>70),JSON.stringify({width,bounds}));if(width>900)assert(bounds.main<=2&&bounds.panels.every(height=>height<=2),JSON.stringify({width,bounds}));await shot('modular-rationale-'+width);
    }
    await click('.rationale-example [data-asset]');assert(await run(()=>document.getElementById('asset-dialog').open));await run(()=>document.getElementById('asset-dialog').close());
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});await view('results-modular-rationale');await click('.edit-toggle');await editText('.rationale-cause p','測試問題根源文字');await click('[data-vl-action="undo"]');assert.equal(await run(()=>document.querySelector('.rationale-cause p').textContent),source.sections[1].paragraphs[0].text);await click('[data-vl-action="redo"]');fs.writeFileSync(previewConfigPath,await run(()=>window.visualLayoutEditor.store.serialize()));await navigate(base+'/presentation-demo/#results-modular-rationale');assert.equal(await run(()=>document.querySelector('.rationale-cause p').textContent),'測試問題根源文字');
    pass('original rationale title, all three sections and both photos appear between the scenario and module tables, fit desktop/phone layouts, and support original-image viewing and editable text with saved reload');
  }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
