(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.PresentationResults=api;root.presentationResultsReady=api.load();}
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  let outline=null,loadError='',app=null;
  const imageChoices=new Map();
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const types=new Set(['cover','outline','cards','steps','module-index','module-example','scenario-index','comparison','principles','background','framework','modular-rationale','guide-structure']);
  const validBox=(box,asset)=>Array.isArray(box)&&box.length===4&&box.every(Number.isFinite)&&box[0]>=0&&box[1]>=0&&box[2]>0&&box[3]>0&&box[0]+box[2]<=asset.width+.01&&box[1]+box[3]<=asset.height+.01;
  const scenarioPageId=code=>'results-scenario-'+code.toLowerCase();
  function validate(value){
    if(value?.schemaVersion!==1||!Array.isArray(value.pages)||!value.pages.length)throw new Error('成果簡報格式無效');
    const ids=new Set();
    const points=items=>{if(!Array.isArray(items))throw new Error('成果說明格式無效');const keys=new Set();for(const item of items){if(!/^[\w-]+$/.test(item.id)||keys.has(item.id)||typeof item.title!=='string'||typeof item.text!=='string')throw new Error('成果說明項目無效');keys.add(item.id);}};
    for(const page of value.pages){
      if(!/^results-[\w-]+$/.test(page.id)||ids.has(page.id)||!/^results-[\w-]+$/.test(page.chapter)||!types.has(page.type)||typeof page.title!=='string')throw new Error('成果簡報頁面無效');ids.add(page.id);
      if(page.items)points(page.items);
      if(page.meeting&&(page.type!=='cover'||['project','event','presenter','organization','date'].some(field=>typeof page.meeting[field]!=='string'||!page.meeting[field].trim())))throw new Error('封面會議資訊無效');
      if(page.type==='steps'&&page.images){
        if(!Array.isArray(page.images)||!page.images.length||new Set(page.images.map(image=>image.key)).size!==page.images.length)throw new Error('流程圖文素材無效');
        for(const image of page.images){const asset=value.assets?.[image.key];if(!/^[\w:-]+$/.test(image.key)||typeof image.label!=='string'||!asset||!/^materials\/00-計畫緣起\/[^/\\]+\.(?:png|jpe?g)$/.test(asset.file)||asset.role!=='background'||!Number.isFinite(asset.width)||asset.width<=0||!Number.isFinite(asset.height)||asset.height<=0||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('流程原圖來源無效');}
      }
      if(page.type==='framework'&&!['general','complex','modules'].includes(page.framework))throw new Error('成果架構表分類無效');
      if(page.type==='background'){
        if(!Array.isArray(page.lead)||!page.lead.length||!page.lead.every(item=>/^[\w-]+$/.test(item.id)&&typeof item.text==='string')||!page.items?.length||page.images?.length!==1)throw new Error('計畫緣起原文格式無效');
        const image=page.images[0],asset=value.assets?.[image.key];if(!/^[\w:-]+$/.test(image.key)||typeof image.label!=='string'||!asset||!/^materials\/00-計畫緣起\/[^/\\]+\.svg$/.test(asset.file)||asset.role!=='background'||!Number.isFinite(asset.width)||asset.width<=0||!Number.isFinite(asset.height)||asset.height<=0||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('計畫緣起圖片來源無效');
      }
      if(page.type==='modular-rationale'){
        if(page.images?.length!==2||new Set(page.images.map(image=>image.key)).size!==2||page.sections?.length!==3||page.sections.some((section,index)=>section.paragraphs?.length!==[4,1,6][index]))throw new Error('模組化主軸內容無效');
        for(const image of page.images){const asset=value.assets?.[image.key];if(!/^[\w:-]+$/.test(image.key)||typeof image.label!=='string'||!asset||!/^materials\/00-計畫緣起\/[^/\\]+\.png$/.test(asset.file)||asset.role!=='background'||!Number.isFinite(asset.width)||asset.width<=0||!Number.isFinite(asset.height)||asset.height<=0||!/^[a-f0-9]{64}$/.test(asset.sha256)||image.crop&&!validBox(image.crop,asset))throw new Error('模組化主軸照片無效');}
      }
      if(page.type==='guide-structure'&&(typeof page.intro!=='string'||page.sections?.length!==2||page.sections.some((section,index)=>section.paragraphs?.length!==[15,17][index])))throw new Error('指引編排架構內容無效');
      if(['principles','modular-rationale','guide-structure'].includes(page.type)){
        if(!Array.isArray(page.sections)||!page.sections.length||page.type==='principles'&&!['normal','compact'].includes(page.density))throw new Error('原文段落格式無效');
        const keys=new Set();for(const section of page.sections){
          if(!/^[\w-]+$/.test(section.id)||keys.has(section.id)||section.title!==undefined&&typeof section.title!=='string'||!Array.isArray(section.paragraphs)||section.columns!==undefined&&section.columns!==2)throw new Error('原則原文小節無效');keys.add(section.id);
          for(const paragraph of section.paragraphs){if(!/^[\w-]+$/.test(paragraph.id)||keys.has(paragraph.id)||typeof paragraph.text!=='string')throw new Error('原則原文段落無效');keys.add(paragraph.id);}
        }
      }
      if(page.type==='comparison'){
        if(!Array.isArray(page.images)||page.images.length!==2||new Set(page.images.map(image=>image.key)).size!==2||!page.items?.length)throw new Error('新舊圖對照內容無效');
        for(const image of page.images){const asset=value.assets?.[image.key];if(!/^[\w:-]+$/.test(image.key)||typeof image.label!=='string'||!asset||!/^materials\/(?:04-一般道路情境\/G|05-複雜道路情境\/C)[1-4]-\d{2}\/[^/\\]+\.(?:png|svg)$/.test(asset.file)||asset.scenario!==asset.file.split('/')[2]||!Number.isFinite(asset.width)||asset.width<=0||!Number.isFinite(asset.height)||asset.height<=0||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('新舊圖對照素材無效');}
        const owners=new Set(page.images.map(image=>value.assets[image.key].scenario));if(owners.size!==1||page.source?.scenario&&!owners.has(page.source.scenario))throw new Error('新舊圖對照須使用同一情境的素材');
        for(const point of page.items)for(const [key,focus]of Object.entries(point.focus||{})){const asset=value.assets[key];if(!page.images.some(image=>image.key===key)||!asset||!validBox(focus.rect,asset)||focus.crop&&!validBox(focus.crop,asset))throw new Error('新舊圖對照打亮範圍無效');}
      }
      if(page.type==='scenario-index'&&!['general','complex'].includes(page.deck))throw new Error('情境分類無效');
    }
    for(const [code,example]of Object.entries(value.scenarioExamples||{})){
      if(!/^[GC][1-4]-\d{2}$/.test(code))throw new Error('成果情境編號無效');
      for(const stage of ['issue',...(example.strategy?['strategy']:[])]){
        const item=example[stage];if(typeof item?.title!=='string'||!Array.isArray(item.images)||!item.images.length&&!item.sourceMissing)throw new Error('成果情境素材無效');points(item.items);
        for(const image of item.images)if(!/^[\w:-]+$/.test(image.key)||typeof image.label!=='string'||![0,90,180,270].includes(image.rotation||0)||image.crop&&(!Array.isArray(image.crop)||image.crop.length!==4||!image.crop.every(Number.isFinite)||image.crop[2]<=0||image.crop[3]<=0))throw new Error('成果情境圖面無效');
      }
    }
    for(const [code,image]of Object.entries(value.scenarioThumbnails||{})){
      const owner=image.reuseFrom||code,asset=value.assets?.[image?.key],file=asset?.file?.match(/^materials\/05-複雜道路情境\/(C[1-4]-\d{2})\/([^/\\]+)\.svg$/);
      if(!/^C[1-4]-\d{2}$/.test(code)||!/^C[1-4]-\d{2}$/.test(owner)||image.key!=='results:'+owner.toLowerCase()+'-layout'||image.reuseFrom&&value.scenarioThumbnails[owner]?.key!==image.key||!file||file[1]!==owner||!file[2].startsWith(owner+'_')||asset.scenario!==owner||asset.role!=='layout'||!Number.isFinite(asset.width)||asset.width<=0||!Number.isFinite(asset.height)||asset.height<=0||!/^[a-f0-9]{64}$/.test(asset.sha256)||typeof image.label!=='string'||![0,90,180,270].includes(image.rotation||0))throw new Error('總覽佈設圖面對應或尺寸無效');
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
      const owner=asset.reusedFrom||asset.scenario,file=asset.file?.match(/^materials\/(04-一般道路情境|05-複雜道路情境)\/([GC][1-4]-\d{2})\/([^/\\]+)\.svg$/);
      if(!/^[GC][1-4]-\d{2}$/.test(asset.scenario)||id!=='results:'+asset.scenario.toLowerCase()+'-strategy'||!file||file[2]!==owner||!file[3].startsWith(owner+'_')||file[1]!== (owner[0]==='G'?'04-一般道路情境':'05-複雜道路情境')||asset.reusedFrom&&(value.scenarios[asset.scenario]?.reusedFrom!==owner||!value.scenarios[owner])||asset.role!=='strategy'||!Number.isFinite(asset.width)||asset.width<=0||!Number.isFinite(asset.height)||asset.height<=0||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('佈設成果圖面路徑或尺寸無效');
    }
    for(const [code,entry]of Object.entries(value.scenarios)){
      if(!/^[GC][1-4]-\d{2}$/.test(code)||!entry.strategy?.images?.length)throw new Error('佈設成果情境無效');
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
  function validateModuleComparisons(value){
    if(value?.schemaVersion!==1||!value.assets||!value.modules)throw new Error('模組成果清單無效');
    for(const [key,asset]of Object.entries(value.assets)){
      const match=asset.file?.match(/^materials\/03-modules\/(M[1-4]-\d{2})\/([^/\\]+)\.(svg|png|jpe?g)$/);
      if(!/^M[1-4]-\d{2}$/.test(asset.moduleId)||!key.startsWith('results:module-'+asset.moduleId.toLowerCase()+'-')||!match||match[1]!==asset.moduleId||!['current','module'].includes(asset.role)||asset.role==='current'&&match[3]==='svg'||asset.role==='module'&&match[3]!=='svg'||!Number.isFinite(asset.width)||asset.width<=0||!Number.isFinite(asset.height)||asset.height<=0||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('模組成果圖面路徑或尺寸無效');
    }
    const pages=new Set();
    for(const [code,entry]of Object.entries(value.modules)){
      if(!/^M[1-4]-\d{2}$/.test(code)||entry.moduleId!==code||!/^results-module-[\w-]+$/.test(entry.pageId)||pages.has(entry.pageId)||!Array.isArray(entry.items)||!Array.isArray(entry.images)||!entry.images.some(image=>image.role==='current')||entry.images.filter(image=>image.role==='module').length!==1)throw new Error('模組成果內容無效');
      pages.add(entry.pageId);validate({schemaVersion:1,pages:[{id:entry.pageId,chapter:'results-modules',type:'cards',title:entry.title,items:entry.items}]});
      const keys=new Set();for(const image of entry.images){const asset=value.assets[image.key];if(!asset||asset.moduleId!==code||asset.role!==image.role||keys.has(image.key)||typeof image.label!=='string'||![0,90,180,270].includes(image.rotation||0))throw new Error('模組成果圖片對應無效');keys.add(image.key);}
    }
    for(const [id,target]of Object.entries(value.aliases||{}))if(!/^results-[\w-]+$/.test(id)||target!=='results-modules'&&!pages.has(target))throw new Error('模組成果連結對應無效');
    return value;
  }
  function mergeModuleComparisons(content,comparisons){
    validateModuleComparisons(comparisons);
    return validate({...content,moduleExamples:comparisons.modules,pageAliases:{...content.pageAliases,...comparisons.aliases},assets:{...content.assets,...comparisons.assets}});
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
        }else if(resource.type==='results-module'){
          validateModuleComparisons({schemaVersion:1,assets:value.assets,modules:{[resource.id]:value.example}});
          const target=outline.moduleExamples?.[resource.id];if(!target)throw new Error('模組成果不存在');Object.assign(target,JSON.parse(JSON.stringify(value.example)));Object.assign(outline.assets,value.assets);
        }
      };
      repository.subscribe(hydrate);for(const [key,resource]of Object.entries(repository.registry.resources))if(repository.get(key))hydrate(resource,repository.get(key));
      return;
    }
    const read=async file=>{const response=await fetch(new URL(file,document.baseURI),{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);return response.json();};
    const content=validate(await read('data/results/outline.json'));
    let merged=content.currentConditions?mergeConditions(content,await read(content.currentConditions)):content;
    if(content.strategies)merged=mergeStrategies(merged,await read(content.strategies));
    if(content.complexStrategies)merged=mergeStrategies(merged,await read(content.complexStrategies));
    if(content.moduleComparisons)merged=mergeModuleComparisons(merged,await read(content.moduleComparisons));
    outline=merged;
  }catch(error){outline=null;loadError=error.message;}}
  function prepare(data){
    for(const [key,asset]of Object.entries(outline?.assets||{})){
      if(data.embeddedAssets[key])continue;
      data.embeddedAssets[key]={width:asset.width,height:asset.height,url:encodeURI(asset.file)};
      data.assets[key]=asset.label;data.assetMeta[key]={label:asset.label,module:asset.moduleId?asset.moduleId+' / MODULE COMPARISON':asset.role==='background'?'計畫緣起 / BACKGROUND':asset.scenario+(['strategy','layout'].includes(asset.role)?' / OVERALL LAYOUT':' / CURRENT CONDITIONS'),rotation:asset.rotation||0};
    }
  }
  function buildPages(content,catalog){
    if(!content)return [{id:'results-intro',chapter:'results-intro',kind:'results',name:'成果簡報尚未載入',resultType:'error'}];
    const moduleExamples=Object.values(content.moduleExamples||{}).sort((a,b)=>a.moduleId.localeCompare(b.moduleId));
    return content.pages.flatMap(item=>{
      if(moduleExamples.length&&['results-module-list-2','results-module-example'].includes(item.id))return [];
      const page={id:item.id,chapter:item.chapter,kind:'results',name:item.title,resultType:item.type,content:item};
      if(item.id==='results-modules'&&moduleExamples.length)return [{...page,resultType:'module-overview'},...moduleExamples.map(example=>({id:example.pageId,chapter:item.chapter,kind:'results',resultsModule:example.moduleId,name:example.moduleId+' '+example.title+'｜現況與模組圖對照',resultType:'module-comparison',directoryId:item.id,content:example}))];
      if(item.type!=='scenario-index')return [page];
      const groups=catalog.groups.filter(group=>group.deck===item.deck);
      return [page,...catalog.scenarios.filter(scene=>groups.some(group=>group.id===scene.group)).flatMap(scene=>{
        const example=content.scenarioExamples?.[scene.id],id=scenarioPageId(scene.id),base={chapter:item.chapter,kind:'results',resultsScenario:scene.id,sceneName:scene.name,directoryId:item.id};
        return example?['issue',...(example.strategy?['strategy']:[])].map((stage,index)=>({...base,id:id+(index?'-strategy':''),name:scene.id+' '+(index?'佈設成果':'現況議題'),resultType:'scenario-example',stage,content:example[stage],example})):[{...base,id,name:scene.id+' '+scene.name,resultType:'scenario-placeholder'}];
      })];
    });
  }
  const key=(page,id)=>` data-block-edit-key="${esc(page.id+'|results|'+id)}"`;
  const titleKey=page=>page.id+'|results|'+(['principles','background','framework'].includes(page.resultType)?'source-title':'title');
  function pageTitle(page){const item=page.content||{};return page.resultsScenario?page.sceneName:(page.resultsModule?page.resultsModule+' ':'')+(item.title||page.name);}
  const p=(page,id,text,className='')=>`<p${className?` class="${className}"`:''}${key(page,id)}>${esc(text)}</p>`;
  function points(page,items){return `<ol class="results-points"${['scenario-example','module-comparison','comparison'].includes(page.resultType)?' data-results-editable':''}>${items.map((item,index)=>`<li data-results-point="${esc(item.id)}"${item.moduleId?` data-results-module-id="${esc(item.moduleId)}"`:''}><span>${String(index+1).padStart(2,'0')}</span><div><h3${key(page,item.id+'-title')}>${esc(item.title)}</h3>${p(page,item.id+'-text',item.text)}</div></li>`).join('')}</ol>`;}
  function header(page){const item=page.content||{},chapter=window.PresentationStructure?.manifest?.presentations.find(deck=>deck.id==='results')?.chapters.find(chapter=>chapter.id===page.chapter);return `<header class="results-heading"><span class="eyebrow">${esc(page.resultsScenario||page.resultsModule||'RESULTS / '+(chapter?.code||'00'))}${page.stage?' · '+(page.example?.strategy?(page.stage==='issue'?'1 / 2':'2 / 2'):'現況議題'):''}</span><h1 id="slide-title" data-block-edit-key="${esc(titleKey(page))}">${esc(pageTitle(page))}</h1>${item.intro?p(page,'intro',item.intro):''}</header>`;}
  function figure(page,image,data,picker='',order=''){
    const asset=data.embeddedAssets[image.key];if(!asset)return `<div class="results-image-pending">圖片待補</div>`;
    const rotation=image.rotation||0,w=asset.width,h=asset.height,turned=rotation===90||rotation===270,width=turned?h:w,height=turned?w:h;
    const transform=rotation===90?`translate(${h} 0) rotate(90)`:rotation===180?`translate(${w} ${h}) rotate(180)`:rotation===270?`translate(0 ${w}) rotate(270)`:'';
    const view=image.crop||[0,0,width,height];
    return `<figure class="map-card results-map-card"><div class="map-toolbar">${picker||`<strong${key(page,'image-'+image.key)}>${esc(image.label)}</strong>`}<div class="map-tools"><button type="button" class="results-original" data-asset="${esc(image.key)}" title="開啟原圖" aria-label="開啟原圖：${esc(image.label)}">↗</button>${order}</div></div><div class="map-canvas results-map-canvas" data-editor-image-key="${esc(image.key)}"><svg class="scenario-detail-image results-diagram" viewBox="${view.join(' ')}" role="img" aria-label="${esc(image.label)}"><g data-results-artwork transform="${transform}"><image href="${esc(asset.url)}" width="${w}" height="${h}"/>${page.resultType==='comparison'?'<g class="results-hotspot-layer"></g>':''}</g></svg></div></figure>`;
  }
  function issueImages(page,data,roles=[['diagram','現況圖'],['photo','現況照片']]){
    return roles.map(([role,name])=>{
      const images=galleryImages(page,role);
      if(!images.length)return `<figure class="results-image-pending results-map-card" data-results-missing="${role}"><div class="map-toolbar"><strong>${name}</strong></div><div><span>${name}待補</span><p>${page.content.sourceMissing?'目前提供的 PowerPoint 未包含本情境素材。':'原 PowerPoint 未附獨立現況照片。'}</p></div></figure>`;
      const choiceKey=page.id+'/'+role,index=Math.max(0,images.findIndex(image=>image.key===imageChoices.get(choiceKey)));
      imageChoices.set(choiceKey,images[index].key);
      const picker=images.length>1?`<div class="results-image-picker" data-editor-ui="results-image-picker"><label><span class="sr-only">選擇${name}</span><select data-results-image-select="${role}" aria-label="選擇${name}">${images.map((image,i)=>`<option value="${i}" ${i===index?'selected':''}>${esc(image.label)}</option>`).join('')}</select></label><button type="button" data-results-image-step="-1" data-results-image-role="${role}" aria-label="上一張${name}" ${index===0?'disabled':''}>‹</button><span>${index+1} / ${images.length}</span><button type="button" data-results-image-step="1" data-results-image-role="${role}" aria-label="下一張${name}" ${index===images.length-1?'disabled':''}>›</button></div>`:'';
      const order=window.PresentationImageOrder?.button({key:'results:'+page.id+'/'+role,photos:['photo','current'].includes(role),selectedId:images[index].key,items:images.map(image=>({id:image.key,label:image.label,src:data.embeddedAssets[image.key].url}))})||'';
      return figure(page,images[index],data,picker,order);
    }).join('');
  }
  function galleryImages(page,role){const images=page.content.images.filter(image=>image.role===role);return window.PresentationImageOrder?.ordered(images,'results:'+page.id+'/'+role,image=>image.key)||images;}
  function chooseImage(role,index){
    const page=app?.page;if(page?.kind!=='results'||(page.stage!=='issue'&&page.resultType!=='module-comparison')||!Number.isInteger(index))return;
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
  function moduleOverview(data){
    return `<div class="results-scenario-list results-thumbnail-grid results-module-thumbnail-grid" aria-label="全部功能模組圖總覽">${Object.values(outline.moduleExamples||{}).sort((a,b)=>a.moduleId.localeCompare(b.moduleId)).map(example=>{
      const image=example.images.find(image=>image.role==='module'),label=example.moduleId+' '+example.title;
      return `<button type="button" data-page="${esc(example.pageId)}" data-results-module="${esc(example.moduleId)}" aria-label="${esc(label+'，現況與模組圖對照')}" title="${esc(label)}">${scenarioThumbnail(example.pageId,image,data)}<span class="results-scenario-caption"><span class="results-scenario-code">${esc(example.moduleId)}<span aria-hidden="true">↗</span></span><strong>${esc(example.title)}</strong></span></button>`;
    }).join('')}</div>`;
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
    return `<div class="results-scenario-list results-thumbnail-grid" aria-label="${page.content.deck==='general'?'一般':'複雜'}道路情境完整佈設圖總覽">${entries.map(scene=>{
      const label=scene.id+' '+scene.name;
      const strategy=outline.scenarioExamples?.[scene.id]?.strategy?.images[0],image=strategy||outline.scenarioThumbnails?.[scene.id];
      const body=`${scenarioThumbnail(strategy?scenarioPageId(scene.id)+'-strategy':page.id,image,data)}<span class="results-scenario-caption"><span class="results-scenario-code">${scene.id}<span aria-hidden="true">↗</span></span><strong>${esc(scene.name)}</strong></span>`;
      return `<button type="button" data-page="${scenarioPageId(scene.id)}" data-results-scenario="${scene.id}" aria-label="${esc(label+'，進入情境')}" title="${esc(label)}">${body}</button>`;
    }).join('')}</div>`;
  }
  function example(page,data){
    const item=page.content,items=window.visualLayoutEditor?.store?.config.content.results?.[page.id]?.points||item.items;
    const moduleIds=[...new Set(items.map(point=>point.moduleId).filter(Boolean))];
    return `<div class="results-case-layout"><div class="results-case-images ${page.stage==='issue'||item.images.length>1?'results-image-pair':''}">${page.stage==='issue'?issueImages(page,data):item.images.map(image=>figure(page,image,data)).join('')}</div><aside class="results-case-copy">${points(page,items)}${item.sourceMissing?'<p class="results-source-missing">缺少本情境的原始素材，保留此頁供後續補入。</p>':''}${page.stage==='strategy'&&moduleIds.length?`<div class="results-case-modules"><span>相關模組</span>${moduleIds.map(id=>`<span>${esc(id)}</span>`).join('')}</div>`:''}</aside></div>`;
  }
  function principleMarkup(text,format){
    const match=String(text).match(format==='requirement'?/^([^：]{1,12}：)([\s\S]*)$/:/^(\d+\.\s*)([\s\S]*)$/);
    if(!match)return esc(text);
    return format==='requirement'?`<strong class="results-principle-term">${esc(match[1])}</strong><span>${esc(match[2])}</span>`:`<span class="results-principle-number">${esc(match[1])}</span><span class="results-principle-rule">${esc(match[2])}</span>`;
  }
  function principles(page){
    const item=page.content,requirements=item.sections.length===1&&!item.sections[0].title&&item.sections[0].paragraphs.length===4&&item.sections[0].paragraphs.every(p=>/^[^：]{1,12}：/.test(p.text));
    const layout=requirements?'requirements':item.sections.length===3?'sections':'list';
    return `<div class="results-principles-document" data-principles-density="${item.density}" data-principles-layout="${layout}">${item.sections.map((section,index)=>{
      const callout=item.sections.length>1&&index===0&&section.paragraphs.length===1;
      return `<section class="results-principles-section${callout?' is-callout':''}${section.title?'':' is-untitled'}">${section.title?`<h2${key(page,section.id+'-heading')}>${esc(section.title)}</h2>`:''}<div class="results-principles-paragraphs${section.columns===2?' is-two-column':''}${requirements?' is-requirement-grid':''}">${section.paragraphs.map(paragraph=>{
        const format=requirements?'requirement':paragraph.numbered?'numbered':'';
        return `<p${format?` class="is-${format}" data-principle-format="${format}"`:''}${key(page,paragraph.id)}>${format?principleMarkup(paragraph.text,format):esc(paragraph.text)}</p>`;
      }).join('')}</div></section>`;
    }).join('')}</div>`;
  }
  function frameworkData(kind,scenarios,modules){
    if(!['general','complex','modules'].includes(kind))throw new Error('成果架構表分類無效');
    const modular=kind==='modules',groups=(modular?modules.themes:scenarios.groups.filter(group=>group.deck===kind)).map(group=>({id:group.id,name:group.name,rows:(modular?modules.modules.filter(item=>item.theme===group.id):scenarios.scenarios.filter(item=>item.group===group.id)).map(item=>({id:item.id,name:item.name,...(modular?{submodules:item.submodules.map(child=>({id:child.id,name:child.name}))}:{})}))}));
    const split=kind==='complex'?1:2;
    return {kind,groups,panels:[groups.slice(0,split),groups.slice(split)].filter(panel=>panel.length),count:groups.reduce((sum,group)=>sum+group.rows.length,0),submoduleCount:groups.reduce((sum,group)=>sum+group.rows.reduce((total,row)=>total+(row.submodules?.length||0),0),0)};
  }
  function modularRationale(page,data){
    const [issues,cause,goals]=page.content.sections;
    const heading=section=>`<h2${key(page,section.id+'-heading')}>${esc(section.title)}</h2>`;
    const paragraph=entry=>p(page,entry.id,entry.text);
    const issuePhotos=page.content.images.map((image,index)=>{
      const asset=data.embeddedAssets[image.key],title=issues.paragraphs[index*2],text=issues.paragraphs[index*2+1],crop=image.crop||[0,0,asset.width,asset.height];
      return `<figure class="rationale-example"><figcaption><h3${key(page,title.id)}>${esc(title.text)}</h3>${paragraph(text)}<button type="button" data-asset="${esc(image.key)}" aria-label="開啟原圖：${esc(image.label)}">原圖 ↗</button></figcaption><svg class="rationale-photo" viewBox="${crop.join(' ')}" role="img" aria-label="${esc(image.label)}"><image href="${esc(asset.url)}" width="${asset.width}" height="${asset.height}"/></svg></figure>`;
    }).join('');
    const goal=(title,text)=>`<div class="rationale-goal"><h3${key(page,title.id)}>${esc(title.text)}</h3>${paragraph(text)}</div>`;
    return `<div class="results-rationale"><section class="rationale-issues">${heading(issues)}<div class="rationale-examples">${issuePhotos}</div></section><span class="rationale-arrow" aria-hidden="true">→</span><section class="rationale-cause">${heading(cause)}<div class="rationale-panel">${paragraph(cause.paragraphs[0])}</div></section><span class="rationale-arrow" aria-hidden="true">→</span><section class="rationale-goals">${heading(goals)}<div class="rationale-panel">${goal(goals.paragraphs[0],goals.paragraphs[1])}${p(page,goals.paragraphs[2].id,goals.paragraphs[2].text,'rationale-plus')}${goal(goals.paragraphs[3],goals.paragraphs[4])}${p(page,goals.paragraphs[5].id,goals.paragraphs[5].text,'rationale-conclusion')}</div></section></div>`;
  }
  function guideStructure(page){
    const [logic,chapters]=page.content.sections;
    const text=(entry,tag='p',className='')=>`<${tag}${className?` class="${className}"`:''}${key(page,entry.id)}>${esc(entry.text)}</${tag}>`;
    const heading=section=>`<h2${key(page,section.id+'-heading')}>${esc(section.title)}</h2>`;
    const cards=[[0,4],[4,9],[9,13]].map(([start,end],index)=>{
      const entries=logic.paragraphs.slice(start,end);
      return `${index?'<span class="guide-flow-arrow" aria-hidden="true">↓</span>':''}<article class="guide-logic-card${index===1?' is-module':''}">${text(entries[0],'p','guide-step-number')}<div>${text(entries[1],'h3')}${entries.slice(2).map(entry=>text(entry)).join('')}</div></article>`;
    }).join('');
    const chapterCards=Array.from({length:6},(_,index)=>{
      const entries=chapters.paragraphs.slice(index*3,index*3+3);
      return `<article class="guide-chapter${index===2?' is-module':''}">${text(entries[0],'p','guide-chapter-number')}<div>${text(entries[1],'h3')}${entries[2]?text(entries[2]):''}</div></article>`;
    }).join('');
    return `<div class="results-guide-layout"><section class="guide-logic">${heading(logic)}<div class="guide-logic-flow"><aside class="guide-integration">${logic.paragraphs.slice(13).map(entry=>text(entry)).join('')}<svg viewBox="0 0 80 240" aria-hidden="true"><path d="M76 228C10 220 10 40 68 20M57 19L70 18L67 31" fill="none" stroke="currentColor" stroke-width="3"/></svg></aside><div class="guide-logic-cards">${cards}</div></div></section><span class="guide-link-arrow" aria-hidden="true">→</span><section class="guide-chapters">${heading(chapters)}<div class="guide-chapter-list">${chapterCards}</div></section></div>`;
  }
  function stepImages(page,data,steps){
    return `<div class="results-illustrated-steps">${steps}<div class="results-process-images">${page.content.images.map(image=>{
      const asset=data.embeddedAssets[image.key];
      return `<figure><figcaption><strong${key(page,'image-'+image.key)}>${esc(image.label)}</strong><button type="button" data-asset="${esc(image.key)}" aria-label="開啟原圖：${esc(image.label)}">原圖 ↗</button></figcaption><img src="${esc(asset.url)}" alt="${esc(image.label)}" width="${asset.width}" height="${asset.height}"/></figure>`;
    }).join('')}</div></div>`;
  }
  function framework(page){
    const data=frameworkData(page.content.framework,window.PresentationScenarios.catalog,window.PresentationModules.catalog),modular=data.kind==='modules';
    const headings=modular?['主題分類','模組編號／名稱','子模組編號／名稱']:['上級分類','情境編號','情境名稱'];
    const summary=`<div class="results-framework-summary"><span><b>${data.groups.length}</b> ${modular?'主題':'大分類'}</span><span><b>${data.count}</b> ${modular?'模組':'種情境'}</span>${modular?`<span><b>${data.submoduleCount}</b> 子模組</span>`:''}</div>`;
    return `${summary}<div class="results-framework-grid${modular?' is-module-framework':''}">${data.panels.map((groups,index)=>`<div class="results-framework-panel"><table class="results-architecture-table" data-table-columns="${page.id}/framework-${index}" aria-label="${esc(page.content.title+'（'+(index+1)+'）')}"><colgroup><col class="framework-group-column"><col class="framework-code-column"><col></colgroup><thead><tr>${headings.map((heading,column)=>`<th scope="col">${p(page,'framework-heading-'+index+'-'+column,heading)}</th>`).join('')}</tr></thead>${groups.map(group=>`<tbody data-framework-group="${esc(group.id)}">${group.rows.map((row,index)=>`<tr data-framework-row="${esc(row.id)}">${index===0?`<th scope="rowgroup" rowspan="${group.rows.length}" class="framework-group">${p(page,'framework-'+group.id+'-code',group.id,'framework-code')}${p(page,'framework-'+group.id+'-name',group.name)}</th>`:''}<td class="framework-identity">${p(page,'framework-'+row.id+'-code',row.id,'framework-code')}${modular?p(page,'framework-'+row.id+'-name',row.name):''}</td><td>${modular?row.submodules.map(child=>`<p data-framework-child="${esc(child.id)}"${key(page,'framework-'+child.id+'-name')}>${esc(child.id+' '+child.name)}</p>`).join(''):p(page,'framework-'+row.id+'-name',row.name)}</td></tr>`).join('')}</tbody>`).join('')}</table></div>`).join('')}</div>`;
  }
  const comparisonPoints=(page,config=typeof window==='object'?window.visualLayoutEditor?.store?.config:null)=>config?.content.results?.[page.id]?.points||page.content.items;
  const stepCount=(page,config)=>page.resultType==='comparison'?Math.max(1,comparisonPoints(page,config).length):1;
  function comparisonSpec(page,point,image,asset,state={}){
    const key='results:'+page.id+':'+point.id+':'+image.key,focus=page.content.items.find(item=>item.id===point.id)?.focus?.[image.key];
    const fallback=focus?.rect||[asset.width*.3,asset.height*.3,asset.width*.4,asset.height*.4],saved=state.highlights?.[key]||{};
    const box=validBox(saved.box,asset)?saved.box:fallback,rotation=saved.rotation||0;
    const crop=validBox(saved.crop,asset)?saved.crop:focus?.crop||(()=>{
      const bounds=typeof window==='object'?window.VisualLayoutCore.highlightBounds(box,rotation):box,w=Math.min(asset.width,bounds[2]*1.6),h=Math.min(asset.height,bounds[3]*1.6);
      return [Math.max(0,Math.min(asset.width-w,bounds[0]+bounds[2]/2-w/2)),Math.max(0,Math.min(asset.height-h,bounds[1]+bounds[3]/2-h/2)),w,h];
    })();
    return {key,box:[...box],crop:[...crop],rotation,defaultBox:[...fallback],enabled:!saved.deleted&&!state.disabledHighlights?.[key]&&(!state.images?.[image.key]||saved.imageKey===image.key)};
  }
  function frames(){
    const page=app?.page;if(page?.resultType!=='comparison')return [];
    const point=comparisonPoints(page)[app.state.phase];if(!point)return [];
    return page.content.images.map(image=>{
      const svg=[...document.querySelectorAll('.results-diagram')].find(svg=>svg.closest('[data-editor-image-key]').dataset.editorImageKey===image.key),asset=app.data.embeddedAssets[image.key];
      if(!svg||!asset)return null;
      const spec=()=>comparisonSpec(page,point,image,asset,window.generalRoadEditor.state);
      return {key:spec().key,label:image.label+'｜比較重點 '+String(app.state.phase+1).padStart(2,'0'),element:svg,coordinateElement:svg.querySelector('[data-results-artwork]'),width:asset.width,height:asset.height,imageKey:image.key,allowDelete:true,hasBox:true,getBox:()=>spec().box,getCrop:()=>spec().crop,toSource:bounds=>[...bounds],fromSource:bounds=>[...bounds],setBounds:(_kind,bounds)=>[...bounds],defaults:{box:spec().defaultBox,crop:spec().crop}};
    }).filter(Boolean);
  }
  function afterRender(){
    if(app?.page.resultType==='framework'){window.TableColumnEditor?.mount(document.getElementById('presentation'));return;}
    if(app?.page.resultType==='principles'){
      if(!window.generalRoadEditor.editing)for(const node of document.querySelectorAll('[data-principle-format]'))node.innerHTML=principleMarkup(node.textContent,node.dataset.principleFormat);
      return;
    }
    const page=app?.page;if(page?.resultType!=='comparison')return;
    const items=comparisonPoints(page),phase=app.state.phase,editing=window.generalRoadEditor.editing;
    for(const row of document.querySelectorAll('.results-points>li')){
      const index=items.findIndex(point=>point.id===row.dataset.resultsPoint),active=index===phase;
      row.classList.toggle('is-comparison-active',active);row.dataset.resultsComparisonStep=String(index);
      row.querySelector('h3').dataset.placeholder='點此輸入差異標題';row.querySelector('p').dataset.placeholder='點此輸入差異說明';
      if(!editing){row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-pressed',String(active));row.setAttribute('aria-label','比較重點 '+(index+1)+(items[index].title?'：'+items[index].title:''));}
    }
    for(const frame of frames()){
      const image=page.content.images.find(image=>image.key===frame.imageKey),asset=app.data.embeddedAssets[image.key],point=items[phase],spec=comparisonSpec(page,point,image,asset,window.generalRoadEditor.state),layer=frame.element.querySelector('.results-hotspot-layer');
      layer.replaceChildren();if(!spec.enabled)continue;
      const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
      for(const [key,value]of Object.entries({x:spec.box[0],y:spec.box[1],width:spec.box[2],height:spec.box[3],transform:window.VisualLayoutCore.highlightTransform(spec.box,spec.rotation)}))rect.setAttribute(key,value);
      rect.classList.add('results-focus-rect');rect.dataset.highlightKey=spec.key;layer.append(rect);
      if(!editing){
        const matrix=frame.element.getScreenCTM().inverse().multiply(frame.coordinateElement.getScreenCTM()),[x,y,w,h]=spec.crop,vertices=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
        const xs=vertices.map(p=>p.x),ys=vertices.map(p=>p.y),view=[Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)],ratio=frame.element.clientWidth/frame.element.clientHeight;
        if(view[2]/view[3]>ratio){const height=view[2]/ratio;view[1]-=(height-view[3])/2;view[3]=height;}else{const width=view[3]*ratio;view[0]-=(width-view[2])/2;view[2]=width;}
        window.generalRoadViewport.get(frame.element)?.write(view,false);
      }
    }
    document.getElementById('phase-label').textContent=items.length?'比較重點 '+(phase+1)+' / '+items.length:'';
    if(phase<items.length-1){document.getElementById('next-label').textContent='下一組差異 '+String(phase+2).padStart(2,'0');document.getElementById('next').setAttribute('aria-label','下一組差異 '+(phase+2));document.getElementById('next').title=document.getElementById('next-label').textContent;}
  }
  function chooseComparisonStep(event){
    const target=event.target.closest('[data-results-comparison-step]');if(!target||app?.page.resultType!=='comparison')return;
    if(target.tagName!=='BUTTON'&&window.generalRoadEditor.editing)return;
    if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
    event.preventDefault();if(event.type==='keydown')event.stopImmediatePropagation();app.goPage(app.page.id,Number(target.dataset.resultsComparisonStep));
  }
  if(typeof document==='object'){document.addEventListener('click',chooseComparisonStep);document.addEventListener('keydown',chooseComparisonStep);}
  function noteReplacement(key){
    const page=app?.page;if(page?.resultType!=='comparison'||!page.content.images.some(image=>image.key===key))return;
    for(const point of comparisonPoints(page))window.generalRoadEditor.state.disabledHighlights['results:'+page.id+':'+point.id+':'+key]=true;
  }
  function render(page,data){
    if(page.resultType==='error')return `<section class="slide results-slide"><h1 id="slide-title">成果簡報尚未載入</h1><p role="alert">請重新整理以載入成果簡報。${esc(loadError)}</p></section>`;
    const item=page.content||{};let body='';
    switch(page.resultType){
      case 'cover':{const meeting=item.meeting||{},image=item.images?.[0],art=image&&data.embeddedAssets[image.key];body=`${art?`<div class="results-cover-art" aria-hidden="true"><img src="${esc(art.url)}" width="${art.width}" height="${art.height}" alt="" draggable="false"></div>`:''}<header class="results-cover-heading">${p(page,'cover-event',meeting.event,'results-cover-event')}${p(page,'cover-project',meeting.project,'results-cover-project')}<h1 id="slide-title"${key(page,'title')}>${esc(item.title)}</h1><div class="results-cover-rule" aria-hidden="true"></div></header><div class="results-cover-meta">${p(page,'cover-presenter',meeting.presenter,'results-cover-presenter')}<div class="results-cover-details">${p(page,'cover-organization',meeting.organization,'results-cover-organization')}${p(page,'cover-date',meeting.date,'results-cover-date')}</div></div>`;break;}
      case 'outline':body=`<div class="results-outline-menu">${window.PresentationStructure.manifest.presentations[0].chapters.map(chapter=>`<button type="button" data-page="${app?.pages.find(page=>page.chapter===chapter.id)?.id||chapter.entry}"><span>${chapter.code}</span><strong>${esc(window.PresentationStructure.chapterName(chapter))}</strong><b>↗</b></button>`).join('')}</div>`;break;
      case 'cards':case 'steps':body=`<div class="results-cards ${page.resultType==='steps'?'results-steps':''}" style="--results-count:${item.items.length}">${item.items.map((point,index)=>`<article><span class="results-card-number">${String(index+1).padStart(2,'0')}</span><h2${key(page,point.id+'-title')}>${esc(point.title)}</h2>${p(page,point.id+'-text',point.text)}</article>`).join('')}</div>`;if(page.resultType==='steps'&&item.images?.length)body=stepImages(page,data,body);break;
      case 'background':body=`<div class="results-background-content"><div class="results-background-text"><div class="results-background-top">${item.lead.map((paragraph,index)=>p(page,paragraph.id,paragraph.text,index?'is-reference':'')).join('')}</div><div class="results-background-copy">${item.items.map(paragraph=>p(page,paragraph.id+'-text',paragraph.text)).join('')}</div></div><div class="results-background-figure" data-image-fit="contain">${figure(page,item.images[0],data)}</div></div>`;break;
      case 'principles':body=principles(page);break;
      case 'framework':body=framework(page);break;
      case 'modular-rationale':body=modularRationale(page,data);break;
      case 'guide-structure':body=guideStructure(page);break;
      case 'module-index':body=moduleIndex(page);break;
      case 'module-overview':body=moduleOverview(data);break;
      case 'module-comparison':body=`<div class="results-case-layout"><div class="results-case-images results-image-pair" data-image-fit="contain">${issueImages(page,data,[['current','現況問題'],['module','模組圖']])}</div><aside class="results-case-copy">${points(page,window.visualLayoutEditor?.store?.config.content.results?.[page.id]?.points||item.items)}</aside></div>`;break;
      case 'comparison':{const items=comparisonPoints(page);body=`<div class="results-case-layout"><div class="results-case-images results-image-pair" data-image-fit="contain">${item.images.map(image=>figure(page,image,data)).join('')}</div><aside class="results-case-copy"><nav class="results-comparison-switcher" aria-label="選擇比較重點"><span>比較重點</span>${items.map((point,index)=>`<button type="button" data-results-comparison-step="${index}" aria-label="比較重點 ${index+1}" aria-pressed="${index===app.state.phase}">${String(index+1).padStart(2,'0')}</button>`).join('')}</nav>${points(page,items)}</aside></div>`;break;}
      case 'scenario-index':body=scenarioIndex(page,data);break;
      case 'module-example':body=`<div class="results-case-layout"><div class="results-case-images results-image-pair">${[{key:'module:stop-basic',label:'M2-01.1 停管制'},{key:'module:yield-basic',label:'M2-01.2 讓管制'}].map(image=>figure(page,image,data)).join('')}</div><aside class="results-case-copy">${points(page,item.items)}</aside></div>`;break;
      case 'scenario-example':body=example(page,data);break;
      case 'scenario-placeholder':body=`<div class="results-reserved"><div><h2>現況議題</h2><div aria-label="現況素材預留區"></div></div><div><h2>佈設成果</h2><div aria-label="佈設成果預留區"></div></div></div>`;break;
    }
    const pageClass=['cards','steps'].includes(page.resultType)?page.resultType+'-page':page.resultType;
    return `<section class="slide results-slide results-${pageClass}" data-results-page="${page.id}" aria-labelledby="slide-title">${page.resultType==='cover'?'':header(page)}${body}${item.takeaway?p(page,'takeaway',item.takeaway,'results-takeaway'):''}</section>`;
  }
  return {load,validate,validateConditions,validateStrategies,validateModuleComparisons,mergeConditions,mergeStrategies,mergeModuleComparisons,prepare,connect:api=>{app=api;},buildPages,pageTitle,titleKey,frameworkData,stepCount,comparisonSpec,frames,afterRender,noteReplacement,scenarioPageId,scenarioThumbnail,resolvePage:id=>outline?.pageAliases?.[id]||id,pages:()=>buildPages(outline,window.PresentationScenarios.catalog),render,get outline(){return outline;},get error(){return loadError;}};
});
