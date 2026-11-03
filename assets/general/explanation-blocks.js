(() => {
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
  let context,root=null,body=null,scope='',list=[],selectedId='',controls,addButton;
  const types={paragraph:'一般說明',callout:'綠色提示框',separator:'分隔線'};
  const validNote=note=>note&&/^note-[\w-]+$/.test(note.id)&&Object.hasOwn(types,note.type)&&typeof note.title==='string'&&typeof note.body==='string'&&(typeof note.after==='string'||note.after===null);
  function entry(create=false) {
    const state=context.getState();
    if(!record(state.blocks[scope])) {
      if(!create)return {added:[],removed:[],decor:{}};
      state.blocks[scope]={added:[],removed:[],decor:{}};
    }
    const value=state.blocks[scope];
    value.added=(Array.isArray(value.added)?value.added:[]).filter(validNote);
    value.removed=(Array.isArray(value.removed)?value.removed:[]).filter(id=>typeof id==='string');
    if(!record(value.decor))value.decor={};
    return value;
  }
  const current=()=>list.find(item=>item.id===selectedId);
  function register(element,id,label,added=false) {
    if(!element||element.hasAttribute('data-template-hidden')||list.some(item=>item.element===element))return;
    const key=scope+'|content|'+id;
    element.dataset.contentBlock=id;element.dataset.formatBlock=key;element.classList.add('content-block');
    list.push({id,key,label,element,added});
  }
  function applyAppearance(item) {
    const value=entry(),decor=record(value.decor[item.id])?value.decor[item.id]:{};
    const removed=value.removed.includes(item.id);
    item.element.hidden=removed;item.element.classList.toggle('content-block-removed',removed);
    item.element.classList.toggle('content-block-no-border',decor.border===false);
    item.element.classList.toggle('content-block-no-background',decor.background===false);
  }
  function insertionPoint(item) {
    let anchor=item?.element;
    if(!anchor||!body.contains(anchor))return null;
    if(anchor.parentElement.matches('ol,ul'))return anchor;
    while(anchor.parentElement!==body&&anchor.parentElement&&body.contains(anchor.parentElement))anchor=anchor.parentElement;
    return anchor;
  }
  function render() {
    if(!context)return;
    scope=context.api.page.id+'|'+context.api.state.phase;
    root=document.querySelector('#explanation,.custom-explanation,.custom-compare-explanation,.context-issues');
    list=[];body=null;
    if(root) {
      root.querySelectorAll('[data-user-block]').forEach(element=>element.remove());
      body=root.id==='explanation'?root.firstElementChild:root;
      const specs=[
        ['.explain-topline>.tag','citation','條文標籤'],['h2','heading','解說標題'],['.metric-row','metric','重點數值資訊'],
        ['.explain-intro','intro','導讀說明'],['.takeaway','takeaway','重點提醒'],['.explain-footer','links','圖例與原文按鈕'],
        ['.source-line','source','資料來源'],['.module-row','modules','相關模組'],['.mini-diagram-note','module-note','模組說明'],
        ['.locate-number','locate-number','定位編號'],['.locate-caption','locate-caption','定位標籤'],['.locate-instruction','locate-instruction','定位操作說明']
      ];
      for(const [selector,id,label]of specs)register(root.querySelector(selector),id,label);
      root.querySelectorAll('.explain-points>li').forEach((element,index)=>register(element,'point-'+index,'說明 '+(index+1)));
      root.querySelectorAll('.overview-list>button').forEach((element,index)=>register(element,'overview-'+index,'總覽項目 '+(index+1)));
      root.querySelectorAll('.issue-row').forEach((element,index)=>register(element,'issue-'+index,'議題 '+(index+1)));
      root.querySelectorAll(':scope>.tag,:scope>p').forEach((element,index)=>register(element,'direct-'+index,element.matches('.tag')?'步驟標籤':'解說段落'));
      const value=entry();
      for(const note of value.added) {
        const anchor=insertionPoint(list.find(item=>item.id===note.after));
        const tag=anchor?.parentElement.matches('ol,ul')?'li':'section';
        const element=document.createElement(tag);element.dataset.userBlock=note.id;element.className='user-explain-block user-explain-'+note.type;
        if(note.type==='separator')element.setAttribute('aria-label','說明分隔線');
        else {
          const heading=document.createElement('h3');heading.textContent=note.title;heading.dataset.blockEditKey=scope+'|'+note.id+'|title';
          const paragraph=document.createElement('p');paragraph.textContent=note.body;paragraph.dataset.blockEditKey=scope+'|'+note.id+'|body';
          element.append(heading,paragraph);
        }
        if(anchor)anchor.after(element);else body.append(element);
        register(element,note.id,types[note.type]+' '+(value.added.indexOf(note)+1)+'（新增）',true);
      }
      list.forEach(applyAppearance);
    }
    if(!list.some(item=>item.id===selectedId))selectedId=list[0]?.id||'';
    syncPanel();
  }
  function syncPanel() {
    if(!controls)return;
    addButton.disabled=!root;
    controls.querySelector('[data-block-add]').disabled=!root;
    controls.querySelector('[data-block-type]').disabled=!root;
    const select=controls.querySelector('[data-block-select]');
    select.innerHTML=list.map(item=>`<option value="${escape(item.id)}">${entry().removed.includes(item.id)?'（已刪除）':''}${escape(item.label)}</option>`).join('');
    select.disabled=!list.length;select.value=selectedId;
    const item=current(),value=entry(),decor=item&&record(value.decor[item.id])?value.decor[item.id]:{};
    const hidden=item&&value.removed.includes(item.id);
    controls.querySelector('[data-block-delete]').disabled=!item||hidden;
    controls.querySelector('[data-block-restore]').disabled=!item;
    controls.querySelector('[data-block-plain]').disabled=!item||hidden;
    controls.querySelector('[data-block-no-border]').disabled=!item||hidden;
    controls.querySelector('[data-block-no-background]').disabled=!item||hidden;
    controls.querySelector('[data-block-no-border]').checked=decor.border===false;
    controls.querySelector('[data-block-no-background]').checked=decor.background===false;
    controls.querySelector('.block-manager-note').textContent=!root?'本頁沒有說明區，請切到條文或圖文解說頁。':hidden?'這個區塊已刪除，可按「還原區塊」重新顯示。':'設定套用本頁目前的解說步驟；新增內容放在選取區塊後方。';
  }
  function select(id,format=true) {
    const item=list.find(value=>value.id===id);if(!item)return;
    selectedId=id;syncPanel();
    if(format&&!entry().removed.includes(id))window.generalRoadFormatting?.select(item.element.dataset.editKey||item.key);
  }
  function selectElement(element) {
    const block=element.closest('[data-content-block]');
    if(!block||!root?.contains(block))return;
    selectedId=block.dataset.contentBlock;syncPanel();
  }
  function refresh() {
    const viewport=window.generalRoadViewport;
    const views=new Map(context.api.editorFrames().map(frame=>[frame.key,viewport?.get(frame.element)?.read()]));
    context.api.refresh();
    for(const frame of context.api.editorFrames()) {
      const view=views.get(frame.key),controller=viewport?.get(frame.element);
      if(view&&controller){controller.start();controller.write(view);}
    }
  }
  function add(type=controls.querySelector('[data-block-type]').value) {
    if(!context.isEditing()||!root||!Object.hasOwn(types,type))return null;
    const id='note-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8));
    const note={id,type,title:type==='callout'?'補充提醒':'補充說明',body:'在此輸入補充說明。',after:current()?.id||null};
    entry(true).added.push(note);selectedId=id;context.changed();refresh();select(id);
    const item=current();
    item?.element.scrollIntoView({block:'nearest',behavior:'instant'});
    item?.element.querySelector('p')?.focus({preventScroll:true});
    return id;
  }
  function remove(id=selectedId) {
    if(!context.isEditing()||!list.some(item=>item.id===id))return;
    const value=entry(true);if(!value.removed.includes(id))value.removed.push(id);
    selectedId=id;context.changed();refresh();
  }
  function restore(id=selectedId) {
    if(!context.isEditing()||!list.some(item=>item.id===id))return;
    const value=entry(true);value.removed=value.removed.filter(item=>item!==id);delete value.decor[id];
    selectedId=id;context.changed();refresh();select(id);
  }
  function appearance(changes) {
    const item=current();if(!item||!context.isEditing())return;
    const value=entry(true),currentDecor=record(value.decor[item.id])?value.decor[item.id]:{};
    const next={...currentDecor};
    for(const [key,setting]of Object.entries(changes))if(setting===false)next[key]=false;else delete next[key];
    value.decor[item.id]=next;applyAppearance(item);context.changed();syncPanel();
  }
  function connect(value) {
    context=value;
    controls=document.createElement('fieldset');controls.className='block-manager';controls.dataset.editorUi='block-manager';
    controls.innerHTML='<legend>右側說明區塊</legend><label class="block-select-label">選取區塊<select data-block-select aria-label="選取右側說明區塊"></select></label><div class="block-appearance-options"><label><input type="checkbox" data-block-no-border>移除框線</label><label><input type="checkbox" data-block-no-background>移除底色</label></div><div class="block-manager-actions"><button type="button" data-block-plain>移除外框與底色</button><button type="button" data-block-delete>刪除整個區塊</button><button type="button" data-block-restore>還原區塊</button></div><div class="block-add-row"><select data-block-type aria-label="新增說明區塊版型"><option value="paragraph">一般說明</option><option value="callout">綠色提示框</option><option value="separator">分隔線</option></select><button type="button" data-block-add>新增</button></div><p class="block-manager-note"></p><small class="format-hint">編輯用的虛線在「完成編輯・預覽」後會隱藏。</small>';
    document.querySelector('.format-font-fields').before(controls);
    addButton=document.createElement('button');addButton.type='button';addButton.className='editor-add-explanation';addButton.textContent='新增說明';document.querySelector('.editor-format').after(addButton);
    addButton.addEventListener('click',()=>{window.generalRoadFormatting.setActive(true);add('paragraph');controls.scrollIntoView({block:'nearest'});});
    controls.addEventListener('change',event=>{
      if(event.target.matches('[data-block-select]'))select(event.target.value);
      if(event.target.matches('[data-block-no-border]'))appearance({border:event.target.checked?false:undefined});
      if(event.target.matches('[data-block-no-background]'))appearance({background:event.target.checked?false:undefined});
    });
    controls.addEventListener('click',event=>{
      if(event.target.closest('[data-block-add]'))add();
      if(event.target.closest('[data-block-delete]'))remove();
      if(event.target.closest('[data-block-restore]'))restore();
      if(event.target.closest('[data-block-plain]'))appearance({border:false,background:false});
    });
  }
  window.generalRoadBlocks={connect,render,select,selectElement,add,remove,restore,appearance,syncPanel,formatItems:()=>list.filter(item=>!entry().removed.includes(item.id)&&!item.element.dataset.editKey).map(item=>({key:item.key,kind:'block',element:item.element,label:'區塊｜'+item.label})),get items(){return list;},get selected(){return current();},get scope(){return scope;}};
})();
