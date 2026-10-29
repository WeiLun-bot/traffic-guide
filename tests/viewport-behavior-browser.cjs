'use strict';
const assert=require('node:assert/strict');
module.exports=async({evaluate,view,navigate,click,cdp,base,pass})=>{
  await navigate(base+'/presentation-demo/#cover');
  const articles=await evaluate('window.generalRoadPresentation.data.articles.map(article=>article.id)');
  for(const id of articles){
    await view(id,1);
    const expected=await evaluate('window.generalRoadPresentation.displayBounds(window.generalRoadPresentation.page.article.crop)');
    await evaluate('window.viewportTest=window.generalRoadViewport.get(document.getElementById("main-map"))');
    assert.equal(await evaluate('Boolean(document.querySelector(".minimap"))'),false);
    await evaluate('viewportTest.write((()=>{const v=viewportTest.read();v[0]+=35;v[1]-=20;return v})())');
    await click('.map-canvas .viewport-tools button');
    assert.deepEqual(await evaluate('viewportTest.read()'),expected,id+' reset must restore its article crop');
    await click('#peek-map');
    const full=await evaluate('window.generalRoadPresentation.fullView');
    assert.deepEqual(await evaluate('viewportTest.read()'),full);
    assert.equal(await evaluate('document.getElementById("map-shade").style.opacity'),'0');
    assert.equal(await evaluate('document.getElementById("peek-map").hidden'),true);
    await evaluate('viewportTest.write((()=>{const v=viewportTest.read();v[0]+=40;return v})())');
    assert.equal(await evaluate('document.getElementById("map-status").textContent'),'位置已偏移');
    assert.equal(await evaluate('document.getElementById("peek-map").hidden'),false);
    assert.equal(await evaluate('document.getElementById("zoom-label").hidden'),true);
    await click('#peek-map');
    await evaluate('viewportTest.write((()=>{const v=viewportTest.read();return [v[0]-v[2]/2+20,v[1]-v[3]/2,v[2]*2,v[3]*2]})())');
    assert.equal(await evaluate('document.getElementById("map-status").textContent'),'縮小檢視');
    assert.equal(await evaluate('document.getElementById("zoom-label").hidden'),true);
    assert.equal(await evaluate('document.getElementById("peek-map").hidden'),false);
    await click('.map-canvas .viewport-tools button');
    assert.deepEqual(await evaluate('viewportTest.read()'),expected);
    if(expected[2]<full[2])assert.equal(await evaluate('document.getElementById("map-status").textContent'),'局部放大');
    const label=await evaluate('document.querySelector(".explain-topline .tag").textContent');
    if(await evaluate('!window.generalRoadPresentation.page.article.reference'))assert.match(label,/^《設置規則》§ \d/);
    assert.equal(await evaluate('!![...document.querySelectorAll(".article-chip span")].find(node=>/§(?! \\d)/.test(node.textContent))'),false);
  }
  pass('all 26 article pages restore their crop, keep full view unshaded, distinguish zoom from pan and format references');
  const scenes=await evaluate('window.generalRoadPresentation.data.scenarios.map(scene=>({before:scene.currentConditions.pageId,after:scene.overviewId}))');
  for(const scene of scenes){
    await view(scene.before);
    assert.equal(await evaluate('Boolean(document.querySelector(".conditions-current-diagram"))'),true);
    assert.equal(await evaluate('Boolean(document.querySelector(".compare-stage"))'),false);
    await view(scene.after);
    assert.equal(await evaluate('document.querySelector(".compare-range").value'),'0');
    assert.equal(await evaluate('document.querySelector(".compare-stage").classList.contains("compare-only-after")'),true);
    assert.equal(await evaluate('!![...document.querySelectorAll(".strategy-refs,.overview-list small")].find(node=>/§(?! \\d)/.test(node.textContent))'),false);
    await click('[data-compare-position="50"]');
    await evaluate('window.viewportTest=window.generalRoadViewport.get(document.querySelector(".compare-after"));viewportTest.write((()=>{const v=viewportTest.read();v[0]+=30;return v})())');
    assert.equal(await evaluate('document.querySelector(".conditions-comparison .map-status").textContent'),'位置已偏移');
    await click('.conditions-comparison [data-viewport-full]');
    assert.equal(await evaluate('document.querySelector(".compare-before").getAttribute("viewBox")'),await evaluate('document.querySelector(".compare-after").getAttribute("viewBox")'));
    assert.equal(await evaluate('document.querySelector(".compare-range").value'),'50');
  }
  pass('all four current pages remain before-only; strategy comparisons start after-only and preserve synced cameras');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  for(const id of ['edge','crosswalk']){
    await view(id,1);await click('#peek-map');await click('.map-canvas .viewport-tools button');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    assert.equal(await evaluate('document.getElementById("map-shade").style.opacity'),'0');
  }
  pass('mobile edge and crosswalk reset behavior remains intact');
};
