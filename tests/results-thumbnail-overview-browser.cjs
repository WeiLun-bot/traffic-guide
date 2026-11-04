'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,click,navigate,wait,cdp,base,artifacts,pass,previewConfigPath}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),fixture=JSON.parse(baseline);
  fixture.imageViews=JSON.parse(fs.readFileSync(path.join(__dirname,'../layout/presentation-layout.json'),'utf8')).imageViews;
  fs.writeFileSync(previewConfigPath,JSON.stringify(fixture));
  const shot=async name=>{const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  await navigate(base+'/presentation-demo/#results-general');
  assert.equal(await evaluate('document.querySelectorAll(".results-heading>p").length'),0);
  const assets=await evaluate(`(async()=>{
    const app=window.generalRoadPresentation,cards=[...document.querySelectorAll('[data-results-scenario]')];
    return Promise.all(cards.map(async card=>{
      const code=card.dataset.resultsScenario,strategy=app.pages.find(page=>page.resultsScenario===code&&page.stage==='strategy'),source=strategy.content.images[0],asset=app.data.embeddedAssets[source.key],node=card.querySelector('image'),image=new Image();
      image.src=node.getAttribute('href');await image.decode();
      return {code,key:source.key,matches:node.getAttribute('href')===asset.url,decoded:image.naturalWidth>0&&image.naturalHeight>0,complete:card.querySelector('svg').getAttribute('preserveAspectRatio')==='xMidYMid meet',label:card.getAttribute('aria-label'),name:card.querySelector('strong').textContent};
    }));
  })()`);
  assert.equal(assets.length,18);assert.equal(new Set(assets.map(item=>item.code)).size,18);
  for(const asset of assets){assert(asset.matches&&asset.decoded&&asset.complete,'Incomplete/incorrect thumbnail: '+asset.code);assert(asset.label.includes(asset.code)&&asset.label.includes(asset.name));}
  assert.equal(await evaluate('document.querySelectorAll(".results-thumbnail-grid .viewport-tools,.results-thumbnail-grid .iv-trigger,.results-thumbnail-grid .scenario-detail-image").length'),0);
  pass('all 18 scenario cards decode their matching layout image and retain accessible names without map controls or the removed introductory text');
  const geometries=[];
  for(const [width,height]of [[1366,768],[1920,1080],[2560,1600]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await view('results-general');
    const geometry=await evaluate(`(()=>{
      const main=document.getElementById('presentation'),slide=main.firstElementChild,bounds=main.getBoundingClientRect(),cards=[...document.querySelectorAll('[data-results-scenario]')],rects=cards.map(card=>{const r=card.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
      return {display:getComputedStyle(slide).display,columns:new Set(rects.map(r=>Math.round(r.left))).size,rows:new Set(rects.map(r=>Math.round(r.top))).size,contained:rects.every(r=>r.top>=bounds.top&&r.bottom<=bounds.bottom+1&&r.left>=bounds.left&&r.right<=bounds.right+1),overlap:rects.some((a,i)=>rects.some((b,j)=>j>i&&Math.min(a.right,b.right)>Math.max(a.left,b.left)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1)),imageHeight:Math.min(...cards.map(card=>card.querySelector('.results-scenario-thumb').getBoundingClientRect().height)),clippedTitles:cards.filter(card=>{const node=card.querySelector('strong');return node.scrollHeight>node.clientHeight+1;}).map(card=>card.dataset.resultsScenario),blankCaption:cards.some(card=>{const caption=card.querySelector('.results-scenario-caption'),name=card.querySelector('strong');return caption.getBoundingClientRect().bottom-name.getBoundingClientRect().bottom>parseFloat(getComputedStyle(caption).paddingBottom)+1;}),overflow:main.scrollHeight-main.clientHeight,horizontal:document.documentElement.scrollWidth-innerWidth};
    })()`);
    geometries.push({width,height,...geometry});assert.equal(geometry.display,'flex');assert.equal(geometry.columns,6);assert.equal(geometry.rows,3);assert(geometry.contained&&!geometry.overlap,JSON.stringify(geometry));assert(geometry.imageHeight>=90);assert.deepEqual(geometry.clippedTitles,[]);assert.equal(geometry.blankCaption,false);assert(geometry.overflow<=2&&geometry.horizontal<=1);
    if(width!==2560)await shot('results-overview-'+width);
  }
  pass('desktop 1366×768, 1920×1080 and 2560×1600 show all 18 cards in six columns and three rows, with readable titles and no overlapping or scrolling');
  await click('[data-results-scenario="G1-02"]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-scenario-g1-02');
  await click('#next');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-scenario-g1-02-strategy');
  await click('#lecture-chapters [data-chapter="results-general"]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-general');
  await view('results-general');await evaluate('document.querySelector(\'[data-results-scenario="G4-04"]\').focus()');
  assert.equal(await evaluate('document.activeElement.dataset.resultsScenario'),'G4-04');
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});await wait('window.generalRoadPresentation.page.id==="results-scenario-g4-04"');
  await view('results-complex');assert.equal(await evaluate('document.querySelectorAll(".results-scenario-list>[data-results-scenario]").length'),18);assert.equal(await evaluate('document.querySelectorAll(".results-scenario-thumb").length'),18);
  assert.equal(await evaluate('document.getElementById("slide-title").textContent'),'複雜道路情境｜整體佈設圖總覽');assert.equal(await evaluate('document.querySelectorAll(".results-heading>p").length'),0);
  assert.equal(await evaluate('document.querySelectorAll(".results-scenario-thumb-pending").length'),0);
  const complexImages=await evaluate(`(async()=>Promise.all([...document.querySelectorAll('[data-results-thumbnail-key]')].map(async node=>{const image=new Image(),code=node.closest('[data-results-scenario]').dataset.resultsScenario;image.src=node.querySelector('image').getAttribute('href');await image.decode();return {code,key:node.dataset.resultsThumbnailKey,pageId:node.dataset.thumbnailPage,file:decodeURIComponent(image.src),width:image.naturalWidth,height:image.naturalHeight,fit:node.querySelector('svg').getAttribute('preserveAspectRatio')};})))()`);
  assert.equal(complexImages.length,18);assert(complexImages.every(image=>{const owner=image.code==='C2-02'?'C4-04':image.code;return image.file.includes('/materials/05-複雜道路情境/'+owner+'/'+owner+'_')&&image.width>0&&image.height>0&&image.fit==='xMidYMid meet';}));assert.equal(complexImages.find(image=>image.code==='C2-02').file,complexImages.find(image=>image.code==='C4-04').file);
  assert.equal(new Set(complexImages.map(image=>image.pageId)).size,18);assert.equal(new Set(complexImages.map(image=>image.key)).size,18);
  for(const image of complexImages)assert.equal(image.pageId,'results-scenario-'+image.code.toLowerCase()+'-strategy');
  for(const [width,height,columns]of [[1366,768,6],[1920,1080,6],[768,1024,3],[390,844,2]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await view('results-complex');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".results-thumbnail-grid")).gridTemplateColumns.split(" ").length'),columns);
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    if(width>900)assert(await evaluate('(()=>{const main=document.querySelector("main"),bounds=main.getBoundingClientRect();return main.scrollHeight<=main.clientHeight+2&&[...document.querySelectorAll("[data-results-scenario]")].every(card=>card.getBoundingClientRect().bottom<=bounds.bottom+1)})()'));
    await shot('results-complex-overview-'+width);
  }
  await click('[data-results-scenario="C1-01"]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-scenario-c1-01');
  await click('#lecture-chapters [data-chapter="results-complex"]');assert.equal(await evaluate('window.generalRoadPresentation.page.id'),'results-complex');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  pass('both overviews retain scenario navigation; all 18 complex cards show layouts, with C2-02 sharing the C4-04 SVG in the responsive grid');
  const sourceFrame=()=>evaluate(`(()=>{const svg=document.querySelector('.results-diagram');return {view:svg.getAttribute('viewBox'),rotation:svg.querySelector('[data-initial-view-rotation]')?.getAttribute('transform')||null,native:svg.querySelector('image').parentElement.getAttribute('transform')};})()`);
  const thumbnails=()=>evaluate(`Object.fromEntries([...document.querySelectorAll('[data-results-scenario]')].map(card=>{const svg=card.querySelector('svg'),rotation=svg.querySelector('[data-results-thumbnail-rotation]').getAttribute('transform');return [card.dataset.resultsScenario,{view:svg.getAttribute('viewBox'),rotation:rotation.startsWith('rotate(0 ')?null:rotation,native:svg.querySelector('image').parentElement.getAttribute('transform')}];}))`);
  const sources={};
  for(const [directory,entries]of [['results-general',assets],['results-complex',complexImages]]){
    const frames={};for(const asset of entries){await view('results-scenario-'+asset.code.toLowerCase()+'-strategy');sources[asset.code]=frames[asset.code]=await sourceFrame();}
    await view(directory);assert.deepEqual(await thumbnails(),frames);
  }
  pass('all 36 general and complex thumbnails match their strategy pages’ saved viewport, rotation and native image orientation');
  const revised={};
  for(const [code,rotation]of [['G1-01',37],['G1-06',90],['G4-04',-90],['C1-01',37],['C4-02',90],['C4-06',-90],['C2-02',-37],['C4-04',90]]){
    await view('results-scenario-'+code.toLowerCase()+'-strategy');await click('.iv-trigger');
    assert(await evaluate('document.querySelector(".iv-panel:not([hidden]) .iv-note").textContent.includes("情境總覽縮圖")'));
    for(const [field,value]of [['zoom',145],['x',7],['y',-12],['rotation',rotation]])await evaluate(`(()=>{const node=document.querySelector('.iv-panel:not([hidden]) [data-iv-field="${field}"]');node.value=${value};node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    if(code==='C1-01'){
      const before=await sourceFrame();await evaluate(`(()=>{const controller=window.generalRoadViewport.get(document.querySelector('.results-diagram')),box=controller.read();controller.write([box[0]+40,box[1]-30,box[2]*.8,box[3]*.8],false);})()`);
      await click('.iv-panel:not([hidden]) [data-iv-action="capture"]');assert.notDeepEqual(await sourceFrame(),before);
    }
    revised[code]=await sourceFrame();await click('.iv-panel:not([hidden]) [data-iv-action="close"]');
    await evaluate(`(()=>{const controller=window.generalRoadViewport.get(document.querySelector('.results-diagram')),view=controller.read();controller.write([view[0]+100,view[1]-50,view[2]/2,view[3]/2],false);})()`);
    await view(code[0]==='G'?'results-general':'results-complex');const frames=await thumbnails();assert.deepEqual(frames[code],revised[code],'Thumbnail must follow applied initial settings, independent of temporary panning: '+code);
    if(code==='C2-02')assert.deepEqual(frames['C4-04'],sources['C4-04'],'A shared SVG must retain independent case views');
    if(code==='C4-04')assert.deepEqual(frames['C2-02'],revised['C2-02']);
  }
  fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));
  for(const directory of ['results-general','results-complex']){
    await navigate(base+'/presentation-demo/#'+directory);const frames=await thumbnails();
    for(const [code,frame]of Object.entries(revised).filter(([code])=>code[0]===(directory==='results-general'?'G':'C')))assert.deepEqual(frames[code],frame,'Saved thumbnail frame did not reload: '+code);
  }
  await view('results-scenario-c1-01-strategy');await click('.iv-trigger');
  await evaluate(`(()=>{const node=document.querySelector('.iv-panel:not([hidden]) [data-iv-field="x"]');node.value=18;node.dispatchEvent(new Event('change',{bubbles:true}));})()`);const redoFrame=await sourceFrame();
  await click('.iv-panel:not([hidden]) [data-iv-action="close"]');await click('[data-vl-action="undo"]');await view('results-complex');assert.deepEqual((await thumbnails())['C1-01'],revised['C1-01']);
  await click('[data-vl-action="redo"]');await view('results-complex');assert.deepEqual((await thumbnails())['C1-01'],redoFrame);
  pass('general and complex initial-view edits and captured pan/zoom synchronize on return, survive JSON reload and undo/redo, and keep reused-image case views independent');
  for(const [width,columns]of [[760,3],[390,2]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});await view('results-general');
    assert.equal(await evaluate('new Set([...document.querySelectorAll("[data-results-scenario]")].map(node=>Math.round(node.getBoundingClientRect().left))).size'),columns);
    assert.equal(await evaluate('document.querySelectorAll(".results-scenario-thumb image").length'),18);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    assert(await evaluate('[...document.querySelectorAll(".results-thumbnail-grid strong")].every(node=>node.scrollHeight<=node.clientHeight+1)'));
    if(width===390)await shot('results-overview-mobile');
  }
  fs.writeFileSync(path.join(artifacts,'results-thumbnail-overview.json'),JSON.stringify({assets,geometries},null,2)+'\n');
  fs.writeFileSync(previewConfigPath,baseline);
  pass('tablet and phone retain all 18 complete thumbnails in three/two columns without horizontal overflow');
};
