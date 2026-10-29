(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.PresentationModules=api;root.presentationModulesReady=api.load();}
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const assert=(condition,message)=>{if(!condition)throw new Error(message);};
  const str=value=>typeof value==='string'&&value.length>0;
  const safePath=value=>str(value)&&!/[\\:#?]/.test(value)&&!value.startsWith('/')&&value.split('/').every(part=>part&&part!=='.'&&part!=='..');
  function validateCatalog(value){
    assert(value?.schemaVersion===1&&Array.isArray(value.themes)&&Array.isArray(value.modules),'模組索引格式無效');
    const themes=new Set();for(const theme of value.themes){assert(/^M[1-4]$/.test(theme.id)&&!themes.has(theme.id)&&str(theme.name)&&str(theme.question),'模組主題無效');themes.add(theme.id);}
    const ids=new Set();for(const entry of value.modules){assert(/^M[1-4]-\d{2}$/.test(entry.id)&&!ids.has(entry.id)&&themes.has(entry.theme)&&str(entry.name)&&Array.isArray(entry.submodules),'模組項目無效');ids.add(entry.id);const children=new Set();for(const sub of entry.submodules){assert(/^M[1-4]-\d{2}\.\d+$/.test(sub.id)&&sub.id.startsWith(entry.id+'.')&&!children.has(sub.id)&&str(sub.name),'子模組項目無效');children.add(sub.id);}}
    return value;
  }
  function validateModule(value,catalog){
    assert(value?.schemaVersion===1&&catalog.modules.some(entry=>entry.id===value.id)&&value.assets&&Array.isArray(value.pages),'模組內容格式無效');
    const submodules=new Set(catalog.modules.find(entry=>entry.id===value.id).submodules.map(sub=>sub.id));
    for(const page of value.pages)assert(page.submoduleId===undefined||submodules.has(page.submoduleId),'解說頁的子模組歸屬無效');
    for(const asset of Object.values(value.assets))assert(safePath(asset.file)&&asset.file.startsWith('materials/03-modules/')&&Number.isFinite(asset.width)&&asset.width>0&&Number.isFinite(asset.height)&&asset.height>0&&str(asset.label),'模組圖片資料無效');
    const ids=new Set();for(const page of value.pages){assert(/^m201-[\w-]+$/.test(page.id)&&!ids.has(page.id)&&str(page.title)&&Array.isArray(page.assets)&&page.assets.every(id=>Object.hasOwn(value.assets,id))&&Array.isArray(page.points)&&Array.isArray(page.sourcePages),'模組頁面資料無效');ids.add(page.id);const points=new Set();for(const point of page.points){assert(/^[\w-]+$/.test(point.id)&&!points.has(point.id)&&str(point.title)&&str(point.text),'模組說明項目無效');points.add(point.id);if(point.focus){const asset=value.assets[point.focus.asset];assert(asset,'圖面定位引用無效');if(point.focus.rect){const b=point.focus.rect;assert(Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=0&&b[1]>=0&&b[2]>0&&b[3]>0&&b[0]+b[2]<=asset.width&&b[1]+b[3]<=asset.height,'圖面定位超出素材範圍');}}}}
    const flows=new Set(),anchors=new Set();
    for(const flow of value.submoduleFlows||[]){
      assert(submodules.has(flow.submoduleId)&&!flows.has(flow.submoduleId)&&Array.isArray(flow.stages)&&flow.stages.length===3,'子模組流程無效');flows.add(flow.submoduleId);
      assert(flow.stages.map(stage=>stage.id).join(',')==='issues,diagram,extensions','子模組主題順序無效');
      for(const stage of flow.stages){
        const base=value.pages.find(page=>page.id===stage.pageId);
        assert(base?.submoduleId===flow.submoduleId&&!anchors.has(stage.pageId)&&str(stage.title),'子模組主題頁無效');anchors.add(stage.pageId);
        if(stage.topics===undefined){assert(stage.id==='issues','解說主題缺少項目');assert((base.references||[]).every(reg=>str(value.referenceNames?.[reg])),'相關條文名稱缺漏');continue;}
        assert(Array.isArray(stage.topics)&&stage.topics.length>0,'解說項目清單無效');const topics=new Set(),covered=new Set();
        for(const topic of stage.topics){
          const source=value.pages.find(page=>page.id===topic.sourcePageId);
          assert(/^[\w-]+$/.test(topic.id)&&!topics.has(topic.id)&&str(topic.label)&&source?.submoduleId===flow.submoduleId,'解說項目引用無效');topics.add(topic.id);
          const pointIds=topic.pointIds||source.points.map(point=>point.id);
          assert(Array.isArray(pointIds)&&pointIds.length>0&&new Set(pointIds).size===pointIds.length&&pointIds.every(id=>source.points.some(point=>point.id===id)),'解說項目內容引用無效');
          for(const id of pointIds){const key=source.id+':'+id;assert(!covered.has(key),'解說項目內容重複');covered.add(key);}
          if(topic.assets)assert(Array.isArray(topic.assets)&&new Set(topic.assets).size===topic.assets.length&&topic.assets.every(id=>source.assets.includes(id)),'解說項目圖例引用無效');
        }
      }
    }
    return value;
  }
  let catalog=null,content=null,loadError='',presentation=null,moduleReturn=null;
  const selectedAssets=new Map(),selectedPoints=new Map(),selectedTopics=new Map(),extensionGroups=new Map();let pendingFocus=null,extensionFooter=null;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const assetKey=id=>'module:'+id;
  const sourcePoint=(page,id)=>page.points.find(point=>point.id===id);
  function activePoint(page){const stored=window.visualLayoutEditor?.store?.config.content.modules[page.id]?.points,ids=new Set((stored||page.points).filter(point=>pointVisible(page.id,point)).map(point=>point.id)),assets=page.mode==='pair'?page.assets:[selectedAssets.get(page.id)||page.assets[0]];return sourcePoint(page,selectedPoints.get(page.id))&&ids.has(selectedPoints.get(page.id))?sourcePoint(page,selectedPoints.get(page.id)):page.points.find(point=>ids.has(point.id)&&point.focus?.rect&&assets.includes(point.focus.asset));}
  function stageContext(id){for(const flow of content?.submoduleFlows||[])for(const stage of flow.stages)if(stage.pageId===id)return {flow,stage};return null;}
  function displayContext(id=presentation?.page.id){
    const context=stageContext(id);if(!context)return {source:content?.pages.find(page=>page.id===id)};
    const topic=context.stage.topics?.find(topic=>topic.id===selectedTopics.get(id))||context.stage.topics?.[0];
    const source=content.pages.find(page=>page.id===(topic?.sourcePageId||id));
    return {...context,topic,source};
  }
  const currentPage=()=>{const {source,topic}=displayContext();return source&&topic?.assets?{...source,assets:topic.assets,mode:topic.assets.length>1?source.mode:undefined}:source;};
  function pointVisible(pageId,point,topicId){
    const {stage,topic:active}=displayContext(),topic=topicId?stage?.topics?.find(topic=>topic.id===topicId):active;if(!topic||topic.sourcePageId!==pageId)return true;
    const siblings=stage.topics.filter(value=>value.sourcePageId===pageId);
    if(point.topicId&&siblings.some(value=>value.id===point.topicId))return point.topicId===topic.id;
    const owner=siblings.find(value=>!value.pointIds||value.pointIds.includes(point.id))||siblings[0];return owner.id===topic.id;
  }
  function resolvePage(id,topicRoute){
    let context=stageContext(id),alias;
    if(!context)for(const flow of content?.submoduleFlows||[])for(const stage of flow.stages){const topic=stage.topics?.find(topic=>topic.sourcePageId===id);if(topic){context={flow,stage};alias=topic.id;break;}}
    if(!context)return id;
    if(topicRoute!==undefined){const wanted=topicRoute.replace(/^topic-/,'');selectedTopics.set(context.stage.pageId,context.stage.topics?.some(topic=>topic.id===wanted)?wanted:context.stage.topics?.[0]?.id);}
    else if(alias)selectedTopics.set(context.stage.pageId,alias);
    return context.stage.pageId;
  }
  function hashFor(page){const {stage,topic}=displayContext(page.id);return '#'+page.id+(topic&&stage.id!=='extensions'?'/topic-'+topic.id:'');}
  function extensionPaging(){return Boolean(document.fullscreenElement)&&innerWidth>900&&!document.body.classList.contains('is-editing')&&displayContext().stage?.id==='extensions';}
  function syncExtensionControls(page){
    const next=document.getElementById('next-label'),previous=document.getElementById('previous');
    if(page)extensionFooter={pageId:page.id,next:next.textContent};
    const {stage}=displayContext(),grid=document.querySelector('.module-extension-grid');if(stage?.id!=='extensions'||!grid)return;
    const paging=extensionPaging(),total=Math.ceil(stage.topics.length/2),group=Math.max(0,Math.min(total-1,extensionGroups.get(stage.pageId)||0));extensionGroups.set(stage.pageId,group);
    let changed=false;for(const card of grid.children){const hide=paging&&Number(card.dataset.extensionGroup)!==group;if(card.hidden!==hide){card.hidden=hide;changed=true;}}
    const pager=document.querySelector('.module-extension-pager');pager.hidden=!paging;
    pager.querySelector('[data-module-extension-step="-1"]').disabled=group===0;pager.querySelector('[data-module-extension-step="1"]').disabled=group===total-1;
    pager.querySelector('[data-extension-range]').textContent=(group*2+1)+'–'+Math.min(stage.topics.length,group*2+2)+' / '+stage.topics.length;
    if(paging&&group<total-1)next.textContent='下一組延伸應用';else if(extensionFooter?.pageId===stage.pageId)next.textContent=extensionFooter.next;
    document.getElementById('next').setAttribute('aria-label',next.textContent);previous.setAttribute('aria-label',paging&&group>0?'上一組延伸應用':'上一頁');
    if(changed)window.visualLayoutEditor?.render();
  }
  function moveExtensionGroup(direction){
    if(!extensionPaging())return false;const {stage}=displayContext(),group=extensionGroups.get(stage.pageId)||0,target=group+direction;
    if(target<0||target>=Math.ceil(stage.topics.length/2))return false;
    extensionGroups.set(stage.pageId,target);syncExtensionControls();return true;
  }
  const keyFor=(page,point)=>'module:'+page.id+':'+point.id;
  const validBox=(box,asset)=>Array.isArray(box)&&box.length===4&&box.every(Number.isFinite)&&box[0]>=0&&box[1]>=0&&box[2]>0&&box[3]>0&&box[0]+box[2]<=asset.width+.01&&box[1]+box[3]<=asset.height+.01;
  async function load(){
    try{const responses=await Promise.all(['data/modules/catalog.json','data/modules/M2-01.json'].map(file=>fetch(new URL(file,document.baseURI),{cache:'no-store'})));for(const response of responses)if(!response.ok)throw new Error('HTTP '+response.status);catalog=validateCatalog(await responses[0].json());content=validateModule(await responses[1].json(),catalog);}
    catch(error){loadError=error.message||'讀取失敗';}
  }
  function prepare(data){if(!content)return;for(const [id,asset]of Object.entries(content.assets)){const key=assetKey(id);data.embeddedAssets[key]={url:asset.file,width:asset.width,height:asset.height};data.assetMeta[key]={label:asset.label,rotation:0,module:content.id,credit:asset.credit};}}
  const submodulePageId=sub=>'submodule-'+sub.id.replace(/\./g,'-');
  function pagesForModule(entry){
    const chapter='modules-'+entry.theme;
    if(entry.id===content?.id)return [...content.pages.filter(page=>!content.submoduleFlows?.some(flow=>flow.submoduleId===page.submoduleId)||stageContext(page.id)).map(page=>{const context=stageContext(page.id),sub=entry.submodules.find(sub=>sub.id===page.submoduleId);return {id:page.id,chapter,kind:'module',name:context?sub.id+' '+sub.name+'｜'+context.stage.title:page.title,...(page.submoduleId?{submoduleId:page.submoduleId}:{})};}),...entry.submodules.filter(sub=>!content.pages.some(page=>page.submoduleId===sub.id)).map(sub=>({id:submodulePageId(sub),chapter,kind:'presentation-empty',name:sub.name,moduleId:entry.id,submoduleId:sub.id}))];
    const single=entry.submodules.length===1?entry.submodules[0]:null;
    return [{id:'module-'+entry.id,chapter,kind:'presentation-empty',name:single?.name||entry.name,moduleId:entry.id,...(single?{submoduleId:single.id}:{})},...(entry.submodules.length>1?entry.submodules.map(sub=>({id:submodulePageId(sub),chapter,kind:'presentation-empty',name:sub.name,moduleId:entry.id,submoduleId:sub.id})):[])];
  }
  function pages(){return [{id:'modules-structure',chapter:'modules-intro',kind:'module',name:'功能模組架構'},{id:'modules-index',chapter:'modules-intro',kind:'module',name:'全部模組總覽'},...(catalog?.themes||['M1','M2','M3','M4'].map(id=>({id,name:id}))).flatMap(theme=>[{id:'modules-'+theme.id,chapter:'modules-'+theme.id,kind:'module',name:theme.name,theme:theme.id},...(catalog?.modules||[]).filter(entry=>entry.theme===theme.id).flatMap(pagesForModule)])];}
  function toc(){return `<section class="toc-group module-toc"><h3>功能模組 / M2-01</h3><div class="toc-pages">${pages().map(page=>`<button data-page="${page.id}">${esc(page.name)}</button>`).join('')}</div></section>`;}
  function switcher(page){
    const id=page.moduleId||(content?.pages.some(item=>item.id===page.id)?content.id:null),active=catalog?.modules.find(entry=>entry.id===id);
    if(!active)return '';
    return `<nav class="scenario-switcher module-switcher" aria-label="${active.theme} 章內模組切換"><button type="button" data-page="modules-index" class="scenario-back">全部模組總覽 ↖</button>${catalog.modules.filter(entry=>entry.theme===active.theme).map(entry=>`<button type="button" data-module-id="${entry.id}" data-page="${entry.id===content?.id?'m201-overview':'module-'+entry.id}" class="${entry.id===active.id?'active':''}" ${entry.id===active.id?'aria-current="page"':''}><strong>${entry.id}</strong> ${esc(entry.name)}</button>`).join('')}</nav>`;
  }
  function submoduleContext(page){
    const item=content?.pages.find(item=>item.id===page.id),id=page.moduleId||(item?content.id:null),entry=catalog?.modules.find(entry=>entry.id===id);
    return {entry,submoduleId:page.submoduleId||item?.submoduleId||null};
  }
  function submoduleStart(entry,sub){
    if(entry.id===content?.id)return content.pages.find(page=>(page.submoduleId||null)===(sub?.id||null))?.id||(sub?submodulePageId(sub):content.pages[0]?.id);
    return sub?submodulePageId(sub):'module-'+entry.id;
  }
  function subnavigation(page){
    const {entry,submoduleId}=submoduleContext(page);
    if(!entry||entry.submodules.length<2)return '';
    const choices=[{id:'overview',name:'總覽',pageId:submoduleStart(entry,null)},...entry.submodules.map(sub=>({id:sub.id,name:sub.id+' '+sub.name,pageId:submoduleStart(entry,sub)}))];
    return `<nav class="module-subnav" aria-label="${entry.id} 子分類"><span class="module-subnav-label">子分類</span>${choices.map(choice=>`<button type="button" data-submodule-id="${choice.id}" data-page="${choice.pageId}" ${(submoduleId||'overview')===choice.id?'class="active" aria-current="page"':''}>${esc(choice.name)}</button>`).join('')}</nav>`;
  }
  function contentNavigation(page){
    const {entry,submoduleId}=submoduleContext(page);
    if(!entry||entry.id!==content?.id)return '';
    const {stage,topic}=displayContext(page.id);
    if(stage?.id==='issues')return articleRefs(displayContext(page.id).source,true);
    if(stage?.id==='extensions')return '';
    if(stage)return topic?`<nav class="article-nav module-topic-nav" aria-label="${stage.title}項目選擇"><span class="nav-label">${stage.title}</span>${stage.topics.map(value=>`<button type="button" class="article-chip${value.id===topic.id?' active':''}" data-module-topic="${value.id}" aria-pressed="${value.id===topic.id}">${esc(value.label)}</button>`).join('')}</nav>`:'';
    const items=content.pages.filter(item=>entry.submodules.length<2||(item.submoduleId||null)===submoduleId);
    return `<nav class="module-page-nav" aria-label="${submoduleId||entry.id+' 總覽'} 內容選擇">${items.map((item,index)=>`<button type="button" data-page="${item.id}" ${item.id===page.id?'aria-current="page"':''}><span>${String(index+1).padStart(2,'0')}</span>${esc(item.title.replace(/^(停管制|讓管制)：/,''))}</button>`).join('')}</nav>`;
  }
  function heading(kicker,title,intro){return `<header class="module-heading"><span class="eyebrow">${esc(kicker)}</span><h1 id="slide-title">${esc(title)}</h1><p>${esc(intro)}</p></header>`;}
  function structure(){return `<section class="slide module-slide module-structure">${heading('FUNCTIONAL MODULES','從設施搭配，走到完整路口。','依交通功能與管制目的，將標誌、標線、號誌及其他交通工程設施整理為可重複運用、相互組合的設計單元。')}<div class="module-structure-grid"><div><div class="module-levels"><div><b>04</b><span>主題</span></div><i>→</i><div><b>15</b><span>模組</span></div><i>→</i><div><b>27</b><span>子模組</span></div></div><div class="module-theme-grid">${catalog.themes.map(theme=>`<button class="module-theme theme-${theme.id}" data-module-category="${theme.id}"><span>${theme.id}</span><h2>${esc(theme.name)}</h2><p>${esc(theme.question)}</p><small>${catalog.modules.filter(entry=>entry.theme===theme.id).length} 個模組 ↗</small></button>`).join('')}</div></div><aside class="module-feature"><span class="tag">本次完整示範</span><h2>M2-01<br>停、讓管制</h2><p>從通行優先關係出發，對照停、讓兩種基本配置，再檢視行穿線、庇護與緩衝空間。</p><div class="module-feature-images"><img src="${content.assets['stop-basic'].file}" alt="停管制代表型"><img src="${content.assets['yield-basic'].file}" alt="讓管制代表型"></div><button class="primary-button" data-page="m201-overview">進入 M2-01 <span>→</span></button><button class="text-button" data-page="modules-index">查看全部模組 ↗</button></aside></div><p class="module-source-note">依 output_1027.pdf 正文第 3–5 頁；條文、功能模組與道路情境可互相參照。</p></section>`;}
  function index(category='all'){
    const entries=catalog.modules.filter(entry=>category==='all'||entry.theme===category),theme=catalog.themes.find(theme=>theme.id===category);
    const cards=values=>`<div class="module-catalog-grid">${values.map(entry=>`<button class="module-catalog-card theme-${entry.theme}" data-page="${entry.ready?'m201-overview':'module-'+entry.id}"><div><b>${entry.id}</b><small>${entry.ready?'圖文示範':'內容留空'}</small></div><h2>${esc(entry.name)}</h2><ul>${entry.submodules.map(sub=>`<li>${esc(sub.name)}</li>`).join('')}</ul><span>${entry.ready?'查看完整內容':'開啟預留頁'} ↗</span></button>`).join('')}</div>`;
    return `<section class="slide module-slide module-index${theme?' module-topic-index':''}">${theme?'<button type="button" class="catalog-back" data-page="modules-index">全部模組總覽 ↖</button>':''}${heading(theme?'FUNCTIONAL MODULES / '+theme.id:'00 / MODULE DIRECTORY',theme?theme.name:'全部模組總覽',theme?theme.description:'依 M1–M4 分組瀏覽全部 15 個模組及其子分類；M2-01 提供完整圖文示範。')}${theme?cards(entries):catalog.themes.map(group=>`<section class="module-catalog-group" data-module-group="${group.id}"><h2>${group.id} ${esc(group.name)}</h2>${cards(entries.filter(entry=>entry.theme===group.id))}</section>`).join('')}<p class="module-source-note">${entries.length} 個模組 · 架構依原稿表 1.3 整理</p></section>`;
  }
  function figure(page,id){const asset=content.assets[id],key=assetKey(id);return `<figure class="map-card module-map-card"><div class="map-toolbar"><strong>${esc(asset.label)}</strong><div class="map-tools"><button data-asset="${key}">原圖 ↗</button></div></div><div class="map-canvas module-map-canvas" data-editor-image-key="${key}"><svg class="scenario-detail-image module-diagram" viewBox="0 0 ${asset.width} ${asset.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(asset.label)}"><image href="${esc(presentation?.data.embeddedAssets[key]?.url||asset.file)}" width="${asset.width}" height="${asset.height}"/><g class="module-hotspot-layer" aria-hidden="true"></g></svg></div><figcaption class="map-foot"><span>${esc(asset.caption)}</span><span>滾輪縮放 · 左鍵拖曳</span></figcaption><p class="module-asset-credit">${esc(asset.credit)}</p></figure>`;}
  function visuals(page){if(!page.assets.length)return applications();if(page.mode==='pair')return `<div class="module-pair ${page.id==='m201-yield-buffer'?'module-pair-buffer':''}">${page.assets.map(id=>figure(page,id)).join('')}</div>`;const id=page.assets.includes(selectedAssets.get(page.id))?selectedAssets.get(page.id):page.assets[0];return `${page.assets.length>1?`<div class="module-asset-tabs" data-editor-ui="module-view-tabs">${page.assets.map(value=>`<button data-module-view="${value}" aria-pressed="${id===value}">${esc(content.assets[value].label)}</button>`).join('')}</div>`:''}${figure(page,id)}`;}
  function applications(){const names={'G1-01':'市區正交三岔','G1-02':'鄉區正交三岔','G1-03':'市區匯入型巷道','G1-04':'鄉區匯入型巷道','G1-05':'市區斜交三岔','G1-06':'鄉區斜交三岔','G3-01':'市區正交四岔','G3-02':'鄉區正交四岔','G3-03':'市區斜交四岔','G3-04':'鄉區斜交四岔','C2-01':'部分苜蓿葉型交流道','C3-01':'鐵路平交道','C4-04':'路段中央分隔迴轉道'};return `<div class="module-applications">${[['stop','停管制'],['yield','讓管制']].map(([type,label])=>`<section><h2>${label}的適用情境</h2><div class="module-case-grid">${content.applications[type].map(code=>{const scene=presentation.data.scenarios.find(scene=>scene.code===code);return `<${scene?'button':'div'} class="module-case" ${scene?`data-module-scenario="${scene.overviewId}"`:''}><b>${code}</b><span>${esc(names[code])}</span><small>${scene?'查看整體配置 ↗':'內容待擴充'}</small></${scene?'button':'div'}>`;}).join('')}</div></section>`).join('')}</div>`;}
  function articleRefs(page,footer=false){
    if(footer)return `<nav class="article-nav module-related-nav" aria-label="本子模組相關條文"><span class="nav-label">相關條文</span>${(page.references||[]).map(reg=>`<button type="button" class="article-chip" data-module-reference="${reg}" title="§${reg} ${esc(content.referenceNames[reg])}"><span>§${reg}</span>${esc(content.referenceNames[reg])}</button>`).join('')}</nav>`;
    return `<div class="module-reference-row"><span>相關條文</span>${(page.references||[]).map(reg=>`<button data-module-reference="${reg}">§${reg}</button>`).join('')}</div>`;
  }
  function pointList(source){return `<ol class="module-explain-points">${source.points.map(point=>`<li data-module-point="${point.id}"><h3 data-block-edit-key="${source.id}|module|${point.id}|title">${esc(point.title)}</h3><p data-block-edit-key="${source.id}|module|${point.id}|text">${esc(point.text)}</p></li>`).join('')}</ol>`;}
  function extensionFigure(id){const asset=content.assets[id],key=assetKey(id);return `<figure class="module-extension-image custom-image-frame" data-editor-image-key="${key}"><button type="button" class="module-extension-image-open" data-asset="${key}" aria-label="放大${esc(asset.label)}"><img class="module-extension-thumbnail" src="${esc(presentation?.data.embeddedAssets[key]?.url||asset.file)}" alt="${esc(asset.label)}" draggable="false"></button><figcaption>${esc(asset.caption)} ↗</figcaption></figure>`;}
  function extensionSlide(page,stage,sub){
    const cards=stage.topics.map((topic,index)=>{
      const source=content.pages.find(source=>source.id===topic.sourcePageId),assets=topic.assets||source.assets;
      return `<article class="module-extension-card${assets.length?' has-images':' text-only'}" data-extension-group="${Math.floor(index/2)}" data-module-source-page="${source.id}" data-module-topic-id="${topic.id}"><header class="module-extension-card-heading"><span>${String(index+1).padStart(2,'0')}</span><h2 data-block-edit-key="${stage.pageId}|extension|${topic.id}|title">${esc(topic.label)}</h2></header>${assets.length&&source.notice?`<p class="module-extension-notice" data-editor-ui="module-image-note">${esc(source.notice)}</p>`:''}<div class="module-extension-body"><div class="module-extension-copy">${pointList(source)}</div>${assets.length?`<div class="module-extension-images${assets.length>1?' is-pair':''}">${assets.map(extensionFigure).join('')}</div>`:''}</div></article>`;
    }).join('');
    return `<section class="slide module-slide module-detail module-extension-slide" data-module-id="${content.id}" data-module-stage="extensions">${switcher(page)}${subnavigation(page)}${heading(sub.id+' / '+(sub.id.endsWith('.1')?'STOP CONTROL':'YIELD CONTROL')+' · 3 / 3',sub.name+'｜'+stage.title,'依主題檢視延伸應用，附圖可點選放大。')}<div class="module-extension-grid">${cards}</div><div class="module-extension-footer"><button class="text-button module-extension-source" data-module-source>原稿出處與圖例來源 ↗</button><nav class="module-extension-pager" aria-label="延伸應用分組" data-editor-ui="extension-pager" hidden><button type="button" data-module-extension-step="-1">← 上一組</button><span data-extension-range role="status" aria-live="polite"></span><button type="button" data-module-extension-step="1">下一組 →</button></nav></div></section>`;
  }
  function render(page){
    if(loadError||!catalog||!content)return `<section class="slide module-slide">${heading('MODULES','模組內容尚未載入','請使用本機預覽網址開啟，並確認 data/modules 中的 JSON 檔案可讀取。')}<p>${esc(loadError)}</p><button class="primary-button" data-module-reload>重新載入頁面</button></section>`;
    if(page.id==='modules-structure')return structure();if(page.id==='modules-index')return index();
    if(page.theme)return index(page.theme);
    const {source,stage,topic,flow}=displayContext(page.id);if(!source)return '';
    const item=topic?.assets?{...source,assets:topic.assets,mode:topic.assets.length>1?source.mode:undefined}:source;
    const sub=flow&&catalog.modules.find(entry=>entry.id===content.id).submodules.find(sub=>sub.id===flow.submoduleId),title=stage?sub.name+'｜'+stage.title:item.title;
    if(stage?.id==='extensions')return extensionSlide(page,stage,sub);
    const intro=stage?.topics?'點選下方項目，對照圖面與右側解說。':item.intro;
    return `<section class="slide module-slide module-detail${stage?' module-flow-detail':''}" data-module-id="M2-01" data-module-source-page="${item.id}" ${stage?`data-module-stage="${stage.id}"`:''}>${switcher(page)}${subnavigation(page)}${heading((sub?.id||'M2-01')+' / '+(item.section==='stop'?'STOP CONTROL':item.section==='yield'?'YIELD CONTROL':'FUNCTIONAL MODULE')+(stage?' · '+(flow.stages.indexOf(stage)+1)+' / 3':''),title,intro)}<div class="map-layout module-layout"><div class="module-visuals">${item.notice?`<p class="module-notice">${esc(item.notice)}</p>`:''}${visuals(item)}</div><aside class="custom-explanation module-explanation" aria-label="模組說明">${topic?`<h2 class="module-topic-title" data-editor-ui="module-topic-label">${esc(topic.label)}</h2>`:''}${stage?'':articleRefs(item)}<ol class="module-explain-points">${item.points.map(point=>`<li data-module-point="${point.id}"><h3 data-block-edit-key="${item.id}|module|${point.id}|title">${esc(point.title)}</h3><p data-block-edit-key="${item.id}|module|${point.id}|text">${esc(point.text)}</p></li>`).join('')}</ol><button class="text-button" data-module-source>原稿出處與圖例來源 ↗</button></aside></div>${contentNavigation(page)}</section>`;
  }
  function modal(title,body){const dialog=document.createElement('dialog');dialog.className='module-info-dialog';dialog.dataset.editorUi='module-info';dialog.innerHTML=`<div class="dialog-head"><h2>${esc(title)}</h2><button type="button" data-close aria-label="關閉">×</button></div>${body}`;document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();}
  function showInfo(id){const entry=catalog?.modules.find(entry=>entry.id===id);if(!entry)return;modal(entry.id+' '+entry.name,`<p>${esc(catalog.themes.find(theme=>theme.id===entry.theme).description)}</p><ul>${entry.submodules.map(sub=>`<li><b>${esc(sub.id)}</b> ${esc(sub.name)}</li>`).join('')}</ul><p class="module-source-note">此模組已建立架構索引；完整圖文內容可後續擴充。本次可先瀏覽 M2-01。</p><button class="primary-button" data-page="m201-overview">查看 M2-01 示範 →</button>`);}
function showSource(reg){const page=currentPage();const context=displayContext(),all=context.stage?.id==='extensions'?[...new Set(context.stage.topics.map(topic=>topic.sourcePageId))].map(id=>content.pages.find(page=>page.id===id)):null;const related=reg?content.pages.filter(value=>value.references?.includes(reg)):all|| (page?[page]:content.pages);modal(reg?'§'+reg+' / 模組中的配置說明':'M2-01 原稿出處',`<p>依 output_1027.pdf 第 3.2.1 節「M2-01 停、讓管制模組」。正文第 46–51 頁，對應 PDF 實際第 68–73 頁。</p>${related.map(item=>`<h3>${esc(item.title)}</h3><p>${esc(item.points.map(point=>point.text).join('\n\n'))}</p><small>正文第 ${item.sourcePages.join('、')} 頁</small>`).join('')}<h3>圖例來源</h3><ul>${Object.values(content.assets).map(asset=>`<li>${esc(asset.caption)}：${esc(asset.credit)}</li>`).join('')}</ul>`);}
  function connect(api){presentation=api;}
  function decorate(page){const active=page.kind==='module',button=document.querySelector('[data-module-entry]');button?.classList.toggle('active',active);button?.setAttribute('aria-current',active?'page':'false');if(active){document.getElementById('phase-label').textContent=page.id.startsWith('m201-')?'M2-01':page.theme||'模組架構';const next=content?.pages.findIndex(item=>item.id===page.id);if(next>=0&&next<content.pages.length-1)document.getElementById('next-label').textContent=content.pages[next+1].title;return;}
    for(const span of document.querySelectorAll('.module-row>span')){const match=span.textContent.match(/M[1-4]-\d{2}/);if(!match)continue;const entry=catalog?.modules.find(entry=>entry.id===match[0]);if(!entry)continue;const link=document.createElement('button');link.type='button';link.className='module-link';link.textContent=span.textContent;link.title=entry.name;link.dataset.openModule=entry.id;span.replaceWith(link);}
    if(moduleReturn&&page.scenario){const nav=document.querySelector('.scenario-switcher');if(nav&&!nav.querySelector('[data-back-module]')){const back=document.createElement('button');back.type='button';back.dataset.backModule='true';back.className='module-return';back.textContent='↖ 返回 M2-01';nav.append(back);}}
  }
  function frameFor(page,point,svg){const asset=content.assets[point.focus.asset],key=keyFor(page,point),state=window.generalRoadEditor.state,box=()=>validBox(state.highlights[key]?.box,asset)?state.highlights[key].box:point.focus.rect;return {key,label:point.title,element:svg,width:asset.width,height:asset.height,imageKey:assetKey(point.focus.asset),getBox:()=>[...box()],getCrop:()=>validBox(state.highlights[key]?.crop,asset)?[...state.highlights[key].crop]:[0,0,asset.width,asset.height],toSource:bounds=>bounds,fromSource:bounds=>bounds,setBounds:(_kind,bounds)=>[...bounds],defaults:{box:point.focus.rect,crop:[0,0,asset.width,asset.height]}};}
  function frames(){const page=currentPage();if(!page)return [];const point=activePoint(page);if(!point?.focus?.rect)return [];const svg=document.querySelector(`.module-map-canvas[data-editor-image-key="${assetKey(point.focus.asset)}"] svg`);return svg?[frameFor(page,point,svg)]:[];}
  function afterRender(){if(displayContext().stage?.id==='extensions')return;const page=currentPage();if(!page)return;const selected=activePoint(page)?.id;
    for(const row of document.querySelectorAll('[data-module-point]'))row.classList.toggle('is-module-point-active',row.dataset.modulePoint===selected);
    const point=sourcePoint(page,selected);if(point?.focus){const id=point.focus.asset,svg=document.querySelector(`.module-map-canvas[data-editor-image-key="${assetKey(id)}"] svg`);if(svg){const state=window.generalRoadEditor.state,key=keyFor(page,point),changed=Boolean(state.images[assetKey(id)]),box=point.focus.rect?(frames()[0]?.getBox()||point.focus.rect):null,disabled=state.disabledHighlights[key]||changed&&!state.highlights[key]?.box;
      if(box&&!disabled){const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');for(const [name,value]of Object.entries({x:box[0],y:box[1],width:box[2],height:box[3]}))rect.setAttribute(name,value);rect.classList.add('module-focus-rect');svg.querySelector('.module-hotspot-layer').append(rect);}
      if(pendingFocus===selected&&!disabled&&box){const crop=state.highlights[key]?.crop||[Math.max(0,box[0]-box[2]*.35),Math.max(0,box[1]-box[3]*.35),box[2]*1.7,box[3]*1.7];window.generalRoadViewport.get(svg)?.write(crop);}
    }}pendingFocus=null;
  }
  function noteReplacement(key){if(!content)return;for(const page of content.pages)for(const point of page.points)if(point.focus&&assetKey(point.focus.asset)===key)window.generalRoadEditor.state.disabledHighlights[keyFor(page,point)]=true;}
  if(typeof document==='object')document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||!presentation)return;
    if((button.id==='next'||button.id==='previous')&&moveExtensionGroup(button.id==='next'?1:-1)){event.preventDefault();event.stopImmediatePropagation();return;}
    if(button.hasAttribute('data-module-extension-step')){event.preventDefault();event.stopImmediatePropagation();moveExtensionGroup(Number(button.dataset.moduleExtensionStep));return;}
    if(button.dataset.openModule){event.preventDefault();event.stopImmediatePropagation();presentation.goPage(button.dataset.openModule==='M2-01'?(content?'m201-overview':'modules-index'):'module-'+button.dataset.openModule);}
    else if(button.dataset.moduleCategory){event.preventDefault();event.stopImmediatePropagation();const category=button.dataset.moduleCategory;presentation.goPage(category==='all'?'modules-index':'modules-'+category,0,{force:true});}
    else if(button.dataset.moduleInfo){event.preventDefault();event.stopImmediatePropagation();showInfo(button.dataset.moduleInfo);}
    else if(button.dataset.moduleTopic){event.preventDefault();event.stopImmediatePropagation();const {stage}=displayContext();if(stage?.topics?.some(topic=>topic.id===button.dataset.moduleTopic)){selectedTopics.set(stage.pageId,button.dataset.moduleTopic);const source=currentPage();selectedPoints.delete(source.id);pendingFocus=activePoint(source)?.id;presentation.refresh();document.querySelector(`[data-module-topic="${button.dataset.moduleTopic}"]`)?.focus({preventScroll:true});}}
    else if(button.dataset.moduleView){event.preventDefault();event.stopImmediatePropagation();const page=currentPage();if(page){selectedAssets.set(page.id,button.dataset.moduleView);selectedPoints.delete(page.id);presentation.refresh();}}
    else if(button.dataset.moduleScenario){event.preventDefault();event.stopImmediatePropagation();moduleReturn={page:presentation.state.page,phase:presentation.state.phase};presentation.goPage(button.dataset.moduleScenario);}
    else if(button.hasAttribute('data-back-module')){event.preventDefault();event.stopImmediatePropagation();presentation.goPage(moduleReturn?.page||'m201-overview',moduleReturn?.phase||0);}
    else if(button.dataset.moduleReference){event.preventDefault();event.stopImmediatePropagation();showSource(button.dataset.moduleReference);}
    else if(button.hasAttribute('data-module-source')){event.preventDefault();event.stopImmediatePropagation();showSource();}
    else if(button.hasAttribute('data-module-reload'))location.reload();
  },true);
  if(typeof document==='object'){
    document.addEventListener('fullscreenchange',()=>syncExtensionControls());
    if(typeof window==='object')window.addEventListener('resize',()=>syncExtensionControls());
    document.addEventListener('keydown',event=>{
      if(event.ctrlKey||event.metaKey||event.altKey||event.target.isContentEditable||event.target.closest('input,textarea,select,.presentation-picker')||document.querySelector('dialog[open]'))return;
      if(['BUTTON','A'].includes(event.target.tagName)&&[' ','Enter'].includes(event.key))return;
      const direction=['ArrowRight','ArrowDown','PageDown',' '].includes(event.key)?1:['ArrowLeft','ArrowUp','PageUp'].includes(event.key)?-1:0;
      if(direction&&moveExtensionGroup(direction)){event.preventDefault();event.stopImmediatePropagation();}
    },true);
  }
  return {validateCatalog,validateModule,load,prepare,pages,toc,render,switcher,subnavigation,connect,decorate,afterRender,frames,noteReplacement,resolvePage,hashFor,displayContext,pointVisible,syncExtensionControls,get catalog(){return catalog;},get content(){return content;},get error(){return loadError;}};
});
