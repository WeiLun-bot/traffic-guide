(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{
    root.PresentationRepository=new api.Repository({read:async file=>{
      const response=await fetch(new URL(file,document.baseURI),{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status+' / '+file);
      return response.json();
    }});
    root.presentationDataReady=root.PresentationRepository.ready.then(()=>{
      document.getElementById('presentation-data').textContent=JSON.stringify(root.PresentationRepository.fresh());
    });
  }
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  class Repository{
    constructor({read}){
      this.read=read;this.registry=null;this.cache=new Map();this.pending=new Map();this.listeners=new Set();this.requests=[];this.revision=0;
      this.ready=this.request('data/presentation-registry.json').then(value=>{
        check(value?.schemaVersion===1&&value.base&&value.modules&&value.scenarios&&value.results&&value.resources&&value.presentations?.presentations?.length===4,'簡報目錄格式無效');
        for(const resource of Object.values(value.resources))check(/^data\/[\w./-]+\.json$/.test(resource.file)&&!resource.file.split('/').includes('..'),'簡報資料路徑無效');
        this.registry=value;return value;
      });
    }
    async request(file){const record={file,state:'loading'};this.requests.push(record);try{const value=await this.read(file);record.state='ready';record.characters=JSON.stringify(value).length;return value;}catch(error){record.state='error';record.error=error.message;throw error;}}
    subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
    get(key){return this.cache.get(key);}
    async ensure(key){
      await this.ready;if(this.cache.has(key))return this.cache.get(key);if(this.pending.has(key))return this.pending.get(key);
      const resource=this.registry.resources[key];check(resource,'找不到簡報內容：'+key);
      const pending=this.request(resource.file).then(value=>{
        check(value?.schemaVersion===1,'簡報內容格式無效');
        if(resource.type==='module')check(value.id===resource.id,'模組內容歸屬不符');
        if(resource.type==='scenario')check(value.scenario?.code===resource.id,'情境內容歸屬不符');
        if(resource.type==='results-scenario')check(value.code===resource.id,'成果情境歸屬不符');
        if(resource.type==='results-module')check(value.moduleId===resource.id,'模組成果歸屬不符');
        for(const listener of this.listeners)listener(resource,value);
        this.cache.set(key,value);this.revision++;return value;
      }).finally(()=>this.pending.delete(key));
      this.pending.set(key,pending);return pending;
    }
    requirements(page){
      if(page.kind==='chapter-cover')return [];
      if(page.id==='modules-formation')return ['modules:formation'];
      if(page.kind==='module'&&page.moduleId)return ['module:'+page.moduleId];
      if(page.kind==='results')return [page.resultsModule?'results-module:'+page.resultsModule:page.resultsScenario?'results:'+page.resultsScenario:'results:common'];
      const result=[];
      if(page.deckId==='general'||page.scenario?.startsWith('g')||['cover','contents'].includes(page.kind))result.push('scenario:shared');
      if(page.scenario&&this.registry.resources['scenario:'+page.scenario.toUpperCase()])result.push('scenario:'+page.scenario.toUpperCase());
      return result;
    }
    isReady(page){return this.requirements(page).every(key=>this.cache.has(key));}
    ensurePage(page){return Promise.all(this.requirements(page).map(key=>this.ensure(key)));}
    async loadAll(){await this.ready;return Promise.allSettled(Object.keys(this.registry.resources).map(key=>this.ensure(key)));}
    fresh(){
      check(this.registry,'簡報目錄尚未載入');const data=clone(this.registry.base),shared=this.get('scenario:shared');
      if(shared)Object.assign(data,clone(shared.core));
      for(const item of this.registry.scenarios.details){
        data.scenarios.push(clone(item.scenario));data.articles.push(...clone(item.articles));
        for(const [key,asset]of Object.entries(item.assets)){data.assets[key]=asset.file.split('/').at(-1);data.embeddedAssets[key]={url:encodeURI(asset.file),width:asset.width,height:asset.height};data.assetMeta[key]={scenario:item.scenario.id,label:asset.label,rotation:asset.rotation||0};}
      }
      for(const scene of data.scenarios){
        const doc=this.get('scenario:'+scene.code);if(!doc)continue;
        Object.assign(scene,clone(doc.scenario));if(doc.view)scene.presentation=clone(doc.view);
        for(const article of doc.articles){const target=data.articles.find(item=>item.id===article.id);if(target)Object.assign(target,clone(article));}
        if(doc.embeddedAssets){Object.assign(data.assets,clone(doc.assetNames));Object.assign(data.embeddedAssets,clone(doc.embeddedAssets));Object.assign(data.assetMeta,clone(doc.assetMeta));}
        else for(const [key,asset]of Object.entries(doc.assets)){data.assets[key]=asset.file.split('/').at(-1);data.embeddedAssets[key]={url:encodeURI(asset.file),width:asset.width,height:asset.height};data.assetMeta[key]={scenario:scene.id,label:asset.label,rotation:asset.rotation||0};}
      }
      return data;
    }
    apply(data){
      const next=this.fresh();
      for(const field of ['scenarios','articles']){
        const existing=new Map((data[field]||[]).map(item=>[item.id,item]));
        next[field]=next[field].map(item=>{const target=existing.get(item.id)||{};for(const key of Object.keys(target))delete target[key];return Object.assign(target,item);});
      }
      for(const key of Object.keys(data))delete data[key];Object.assign(data,next);return data;
    }
  }
  return {Repository};
});
