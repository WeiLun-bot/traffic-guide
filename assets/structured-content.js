(() => {
  'use strict';
  const clone=window.VisualLayoutCore.clone;
  let current=null,moduleContexts=[],activeModuleKey='';
  const uid=prefix=>prefix+'-'+crypto.randomUUID();
  const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const editor=()=>window.visualLayoutEditor;
  const editing=()=>window.generalRoadEditor?.editing&&!editor()?.editing;
  const articleLabel=article=>article.regLabel||'§ '+article.reg;
  const articles=context=>context.api.data.articles.filter(article=>article.scenario===context.api.page.scenario);
  let linksDialog,linksForm,linksContext;
  function textNode(node,key,text,context,path) {
    node.dataset.editKey=key;node.dataset.blockEditKey=key;
    node.dataset.contentField=JSON.stringify(path);
    node.textContent=text;
    if(editing()){node.setAttribute('contenteditable','plaintext-only');node.spellcheck=false;}
    else node.removeAttribute('contenteditable');
    return node;
  }
  function action(label,operation,ids={}) {
    const button=element('button','content-action',label);button.type='button';button.dataset.contentAction=operation;
    for(const [key,value]of Object.entries(ids))button.dataset[key]=value;
    return button;
  }
  function actions(kind,id,index,length,issueId) {
    const bar=element('span','content-item-actions');bar.dataset.editorUi='content-actions';
    const ids={kind,itemId:id,...(issueId?{issueId}:{})};
    const up=action('↑','up',ids),down=action('↓','down',ids),remove=action('刪除','remove',ids);
    const noun=kind==='strategy'?'策略':kind==='issue'?'問題':'說明';
    up.setAttribute('aria-label','上移這個'+noun);down.setAttribute('aria-label','下移這個'+noun);
    up.disabled=index===0;down.disabled=index===length-1;bar.append(up,down,remove);return bar;
  }
  function makePoint(point,context,path,node) {
    const article=current.type==='articles',row=node||element(article?'li':'p',article?'':'');
    row.dataset.contentItemId=point.id;
    const target=article?(row.querySelector(':scope>span')||element('span')):row;
    textNode(target,point.textKey,point.text,context,path);
    if(article&&!target.parentElement)row.append(target);
    if(editing()){
      // A sibling wrapper keeps text editing and item controls independent.
      if(!article){const wrapper=element('div','content-point-row');wrapper.dataset.contentItemId=point.id;wrapper.append(row);return wrapper;}
    }
    return row;
  }
  function seed(context) {
    const root=context.root, page=context.api.page;
    const moduleList=context.moduleList||root.querySelector('.module-explain-points');
    if(moduleList&&page.kind==='module')return {type:'modules',pageId:moduleList.closest('[data-module-source-page]')?.dataset.moduleSourcePage||page.id,moduleTopic:moduleList.closest('[data-module-topic-id]')?.dataset.moduleTopicId||window.PresentationModules?.displayContext(page.id).topic?.id,host:moduleList,model:{points:[...moduleList.querySelectorAll(':scope>li')].map(node=>{const title=node.querySelector('h3'),text=node.querySelector('p');return {id:node.dataset.modulePoint,title:title.textContent,titleKey:title.dataset.editKey||title.dataset.blockEditKey,text:text.textContent,textKey:text.dataset.editKey||text.dataset.blockEditKey};})}};
    const sidebar=root.querySelector('.conditions-issues');
    if(sidebar){
      const issues=[...sidebar.querySelectorAll('.condition-issue')].map((node,index)=>{
        const heading=node.querySelector('h3'),image=node.querySelector('[data-editor-image-key]');
        const id='issue-original-'+index;
        return {id,title:heading.textContent,titleKey:heading.dataset.editKey,imageKey:image.dataset.editorImageKey,photo:true,points:[...node.querySelectorAll('.condition-points>p')].map((p,i)=>({id:id+'-point-'+i,text:p.textContent,textKey:p.dataset.editKey}))};
      });
      return {type:'conditions',pageId:page.id,host:sidebar,model:{issues}};
    }
    const list=root.querySelector('.explain-points');
    if(list&&page.article){return {type:'articles',pageId:page.id,host:list,model:{points:[...list.querySelectorAll(':scope>li:not([data-user-block])')].map((li,i)=>{const span=li.querySelector('span');return{id:'point-original-'+i,text:span.textContent,textKey:span.dataset.editKey};})}};}
    const overview=root.querySelector('.overview-list');
    if(overview&&context.api.data.scenarios.some(scene=>scene.overviewId===page.id)) {
      const available=articles(context);
      const items=[...overview.querySelectorAll(':scope>button')].map((button,index)=>{
        const regs=[...button.querySelector('small').textContent.matchAll(/§\s*(\d+(?:[-.]\d+)?)/g)].map(match=>match[1]);
        const articleIds=[...new Set(regs.flatMap(reg=>available.filter(article=>String(article.reg)===reg).map(article=>article.id)))];
        const targetId=available.some(article=>article.id===button.dataset.page)?button.dataset.page:null;
        if(targetId&&!articleIds.includes(targetId))articleIds.push(targetId);
        const id='strategy-original-'+index,titleKey=page.id+'|strategy|'+id+'|title';
        return {id,title:context.state.texts[titleKey]??button.querySelector('span').textContent.replace(/^\s*\d+\s*/,''),titleKey,articleIds,targetId};
      });
      return {type:'overviews',pageId:page.id,host:overview,model:{items}};
    }
    return null;
  }
  function render(context) {
    if(linksDialog?.open&&(linksContext.pageId!==context.api.page.id||!editing()))linksDialog.close();
    if(!context.moduleList){
      moduleContexts=[];
      const lists=[...context.root.querySelectorAll('.module-extension-card .module-explain-points')];
      if(lists.length){
        for(const moduleList of lists){render({...context,moduleList});moduleContexts.push(current);}
        current=moduleContexts.find(item=>item.pageId+'|'+item.moduleTopic===activeModuleKey)||moduleContexts[0];return;
      }
    }
    current=seed(context);if(!current)return;
    current.context=context;
    const configured=editor()?.store?.config.content[current.type][current.pageId];
    current.model=clone(configured||current.model);
    if(current.type==='modules'){
      const source=window.PresentationModules?.displayContext(current.pageId).source;
      if(source)current.model.points=window.PresentationModules.overviewPoints(source,current.model.points);
    }
    const {model,host,type,pageId}=current;
    if(type==='conditions') {
      const original=[...host.querySelectorAll('.condition-issue')];
      const templates=new Map(original.map((node,index)=>['issue-original-'+index,node]));
      const marker=document.createComment('content-issues');host.insertBefore(marker,original[0]||host.firstChild);
      original.forEach(node=>node.remove());
      model.issues.forEach((issue,index)=>{
        const node=templates.get(issue.id)||element('article','issue-row condition-issue');
        node.dataset.contentItemId=issue.id;
        let heading=node.querySelector('.condition-card-heading');
        if(!heading){heading=element('div','condition-card-heading');heading.append(element('span'),element('h3'));node.append(heading);}
        heading.querySelector('span').textContent=String(index+1).padStart(2,'0');
        textNode(heading.querySelector('h3'),issue.titleKey,issue.title,context,['conditions',pageId,'issues',issue.id,'title']);
        if(editing())heading.append(actions('issue',issue.id,index,model.issues.length));
        let photo=node.querySelector('.condition-photo');
        if(!photo&&(issue.photo||context.state.images[issue.imageKey])){
          photo=element('div','condition-photo custom-image-frame');photo.dataset.editorImageKey=issue.imageKey;
          const button=element('button','condition-photo-open');button.type='button';button.disabled=true;
          const image=element('img');image.src=window.generalRoadEditor.image(issue.imageKey);image.alt=issue.title;image.draggable=false;
          const ready=()=>{if(!image.naturalWidth)return;context.api.data.embeddedAssets[issue.imageKey]={url:image.src,width:image.naturalWidth,height:image.naturalHeight};context.api.data.assetMeta[issue.imageKey]={label:issue.title,rotation:0};button.dataset.asset=issue.imageKey;button.disabled=false;};
          image.addEventListener('load',ready);if(image.complete)ready();
          button.append(image,element('span','condition-photo-caption','現況照片 ↗'));photo.append(button);node.append(photo);
        }
        if(!photo&&editing()){
          const upload=element('button','content-add-photo','＋新增照片');upload.type='button';upload.dataset.editorUi='content-photo';upload.dataset.replaceImage=issue.imageKey;node.append(upload);
        }
        node.classList.toggle('content-text-only',!photo);
        let points=node.querySelector('.condition-points');if(!points){points=element('div','condition-points');node.append(points);}
        const oldPoints=new Map([...points.querySelectorAll(':scope>p')].map((p,i)=>[issue.id+'-point-'+i,p]));points.replaceChildren();
        issue.points.forEach((point,i)=>{
          const row=makePoint(point,context,['conditions',pageId,'issues',issue.id,'points',point.id,'text'],oldPoints.get(point.id));
          if(editing())row.append(actions('point',point.id,i,issue.points.length,issue.id));points.append(row);
        });
        if(editing()){const add=action('＋新增說明項目','add-point',{issueId:issue.id});add.dataset.editorUi='content-add';points.append(add);}
        marker.before(node);
      });
      marker.remove();
      if(editing()){const add=action('＋新增現況問題','add-issue');add.dataset.editorUi='content-add';host.append(add);}
    } else if(type==='articles') {
      const originals=[...host.querySelectorAll(':scope>li:not([data-user-block])')];
      const templates=new Map(originals.map((node,index)=>['point-original-'+index,node]));
      originals.forEach(node=>node.remove());
      model.points.forEach((point,index)=>{
        const row=makePoint(point,context,['articles',pageId,'points',point.id,'text'],templates.get(point.id));
        if(editing())row.append(actions('point',point.id,index,model.points.length));host.append(row);
      });
      if(editing()){const add=action('＋新增說明項目','add-point');add.dataset.editorUi='content-add';host.after(add);}
    } else if(type==='modules') {
      const templates=new Map([...host.children].map(node=>[node.dataset.modulePoint,node]));host.replaceChildren();
      const visible=model.points.filter(point=>window.PresentationModules?.pointVisible(pageId,point,current.moduleTopic)!==false);
      visible.forEach((point,index)=>{
        const row=templates.get(point.id)||element('li');row.dataset.modulePoint=point.id;row.dataset.contentItemId=point.id;
        let title=row.querySelector('h3'),text=row.querySelector('p');
        if(!title){title=element('h3');row.prepend(title);}if(!text){text=element('p');title.after(text);}
        textNode(title,point.titleKey,point.title,context,['modules',pageId,'points',point.id,'title']);
        textNode(text,point.textKey,point.text,context,['modules',pageId,'points',point.id,'text']);
        row.querySelector('.content-item-actions')?.remove();
        if(editing())row.append(actions('point',point.id,index,visible.length));host.append(row);
      });
      if(editing()){const add=action('＋新增說明項目','add-point');add.dataset.editorUi='content-add';host.after(add);}
    } else renderOverview(context);
  }
  function renderOverview(context) {
    const {host,model,pageId}=current,available=articles(context),preview=!window.generalRoadEditor?.editing;
    const originals=[...host.querySelectorAll(':scope>button')];
    const templates=new Map(originals.map((node,index)=>['strategy-original-'+index,node]));
    originals.forEach(node=>node.remove());
    model.items.forEach((item,index)=>{
      const old=templates.get(item.id),row=element('div','strategy-row');
      if(old){for(const attr of old.attributes)if(!['data-page','type'].includes(attr.name))row.setAttribute(attr.name,attr.value);row.classList.add('strategy-row');}
      row.dataset.contentItemId=item.id;
      const legacy=window.generalRoadBlocks?.items.find(block=>block.element===old);if(legacy)legacy.element=row;
      const titleGroup=element('div','strategy-title-group');titleGroup.append(element('span','strategy-number',String(index+1).padStart(2,'0')));
      const title=textNode(element('span','strategy-title'),item.titleKey,item.title,context,['overviews',pageId,'items',item.id,'title']);
      if(preview&&item.targetId){const button=element('button','strategy-title-button');button.type='button';button.dataset.page=item.targetId;button.append(title);titleGroup.append(button);row.dataset.strategyTarget=item.targetId;}
      else titleGroup.append(title);
      const refs=element('small','strategy-refs');
      item.articleIds.forEach((id,i)=>{
        const article=available.find(article=>article.id===id);if(!article)return;
        if(i)refs.append(document.createTextNode(' / '));
        const reference=element(preview?'button':'span','strategy-ref',articleLabel(article));reference.title=article.name;
        if(preview){reference.type='button';reference.dataset.page=id;reference.setAttribute('aria-label',articleLabel(article)+' '+article.name);}
        refs.append(reference);
      });
      if(preview&&item.articleIds.length)refs.append(document.createTextNode(' ↗'));
      row.append(titleGroup,refs);
      if(editing()){
        const bar=actions('strategy',item.id,index,model.items.length);
        bar.prepend(action('關聯條文','links',{itemId:item.id}));row.append(bar);
      }
      host.append(row);
    });
    if(editing()){const add=action('＋新增佈設策略','add-strategy');add.dataset.editorUi='content-add';host.after(add);}
  }
  function openLinks(id) {
    if(!current||current.type!=='overviews'||!editing()||editor().busy)return;
    const item=current.model.items.find(item=>item.id===id);if(!item)return;
    if(!linksDialog){
      linksDialog=element('dialog','strategy-links-dialog');linksDialog.dataset.editorUi='strategy-links';linksDialog.setAttribute('aria-labelledby','strategy-links-title');
      linksForm=element('form');linksForm.method='dialog';
      const heading=element('h2',null,'關聯條文');heading.id='strategy-links-title';
      const hint=element('p','strategy-links-hint','勾選本情境的相關條文；右側條號會自動更新。');
      const choices=element('fieldset','strategy-links-choices');choices.append(element('legend',null,'關聯條文（可複選）'));
      const label=element('label','strategy-primary-label','點整列時前往');const select=element('select');select.name='primary';label.append(select);
      const buttons=element('div','strategy-links-actions'),cancel=element('button',null,'取消'),apply=element('button',null,'套用');
      cancel.type='button';cancel.addEventListener('click',()=>linksDialog.close());apply.type='submit';buttons.append(cancel,apply);
      linksForm.append(heading,hint,choices,label,buttons);linksDialog.append(linksForm);document.body.append(linksDialog);
      choices.addEventListener('change',()=>updatePrimary(false));
      select.addEventListener('change',()=>{linksContext.primaryTouched=true;});
      linksForm.addEventListener('submit',event=>{
        event.preventDefault();
        if(!current||current.pageId!==linksContext.pageId||!editing()||editor().busy)return;
        const selected=[...choices.querySelectorAll('input:checked')].map(input=>input.value),target=select.value||null,id=linksContext.itemId;
        mutate(model=>{const item=model.items.find(item=>item.id===id);if(item){item.articleIds=selected;item.targetId=target;}});
        linksDialog.close();[...document.querySelectorAll('.strategy-row')].find(row=>row.dataset.contentItemId===id)?.querySelector('[data-content-action="links"]')?.focus({preventScroll:true});
      });
    }
    linksContext={pageId:current.pageId,itemId:id,available:articles(current.context),primary:item.targetId,primaryTouched:item.articleIds.length>0,lastCount:item.articleIds.length};
    const choices=linksForm.querySelector('fieldset');choices.replaceChildren(element('legend',null,'關聯條文（可複選）'));
    for(const article of linksContext.available){const label=element('label'),input=element('input');input.type='checkbox';input.name='articles';input.value=article.id;input.checked=item.articleIds.includes(article.id);label.append(input,document.createTextNode(articleLabel(article)+' '+article.name));choices.append(label);}
    updatePrimary(true);linksDialog.showModal();
  }
  function updatePrimary(initial) {
    const select=linksForm.elements.primary,previous=initial?linksContext.primary:select.value;
    const selected=[...linksForm.querySelectorAll('[name="articles"]:checked')].map(input=>input.value);
    select.replaceChildren(new Option('不連結',''));
    for(const id of selected){const article=linksContext.available.find(article=>article.id===id);select.add(new Option(articleLabel(article)+' '+article.name,id));}
    const auto=!initial&&!linksContext.primaryTouched&&linksContext.lastCount===0&&selected.length>0;
    select.value=selected.includes(previous)?previous:((previous||auto)?selected[0]||'':'');
    linksContext.lastCount=selected.length;
  }
  function mutate(change) {
    if(!current||!editing()||editor().busy)return;
    const model=clone(current.model),focus=change(model);
    editor().transact(next=>{next.content[current.type][current.pageId]=model;},true);
    if(focus){const node=[...document.querySelectorAll('[data-content-item-id]')].find(node=>node.dataset.contentItemId===focus);node?.scrollIntoView({block:'nearest'});(node?.matches('[contenteditable]')?node:node?.querySelector('[contenteditable]'))?.focus({preventScroll:true});}
  }
  document.addEventListener('click',event=>{
    const row=event.target.closest('[data-strategy-target]');
    if(row&&!window.generalRoadEditor?.editing&&!event.target.closest('button,a')){event.preventDefault();event.stopImmediatePropagation();row.querySelector('.strategy-title-button').click();return;}
    const button=event.target.closest('[data-content-action]');if(!button)return;selectModuleContext(button);if(!current)return;
    event.preventDefault();event.stopImmediatePropagation();
    const {contentAction:operation,kind,itemId,issueId}=button.dataset;
    if(operation==='links'){openLinks(itemId);return;}
    mutate(model=>{
      if(operation==='add-strategy'){const id=uid('strategy');model.items.push({id,title:'新增佈設策略',titleKey:current.pageId+'|strategy|'+id+'|title',articleIds:[],targetId:null});return id;}
      if(operation==='add-issue'){
        const id=uid('issue');model.issues.push({id,title:'新增現況問題',titleKey:current.pageId+'|content|'+id+'|title',imageKey:'content:'+current.pageId+':'+id,photo:false,points:[]});return id;
      }
      const issue=current.type==='conditions'?model.issues.find(value=>value.id===issueId):null;
      const list=kind==='strategy'?model.items:kind==='issue'?model.issues:issue?issue.points:model.points;
      if(!list)return;
      if(operation==='add-point'){const id=uid('point'),point={id,text:'在此輸入說明。',textKey:current.pageId+'|content|'+(issueId||current.type)+'|'+id};if(current.type==='modules')Object.assign(point,{title:'補充說明',titleKey:current.pageId+'|content|'+id+'|title',...(current.moduleTopic?{topicId:current.moduleTopic}:{})});list.push(point);return id;}
      const index=list.findIndex(value=>value.id===itemId);if(index<0)return;
      if(operation==='remove'){list.splice(index,1);return;}
      const candidates=current.type==='modules'?list.filter(point=>window.PresentationModules?.pointVisible(current.pageId,point,current.moduleTopic)!==false):list;
      const target=candidates[candidates.findIndex(value=>value.id===itemId)+(operation==='up'?-1:1)],to=list.indexOf(target);if(to>=0)[list[index],list[to]]=[list[to],list[index]];
      return itemId;
    });
  },true);
  document.addEventListener('input',event=>{
    const node=event.target.closest('[data-content-field]');if(!node)return;selectModuleContext(node);if(!current||!editing())return;
    event.stopImmediatePropagation();
    const path=JSON.parse(node.dataset.contentField),text=(node.innerText??node.textContent).replace(/\r/g,'');
    const applied=editor().transact(next=>{
      const table=next.content[path[0]];if(!table[path[1]])table[path[1]]=clone(current.model);
      let item=table[path[1]];
      for(let i=2;i<path.length-1;i++){item=Array.isArray(item)?item.find(value=>value.id===path[i]):item[path[i]];}
      item[path.at(-1)]=text;next.legacyState.texts[node.dataset.editKey]=text;
    },false);
    if(applied)current.model=clone(editor().store.config.content[path[0]][path[1]]);
  },true);
  function selectModuleContext(node){
    const card=node.closest('.module-extension-card');if(!card)return;
    const scoped=moduleContexts.find(item=>item.host===card.querySelector('.module-explain-points'));
    if(scoped){current=scoped;activeModuleKey=current.pageId+'|'+current.moduleTopic;}
  }
  function configureTools(ui) {
    const button=document.querySelector('.editor-format');button.textContent='文字樣式';
    const panel=document.getElementById('format-panel');panel.classList.add('content-font-panel');
    panel.querySelector('.format-panel-head strong').textContent='文字樣式';
    panel.querySelector('.format-panel-head small').textContent='選取文字後調整字體與樣式';
    panel.querySelector('.format-size-fields').hidden=true;
    for(const fieldset of panel.querySelectorAll(':scope>fieldset'))if(fieldset.querySelector('[data-format-layout]'))fieldset.hidden=true;
    panel.querySelector('[data-format-reset-layout]').hidden=true;
    panel.querySelector('.format-save-note').textContent='字體與內容會一起儲存到 JSON 設定檔。';
    const manager=panel.querySelector('.block-manager');
    const legacy=element('details','vl-legacy-notes');legacy.append(element('summary',null,'其他補充區塊（進階）'),manager);
    ui.querySelector('.vl-panel').append(legacy);
    const pages=element('details','vl-page-tools');pages.append(element('summary',null,'頁面管理（進階）'));
    for(const control of document.querySelectorAll('.editor-add-page,[data-page-order],.editor-remove-page'))pages.append(control);
    ui.querySelector('.vl-panel').append(pages);
  }
  window.PresentationContent={render,configureTools,get current(){return current;}};
})();
