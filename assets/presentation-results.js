(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.PresentationResults=api;root.presentationResultsReady=api.load();}
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  let outline=null,loadError='',app=null;
  const imageChoices=new Map();
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const types=new Set(['cover','outline','cards','steps','module-index','module-example','scenario-index']);
  const scenarioPageId=code=>'results-scenario-'+code.toLowerCase();
  function validate(value){
    if(value?.schemaVersion!==1||!Array.isArray(value.pages)||!value.pages.length)throw new Error('成果簡報格式無效');
    const ids=new Set();
    const points=items=>{if(!Array.isArray(items))throw new Error('成果說明格式無效');const keys=new Set();for(const item of items){if(!/^[\w-]+$/.test(item.id)||keys.has(item.id)||typeof item.title!=='string'||typeof item.text!=='string')throw new Error('成果說明項目無效');keys.add(item.id);}};
    for(const page of value.pages){
      if(!/^results-[\w-]+$/.test(page.id)||ids.has(page.id)||!/^results-[\w-]+$/.test(page.chapter)||!types.has(page.type)||typeof page.title!=='string')throw new Error('成果簡報頁面無效');ids.add(page.id);
      if(page.items)points(page.items);
      if(page.type==='scenario-index'&&!['general','complex'].includes(page.deck))throw new Error('情境分類無效');
    }
    for(const [code,example]of Object.entries(value.scenarioExamples||{})){
      if(!/^[GC][1-4]-\d{2}$/.test(code))throw new Error('成果情境編號無效');
      for(const stage of ['issue',...(example.strategy?['strategy']:[])]){
        const item=example[stage];if(typeof item?.title!=='string'||!Array.isArray(item.images)||!item.images.length&&!item.sourceMissing)throw new Error('成果情境素材無效');points(item.items);
        for(const image of item.images)if(!/^[\w:-]+$/.test(image.key)||typeof image.label!=='string'||![0,90,180,270].includes(image.rotation||0)||image.crop&&(!Array.isArray(image.crop)||image.crop.length!==4||!image.crop.every(Number.isFinite)||image.crop[2]<=0||image.crop[3]<=0))throw new Error('成果情境圖面無效');
      }
    }
    return value;
  }
  function validateConditions(value){
    if(value?.schemaVersion!==1||!value.assets||!value.scenarios)throw new Error('現況素材清單無效');
    for(const [id,asset]of Object.entries(value.assets))if(!/^[\w:-]+$/.test(id)||!/^materials\/(?:04-一般道路情境|05-複雜道路情境)\/current-conditions\/[\w-]+\/[\w\u4e00-\u9fff.-]+\.(?:png|jpe?g)$/.test(asset.file)||!Number.isInteger(asset.width)||asset.width<=0||!Number.isInteger(asset.height)||asset.height<=0||!['diagram','photo'].includes(asset.role)||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('現況素材路徑或尺寸無效');
    for(const [code,entry]of Object.entries(value.scenarios)){
      if(!/^[GC][1-4]-\d{2}$/.test(code)||!entry.issue||!Array.isArray(entry.sourceSlides)||!entry.sourceSlides.length&&!entry.issue.sourceMissing)throw new Error('現況情境來源無效');
      const ids=new Set();for(const image of entry.issue.images){if(!value.assets[image.key]||value.assets[image.key].scenario!==code||ids.has(image.key)||!['diagram','photo'].includes(image.role))throw new Error('現況圖片對應無效');ids.add(image.key);}
    }
    validate({schemaVersion:1,pages:[{id:'results-intro',chapter:'results-intro',type:'cover',title:'現況'}],scenarioExamples:Object.fromEntries(Object.entries(value.scenarios).map(([id,entry])=>[id,{issue:entry.issue}]))});
    return value;
  }
  function mergeConditions(content,conditions){
    validateConditions(conditions);
    const examples={...content.scenarioExamples};for(const [code,entry]of Object.entries(conditions.scenarios))examples[code]={...examples[code],issue:entry.issue,sourceSlides:entry.sourceSlides};
    return validate({...content,assets:{...content.assets,...conditions.assets},scenarioExamples:examples});
  }
  function validateStrategies(value){
    if(value?.schemaVersion!==1||!value.assets||!value.scenarios)throw new Error('佈設成果清單無效');
    for(const [id,asset]of Object.entries(value.assets)){
      const file=asset.file?.match(/^materials\/04-一般道路情境\/(G[1-4]-\d{2})\/\1_[\w\u4e00-\u9fff（） -]+\.svg$/);
      if(!/^results:g[1-4]-\d{2}-strategy$/.test(id)||!file||file[1]!==asset.scenario||asset.role!=='strategy'||!Number.isFinite(asset.width)||asset.width<=0||!Number.isFinite(asset.height)||asset.height<=0||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('佈設成果圖面路徑或尺寸無效');
    }
    for(const [code,entry]of Object.entries(value.scenarios)){
      if(!/^G[1-4]-\d{2}$/.test(code)||!entry.strategy?.images?.length)throw new Error('佈設成果情境無效');
      const ids=new Set();for(const image of entry.strategy.images){if(!value.assets[image.key]||value.assets[image.key].scenario!==code||ids.has(image.key))throw new Error('佈設成果圖面對應無效');ids.add(image.key);}
      validate({schemaVersion:1,pages:[{id:'results-intro',chapter:'results-intro',type:'cover',title:'佈設成果'}],scenarioExamples:{[code]:{issue:entry.strategy}}});
    }
    return value;
  }
  function mergeStrategies(content,strategies){
    validateStrategies(strategies);
    const examples={...content.scenarioExamples};for(const [code,entry]of Object.entries(strategies.scenarios)){
      if(!examples[code]?.issue)throw new Error('佈設成果缺少對應現況頁');
      examples[code]={...examples[code],strategy:entry.strategy,strategySource:entry.source};
    }
    return validate({...content,assets:{...content.assets,...strategies.assets},scenarioExamples:examples});
  }
  async function load(){try{
    if(typeof window==='object'&&window.PresentationRepository){
      const repository=window.PresentationRepository;await repository.ready;outline=JSON.parse(JSON.stringify(repository.registry.results));
      const hydrate=(resource,value)=>{
        if(resource.type==='results-common'){
          validate(value);for(const page of value.pages){const target=outline.pages.find(item=>item.id===page.id);if(target)Object.assign(target,JSON.parse(JSON.stringify(page)));}
        }else if(resource.type==='results-scenario'){
          const target=outline.scenarioExamples[resource.id];if(!target)throw new Error('成果情境不存在');
          for(const [key,stage]of Object.entries(value.example)){if(stage?.images&&target[key])Object.assign(target[key],JSON.parse(JSON.stringify(stage)));else target[key]=JSON.parse(JSON.stringify(stage));}
          Object.assign(outline.assets,value.assets);
        }
      };
      repository.subscribe(hydrate);for(const [key,resource]of Object.entries(repository.registry.resources))if(repository.get(key))hydrate(resource,repository.get(key));
      return;
    }
    const read=async file=>{const response=await fetch(new URL(file,document.baseURI),{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);return response.json();};
    const content=validate(await read('data/results/outline.json'));
    let merged=content.currentConditions?mergeConditions(content,await read(content.currentConditions)):content;
    if(content.strategies)merged=mergeStrategies(merged,await read(content.strategies));
    outline=merged;
  }catch(error){outline=null;loadError=error.message;}}
  function prepare(data){
    for(const [key,asset]of Object.entries(outline?.assets||{})){
      if(data.embeddedAssets[key])continue;
      data.embeddedAssets[key]={width:asset.width,height:asset.height,url:encodeURI(asset.file)};
      data.assets[key]=asset.label;data.assetMeta[key]={label:asset.label,module:asset.scenario+(asset.role==='strategy'?' / OVERALL LAYOUT':' / CURRENT CONDITIONS'),rotation:asset.rotation||0};
    }
  }
  function buildPages(content,catalog){
    if(!content)return [{id:'results-intro',chapter:'results-intro',kind:'results',name:'成果簡報尚未載入',resultType:'error'}];
    return content.pages.flatMap(item=>{
      const page={id:item.id,chapter:item.chapter,kind:'results',name:item.title,resultType:item.type,content:item};
      if(item.type!=='scenario-index')return [page];
      const groups=catalog.groups.filter(group=>group.deck===item.deck);
      return [page,...catalog.scenarios.filter(scene=>groups.some(group=>group.id===scene.group)).flatMap(scene=>{
        const example=content.scenarioExamples?.[scene.id],id=scenarioPageId(scene.id),base={chapter:item.chapter,kind:'results',resultsScenario:scene.id,sceneName:scene.name,directoryId:item.id};
        return example?['issue',...(example.strategy?['strategy']:[])].map((stage,index)=>({...base,id:id+(index?'-strategy':''),name:scene.id+' '+(index?'佈設成果':'現況議題'),resultType:'scenario-example',stage,content:example[stage],example})):[{...base,id,name:scene.id+' '+scene.name,resultType:'scenario-placeholder'}];
      })];
    });
  }
  const key=(page,id)=>` data-block-edit-key="${esc(page.id+'|results|'+id)}"`;
  const p=(page,id,text,className='')=>`<p${className?` class="${className}"`:''}${key(page,id)}>${esc(text)}</p>`;
  function points(page,items){return `<ol class="results-points"${page.resultType==='scenario-example'?' data-results-editable':''}>${items.map((item,index)=>`<li data-results-point="${esc(item.id)}"${item.moduleId?` data-results-module-id="${esc(item.moduleId)}"`:''}><span>${String(index+1).padStart(2,'0')}</span><div><h3${key(page,item.id+'-title')}>${esc(item.title)}</h3>${p(page,item.id+'-text',item.text)}</div></li>`).join('')}</ol>`;}
  function header(page){const item=page.content||{},chapter=window.PresentationStructure?.manifest?.presentations.find(deck=>deck.id==='results')?.chapters.find(chapter=>chapter.id===page.chapter);return `<header class="results-heading"><span class="eyebrow">${esc(page.resultsScenario||'RESULTS / '+(chapter?.code||'00'))}${page.stage?' · '+(page.example?.strategy?(page.stage==='issue'?'1 / 2':'2 / 2'):'現況議題'):''}</span><h1 id="slide-title"${key(page,'title')}>${esc(page.resultsScenario?page.sceneName:item.title||page.name)}</h1>${item.intro?p(page,'intro',item.intro):''}</header>`;}
  function figure(page,image,data,picker='',order=''){
    const asset=data.embeddedAssets[image.key];if(!asset)return `<div class="results-image-pending">圖片待補</div>`;
    const rotation=image.rotation||0,w=asset.width,h=asset.height,turned=rotation===90||rotation===270,width=turned?h:w,height=turned?w:h;
    const transform=rotation===90?`translate(${h} 0) rotate(90)`:rotation===180?`translate(${w} ${h}) rotate(180)`:rotation===270?`translate(0 ${w}) rotate(270)`:'';
    const view=image.crop||[0,0,width,height];
    return `<figure class="map-card results-map-card"><div class="map-toolbar">${picker||`<strong${key(page,'image-'+image.key)}>${esc(image.label)}</strong>`}<div class="map-tools"><button type="button" data-asset="${esc(image.key)}">原圖 ↗</button>${order}</div></div><div class="map-canvas results-map-canvas" data-editor-image-key="${esc(image.key)}"><svg class="scenario-detail-image results-diagram" viewBox="${view.join(' ')}" role="img" aria-label="${esc(image.label)}"><g transform="${transform}"><image href="${esc(asset.url)}" width="${w}" height="${h}"/></g></svg></div></figure>`;
  }
  function issueImages(page,data){
    return ['diagram','photo'].map(role=>{
      const images=galleryImages(page,role),name=role==='diagram'?'現況圖':'現況照片';
      if(!images.length)return `<figure class="results-image-pending results-map-card" data-results-missing="${role}"><div class="map-toolbar"><strong>${name}</strong></div><div><span>${name}待補</span><p>${page.content.sourceMissing?'目前提供的 PowerPoint 未包含本情境素材。':'原 PowerPoint 未附獨立現況照片。'}</p></div></figure>`;
      const choiceKey=page.id+'/'+role,index=Math.max(0,images.findIndex(image=>image.key===imageChoices.get(choiceKey)));
      imageChoices.set(choiceKey,images[index].key);
      const picker=images.length>1?`<div class="results-image-picker" data-editor-ui="results-image-picker"><label><span class="sr-only">選擇${name}</span><select data-results-image-select="${role}" aria-label="選擇${name}">${images.map((image,i)=>`<option value="${i}" ${i===index?'selected':''}>${esc(image.label)}</option>`).join('')}</select></label><button type="button" data-results-image-step="-1" data-results-image-role="${role}" aria-label="上一張${name}" ${index===0?'disabled':''}>‹</button><span>${index+1} / ${images.length}</span><button type="button" data-results-image-step="1" data-results-image-role="${role}" aria-label="下一張${name}" ${index===images.length-1?'disabled':''}>›</button></div>`:'';
      const order=window.PresentationImageOrder?.button({key:'results:'+page.id+'/'+role,photos:role==='photo',selectedId:images[index].key,items:images.map(image=>({id:image.key,label:image.label,src:data.embeddedAssets[image.key].url}))})||'';
      return figure(page,images[index],data,picker,order);
    }).join('');
  }
  function galleryImages(page,role){const images=page.content.images.filter(image=>image.role===role);return window.PresentationImageOrder?.ordered(images,'results:'+page.id+'/'+role,image=>image.key)||images;}
  function chooseImage(role,index){
    const page=app?.page;if(page?.kind!=='results'||page.stage!=='issue'||!Number.isInteger(index))return;
    const images=galleryImages(page,role);if(index<0||index>=images.length)return;
    const views=[...document.querySelectorAll('.results-diagram')].map(svg=>({key:svg.closest('[data-editor-image-key]').dataset.editorImageKey,view:window.generalRoadViewport.get(svg)?.read()}));
    imageChoices.set(page.id+'/'+role,images[index].key);app.refresh();
    for(const svg of document.querySelectorAll('.results-diagram')){const key=svg.closest('[data-editor-image-key]').dataset.editorImageKey,old=views.find(view=>view.key===key);if(old?.view)window.generalRoadViewport.get(svg)?.write(old.view,false);}
  }
  if(typeof document==='object'){
    document.addEventListener('change',event=>{const select=event.target.closest('[data-results-image-select]');if(select){event.stopPropagation();chooseImage(select.dataset.resultsImageSelect,Number(select.value));}},true);
    document.addEventListener('click',event=>{const button=event.target.closest('[data-results-image-step]');if(button&&!button.disabled){event.preventDefault();event.stopImmediatePropagation();const role=button.dataset.resultsImageRole,index=galleryImages(app.page,role).findIndex(image=>image.key===imageChoices.get(app.page.id+'/'+role));chooseImage(role,Math.max(0,index)+Number(button.dataset.resultsImageStep));}},true);
  }
  function moduleIndex(page){
    const catalog=window.PresentationModules.catalog;
    return `<div class="results-module-index">${catalog.themes.filter(theme=>page.content.themes.includes(theme.id)).map(theme=>`<section><h2>${esc(theme.id+' '+theme.name)}</h2>${catalog.modules.filter(item=>item.theme===theme.id).map(item=>`<article><h3>${esc(item.id+' '+item.name)}</h3><p>${item.submodules.map(child=>esc(child.id+' '+child.name)).join(' ／ ')}</p></article>`).join('')}</section>`).join('')}</div>`;
  }
  function scenarioThumbnail(pageId,image,data){
    const asset=data.embeddedAssets[image?.key];
    if(!asset)return '<span class="results-scenario-thumb results-scenario-thumb-pending" aria-hidden="true">佈設圖待補</span>';
    const rotation=image.rotation||0,w=asset.width,h=asset.height,turned=rotation===90||rotation===270;
    const transform=rotation===90?`translate(${h} 0) rotate(90)`:rotation===180?`translate(${w} ${h}) rotate(180)`:rotation===270?`translate(0 ${w}) rotate(270)`:'';
    const home=image.crop||[0,0,turned?h:w,turned?w:h],Core=window.VisualLayoutCore;
    const defaults=Core.imageView(pageId,image.key),settings=window.visualLayoutEditor?.store?.config.imageViews[defaults.id]||defaults;
    const view=Core.viewBoxFor(home,settings),angle=settings.rotation??0;
    return `<span class="results-scenario-thumb" data-results-thumbnail-key="${esc(image.key)}" data-thumbnail-page="${esc(pageId)}" aria-hidden="true"><svg viewBox="${view.join(' ')}" preserveAspectRatio="xMidYMid meet" focusable="false"><g data-results-thumbnail-rotation transform="rotate(${angle} ${home[0]+home[2]/2} ${home[1]+home[3]/2})"><g transform="${transform}"><image href="${esc(asset.url)}" width="${w}" height="${h}"/></g></g></svg></span>`;
  }
  function scenarioIndex(page,data){
    const catalog=window.PresentationScenarios.catalog,groups=catalog.groups.filter(group=>group.deck===page.content.deck),entries=catalog.scenarios.filter(scene=>groups.some(group=>group.id===scene.group));
    const thumbnails=page.content.deck==='general';
    return `<div class="results-scenario-list${thumbnails?' results-thumbnail-grid':''}" aria-label="${thumbnails?'一般道路情境完整佈設圖總覽':'複雜道路情境總覽'}">${entries.map(scene=>{
      const label=scene.id+' '+scene.name;
      const body=thumbnails?`${scenarioThumbnail(scenarioPageId(scene.id)+'-strategy',outline.scenarioExamples?.[scene.id]?.strategy?.images[0],data)}<span class="results-scenario-caption"><span class="results-scenario-code">${scene.id}<span aria-hidden="true">↗</span></span><strong>${esc(scene.name)}</strong></span>`:`<span>${scene.id}</span><strong>${esc(scene.name)}</strong>${outline.scenarioExamples?.[scene.id]?'<small>進入情境 ↗</small>':''}`;
      return `<button type="button" data-page="${scenarioPageId(scene.id)}" data-results-scenario="${scene.id}" aria-label="${esc(label+'，進入情境')}" title="${esc(label)}">${body}</button>`;
    }).join('')}</div>`;
  }
  function example(page,data){
    const item=page.content,items=window.visualLayoutEditor?.store?.config.content.results?.[page.id]?.points||item.items;
    const moduleIds=[...new Set(items.map(point=>point.moduleId).filter(Boolean))];
    return `<div class="results-case-layout"><div class="results-case-images ${page.stage==='issue'||item.images.length>1?'results-image-pair':''}">${page.stage==='issue'?issueImages(page,data):item.images.map(image=>figure(page,image,data)).join('')}</div><aside class="results-case-copy">${points(page,items)}${item.sourceMissing?'<p class="results-source-missing">缺少本情境的原始素材，保留此頁供後續補入。</p>':''}${page.stage==='strategy'&&moduleIds.length?`<div class="results-case-modules"><span>相關模組</span>${moduleIds.map(id=>`<span>${esc(id)}</span>`).join('')}</div>`:''}</aside></div>`;
  }
  function render(page,data){
    if(page.resultType==='error')return `<section class="slide results-slide"><h1 id="slide-title">成果簡報尚未載入</h1><p role="alert">請重新整理以載入成果簡報。${esc(loadError)}</p></section>`;
    const item=page.content||{};let body='';
    switch(page.resultType){
      case 'cover':body=`<div class="results-cover-flow"><div><span>01</span><h2>共同原則</h2><p>標線・標誌・號誌</p></div><b>→</b><div><span>02</span><h2>功能模組</h2><p>4 主題・15 模組・27 子模組</p></div><b>→</b><div><span>03</span><h2>道路情境</h2><p>18 一般・18 複雜</p></div></div><button type="button" class="primary-button results-start" data-page="results-outline">開始簡報 <span>→</span></button>`;break;
      case 'outline':body=`<div class="results-outline">${window.PresentationStructure.manifest.presentations[0].chapters.map(chapter=>`<button type="button" data-page="${chapter.entry}"><span>${chapter.code}</span><strong>${esc(chapter.name)}</strong><b>↗</b></button>`).join('')}</div>`;break;
      case 'cards':case 'steps':body=`<div class="results-cards ${page.resultType==='steps'?'results-steps':''}" style="--results-count:${item.items.length}">${item.items.map((point,index)=>`<article><span class="results-card-number">${String(index+1).padStart(2,'0')}</span><h2${key(page,point.id+'-title')}>${esc(point.title)}</h2>${p(page,point.id+'-text',point.text)}</article>`).join('')}</div>`;break;
      case 'module-index':body=moduleIndex(page);break;
      case 'scenario-index':body=scenarioIndex(page,data);break;
      case 'module-example':body=`<div class="results-case-layout"><div class="results-case-images results-image-pair">${[{key:'module:stop-basic',label:'M2-01.1 停管制'},{key:'module:yield-basic',label:'M2-01.2 讓管制'}].map(image=>figure(page,image,data)).join('')}</div><aside class="results-case-copy">${points(page,item.items)}</aside></div>`;break;
      case 'scenario-example':body=example(page,data);break;
      case 'scenario-placeholder':body=`<div class="results-reserved"><div><h2>現況議題</h2><div aria-label="現況素材預留區"></div></div><div><h2>佈設成果</h2><div aria-label="佈設成果預留區"></div></div></div>`;break;
    }
    return `<section class="slide results-slide results-${page.resultType}" data-results-page="${page.id}" aria-labelledby="slide-title">${header(page)}${body}${item.takeaway?p(page,'takeaway',item.takeaway,'results-takeaway'):''}</section>`;
  }
  return {load,validate,validateConditions,validateStrategies,mergeConditions,mergeStrategies,prepare,connect:api=>{app=api;},buildPages,scenarioPageId,scenarioThumbnail,pages:()=>buildPages(outline,window.PresentationScenarios.catalog),render,get outline(){return outline;},get error(){return loadError;}};
});
