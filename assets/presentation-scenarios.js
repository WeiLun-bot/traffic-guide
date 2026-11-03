(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.PresentationScenarios=api;root.presentationScenariosReady=api.load();}
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  let catalog=null,loadError='',details=[];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  function validate(value){
    check(value?.schemaVersion===1&&Array.isArray(value.groups)&&Array.isArray(value.scenarios),'情境總覽格式無效');
    const groups=new Map(),ids=new Set();
    for(const group of value.groups){check(/^[GC][1-4]$/.test(group.id)&&!groups.has(group.id)&&['general','complex'].includes(group.deck)&&group.deck===(group.id[0]==='G'?'general':'complex')&&/^[\w-]+$/.test(group.chapter)&&/^[\w-]+$/.test(group.entry)&&typeof group.name==='string'&&group.name.trim(),'情境主題無效');groups.set(group.id,group);}
    for(const item of value.scenarios){check(/^[GC][1-4]-\d{2}$/.test(item.id)&&!ids.has(item.id)&&groups.has(item.group)&&item.id.startsWith(item.group+'-')&&typeof item.name==='string'&&item.name.trim()&&typeof item.short==='string'&&item.short.trim()&&Number.isInteger(item.sourcePage)&&item.sourcePage>0,'情境項目無效');ids.add(item.id);}
    if(value.details)check(Array.isArray(value.details)&&value.details.every(file=>/^data\/scenarios\/[GC][1-4]-\d{2}\.json$/.test(file))&&new Set(value.details).size===value.details.length,'情境內容清單無效');
    if(value.baseDetails)check(Array.isArray(value.baseDetails)&&value.baseDetails.every(file=>/^data\/scenarios\/G[1-4]-\d{2}\.json$/.test(file)),'既有情境內容路徑無效');
    return value;
  }
  function validateDetail(doc,directory=catalog){
    const scene=doc?.scenario,entry=directory?.scenarios.find(item=>item.id===scene?.code);
    check(doc?.schemaVersion===1&&entry&&scene.id===scene.code.toLowerCase()&&scene.chapter===directory.groups.find(group=>group.id===entry.group)?.chapter&&scene.name===entry.name&&doc.assets&&Array.isArray(doc.articles)&&doc.articles.length,'情境內容格式無效');
    const assetIds=new Set(Object.keys(doc.assets));
    for(const [id,asset]of Object.entries(doc.assets)){
      const folder=scene.code.startsWith('C')?'05-複雜道路情境':'04-一般道路情境';
      check(/^[\w-]+$/.test(id)&&asset.scenario===scene.code&&typeof asset.file==='string'&&!asset.file.includes('\\')&&!asset.file.split('/').includes('..')&&(asset.file.startsWith('materials/'+folder+'/'+scene.code+'/')||asset.file.startsWith('materials/'+folder+'/current-conditions/'+scene.code+'/'))&&/\.(svg|png|jpe?g)$/.test(asset.file)&&asset.width>0&&asset.height>0&&Number.isFinite(asset.width)&&Number.isFinite(asset.height)&&[0,90,180,270].includes(asset.rotation||0)&&/^[a-f0-9]{64}$/.test(asset.sha256),'情境圖片格式無效');
    }
    const pageIds=[scene.contextId,scene.overviewId,scene.reviewId,scene.currentConditions?.pageId,...(scene.comparisonId?[scene.comparisonId]:[])],articleIds=new Set();
    check(pageIds.every(id=>/^[\w-]+$/.test(id))&&new Set(pageIds).size===pageIds.length&&assetIds.has(scene.overall),'情境頁面或全圖無效');
    check(Array.isArray(scene.facts)&&scene.facts.length===2&&Array.isArray(scene.issues)&&scene.issues.length&&Array.isArray(scene.overviewRows)&&Array.isArray(scene.modules),'情境解說內容無效');
    for(const article of doc.articles){
      check(/^[\w-]+$/.test(article.id)&&!pageIds.includes(article.id)&&!articleIds.has(article.id)&&article.scenario===scene.id&&assetIds.has(article.mapAsset)&&(!article.asset||assetIds.has(article.asset))&&['標線','標誌','號誌','道路設施'].includes(article.category)&&typeof article.name==='string'&&Array.isArray(article.points)&&article.points.length>0&&article.points.every(point=>typeof point==='string'),'情境條文無效');articleIds.add(article.id);
      const image=doc.assets[article.mapAsset];
      for(const box of [article.box,article.crop])check(Array.isArray(box)&&box.length===4&&box.every(Number.isFinite)&&box[0]>=0&&box[1]>=0&&box[2]>0&&box[3]>0&&box[0]+box[2]<=image.width+.001&&box[1]+box[3]<=image.height+.001,'情境框選範圍無效');
      if(article.table)check(Array.isArray(article.table.columns)&&article.table.columns.every(value=>typeof value==='string')&&Array.isArray(article.table.rows)&&article.table.rows.every(row=>row.length===article.table.columns.length&&row.every(value=>typeof value==='string')),'情境表格無效');
      if(article.moduleLinks)check(Array.isArray(article.moduleLinks)&&article.moduleLinks.every(link=>typeof link.label==='string'&&(link.page?/^[\w-]+$/.test(link.page):/^[\w-]+(?:\/topic-[\w-]+)?$/.test(link.route))),'情境模組連結無效');
    }
    check(scene.articleIds.length===articleIds.size&&scene.articleIds.every(id=>articleIds.has(id))&&new Set(scene.articleIds).size===articleIds.size&&scene.overviewRows.every(row=>articleIds.has(row[0])),'情境條文索引無效');
    check(assetIds.has(scene.currentConditions.before)&&assetIds.has(scene.currentConditions.after)&&scene.currentConditions.photos.length>0&&scene.currentConditions.photos.every(photo=>assetIds.has(photo.image)&&Array.isArray(photo.points)),'情境現況素材無效');
    return doc;
  }
  async function load(){try{
    if(typeof window==='object'&&window.PresentationRepository){
      const repository=window.PresentationRepository;await repository.ready;catalog=validate(repository.registry.scenarios.catalog);
      details=JSON.parse(JSON.stringify(repository.registry.scenarios.details));
      repository.subscribe((resource,value)=>{if(resource.type!=='scenario')return;const index=details.findIndex(doc=>doc.scenario.code===resource.id);if(index>=0)details[index]=validateDetail(value,catalog);});
      return;
    }
    const read=async file=>{const response=await fetch(new URL(file,document.baseURI),{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status+' / '+file);return response.json();};
    catalog=validate(await read('data/scenarios/catalog.json'));details=await Promise.all((catalog.details||[]).map(async file=>validateDetail(await read(file),catalog)));
    check(new Set(details.map(doc=>doc.scenario.code)).size===details.length,'情境內容重複');
  }catch(error){details=[];loadError=error.message;}}
  function prepare(data){
    for(const doc of details){
      const existing=data.scenarios.find(scene=>scene.id===doc.scenario.id);
      if(!existing)check(!doc.articles.some(article=>data.articles.some(existing=>existing.id===article.id))&&!Object.keys(doc.assets).some(key=>data.embeddedAssets[key]),'情境內容識別重複');
      if(existing){Object.assign(existing,JSON.parse(JSON.stringify(doc.scenario)));for(const article of doc.articles){const current=data.articles.find(item=>item.id===article.id);if(current)Object.assign(current,JSON.parse(JSON.stringify(article)));}}
      else{data.scenarios.push(JSON.parse(JSON.stringify(doc.scenario)));data.articles.push(...JSON.parse(JSON.stringify(doc.articles)));}
      for(const [key,asset]of Object.entries(doc.assets)){data.assets[key]=asset.file.split('/').at(-1);data.embeddedAssets[key]={url:encodeURI(asset.file),width:asset.width,height:asset.height};data.assetMeta[key]={scenario:doc.scenario.id,label:asset.label,rotation:asset.rotation||0};}
    }
    data.scenarios.sort((a,b)=>Number(a.code.startsWith('C'))-Number(b.code.startsWith('C'))||a.code.localeCompare(b.code));
  }
  function sceneFor(page,data){const scene=data.scenarios.find(scene=>scene.id===page.scenario)||data.scenarios[0],key=page.article?.mapAsset,image=data.embeddedAssets[key];return image?{...scene,overall:key,width:image.width,height:image.height,rotation:data.assetMeta[key]?.rotation||0}:scene;}
  function bounds([x,y,w,h],scene,inverse=false){const r=scene.rotation,W=scene.width,H=scene.height;if(r===180)return[W-x-w,H-y-h,w,h];if(r===90)return inverse?[y,H-x-w,h,w]:[H-y-h,x,h,w];if(r===270)return inverse?[W-y-h,x,h,w]:[y,W-x-w,h,w];return[x,y,w,h];}
  function transform(scene){return scene.rotation===90?`translate(${scene.height} 0) rotate(90)`:scene.rotation===180?`translate(${scene.width} ${scene.height}) rotate(180)`:scene.rotation===270?`translate(0 ${scene.width}) rotate(270)`:'';}
  const overviewId=deck=>deck==='complex'?'complex-intro':'general-scenarios-index';
  const built=(item,data)=>data.scenarios.find(scene=>scene.code===item.id);
  const pageFor=(item,data)=>built(item,data)?.contextId||'scenario-'+item.id.toLowerCase();
  function extendPages(pages,data){
    if(!catalog)return;
    for(const group of catalog.groups){
      const page=pages.find(page=>page.id===group.entry);if(!page||!data.scenarios.some(scene=>scene.chapter===group.chapter))continue;
      page.kind='chapter-scenarios';
      const entryIndex=pages.indexOf(page),firstCase=pages.findIndex(item=>item.scenario&&data.scenarios.find(scene=>scene.id===item.scenario)?.chapter===group.chapter);
      if(firstCase>=0&&entryIndex>firstCase){pages.splice(entryIndex,1);pages.splice(firstCase,0,page);}
    }
    for(const item of catalog.scenarios){
      if(built(item,data))continue;
      const group=catalog.groups.find(group=>group.id===item.group),page={id:pageFor(item,data),chapter:group.chapter,kind:'presentation-empty',name:item.name,scenarioCode:item.id};
      const after=pages.findLastIndex(page=>page.chapter===group.chapter);pages.splice(after+1,0,page);
    }
  }
  function chapter(page,data,ui){
    const group=catalog.groups.find(group=>group.chapter===page.chapter),scenes=data.scenarios.filter(scene=>scene.chapter===page.chapter),all=catalog.scenarios.filter(item=>item.group===group.id);
    return `<section data-detail-directory style="--directory-columns:${(scenes.length===4?2:Math.min(3,scenes.length))};--directory-rows:${Math.ceil(scenes.length/(scenes.length===4?2:3))}" class="slide scenario-chapter ${scenes.length>2?'has-many-scenarios':''}" aria-labelledby="slide-title"><div class="section-heading"><div><span class="eyebrow">${group.id} / SCENARIO DIRECTORY</span><h1 id="slide-title">${esc(group.name)}</h1></div></div><div class="scenario-card-grid">${scenes.map(scene=>`<button class="scenario-card" data-scenario="${scene.id}"><div class="scenario-card-top"><span>${scene.code}</span><span class="tag">${scene.setting} / ${scene.geometry||'正交'}</span></div><div class="scenario-card-visual">${ui.image(scene.overall)}</div><div class="scenario-card-copy"><h2>${esc(scene.name)}</h2><p>${esc(scene.summary)}</p><div class="scenario-card-footer"><span>${scene.articleIds.length} 項解說</span><strong>進入情境 ↗</strong></div></div></button>`).join('')}</div>${all.length>scenes.length?`<div class="scenario-pending-links">${all.filter(item=>!built(item,data)).map(item=>`<button class="text-button" data-page="${pageFor(item,data)}">${item.id} ${esc(item.short)}（待製作） ↗</button>`).join('')}</div>`:''}</section>`;
  }
  function returnLink(deck){return `<button type="button" class="catalog-back" data-page="${overviewId(deck)}">全部情境總覽 ↖</button>`;}
  function card(item,data){
    const scene=built(item,data),general=item.id.startsWith('G'),results=typeof window==='object'&&window.PresentationResults,source=general&&results?.outline?.scenarioExamples?.[item.id]?.strategy?.images[0];
    const preview=scene&&results?.scenarioThumbnail?.(source?results.scenarioPageId(item.id)+'-strategy':scene.overviewId,source||{key:scene.overall,rotation:data.assetMeta[scene.overall]?.rotation||0},data);
    return `<button type="button" class="directory-card${preview?' has-thumbnail':''}" data-page="${pageFor(item,data)}" data-catalog-scenario="${item.id}" aria-label="${esc(item.id+' '+item.name+'，'+(scene?'進入情境':'開啟預留頁'))}"><span class="directory-card-code">${item.id}</span><h3>${esc(item.name)}</h3>${preview?`<span class="directory-card-visual">${preview}</span>`:''}<span class="directory-card-bottom">${general&&scene?'':`<small class="${scene?'is-ready':''}">${scene?'已製作':'素材待補'}</small>`}<span>${scene?'進入情境':'開啟預留頁'} ↗</span></span></button>`;
  }
  function render(page,data){
    const complex=page.chapter==='complex-intro',deck=complex?'complex':'general',label=complex?'複雜道路情境':'一般道路情境';
    if(!catalog||loadError)return `<section class="slide scenario-directory"><h1 id="slide-title">情境總覽尚未載入</h1><p>請確認 data/scenarios/catalog.json 可讀取後重新整理。${esc(loadError)}</p></section>`;
    const groups=catalog.groups.filter(group=>group.deck===deck),entries=catalog.scenarios.filter(item=>groups.some(group=>group.id===item.group)),count=entries.filter(item=>built(item,data)).length;
    return `<section class="slide scenario-directory" data-scenario-directory="${deck}" aria-labelledby="slide-title"><header class="directory-heading"><span class="eyebrow">00 / ${complex?'COMPLEX':'GENERAL'} ROAD SCENARIOS</span><h1 id="slide-title">全部情境總覽</h1>${complex?`<p>${label} · ${entries.length} 個情境 · ${count} 個已製作</p>`:''}</header>${groups.map(group=>`<section class="directory-group" data-directory-group="${group.id}"><header><h2>${group.id} ${esc(group.name)}</h2><button type="button" class="catalog-back" data-page="${group.entry}">進入章節 ↗</button></header><div class="directory-card-grid">${catalog.scenarios.filter(item=>item.group===group.id).map(item=>card(item,data)).join('')}</div></section>`).join('')}<p class="directory-source">情境名稱依 output_1027.pdf 第 ${complex?'5':'4'} 章整理；尚無素材的內容頁保留空白。</p></section>`;
  }
  function switcher(item,data){
    const group=catalog.groups.find(group=>group.id===item.group),scene=built(item,data);
    return `<nav class="scenario-switcher scenario-directory-switcher" aria-label="${group.id} 章內情境切換"><button type="button" class="scenario-back" data-page="${overviewId(group.deck)}">全部情境總覽 ↖</button>${catalog.scenarios.filter(other=>other.group===item.group).map(other=>{const ready=built(other,data);return `<button type="button" data-scenario-code="${other.id}" ${ready?`data-scenario="${ready.id}"`:''} data-page="${pageFor(other,data)}" class="${other.id===item.id?'active':''}" ${other.id===item.id?'aria-current="page"':''}><strong>${other.id}</strong> ${esc(ready?.short||other.short)}</button>`;}).join('')}<span>${item.id} / ${esc(scene?.setting||group.name)}情境</span></nav>`;
  }
  function decorate(page,data){
    if(!catalog)return;
    const root=document.getElementById('presentation'),slide=root.firstElementChild;if(!slide)return;
    const scene=data.scenarios.find(scene=>scene.id===page.scenario),item=catalog.scenarios.find(item=>item.id===(page.scenarioCode||scene?.code));
    if(item){
      slide.querySelector('.scenario-switcher')?.remove();slide.insertAdjacentHTML('afterbegin',switcher(item,data));
      const group=catalog.groups.find(group=>group.id===item.group),contextLabel=slide.querySelector('.context-header>.eyebrow');if(contextLabel)contextLabel.textContent=group.id+' / '+item.id+' / '+(scene.setting==='市區'?'URBAN':'RURAL')+(group.deck==='complex'?' ROAD SCENARIO':group.id==='G3'||group.id==='G4'?' CROSS-INTERSECTION':' T-INTERSECTION');
      if(page.kind==='review'&&group.id!=='G1'){const back=slide.querySelector('.opening-actions [data-page="g1-scenarios"]');if(back){back.dataset.page=group.entry;back.textContent='回到 '+group.id+' 情境總覽 ↗';}}
      if(scene?.facts&&page.kind==='context')slide.querySelectorAll('.road-speed').forEach((node,index)=>{if(scene.facts[index]?.speed==null)node.textContent='路段速限未載明';});
      const article=page.article,host=slide.querySelector('#explanation'),footer=host?.querySelector('.explain-footer');
      if(article?.noDefaultHighlight&&!window.generalRoadEditor?.adjusting&&!window.generalRoadEditor?.state.highlights?.['article:'+article.id])slide.querySelector('#selection-group')?.style.setProperty('display','none');
      if(article?.table&&footer){const table=article.table;footer.insertAdjacentHTML('beforebegin',`<div class="scenario-article-table"><table><caption>${esc(article.name)}</caption><thead><tr>${table.columns.map(label=>`<th scope="col">${esc(label)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row=>`<tr>${row.map((cell,index)=>`<${index?'td':'th'}${index?'':' scope="row"'}>${esc(cell)}</${index?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>`);}
      if(article?.moduleLinks&&footer)footer.insertAdjacentHTML('beforebegin',`<nav class="scenario-related-links" aria-label="相關模組與案例">${article.moduleLinks.map(link=>`<button type="button" class="text-button" ${link.page?`data-page="${link.page}"`:`data-module-route="${link.route}"`}>${esc(link.label)} ↗</button>`).join('')}</nav>`);
      return;
    }
    const group=catalog.groups.find(group=>group.entry===page.id);
    if(group){slide.insertAdjacentHTML('afterbegin',returnLink(group.deck));return;}
    if(page.id==='contents'){
      const host=slide.querySelector('.contents-intro');if(host&&!host.querySelector('[data-page="general-scenarios-index"]'))host.insertAdjacentHTML('beforeend','<button type="button" class="catalog-back directory-intro-link" data-page="general-scenarios-index">全部情境總覽 ↗</button>');
    }
  }
  return {load,validate,validateDetail,prepare,sceneFor,bounds,transform,chapter,extendPages,render,decorate,get catalog(){return catalog;},get details(){return details;},get error(){return loadError;}};
});
