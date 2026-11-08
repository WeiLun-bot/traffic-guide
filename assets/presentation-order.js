(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PresentationOrder=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function ordered(items,ids=[],identify=item=>item.id){
    const available=new Map(items.map(item=>[identify(item),item])),result=[];
    for(const id of ids||[])if(available.has(id)){result.push(available.get(id));available.delete(id);}
    return result.concat([...available.values()]);
  }
  function moved(ids,id,target,after=false){
    if(id===target||!ids.includes(id)||!ids.includes(target))return [...ids];
    const next=ids.filter(value=>value!==id);next.splice(next.indexOf(target)+(after?1:0),0,id);return next;
  }
  function reorderedPages(pages,ids,next){
    const selected=new Map(pages.filter(page=>ids.includes(page.id)).map(page=>[page.id,page]));
    if(selected.size!==ids.length||next.length!==ids.length||new Set(next).size!==ids.length||next.some(id=>!selected.has(id)))throw new Error('頁面排序項目無效');
    let index=0;return pages.map(page=>selected.has(page.id)?selected.get(next[index++]):page);
  }
  const configuration=()=>typeof window==='object'?window.visualLayoutEditor?.store?.config:null;
  function hidden(page,config=configuration()){return Boolean(page?.article&&config?.scenarioHiddenArticles?.[page.scenario]?.includes(page.id));}
  function articleGroups(items,scene,config=configuration(),identify=item=>item.id){
    const other=new Set(config?.scenarioOtherArticles?.[scene]||[]);
    const hidden=new Set(config?.scenarioHiddenArticles?.[scene]||[]);
    return {primary:items.filter(item=>!other.has(identify(item))&&!hidden.has(identify(item))),other:items.filter(item=>other.has(identify(item))&&!hidden.has(identify(item))),hidden:items.filter(item=>hidden.has(identify(item)))};
  }
  function forKey(items,key,config=configuration()){
    const result=ordered(key.startsWith('scenario:')?ordered(items,config?.legacyState?.pageOrder):items,config?.navigationOrders?.[key]);
    if(!/^scenario:g[1-4]-\d{2}$/.test(key))return result;
    const groups=articleGroups(result,key.slice(9),config);return groups.primary.concat(groups.other,groups.hidden);
  }
  function organize(pages,data,config){
    for(const scene of data.scenarios){
      const articles=pages.filter(page=>page.scenario===scene.id&&page.article);
      if(articles.length<2)continue;
      const canonical=ordered(articles,scene.articleIds),legacy=config?.legacyState?.pageOrder||[];
      const sequence=forKey(ordered(canonical,legacy),'scenario:'+scene.id,config);
      const companion=pages.find(page=>page.id===scene.comparisonId),anchor=articles.find(page=>String(page.article.reg)==='185');
      const ids=new Set(articles.map(page=>page.id));if(companion&&anchor)ids.add(companion.id);
      const bundle=items=>items.flatMap(page=>companion&&anchor===page?[page,companion]:[page]);
      const next=config?.navigationOrders?.['scenario:'+scene.id]||config?.scenarioOtherArticles?.[scene.id]||config?.scenarioHiddenArticles?.[scene.id]?bundle(sequence):ordered(bundle(canonical),legacy);let index=0;
      for(let i=0;i<pages.length;i++)if(ids.has(pages[i].id))pages[i]=next[index++];
    }
  }
  let app=null,drag=null,suppressed=null;
  const editable=()=>typeof window==='object'&&window.generalRoadEditor?.editing&&!window.visualLayoutEditor?.editing&&!window.visualLayoutEditor?.busy;
  function refresh(api=app,reordered=null){
    const root=document.getElementById('presentation'),state=api.state;
    const imageViews=window.PresentationImageOrder?.captureViews(api);
    const views=[...root.querySelectorAll('svg')].map(svg=>window.generalRoadViewport?.get(svg)?.read()).map((view,index)=>({view,index}));
    const scroll=[root,...root.querySelectorAll('.explanation,.module-explanation')].map(node=>[node.scrollLeft,node.scrollTop]);
    if(reordered)api.pages.splice(0,api.pages.length,...reordered);
    api.refreshStructure(state.page,state.phase);
    if(api.state.page!==state.page)return true;
    if(imageViews)window.PresentationImageOrder.restoreViews(imageViews,api);
    else{const svgs=root.querySelectorAll('svg');for(const {view,index}of views){const control=window.generalRoadViewport?.get(svgs[index]);if(view&&control){control.start();control.write(view);}}}
    [root,...root.querySelectorAll('.explanation,.module-explanation')].forEach((node,index)=>{if(scroll[index]){node.scrollLeft=scroll[index][0];node.scrollTop=scroll[index][1];}});
    return true;
  }
  function mount(api){
    app=api;if(drag)cancel();
    mountReview(api);
    mountContext(api);
    mountToc(api);
    const module=window.PresentationModules?.displayContext(),scene=api.page.scenario||api.page.article?.scenario;
    for(const nav of document.querySelectorAll('#presentation .article-nav')){
      const topics=nav.classList.contains('module-topic-nav')&&module?.stage?.id==='diagram';
      const buttons=[...nav.querySelectorAll(topics?'button[data-module-topic]':'button.article-chip[data-page]')];
      if(!buttons.length||!topics&&!api.data.scenarios.some(item=>item.id===scene))continue;
      nav.dataset.navigationOrder=topics?'module:'+module.stage.pageId:'scenario:'+scene;
      const id=button=>topics?button.dataset.moduleTopic:button.dataset.page;
      const config=configuration(),canonical=ordered(buttons,topics?module.stage.topics.map(topic=>topic.id):api.data.scenarios.find(item=>item.id===scene).articleIds,id);
      const items=ordered(topics?canonical:ordered(canonical,config?.legacyState?.pageOrder,id),config?.navigationOrders?.[nav.dataset.navigationOrder],id);
      for(const button of items){nav.append(button);button.dataset.orderId=id(button);button.classList.add('navigation-order-item');button.draggable=false;
        button.classList.toggle('can-reorder',Boolean(editable()));
        if(editable()){if(!button.hasAttribute('data-order-title'))button.dataset.orderTitle=button.getAttribute('title')||'';button.title=(button.dataset.orderTitle?button.dataset.orderTitle+'；':'')+'拖曳調整順序；Alt＋←／→移動';}
        else if(button.hasAttribute('data-order-title')){if(button.dataset.orderTitle)button.title=button.dataset.orderTitle;else button.removeAttribute('title');delete button.dataset.orderTitle;}
      }
      if(!topics&&/^g[1-4]-\d{2}$/.test(scene)){
        nav.classList.add('article-nav-grouped');
        nav.querySelectorAll('[data-article-group]').forEach(node=>node.remove());
        const groups=articleGroups(items,scene,config,id);
        for(const [group,title]of [['primary','主要涉及設施暨條文'],['other','其他條文'],...(editable()?[['hidden','隱藏條文（僅編輯模式顯示）']]:[])]){
          const row=document.createElement('div');row.className='article-index-group';row.dataset.articleGroup=group;row.setAttribute('role','group');row.setAttribute('aria-label',title);
          const label=document.createElement('span');label.className='article-index-label';label.textContent=title;
          const list=document.createElement('div');list.className='article-index-items';
          list.append(...groups[group]);row.append(label,list);
          if(!groups[group].length){const empty=document.createElement('span');empty.className='article-index-empty';empty.textContent=editable()?'拖曳條文至此':'尚無條文';list.append(empty);}
          row.classList.toggle('can-classify',Boolean(editable()));nav.append(row);
        }
        if(!editable())for(const button of groups.hidden)button.remove();
        for(const button of items)if(editable())button.title+='；Alt＋↑／↓切換分類；Alt＋Shift＋↓移至隱藏條文';
      }
      const label=nav.querySelector('.nav-label');if(label){label.classList.toggle('navigation-order-label',Boolean(editable()));label.title=editable()?'拖曳按鈕調整順序；Alt＋←／→也可移動':'';}
    }
    mountFacilityOrder(module);
  }
  function mountFacilityOrder(module){
    if(!editable()||!module?.topic?.facilities)return;
    for(const nav of document.querySelectorAll('#presentation .module-concept-facilities')){
      const buttons=[...nav.querySelectorAll('[data-module-concept-facility]')];if(buttons.length<2)continue;
      nav.dataset.navigationOrder='concept-facilities:'+module.stage.pageId+'/'+module.topic.id;
      for(const button of buttons){
        button.dataset.orderId=button.dataset.moduleConceptFacility;button.classList.add('navigation-order-item','can-reorder');button.draggable=false;
        button.title='拖曳調整同類項目順序；Alt＋←／→移動';
      }
    }
  }
  function mountContext(api){
    if(api.page.deckId!=='general'||api.page.kind!=='context')return;
    const host=document.querySelector('#presentation .context-grid>.context-issues');if(!host)return;
    const rows=[...host.querySelectorAll(':scope>.issue-row')];rows.forEach((row,index)=>row.dataset.contextTarget='target-'+index);
    const key='context:'+api.page.id,items=ordered(rows,configuration()?.navigationOrders?.[key],row=>row.dataset.contextTarget);
    items.forEach((row,index)=>{host.append(row);row.querySelector(':scope>span').textContent=String(index+1);if(!editable())return;
      const controls=document.createElement('div');controls.className='context-target-order-tools';controls.dataset.editorUi='context-order';
      for(const [direction,label]of [[-1,'上移'],[1,'下移']]){const button=document.createElement('button');button.type='button';button.textContent=direction<0?'↑':'↓';button.setAttribute('aria-label',label+'改善目標');button.disabled=index+direction<0||index+direction>=items.length;
        button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(!editable())return;const ids=items.map(row=>row.dataset.contextTarget),next=moved(ids,row.dataset.contextTarget,ids[index+direction],direction>0);if(window.visualLayoutEditor.transact(config=>{config.navigationOrders[key]=next;},false))api.refresh();});controls.append(button);
      }row.querySelector(':scope>div').append(controls);
    });
  }
  function mountReview(api){
    const host=document.querySelector('#presentation .review-rows');if(!host)return;
    const rows=[...host.querySelectorAll(':scope>.review-row')];
    rows.forEach((row,index)=>{row.dataset.reviewRow='row-'+index;row.querySelector('[data-review-order-tools]')?.remove();});
    const key='review:'+api.page.id,items=ordered(rows,configuration()?.navigationOrders?.[key],row=>row.dataset.reviewRow);
    items.forEach((row,index)=>{
      host.append(row);row.querySelector(':scope>span').textContent=String(index+1);
      if(!editable())return;
      const controls=document.createElement('span');controls.className='review-order-tools';controls.dataset.reviewOrderTools='';controls.dataset.editorUi='review-order';
      for(const [direction,label]of [[-1,'上移'],[1,'下移']]){
        const button=document.createElement('button');button.type='button';button.textContent=direction<0?'↑':'↓';button.dataset.reviewMove=direction;button.setAttribute('aria-label',label+'這個小結列點');button.disabled=index+direction<0||index+direction>=items.length;
        button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(!editable())return;
          const ids=items.map(item=>item.dataset.reviewRow),next=moved(ids,row.dataset.reviewRow,ids[index+direction],direction>0);
          if(window.visualLayoutEditor.transact(config=>{config.navigationOrders[key]=next;},false)){api.refresh();const controls=document.querySelector('[data-review-row="'+row.dataset.reviewRow+'"] .review-order-tools');(controls?.querySelector('[data-review-move="'+direction+'"]:not(:disabled)')||controls?.querySelector('button:not(:disabled)'))?.focus({preventScroll:true});}
        });controls.append(button);
      }
      row.append(controls);
    });
  }
  function updateTocActions(message,error=false){
    for(const button of document.querySelectorAll('[data-toc-editor-action]')){
      const source=document.querySelector('#visual-layout-editor [data-vl-action="'+button.dataset.tocEditorAction+'"]');
      button.disabled=!source||source.disabled;if(button.dataset.tocEditorAction==='save')button.textContent=source?.textContent||'儲存';
    }
    if(typeof message==='string'){const feedback=document.querySelector('.toc-order-feedback');if(feedback){feedback.textContent=message;feedback.classList.toggle('is-error',error);}}
  }
  function mountToc(api=app){
    if(!api)return;const root=document.getElementById('toc-content');if(!root)return;
    const active=Boolean(editable());root.classList.toggle('is-toc-ordering',active);
    if(!active)return;
    if(!root.querySelector('.toc-order-toolbar')){
      const toolbar=document.createElement('div');toolbar.className='toc-order-toolbar';toolbar.dataset.editorUi='toc-order';
      toolbar.innerHTML='<p>可在各章節或情境內拖曳頁面，亦可用 ↑／↓ 調整播放順序。</p><div class="toc-order-editor-actions"><button type="button" data-toc-editor-action="undo">復原</button><button type="button" data-toc-editor-action="redo">重做</button><button type="button" data-toc-editor-action="save">儲存</button><button type="button" data-close>關閉</button></div><span class="toc-order-feedback" role="status" aria-live="polite"></span>';root.prepend(toolbar);
    }
    const pageById=new Map(api.pages.map(page=>[page.id,page]));
    for(const [index,nav]of [...root.querySelectorAll('.toc-pages,.toc-chapter-overview')].entries()){
      const buttons=[...nav.querySelectorAll('button[data-page]')].filter(button=>pageById.has(button.dataset.page));if(buttons.length<2)continue;
      nav.dataset.navigationOrder='toc:'+index;nav.classList.add('toc-can-reorder');
      buttons.forEach((button,at)=>{
        if(button.closest('.toc-order-item'))return;
        const wrapper=document.createElement('span');wrapper.className='toc-order-item';button.before(wrapper);wrapper.append(button);
        button.dataset.orderId=button.dataset.page;button.classList.add('navigation-order-item','toc-order-trigger');button.draggable=false;button.title='拖曳調整順序；Alt＋↑／↓ 移動';
        const controls=document.createElement('span');controls.className='toc-order-actions';controls.dataset.editorUi='toc-order';
        for(const direction of [-1,1]){const control=document.createElement('button');control.type='button';control.dataset.tocOrderMove=String(direction);control.textContent=direction<0?'↑':'↓';control.title=direction<0?'前移一頁':'後移一頁';control.setAttribute('aria-label',control.title+'：'+button.textContent);control.disabled=direction<0?at===0:at===buttons.length-1;controls.append(control);}
        wrapper.append(controls);
      });
    }
    updateTocActions();
  }
  const ids=nav=>[...nav.querySelectorAll('button[data-order-id]')].map(button=>button.dataset.orderId);
  function commit(nav,id,target,after,group){
    if(nav.classList.contains('article-nav-grouped')){
      const scene=nav.dataset.navigationOrder.slice(9),before=ids(nav),groups=articleGroups(before,scene,configuration(),id=>id);
      group=group||nav.querySelector('[data-order-id="'+target+'"]')?.closest('[data-article-group]')?.dataset.articleGroup;
      if(!['primary','other','hidden'].includes(group)||!before.includes(id))return;
      const oldOther=[...groups.other],oldHidden=[...groups.hidden];for(const key of ['primary','other','hidden'])groups[key]=groups[key].filter(value=>value!==id);
      const index=groups[group].indexOf(target);groups[group].splice(index<0?groups[group].length:index+(after?1:0),0,id);
      const next=groups.primary.concat(groups.other,groups.hidden);
      if(JSON.stringify(before)===JSON.stringify(next)&&JSON.stringify(oldOther)===JSON.stringify(groups.other)&&JSON.stringify(oldHidden)===JSON.stringify(groups.hidden))return;
      if(window.visualLayoutEditor.transact(config=>{config.navigationOrders[nav.dataset.navigationOrder]=next;config.scenarioOtherArticles[scene]=groups.other;config.scenarioHiddenArticles[scene]=groups.hidden;},false)){
        refresh();document.querySelector('[data-navigation-order="'+nav.dataset.navigationOrder+'"] [data-order-id="'+id+'"]')?.focus({preventScroll:true});
        window.visualLayoutEditor.report('條文分類與順序已調整，請儲存設定。');
      }
      return;
    }
    const before=ids(nav),next=moved(before,id,target,after);if(next.every((value,index)=>value===before[index]))return;
    const key=nav.dataset.navigationOrder;
    if(key.startsWith('concept-facilities:')){window.PresentationModules?.reorderFacilities(next,id);return;}
    if(key.startsWith('toc:')){
      const pages=reorderedPages(app.pages,before,next),pageOrder=pages.map(page=>page.id),scenarios=new Set(pages.filter(page=>before.includes(page.id)&&page.scenario).map(page=>page.scenario));
      if(window.visualLayoutEditor.transact(config=>{config.legacyState.pageOrder=pageOrder;for(const scene of scenarios)delete config.navigationOrders['scenario:'+scene];},false)){
        window.generalRoadEditor.state.pageOrder=[...pageOrder];refresh(app,pages);
        document.querySelector('[data-navigation-order="'+key+'"] [data-order-id="'+id+'"]')?.focus({preventScroll:true});
        window.visualLayoutEditor.report('播放順序已調整，請儲存設定。');
      }
      return;
    }
    if(window.visualLayoutEditor.transact(config=>{config.navigationOrders[key]=next;},false)){
      refresh();document.querySelector('[data-navigation-order="'+key+'"] [data-order-id="'+id+'"]')?.focus({preventScroll:true});
      window.visualLayoutEditor.report('順序已調整，請儲存設定。');
    }
  }
  function clearMarker(){if(drag){for(const button of drag.nav.querySelectorAll('[data-drop-side]'))delete button.dataset.dropSide;for(const row of drag.nav.querySelectorAll('[data-group-drop]'))delete row.dataset.groupDrop;}}
  function cancel(){
    if(!drag)return;const previous=drag;clearMarker();drag=null;previous.ghost?.remove();previous.button.classList.remove('is-order-dragging');
    document.body.classList.remove('is-navigation-order-dragging');try{previous.button.releasePointerCapture(previous.pointerId);}catch{}
  }
  function dropTarget(event){
    if(document.elementFromPoint(event.clientX,event.clientY)?.closest('.toc-order-toolbar'))return null;
    const rect=drag.nav.getBoundingClientRect();if(event.clientX<rect.left-6||event.clientX>rect.right+6||event.clientY<rect.top-6||event.clientY>rect.bottom+6)return null;
    const group=drag.nav.classList.contains('article-nav-grouped')?document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-article-group]'):null;
    if(drag.nav.classList.contains('article-nav-grouped')&&(!group||!drag.nav.contains(group)))return null;
    const buttons=[...(group||drag.nav).querySelectorAll('button[data-order-id]')];
    if(group&&!buttons.length)return {group:group.dataset.articleGroup,row:group};
    const direct=document.elementFromPoint(event.clientX,event.clientY)?.closest('button[data-order-id]');
    const target=buttons.includes(direct)?direct:buttons.reduce((best,button)=>{
      const b=button.getBoundingClientRect(),distance=Math.hypot(Math.max(b.left-event.clientX,0,event.clientX-b.right),Math.max(b.top-event.clientY,0,event.clientY-b.bottom)*3);
      return !best||distance<best.distance?{button,distance}:best;
    },null)?.button;
    if(!target||target===drag.button)return null;const b=target.getBoundingClientRect();return {target,after:event.clientX>b.left+b.width/2,group:group?.dataset.articleGroup,row:group};
  }
  if(typeof document==='object'){
    document.addEventListener('pointerdown',event=>{
      const button=event.target.closest('.navigation-order-item');if(!button||!editable()||event.button!==0||event.isPrimary===false||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
      cancel();drag={button,nav:button.closest('[data-navigation-order]'),pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:false};
      try{button.setPointerCapture(event.pointerId);}catch{}
    },true);
    document.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      if(!editable()){cancel();return;}
      if(!drag.active&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(!drag.active){drag.active=true;drag.button.classList.add('is-order-dragging');document.body.classList.add('is-navigation-order-dragging');
        const ghost=document.createElement('div');ghost.className='navigation-order-ghost';ghost.dataset.editorUi='navigation-order';ghost.setAttribute('aria-hidden','true');ghost.textContent=drag.button.textContent;(drag.button.closest('dialog')||document.body).append(ghost);drag.ghost=ghost;}
      drag.ghost.style.left=(event.clientX+12)+'px';drag.ghost.style.top=(event.clientY+12)+'px';
      const bounds=drag.nav.getBoundingClientRect();if(drag.nav.scrollWidth>drag.nav.clientWidth){if(event.clientX>bounds.right-25)drag.nav.scrollLeft+=18;else if(event.clientX<bounds.left+25)drag.nav.scrollLeft-=18;}
      const dialog=drag.nav.closest('dialog');if(dialog){const rect=dialog.getBoundingClientRect();if(event.clientY>rect.bottom-35)dialog.scrollTop+=16;else if(event.clientY<rect.top+35)dialog.scrollTop-=16;}
      clearMarker();drag.drop=dropTarget(event);if(drag.drop){if(drag.drop.target)drag.drop.target.dataset.dropSide=drag.drop.after?'after':'before';if(drag.drop.row)drag.drop.row.dataset.groupDrop='true';}
    },{capture:true,passive:false});
    document.addEventListener('pointerup',event=>{
      if(!drag||event.pointerId!==drag.pointerId)return;const previous=drag,drop=previous.active?dropTarget(event):null;
      if(previous.active){event.preventDefault();event.stopImmediatePropagation();suppressed={key:previous.nav.dataset.navigationOrder,id:previous.button.dataset.orderId,until:performance.now()+500};}
      cancel();if(previous.active&&drop&&editable())commit(previous.nav,previous.button.dataset.orderId,drop.target?.dataset.orderId,drop.after,drop.group);
    },true);
    document.addEventListener('pointercancel',event=>{if(event.pointerId===drag?.pointerId)cancel();},true);
    document.addEventListener('click',event=>{
      const action=event.target.closest('[data-toc-editor-action]');if(action&&editable()){event.preventDefault();event.stopImmediatePropagation();document.querySelector('#visual-layout-editor [data-vl-action="'+action.dataset.tocEditorAction+'"]')?.click();return;}
      const move=event.target.closest('[data-toc-order-move]');if(move&&editable()){
        event.preventDefault();event.stopImmediatePropagation();const button=move.closest('.toc-order-item').querySelector('[data-order-id]'),nav=button.closest('[data-navigation-order]'),values=ids(nav),index=values.indexOf(button.dataset.orderId),direction=Number(move.dataset.tocOrderMove);
        if(values[index+direction])commit(nav,button.dataset.orderId,values[index+direction],direction>0);return;
      }
      const button=event.target.closest('.navigation-order-item');if(button&&suppressed&&performance.now()<suppressed.until&&button.dataset.orderId===suppressed.id&&button.closest('[data-navigation-order]')?.dataset.navigationOrder===suppressed.key){suppressed=null;event.preventDefault();event.stopImmediatePropagation();}
    },true);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&drag){const previous=drag;if(previous.active){suppressed={key:previous.nav.dataset.navigationOrder,id:previous.button.dataset.orderId,until:performance.now()+500};event.preventDefault();event.stopImmediatePropagation();}cancel();return;}
      const grouped=event.target.closest('.article-nav-grouped .navigation-order-item');
      if(grouped&&editable()&&event.altKey&&!event.ctrlKey&&!event.metaKey&&['ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();event.stopImmediatePropagation();const group=event.key==='ArrowUp'?'primary':event.shiftKey?'hidden':'other';
        if(grouped.closest('[data-article-group]').dataset.articleGroup!==group)commit(grouped.closest('[data-navigation-order]'),grouped.dataset.orderId,null,true,group);return;
      }
      const button=event.target.closest('.navigation-order-item'),toc=button?.classList.contains('toc-order-trigger');if(!button||!editable()||!event.altKey||event.ctrlKey||event.metaKey||!(toc?['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']:['ArrowLeft','ArrowRight']).includes(event.key))return;
      event.preventDefault();event.stopImmediatePropagation();const nav=button.closest('[data-navigation-order]'),values=ids(nav),index=values.indexOf(button.dataset.orderId),direction=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;
      if(values[index+direction])commit(nav,button.dataset.orderId,values[index+direction],direction===1);
    },true);
    window.addEventListener('blur',cancel);
  }
  return {ordered,moved,reorderedPages,articleGroups,forKey,organize,hidden,mount,mountToc,updateTocActions,refresh};
});
