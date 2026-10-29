(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.PresentationScenarios=api;root.presentationScenariosReady=api.load();}
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  let catalog=null,loadError='';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  function validate(value){
    check(value?.schemaVersion===1&&Array.isArray(value.groups)&&Array.isArray(value.scenarios),'情境總覽格式無效');
    const groups=new Map(),ids=new Set();
    for(const group of value.groups){check(/^[GC][1-4]$/.test(group.id)&&!groups.has(group.id)&&['general','complex'].includes(group.deck)&&group.deck===(group.id[0]==='G'?'general':'complex')&&/^[\w-]+$/.test(group.chapter)&&/^[\w-]+$/.test(group.entry)&&typeof group.name==='string'&&group.name.trim(),'情境主題無效');groups.set(group.id,group);}
    for(const item of value.scenarios){check(/^[GC][1-4]-\d{2}$/.test(item.id)&&!ids.has(item.id)&&groups.has(item.group)&&item.id.startsWith(item.group+'-')&&typeof item.name==='string'&&item.name.trim()&&typeof item.short==='string'&&item.short.trim()&&Number.isInteger(item.sourcePage)&&item.sourcePage>0,'情境項目無效');ids.add(item.id);}
    return value;
  }
  async function load(){try{const response=await fetch(new URL('data/scenarios/catalog.json',document.baseURI),{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);catalog=validate(await response.json());}catch(error){loadError=error.message;}}
  const overviewId=deck=>deck==='complex'?'complex-intro':'general-scenarios-index';
  const built=(item,data)=>data.scenarios.find(scene=>scene.code===item.id);
  const pageFor=(item,data)=>built(item,data)?.contextId||'scenario-'+item.id.toLowerCase();
  function extendPages(pages,data){
    if(!catalog)return;
    for(const item of catalog.scenarios){
      if(built(item,data))continue;
      const group=catalog.groups.find(group=>group.id===item.group),page={id:pageFor(item,data),chapter:group.chapter,kind:'presentation-empty',name:item.name,scenarioCode:item.id};
      const after=pages.findLastIndex(page=>page.chapter===group.chapter);pages.splice(after+1,0,page);
    }
  }
  function returnLink(deck){return `<button type="button" class="catalog-back" data-page="${overviewId(deck)}">全部情境總覽 ↖</button>`;}
  function card(item,data){const scene=built(item,data);return `<button type="button" class="directory-card" data-page="${pageFor(item,data)}" data-catalog-scenario="${item.id}"><span class="directory-card-code">${item.id}</span><h3>${esc(item.name)}</h3><span class="directory-card-bottom"><small class="${scene?'is-ready':''}">${scene?'已製作':'素材待補'}</small><span>${scene?'進入情境':'開啟預留頁'} ↗</span></span></button>`;}
  function render(page,data){
    const complex=page.chapter==='complex-intro',deck=complex?'complex':'general',label=complex?'複雜道路情境':'一般道路情境';
    if(!catalog||loadError)return `<section class="slide scenario-directory"><h1 id="slide-title">情境總覽尚未載入</h1><p>請確認 data/scenarios/catalog.json 可讀取後重新整理。${esc(loadError)}</p></section>`;
    const groups=catalog.groups.filter(group=>group.deck===deck),entries=catalog.scenarios.filter(item=>groups.some(group=>group.id===item.group)),count=entries.filter(item=>built(item,data)).length;
    return `<section class="slide scenario-directory" data-scenario-directory="${deck}" aria-labelledby="slide-title"><header class="directory-heading"><span class="eyebrow">00 / ${complex?'COMPLEX':'GENERAL'} ROAD SCENARIOS</span><h1 id="slide-title">全部情境總覽</h1><p>${label} · ${entries.length} 個情境 · ${count} 個已製作</p></header>${groups.map(group=>`<section class="directory-group" data-directory-group="${group.id}"><header><h2>${group.id} ${esc(group.name)}</h2><button type="button" class="catalog-back" data-page="${group.entry}">進入章節 ↗</button></header><div class="directory-card-grid">${catalog.scenarios.filter(item=>item.group===group.id).map(item=>card(item,data)).join('')}</div></section>`).join('')}<p class="directory-source">情境名稱依 output_1027.pdf 第 ${complex?'5':'4'} 章整理；尚無素材的內容頁保留空白。</p></section>`;
  }
  function switcher(item,data){
    const group=catalog.groups.find(group=>group.id===item.group),scene=built(item,data);
    return `<nav class="scenario-switcher scenario-directory-switcher" aria-label="${group.id} 章內情境切換"><button type="button" class="scenario-back" data-page="${overviewId(group.deck)}">全部情境總覽 ↖</button>${catalog.scenarios.filter(other=>other.group===item.group).map(other=>{const ready=built(other,data);return `<button type="button" data-scenario-code="${other.id}" ${ready?`data-scenario="${ready.id}"`:''} data-page="${pageFor(other,data)}" class="${other.id===item.id?'active':''}" ${other.id===item.id?'aria-current="page"':''}><strong>${other.id}</strong> ${esc(ready?.short||other.short)}</button>`;}).join('')}<span>${item.id} / ${esc(scene?.setting||group.name)}情境</span></nav>`;
  }
  function decorate(page,data){
    if(!catalog)return;
    const root=document.getElementById('presentation'),slide=root.firstElementChild;if(!slide)return;
    const scene=data.scenarios.find(scene=>scene.id===page.scenario),item=catalog.scenarios.find(item=>item.id===(page.scenarioCode||scene?.code));
    if(item){slide.querySelector('.scenario-switcher')?.remove();slide.insertAdjacentHTML('afterbegin',switcher(item,data));return;}
    const group=catalog.groups.find(group=>group.entry===page.id);
    if(group){slide.insertAdjacentHTML('afterbegin',returnLink(group.deck));return;}
    if(page.id==='contents'){
      const host=slide.querySelector('.contents-intro');if(host&&!host.querySelector('[data-page="general-scenarios-index"]'))host.insertAdjacentHTML('beforeend','<button type="button" class="catalog-back directory-intro-link" data-page="general-scenarios-index">全部情境總覽 ↗</button>');
    }
  }
  return {load,validate,extendPages,render,decorate,get catalog(){return catalog;},get error(){return loadError;}};
});
