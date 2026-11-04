'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async function({evaluate,view,navigate,click,editText,base,pass,previewConfigPath}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),compact=text=>text.replace(/\s+/g,'');
  const label=()=>evaluate('({text:document.getElementById("next-label").textContent,title:document.getElementById("next").title,aria:document.getElementById("next").getAttribute("aria-label"),width:document.getElementById("next").getBoundingClientRect().width})');
  async function follow(id,phase=0){
    await view(id,phase);const before=await label();assert.equal(before.title,before.text);assert.equal(before.aria,before.text);
    await click('#next');const after=await evaluate('({id:window.generalRoadPresentation.page.id,title:document.getElementById("slide-title").textContent})');
    assert.equal(compact(before.text),compact(after.title),'Next button on '+id+' must name the actual destination '+after.id);assert.equal((await label()).width,before.width);return after;
  }
  async function predecessor(id){return evaluate(`(()=>{const p=window.generalRoadPresentation.pages,index=p.findIndex(p=>p.id===${JSON.stringify(id)});return p[index-1].id})()`);}
  try{
    await navigate(base+'/presentation-demo/#results-intro');
    for(const id of ['results-intro','results-outline','results-principles','results-module-m3-04','cover','contents','context','overview','m201-overview','m201-stop-issues','complex-intro','chapter-cover-results-intro'])await follow(id);
    await follow('crosswalk',1);
    pass('Next buttons match actual destination headings across all four decks, saved source titles, module stages and skipped article preview stops; button widths stay fixed');
    await view('results-outline');await click('.edit-toggle');await editText('#slide-title','測試：修改後的簡報大綱');
    assert.equal((await follow(await predecessor('results-outline'))).title,'測試：修改後的簡報大綱');
    await view('results-phase-two');await editText('#slide-title','測試：修改後的情境架構表');
    assert.equal((await follow(await predecessor('results-phase-two'))).title,'測試：修改後的情境架構表');
    await click('#toc-button');const selector='#toc-content .toc-order-item:has([data-order-id="results-outline"]) [data-toc-order-move="1"]';
    const direction=await evaluate(`document.querySelector(${JSON.stringify(selector)}).disabled?-1:1`);
    await click('#toc-content .toc-order-item:has([data-order-id="results-outline"]) [data-toc-order-move="'+direction+'"]');await click('#toc-dialog [data-close]');
    assert.equal((await follow(await predecessor('results-outline'))).title,'測試：修改後的簡報大綱');
    fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));
    await navigate(base+'/presentation-demo/#results-intro');
    assert.equal((await follow(await predecessor('results-outline'))).title,'測試：修改後的簡報大綱');
    assert.equal((await follow(await predecessor('results-phase-two'))).title,'測試：修改後的情境架構表');
    pass('Edited titles using both results title keys stay synchronized before first visit, after TOC reordering, and after settings reload');
    await view('results-review-g1-01',0);const first=await label();assert.match(first.text,/下一組差異/);await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.state.phase'),1);
    const last=await evaluate('window.PresentationResults.stepCount(window.generalRoadPresentation.page)-1');await follow('results-review-g1-01',last);
    await view('overview');const previous=await evaluate('window.generalRoadPresentation.state.page');await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.state.phase'),1);await click('#previous');assert.equal(await evaluate('window.generalRoadPresentation.state.page'),previous);
    pass('Comparison substeps keep their action labels; finishing a comparison and previous/next article navigation reach the matching pages');
  }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
