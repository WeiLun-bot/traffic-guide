'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,view,navigate,click,wait,cdp,base,artifacts,pass,previewConfigPath})=>{
  const run=fn=>evaluate('('+fn.toString()+')()');
  const settled=()=>wait('document.querySelector(".guide-vector-example svg.results-diagram")?.dataset.zoomAnimating!=="true"','Zoom animation did not finish');
  const camera=()=>run(()=>window.generalRoadViewport.get(document.querySelector('.guide-vector-example svg.results-diagram')).read());
  await navigate(base+'/presentation-demo/#results-wrap');
  for(const id of ['results-road-clarity','results-road-system','results-guide-experience-1','results-guide-experience-2','results-guide-experience-3','results-guide-experience-4']){
    await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),id);
  }
  assert.equal(await run(()=>window.generalRoadPresentation.pages.some(page=>page.id==='results-guide-experience-5')),false);
  const pageNumber=await run(()=>document.getElementById('page-number').textContent),start=await camera();
  await click('#next');await click('#next');
  assert.deepEqual(await run(()=>[window.generalRoadPresentation.page.id,window.generalRoadPresentation.state.phase,document.getElementById('page-number').textContent]),['results-guide-experience-4',1,pageNumber]);
  const frames=await run(async()=>{const values=[];for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);values.push(window.generalRoadViewport.get(document.querySelector('.guide-vector-example svg.results-diagram')).read()[2]);}return values;});
  assert(frames[0]<start[2]&&frames.at(-1)<frames[0],'Zoom should change gradually across animation frames');
  await settled();const detail=await camera();assert(detail[2]<frames.at(-1));
  await click('#previous');await settled();assert.deepEqual(await camera(),start);
  await click('#next');await settled();await click('#next');
  assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-book-demo');
  await wait('Boolean(document.querySelector(".results-book-frame")?.contentWindow?.BookPresentation)','Book did not load');
  await click('#previous');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-guide-experience-4');assert.equal(await run(()=>window.generalRoadPresentation.state.phase),1);
  for(const [width,height,scale=1]of [[1326,830,1.5],[1600,1000],[1920,1200],[1280,800],[390,844]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});
    for(const index of [1,2,3,4,5]){
      await view('results-guide-experience-'+Math.min(index,4),index===5?1:0);await settled();
      await run(async()=>{await Promise.all([...document.querySelectorAll('.guide-experience-media img')].map(img=>img.decode()));});
      if(index===1){const files=await run(()=>[...document.querySelectorAll('.guide-page-gallery img')].map(img=>decodeURI(img.src).split('/').pop()));assert.deepEqual(files,['reading-layout-64.webp','reading-layout-65.webp','reading-layout-170.png','reading-layout-225.png']);}
      if(index===2){const files=await run(()=>[...document.querySelectorAll('.guide-bookmark-example img')].map(img=>decodeURI(img.src).split('/').pop()));assert.deepEqual(files,['reading-bookmarks-102.webp','reading-bookmarks-168.png','reading-bookmarks-330.png']);}
      if(index===3){const files=await run(()=>[...document.querySelectorAll('.guide-page-gallery img')].map(img=>decodeURI(img.src).split('/').pop()));assert.deepEqual(files,['reading-index-503.webp','reading-index-517.png','reading-index-531.webp']);}
      const bounds=await run(()=>{const main=document.getElementById('presentation');return {x:document.documentElement.scrollWidth-innerWidth,y:main.scrollHeight-main.clientHeight,cards:[...document.querySelectorAll('[data-guide-experience]')].map(card=>{const media=card.querySelector('.guide-experience-media').getBoundingClientRect();return {id:card.dataset.guideExperience,media:media.height,overflow:card.scrollHeight-card.clientHeight};})};});
      assert.equal(bounds.cards.length,1);assert.equal(bounds.cards[0].id,['layout','bookmarks','index','vector','vector'][index-1]);assert(bounds.x<=1,JSON.stringify({width,index,bounds}));
      for(const card of bounds.cards)assert(card.overflow<=2,JSON.stringify({width,index,bounds}));
      if(width>900)assert(bounds.y<=2&&bounds.cards.every(card=>card.media>=200),JSON.stringify({width,index,bounds}));
      if(width===1600||width===1326){const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'experience-'+index+'-'+width+'.png'),Buffer.from(shot.data,'base64'));}
    }
  }
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await view('results-guide-experience-1');await click('.guide-page-thumbnail');
  await wait('document.getElementById("asset-dialog").open','Page enlargement did not open');
  await run(()=>document.getElementById('asset-dialog').close());
  for(const number of [3,4]){await click('.guide-page-thumbnail:nth-child('+number+')');await wait('document.getElementById("asset-dialog").open','Added page enlargement did not open');await run(()=>document.getElementById('asset-dialog').close());}
  await view('results-guide-experience-2');
  for(const number of [1,3]){await click('.guide-bookmark-example .guide-page-thumbnail:nth-child('+number+')');await wait('document.getElementById("asset-dialog").open','Bookmark example enlargement did not open');await run(()=>document.getElementById('asset-dialog').close());}
  await view('results-guide-experience-4');
  const vector=await run(()=>document.querySelector('.guide-vector-example image').getAttribute('href'));
  assert(decodeURI(vector).endsWith('materials/04-一般道路情境/G2-01/G2-01_號誌化市區正交三叉路口交通設施整體設置圖例.svg'));
  const overview=await run(()=>JSON.stringify(window.visualLayoutEditor.store.config.imageViews['results-guide-experience-4/results%3Areading-vector-g2-01']));
  await click('#next');await settled();assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-guide-experience-4');
  const original=await run(()=>window.generalRoadViewport.get(document.querySelector('.guide-vector-example svg.results-diagram')).read());
  assert(original[2]<954/2,'Detail page should load an enlarged view');
  await click('.edit-toggle');await click('.guide-vector-example .iv-trigger');
  await wait('Boolean(document.querySelector(".iv-panel:not([hidden])"))','Initial view controls did not open');
  assert.equal(await run(()=>document.querySelector('.iv-panel:not([hidden]) .iv-heading strong').textContent),'設定放大範圍');
  await run(()=>{const input=document.querySelector('.iv-panel:not([hidden]) [data-iv-field="zoom"]');input.value='450';input.dispatchEvent(new Event('change',{bubbles:true}));});
  const changed=await run(()=>window.generalRoadViewport.get(document.querySelector('.guide-vector-example svg.results-diagram')).read());
  assert(changed[2]<original[2]);
  assert.equal(await run(()=>JSON.stringify(window.visualLayoutEditor.store.config.imageViews['results-guide-experience-4/results%3Areading-vector-g2-01'])),overview,'Changing the detail view changed the preceding page');
  await run(()=>window.VisualInitialViews.close());
  await click('#previous');await settled();await click('#next');await settled();
  assert.deepEqual(await run(()=>window.generalRoadViewport.get(document.querySelector('.guide-vector-example svg.results-diagram')).read()),changed);
  fs.writeFileSync(previewConfigPath,await run(()=>window.visualLayoutEditor.store.serialize()));
  await navigate(base+'/presentation-demo/#results-guide-experience-4/step-1');
  assert.deepEqual(await run(()=>window.generalRoadViewport.get(document.querySelector('.guide-vector-example svg.results-diagram')).read()),changed,'Saved detail view did not survive reload');
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await view('results-guide-experience-4',0);await click('#next');
  assert.equal(await run(()=>document.querySelector('.guide-vector-example svg.results-diagram').dataset.zoomAnimating==='true'),false);
  assert.deepEqual(await camera(),changed);
  await cdp.send('Emulation.setEmulatedMedia',{features:[]});
  await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-book-demo');
  pass('Reading experience: same-page animated zoom and reverse, independent saved zoom target, reduced motion, 16:10 layouts and book navigation');
};
