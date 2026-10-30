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
    for(const page of value.pages){assert(page.submoduleId===undefined||submodules.has(page.submoduleId),'解說頁的子模組歸屬無效');assert(page.defaultView===undefined||['single','pair'].includes(page.defaultView),'圖面預設顯示方式無效');}
    for(const page of value.pages)if(page.excludedOverviewPointIds!==undefined)assert(page===value.pages[0]&&!page.submoduleId&&Array.isArray(page.excludedOverviewPointIds)&&new Set(page.excludedOverviewPointIds).size===page.excludedOverviewPointIds.length&&page.excludedOverviewPointIds.every(id=>typeof id==='string'&&/^[\w-]+$/.test(id)),'總覽排除項目無效');
    for(const page of value.pages)if(page.overviewGroups!==undefined){
      assert(page===value.pages[0]&&!page.submoduleId&&page.overviewGroups&&typeof page.overviewGroups==='object'&&!Array.isArray(page.overviewGroups),'模組總覽圖框設定無效');
      for(const [id,group]of Object.entries(page.overviewGroups)){
        assert(submodules.has(id)&&group&&typeof group==='object'&&!Array.isArray(group),'總覽圖框的子模組無效');
        assert(group.label===undefined||str(group.label),'總覽圖框標題無效');
        assert(group.hidden===undefined||typeof group.hidden==='boolean','總覽圖框顯示設定無效');
        assert(group.sourceModuleId===undefined||catalog.modules.some(entry=>entry.id===group.sourceModuleId),'總覽圖框的共用模組無效');
        if(group.assets!==undefined){assert(Array.isArray(group.assets)&&group.assets.length>0&&new Set(group.assets).size===group.assets.length&&group.assets.every(id=>typeof id==='string'&&/^[\w-]+$/.test(id)),'總覽代表型清單無效');if(!group.sourceModuleId||group.sourceModuleId===value.id)assert(group.assets.every(id=>Object.hasOwn(value.assets,id)),'總覽代表型不存在');}
      }
    }
    for(const asset of Object.values(value.assets))assert(safePath(asset.file)&&asset.file.startsWith('materials/03-modules/')&&Number.isFinite(asset.width)&&asset.width>0&&Number.isFinite(asset.height)&&asset.height>0&&str(asset.label),'模組圖片資料無效');
    for(const asset of Object.values(value.assets))assert(asset.rotation===undefined||[0,90,180,270].includes(asset.rotation),'模組圖片方向無效');
    for(const page of value.pages)if(page.links)assert(Array.isArray(page.links)&&page.links.length>0&&page.links.every(link=>/^[\w-]+$/.test(link.pageId)&&str(link.label)&&(link.topicId===undefined||/^[\w-]+$/.test(link.topicId))),'模組轉介連結無效');
    const prefix=value.id.toLowerCase().replace('-','')+'-';
    const ids=new Set();for(const page of value.pages){assert(/^[\w-]+$/.test(page.id)&&page.id.startsWith(prefix)&&!ids.has(page.id)&&str(page.title)&&Array.isArray(page.assets)&&page.assets.every(id=>Object.hasOwn(value.assets,id))&&Array.isArray(page.points)&&Array.isArray(page.sourcePages),'模組頁面資料無效');ids.add(page.id);const points=new Set();for(const point of page.points){assert(/^[\w-]+$/.test(point.id)&&!points.has(point.id)&&str(point.title)&&str(point.text),'模組說明項目無效');points.add(point.id);if(point.focus){const asset=value.assets[point.focus.asset];assert(asset,'圖面定位引用無效');if(point.focus.rect){const b=point.focus.rect;assert(Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=0&&b[1]>=0&&b[2]>0&&b[3]>0&&b[0]+b[2]<=asset.width&&b[1]+b[3]<=asset.height,'圖面定位超出素材範圍');}}}}
    for(const page of value.pages)for(const point of page.points){
      assert(point.submoduleId===undefined||submodules.has(point.submoduleId),'說明項目的子模組歸屬無效');
      if(point.table!==undefined){const table=point.table;assert(table&&typeof table==='object'&&str(table.label)&&Array.isArray(table.headers)&&table.headers.length>=2&&table.headers.length<=12&&table.headers.every(str)&&Array.isArray(table.rows)&&table.rows.length>0&&table.rows.length<=200&&table.rows.every(row=>Array.isArray(row)&&row.length===table.headers.length&&row.every(str)),'模組說明表格無效');}
    }
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
  let catalog=null,loadError='',presentation=null,moduleReturn=null;
  const contents=new Map(),pageOwners=new Map(),moduleErrors=new Map();
  const moduleFor=id=>contents.get(id)||pageOwners.get(id)||null;
  const entryPoint=id=>contents.get(id)?.pages[0]?.id||'module-'+id;
  const selectedAssets=new Map(),selectedOverviewAssets=new Map(),selectedPoints=new Map(),selectedTopics=new Map(),extensionGroups=new Map(),comparisonPages=new Map();let pendingFocus=null,extensionFooter=null;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const assetKey=id=>'module:'+id;
  const sharedAsset=id=>{for(const content of contents.values())if(Object.hasOwn(content.assets,id))return content.assets[id];};
  function pagePoints(page){const configured=typeof window==='object'&&window.visualLayoutEditor?.store?.config.content.modules[page.id]?.points;if(!configured)return page.points;const originals=new Map(page.points.map(point=>[point.id,point]));return configured.map(point=>({...originals.get(point.id),...point,focus:originals.get(point.id)?.focus}));}
  const sourcePoint=(page,id)=>pagePoints(page).find(point=>point.id===id);
  function overviewGroups(page){
    const content=moduleFor(page.id),entry=catalog?.modules.find(entry=>entry.id===content?.id);
    if(!entry||entry.submodules.length<2||page.submoduleId||content.pages[0].id!==page.id)return [];
    return entry.submodules.map(sub=>{
      const flow=content.submoduleFlows?.find(flow=>flow.submoduleId===sub.id),source=content.pages.find(item=>item.id===flow?.stages.find(stage=>stage.id==='issues')?.pageId)||content.pages.find(item=>item.submoduleId===sub.id);
      const options=page.overviewGroups?.[sub.id]||{},owner=options.sourceModuleId?contents.get(options.sourceModuleId):content;
      if(options.hidden)return null;
      return {id:sub.id,key:page.id+'/'+sub.id,label:options.label||sub.id+' '+sub.name,sourcePageId:source?.id||submoduleStart(entry,sub),assets:owner?[...(options.assets||source?.assets||[])]:[],intro:source?.intro||''};
    }).filter(Boolean);
  }
  function overviewPoints(page,points=page.points){
    if(!overviewGroups(page).length)return points;
    const excluded=new Set(page.excludedOverviewPointIds||[]),originals=new Map(page.points.map(point=>[point.id,point]));
    return points.filter(point=>!excluded.has(point.id)).map(point=>{
      const id=originals.get(point.id)?.submoduleId;
      return id?{...point,title:id+' '+point.title.replace(/^M[1-4]-\d{2}\.\d+\s*/,'').trim()}:point;
    });
  }
  function overviewAsset(group){return group.assets.includes(selectedOverviewAssets.get(group.key))?selectedOverviewAssets.get(group.key):group.assets[0];}
  function shownAssets(page){const groups=overviewGroups(page);if(groups.length)return groups.map(overviewAsset).filter(Boolean);const id=page.assets.includes(selectedAssets.get(page.id))?selectedAssets.get(page.id):page.assets[0];return id?(page.mode==='pair'?[id,page.assets[(page.assets.indexOf(id)+1)%page.assets.length]]:[id]):[];}
  function activePoint(page){const points=pagePoints(page).filter(point=>pointVisible(page.id,point)),assets=shownAssets(page),state=typeof window==='object'?window.generalRoadEditor?.state||{}:{};return points.find(point=>point.id===selectedPoints.get(page.id))||points.find(point=>assets.some(id=>highlightSpec(page,point,id,state).hasBox))||(displayContext().stage?.id==='diagram'?points[0]:undefined);}
  const orderedStage=stage=>stage.id==='diagram'&&typeof window==='object'&&window.PresentationOrder?{...stage,topics:window.PresentationOrder.forKey(stage.topics,'module:'+stage.pageId)}:stage;
  function stageContext(id){const content=moduleFor(id);for(const flow of content?.submoduleFlows||[])for(const stage of flow.stages)if(stage.pageId===id)return {flow,stage:orderedStage(stage)};return null;}
  const currentConfig=()=>typeof window==='object'?window.visualLayoutEditor?.store?.config:null;
  const extensionRemoved=(id,config=currentConfig())=>Boolean(config?.removedModuleExtensions?.includes(id));
  const visibleStages=(flow,config=currentConfig())=>flow.stages.filter(stage=>stage.id!=='extensions'||!extensionRemoved(stage.pageId,config));
  function stageProgress(flow,stage){const stages=visibleStages(flow);return (stages.findIndex(value=>value.id===stage.id)+1)+' / '+stages.length;}
  function displayContext(id=presentation?.page.id){
    const content=moduleFor(id);
    const context=stageContext(id);if(!context)return {source:content?.pages.find(page=>page.id===id)};
    const topic=context.stage.topics?.find(topic=>topic.id===selectedTopics.get(id))||context.stage.topics?.[0];
    const source=content.pages.find(page=>page.id===(topic?.sourcePageId||id));
    return {...context,topic,source};
  }
  const visualPage=source=>source&&({...source,mode:(comparisonPages.get(source.id)??source.defaultView==='pair')&&source.assets.length>1?'pair':undefined});
  const currentPage=()=>{const {source,topic}=displayContext();return visualPage(source&&topic?.assets?{...source,assets:topic.assets}:source);};
  function pointVisible(pageId,point,topicId){
    const {stage,topic:active}=displayContext(),topic=topicId?stage?.topics?.find(topic=>topic.id===topicId):active;if(!topic||topic.sourcePageId!==pageId)return true;
    const siblings=stage.topics.filter(value=>value.sourcePageId===pageId);
    if(point.topicId&&siblings.some(value=>value.id===point.topicId))return point.topicId===topic.id;
    const owner=siblings.find(value=>!value.pointIds||value.pointIds.includes(point.id))||siblings[0];return owner.id===topic.id;
  }
  function resolvePage(id,topicRoute){
    for(const entry of catalog?.modules||[]){if(moduleErrors.has(entry.id)&&id.startsWith(entry.id.toLowerCase().replace('-','')+'-'))return 'module-'+entry.id;const content=contents.get(entry.id);if(!content)continue;if(id==='module-'+entry.id)return entryPoint(entry.id);const sub=entry.submodules.find(sub=>submodulePageId(sub)===id);if(sub)return submoduleStart(entry,sub);}
    const content=moduleFor(id);
    let context=stageContext(id),alias;
    if(!context)for(const flow of content?.submoduleFlows||[])for(const stage of flow.stages){const topic=stage.topics?.find(topic=>topic.sourcePageId===id);if(topic){context={flow,stage:orderedStage(stage)};alias=topic.id;break;}}
    if(!context)return id;
    if(context.stage.id==='extensions'&&extensionRemoved(context.stage.pageId))return context.flow.stages.find(stage=>stage.id==='diagram').pageId;
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
    const pager=document.querySelector('.module-extension-pager');pager.hidden=!paging||total<2;
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
    contents.clear();pageOwners.clear();moduleErrors.clear();loadError='';
    const read=async file=>{const response=await fetch(new URL(file,document.baseURI),{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);return response.json();};
    try{catalog=validateCatalog(await read('data/modules/catalog.json'));await Promise.all(catalog.modules.filter(entry=>entry.ready).map(async entry=>{
      try{const content=validateModule(await read('data/modules/'+entry.id+'.json'),catalog);assert(content.id===entry.id,'模組內容歸屬不符');
        for(const [id,asset]of Object.entries(content.assets))assert(![...contents.values()].some(value=>Object.hasOwn(value.assets,id)),'模組圖片 ID 重複');
        contents.set(entry.id,content);for(const page of content.pages)pageOwners.set(page.id,content);
      }catch(error){moduleErrors.set(entry.id,error.message||'讀取失敗');}
    }));
      for(const content of [...contents.values()])try{
        for(const page of content.pages)for(const group of Object.values(page.overviewGroups||{})){const owner=contents.get(group.sourceModuleId||content.id);if(owner&&group.assets)assert(group.assets.every(id=>Object.hasOwn(owner.assets,id)),'共用的總覽代表型不存在');}
      }catch(error){moduleErrors.set(content.id,error.message);contents.delete(content.id);for(const page of content.pages)pageOwners.delete(page.id);}
    }
    catch(error){loadError=error.message||'讀取失敗';}
  }
  function prepare(data){for(const content of contents.values())for(const [id,asset]of Object.entries(content.assets)){const key=assetKey(id);data.embeddedAssets[key]={url:asset.file,width:asset.width,height:asset.height};data.assetMeta[key]={label:asset.label,rotation:asset.rotation||0,module:content.id,credit:asset.credit};}}
  const submodulePageId=sub=>'submodule-'+sub.id.replace(/\./g,'-');
  function pagesForModule(entry){
    const chapter='modules-'+entry.theme,content=contents.get(entry.id);
    if(content)return [...content.pages.filter(page=>!content.submoduleFlows?.some(flow=>flow.submoduleId===page.submoduleId)||stageContext(page.id)).map(page=>{const context=stageContext(page.id),sub=entry.submodules.find(sub=>sub.id===page.submoduleId);return {id:page.id,chapter,kind:'module',moduleId:entry.id,name:context?sub.id+' '+sub.name+'｜'+context.stage.title:page.title,...(page.submoduleId?{submoduleId:page.submoduleId}:{})};}),...entry.submodules.filter(sub=>!content.pages.some(page=>page.submoduleId===sub.id)).map(sub=>({id:submodulePageId(sub),chapter,kind:'presentation-empty',name:sub.name,moduleId:entry.id,submoduleId:sub.id}))];
    if(moduleErrors.has(entry.id))return [{id:'module-'+entry.id,chapter,kind:'module',name:entry.name,moduleId:entry.id}];
    const single=entry.submodules.length===1?entry.submodules[0]:null;
    return [{id:'module-'+entry.id,chapter,kind:'presentation-empty',name:single?.name||entry.name,moduleId:entry.id,...(single?{submoduleId:single.id}:{})},...(entry.submodules.length>1?entry.submodules.map(sub=>({id:submodulePageId(sub),chapter,kind:'presentation-empty',name:sub.name,moduleId:entry.id,submoduleId:sub.id})):[])];
  }
  function pages(){return [{id:'modules-structure',chapter:'modules-intro',kind:'module',name:'功能模組架構'},{id:'modules-index',chapter:'modules-intro',kind:'module',name:'全部模組總覽'},...(catalog?.themes||['M1','M2','M3','M4'].map(id=>({id,name:id}))).flatMap(theme=>[{id:'modules-'+theme.id,chapter:'modules-'+theme.id,kind:'module',name:theme.name,theme:theme.id},...(catalog?.modules||[]).filter(entry=>entry.theme===theme.id).flatMap(pagesForModule)])];}
  function syncPages(target,config=currentConfig()){
    const extensions=pages().filter(page=>stageContext(page.id)?.stage.id==='extensions'),known=new Set(extensions.map(page=>page.id));
    for(let index=target.length-1;index>=0;index--)if(known.has(target[index].id)&&extensionRemoved(target[index].id,config))target.splice(index,1);
    for(const page of extensions){
      if(extensionRemoved(page.id,config)||target.some(item=>item.id===page.id))continue;
      const order=config?.legacyState?.pageOrder||[],rank=order.indexOf(page.id),after=rank>=0?order.slice(rank+1).find(id=>target.some(item=>item.id===id)):null;
      const before=rank>=0?[...order.slice(0,rank)].reverse().find(id=>target.some(item=>item.id===id)):null;
      const diagram=stageContext(page.id).flow.stages.find(stage=>stage.id==='diagram').pageId;
      const index=after?target.findIndex(item=>item.id===after):target.findIndex(item=>item.id===(before||diagram))+1;
      target.splice(Math.max(0,index),0,page);
    }
    return target;
  }
  function toc(){return `<section class="toc-group module-toc"><h3>交通管制設施模組</h3><div class="toc-pages">${pages().filter(page=>stageContext(page.id)?.stage.id!=='extensions'||!extensionRemoved(page.id)).map(page=>`<button data-page="${page.id}">${esc(page.name)}</button>`).join('')}</div></section>`;}
  function switcher(page){
    const id=page.moduleId||moduleFor(page.id)?.id,active=catalog?.modules.find(entry=>entry.id===id);
    if(!active)return '';
    return `<nav class="module-navigation" data-editor-ui="module-navigation" aria-label="模組與子分類"><div class="scenario-switcher module-switcher" role="group" aria-label="${active.theme} 章內模組切換"><button type="button" data-page="modules-index" class="scenario-back">全部模組總覽 ↖</button><select data-module-select aria-label="選擇${active.theme}章內模組">${catalog.modules.filter(entry=>entry.theme===active.theme).map(entry=>`<option value="${entryPoint(entry.id)}" data-module-id="${entry.id}" ${entry.id===active.id?'selected':''}>${entry.id} ${esc(entry.name)}</option>`).join('')}</select></div>${subnavigation(page)}</nav>`;
  }
  function submoduleContext(page){
    const content=moduleFor(page.id),item=content?.pages.find(item=>item.id===page.id),id=page.moduleId||content?.id,entry=catalog?.modules.find(entry=>entry.id===id);
    return {entry,submoduleId:page.submoduleId||item?.submoduleId||null};
  }
  function submoduleStart(entry,sub){
    const content=contents.get(entry.id);
    if(entry.id===content?.id)return content.pages.find(page=>(page.submoduleId||null)===(sub?.id||null))?.id||(sub?submodulePageId(sub):content.pages[0]?.id);
    return sub?submodulePageId(sub):'module-'+entry.id;
  }
  function subnavigation(page){
    const {entry,submoduleId}=submoduleContext(page);
    if(!entry||entry.submodules.length<2)return '';
    const choices=[{id:'overview',name:'總覽',pageId:submoduleStart(entry,null)},...entry.submodules.map(sub=>({id:sub.id,name:sub.id+' '+sub.name,pageId:submoduleStart(entry,sub)}))];
    return `<nav class="module-subnav${choices.length>4?' is-compact':''}" aria-label="${entry.id} 子分類" data-choice-count="${choices.length}"><div class="module-subnav-buttons">${choices.map(choice=>`<button type="button" data-submodule-id="${choice.id}" data-page="${choice.pageId}" ${(submoduleId||'overview')===choice.id?'class="active" aria-current="page"':''}>${esc(choice.name)}</button>`).join('')}</div><select data-module-subselect aria-label="選擇${entry.id}子分類">${choices.map(choice=>`<option value="${choice.pageId}" ${(submoduleId||'overview')===choice.id?'selected':''}>${esc(choice.name)}</option>`).join('')}</select></nav>`;
  }
  function syncNavigation(){
    const row=document.querySelector('.module-navigation'),sub=row?.querySelector('.module-subnav');if(!sub)return;
    sub.classList.remove('is-compact');
    if(Number(sub.dataset.choiceCount)>4||row.scrollWidth>row.clientWidth+1)sub.classList.add('is-compact');
  }
  function contentNavigation(page){
    const content=moduleFor(page.id);
    const {entry,submoduleId}=submoduleContext(page);
    if(!entry||entry.id!==content?.id)return '';
    const {stage,topic}=displayContext(page.id);
    if(stage?.id==='issues')return articleRefs(displayContext(page.id).source,true);
    if(stage?.id==='extensions')return '';
    if(stage)return topic?`<nav class="article-nav module-topic-nav" aria-label="${stage.title}項目選擇"><span class="nav-label">${stage.title}</span>${stage.topics.map(value=>`<button type="button" class="article-chip${value.id===topic.id?' active':''}" data-module-topic="${value.id}" aria-pressed="${value.id===topic.id}">${esc(value.label)}</button>`).join('')}</nav>`:'';
    const items=content.pages.filter(item=>entry.submodules.length<2||(item.submoduleId||null)===submoduleId);
    if(items.length<2)return '';
    return `<nav class="module-page-nav" aria-label="${submoduleId||entry.id+' 總覽'} 內容選擇">${items.map((item,index)=>`<button type="button" data-page="${item.id}" ${item.id===page.id?'aria-current="page"':''}><span>${String(index+1).padStart(2,'0')}</span>${esc(item.title.replace(/^(停管制|讓管制)：/,''))}</button>`).join('')}</nav>`;
  }
  function heading(kicker,title,intro,compact=false){const code=kicker.split(' / ')[0];return `<header class="module-heading${compact?' module-heading-compact':''}"><span class="eyebrow" ${compact&&title.startsWith(code)?'hidden':''}>${esc(compact?code+(kicker.match(/ · .+$/)?.[0]||''):kicker)}</span><h1 id="slide-title">${esc(title)}</h1><p>${esc(intro)}</p></header>`;}
function structure(){return `<section class="slide module-slide module-structure">${heading('FUNCTIONAL MODULES','從設施搭配，走到完整路口。','依交通功能與管制目的，將標誌、標線、號誌及其他交通工程設施整理為可重複運用、相互組合的設計單元。')}<div class="module-structure-grid"><div><div class="module-levels"><div><b>04</b><span>主題</span></div><i>→</i><div><b>15</b><span>模組</span></div><i>→</i><div><b>27</b><span>子模組</span></div></div><div class="module-theme-grid">${catalog.themes.map(theme=>`<button class="module-theme theme-${theme.id}" data-module-category="${theme.id}"><span>${theme.id}</span><h2>${esc(theme.name)}</h2><p>${esc(theme.question)}</p><small>${catalog.modules.filter(entry=>entry.theme===theme.id).length} 個模組 ↗</small></button>`).join('')}</div></div></div><p class="module-source-note">資料來源：道路交通標誌標線號誌設置參考指引。</p></section>`;}
  function index(category='all'){
    const entries=catalog.modules.filter(entry=>category==='all'||entry.theme===category),theme=catalog.themes.find(theme=>theme.id===category);
    const cards=values=>`<div class="module-catalog-grid">${values.map(entry=>`<button class="module-catalog-card theme-${entry.theme}" data-page="${entryPoint(entry.id)}"><div><b>${entry.id}</b><small>${contents.has(entry.id)?'圖文解說':moduleErrors.has(entry.id)?'載入失敗':'內容留空'}</small></div><h2>${esc(entry.name)}</h2><ul>${entry.submodules.map(sub=>`<li>${esc(sub.name)}</li>`).join('')}</ul><span>${contents.has(entry.id)?'查看完整內容':moduleErrors.has(entry.id)?'重新開啟':'開啟預留頁'} ↗</span></button>`).join('')}</div>`;
return `<section class="slide module-slide module-index${theme?' module-topic-index':''}">${theme?'<button type="button" class="catalog-back" data-page="modules-index">全部模組總覽 ↖</button>':''}${heading(theme?'FUNCTIONAL MODULES / '+theme.id:'00 / MODULE DIRECTORY',theme?theme.name:'全部模組總覽',theme?theme.description:'依 M1–M4 分組瀏覽模組與子分類，選擇主題查看圖文解說。')}${theme?cards(entries):catalog.themes.map(group=>`<section class="module-catalog-group" data-module-group="${group.id}"><h2>${group.id} ${esc(group.name)}</h2>${cards(entries.filter(entry=>entry.theme===group.id))}</section>`).join('')}<p class="module-source-note">${entries.length} 個模組 · 依交通功能分類</p></section>`;
  }
  function orientedImage(asset,key,classes){
    const angle=asset.rotation||0,width=angle%180?asset.height:asset.width,height=angle%180?asset.width:asset.height;
    const transform=angle===90?`translate(${asset.height} 0) rotate(90)`:angle===180?`translate(${asset.width} ${asset.height}) rotate(180)`:angle===270?`translate(0 ${asset.width}) rotate(-90)`:'';
    return `<svg class="${classes}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(asset.label)}"><g class="module-artwork" transform="${transform}"><image href="${esc(presentation?.data.embeddedAssets[key]?.url||asset.file)}" width="${asset.width}" height="${asset.height}"/><g class="module-hotspot-layer" aria-hidden="true"></g></g></svg>`;
  }
  function figure(page,id,controls=false,group=null){
    const content=moduleFor(page.id),asset=content.assets[id]||sharedAsset(id),key=assetKey(id),multiple=controls&&page.assets.length>1,index=page.assets.indexOf(id);
    const picker=multiple&&(group||page.mode!=='pair')?`<div class="module-figure-picker" data-editor-ui="module-view-tabs"><select data-module-view-select aria-label="選擇代表型">${page.assets.map(value=>`<option value="${value}" ${id===value?'selected':''}>${esc((content.assets[value]||sharedAsset(value)).label)}</option>`).join('')}</select><div class="module-figure-steps"><button type="button" data-module-view-step="-1" aria-label="上一張代表型">‹</button><span aria-live="polite">${index+1}／${page.assets.length}</span><button type="button" data-module-view-step="1" aria-label="下一張代表型">›</button></div></div>`:`<strong title="${esc(asset.label)}">${esc(asset.label)}</strong>`;
    return `<figure class="map-card module-map-card" ${group?`data-overview-submodule="${group.id}" data-overview-key="${group.key}"`:''}><div class="map-toolbar${group?' module-overview-toolbar':''}">${group?`<strong title="${esc(group.label)}">${esc(group.label)}</strong>${multiple?picker:''}`:picker}<div class="map-tools">${multiple&&!group?`<button type="button" data-module-compare aria-pressed="${page.mode==='pair'}" title="${page.mode==='pair'?'回到單張代表型':'與下一張代表型並排比較'}">${page.mode==='pair'?'單圖顯示':'並排比較'}</button>`:''}<button data-asset="${key}">原圖 ↗</button></div></div><div class="map-canvas module-map-canvas" data-editor-image-key="${key}">${orientedImage(asset,key,'scenario-detail-image module-diagram')}</div></figure>`;
  }
  function visuals(page){
    const groups=overviewGroups(page);
    if(groups.length)return `<div class="module-overview-grid${groups.some(group=>group.assets.length>1)?' has-switchers':''}" style="--overview-columns:${groups.length}">${groups.map(group=>group.assets.length?figure({...page,assets:group.assets},overviewAsset(group),true,group):`<article class="module-overview-reference" data-overview-submodule="${group.id}"><h2>${esc(group.label)}</h2><p>${esc(group.intro)}</p><button type="button" class="text-button" data-page="${group.sourcePageId}">查看說明 ↗</button></article>`).join('')}</div>`;
    if(!page.assets.length)return applications();
    const id=page.assets.includes(selectedAssets.get(page.id))?selectedAssets.get(page.id):page.assets[0];
    if(page.mode==='pair'){const next=page.assets[(page.assets.indexOf(id)+1)%page.assets.length];return `<div class="module-pair">${figure(page,id,true)}${figure(page,next)}</div>`;}
    return figure(page,id,true);
  }
  function applications(){const content=contents.get('M2-01');const names={'G1-01':'市區正交三岔','G1-02':'鄉區正交三岔','G1-03':'市區匯入型巷道','G1-04':'鄉區匯入型巷道','G1-05':'市區斜交三岔','G1-06':'鄉區斜交三岔','G3-01':'市區正交四岔','G3-02':'鄉區正交四岔','G3-03':'市區斜交四岔','G3-04':'鄉區斜交四岔','C2-01':'部分苜蓿葉型交流道','C3-01':'鐵路平交道','C4-04':'路段中央分隔迴轉道'};return `<div class="module-applications">${[['stop','停管制'],['yield','讓管制']].map(([type,label])=>`<section><h2>${label}的適用情境</h2><div class="module-case-grid">${content.applications[type].map(code=>{const scene=presentation.data.scenarios.find(scene=>scene.code===code);return `<${scene?'button':'div'} class="module-case" ${scene?`data-module-scenario="${scene.overviewId}"`:''}><b>${code}</b><span>${esc(names[code])}</span><small>${scene?'查看整體配置 ↗':''}</small></${scene?'button':'div'}>`;}).join('')}</div></section>`).join('')}</div>`;}
  function articleRefs(page,footer=false){
    const content=moduleFor(page.id);
    if(footer)return `<nav class="article-nav module-related-nav" aria-label="本子模組相關條文"><span class="nav-label">相關條文</span>${(page.references||[]).map(reg=>`<button type="button" class="article-chip" data-module-reference="${reg}" title="§ ${reg} ${esc(content.referenceNames[reg])}"><span>§ ${reg}</span>${esc(content.referenceNames[reg])}</button>`).join('')}</nav>`;
    return `<div class="module-reference-row"><span>相關條文</span>${(page.references||[]).map(reg=>`<button data-module-reference="${reg}">§ ${reg}</button>`).join('')}</div>`;
  }
  function pointTable(point){const table=point.table;if(!table)return '';return `<div class="module-point-table-wrap"><table class="module-point-table" aria-label="${esc(table.label)}"><thead><tr>${table.headers.map(header=>`<th scope="col">${esc(header)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row=>`<tr>${row.map((cell,index)=>index===0?`<th scope="row">${esc(cell)}</th>`:`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
  function pointList(source){return `<ol class="module-explain-points">${source.points.map(point=>`<li data-module-point="${point.id}"><h3 data-block-edit-key="${source.id}|module|${point.id}|title">${esc(point.title)}</h3><p data-block-edit-key="${source.id}|module|${point.id}|text">${esc(point.text)}</p>${pointTable(point)}</li>`).join('')}</ol>`;}
  function extensionFigure(id){const content=moduleFor(presentation.page.id),asset=content.assets[id],key=assetKey(id),swapped=(asset.rotation||0)%180;return `<figure class="module-extension-image custom-image-frame" data-editor-image-key="${key}" style="--extension-image-ratio:${swapped?asset.height:asset.width}/${swapped?asset.width:asset.height}"><button type="button" class="module-extension-image-open" data-asset="${key}" aria-label="放大${esc(asset.label)}">${asset.rotation?orientedImage(asset,key,'module-extension-thumbnail'):`<img class="module-extension-thumbnail" src="${esc(presentation?.data.embeddedAssets[key]?.url||asset.file)}" alt="${esc(asset.label)}" draggable="false">`}</button></figure>`;}
  function extensionLayout(content,stage,topic,config=typeof window==='object'?window.visualLayoutEditor?.store?.config:null){
    const source=content.pages.find(page=>page.id===topic.sourcePageId),assets=topic.assets||source.assets,key=stage.pageId+'/'+topic.id;
    const flat=assets.length>0&&assets.every(id=>{const asset=content.assets[id],swapped=(asset.rotation||0)%180;return (swapped?asset.height/asset.width:asset.width/asset.height)>=2;});
    const automatic=flat?'vertical':'horizontal',override=config?.extensionLayouts?.[key];
    return {key,automatic,layout:override||automatic,selected:override||'auto'};
  }
  function extensionLayoutControl(info){return `<label class="module-extension-layout-control" data-editor-ui="extension-layout">圖文排列<select data-module-extension-layout="${info.key}" aria-label="延伸應用圖文排列"><option value="auto" ${info.selected==='auto'?'selected':''}>自動（${info.automatic==='vertical'?'上下':'左右'}）</option><option value="horizontal" ${info.selected==='horizontal'?'selected':''}>左右排列</option><option value="vertical" ${info.selected==='vertical'?'selected':''}>上下排列</option></select></label>`;}
  function changeExtensionLayout(select){
    if(!window.generalRoadEditor.editing||window.visualLayoutEditor.editing||!['auto','horizontal','vertical'].includes(select.value))return;
    const card=select.closest('.module-extension-card'),{stage}=displayContext(),key=select.dataset.moduleExtensionLayout;
    if(stage?.id!=='extensions'||!stage.topics.some(topic=>stage.pageId+'/'+topic.id===key))return;
    const root=document.getElementById('presentation'),top=card.getBoundingClientRect().top,scroll=root.scrollTop;
    if(window.visualLayoutEditor.transact(next=>{if(select.value==='auto')delete next.extensionLayouts[key];else next.extensionLayouts[key]=select.value;},false)){
      presentation.refresh();const current=document.querySelector('[data-module-extension-layout="'+key+'"]');root.scrollTop=scroll;
      if(current){root.scrollTop+=current.closest('.module-extension-card').getBoundingClientRect().top-top;current.focus({preventScroll:true});}
      window.visualLayoutEditor.report('圖文排列已修改，請儲存設定。');
    }
  }
  function extensionPageActions(page){
    if(typeof window!=='object'||!window.generalRoadEditor?.editing||window.visualLayoutEditor?.editing)return '';
    const {flow,stage}=displayContext(page.id),extension=flow?.stages.find(stage=>stage.id==='extensions');if(!extension)return '';
    const removed=extensionRemoved(extension.pageId);if(!removed&&stage.id!=='extensions')return '';
    return `<div class="module-extension-page-actions" data-editor-ui="extension-page"><button type="button" data-module-toggle-extensions="${extension.pageId}" data-extension-action="${removed?'restore':'remove'}">${removed?'恢復延伸應用頁':'刪除整頁延伸應用'}</button></div>`;
  }
  function toggleExtensionPage(button){
    if(!window.generalRoadEditor.editing||window.visualLayoutEditor.editing||window.visualLayoutEditor.busy)return;
    const {flow}=displayContext(),id=button.dataset.moduleToggleExtensions,extension=flow?.stages.find(stage=>stage.id==='extensions'&&stage.pageId===id);if(!extension)return;
    const removed=extensionRemoved(id),target=removed?id:flow.stages.find(stage=>stage.id==='diagram').pageId;
    if(window.visualLayoutEditor.transact(next=>{next.removedModuleExtensions=next.removedModuleExtensions.filter(value=>value!==id);if(!removed)next.removedModuleExtensions.push(id);},false)){
      presentation.refreshStructure(target,0);document.querySelector('[data-module-toggle-extensions="'+id+'"]')?.focus({preventScroll:true});
      window.visualLayoutEditor.report(removed?'已恢復延伸應用頁，請儲存設定。':'已移除延伸應用頁，可在此恢復；請儲存設定。');
    }
  }
  function extensionSlide(page,stage,sub){
    const content=moduleFor(page.id);
    const cards=stage.topics.map((topic,index)=>{
      const source=content.pages.find(source=>source.id===topic.sourcePageId),assets=topic.assets||source.assets,layout=extensionLayout(content,stage,topic),editing=typeof window==='object'&&window.generalRoadEditor?.editing&&!window.visualLayoutEditor?.editing;
      return `<article class="module-extension-card${assets.length?' has-images':' text-only'}" data-extension-layout="${layout.layout}" data-extension-group="${Math.floor(index/2)}" data-module-source-page="${source.id}" data-module-topic-id="${topic.id}"><header class="module-extension-card-heading"><span>${String(index+1).padStart(2,'0')}</span><h2 data-block-edit-key="${stage.pageId}|extension|${topic.id}|title">${esc(topic.label)}</h2>${assets.length&&editing?extensionLayoutControl(layout):''}</header>${assets.length&&source.notice?`<p class="module-extension-notice" data-editor-ui="module-image-note">${esc(source.notice)}</p>`:''}<div class="module-extension-body"><div class="module-extension-copy">${pointList(source)}</div>${assets.length?`<div class="module-extension-images${assets.length>1?' is-pair':''}">${assets.map(extensionFigure).join('')}</div>`:''}</div></article>`;
    }).join('');
    return `<section class="slide module-slide module-detail module-extension-slide" data-module-id="${content.id}" data-module-stage="extensions">${switcher(page)}${extensionPageActions(page)}${heading(sub.id+' / '+(content.id==='M2-01'?(sub.id.endsWith('.1')?'STOP CONTROL':'YIELD CONTROL'):'FUNCTIONAL MODULE')+' · '+stageProgress(stageContext(page.id).flow,stage),sub.name+'｜'+stage.title,stage.intro||'依行人穿越、路口空間與車速，調整停讓配置。',true)}<div class="module-extension-grid" style="--module-extension-rows:${Math.ceil(stage.topics.length/2)}">${cards}</div><div class="module-extension-footer"><button class="text-button module-extension-source" data-module-source>資料來源 ↗</button><nav class="module-extension-pager" aria-label="延伸應用分組" data-editor-ui="extension-pager" hidden><button type="button" data-module-extension-step="-1">← 上一組</button><span data-extension-range role="status" aria-live="polite"></span><button type="button" data-module-extension-step="1">下一組 →</button></nav></div></section>`;
  }
  function render(page){
    const content=moduleFor(page.id);
    if(loadError||!catalog||moduleErrors.has(page.moduleId))return `<section class="slide module-slide">${heading('MODULES','模組內容尚未載入','請使用本機預覽網址開啟，並確認 data/modules 中的 JSON 檔案可讀取。')}<p>${esc(moduleErrors.get(page.moduleId)||loadError)}</p><button class="primary-button" data-module-reload>重新載入頁面</button></section>`;
    if(page.id==='modules-structure')return structure();if(page.id==='modules-index')return index();
    if(page.theme)return index(page.theme);
    const {source,stage,topic,flow}=displayContext(page.id);if(!source)return '';
    const item=visualPage(topic?.assets?{...source,assets:topic.assets}:source);
    const sub=flow&&catalog.modules.find(entry=>entry.id===content.id).submodules.find(sub=>sub.id===flow.submoduleId),title=stage?sub.name+'｜'+stage.title:item.title;
    if(stage?.id==='extensions')return extensionSlide(page,stage,sub);
    if(item.links)return `<section class="slide module-slide module-detail module-referral" data-module-id="${content.id}" data-module-source-page="${item.id}">${switcher(page)}${heading(item.submoduleId+' / MODULE REFERENCE',title,item.intro,true)}<div class="module-referral-content">${pointList(item)}<nav class="module-referral-links" aria-label="相關配置說明">${item.links.map(link=>`<button type="button" class="primary-button" data-module-route="${link.pageId}${link.topicId?'/topic-'+link.topicId:''}">${esc(link.label)} ↗</button>`).join('')}</nav></div></section>`;
    const intro=item.intro;
    const overview=overviewGroups(item).length>0,explanationHeading=overview?'<h2 class="module-summary-heading" data-editor-ui="module-summary-label">模組說明</h2>':(topic?`<h2 class="module-topic-title" data-editor-ui="module-topic-label">${esc(topic.label)}</h2>`:'')+(stage?'':articleRefs(item));
    return `<section class="slide module-slide module-detail${stage?' module-flow-detail':''}" data-module-id="${content.id}" data-module-source-page="${item.id}" ${stage?`data-module-stage="${stage.id}"`:''}>${switcher(page)}${extensionPageActions(page)}${heading((sub?.id||content.id)+' / '+(item.section==='stop'?'STOP CONTROL':item.section==='yield'?'YIELD CONTROL':'FUNCTIONAL MODULE')+(stage?' · '+stageProgress(flow,stage):''),title,intro,true)}<div class="map-layout module-layout"><div class="module-visuals">${item.notice?`<p class="module-notice">${esc(item.notice)}</p>`:''}${visuals(item)}</div><aside class="custom-explanation module-explanation" aria-label="模組說明">${explanationHeading}${pointList({...item,points:overviewPoints(item)})}${overview&&item.references?.length?articleRefs(item):''}${scenarioRefs(item)}<button class="text-button" data-module-source>資料來源 ↗</button></aside></div>${contentNavigation(page)}</section>`;
  }
  function modal(title,body){const dialog=document.createElement('dialog');dialog.className='module-info-dialog';dialog.dataset.editorUi='module-info';dialog.innerHTML=`<div class="dialog-head"><h2>${esc(title)}</h2><button type="button" data-close aria-label="關閉">×</button></div>${body}`;document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();}
  function showInfo(id){const entry=catalog?.modules.find(entry=>entry.id===id);if(entry)presentation.goPage(entryPoint(entry.id));}
  function scenarioRefs(page){
    if(!page.applications?.length&&!page.applicationNote)return '';
    const links=(page.applications||[]).map(code=>{
      const scene=presentation.data.scenarios.find(scene=>scene.code===code),target=scene?.overviewId||presentation.pages.find(page=>page.scenarioCode===code)?.id;
      const name=window.PresentationScenarios?.catalog?.scenarios.find(scene=>scene.id===code)?.name||code;
      return target?'<button type="button" data-module-scenario="'+target+'" title="'+esc(name)+'">'+code+' ↗</button>':'<span>'+code+'</span>';
    }).join('');
    return '<details class="module-scenario-refs" data-editor-ui="module-scenarios"><summary>適用情境'+(page.applications?.length?'（'+page.applications.length+'）':'')+'</summary>'+(page.applicationNote?'<p>'+esc(page.applicationNote)+'</p>':'')+'<div>'+links+'</div></details>';
  }

function showSource(reg){
    const page=currentPage(),content=moduleFor(presentation.page.id);if(!content)return;
    const context=displayContext(),all=context.stage?.id==='extensions'?[...new Set(context.stage.topics.map(topic=>topic.sourcePageId))].map(id=>content.pages.find(page=>page.id===id)):null;
    const related=reg?content.pages.filter(value=>value.references?.includes(reg)):all||(page?[page]:content.pages);
    modal(reg?'§ '+reg+' '+(content.referenceNames?.[reg]||''):content.id+' 資料來源',
      '<p>《道路交通標誌標線號誌設置參考指引》'+esc(content.source.section||'第 3.2.1 節「停、讓管制」，第 46–51 頁')+'。</p>'+
      (content.source.notes?.length?'<ul>'+content.source.notes.map(note=>'<li>'+esc(note)+'</li>').join('')+'</ul>':'')+
      related.map(item=>'<h3>'+esc(item.title)+'</h3><p>'+esc(item.points.map(point=>point.text).join('\n\n'))+'</p>'+item.points.filter(point=>point.table).map(pointTable).join('')+(item.sourcePages.length?'<small>正文第 '+item.sourcePages.join('、')+' 頁</small>':'')).join('')+
      '<h3>圖例來源</h3><ul>'+Object.values(content.assets).map(asset=>'<li>'+esc(asset.caption)+'：'+esc(asset.credit)+'</li>').join('')+'</ul>');
  }
  function connect(api){presentation=api;}
  function decorate(page){const active=page.kind==='module',button=document.querySelector('[data-module-entry]');button?.classList.toggle('active',active);button?.setAttribute('aria-current',active?'page':'false');if(active){document.getElementById('phase-label').textContent=page.moduleId||page.theme||'模組架構';return;}
    for(const span of document.querySelectorAll('.module-row>span')){const match=span.textContent.match(/M[1-4]-\d{2}/);if(!match)continue;const entry=catalog?.modules.find(entry=>entry.id===match[0]);if(!entry)continue;const link=document.createElement('button');link.type='button';link.className='module-link';link.textContent=span.textContent;link.title=entry.name;link.dataset.openModule=entry.id;span.replaceWith(link);}
    if(moduleReturn&&(page.scenario||page.scenarioCode)){const nav=document.querySelector('.scenario-switcher');if(nav&&!nav.querySelector('[data-back-module]')){const back=document.createElement('button');back.type='button';back.dataset.backModule='true';back.className='module-return';back.textContent='↖ 返回 '+(moduleReturn.moduleId||'M2-01');nav.append(back);}}
  }
  function highlightSpec(page,point,id,state={}){
    const asset=moduleFor(page.id)?.assets[id]||sharedAsset(id);if(!asset)return {hasBox:false,enabled:false};
    const original=point.focus?.asset===id,defaultBox=original&&validBox(point.focus.rect,asset)?point.focus.rect:null,key=keyFor(page,point)+(original?'':':'+id),saved=state.highlights?.[key]||{},box=validBox(saved.box,asset)?saved.box:defaultBox;
    return {key,asset,id,imageKey:assetKey(id),box:box&&[...box],defaultBox,hasBox:Boolean(box),enabled:Boolean(box)&&!state.disabledHighlights?.[key]&&!saved.deleted&&(!state.images?.[assetKey(id)]||validBox(saved.box,asset)),deleted:Boolean(saved.deleted),crop:validBox(saved.crop,asset)?[...saved.crop]:null};
  }
  function artworkMatrix(svg){return svg.getScreenCTM().inverse().multiply(svg.querySelector('.module-artwork').getScreenCTM());}
  function transformBox(box,matrix){const [x,y,w,h]=box,points=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix)),xs=points.map(p=>p.x),ys=points.map(p=>p.y);return [Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];}
  function candidateBox(svg,asset){
    const view=window.generalRoadViewport.get(svg)?.read()||[0,0,asset.width,asset.height];let bounds;
    try{bounds=transformBox(view,artworkMatrix(svg).inverse());}catch{bounds=[0,0,asset.width,asset.height];}
    const left=Math.max(0,bounds[0]),top=Math.max(0,bounds[1]),right=Math.min(asset.width,bounds[0]+bounds[2]),bottom=Math.min(asset.height,bounds[1]+bounds[3]),visible=right>left&&bottom>top?[left,top,right-left,bottom-top]:[0,0,asset.width,asset.height],w=Math.min(asset.width,Math.max(4,visible[2]*.35)),h=Math.min(asset.height,Math.max(4,visible[3]*.35));
    return [Math.max(0,Math.min(asset.width-w,visible[0]+(visible[2]-w)/2)),Math.max(0,Math.min(asset.height-h,visible[1]+(visible[3]-h)/2)),w,h];
  }
  function frameFor(page,point,svg,id){const state=window.generalRoadEditor.state,spec=highlightSpec(page,point,id,state),box=()=>highlightSpec(page,point,id,state).box||candidateBox(svg,spec.asset);return {key:spec.key,label:point.title,element:svg,coordinateElement:svg.querySelector('.module-artwork'),width:spec.asset.width,height:spec.asset.height,imageKey:spec.imageKey,allowDelete:true,hasBox:spec.hasBox,getBox:()=>[...box()],getCrop:()=>highlightSpec(page,point,id,state).crop||[0,0,spec.asset.width,spec.asset.height],toSource:bounds=>bounds,fromSource:bounds=>bounds,setBounds:(_kind,bounds)=>[...bounds],defaults:{box:spec.defaultBox||candidateBox(svg,spec.asset),crop:[0,0,spec.asset.width,spec.asset.height]}};}
  function frames(){const page=currentPage();if(!page||displayContext().stage?.id==='extensions')return [];const point=activePoint(page);if(!point)return [];const assets=shownAssets(page),id=assets.includes(point.focus?.asset)?point.focus.asset:assets[0];if(!id)return [];const svg=document.querySelector(`.module-map-canvas[data-editor-image-key="${assetKey(id)}"] svg`);return svg?[frameFor(page,point,svg,id)]:[];}
  function focusView(svg,box,asset){
    const w=Math.min(asset.width,Math.max(box[2]*1.8,120)),h=Math.min(asset.height,Math.max(box[3]*1.8,100)),crop=[Math.max(0,Math.min(asset.width-w,box[0]+box[2]/2-w/2)),Math.max(0,Math.min(asset.height-h,box[1]+box[3]/2-h/2)),w,h];
    return crop;
  }
  function choosePoint(id,zoom=false,focus){const page=currentPage(),point=page&&pagePoints(page).find(point=>point.id===id&&pointVisible(page.id,point));if(!point)return;selectedPoints.set(page.id,id);if(zoom&&point.focus&&page.assets.includes(point.focus.asset))selectedAssets.set(page.id,point.focus.asset);pendingFocus=zoom?id:null;presentation.refresh();document.querySelector(focus||`[data-module-point="${id}"]`)?.focus({preventScroll:true});}
  function afterRender(){syncNavigation();const {stage}=displayContext();if(stage?.id==='extensions')return;const page=currentPage();if(!page)return;const selected=activePoint(page)?.id,editing=window.generalRoadEditor.editing;
    for(const row of document.querySelectorAll('[data-module-point]')){const active=row.dataset.modulePoint===selected;row.classList.toggle('is-module-point-active',active);if(stage?.id==='diagram'&&!editing){row.classList.add('is-module-focus-item');row.setAttribute('tabindex','0');row.setAttribute('role','button');row.setAttribute('aria-pressed',String(active));}}
    for(const layer of document.querySelectorAll('.module-hotspot-layer'))layer.replaceChildren();
    const frame=frames()[0],point=sourcePoint(page,selected);if(frame&&point){const svg=frame.element,id=frame.imageKey.slice('module:'.length),spec=highlightSpec(page,point,id,window.generalRoadEditor.state);
      if(spec.enabled){const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');for(const [name,value]of Object.entries({x:spec.box[0],y:spec.box[1],width:spec.box[2],height:spec.box[3]}))rect.setAttribute(name,value);rect.classList.add('module-focus-rect');rect.dataset.highlightKey=spec.key;svg.querySelector('.module-hotspot-layer').append(rect);}
      if(pendingFocus===selected&&spec.enabled){let view=transformBox(spec.crop||focusView(svg,spec.box,spec.asset),artworkMatrix(svg));const ratio=svg.clientWidth/svg.clientHeight;if(view[2]/view[3]>ratio){const height=view[2]/ratio;view[1]-=(height-view[3])/2;view[3]=height;}else{const width=view[3]*ratio;view[0]-=(width-view[2])/2;view[2]=width;}window.generalRoadViewport.get(svg)?.write(view);}
      if(stage?.id==='diagram'&&editing&&window.generalRoadEditor.adjusting){const controls=[...document.querySelectorAll('.editor-highlight-controls')].find(node=>node.dataset.controlsKey===frame.key),heading=controls?.querySelector('.editor-frame-heading strong');if(heading){const select=document.createElement('select');select.dataset.moduleHighlightPoint='';select.setAttribute('aria-label','選擇要調整打亮的說明');for(const item of pagePoints(page).filter(item=>pointVisible(page.id,item))){const option=new Option(item.title,item.id);option.selected=item.id===selected;select.add(option);}heading.replaceWith(select);}}
    }pendingFocus=null;
  }
  function noteReplacement(key){const state=window.generalRoadEditor.state;for(const content of contents.values())for(const page of content.pages)for(const point of page.points)if(point.focus&&assetKey(point.focus.asset)===key)state.disabledHighlights[keyFor(page,point)]=true;for(const [id,value]of Object.entries(state.highlights))if(value.imageKey===key)state.disabledHighlights[id]=true;}
  function chooseAsset(id,focus,group){const page=currentPage();if(!page)return;if(group){if(!group.assets.includes(id))return;selectedOverviewAssets.set(group.key,id);focus='[data-overview-submodule="'+group.id+'"] '+focus;}else{if(!page.assets.includes(id))return;selectedAssets.set(page.id,id);}if(displayContext().stage?.id!=='diagram')selectedPoints.delete(page.id);pendingFocus=null;presentation.refresh();document.querySelector(focus)?.focus({preventScroll:true});}
  if(typeof document==='object')document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!presentation)return;
    const point=event.target.closest('.is-module-focus-item');if(point&&!button&&!window.generalRoadEditor.editing){event.preventDefault();event.stopImmediatePropagation();choosePoint(point.dataset.modulePoint,true);return;}
    if(!button)return;
    if(button.hasAttribute('data-module-toggle-extensions')){event.preventDefault();event.stopImmediatePropagation();toggleExtensionPage(button);return;}
    if((button.id==='next'||button.id==='previous')&&moveExtensionGroup(button.id==='next'?1:-1)){event.preventDefault();event.stopImmediatePropagation();return;}
    if(button.hasAttribute('data-module-extension-step')){event.preventDefault();event.stopImmediatePropagation();moveExtensionGroup(Number(button.dataset.moduleExtensionStep));return;}
    if(button.dataset.moduleRoute){event.preventDefault();event.stopImmediatePropagation();const [id,topic]=button.dataset.moduleRoute.split('/');presentation.goPage(resolvePage(id,topic),0,{force:true});return;}
    if(button.dataset.openModule){event.preventDefault();event.stopImmediatePropagation();presentation.goPage(entryPoint(button.dataset.openModule));}
    else if(button.dataset.moduleCategory){event.preventDefault();event.stopImmediatePropagation();const category=button.dataset.moduleCategory;presentation.goPage(category==='all'?'modules-index':'modules-'+category,0,{force:true});}
    else if(button.dataset.moduleInfo){event.preventDefault();event.stopImmediatePropagation();showInfo(button.dataset.moduleInfo);}
    else if(button.dataset.moduleTopic){event.preventDefault();event.stopImmediatePropagation();const {stage}=displayContext();if(stage?.topics?.some(topic=>topic.id===button.dataset.moduleTopic)){selectedTopics.set(stage.pageId,button.dataset.moduleTopic);const source=currentPage();selectedPoints.delete(source.id);pendingFocus=activePoint(source)?.id;presentation.refresh();document.querySelector(`[data-module-topic="${button.dataset.moduleTopic}"]`)?.focus({preventScroll:true});}}
    else if(button.hasAttribute('data-module-view-step')){event.preventDefault();event.stopImmediatePropagation();const page=currentPage(),scope=button.closest('[data-overview-key]'),group=scope&&overviewGroups(page).find(group=>group.key===scope.dataset.overviewKey),assets=group?.assets||page?.assets;if(assets?.length){const index=assets.indexOf(group?overviewAsset(group):shownAssets(page)[0]),step=Number(button.dataset.moduleViewStep);chooseAsset(assets[(index+step+assets.length)%assets.length],'[data-module-view-step="'+step+'"]',group);}}
    else if(button.hasAttribute('data-module-compare')){event.preventDefault();event.stopImmediatePropagation();const page=currentPage();if(page?.assets.length>1){comparisonPages.set(page.id,page.mode!=='pair');presentation.refresh();document.querySelector('[data-module-compare]')?.focus({preventScroll:true});}}
    else if(button.dataset.moduleView){event.preventDefault();event.stopImmediatePropagation();chooseAsset(button.dataset.moduleView,'[data-module-view-select]');}
    else if(button.dataset.moduleScenario){event.preventDefault();event.stopImmediatePropagation();moduleReturn={page:presentation.state.page,phase:presentation.state.phase,moduleId:moduleFor(presentation.page.id)?.id};presentation.goPage(button.dataset.moduleScenario);}
    else if(button.hasAttribute('data-back-module')){event.preventDefault();event.stopImmediatePropagation();presentation.goPage(moduleReturn?.page||'m201-overview',moduleReturn?.phase||0);}
    else if(button.dataset.moduleReference){event.preventDefault();event.stopImmediatePropagation();showSource(button.dataset.moduleReference);}
    else if(button.hasAttribute('data-module-source')){event.preventDefault();event.stopImmediatePropagation();showSource();}
    else if(button.hasAttribute('data-module-reload'))location.reload();
  },true);
  if(typeof document==='object'){
    document.addEventListener('change',event=>{const select=event.target.closest('[data-module-select],[data-module-subselect],[data-module-view-select],[data-module-highlight-point],[data-module-extension-layout]');if(!select||!presentation)return;event.stopImmediatePropagation();if(select.hasAttribute('data-module-extension-layout'))changeExtensionLayout(select);else if(select.hasAttribute('data-module-highlight-point'))choosePoint(select.value,false,'[data-module-highlight-point]');else if(select.hasAttribute('data-module-view-select')){const scope=select.closest('[data-overview-key]'),group=scope&&overviewGroups(currentPage()).find(group=>group.key===scope.dataset.overviewKey);chooseAsset(select.value,'[data-module-view-select]',group);}else{const focus=select.hasAttribute('data-module-select')?'[data-module-select]':'[data-module-subselect]';presentation.goPage(select.value);document.querySelector(focus)?.focus({preventScroll:true});}},true);
    document.addEventListener('fullscreenchange',()=>{syncExtensionControls();syncNavigation();});
    if(typeof window==='object')window.addEventListener('resize',()=>{syncExtensionControls();syncNavigation();});
    document.fonts?.ready.then(syncNavigation);
    document.addEventListener('keydown',event=>{
      if(event.ctrlKey||event.metaKey||event.altKey||event.target.isContentEditable||event.target.closest('input,textarea,select,.presentation-picker')||document.querySelector('dialog[open]'))return;
      if(event.target.matches('.is-module-focus-item')&&[' ','Enter'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();choosePoint(event.target.dataset.modulePoint,true);return;}
      if(event.target.matches('.module-scenario-refs>summary')&&[' ','Enter'].includes(event.key)){event.stopPropagation();return;}
      if(['BUTTON','A','SUMMARY'].includes(event.target.tagName)&&[' ','Enter'].includes(event.key))return;
      const direction=['ArrowRight','ArrowDown','PageDown',' '].includes(event.key)?1:['ArrowLeft','ArrowUp','PageUp'].includes(event.key)?-1:0;
      if(direction&&moveExtensionGroup(direction)){event.preventDefault();event.stopImmediatePropagation();}
    },true);
  }
  return {validateCatalog,validateModule,load,prepare,pages,toc,render,switcher,subnavigation,connect,decorate,afterRender,frames,noteReplacement,highlightSpec,extensionLayout,resolvePage,hashFor,displayContext,overviewGroups,overviewPoints,pointVisible,syncExtensionControls,syncPages,visibleStages,extensionRemoved,get catalog(){return catalog;},get content(){return moduleFor(presentation?.page.id)||contents.get('M2-01')||null;},get contents(){return [...contents.values()];},get moduleErrors(){return Object.fromEntries(moduleErrors);},get error(){return loadError;}};
});
