(() => {
  'use strict';
  const key='traffic-guide:scenario-layouts:v1',modes=['auto','split','cards','cards-4'];
  let choices={};try{choices=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
  if(!choices||typeof choices!=='object'||Array.isArray(choices))choices={};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let returnPoint=null;
  let layoutObserver,layoutFrame=0;
  const conditionFits=new WeakMap();
  const cardGroups=[
    ['.contents-grid','.chapter-card',['.card-top','h2']],
    ['.directory-card-grid','.directory-card',['.directory-card-code','h3','.directory-card-visual']],
    ['.scenario-card-grid','.scenario-card',['.scenario-card-top','.scenario-card-copy h2','.scenario-card-copy p','.scenario-card-copy']],
    ['.conditions-issues','.condition-issue',['.condition-card-heading','.condition-points']]
  ];
  function fitConditionPhotos(slide){
    const grid=slide.querySelector('.conditions-issues'),layout=slide.querySelector('.conditions-layout'),cards=[...slide.querySelectorAll('.condition-issue')];
    if(!grid||!layout)return;
    const share=value=>{slide.style.setProperty('--conditions-figure-track',value+'fr');slide.style.setProperty('--conditions-issues-track',(100-value)+'fr');};
    if(innerWidth<=760||!slide.dataset.conditionsLayout?.startsWith('cards')){delete slide.dataset.conditionHeightBounded;share(28);return;}
    const frames=cards.map(card=>card.querySelector('.condition-photo'));
    if(frames.some(frame=>frame.style.height&&frame.style.height!=='auto'))return;
    slide.dataset.conditionHeightBounded='true';
    const alignParts=()=>{
      for(const selector of ['.condition-card-heading','.condition-points']){
        const nodes=cards.map(card=>card.querySelector(selector));
        for(const node of nodes)node.style.removeProperty('--card-aligned-height');
        const height=Math.max(0,...nodes.map(node=>node.getBoundingClientRect().height));
        for(const node of nodes)node.style.setProperty('--card-aligned-height',height+'px');
      }
    };
    const images=frames.map(frame=>frame.querySelector('img'));
    const ratios=images.map(image=>image?.naturalWidth&&image.naturalHeight?image.naturalWidth/image.naturalHeight:0);
    const manual=layout.classList.contains('has-formatted-split');
    const signature=JSON.stringify([layout.clientWidth,grid.clientHeight,slide.dataset.conditionsLayout,manual,ratios,cards.map(card=>[card.textContent,getComputedStyle(card.querySelector('h3')).font,getComputedStyle(card.querySelector('.condition-points')).font])]);
    const cached=conditionFits.get(grid);
    if(cached?.signature===signature){share(cached.share);alignParts();return;}
    const measure=value=>{
      share(value);alignParts();
      const sizes=frames.map(frame=>({width:frame.clientWidth,height:frame.clientHeight}));
      const overflow=Math.max(grid.scrollHeight-grid.clientHeight,...cards.map(card=>card.scrollHeight-card.clientHeight));
      const area=sizes.reduce((sum,size,i)=>sum+(ratios[i]?Math.min(size.width,size.height*ratios[i])*Math.min(size.height,size.width/ratios[i]):0),0);
      const whitespace=Math.max(0,...sizes.map((size,i)=>ratios[i]&&size.width?1-Math.min(1,size.height*ratios[i]/size.width):0));
      return {share:value,area,whitespace,overflow};
    };
    const initial=measure(28),candidates=[initial];
    if(!manual&&ratios.every(Boolean)&&initial.whitespace>.1)for(const value of [31,34,37,40,43,46,49,52])candidates.push(measure(value));
    const valid=candidates.filter(candidate=>candidate.overflow<=2);
    const bestArea=Math.max(0,...valid.map(candidate=>candidate.area));
    // Use a larger diagram column only while retaining at least 97% of the
    // largest available photo area. Text wrapping participates in every trial.
    const best=valid.filter(candidate=>candidate.area>=bestArea*.97).sort((a,b)=>b.share-a.share)[0]||initial;
    share(best.share);alignParts();conditionFits.set(grid,{signature,share:best.share});
  }
  function alignCards(slide){
    const issues=slide.querySelector('.conditions-issues'),scrollTop=issues?.scrollTop||0;
    fitConditionPhotos(slide);
    for(const [gridSelector,cardSelector,parts]of cardGroups)for(const grid of slide.querySelectorAll(gridSelector)){
      if(grid.matches('.conditions-issues')&&slide.dataset.conditionHeightBounded)continue;
      const cards=[...grid.querySelectorAll(':scope>'+cardSelector)];
      const rows=new Map();
      for(const card of cards){const top=Math.round(card.getBoundingClientRect().top/3)*3;let row=rows.get(top);if(!row)rows.set(top,row=[]);row.push(card);}
      for(const part of parts){
        for(const card of cards)card.querySelector(part)?.style.removeProperty('--card-aligned-height');
        for(const row of rows.values()){
          if(row.length<2)continue;
          const nodes=row.map(card=>card.querySelector(part)).filter(Boolean);
          let height=Math.max(0,...nodes.map(node=>node.getBoundingClientRect().height));
          if(part==='.condition-points')height=Math.min(height,Math.min(...row.map(card=>card.clientHeight*.4)));
          for(const node of nodes)node.style.setProperty('--card-aligned-height',height+'px');
        }
      }
    }
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    for(const row of slide.querySelectorAll('.strategy-row')){
      const title=row.querySelector('.strategy-title'),refs=row.querySelector('.strategy-refs');if(!title||!refs)continue;
      const measure=node=>{const style=getComputedStyle(node);ctx.font=style.font||`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;return ctx.measureText(node.textContent.trim()).width;};
      const width=row.clientWidth,needed=Math.min(measure(title),width*.65)+measure(refs)+48;
      row.classList.toggle('strategy-wrap',needed>width);
    }
    if(issues&&scrollTop)issues.scrollTop=scrollTop;
  }
  function scheduleAlignment(){cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(()=>{const slide=document.querySelector('#presentation>.slide');if(slide)alignCards(slide);});}
  function observeLayout(slide){
    layoutObserver?.disconnect();layoutObserver=new ResizeObserver(scheduleAlignment);layoutObserver.observe(slide);
    for(const [selector]of cardGroups)for(const grid of slide.querySelectorAll(selector)){layoutObserver.observe(grid);for(const card of grid.children)layoutObserver.observe(card);}
    for(const row of slide.querySelectorAll('.strategy-row'))layoutObserver.observe(row);
    for(const image of slide.querySelectorAll('.condition-photo img'))if(!image.complete)image.addEventListener('load',scheduleAlignment,{once:true});
    document.fonts.ready.then(scheduleAlignment);scheduleAlignment();
  }
  function cardLayout(slide,page,value){
    slide.dataset.scenarioCardLayout=value;
    for(const button of slide.querySelectorAll('[data-scenario-card-layout]'))button.setAttribute('aria-pressed',String(button.dataset.scenarioCardLayout===value));
    const chapterDefault=chapterCardLayout(page),label=slide.querySelector('[data-scenario-card-default-label]');if(label)label.textContent='預設：'+(defaultCardLayout(page)==='horizontal'?'圖左文右':'圖上文下')+'（'+(chapterDefault?'本章節':'全部章節')+'）';
    const reset=slide.querySelector('[data-scenario-card-use-global]');if(reset)reset.hidden=!chapterDefault;
    scheduleAlignment();
  }
  function chapterCardLayout(page){const value=window.generalRoadEditor?.state.layouts[page.id]?.scenarioCardLayout;return ['horizontal','vertical'].includes(value)?value:null;}
  function defaultCardLayout(page){return chapterCardLayout(page)||(window.generalRoadEditor?.state.layouts['general-scenario-cards']?.scenarioCardLayout==='horizontal'?'horizontal':'vertical');}
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
    scheduleAlignment();
  }
  function decorate(page){
    const slide=document.querySelector('#presentation>.slide');if(!slide)return;
    mountReturn(page);
    if(page.deckId!=='general')return;
    slide.classList.add('general-layout-slide');slide.dataset.generalKind=page.kind;
    slide.querySelectorAll('.source-line,.conditions-source,.directory-source,[data-action="source"]').forEach(node=>node.remove());
    if(page.kind==='chapter-scenarios'){
      const toolbar=document.createElement('div');toolbar.className='conditions-layout-options scenario-card-layout-options';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','情境卡片圖文排列');
      toolbar.innerHTML='<span>卡片排列</span>'+[['vertical','圖上文下'],['horizontal','圖左文右']].map(([value,label])=>`<button type="button" data-scenario-card-layout="${value}">${label}</button>`).join('')+'<button type="button" data-scenario-card-chapter-default data-editor-ui="card-default">設為本章節預設</button><button type="button" data-scenario-card-default data-editor-ui="card-default">設為全部章節預設</button><button type="button" data-scenario-card-use-global data-editor-ui="card-default">採用全部章節預設</button><small data-scenario-card-default-label></small>';
      slide.querySelector('.section-heading')?.append(toolbar);cardLayout(slide,page,choices['cards:'+page.id]||defaultCardLayout(page));
    }
    slide.classList.toggle('has-scenario-table',Boolean(slide.querySelector('.scenario-article-table')));
    if(page.kind==='context')slide.querySelectorAll('.context-map').forEach(n=>n.setAttribute('preserveAspectRatio','xMidYMid meet'));
    if(page.kind==='current-conditions'){
      slide.dataset.conditionScenario=page.scenario;
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
    if(page.article?.table){
      const header=slide.querySelector('.scenario-article-table caption');
      if(header){const button=document.createElement('button');button.type='button';button.className='scenario-checklist-open';button.dataset.tablePreview=page.id;button.textContent='表：'+header.textContent.trim().replace(/^表[：:]\s*/,'')+' ↗';button.title='點按放大表格';header.replaceChildren(button);if(/反光導標|辨認距離/.test(page.article.name))header.closest('table').dataset.compactTable='';}
    }
    observeLayout(slide);
  }
  function checklist(id){
    const app=window.generalRoadPresentation,article=app.pages.find(p=>p.id===id)?.article;if(!article?.table)return;
    const table=article.table,dialog=document.getElementById('source-dialog');dialog.classList.add('checklist-dialog');
    document.getElementById('source-title').textContent='表：'+article.name;dialog.querySelector('.eyebrow').textContent=app.data.scenarios.find(s=>s.id===article.scenario)?.code||'';
    document.getElementById('source-content').innerHTML=`<div class="scenario-checklist-view"><table${/反光導標|辨認距離/.test(article.name)?' data-compact-table':''}><caption>${esc(article.name)}</caption><thead><tr>${table.columns.map(c=>`<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row=>`<tr>${row.map((c,index)=>`<${index?'td':'th'}${index?'':' scope="row"'}>${esc(c)}</${index?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;
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
    const button=event.target.closest('button[data-condition-layout],button[data-scenario-card-layout],button[data-scenario-card-default],button[data-scenario-card-chapter-default],button[data-scenario-card-use-global],button[data-reference-page],button[data-table-preview],button[data-return-scenario]');if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(button.hasAttribute('data-return-scenario')){restoreReturn();return;}
    if(button.dataset.tablePreview){checklist(button.dataset.tablePreview);return;}
    if(button.dataset.referencePage){reference(button.dataset.referencePage);return;}
    if(button.hasAttribute('data-scenario-card-chapter-default')||button.hasAttribute('data-scenario-card-use-global')){
      if(!window.generalRoadEditor?.editing||window.PresentationMode?.readOnly)return;
      const slide=button.closest('.slide'),page=window.generalRoadPresentation.page,state=window.generalRoadEditor.state;
      const settings={...state.layouts[page.id]},useGlobal=button.hasAttribute('data-scenario-card-use-global');
      if(useGlobal)delete settings.scenarioCardLayout;else settings.scenarioCardLayout=slide.dataset.scenarioCardLayout;
      state.layouts[page.id]=settings;delete choices['cards:'+page.id];try{localStorage.setItem(key,JSON.stringify(choices));}catch{}
      window.visualLayoutEditor?.legacyChanged();cardLayout(slide,page,defaultCardLayout(page));
      window.visualLayoutEditor?.report(useGlobal?'本章節已改為採用全部章節預設，請儲存設定。':'已設定本章節預設，不影響其他章節；請儲存設定。');return;
    }
    if(button.hasAttribute('data-scenario-card-default')){
      if(!window.generalRoadEditor?.editing||window.PresentationMode?.readOnly)return;
      const slide=button.closest('.slide'),value=slide.dataset.scenarioCardLayout,state=window.generalRoadEditor.state;
      state.layouts['general-scenario-cards']={...state.layouts['general-scenario-cards'],scenarioCardLayout:value};
      for(const id of Object.keys(choices))if(id.startsWith('cards:'))delete choices[id];try{localStorage.setItem(key,JSON.stringify(choices));}catch{}
      window.visualLayoutEditor?.legacyChanged();cardLayout(slide,window.generalRoadPresentation.page,value);
      window.visualLayoutEditor?.report('已將「'+(value==='horizontal'?'圖左文右':'圖上文下')+'」設為全部章節預設，請儲存設定。');return;
    }
    if(button.dataset.scenarioCardLayout){const page=window.generalRoadPresentation.page,value=button.dataset.scenarioCardLayout;choices['cards:'+page.id]=value;try{localStorage.setItem(key,JSON.stringify(choices));}catch{}cardLayout(button.closest('.slide'),page,value);return;}
    const slide=button.closest('.general-layout-slide'),page=window.generalRoadPresentation.page,mode=button.dataset.conditionLayout;
    choices[page.id]=mode;try{localStorage.setItem(key,JSON.stringify(choices));}catch{}
    setMode(slide,page,mode);window.PresentationFontHeight?.refresh();
  },true);
  document.getElementById('source-dialog').addEventListener('close',()=>document.getElementById('source-dialog').classList.remove('checklist-dialog'));
  window.addEventListener('resize',()=>{
    scheduleAlignment();
    const slide=document.querySelector('#presentation>.conditions-current-slide.general-layout-slide'),page=window.generalRoadPresentation?.page;
    if(slide&&page)setMode(slide,page,modes.includes(choices[page.id])?choices[page.id]:'auto');
  });
  window.GeneralScenarioLayout={decorate};
})();
