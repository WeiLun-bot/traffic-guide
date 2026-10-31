(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PresentationImageOrder=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const config=()=>typeof window==='object'?window.visualLayoutEditor?.store?.config:null;
  function ordered(items,key,identify=item=>item.id,settings=config()){
    const available=new Map(items.map(item=>[identify(item),item])),result=[];
    for(const id of settings?.imageOrders?.[key]||[])if(available.has(id)){result.push(available.get(id));available.delete(id);}
    return result.concat([...available.values()]);
  }
  function moved(ids,id,target,after=false){
    if(id===target||!ids.includes(id)||!ids.includes(target))return [...ids];
    const next=ids.filter(value=>value!==id);next.splice(next.indexOf(target)+(after?1:0),0,id);return next;
  }
  const groups=new Map();let app=null,panel=null,list=null,opened='',drag=null;
  const editing=()=>Boolean(typeof window==='object'&&window.generalRoadEditor?.editing&&!window.visualLayoutEditor?.editing&&!window.visualLayoutEditor?.busy);
  function button(group){
    if(group.items.length<2)return '';
    groups.set(group.key,group);
    return `<button type="button" class="image-order-toggle" data-image-order-open="${esc(group.key)}" data-editor-ui="image-order" aria-expanded="false" aria-controls="image-order-panel">${group.photos?'排列照片':'排列圖片'}</button>`;
  }
  function viewEntries(api){
    const counts=new Map();
    return [...document.querySelectorAll('#presentation svg,#presentation img')].flatMap(element=>{
      const controller=window.generalRoadViewport?.get(element);if(!controller)return [];
      const image=element.closest('[data-editor-image-key]')?.dataset.editorImageKey||element.id||element.localName;
      const scope=element.closest('[data-overview-key]')?.dataset.overviewKey||element.closest('[data-module-source-page]')?.dataset.moduleSourcePage||api.state.page;
      const base=scope+'|'+image,index=counts.get(base)||0;counts.set(base,index+1);return [{key:base+'|'+index,controller}];
    });
  }
  function captureViews(api=app){return api?{page:api.state.page,views:viewEntries(api).map(item=>({key:item.key,view:item.controller.read()}))}:null;}
  function restoreViews(captured,api=app){
    if(!captured||captured.page!==api?.state.page)return;
    for(const item of viewEntries(api)){const old=captured.views.find(value=>value.key===item.key);if(old){item.controller.start();item.controller.write(old.view,false);}}
  }
  const triggers=()=>[...document.querySelectorAll('#presentation [data-image-order-open]')];
  const trigger=()=>triggers().find(node=>node.dataset.imageOrderOpen===opened);
  function place(){
    const anchor=trigger();if(!opened||!anchor)return;
    const rect=anchor.getBoundingClientRect(),width=Math.min(420,innerWidth-24),height=Math.min(530,innerHeight-32);
    const below=innerHeight-rect.bottom-16,top=below>=240?rect.bottom+8:Math.max(12,rect.top-height-8);
    panel.style.width=width+'px';panel.style.left=Math.max(12,Math.min(rect.right-width,innerWidth-width-12))+'px';panel.style.top=Math.max(12,Math.min(top,innerHeight-160))+'px';panel.style.maxHeight=Math.max(140,innerHeight-parseFloat(panel.style.top)-16)+'px';
  }
  function renderPanel(focusId){
    const group=groups.get(opened);if(!group)return;
    focusId=focusId||document.activeElement?.closest('.image-order-list>[data-image-order-id]')?.dataset.imageOrderId;
    const items=ordered(group.items,group.key),scroll=list.scrollTop;
    panel.querySelector('[data-image-order-title]').textContent=group.photos?'排列照片':'排列圖片';
    list.innerHTML=items.map((item,index)=>{
      const src=window.generalRoadEditor?.state.images[item.id]?.src||item.src;
      return `<li data-image-order-id="${esc(item.id)}"><button type="button" class="image-order-handle" data-image-order-handle aria-label="拖曳排列${esc(item.label)}" title="拖曳排序；Alt＋上下鍵也可移動">⋮⋮</button><img src="${esc(src)}" alt="" draggable="false" loading="lazy"><div><strong>${index+1}. ${esc(item.label)}</strong><small>${[index===0?'預設顯示':'',item.id===group.selectedId?'目前顯示':''].filter(Boolean).join(' · ')}</small></div><div class="image-order-steps"><button type="button" data-image-order-step="-1" aria-label="前移${esc(item.label)}" ${index===0?'disabled':''}>↑</button><button type="button" data-image-order-step="1" aria-label="後移${esc(item.label)}" ${index===items.length-1?'disabled':''}>↓</button></div></li>`;
    }).join('');
    list.scrollTop=scroll;
    if(focusId)[...list.children].find(row=>row.dataset.imageOrderId===focusId)?.querySelector('[data-image-order-handle]').focus({preventScroll:true});
    place();
  }
  function cancel(){
    if(!drag)return;
    const old=drag;drag=null;old.ghost?.remove();
    for(const row of list.children){delete row.dataset.imageOrderDrop;row.classList.remove('is-dragging');}
    try{old.handle.releasePointerCapture(old.pointerId);}catch{}
  }
  function close(focus=false){
    if(!panel)return;const anchor=trigger();cancel();opened='';panel.hidden=true;
    for(const node of triggers())node.setAttribute('aria-expanded','false');
    if(focus)anchor?.focus({preventScroll:true});
  }
  function apply(ids,focusId){
    const group=groups.get(opened);if(!group||!editing())return;
    const current=ordered(group.items,group.key).map(item=>item.id);if(JSON.stringify(ids)===JSON.stringify(current))return;
    const captured=captureViews();
    if(window.visualLayoutEditor.transact(next=>{next.imageOrders[group.key]=ids;},false)){
      app.refresh();restoreViews(captured);renderPanel(focusId);window.visualLayoutEditor.report((group.photos?'照片':'圖片')+'順序已更新，第一張為預設；請儲存設定。');
    }
  }
  function step(id,direction){const group=groups.get(opened);if(!group)return;const ids=ordered(group.items,group.key).map(item=>item.id),index=ids.indexOf(id),target=index+direction;if(index>=0&&target>=0&&target<ids.length)apply(moved(ids,id,ids[target],direction>0),id);}
  function ensurePanel(){
    if(panel)return;
    panel=document.createElement('section');panel.id='image-order-panel';panel.className='image-order-panel';panel.hidden=true;panel.dataset.editorUi='image-order-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','image-order-panel-title');
    panel.innerHTML='<div class="image-order-heading"><strong id="image-order-panel-title" data-image-order-title>排列照片</strong><button type="button" data-image-order-close aria-label="關閉照片排序">×</button></div><p>拖曳縮圖左側把手，或按 ↑／↓ 調整。第一張為預設顯示照片。</p><ol class="image-order-list"></ol><small class="image-order-note">完成後按上方「儲存」，支援復原／重做。</small>';
    document.body.append(panel);list=panel.querySelector('ol');
    panel.addEventListener('pointerdown',event=>{
      const handle=event.target.closest('[data-image-order-handle]');if(!handle||event.button!==0||!editing())return;
      event.preventDefault();event.stopPropagation();cancel();handle.focus({preventScroll:true});
      drag={handle,pointerId:event.pointerId,id:handle.closest('li').dataset.imageOrderId,x:event.clientX,y:event.clientY,moved:false,key:opened};handle.setPointerCapture(event.pointerId);
    });
    panel.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      if(!editing()){cancel();return;}
      if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<5)return;
      event.preventDefault();drag.moved=true;
      if(!drag.ghost){const row=drag.handle.closest('li');drag.ghost=row.cloneNode(true);drag.ghost.className='image-order-ghost';drag.ghost.dataset.editorUi='image-order-ghost';drag.ghost.style.width=row.getBoundingClientRect().width+'px';drag.ghost.setAttribute('aria-hidden','true');document.body.append(drag.ghost);row.classList.add('is-dragging');}
      drag.ghost.style.left=event.clientX+12+'px';drag.ghost.style.top=event.clientY+10+'px';
      const bounds=list.getBoundingClientRect();if(event.clientY<bounds.top+30)list.scrollTop-=14;else if(event.clientY>bounds.bottom-30)list.scrollTop+=14;
      for(const row of list.children)delete row.dataset.imageOrderDrop;
      const row=document.elementFromPoint(event.clientX,event.clientY)?.closest('.image-order-list>li');
      drag.target=row&&row.parentElement===list?row.dataset.imageOrderId:null;
      if(row&&drag.target!==drag.id){const rect=row.getBoundingClientRect();drag.after=event.clientY>rect.top+rect.height/2;row.dataset.imageOrderDrop=drag.after?'after':'before';}
    });
    panel.addEventListener('pointerup',event=>{if(!drag||event.pointerId!==drag.pointerId)return;const old=drag;cancel();if(old.moved&&old.target&&old.key===opened){const group=groups.get(opened);apply(moved(ordered(group.items,group.key).map(item=>item.id),old.id,old.target,old.after),old.id);}});
    panel.addEventListener('pointercancel',cancel);
  }
  function mount(api){
    app=api;const visible=new Set(triggers().map(node=>node.dataset.imageOrderOpen));for(const key of groups.keys())if(!visible.has(key))groups.delete(key);
    if(opened&&(!editing()||!visible.has(opened))){close();return;}
    if(opened){cancel();for(const node of triggers())node.setAttribute('aria-expanded',String(node.dataset.imageOrderOpen===opened));renderPanel();}
  }
  if(typeof document==='object'){
    document.addEventListener('click',event=>{
      const toggle=event.target.closest('[data-image-order-open]');
      if(toggle){event.preventDefault();event.stopImmediatePropagation();if(!editing())return;if(opened===toggle.dataset.imageOrderOpen){close(true);return;}ensurePanel();opened=toggle.dataset.imageOrderOpen;panel.hidden=false;for(const node of triggers())node.setAttribute('aria-expanded',String(node===toggle));renderPanel();panel.querySelector('[data-image-order-close]').focus({preventScroll:true});return;}
      if(!opened)return;
      if(event.target.closest('[data-image-order-close]')){event.preventDefault();event.stopImmediatePropagation();close(true);return;}
      const control=event.target.closest('[data-image-order-step]');if(control&&!control.disabled){event.preventDefault();event.stopImmediatePropagation();step(control.closest('li').dataset.imageOrderId,Number(control.dataset.imageOrderStep));return;}
      if(!panel.contains(event.target)&&!event.target.closest('[data-vl-action="undo"],[data-vl-action="redo"],[data-vl-action="save"]'))close();
    },true);
    document.addEventListener('keydown',event=>{
      if(!opened||!panel.contains(event.target))return;
      event.stopImmediatePropagation();
      if((event.ctrlKey||event.metaKey)&&['z','y','s'].includes(event.key.toLowerCase())){event.preventDefault();const key=event.key.toLowerCase(),action=key==='s'?'save':key==='y'||event.shiftKey?'redo':'undo';cancel();document.querySelector(`[data-vl-action="${action}"]`)?.click();return;}
      if(event.key==='Escape'){event.preventDefault();if(drag)cancel();else close(true);return;}
      if(event.altKey&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const row=event.target.closest('[data-image-order-id]');if(row)step(row.dataset.imageOrderId,event.key==='ArrowUp'?-1:1);return;}
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key))event.preventDefault();
    },true);
    window.addEventListener('resize',place);document.addEventListener('scroll',()=>{if(opened)place();},true);
  }
  return {ordered,moved,button,mount,captureViews,restoreViews};
});
