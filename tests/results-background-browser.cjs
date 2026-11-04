'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=async function({evaluate,view,navigate,click,cdp,base,artifacts,pass,previewConfigPath,editText}){
  const source=require('../materials/00-計畫緣起/source.json'),root=path.resolve(__dirname,'..'),digest=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');assert.equal(digest(source.file),source.sha256);assert.equal(digest(source.image.file),source.image.sha256);
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),run=fn=>evaluate('('+fn.toString()+')()'),shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  try{
    await navigate(base+'/presentation-demo/#results-background');
    assert.equal(await run(()=>document.getElementById('slide-title').textContent),source.title);assert.deepEqual(await run(()=>[...document.querySelectorAll('.results-background-content p')].map(node=>node.textContent)),[...source.lead,...source.body]);
    const image=await run(async()=>{const svg=document.querySelector('.results-diagram'),node=svg.querySelector('image'),image=new Image();image.src=node.getAttribute('href');await image.decode();return{src:decodeURI(node.getAttribute('href')),size:[image.naturalWidth,image.naturalHeight],viewport:svg.viewBox.baseVal.width/svg.viewBox.baseVal.height};});assert(image.src.endsWith(source.image.file));assert.deepEqual(image.size,[717,464]);
    for(const [width,height]of [[1366,768],[1280,720],[1920,1080]]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await view('results-background');
      assert(await run(()=>{const main=document.getElementById('presentation');return document.documentElement.scrollWidth-innerWidth<=1&&main.scrollHeight-main.clientHeight<=2;}),'The original text and figure must fit '+width+'x'+height);await shot('background-'+width);
    }
    await click('[data-asset="results:background-reference-framework"]');assert(await run(()=>document.getElementById('asset-dialog').open));await run(()=>document.getElementById('asset-dialog').close());
    await view('results-background');await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-three-years');await click('#previous');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-background');
    await click('.edit-toggle');await editText('.results-background-copy p','測試緣起文字編輯');fs.writeFileSync(previewConfigPath,await run(()=>window.visualLayoutEditor.store.serialize()));await navigate(base+'/presentation-demo/#results-background');assert.equal(await run(()=>document.querySelector('.results-background-copy p').textContent),'測試緣起文字編輯');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await view('results-background');assert(await run(()=>document.documentElement.scrollWidth<=innerWidth+1));await shot('background-mobile');
    pass('source title and all six paragraphs are preserved; the archived original SVG decodes, fits desktop/phone layouts and supports original-image viewing, text editing and saved reload');
  }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
