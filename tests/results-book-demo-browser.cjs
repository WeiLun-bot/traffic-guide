'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,view,navigate,click,wait,cdp,base,artifacts,pass})=>{
  const run=fn=>evaluate('('+fn.toString()+')()');
  const book=fn=>evaluate('('+fn.toString()+')(document.querySelector(".results-book-frame").contentWindow)');
  const ready=()=>wait('Boolean(document.querySelector(".results-book-frame")?.contentWindow?.BookPresentation)','Book did not load');
  const turned=index=>wait('document.querySelector(".results-book-frame").contentWindow.BookPresentation.state.index==='+index+' && !document.querySelector(".results-book-frame").contentWindow.BookPresentation.state.busy','Book flip did not finish');
  await navigate(base+'/presentation-demo/#results-wrap');
  assert.equal(await run(()=>performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/road_book_3d/')).length),0);
  await view('results-book-demo');await ready();
  const previous=await run(()=>window.PresentationStructure.navigationTarget(-1).id);
  assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-book-demo');
  assert.equal(await run(()=>window.generalRoadPresentation.page.chapter),'results-wrap');
  assert.equal(await run(()=>document.querySelectorAll('.results-book-demo .results-heading').length),0);
  assert.equal(await run(()=>document.querySelector('.results-book-actions a').getAttribute('target')),'_blank');
  assert.equal(await book(w=>w.document.querySelectorAll('#jump option').length),require('../road_book_3d/navigation-config.json').spreads.length+2);
  for(const [width,height,scale=1]of [[1326,830,1.5],[1600,1000],[1920,1200],[1280,800],[390,844]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});
    await view('results-book-demo');await ready();
    await book(async w=>{await w.document.querySelector('.cover-face img').decode();});
    const bounds=await run(()=>{const frame=document.querySelector('.results-book-frame'),d=frame.contentDocument,w=frame.contentWindow,stage=d.querySelector('.stage').getBoundingClientRect(),cover=d.querySelector('.cover-leaf').getBoundingClientRect(),main=document.getElementById('presentation');return {x:document.documentElement.scrollWidth-innerWidth,y:main.scrollHeight-main.clientHeight,innerX:d.documentElement.scrollWidth-w.innerWidth,innerY:d.documentElement.scrollHeight-w.innerHeight,coverFits:cover.top>=stage.top-2&&cover.bottom<=stage.bottom+2,embedded:d.documentElement.classList.contains('presentation-embed'),header:w.getComputedStyle(d.querySelector('.site-header')).display};});
    assert(bounds.x<=1&&bounds.innerX<=1&&bounds.innerY<=2,JSON.stringify({width,bounds}));
    if(width>900)assert(bounds.y<=2&&bounds.coverFits,JSON.stringify({width,bounds}));
    assert(bounds.embedded);assert.equal(bounds.header,'none');
    assert.equal(await book(w=>w.document.getElementById('viewSettings').open),false);
    await book(w=>w.document.querySelector('#viewSettings summary').click());
    const settings=await book(w=>{const d=w.document,box=d.querySelector('.view-tools').getBoundingClientRect(),dock=d.querySelector('.controls').getBoundingClientRect(),stage=d.querySelector('.stage').getBoundingClientRect(),cover=d.querySelector('.cover-leaf').getBoundingClientRect();return {open:d.getElementById('viewSettings').open,fits:box.left>=0&&box.right<=w.innerWidth&&box.top>=0&&box.bottom<=w.innerHeight,dockFits:w.innerWidth<=680?dock.top>=stage.bottom:dock.left>=stage.right,bookHeight:cover.height/stage.height};});
    assert(settings.open&&settings.fits&&settings.dockFits,JSON.stringify({width,settings}));
    if(width>900)assert(settings.bookHeight>.7,JSON.stringify({width,settings}));
    await book(w=>w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(await book(w=>w.document.getElementById('viewSettings').open),false);
    if(width===1600){const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'book-cover-1600.png'),Buffer.from(shot.data,'base64'));}
  }
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await view('results-book-demo');await ready();
  const frame=await run(()=>document.querySelector('.results-book-frame').src);
  await click('#next');await turned(0);
  assert.deepEqual(await book(w=>['--ry','--rx'].map(key=>w.document.getElementById('book').style.getPropertyValue(key))),['0deg','0deg']);
  assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-book-demo');
  assert.equal(await run(()=>document.getElementById('next-label').textContent),'下一頁');
  assert.deepEqual(await book(w=>[w.document.getElementById('jump').value,...['leftImg','rightImg'].map(id=>w.document.getElementById(id).getAttribute('src'))]),['0','pages/p4.webp','pages/p5.webp']);
  await click('#next');await click('#next');await turned(1);
  assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-book-demo');
  await click('#previous');await turned(0);await click('#previous');await turned(-1);
  assert.deepEqual(await book(w=>['--ry','--rx'].map(key=>w.document.getElementById('book').style.getPropertyValue(key))),['-16deg','8deg']);
  await click('#previous');assert.equal(await run(()=>window.generalRoadPresentation.page.id),previous);
  await click('#next');await ready();await click('#next');await turned(0);
  await run(()=>document.getElementById('next').focus());
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'PageDown'});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'PageDown'});
  await turned(1);assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-book-demo');
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'PageUp'});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'PageUp'});
  await turned(0);
  await book(w=>w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));
  await wait('document.querySelector(".results-book-frame").contentDocument.getElementById("jump").value==="1" && !document.querySelector(".results-book-frame").contentDocument.getElementById("nextBtn").disabled','Book keyboard flip did not finish');
  assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-book-demo');
  await book(w=>{w.document.querySelector('#viewSettings summary').click();const slider=w.document.getElementById('rotation');slider.value='-12';slider.dispatchEvent(new w.Event('input',{bubbles:true}));});
  assert.equal(await book(w=>w.document.getElementById('book').style.getPropertyValue('--ry')),'-12deg');
  await book(w=>w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'PageDown',bubbles:true,cancelable:true})));
  await turned(2);
  assert.deepEqual(await book(w=>['--ry','--rx'].map(key=>w.document.getElementById('book').style.getPropertyValue(key))),['0deg','0deg']);
  assert.equal(await run(()=>document.querySelector('.results-book-frame').src),frame);
  await book(w=>w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  await book(w=>{const jump=w.document.getElementById('jump');jump.value='2';jump.dispatchEvent(new w.Event('change',{bubbles:true}));});
  await wait('document.querySelector(".results-book-frame").contentDocument.getElementById("jump").value==="2" && !document.querySelector(".results-book-frame").contentDocument.getElementById("nextBtn").disabled','Book chapter jump did not finish');
  await book(async w=>{await Promise.all(['leftImg','rightImg'].map(id=>w.document.getElementById(id).decode()));w.document.getElementById('frontView').click();w.document.getElementById('zoomSpread').click();});
  assert(await book(w=>w.document.getElementById('lightbox').classList.contains('show')));
  await book(w=>w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert(!await book(w=>w.document.getElementById('lightbox').classList.contains('show')));
  assert.equal(await book(w=>w.document.getElementById('book').style.getPropertyValue('--ry')),'0deg');
  assert.equal(await book(w=>w.document.getElementById('book').style.getPropertyValue('--rx')),'0deg');
  const spread=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'book-spread-1600.png'),Buffer.from(spread.data,'base64'));
  const configured=require('../road_book_3d/navigation-config.json').spreads;
  for(const index of configured.map((spread,index)=>spread.left>=502?index:null).filter(index=>index!==null)){
    await evaluate('(w=>{const jump=w.document.getElementById("jump");jump.value="'+index+'";jump.dispatchEvent(new w.Event("change",{bubbles:true}));})(document.querySelector(".results-book-frame").contentWindow)');
    await wait('document.querySelector(".results-book-frame").contentDocument.getElementById("jump").value==="'+index+'" && document.querySelector(".results-book-frame").contentDocument.getElementById("flipSheet").style.display==="none"','Index spread did not load');
    const sources=await book(async w=>{await Promise.all(['leftImg','rightImg'].map(id=>w.document.getElementById(id).decode()));return ['leftImg','rightImg'].map(id=>w.document.getElementById(id).getAttribute('src'));});
    assert.deepEqual(sources,['pages/p'+configured[index].left+'.webp','pages/p'+configured[index].right+'.webp']);
    if(configured[index].left===502||configured[index].left===532){const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'book-index-'+configured[index].left+'-'+configured[index].right+'.png'),Buffer.from(shot.data,'base64'));}
  }
  if(await run(()=>document.fullscreenEnabled)){
    const point=await run(()=>{const r=document.querySelector('[data-book-fullscreen]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
    for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
    await wait('document.fullscreenElement?.classList.contains("results-book-frame")','Book fullscreen did not open');
    await run(()=>document.exitFullscreen());
  }
  await click('#next');
  await wait('document.querySelector(".results-book-frame").contentWindow.BookPresentation.state.ending && !document.querySelector(".results-book-frame").contentWindow.BookPresentation.state.busy','Book did not close for the ending');
  assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-book-demo');
  assert.equal(await run(()=>document.getElementById('next').disabled),true);
  assert.deepEqual(await book(w=>[...w.document.querySelectorAll('#bookThanks p')].map(node=>node.textContent)),['謝謝聆聽','敬請指教']);
  assert.equal(await book(w=>w.document.getElementById('book').classList.contains('closed')),true);
  for(const [width,height]of [[1600,1000],[1280,800],[1920,1200],[1326,830],[390,844]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await book(async w=>{await new Promise(resolve=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)));await Promise.all(w.document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
    const ending=await book(w=>{const d=w.document,cover=d.querySelector('.cover-leaf').getBoundingClientRect(),thanks=d.getElementById('bookThanks').getBoundingClientRect(),stage=d.getElementById('stage').getBoundingClientRect();return {x:d.documentElement.scrollWidth-w.innerWidth,y:d.documentElement.scrollHeight-w.innerHeight,opacity:w.getComputedStyle(d.getElementById('bookThanks')).opacity,fits:thanks.left>=stage.left&&thanks.right<=stage.right&&thanks.top>=stage.top&&thanks.bottom<=stage.bottom,separate:w.innerWidth>680?cover.right<=thanks.left:cover.bottom<=thanks.top};});
    assert(ending.x<=1&&ending.y<=2&&ending.opacity==='1'&&ending.fits&&ending.separate,JSON.stringify({width,ending}));
    if(width===1600){const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'book-ending-1600.png'),Buffer.from(shot.data,'base64'));}
  }
  await click('#previous');await turned(configured.length-1);
  assert.equal(await book(w=>w.document.getElementById('bookThanks').getAttribute('aria-hidden')),'true');
  assert.equal(await run(()=>document.getElementById('next').disabled),false);
  await click('#next');await wait('document.querySelector(".results-book-frame").contentWindow.BookPresentation.state.ending','Book did not return to ending');
  await view('results-guide-experience-1');assert.equal(await run(()=>document.getElementById('next').disabled),false);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await view('results-book-demo');await ready();
  await run(()=>{const frame=document.querySelector('.results-book-frame');frame.src=frame.src.split('?')[0];});
  await wait('document.querySelector(".results-book-frame").contentDocument?.getElementById("nextBtn") && !document.querySelector(".results-book-frame").contentDocument.documentElement.classList.contains("presentation-embed")','Standalone book did not load');
  const standalone=await book(w=>({x:w.document.documentElement.scrollWidth-w.innerWidth,y:w.document.documentElement.scrollHeight-w.innerHeight,header:w.getComputedStyle(w.document.querySelector('.site-header')).display}));
  assert(standalone.x<=1&&standalone.y<=2&&standalone.header!=='none',JSON.stringify(standalone));
  await click('#previous');assert.equal(await run(()=>window.generalRoadPresentation.page.id),previous);
  assert.equal(await run(()=>document.querySelectorAll('.results-book-frame').length),0);
  for(const file of require('../tools/book-release-files.cjs'))assert.equal((await fetch(base+'/presentation-demo/'+file,{method:'HEAD'})).status,200,file);
  pass('Book keeps an inclined cover and flat inner pages; the last spread closes into a responsive two-line thank-you ending, and Previous reopens the last spread; keyboard, manual viewing, zoom, fullscreen and assets work');
};
