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
  const configuration=()=>typeof window==='object'?window.visualLayoutEditor?.store?.config:null;
  function forKey(items,key,config=configuration()){return ordered(key.startsWith('scenario:')?ordered(items,config?.legacyState?.pageOrder):items,config?.navigationOrders?.[key]);}
  function organize(pages,data,config){
    for(const scene of data.scenarios){
      const articles=pages.filter(page=>page.scenario===scene.id&&page.article);
      if(articles.length<2)continue;
      const canonical=ordered(articles,scene.articleIds),legacy=config?.legacyState?.pageOrder||[];
      const sequence=forKey(ordered(canonical,legacy),'scenario:'+scene.id,config);
      const companion=pages.find(page=>page.id===scene.comparisonId),anchor=articles.find(page=>String(page.article.reg)==='185');
      const ids=new Set(articles.map(page=>page.id));if(companion&&anchor)ids.add(companion.id);
      const bundle=items=>items.flatMap(page=>companion&&anchor===page?[page,companion]:[page]);
      const next=config?.navigationOrders?.['scenario:'+scene.id]?bundle(sequence):ordered(bundle(canonical),legacy);let index=0;
      for(let i=0;i<pages.length;i++)if(ids.has(pages[i].id))pages[i]=next[index++];
    }
  }
  let app=null,drag=null,suppressed=null;
  const editable=()=>typeof window==='object'&&window.generalRoadEditor?.editing&&!window.visualLayoutEditor?.editing&&!window.visualLayoutEditor?.busy;
  function refresh(api=app){
    const root=document.getElementById('presentation'),state=api.state;
    const views=[...root.querySelectorAll('svg')].map(svg=>window.generalRoadViewport?.get(svg)?.read()).map((view,index)=>({view,index}));
    const scroll=[root,...root.querySelectorAll('.explanation,.module-explanation')].map(node=>[node.scrollLeft,node.scrollTop]);
    api.refreshStructure(state.page,state.phase);
    if(api.state.page!==state.page)return true;
    const svgs=root.querySelectorAll('svg');for(const {view,index}of views){const control=window.generalRoadViewport?.get(svgs[index]);if(view&&control){control.start();control.write(view);}}
    [root,...root.querySelectorAll('.explanation,.module-explanation')].forEach((node,index)=>{if(scroll[index]){node.scrollLeft=scroll[index][0];node.scrollTop=scroll[index][1];}});
    return true;
  }
  function mount(api){
    app=api;if(drag)cancel();
    const module=window.PresentationModules?.displayContext(),scene=api.page.scenario||api.page.article?.scenario;
    for(const nav of document.querySelectorAll('#presentation .article-nav')){
      const topics=nav.classList.contains('module-topic-nav')&&module?.stage?.id==='diagram';
      const buttons=[...nav.querySelectorAll(topics?'button[data-module-topic]':'button.article-chip[data-page]')];
      if(buttons.length<2||!topics&&!api.data.scenarios.some(item=>item.id===scene))continue;
      nav.dataset.navigationOrder=topics?'module:'+module.stage.pageId:'scenario:'+scene;
      const id=button=>topics?button.dataset.moduleTopic:button.dataset.page;
      const config=configuration(),canonical=ordered(buttons,topics?module.stage.topics.map(topic=>topic.id):api.data.scenarios.find(item=>item.id===scene).articleIds,id);
      const items=ordered(topics?canonical:ordered(canonical,config?.legacyState?.pageOrder,id),config?.navigationOrders?.[nav.dataset.navigationOrder],id);
      for(const button of items){nav.append(button);button.dataset.orderId=id(button);button.classList.add('navigation-order-item');button.draggable=false;
        button.classList.toggle('can-reorder',Boolean(editable()));
        if(editable()){if(!button.hasAttribute('data-order-title'))button.dataset.orderTitle=button.getAttribute('title')||'';button.title=(button.dataset.orderTitle?button.dataset.orderTitle+'；':'')+'拖曳調整順序；Alt＋←／→移動';}
        else if(button.hasAttribute('data-order-title')){if(button.dataset.orderTitle)button.title=button.dataset.orderTitle;else button.removeAttribute('title');delete button.dataset.orderTitle;}
      }
      const label=nav.querySelector('.nav-label');if(label){label.classList.toggle('navigation-order-label',Boolean(editable()));label.title=editable()?'拖曳按鈕調整順序；Alt＋←／→也可移動':'';}
    }
  }
  const ids=nav=>[...nav.querySelectorAll('button[data-order-id]')].map(button=>button.dataset.orderId);
  function commit(nav,id,target,after){
    const before=ids(nav),next=moved(before,id,target,after);if(next.every((value,index)=>value===before[index]))return;
    const key=nav.dataset.navigationOrder;
    if(window.visualLayoutEditor.transact(config=>{config.navigationOrders[key]=next;},false)){
      refresh();document.querySelector('[data-navigation-order="'+key+'"] [data-order-id="'+id+'"]')?.focus({preventScroll:true});
      window.visualLayoutEditor.report('順序已調整，請儲存設定。');
    }
  }
  function clearMarker(){if(drag)for(const button of drag.nav.querySelectorAll('[data-drop-side]'))delete button.dataset.dropSide;}
  function cancel(){
    if(!drag)return;const previous=drag;clearMarker();drag=null;previous.ghost?.remove();previous.button.classList.remove('is-order-dragging');
    document.body.classList.remove('is-navigation-order-dragging');try{previous.button.releasePointerCapture(previous.pointerId);}catch{}
  }
  function dropTarget(event){
    const rect=drag.nav.getBoundingClientRect();if(event.clientX<rect.left-6||event.clientX>rect.right+6||event.clientY<rect.top-6||event.clientY>rect.bottom+6)return null;
    const buttons=[...drag.nav.querySelectorAll('button[data-order-id]')];
    const direct=document.elementFromPoint(event.clientX,event.clientY)?.closest('button[data-order-id]');
    const target=buttons.includes(direct)?direct:buttons.reduce((best,button)=>{
      const b=button.getBoundingClientRect(),distance=Math.hypot(Math.max(b.left-event.clientX,0,event.clientX-b.right),Math.max(b.top-event.clientY,0,event.clientY-b.bottom)*3);
      return !best||distance<best.distance?{button,distance}:best;
    },null)?.button;
    if(!target||target===drag.button)return null;const b=target.getBoundingClientRect();return {target,after:event.clientX>b.left+b.width/2};
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
        const ghost=document.createElement('div');ghost.className='navigation-order-ghost';ghost.dataset.editorUi='navigation-order';ghost.setAttribute('aria-hidden','true');ghost.textContent=drag.button.textContent;document.body.append(ghost);drag.ghost=ghost;}
      drag.ghost.style.left=(event.clientX+12)+'px';drag.ghost.style.top=(event.clientY+12)+'px';
      const bounds=drag.nav.getBoundingClientRect();if(drag.nav.scrollWidth>drag.nav.clientWidth){if(event.clientX>bounds.right-25)drag.nav.scrollLeft+=18;else if(event.clientX<bounds.left+25)drag.nav.scrollLeft-=18;}
      clearMarker();drag.drop=dropTarget(event);if(drag.drop)drag.drop.target.dataset.dropSide=drag.drop.after?'after':'before';
    },{capture:true,passive:false});
    document.addEventListener('pointerup',event=>{
      if(!drag||event.pointerId!==drag.pointerId)return;const previous=drag,drop=previous.active?dropTarget(event):null;
      if(previous.active){event.preventDefault();event.stopImmediatePropagation();suppressed={key:previous.nav.dataset.navigationOrder,id:previous.button.dataset.orderId,until:performance.now()+500};}
      cancel();if(previous.active&&drop&&editable())commit(previous.nav,previous.button.dataset.orderId,drop.target.dataset.orderId,drop.after);
    },true);
    document.addEventListener('pointercancel',event=>{if(event.pointerId===drag?.pointerId)cancel();},true);
    document.addEventListener('click',event=>{
      const button=event.target.closest('.navigation-order-item');if(button&&suppressed&&performance.now()<suppressed.until&&button.dataset.orderId===suppressed.id&&button.closest('[data-navigation-order]')?.dataset.navigationOrder===suppressed.key){suppressed=null;event.preventDefault();event.stopImmediatePropagation();}
    },true);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&drag){const previous=drag;if(previous.active){suppressed={key:previous.nav.dataset.navigationOrder,id:previous.button.dataset.orderId,until:performance.now()+500};event.preventDefault();event.stopImmediatePropagation();}cancel();return;}
      const button=event.target.closest('.navigation-order-item');if(!button||!editable()||!event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();event.stopImmediatePropagation();const nav=button.closest('[data-navigation-order]'),values=ids(nav),index=values.indexOf(button.dataset.orderId),direction=event.key==='ArrowLeft'?-1:1;
      if(values[index+direction])commit(nav,button.dataset.orderId,values[index+direction],direction===1);
    },true);
    window.addEventListener('blur',cancel);
  }
  return {ordered,moved,forKey,organize,mount,refresh};
});
