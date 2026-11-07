(() => {
  'use strict';
  const key='traffic-guide:scenario-layouts:v1',modes=['auto','split','cards','cards-4'];
  let choices={};try{choices=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
  if(!choices||typeof choices!=='object'||Array.isArray(choices))choices={};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let returnPoint=null;
  function captureReturn(){
    const app=window.generalRoadPresentation,root=document.getElementById('presentation'),nodes=[root,...root.querySelectorAll('*')],images=[...root.querySelectorAll('svg,img')];
    returnPoint={...app.state,code:app.data.scenarios.find(s=>s.id===app.page.scenario)?.code||'',label:app.page.name,
      scroll:nodes.map((node,index)=>({index,top:node.scrollTop,left:node.scrollLeft})).filter(n=>n.top||n.left),
      views:images.flatMap((node,index)=>{const controller=window.generalRoadViewport?.get(node);return controller?[{index,tag:node.tagName,view:controller.read(),fit:node.getAttribute('preserveAspectRatio')}]:[]})};
  }
  function mountReturn(page){
    document.querySelector('[data-return-scenario]')?.remove();
    if(page.deckId==='general'){returnPoint=null;return;}
    if(!returnPoint)return;
    const button=document.createElement('button');button.type='button';button.className='quiet-button scenario-return-button';button.dataset.returnScenario='';button.textContent='↶ 返回 '+returnPoint.code;button.title='返回原檢視：'+returnPoint.code+' '+returnPoint.label;button.setAttribute('aria-label',button.title);
    document.querySelector('.playbar .utilities').append(button);
  }
  async function restoreReturn(){
    const saved=returnPoint,app=window.generalRoadPresentation;if(!saved)return;returnPoint=null;
    await app.goPage(saved.page,saved.phase,{force:true});await app.whenIdle();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const root=document.getElementById('presentation'),images=[...root.querySelectorAll('svg,img')],nodes=[root,...root.querySelectorAll('*')];
    for(const item of saved.views){const node=images[item.index],controller=node&&window.generalRoadViewport?.get(node);if(controller&&node.tagName===item.tag){if(item.fit)node.setAttribute('preserveAspectRatio',item.fit);if(saved.fullPeek&&node.id==='main-map')controller.showFull();controller.write(item.view,false);controller.sync();}}
    for(const item of saved.scroll){const node=nodes[item.index];if(node){node.scrollTop=item.top;node.scrollLeft=item.left;}}
  }
  function setMode(slide,page,mode){
    const photos=[...slide.querySelectorAll('.condition-issue')],length=photos.reduce((sum,n)=>sum+n.textContent.length,0);
    const effectiveWidth=innerWidth/((screen.height||innerHeight)/1080);
    slide.dataset.conditionsLayout=mode==='auto'?(photos.length>=8&&effectiveWidth>=1500?'cards-4':photos.length>=3||length>350?'cards':'split'):mode;
    const columns=Math.min(photos.length||1,slide.dataset.conditionsLayout==='cards-4'?4:2);
    slide.style.setProperty('--issue-columns',columns);slide.style.setProperty('--issue-rows',Math.max(1,Math.ceil(photos.length/columns)));
    for(const button of slide.querySelectorAll('[data-condition-layout]'))button.setAttribute('aria-pressed',String(button.dataset.conditionLayout===mode));
  }
  function decorate(page){
    const slide=document.querySelector('#presentation>.slide');if(!slide)return;
    mountReturn(page);
    if(page.deckId!=='general')return;
    slide.classList.add('general-layout-slide');slide.dataset.generalKind=page.kind;
    slide.classList.toggle('has-scenario-table',Boolean(slide.querySelector('.scenario-article-table')));
    if(page.kind==='context')slide.querySelectorAll('.context-map').forEach(n=>n.setAttribute('preserveAspectRatio','xMidYMid meet'));
    if(page.kind==='current-conditions'){
      const toolbar=document.createElement('div');toolbar.className='conditions-layout-options';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','現況問題呈現方式');
      toolbar.innerHTML='<span>呈現</span>'+[['auto','自動'],['split','圖文分欄'],['cards','雙欄卡片'],['cards-4','四欄卡片']].map(([value,label])=>`<button type="button" data-condition-layout="${value}" aria-pressed="false">${label}</button>`).join('');
      slide.querySelector('.conditions-heading')?.append(toolbar);
      setMode(slide,page,modes.includes(choices[page.id])?choices[page.id]:'auto');
    }
    for(const button of slide.querySelectorAll('.scenario-related-links [data-page]')){
      const target=window.generalRoadPresentation.pages.find(p=>p.id===button.dataset.page);
      if(target?.article){button.dataset.referencePage=target.id;delete button.dataset.page;button.title='彈出參照，關閉後繼續本頁';}
    }
    for(const button of slide.querySelectorAll('[data-open-module],[data-module-route]')){
      button.classList.add('text-button','scenario-module-link');button.title=(button.title||button.textContent.trim())+'；可由頁尾返回本情境';
      if(!/↗\s*$/.test(button.textContent))button.append(' ↗');
    }
    if(page.article?.table&&page.article.category==='號誌'&&page.article.table.columns[0].includes('檢核')){
      const header=slide.querySelector('.scenario-article-table caption');
      if(header){const button=document.createElement('button');button.type='button';button.className='scenario-checklist-open';button.dataset.tablePreview=page.id;button.textContent='表：'+header.textContent.trim()+' ↗';button.title='彈出各方向號誌檢核表';header.replaceChildren(button);}
    }
  }
  function checklist(id){
    const app=window.generalRoadPresentation,article=app.pages.find(p=>p.id===id)?.article;if(!article?.table)return;
    const table=article.table,dialog=document.getElementById('source-dialog');dialog.classList.add('checklist-dialog');
    document.getElementById('source-title').textContent='各方向號誌檢核';dialog.querySelector('.eyebrow').textContent=app.data.scenarios.find(s=>s.id===article.scenario)?.code||'';
    document.getElementById('source-content').innerHTML=`<div class="scenario-checklist-view"><table><caption>${esc(article.name)}</caption><thead><tr>${table.columns.map(c=>`<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row=>`<tr>${row.map((c,index)=>`<${index?'td':'th'}${index?'':' scope="row"'}>${esc(c)}</${index?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    window.PresentationText?.apply(dialog,{general:true});dialog.showModal();
  }
  function reference(id){
    const app=window.generalRoadPresentation,target=app.pages.find(p=>p.id===id),article=target?.article;if(!article)return;
    if(article.asset||!article.points?.length){app.showAsset(article.asset||article.mapAsset);return;}
    const scene=app.data.scenarios.find(s=>s.id===target.scenario),asset=app.data.embeddedAssets[article.mapAsset],meta=app.data.assetMeta[article.mapAsset],rotation=meta?.rotation||0;
    const transform=rotation===90?`translate(${asset.height} 0) rotate(90)`:rotation===180?`translate(${asset.width} ${asset.height}) rotate(180)`:rotation===270?`translate(0 ${asset.width}) rotate(270)`:'';
    const swapped=rotation===90||rotation===270,dialog=document.getElementById('source-dialog');
    const view=[0,0,swapped?asset.height:asset.width,swapped?asset.width:asset.height];
    document.getElementById('source-title').textContent=(scene?.code||'')+' '+article.name+' / '+(article.reference||'《設置規則》§ '+article.reg);
    dialog.querySelector('.eyebrow').textContent='參照預覽・關閉後繼續原頁';
    document.getElementById('source-content').innerHTML=`<div class="scenario-reference-content"><svg viewBox="${view.join(' ')}" role="img" aria-label="${esc(article.name)}"><g transform="${transform}"><image href="${esc(asset.url)}" width="${asset.width}" height="${asset.height}"/></g></svg><div><ol>${article.points.map(p=>`<li>${esc(p)}</li>`).join('')}</ol>${article.takeaway?`<p>${esc(article.takeaway)}</p>`:''}</div></div>`;
    window.PresentationText?.apply(dialog,{general:true});dialog.showModal();
  }
  window.addEventListener('click',event=>{
    const app=window.generalRoadPresentation,button=event.target.closest('button[data-open-module],button[data-module-route]');
    if(app?.page.deckId==='general'&&button?.closest('#presentation'))captureReturn();
  },true);
  document.addEventListener('click',event=>{
    const button=event.target.closest('button[data-condition-layout],button[data-reference-page],button[data-table-preview],button[data-return-scenario]');if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(button.hasAttribute('data-return-scenario')){restoreReturn();return;}
    if(button.dataset.tablePreview){checklist(button.dataset.tablePreview);return;}
    if(button.dataset.referencePage){reference(button.dataset.referencePage);return;}
    const slide=button.closest('.general-layout-slide'),page=window.generalRoadPresentation.page,mode=button.dataset.conditionLayout;
    choices[page.id]=mode;try{localStorage.setItem(key,JSON.stringify(choices));}catch{}
    setMode(slide,page,mode);window.PresentationFontHeight?.refresh();
  },true);
  document.getElementById('source-dialog').addEventListener('close',()=>document.getElementById('source-dialog').classList.remove('checklist-dialog'));
  window.addEventListener('resize',()=>{
    const slide=document.querySelector('#presentation>.conditions-current-slide.general-layout-slide'),page=window.generalRoadPresentation?.page;
    if(slide&&page)setMode(slide,page,modes.includes(choices[page.id])?choices[page.id]:'auto');
  });
  window.GeneralScenarioLayout={decorate};
})();
