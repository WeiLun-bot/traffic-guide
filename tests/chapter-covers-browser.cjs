'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const manifest=require('../data/presentations.json');
module.exports=async function({evaluate,view,navigate,click,cdp,base,artifacts,pass,previewConfigPath,editText}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),fixture=JSON.parse(baseline);fixture.legacyState.pageOrder=fixture.legacyState.pageOrder.filter(id=>!id.startsWith('chapter-cover-'));for(const id of Object.keys(fixture.legacyState.texts))if(id.startsWith('chapter-cover-'))delete fixture.legacyState.texts[id];fs.writeFileSync(previewConfigPath,JSON.stringify(fixture));
  const run=fn=>evaluate('('+fn.toString()+')()'),shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  try{
    await navigate(base+'/presentation-demo/#presentations');const covers=await run(()=>window.generalRoadPresentation.pages.filter(page=>page.kind==='chapter-cover').map(page=>({id:page.id,chapter:page.chapter,deck:page.deckId})));assert.equal(covers.length,23);assert.equal(new Set(covers.map(page=>page.id)).size,23);
    for(const deck of manifest.presentations){
      await click('.presentation-picker-menu [data-deck="'+deck.id+'"]');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'chapter-cover-'+deck.chapters[0].id);
      for(const chapter of deck.chapters){
        await click('#lecture-chapters [data-chapter="'+chapter.id+'"]');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'chapter-cover-'+chapter.id);assert.equal(await run(()=>document.getElementById('slide-title').textContent),chapter.name);assert.equal(await run(()=>document.querySelector('.chapter-cover-code').textContent),chapter.code);assert.deepEqual(await run(()=>window.PresentationRepository.requirements(window.generalRoadPresentation.page)),[]);
        const members=await evaluate('window.generalRoadPresentation.pages.filter(p=>p.chapter==='+JSON.stringify(chapter.id)+').map(p=>p.id)');assert.equal(members[0],'chapter-cover-'+chapter.id);assert(members.length>1);await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),members[1]);await click('#previous');assert.equal(await run(()=>window.generalRoadPresentation.page.id),members[0]);
      }
    }
    assert.equal(await run(()=>window.generalRoadPresentation.pages.filter(page=>page.deckId==='results').length),121);
    pass('all four presentations have 23 unique chapter covers; chapter tabs, deck entries and next/previous navigation lead into preserved content without detail requests');
    for(const [width,height]of [[1366,768],[1920,1080],[390,844]]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});for(const id of ['results-principles','modules-M3','g2','complex-c3']){
        await view('chapter-cover-'+id);assert(await run(()=>{const main=document.getElementById('presentation');return document.documentElement.scrollWidth<=innerWidth+1&&main.scrollHeight<=main.clientHeight+2;}),'Chapter cover must fit '+width+': '+id);if(id==='complex-c3')await shot('chapter-cover-'+width);
      }
    }
    const tabName=id=>evaluate('document.querySelector('+JSON.stringify('#lecture-chapters [data-chapter="'+id+'"]').concat(').title'));
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});await view('chapter-cover-results-review');await click('.edit-toggle');await editText('#slide-title','測試章節名稱');assert.equal(await tabName('results-review'),'測試章節名稱');await click('[data-vl-action="undo"]');assert.equal(await run(()=>document.getElementById('slide-title').textContent),'情境整體檢討');assert.equal(await tabName('results-review'),'情境整體檢討');await click('[data-vl-action="redo"]');assert.equal(await tabName('results-review'),'測試章節名稱');
    const renamed={'results-review':'情境圖例調整','modules-M3':'行人與公車模組','g2':'號誌化三岔情境','complex-c3':'公路與軌道交叉'};
    for(const [id,name]of Object.entries(renamed)){
      await view('chapter-cover-'+id);await run(()=>{window.__chapterTitleNode=document.getElementById('slide-title');window.__chapterTitleNode.focus();});await editText('#slide-title',name);assert.equal(await tabName(id),name);assert(await run(()=>window.__chapterTitleNode===document.getElementById('slide-title')&&window.__chapterTitleNode.isContentEditable),'Renaming must preserve the active editable title');
      assert.equal(await evaluate('document.querySelector('+JSON.stringify('#toc-content .toc-chapter[data-chapter="'+id+'"]').concat(').textContent.replace(/^\\d{2}/,"").trim()')),name);await click('#toc-button');assert.equal(await evaluate('document.querySelector('+JSON.stringify('#toc-content [data-page="chapter-cover-'+id+'"]').concat(').textContent')),name+'｜章節頁');await click('#toc-dialog [data-close]');
    }
    fs.writeFileSync(previewConfigPath,await run(()=>window.visualLayoutEditor.store.serialize()));await navigate(base+'/presentation-demo/#chapter-cover-results-review');assert.equal(await run(()=>document.getElementById('slide-title').textContent),renamed['results-review']);assert.equal(await run(()=>window.generalRoadPresentation.pages.filter(p=>p.kind==='chapter-cover').length),23);
    for(const [id,name]of Object.entries(renamed)){await view('chapter-cover-'+id);assert.equal(await tabName(id),name);assert.equal(await run(()=>document.getElementById('slide-title').textContent),name);}
    await view('results-outline');assert.equal(await run(()=>document.querySelector('.results-outline-menu [data-page="chapter-cover-results-review"] strong').textContent),renamed['results-review']);await view('presentations');assert(await run(()=>document.querySelector('.presentation-card[data-deck="results"] .presentation-chapter-preview').textContent.includes('情境圖例調整')));
    for(const chapter of manifest.presentations[0].chapters)assert.equal(await evaluate('window.generalRoadPresentation.pages.find(p=>p.chapter==='+JSON.stringify(chapter.id)+').kind'),'chapter-cover');
    pass('chapter covers fit desktop and phone layouts; edited chapter names update tabs, TOC, outline and deck preview immediately, survive undo/redo and settings reload, and preserve all page identities');
  }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
