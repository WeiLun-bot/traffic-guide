(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{
    root.PresentationReferences=api;
    api.ready=fetch(new URL('data/reference-library.json',document.baseURI),{cache:'no-store'}).then(response=>{
      if(!response.ok)throw new Error('參照資料無法載入');
      return response.json();
    }).then(api.initialize);
  }
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let custom=[],drawer,catalog=[],search='',filter='table',loadVersion=0;
  const app=()=>window.generalRoadPresentation;
  const editor=()=>window.visualLayoutEditor;
  const editing=()=>Boolean(window.generalRoadEditor?.editing&&!window.PresentationMode?.readOnly&&!editor()?.editing);
  function initialize(doc){
    if(doc?.schemaVersion!==1||!Array.isArray(doc.items))throw new Error('參照資料格式無效');
    const ids=new Set();
    for(const item of doc.items){
      if(!/^[\w-]+$/.test(item.id)||ids.has(item.id)||typeof item.title!=='string'||!Array.isArray(item.tables)||!item.tables.length)throw new Error('參照項目無效');
      ids.add(item.id);
      for(const table of item.tables)if(!Array.isArray(table.columns)||!table.columns.every(c=>typeof c==='string')||!Array.isArray(table.rows)||!table.rows.every(row=>row.length===table.columns.length&&row.every(c=>typeof c==='string')))throw new Error('參照表格無效');
    }
    custom=doc.items;
  }
  function collect(data,items=custom){
    const entries=items.map(item=>({...item,kind:'table',label:'表：'+item.title}));
    for(const article of data.articles||[]){
      const scene=(data.scenarios||[]).find(scene=>scene.id===article.scenario),source=(scene?.code||article.scenario)+' / '+article.name;
      if(article.table)entries.push({id:'table:'+article.id,kind:'table',articleId:article.id,title:article.name,label:'表：'+article.name,source,tables:[{...article.table,title:article.name}]});
      entries.push({id:'page:'+article.id,kind:'page',articleId:article.id,title:article.name,label:source,source,article});
    }
    return entries;
  }
  function defaults(page,items=custom){return page.article?items.filter(item=>item.articleRegs?.includes(String(page.article.reg))).map(item=>item.id):[];}
  function selected(page,config=editor()?.store?.config){return config?.content.references?.[page.id]?.ids??defaults(page);}
  function find(id){
    const item=catalog.find(item=>item.id===id)||collect(app().data).find(item=>item.id===id);if(item)return item;
    if(id.startsWith('table:')){const article=app().data.articles.find(article=>article.id===id.slice(6));if(article)return {id,kind:'table',articleId:article.id,label:'表：'+article.name};}
  }
  function tableHtml(table){return `<table><caption>${esc(table.title)}</caption><thead><tr>${table.columns.map(c=>`<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row=>`<tr>${row.map((c,i)=>`<${i?'td':'th'}${i?'':' scope="row"'}>${esc(c)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table>`;}
  function show(item){
    const dialog=document.getElementById('source-dialog');
    dialog.classList.toggle('checklist-dialog',item.kind==='table');
    document.getElementById('source-title').textContent=item.label;
    dialog.querySelector('.eyebrow').textContent='參照預覽・關閉後繼續原頁';
    let content;
    if(item.kind==='table'){
      content=`<div class="scenario-checklist-view reference-tables">${item.tables.map(tableHtml).join('')}${(item.notes||[]).map(note=>`<p class="reference-note">${esc(note)}</p>`).join('')}</div><p class="dialog-note">${esc(item.source||'')}${item.sourceUrl&&/^https:\/\//.test(item.sourceUrl)?` · <a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener">來源 ↗</a>`:''}</p>`;
    }else{
      const article=item.article,data=window.PresentationRepository?.fresh()||app().data,asset=app().data.embeddedAssets[article.mapAsset]||data.embeddedAssets[article.mapAsset],rotation=data.assetMeta[article.mapAsset]?.rotation||0;
      const transform=rotation===90?`translate(${asset.height} 0) rotate(90)`:rotation===180?`translate(${asset.width} ${asset.height}) rotate(180)`:rotation===270?`translate(0 ${asset.width}) rotate(270)`:'';
      const swapped=rotation===90||rotation===270,points=editor()?.store?.config.content.articles[article.id]?.points?.map(point=>point.text)||article.points||[];
      content=`<div class="scenario-reference-content"><svg viewBox="0 0 ${swapped?asset.height:asset.width} ${swapped?asset.width:asset.height}" role="img" aria-label="${esc(article.name)}"><g transform="${transform}"><image href="${esc(asset.url)}" width="${asset.width}" height="${asset.height}"/></g></svg><div><ol>${points.map(point=>`<li>${esc(point)}</li>`).join('')}</ol>${article.takeaway?`<p>${esc(article.takeaway)}</p>`:''}</div></div>`;
    }
    document.getElementById('source-content').innerHTML=content;
    window.PresentationText?.apply(dialog,{general:app().page.deckId==='general'});
    if(!dialog.open)dialog.showModal();
  }
  async function preview(id){
    try{
      let item=find(id);if(!item)throw new Error('找不到這個參照');
      if(item.articleId){
        const page=app().pages.find(page=>page.id===item.articleId);
        if(!page)throw new Error('找不到參照頁面');
        await window.PresentationRepository?.ensurePage(page);
        item=collect(window.PresentationRepository?.fresh()||app().data).find(entry=>entry.id===id);
        if(!item)throw new Error('參照內容尚未提供');
      }
      show(item);
    }catch(error){editor()?.report(error.message,true);}
  }
  function change(id,operation){
    if(!editing()||editor()?.busy||!app().page.article)return;
    const page=app().page,ids=[...selected(page)],index=ids.indexOf(id);
    if(operation==='add'){if(index>=0)return;if(!find(id))return;ids.push(id);}
    else if(operation==='remove'){if(index<0)return;ids.splice(index,1);}
    else if(operation==='up'||operation==='down'){
      const to=index+(operation==='up'?-1:1);if(index<0||to<0||to>=ids.length)return;
      [ids[index],ids[to]]=[ids[to],ids[index]];
    }else return;
    editor().transact(next=>{next.content.references[page.id]={ids};});
  }
  function mount(page){
    let toolbar=document.querySelector('#editor-toolbar .editor-actions');
    if(toolbar&&!window.PresentationMode?.readOnly&&!toolbar.querySelector('[data-reference-library]')){
      const button=document.createElement('button');button.type='button';button.dataset.referenceLibrary='';button.textContent='參照資料庫';toolbar.append(button);
    }
    const libraryButton=toolbar?.querySelector('[data-reference-library]');if(libraryButton)libraryButton.disabled=!editing();
    document.getElementById('reference-links')?.remove();
    const host=document.querySelector('#explanation'),footer=host?.querySelector('.explain-footer');
    if(page.article&&footer){
      const nav=document.createElement('nav');nav.id='reference-links';nav.className='scenario-related-links reference-links';nav.setAttribute('aria-label','解說參照');
      const ids=selected(page),isEditing=editing();
      if(ids.length||isEditing){
        const label=document.createElement('span');label.className='reference-label';label.textContent='參照 ↗';nav.append(label);
        ids.forEach((id,index)=>{
          const item=find(id),row=document.createElement('span');row.className='reference-link';
          row.innerHTML=`<button type="button" class="text-button" data-reference-preview="${esc(id)}">${esc(item?.label||id)} ↗</button>${isEditing?`<span data-editor-ui="reference-actions"><button type="button" data-reference-up="${esc(id)}" aria-label="上移參照" ${index===0?'disabled':''}>↑</button><button type="button" data-reference-down="${esc(id)}" aria-label="下移參照" ${index===ids.length-1?'disabled':''}>↓</button><button type="button" data-reference-remove="${esc(id)}" aria-label="移除此參照">×</button></span>`:''}`;
          nav.append(row);
        });
        if(isEditing){const button=document.createElement('button');button.type='button';button.dataset.referenceLibrary='';button.dataset.editorUi='reference-add';button.textContent='＋加入參照（可拖入）';nav.append(button);}
        footer.before(nav);
      }
    }
    if(drawer&&!drawer.hidden){if(!editing())close();else renderList();}
  }
  function renderList(){
    if(!drawer)return;
    const page=app().page,ids=selected(page),canAdd=editing()&&Boolean(page.article),query=search.trim().toLowerCase();
    const entries=catalog.filter(item=>(!filter||item.kind===filter)&&(!query||(item.label+' '+item.source).toLowerCase().includes(query)));
    drawer.querySelector('.reference-library-status').textContent=entries.length+' 筆參照 · '+(canAdd?'加入至「'+page.article.name+'」':'請切換至設施解說頁再加入');
    drawer.querySelector('.reference-library-list').innerHTML=entries.map(item=>`<article class="reference-library-item" draggable="${canAdd}" data-reference-id="${esc(item.id)}"><strong>${esc(item.label)}</strong><small>${esc(item.source||'')}</small><div><button type="button" data-reference-preview="${esc(item.id)}">預覽 ↗</button><button type="button" data-reference-add="${esc(item.id)}" ${!canAdd||ids.includes(item.id)?'disabled':''}>${ids.includes(item.id)?'已加入':'加入本頁'}</button></div></article>`).join('')||'<p>沒有符合的參照。</p>';
  }
  function close(){if(drawer)drawer.hidden=true;document.querySelector('[data-reference-library]')?.focus({preventScroll:true});}
  async function open(){
    if(!editing())return;
    if(!drawer){
      drawer=document.createElement('aside');drawer.className='reference-library';drawer.dataset.editorUi='reference-library';drawer.setAttribute('aria-label','參照資料庫');
      drawer.innerHTML='<div class="reference-library-head"><h2>參照資料庫</h2><button type="button" data-reference-close aria-label="關閉參照資料庫">×</button></div><p>預覽後按「加入本頁」，或拖曳項目到解說下方的「參照 ↗」。完成後按儲存即可重複使用。</p><label>搜尋參照<input type="search" placeholder="表名、設施或情境編號" aria-label="搜尋參照"></label><label>類型<select aria-label="參照類型"><option value="table">表格</option><option value="page">圖例與解說</option><option value="">全部</option></select></label><p class="reference-library-status" role="status"></p><div class="reference-library-list"></div>';
      drawer.querySelector('input').addEventListener('input',event=>{search=event.target.value;renderList();});
      drawer.querySelector('select').addEventListener('change',event=>{filter=event.target.value;renderList();});
      document.body.append(drawer);
    }
    drawer.hidden=false;catalog=collect(app().data);renderList();
    drawer.querySelector('input').focus();
    const version=++loadVersion;
    drawer.querySelector('.reference-library-status').textContent='正在彙整既有參照…';
    const repo=window.PresentationRepository;
    try{
      const results=repo?await Promise.allSettled(Object.keys(repo.registry.resources).filter(key=>key.startsWith('scenario:')).map(key=>repo.ensure(key))):[];
      if(version!==loadVersion)return;
      catalog=collect(repo?repo.fresh():app().data);renderList();
      if(results.some(result=>result.status==='rejected'))drawer.querySelector('.reference-library-status').textContent+=' · 部分內容載入失敗，可關閉後重開重試';
    }catch(error){drawer.querySelector('.reference-library-status').textContent=error.message;}
  }
  if(typeof document!=='undefined'){
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-reference-library],[data-reference-close],[data-reference-preview],[data-reference-add],[data-reference-remove],[data-reference-up],[data-reference-down]');if(!button)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(button.hasAttribute('data-reference-library')){open();return;}
      if(button.hasAttribute('data-reference-close')){close();return;}
      if(button.dataset.referencePreview){preview(button.dataset.referencePreview);return;}
      for(const operation of ['add','remove','up','down']){const id=button.dataset['reference'+operation[0].toUpperCase()+operation.slice(1)];if(id){change(id,operation);return;}}
    },true);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&drawer&&!drawer.hidden&&!document.querySelector('dialog[open]')){event.stopImmediatePropagation();close();}},true);
    document.addEventListener('dragstart',event=>{
      const item=event.target.closest('.reference-library-item');if(!item||!editing()||!app().page.article)return;
      event.dataTransfer.setData('application/x-traffic-reference',item.dataset.referenceId);event.dataTransfer.effectAllowed='copy';
    });
    document.addEventListener('dragover',event=>{
      const nav=event.target.closest('#reference-links');if(!nav||!editing()||!event.dataTransfer.types.includes('application/x-traffic-reference'))return;
      event.preventDefault();event.dataTransfer.dropEffect='copy';nav.classList.add('is-reference-drop');
    });
    document.addEventListener('dragleave',event=>{const nav=event.target.closest('#reference-links');if(nav&&!nav.contains(event.relatedTarget))nav.classList.remove('is-reference-drop');});
    document.addEventListener('dragend',()=>document.querySelector('#reference-links')?.classList.remove('is-reference-drop'));
    document.addEventListener('drop',event=>{
      const nav=event.target.closest('#reference-links');if(!nav||!editing())return;
      const id=event.dataTransfer.getData('application/x-traffic-reference');if(!id)return;
      event.preventDefault();event.stopImmediatePropagation();nav.classList.remove('is-reference-drop');change(id,'add');
    },true);
    document.getElementById('source-dialog')?.addEventListener('close',()=>document.getElementById('source-dialog').classList.remove('checklist-dialog'));
  }
  return {initialize,collect,defaults,selected,tableHtml,mount,preview};
});
