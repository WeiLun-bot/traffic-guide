'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=async function({evaluate,view,navigate,click,cdp,base,artifacts,pass,previewConfigPath,editText}){
  const source=require('../materials/01-佈設原則/source.json'),original=fs.readFileSync(path.resolve(__dirname,'..',source.file));assert.equal(crypto.createHash('sha256').update(original).digest('hex'),source.sha256);
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),run=fn=>evaluate('('+fn.toString()+')()');
  const shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  try{
    await navigate(base+'/presentation-demo/#results-principles');
    const pages=await run(()=>window.generalRoadPresentation.pages.filter(page=>page.resultType==='principles').map(page=>({id:page.id,title:page.name})));
    assert.equal(pages.length,7);assert.equal(await run(()=>Number(document.getElementById('page-total').textContent)),122);
    for(const [width,height]of [[1366,768],[1280,720],[1920,1080]]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      for(const [index,page]of pages.entries()){
        await view(page.id);const actual=await run(()=>({title:document.getElementById('slide-title').textContent,paragraphs:[...document.querySelectorAll('.results-principles-document h2,.results-principles-document p')].map(node=>node.textContent),overflow:[document.documentElement.scrollWidth-innerWidth,document.getElementById('presentation').scrollHeight-document.getElementById('presentation').clientHeight,document.querySelector('.results-principles-document').scrollHeight-document.querySelector('.results-principles-document').clientHeight]}));
        assert.equal(actual.title,source.slides[index].title);assert.deepEqual(actual.paragraphs,source.slides[index].paragraphs,'All original paragraphs and numbering must remain in order: '+page.id);assert(actual.overflow.every(value=>value<=2),'Principles page needs scrolling or clips text at '+width+'x'+height+': '+page.id+' '+JSON.stringify(actual.overflow));
        if(width===1366)await shot('principles-'+(index+1));
      }
    }
    await view(pages[0].id);for(const page of pages.slice(1)){await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),page.id);}await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-modular');await click('#previous');assert.equal(await run(()=>window.generalRoadPresentation.page.id),pages.at(-1).id);
    await view('results-facilities');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-principles');
    pass('all seven supplied titles and 49 original body paragraphs retain exact text, numbering and order; each page fits desktop viewports and chapter navigation remains intact');
    await view(pages[3].id);await click('.edit-toggle');await editText('#slide-title','測試原則標題');await editText('.results-principles-paragraphs p','測試原則內文');await click('[data-vl-action="undo"]');assert.equal(await run(()=>document.querySelector('.results-principles-paragraphs p').textContent),source.slides[3].paragraphs[0]);await click('[data-vl-action="redo"]');
    fs.writeFileSync(previewConfigPath,await run(()=>window.visualLayoutEditor.store.serialize()));await navigate(base+'/presentation-demo/#'+pages[3].id);assert.equal(await run(()=>document.getElementById('slide-title').textContent),'測試原則標題');assert.equal(await run(()=>document.querySelector('.results-principles-paragraphs p').textContent),'測試原則內文');
    await view(pages[2].id);assert.equal(await run(()=>document.getElementById('slide-title').textContent),source.slides[2].title);
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    for(const page of pages){await view(page.id);assert(await run(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile page must fit width: '+page.id);}await view(pages[3].id);await shot('principles-dense-mobile');
    pass('original text remains editable with independent slide identities, undo/redo and JSON reload; all seven pages remain usable on phones');
  }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
