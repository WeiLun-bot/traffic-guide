(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.PresentationResults=api;root.presentationResultsReady=api.load();}
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  let outline=null,loadError='',app=null;
  const imageChoices=new Map();
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const types=new Set(['cover','outline','cards','steps','module-index','module-example','scenario-index','comparison','principles','background','framework','modular-rationale','guide-structure','book-demo','guide-experience','road-clarity','extension-cards']);
  const validBox=(box,asset)=>Array.isArray(box)&&box.length===4&&box.every(Number.isFinite)&&box[0]>=0&&box[1]>=0&&box[2]>0&&box[3]>0&&box[0]+box[2]<=asset.width+.01&&box[1]+box[3]<=asset.height+.01;
  const scenarioPageId=code=>'results-scenario-'+code.toLowerCase();
  function validate(value){
    if(value?.schemaVersion!==1||!Array.isArray(value.pages)||!value.pages.length)throw new Error('成果簡報格式無效');
    const ids=new Set();
    const points=items=>{if(!Array.isArray(items))throw new Error('成果說明格式無效');const keys=new Set();for(const item of items){if(!/^[\w-]+$/.test(item.id)||keys.has(item.id)||typeof item.title!=='string'||typeof item.text!=='string')throw new Error('成果說明項目無效');keys.add(item.id);}};
    for(const page of value.pages){
      if(!/^results-[\w-]+$/.test(page.id)||ids.has(page.id)||!/^results-[\w-]+$/.test(page.chapter)||!types.has(page.type)||typeof page.title!=='string')throw new Error('成果簡報頁面無效');ids.add(page.id);
      if(page.zoomStepPageId!==undefined&&(page.type!=='guide-experience'||page.items?.length!==1||page.items[0].id!=='vector'||!/^results-[\w-]+$/.test(page.zoomStepPageId)||page.zoomStepPageId===page.id))throw new Error('圖例放大步驟格式無效');
      if(page.type==='book-demo'&&page.book!=='road_book_3d/index.html')throw new Error('書籍展示來源無效');
      if(page.items)points(page.items);
      if(page.type==='extension-cards'){
        if(!Array.isArray(page.sections)||!page.sections.length||page.sections.length>3||!Array.isArray(page.images)||new Set(page.sections.map(section=>section.id)).size!==page.sections.length)throw new Error('延伸應用複製頁格式無效');
        for(const section of page.sections){if(!/^[\w-]+$/.test(section.id)||typeof section.title!=='string'||!Number.isInteger(section.number)||section.number<1||!Array.isArray(section.paragraphs)||!section.paragraphs.length)throw new Error('延伸應用主題無效');points(section.paragraphs);}
        const imageKeys=new Set();for(const image of page.images){const asset=value.assets?.[image.key];if(imageKeys.has(image.key)||!page.sections.some(section=>section.id===image.topic)||typeof image.label!=='string'||![0,90,180,270].includes(image.rotation||0)||!asset||asset.role!=='extension'||!/^materials\/(?:03-modules\/M[1-4]-\d{2}\/[^/\\]+|edited\/[a-f0-9]{64})\.(?:svg|png|jpe?g)$/.test(asset.file)||!Number.isFinite(asset.width)||asset.width<=0||!Number.isFinite(asset.height)||asset.height<=0||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('延伸應用圖片無效');imageKeys.add(image.key);}
      }
      if(page.callouts)points(page.callouts);
      if(page.type==='road-clarity'){
        const image=page.images?.[0],asset=value.assets?.[image?.key];
        if(page.items?.length!==2||page.images?.length!==1||!asset||asset.role!=='layout'||asset.scenario!=='C1-08'||!/^materials\/05-複雜道路情境\/C1-08\/[^/\\]+\.svg$/.test(asset.file)||typeof image.label!=='string'||image.crop&&!validBox(image.crop,asset)||!Number.isFinite(asset.width)||asset.width<=0||!Number.isFinite(asset.height)||asset.height<=0||!/^[a-f0-9]{64}$/.test(asset.sha256)||page.flowPaths?.length!==3||new Set(page.flowPaths.map(route=>route.id)).size!==3||page.flowPaths.some(route=>!/^[-\w]+$/.test(route.id)||typeof route.path!=='string'||!/^M[MLCQHVSTZmlcqhvstz\d\s,.\-]+$/.test(route.path)||route.duration!==undefined&&(!Number.isFinite(route.duration)||route.duration<6||route.duration>60)||route.phase!==undefined&&(!Number.isFinite(route.phase)||route.phase<0||route.phase>=1)))throw new Error('道路動線示意格式無效');
      }
      if(page.type==='guide-experience'){
        const topics=new Set(['layout','bookmarks','index','vector']),keys=new Set();
        if(page.chapter!=='results-wrap'||page.items?.length!==1||page.items.some(item=>!topics.has(item.id))||!Array.isArray(page.images))throw new Error('閱讀體驗頁內容無效');
        for(const item of page.items)if(!(item.id==='layout'?[2,4]:item.id==='index'?[3]:item.id==='bookmarks'?[2,3]:[item.id==='vector'?1:2]).includes(page.images.filter(image=>image.topic===item.id).length))throw new Error('閱讀體驗圖片數量無效');
        for(const image of page.images){
          const asset=value.assets?.[image.key],raster=asset?.role==='experience'&&/^materials\/00-計畫緣起\/reading-[\w-]+\.(?:png|webp)$/.test(asset.file),vector=image.topic==='vector'&&asset?.role==='layout'&&asset.scenario==='G2-01'&&/^materials\/04-一般道路情境\/G2-01\/[^/\\]+\.svg$/.test(asset.file);
          if(!/^[\w:-]+$/.test(image.key)||keys.has(image.key)||!page.items.some(item=>item.id===image.topic)||typeof image.label!=='string'||!asset||!(image.topic==='vector'?vector:raster)||!Number.isFinite(asset.width)||asset.width<=0||!Number.isFinite(asset.height)||asset.height<=0||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('閱讀體驗圖片來源無效');
          keys.add(image.key);
        }
      }
      if(page.layout!==undefined&&page.layout!=='lesson'||page.numbered!==undefined&&typeof page.numbered!=='boolean'||page.calloutsTitle!==undefined&&typeof page.calloutsTitle!=='string'||page.items?.some(item=>item.includes!==undefined&&typeof item.includes!=='string'))throw new Error('模組架構說明格式無效');
      if(page.meeting&&(page.type!=='cover'||['project','event','presenter','organization','date'].some(field=>typeof page.meeting[field]!=='string'||!page.meeting[field].trim())))throw new Error('封面會議資訊無效');
      if(page.type==='steps'&&page.images){
        if(!Array.isArray(page.images)||!page.images.length||new Set(page.images.map(image=>image.key)).size!==page.images.length)throw new Error('流程圖文素材無效');
        for(const image of page.images){const asset=value.assets?.[image.key];if(!/^[\w:-]+$/.test(image.key)||typeof image.label!=='string'||!asset||!(asset.role==='background'&&/^materials\/00-計畫緣起\/[^/\\]+\.(?:png|jpe?g)$/.test(asset.file)||asset.role==='module'&&/^materials\/03-modules\/M[1-4]-\d{2}\/[^/\\]+\.svg$/.test(asset.file)&&asset.moduleId===asset.file.split('/')[2])||!Number.isFinite(asset.width)||asset.width<=0||!Number.isFinite(asset.height)||asset.height<=0||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('流程原圖來源無效');}
      }
      if(page.imagePlacement!==undefined&&(page.type!=='cards'||!['below-cards','in-cards'].includes(page.imagePlacement)||!page.images?.length))throw new Error('模組圖例版面無效');
      if(page.type==='cards'&&page.images){
        const topics=new Set(page.items.map(item=>item.id)),keys=new Set();
        if(!Array.isArray(page.images)||page.items.some(item=>{const count=page.images.filter(image=>image.topic===item.id).length;return count<(page.imagePlacement==='in-cards'?0:1)||count>2;}))throw new Error('主題代表型圖片數量無效');
        for(const image of page.images){const asset=value.assets?.[image.key];if(!topics.has(image.topic)||keys.has(image.key)||typeof image.label!=='string'||![0,90,180,270].includes(image.rotation||0)||!asset||asset.moduleId!==image.moduleId||!['module',...(page.imagePlacement==='in-cards'?['current']:[])].includes(asset.role)||!/^M[1-4]-\d{2}$/.test(image.moduleId)||!asset.file?.startsWith('materials/03-modules/'+image.moduleId+'/')||!(asset.role==='module'?asset.file.endsWith('.svg'):/\.(?:png|jpe?g)$/.test(asset.file))||asset.file.split('/').length!==4||!Number.isFinite(asset.width)||asset.width<=0||!Number.isFinite(asset.height)||asset.height<=0||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('主題代表型圖片來源無效');keys.add(image.key);}
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
      if(page.includedModules!==undefined&&(!Array.isArray(page.includedModules)||!page.includedModules.length||new Set(page.includedModules).size!==page.includedModules.length||page.includedModules.some(id=>typeof id!=='string'||!/^M[1-4]-\d{2}$/.test(id))))throw new Error('保留模組清單無效');
      if(page.type==='scenario-index'&&!['general','complex'].includes(page.deck))throw new Error('情境分類無效');
      if(page.includedScenarios!==undefined&&(!Array.isArray(page.includedScenarios)||!page.includedScenarios.length||new Set(page.includedScenarios).size!==page.includedScenarios.length||page.includedScenarios.some(id=>typeof id!=='string'||!(page.deck==='complex'?/^C[1-4]-\d{2}$/:/^G[1-4]-\d{2}$/).test(id))))throw new Error('保留情境清單無效');
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
      if(entry.sideHeading!==undefined&&(typeof entry.sideHeading!=='string'||!entry.sideHeading.trim()))throw new Error('模組說明標題無效');
      if(entry.currentIssues!==undefined&&(!Array.isArray(entry.currentIssues)||!entry.currentIssues.length||entry.currentIssues.some(issue=>!/^[\w-]+$/.test(issue.id)||typeof issue.text!=='string')))throw new Error('模組現況問題無效');
      if(entry.references!==undefined&&(!Array.isArray(entry.references)||!entry.references.length||entry.references.some(item=>!/^\d+(?:-\d+)?$/.test(item.reg)||typeof item.label!=='string')))throw new Error('模組相關條文無效');
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
      data.assets[key]=asset.label;data.assetMeta[key]={label:asset.label,module:asset.moduleId?asset.moduleId+' / MODULE COMPARISON':asset.role==='background'?'計畫緣起 / BACKGROUND':asset.role==='experience'?'閱讀體驗 / GUIDE EXPERIENCE':asset.scenario+(['strategy','layout'].includes(asset.role)?' / OVERALL LAYOUT':' / CURRENT CONDITIONS'),rotation:asset.rotation||0};
    }
  }
  function buildPages(content,catalog){
    if(!content)return [{id:'results-intro',chapter:'results-intro',kind:'results',name:'成果簡報尚未載入',resultType:'error'}];
    const moduleExamples=Object.values(content.moduleExamples||{}).sort((a,b)=>a.moduleId.localeCompare(b.moduleId));
    return content.pages.flatMap(item=>{
      if(moduleExamples.length&&['results-module-list-2','results-module-example'].includes(item.id))return [];
      const page={id:item.id,chapter:item.chapter,kind:'results',name:item.title,resultType:item.type,content:item};
      if(item.id==='results-modules'&&moduleExamples.length)return [...['M1','M2','M3','M4'].flatMap(theme=>(theme==='M3'?[1,2]:[1]).map(part=>({...page,id:moduleOverviewId(theme,part),name:item.title+'｜'+theme+(theme==='M3'?'（'+part+'/2）':''),resultType:'module-overview',moduleOverviewTheme:theme,moduleOverviewPart:part,content:{...item,title:item.title+'｜'+theme+(theme==='M3'?'（'+part+'/2）':'')}}))),...moduleExamples.filter(example=>!item.includedModules||item.includedModules.includes(example.moduleId)).map(example=>({id:example.pageId,chapter:item.chapter,kind:'results',resultsModule:example.moduleId,name:example.moduleId+' '+example.title+'｜現況與模組圖對照',resultType:'module-comparison',directoryId:moduleOverviewId(example.moduleId.slice(0,2)),content:example}))];
      if(item.type!=='scenario-index')return [page];
      const groups=catalog.groups.filter(group=>group.deck===item.deck);
      return [page,...catalog.scenarios.filter(scene=>groups.some(group=>group.id===scene.group)&&(!item.includedScenarios||item.includedScenarios.includes(scene.id))).flatMap(scene=>{
        const example=content.scenarioExamples?.[scene.id],id=scenarioPageId(scene.id),base={chapter:item.chapter,kind:'results',resultsScenario:scene.id,sceneName:scene.name,directoryId:item.id};
        return example?['issue',...(example.strategy?['strategy']:[])].map((stage,index)=>({...base,id:id+(index?'-strategy':''),name:scene.id+' '+(index?'佈設成果':'現況議題'),resultType:'scenario-example',stage,content:example[stage],example})):[{...base,id,name:scene.id+' '+scene.name,resultType:'scenario-placeholder'}];
      })];
    });
  }
  const key=(page,id)=>` data-block-edit-key="${esc(page.id+'|results|'+id)}"`;
  const titleKey=page=>page.id+'|results|'+(['principles','background','framework'].includes(page.resultType)?'source-title':'title');
  function pageTitle(page){const item=page.content||{};return page.resultsScenario?page.sceneName:(page.resultsModule?page.resultsModule+' ':'')+(item.title||page.name);}
  const p=(page,id,text,className='')=>`<p${className?` class="${className}"`:''}${key(page,id)}>${esc(text)}</p>`;
  function points(page,items){return `<ol class="results-points"${['scenario-example','module-comparison','comparison'].includes(page.resultType)?' data-results-editable':''}>${items.map((item,index)=>`<li data-results-point="${esc(item.id)}"${item.moduleId?` data-results-module-id="${esc(item.moduleId)}"`:''}><span>${page.resultType==='extension-cards'?'&#8226;':String(index+1).padStart(2,'0')}</span><div><h3${key(page,item.id+'-title')}>${esc(item.title)}</h3>${p(page,item.id+'-text',item.text)}</div></li>`).join('')}</ol>`;}
  function header(page){const item=page.content||{},chapter=window.PresentationStructure?.manifest?.presentations.find(deck=>deck.id==='results')?.chapters.find(chapter=>chapter.id===page.chapter);return `<header class="results-heading"><span class="eyebrow">${esc(item.eyebrow||page.resultsScenario||page.resultsModule||'RESULTS / '+(chapter?.code||'00'))}${page.stage?' · '+(page.example?.strategy?(page.stage==='issue'?'1 / 2':'2 / 2'):'現況議題'):''}</span><h1 id="slide-title" data-block-edit-key="${esc(titleKey(page))}">${esc(pageTitle(page))}</h1>${item.intro?p(page,'intro',item.intro):''}</header>`;}
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
  const moduleOverviewId=(theme,part=1)=>theme==='M1'?'results-modules':'results-modules-'+theme.toLowerCase()+(part===2?'-2':'');
  function moduleRepresentatives(catalog,documents){
    const byId=new Map(documents.map(doc=>[doc.id,doc])),entries=new Map();
    for(const module of catalog.modules){const doc=byId.get(module.id);if(!doc)continue;
      for(const sub of module.submodules){
        const flow=doc.submoduleFlows?.find(flow=>flow.submoduleId===sub.id),source=doc.pages.find(page=>page.id===flow?.stages.find(stage=>stage.id==='issues')?.pageId)||doc.pages.find(page=>page.submoduleId===sub.id);
        const options=doc.pages[0].overviewGroups?.[sub.id]||{},owner=byId.get(options.sourceModuleId)||doc;
        let assets=options.assets||source?.assets||[];
        if(module.submodules.length===1)assets=doc.directoryAssets||assets;
        if(options.hidden){const shared=Object.values(doc.pages[0].overviewGroups||{}).find(group=>group.label?.includes(sub.id));assets=shared?.assets||assets;}
        for(const assetId of assets){const asset=owner.assets[assetId];if(!asset)continue;const id=module.id+':'+assetId;
          if(!entries.has(id))entries.set(id,{id,moduleId:module.id,theme:module.theme,assetId,key:'module:'+assetId,label:asset.label,rotation:asset.rotation||0,file:asset.file,submodules:[]});
          const entry=entries.get(id);if(!entry.submodules.some(item=>item.id===sub.id))entry.submodules.push({id:sub.id,name:sub.name});
        }
      }
    }
    return [...entries.values()];
  }
  function representativeName(entry,entries){
    const names=entry.submodules.map(sub=>sub.name.replace(/（含[^）]*）/g,'')).join('／');
    const siblings=entries.filter(item=>item.moduleId===entry.moduleId&&item.submodules.some(sub=>entry.submodules.some(other=>other.id===sub.id)));
    if(siblings.length<2)return names;
    const clean=label=>label.replace(/代表型\d*/g,'').replace(/[_＿]|[─—]{2,}/g,'－').replace(/\s*T\s*字\s*/g,'T字').trim();
    const normalized=label=>clean(label).replace(/^行人(?=路口穿越|路段穿越)/,'').replace(/\s+/g,'');
    const label=clean(entry.label),base=normalized(names),value=normalized(entry.label);let suffix=label;
    if(value===base||value===base+'配置'){
      const number=entry.label.match(/代表型(\d+)/)?.[1],same=siblings.every(other=>normalized(other.label)===value);
      suffix=number&&same?'型式'+number:'';
    }else if(label.startsWith(names))suffix=label.slice(names.length).replace(/^[－\s]+/,'');
    if(suffix){
      const number=entry.label.match(/代表型(\d+)/)?.[1];if(number&&!suffix.startsWith('型式')&&siblings.filter(other=>normalized(other.label)===value).length>1)suffix+='（型式'+number+'）';
      if(names.startsWith('機車')&&suffix.startsWith('機車'))suffix=suffix.slice(2);
      if(names.endsWith('控制')&&suffix.endsWith('控制'))suffix=suffix.slice(0,-2);
    }
    return names+(suffix?'－'+suffix:'');
  }
  function moduleOverview(page,data){
    const modules=window.PresentationModules,catalog=modules.catalog,theme=page.moduleOverviewTheme||'M1',part=page.moduleOverviewPart||1,all=moduleRepresentatives(catalog,modules.contents),entries=all.filter(entry=>entry.theme===theme&&(theme!=='M3'||(part===1?['M3-01','M3-02']:['M3-03','M3-04']).includes(entry.moduleId))),columns=theme==='M3'&&part===2?4:entries.length<=9?3:4;
    const nav='<nav class="results-representative-themes" aria-label="代表型圖例主題">'+catalog.themes.map(item=>`<button type="button" data-page="${moduleOverviewId(item.id)}" ${item.id===theme?'aria-current="page"':''}><span>${item.id}</span>${esc(item.name)}</button>`).join('')+'</nav>';
    const parts=theme==='M3'?`<nav class="results-representative-parts" aria-label="M3 總覽分頁">${['行人、自行車','機車、公車'].map((label,index)=>`<button type="button" data-page="${moduleOverviewId(theme,index+1)}" ${part===index+1?'aria-current="page"':''}>${index+1}　${label}</button>`).join('')}</nav>`:'';
    const summary=`<div class="results-representative-summary"><span>15 個模組・27 個子模組・${all.length} 張代表型圖例</span>${parts}<span>點選圖例可放大檢視</span></div>`;
    return nav+summary+`<div class="results-scenario-list results-thumbnail-grid results-module-thumbnail-grid results-representative-grid" style="--representative-columns:${columns};--representative-rows:${Math.ceil(entries.length/columns)}" aria-label="${theme} 全部模組與子模組代表型圖例">${entries.map(entry=>{
      const codes=entry.submodules.map(sub=>sub.id).join('／'),name=representativeName(entry,all),label=codes+' '+name;
      const viewPage='results-representative-'+entry.moduleId.toLowerCase()+'-'+entry.assetId;
      const caption=`<span class="results-scenario-caption"><span class="results-scenario-code">${esc(codes)}</span><strong>${esc(name)}</strong></span>`;
      return figure(page,entry,data,caption)
        .replace('<figure class="map-card results-map-card">',`<figure class="map-card results-map-card results-representative-card" data-results-module="${esc(entry.moduleId)}" data-results-submodules="${esc(entry.submodules.map(sub=>sub.id).join(' '))}" data-initial-view-page="${esc(viewPage)}" title="${esc(label)}">`)
        .replace('</svg></div></figure>',`</svg><button type="button" class="representative-image-open" data-asset="${esc(entry.key)}" aria-label="${esc(label+'，放大圖例')}" title="放大圖例"></button></div></figure>`);
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
      const body=`<span class="results-scenario-caption"><span class="results-scenario-code">${scene.id}<span aria-hidden="true">↗</span></span><strong>${esc(scene.name)}</strong></span>${scenarioThumbnail(strategy?scenarioPageId(scene.id)+'-strategy':page.id,image,data)}`;
      const included=!page.content.includedScenarios||page.content.includedScenarios.includes(scene.id),action=included?`data-page="${scenarioPageId(scene.id)}"`:`data-asset="${esc(image.key)}"`;
      return `<button type="button" ${action} data-results-scenario="${scene.id}" aria-label="${esc(label+(included?'，進入情境':'，放大佈設圖'))}" title="${esc(label)}">${body}</button>`;
    }).join('')}</div>`;
  }
  function example(page,data){
    const item=page.content,items=window.visualLayoutEditor?.store?.config.content.results?.[page.id]?.points||item.items;
    const moduleIds=[...new Set(items.map(point=>point.moduleId).filter(Boolean))];
    return `<div class="results-case-layout"><div class="results-case-images ${page.stage==='issue'||item.images.length>1?'results-image-pair':''}">${page.stage==='issue'?issueImages(page,data):item.images.map(image=>figure(page,image,data)).join('')}</div><aside class="results-case-copy">${['results-scenario-g4-03','results-scenario-g4-03-strategy','results-scenario-c1-04','results-scenario-c1-04-strategy'].includes(page.id)?`<h2 class="results-case-section-title"${key(page,page.stage==='strategy'?'strategy-heading':'issue-heading')}>${page.stage==='strategy'?'設置要點':'現況議題'}</h2>`:''}${points(page,items)}${item.sourceMissing?'<p class="results-source-missing">缺少本情境的原始素材，保留此頁供後續補入。</p>':''}${page.stage==='strategy'&&moduleIds.length?`<div class="results-case-modules"><span>相關模組</span>${moduleIds.map(id=>`<span>${esc(id)}</span>`).join('')}</div>`:''}</aside></div>`;
  }
  function moduleComparison(page,data){
    const item=page.content,items=window.visualLayoutEditor?.store?.config.content.results?.[page.id]?.points||item.items;
    if(!item.currentIssues?.length)return `<div class="results-case-layout"><div class="results-case-images results-image-pair" data-image-fit="contain">${issueImages(page,data,[['current','現況問題'],['module','模組圖']])}</div><aside class="results-case-copy">${points(page,items)}</aside></div>`;
    const issues=`<section class="results-stop-example-notes"><h2${key(page,'current-issues-heading')}>現況問題</h2><ul class="results-stop-current-issues">${item.currentIssues.map(issue=>`<li>${issue.title?`<h3${key(page,'current-issue-'+issue.id+'-title')}>${esc(issue.title)}</h3>`:''}${p(page,'current-issue-'+issue.id,issue.text)}</li>`).join('')}</ul></section>`;
    const references=`<section class="results-stop-example-notes"><h2${key(page,'references-heading')}>相關設置規則條文</h2><ul class="results-stop-references">${(item.references||[]).map(ref=>`<li>${p(page,'reference-'+ref.reg+'-number','第 '+ref.reg+' 條','results-stop-reference-number')}${p(page,'reference-'+ref.reg+'-label',ref.label)}</li>`).join('')}</ul></section>`;
    return `<div class="results-case-layout results-stop-example-layout"><div class="results-stop-example-columns" data-image-fit="contain"><div class="results-stop-example-panel">${issueImages(page,data,[['current','現況問題']])}${issues}</div><div class="results-stop-example-panel">${issueImages(page,data,[['module','模組圖']])}${references}</div></div><aside class="results-case-copy"><h2 class="results-case-section-title"${key(page,'side-heading')}>${esc(item.sideHeading||'設置要點')}</h2>${points(page,items)}</aside></div>`;
  }
  function extensionCards(page,data){
    return '<div class="results-extension-grid'+(page.content.sections.length===3?' has-three-topics':'')+'">'+page.content.sections.map(section=>{
      const images=page.content.images.filter(image=>image.topic===section.id),items=section.paragraphs.map(point=>({...point,id:section.id+'-'+point.id}));
      return `<article class="results-extension-card${images.length?' has-images':' text-only'}"><header><span>${String(section.number).padStart(2,'0')}</span><h2${key(page,section.id+'-title')}>${esc(section.title)}</h2></header><div class="results-extension-copy">${points(page,items)}</div>${images.length?`<div class="results-extension-images">${images.map(image=>figure(page,image,data).replace('class="scenario-detail-image results-diagram"','class="scenario-detail-image results-diagram" preserveAspectRatio="xMidYMax meet"')).join('')}</div>`:''}</article>`;
    }).join('')+'</div>';
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
  function moduleThemeFramework(page,data){
    const headings=['模組編號','模組名稱','子模組編號／名稱'];
    return `<div class="results-module-theme-grid">${data.groups.map(group=>`<section class="module-theme-card" data-framework-group="${esc(group.id)}" aria-label="${esc(group.id+' '+group.name)}"><header class="module-theme-header">${p(page,'framework-'+group.id+'-code',group.id,'module-theme-code')}<h2${key(page,'framework-'+group.id+'-name')}>${esc(group.name)}</h2></header><table class="results-architecture-table" data-table-columns="${page.id}/theme-${group.id}" aria-label="${esc(group.id+' '+group.name+' 模組架構')}"><colgroup><col class="theme-module-code"><col class="theme-module-name"><col></colgroup><thead><tr>${headings.map((heading,column)=>`<th scope="col">${p(page,'framework-theme-'+group.id+'-heading-'+column,heading)}</th>`).join('')}</tr></thead><tbody>${group.rows.map(row=>`<tr data-framework-row="${esc(row.id)}"><td class="theme-module-identity">${p(page,'framework-'+row.id+'-code',row.id,'framework-code')}</td><td>${p(page,'framework-'+row.id+'-name',row.name,'theme-module-label')}</td><td>${row.submodules.map(child=>`<p data-framework-child="${esc(child.id)}"${key(page,'framework-'+child.id+'-name')}>${esc(child.id+' '+child.name)}</p>`).join('')}</td></tr>`).join('')}</tbody></table></section>`).join('')}</div>`;
  }
  function framework(page){
    const data=frameworkData(page.content.framework,window.PresentationScenarios.catalog,window.PresentationModules.catalog),modular=data.kind==='modules';
    if(modular&&page.id==='results-module-hierarchy')return moduleThemeFramework(page,data);
    const headings=modular?['主題分類','模組編號／名稱','子模組編號／名稱']:['上級分類','情境編號','情境名稱'];
    const summary=`<div class="results-framework-summary"><span><b>${data.groups.length}</b> ${modular?'主題':'大分類'}</span><span><b>${data.count}</b> ${modular?'模組':'種情境'}</span>${modular?`<span><b>${data.submoduleCount}</b> 子模組</span>`:''}</div>`;
    const notes=page.content.items?.length?`<ol class="results-framework-notes" aria-label="畫面重點">${page.content.items.map(point=>`<li>${point.title?`<strong${key(page,point.id+'-title')}>${esc(point.title)}</strong>`:''}${p(page,point.id+'-text',point.text)}</li>`).join('')}</ol>`:'';
    return `${notes?'':summary}<div class="results-framework-grid${modular?' is-module-framework':''}">${data.panels.map((groups,index)=>`<div class="results-framework-panel"><table class="results-architecture-table" data-table-columns="${page.id}/framework-${index}" aria-label="${esc(page.content.title+'（'+(index+1)+'）')}"><colgroup><col class="framework-group-column"><col class="framework-code-column"><col></colgroup><thead><tr>${headings.map((heading,column)=>`<th scope="col">${p(page,'framework-heading-'+index+'-'+column,heading)}</th>`).join('')}</tr></thead>${groups.map(group=>`<tbody data-framework-group="${esc(group.id)}">${group.rows.map((row,index)=>`<tr data-framework-row="${esc(row.id)}">${index===0?`<th scope="rowgroup" rowspan="${group.rows.length}" class="framework-group">${p(page,'framework-'+group.id+'-code',group.id,'framework-code')}${p(page,'framework-'+group.id+'-name',group.name)}</th>`:''}<td class="framework-identity">${p(page,'framework-'+row.id+'-code',row.id,'framework-code')}${modular?p(page,'framework-'+row.id+'-name',row.name):''}</td><td>${modular?row.submodules.map(child=>`<p data-framework-child="${esc(child.id)}"${key(page,'framework-'+child.id+'-name')}>${esc(child.id+' '+child.name)}</p>`).join(''):p(page,'framework-'+row.id+'-name',row.name)}</td></tr>`).join('')}</tbody>`).join('')}</table></div>`).join('')}</div>${notes}`;
  }
  const comparisonPoints=(page,config=typeof window==='object'?window.visualLayoutEditor?.store?.config:null)=>config?.content.results?.[page.id]?.points||page.content.items;
  const hasGuideZoom=page=>page?.resultType==='guide-experience'&&Boolean(page.content.zoomStepPageId);
  const stepCount=(page,config)=>hasGuideZoom(page)?2:page.resultType==='comparison'?Math.max(1,comparisonPoints(page,config).length):1;
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
  let rationaleResize=null;
  let guideZoomFrame=0,guideZoomSvg=null,guideZoomTransition=null;
  function cancelGuideZoom(){
    cancelAnimationFrame(guideZoomFrame);guideZoomFrame=0;
    if(guideZoomSvg)guideZoomSvg.dataset.zoomAnimating='false';
    guideZoomSvg=null;
  }
  function beforeNavigate(target,phase){
    stopRoadFlow();window.RoadFlowEditor?.beforeNavigate(target.id);
    const current=app?.page,svg=hasGuideZoom(current)?document.querySelector('.guide-vector-example svg.results-diagram'):null;
    guideZoomTransition=svg&&target.id===current.id&&phase!==app.state.phase?window.generalRoadViewport.get(svg)?.read():null;
    cancelGuideZoom();
  }
  function updateGuideZoom(){
    if(!hasGuideZoom(app?.page))return;
    const svg=document.querySelector('.guide-vector-example svg.results-diagram'),controller=window.generalRoadViewport.get(svg);
    if(!controller)return;
    const image=app.page.content.images[0],asset=app.data.embeddedAssets[image.key],target=controller.read(),from=guideZoomTransition;
    guideZoomTransition=null;
    controller.configure({home:image.crop||[0,0,asset.width,asset.height],resetView:target,onStart:cancelGuideZoom});
    const label=app.state.phase?'2 / 2 局部放大':'1 / 2 圖例檢視';
    document.getElementById('phase-label').textContent=label;
    if(!app.state.phase){const next=document.getElementById('next');document.getElementById('next-label').textContent='播放局部放大';next.setAttribute('aria-label','播放局部放大');next.title='播放局部放大';}
    if(!from||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    controller.write(from,false);guideZoomSvg=svg;svg.dataset.zoomAnimating='true';
    const started=performance.now(),duration=1100;
    const tick=now=>{
      if(!svg.isConnected){cancelGuideZoom();return;}
      const t=Math.min(1,(now-started)/duration),ease=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
      const w=from[2]*Math.pow(target[2]/from[2],ease),h=from[3]*Math.pow(target[3]/from[3],ease);
      const cx=from[0]+from[2]/2+(target[0]+target[2]/2-from[0]-from[2]/2)*ease,cy=from[1]+from[3]/2+(target[1]+target[3]/2-from[1]-from[3]/2)*ease;
      controller.write(t===1?target:[cx-w/2,cy-h/2,w,h],false);
      if(t<1)guideZoomFrame=requestAnimationFrame(tick);else cancelGuideZoom();
    };
    guideZoomFrame=requestAnimationFrame(tick);
  }
  function updateBookNavigation(){
    if(app?.page.resultType!=='book-demo')return;
    const state=document.querySelector('.results-book-frame')?.contentWindow.BookPresentation?.state;
    const label=state?.ending?'展示結束':state&&state.index===state.count-1?'闔上書本':'下一頁';
    document.getElementById('next-label').textContent=label;
    document.getElementById('next').setAttribute('aria-label',label);
    document.getElementById('next').title=label;
    document.getElementById('next').disabled=Boolean(state?.ending);
    document.getElementById('phase-label').textContent=state?(state.ending?'謝謝聆聽':state.index<0?'封面':`書籍 ${state.index+1} / ${state.count}`):'';
  }
  function move(direction){
    if(hasGuideZoom(app?.page)&&guideZoomFrame&&direction>0)return true;
    if(app?.page.resultType!=='book-demo')return false;
    const book=document.querySelector('.results-book-frame')?.contentWindow.BookPresentation;
    // Keep playback on the book while its frame initializes or a leaf turns.
    return book?book.move(direction):true;
  }
  function fitRationalePhotos(){
    const group=document.querySelector('.rationale-examples');if(!group)return;const photos=[...group.querySelectorAll('.rationale-photo')];
    const fit=()=>{
      if(!group.isConnected)return;
      const width=Math.min(...photos.map(photo=>{
        const style=getComputedStyle(photo),view=photo.viewBox.baseVal,paddingX=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight),paddingY=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom);
        const height=photo.getBoundingClientRect().height-paddingY-parseFloat(style.borderTopWidth)-parseFloat(style.borderBottomWidth);
        return Math.min(photo.parentElement.clientWidth,Math.max(0,height)*view.width/view.height+paddingX);
      }));
      if(width<=0||!Number.isFinite(width))return;
      const value=(Math.floor(width*100)/100)+'px';
      if(group.style.getPropertyValue('--rationale-photo-width')!==value)group.style.setProperty('--rationale-photo-width',value);
    };
    fit();rationaleResize=new ResizeObserver(fit);
    for(const node of [group,...photos,...group.querySelectorAll('figcaption')])rationaleResize.observe(node);
  }
  function afterRender(){
    updateGuideZoom();
    if(app?.page.resultType==='road-clarity'){mountRoadFlow();window.RoadFlowEditor?.mount(app);}
    window.CoverArtEditor?.mount(app);
    if(app?.page.resultType==='book-demo'){
      const frame=document.querySelector('.results-book-frame'),button=document.querySelector('[data-book-fullscreen]');
      frame.addEventListener('load',updateBookNavigation);frame.addEventListener('bookstatechange',updateBookNavigation);updateBookNavigation();
      if(button){button.hidden=!document.fullscreenEnabled;button.addEventListener('click',()=>frame.requestFullscreen().catch(()=>frame.focus()));}
    }
    rationaleResize?.disconnect();rationaleResize=null;
    if(app?.page.resultType==='modular-rationale'){fitRationalePhotos();return;}
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
  function topicCardImages(page,point,data){
    if(page.content.imagePlacement==='below-cards')return '';
    const images=page.content.images?.filter(image=>image.topic===point.id)||[];if(!images.length)return '';
    return `<div class="results-topic-images">${images.map(image=>{
      if(!data.embeddedAssets[image.key])return '';
      return figure(page,image,data)
        .replace('class="map-card results-map-card"',`class="map-card results-map-card results-topic-figure" data-topic-module="${esc(image.moduleId)}"`)
        .replace(`<strong${key(page,'image-'+image.key)}>`,`<p${key(page,'topic-image-'+image.key)}>`)
        .replace('</strong>','</p>');
    }).join('')}</div>`;
  }
  function callouts(page){
    const item=page.content;if(!item.callouts?.length)return '';
    return `<section class="results-callouts">${item.calloutsTitle?`<h2${key(page,'callouts-heading')}>${esc(item.calloutsTitle)}</h2>`:''}<div>${item.callouts.map(note=>`<aside><h3${key(page,note.id+'-title')}>${esc(note.title)}</h3>${p(page,note.id+'-text',note.text)}</aside>`).join('')}</div></section>`;
  }
  function guideSpread(images,data){
    return `<div class="guide-spread${images.length>2?' guide-page-gallery':''}" style="--guide-page-count:${images.length}">${images.map(image=>{const asset=data.embeddedAssets[image.key];return `<button type="button" class="guide-page-thumbnail" data-asset="${esc(image.key)}" title="放大檢視" aria-label="放大檢視：${esc(image.label)}"><img src="${esc(asset.url)}" width="${asset.width}" height="${asset.height}" alt="${esc(image.label)}" loading="lazy"></button>`;}).join('')}</div>`;
  }
  function guideBookmarkExample(images,data){
    const rows=[
      [0,'第 1 章｜緒論'],[0,'第 2 章｜設施配置原則'],[0,'第 3 章｜交通管制設施功能模組'],[0,'第 4 章｜一般道路情境'],
      [1,'4.2 G2 號誌化三叉路口'],[2,'G2-01 號誌化市區正交三叉路口'],[3,'路口現況與議題'],[3,'交通設施建議與整體設置圖例'],[3,'標線設置圖例運用解說'],[3,'號誌設置圖例運用解說']
    ];
    return `<div class="guide-bookmark-example"><nav class="guide-bookmark-tree" aria-label="電子書籤層級示意"><strong>書籤</strong><ul>${rows.map(([depth,label],index)=>`<li class="guide-bookmark-depth-${depth}${index===4?' is-bookmark-current':''}"><span aria-hidden="true">${index===3||index===4?'⌄':'›'}</span><span>${esc(label)}</span></li>`).join('')}</ul></nav>${guideSpread(images,data)}</div>`;
  }
  function guideExperience(page,data){
    const paths={layout:'<path d="M4 5h6l2 2 2-2h6v14h-6l-2 2-2-2H4Z"/><path d="M12 7v14"/>',bookmarks:'<path d="M6 4h12v17l-6-4-6 4Z"/>',index:'<path d="M9 5h11M9 12h11M9 19h11M4 5h1M4 12h1M4 19h1"/>',vector:'<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>'};
    const order=['layout','bookmarks','index','vector'];
    return `<div class="guide-experience-grid">${page.content.items.map(point=>{
      const images=page.content.images.filter(image=>image.topic===point.id),media=point.id==='vector'?`<div class="guide-vector-example" data-image-fit="contain"${hasGuideZoom(page)?` data-zoom-steps data-initial-view-page="${esc(app.state.phase?page.content.zoomStepPageId:page.id)}"`:''}>${figure(page,images[0],data)}</div>`:point.id==='bookmarks'?guideBookmarkExample(images,data):guideSpread(images,data);
      return `<article data-guide-experience="${point.id}"><div class="guide-experience-card-head"><span>${String(order.indexOf(point.id)+1).padStart(2,'0')}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[point.id]}</svg></div><div class="guide-experience-media">${media}</div></article>`;
    }).join('')}</div>`;
  }
  let roadFlowPaused=false,roadFlowAnimation=null;
  function stopRoadFlow(){if(!roadFlowAnimation)return;cancelAnimationFrame(roadFlowAnimation.frame);roadFlowAnimation.motion.removeEventListener('change',roadFlowAnimation.update);roadFlowAnimation.observer.disconnect();roadFlowAnimation=null;}
  function mountRoadFlow(){
    stopRoadFlow();const host=document.querySelector('.road-clarity-layout');if(!host)return;
    const motion=matchMedia('(prefers-reduced-motion: reduce)'),routes=[...host.querySelectorAll('.road-flow-path')].map(path=>({path,track:path.previousElementSibling,d:'',length:0,duration:Number(path.dataset.duration)||18,phase:Number(path.dataset.phase)||0}));
    const record={frame:0,last:0,elapsed:0,motion,update:null,observer:null};roadFlowAnimation=record;
    const place=()=>{for(const route of routes){const d=route.path.getAttribute('d');if(d!==route.d){route.d=d;route.length=route.path.getTotalLength();route.track.setAttribute('d',d);route.path.style.setProperty('--road-flow-dashes',(40/3)+' '+(route.length+40/3));}const distance=((record.elapsed/route.duration+route.phase)%1)*route.length;route.path.style.setProperty('--road-flow-offset',String(-distance));}};
    const tick=now=>{if(roadFlowAnimation!==record||!host.isConnected){if(roadFlowAnimation===record)stopRoadFlow();return;}if(motion.matches||roadFlowPaused){record.frame=0;record.last=0;return;}record.elapsed+=record.last?Math.min(100,now-record.last)/1000:0;record.last=now;place();record.frame=requestAnimationFrame(tick);};
    record.update=()=>{cancelAnimationFrame(record.frame);record.frame=0;record.last=0;place();if(!roadFlowPaused&&!motion.matches)record.frame=requestAnimationFrame(tick);};
    record.observer=new MutationObserver(place);for(const {path}of routes)record.observer.observe(path,{attributes:true,attributeFilter:['d']});
    motion.addEventListener('change',record.update);record.update();
  }
  function roadClarity(page,data){
    const routes=window.RoadFlowEditor.pathsFor(page,window.visualLayoutEditor?.store?.config);
    const flow=`<g class="road-flow-overlay" aria-hidden="true" pointer-events="none">${routes.map((route,index)=>`<path class="road-flow-track road-flow-color-${index}" d="${esc(route.path)}"/><path class="road-flow-path road-flow-color-${index}" data-road-route="${esc(route.id)}" data-duration="${route.duration||18}" data-phase="${route.phase??0}" d="${esc(route.path)}"/>`).join('')}</g>`;
    const toggle=`<button type="button" data-road-flow-toggle aria-pressed="${roadFlowPaused}" aria-label="${roadFlowPaused?'播放發光短條動畫':'暫停發光短條動畫'}">${roadFlowPaused?'播放動畫':'暫停動畫'}</button><button type="button" data-road-path-edit data-editor-ui="road-path-toggle">編輯路徑</button>`;
    const diagram=figure(page,page.content.images[0],data,'',toggle).replace('</g></svg>',flow+'</g></svg>');
    return `<div class="road-clarity-layout${roadFlowPaused?' is-flow-paused':''}"><div class="road-clarity-figure" data-image-fit="contain">${diagram}</div><aside class="road-clarity-copy">${page.content.items.map((point,index)=>`<article><span class="results-card-number">${String(index+1).padStart(2,'0')}</span><h2${key(page,point.id+'-title')}>${esc(point.title)}</h2>${p(page,point.id+'-text',point.text)}</article>`).join('')}</aside></div>`;
  }
  if(typeof document==='object')document.addEventListener('click',event=>{
    const button=event.target.closest('[data-road-flow-toggle]');if(!button||app?.page.resultType!=='road-clarity')return;
    event.preventDefault();roadFlowPaused=!roadFlowPaused;button.setAttribute('aria-pressed',String(roadFlowPaused));button.setAttribute('aria-label',roadFlowPaused?'播放發光短條動畫':'暫停發光短條動畫');button.textContent=roadFlowPaused?'播放動畫':'暫停動畫';roadFlowAnimation?.update();
  });
  function render(page,data){
    if(page.resultType==='error')return `<section class="slide results-slide"><h1 id="slide-title">成果簡報尚未載入</h1><p role="alert">請重新整理以載入成果簡報。${esc(loadError)}</p></section>`;
    const item=page.content||{};let body='';
    switch(page.resultType){
      case 'cover':{const meeting=item.meeting||{},image=item.images?.[0],art=image&&data.embeddedAssets[image.key];body=`${art?`<div class="results-cover-art" aria-hidden="true"><img src="${esc(art.url)}" width="${art.width}" height="${art.height}" alt="" draggable="false"></div>`:''}<header class="results-cover-heading">${p(page,'cover-event',meeting.event,'results-cover-event')}${p(page,'cover-project',meeting.project,'results-cover-project')}<h1 id="slide-title"${key(page,'title')}>${esc(item.title)}</h1><div class="results-cover-rule" aria-hidden="true"></div></header><div class="results-cover-meta">${p(page,'cover-presenter',meeting.presenter,'results-cover-presenter')}<div class="results-cover-details">${p(page,'cover-organization',meeting.organization,'results-cover-organization')}${p(page,'cover-date',meeting.date,'results-cover-date')}</div></div>`;break;}
      case 'outline':body=`<div class="results-outline-menu">${(window.PresentationStructure.manifest.presentations.find(deck=>deck.id===(item.deck||page.deckId||'results'))?.chapters||[]).map(chapter=>`<button type="button" data-page="${app?.pages.find(page=>page.chapter===chapter.id)?.id||chapter.entry}"><span>${chapter.code}</span><strong>${esc(window.PresentationStructure.chapterName(chapter))}</strong><b>↗</b></button>`).join('')}</div>`;break;
      case 'cards':case 'steps':body=`<div class="results-cards ${page.resultType==='steps'?'results-steps':''}${item.imagePlacement!=='below-cards'&&item.images?.some(image=>image.topic)?' results-topic-cards':''}" style="--results-count:${item.items.length}">${item.items.map((point,index)=>`<article>${item.numbered===false?'':`<span class="results-card-number">${String(index+1).padStart(2,'0')}</span>`}<h2${key(page,point.id+'-title')}>${esc(point.title)}</h2>${p(page,point.id+'-text',point.text)}${point.includes?p(page,point.id+'-includes',point.includes,'results-card-includes'):''}${topicCardImages(page,point,data)}</article>`).join('')}</div>`;if(page.resultType==='steps'&&item.images?.length)body=stepImages(page,data,body);if(item.imagePlacement==='below-cards')body+=`<div class="results-card-figures" data-image-fit="contain">${item.images.map(image=>figure(page,image,data).replace('<strong','<p class="results-card-caption"').replace('</strong>','</p>')).join('')}</div>`;break;
      case 'book-demo':body=`<div class="results-book-panel"><div class="results-book-actions"><span>封面與指定跨頁</span><div><button type="button" data-book-fullscreen aria-label="全螢幕展示書籍" title="全螢幕展示書籍，按 Esc 返回簡報"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/></svg></button><a href="${esc(item.book)}" target="_blank" rel="noopener" aria-label="獨立開啟書籍" title="獨立開啟"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6m0-6L10 14"/><path d="M10 4H4v16h16v-6"/></svg></a></div></div><iframe class="results-book-frame" src="${esc(item.book)}?embed=1" title="參考指引互動書籍展示：翻頁、旋轉與放大" loading="lazy" allow="fullscreen" allowfullscreen></iframe></div>`;break;
      case 'background':body=`<div class="results-background-content"><div class="results-background-text"><div class="results-background-top">${item.lead.map((paragraph,index)=>p(page,paragraph.id,paragraph.text,index?'is-reference':'')).join('')}</div><div class="results-background-copy">${item.items.map(paragraph=>p(page,paragraph.id+'-text',paragraph.text)).join('')}</div></div><div class="results-background-figure" data-image-fit="contain">${figure(page,item.images[0],data)}</div></div>`;break;
      case 'principles':body=principles(page);break;
      case 'guide-experience':body=guideExperience(page,data);break;
      case 'road-clarity':body=roadClarity(page,data);break;
      case 'framework':body=framework(page);break;
      case 'modular-rationale':body=modularRationale(page,data);break;
      case 'guide-structure':body=guideStructure(page);break;
      case 'module-index':body=moduleIndex(page);break;
      case 'module-overview':body=moduleOverview(page,data);break;
      case 'module-comparison':body=moduleComparison(page,data);break;
      case 'comparison':{const items=comparisonPoints(page);body=`<div class="results-case-layout"><div class="results-case-images results-image-pair" data-image-fit="contain">${item.images.map(image=>figure(page,image,data)).join('')}</div><aside class="results-case-copy"><nav class="results-comparison-switcher" aria-label="選擇比較重點"><span>比較重點</span>${items.map((point,index)=>`<button type="button" data-results-comparison-step="${index}" aria-label="比較重點 ${index+1}" aria-pressed="${index===app.state.phase}">${String(index+1).padStart(2,'0')}</button>`).join('')}</nav>${points(page,items)}</aside></div>`;break;}
      case 'scenario-index':body=scenarioIndex(page,data);break;
      case 'module-example':body=`<div class="results-case-layout"><div class="results-case-images results-image-pair">${[{key:'module:stop-basic',label:'M2-01.1 停管制'},{key:'module:yield-basic',label:'M2-01.2 讓管制'}].map(image=>figure(page,image,data)).join('')}</div><aside class="results-case-copy">${points(page,item.items)}</aside></div>`;break;
      case 'scenario-example':body=example(page,data);break;
      case 'extension-cards':body=extensionCards(page,data);break;
      case 'scenario-placeholder':body=`<div class="results-reserved"><div><h2>現況議題</h2><div aria-label="現況素材預留區"></div></div><div><h2>佈設成果</h2><div aria-label="佈設成果預留區"></div></div></div>`;break;
    }
    const pageClass=['cards','steps'].includes(page.resultType)?page.resultType+'-page':page.resultType;
    return `<section class="slide results-slide results-${pageClass}${item.layout==='lesson'?' results-lesson':''}" data-results-page="${page.id}" ${page.resultType==='book-demo'?`aria-label="${esc(pageTitle(page))}"`:'aria-labelledby="slide-title"'}>${['cover','book-demo'].includes(page.resultType)?'':header(page)}${body}${callouts(page)}${item.takeaway?p(page,'takeaway',item.takeaway,'results-takeaway'):''}</section>`;
  }
  return {load,validate,validateConditions,validateStrategies,validateModuleComparisons,mergeConditions,mergeStrategies,mergeModuleComparisons,prepare,connect:api=>{app=api;},buildPages,pageTitle,titleKey,frameworkData,moduleRepresentatives,representativeName,stepCount,comparisonSpec,frames,afterRender,beforeNavigate,move,noteReplacement,scenarioPageId,scenarioThumbnail,resolvePage:id=>outline?.pageAliases?.[id]||id,pages:()=>buildPages(outline,window.PresentationScenarios.catalog),render,get outline(){return outline;},get error(){return loadError;}};
});
