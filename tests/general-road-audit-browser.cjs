'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,navigate,view,cdp,base,artifacts,pass})=>{
  const run=fn=>evaluate('('+fn.toString()+')()');
  await navigate(base+'/presentation-demo/?mode=view#general-scenarios-index');
  const signature=await run(()=>VisualLayoutCore.signature(visualLayoutEditor.store.config));
  const inventory=await run(()=>{
    const app=generalRoadPresentation,scenes=app.data.scenarios.filter(s=>/^G[1-4]-\d{2}$/.test(s.code));
    const pages=app.pages.filter(p=>p.deckId==='general'&&!window.PresentationOrder.hidden(p));
    return {scenes:scenes.map(s=>({code:s.code,context:s.contextId,conditions:s.currentConditions?.pageId,overview:s.overviewId,review:s.reviewId})),pages:pages.map(p=>({id:p.id,kind:p.kind||'',article:Boolean(p.article)})),assets:Object.entries(app.data.embeddedAssets).filter(([key])=>/^g/i.test(app.data.assetMeta[key]?.scenario||'')||['overall','sign','before','after'].includes(key)).map(([key,a])=>({key,url:a.url,width:a.width,height:a.height})),links:pages.flatMap(p=>p.article?.moduleLinks||[])};
  });
  assert.equal(inventory.scenes.length,18);
  const assets=await evaluate('(async()=>{const assets='+JSON.stringify(inventory.assets)+';return Promise.all(assets.map(async asset=>{try{const image=new Image();image.src=asset.url;await image.decode();return {...asset,ok:true,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight};}catch(error){return {...asset,ok:false,error:String(error)};}}));})()');
  fs.writeFileSync(path.join(artifacts,'assets.json'),JSON.stringify(assets,null,2));
  assert(assets.every(a=>a.ok),'Broken general-road assets: '+JSON.stringify(assets.filter(a=>!a.ok)));
  pass(inventory.scenes.length+' scenarios, '+inventory.pages.length+' pages and '+assets.length+' original/replacement assets load with saved cameras');
  const rows=[],issues=[];
  for(const [width,height]of [[1920,1080],[1536,864],[1024,768],[390,844]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1,mobile:width<621});
    for(const page of inventory.pages){
      await view(page.id,page.article?1:0);
      const row=await run(()=>{
        const root=document.getElementById('presentation'),rect=root.getBoundingClientRect(),app=generalRoadPresentation;
        const visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
        const known=new Set(app.pages.map(p=>p.id));
        const missingLinks=[...root.querySelectorAll('[data-page]')].filter(visible).map(n=>n.dataset.page).filter(id=>id&&!known.has(id));
        const rasters=[...root.querySelectorAll('img')].filter(visible).map(n=>({src:n.getAttribute('src'),loaded:n.complete&&n.naturalWidth>0}));
        const figures=[...root.querySelectorAll('svg.interactive-viewport,img.interactive-viewport')].filter(visible).map(n=>{const r=n.getBoundingClientRect();return {key:n.dataset.editorImageKey||n.closest('[data-editor-image-key]')?.dataset.editorImageKey,width:r.width,height:r.height};});
        return {id:app.page.id,title:root.querySelector('h1')?.textContent.trim(),horizontal:document.documentElement.scrollWidth-innerWidth,mainOverflow:root.scrollHeight-root.clientHeight,rect:{top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height},missingLinks,rasters,figures};
      });
      row.width=width;row.height=height;rows.push(row);
      const errors=[];
      if(row.id!==page.id)errors.push('navigation mismatch');
      if(!row.title)errors.push('missing title');
      if(row.horizontal>1)errors.push('horizontal overflow');
      if(row.missingLinks.length)errors.push('unknown page links');
      if(row.rasters.some(a=>!a.loaded))errors.push('unloaded image');
      if(row.figures.some(a=>a.width<20||a.height<20))errors.push('unusable image dimensions');
      if(errors.length){
        const item={page:page.id,width,height,errors,...row};issues.push(item);
        const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,page.id+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
      }
    }
    fs.writeFileSync(path.join(artifacts,'page-audit.json'),JSON.stringify({inventory,rows,issues},null,2));
    pass(inventory.pages.length+' authored pages inspected at '+width+' x '+height+'; '+issues.length+' findings so far');
  }
  assert.equal(await run(()=>VisualLayoutCore.signature(visualLayoutEditor.store.config)),signature,'Reading the general deck must preserve all authored settings');
  assert.deepEqual(issues,[],'See page-audit.json for broken page links, images or overflow');
};
