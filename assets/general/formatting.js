(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const round=value=>Math.round(value*10)/10;
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clone=value=>JSON.parse(JSON.stringify(value??{}));
  const fonts={default:'',jhenghei:'"Microsoft JhengHei",sans-serif',sans:'"Noto Sans TC","Microsoft JhengHei",sans-serif',serif:'"Noto Serif TC","PMingLiU",serif',latin:'Lato,"Microsoft JhengHei",sans-serif'};
  const numeric={fontSize:[8,180],fontWeight:[100,900],lineHeight:[.8,3.5],letterSpacing:[-3,15],width:[5,100],height:[16,1800],split:[20,80],gap:[0,100]};
  const originals=new WeakMap(),applied=new WeakMap();
  let context,active=false,items=[],selectedKey='',panel,outline,grid=null,drag=null,resizeObserver=null;
  let scheduled=0;
  const state=()=>context.getState();
  const selected=()=>items.find(item=>item.key===selectedKey);
  const fields=()=>[...panel.querySelectorAll('[data-format-property]')];
  const validNumber=(value,property)=>Number.isFinite(value)&&numeric[property]&&value>=numeric[property][0]&&value<=numeric[property][1];
  function safeSettings(value,kind) {
    const result={};if(!value||typeof value!=='object')return result;
    for(const property of kind==='text'?['fontSize','fontWeight','lineHeight','letterSpacing','width','height']:['frame','block'].includes(kind)?['width','height']:['split','gap']) {
      if(validNumber(value[property],property))result[property]=value[property];
    }
    if(kind==='text') {
      if(['left','center','right','justify'].includes(value.textAlign))result.textAlign=value.textAlign;
      if(typeof value.color==='string'&&/^#[\da-f]{6}$/i.test(value.color))result.color=value.color;
      if(Object.hasOwn(fonts,value.fontFamily))result.fontFamily=value.fontFamily;
      if(['normal','italic'].includes(value.fontStyle))result.fontStyle=value.fontStyle;
    }
    return result;
  }
  function patch(element,values) {
    let original=originals.get(element);if(!original){original=new Map();originals.set(element,original);}
    for(const name of applied.get(element)||[]) {
      const saved=original.get(name);
      if(saved?.value)element.style.setProperty(name,saved.value,saved.priority);else element.style.removeProperty(name);
    }
    const names=new Set();
    for(const [name,value]of Object.entries(values)) {
      if(!original.has(name))original.set(name,{value:element.style.getPropertyValue(name),priority:element.style.getPropertyPriority(name)});
      element.style.setProperty(name,value);names.add(name);
    }
    applied.set(element,names);
  }
  function applyItem(item,override) {
    const value=safeSettings(override??(item.kind==='text'?state().styles[item.key]:state().frames[item.key]),item.kind);
    const css={};
    if(value.width!==undefined){css.width=value.width+'%';css['max-width']='100%';css['box-sizing']='border-box';if(item.kind==='text')css.display='block';}
    if(value.height!==undefined)css.height=value.height+'px';
    if(item.kind==='text') {
      if(value.fontSize!==undefined)css['font-size']=value.fontSize+'px';
      if(value.fontWeight!==undefined)css['font-weight']=String(value.fontWeight);
      if(value.lineHeight!==undefined)css['line-height']=String(value.lineHeight);
      if(value.letterSpacing!==undefined)css['letter-spacing']=value.letterSpacing+'px';
      if(value.color)css.color=value.color;
      if(value.textAlign)css['text-align']=value.textAlign;
      if(value.fontStyle)css['font-style']=value.fontStyle;
      if(value.fontFamily&&fonts[value.fontFamily])css['font-family']=fonts[value.fontFamily];
    }
    patch(item.element,css);
    item.element.classList.toggle('format-text-sized',item.kind==='text'&&(value.width!==undefined||value.height!==undefined));
    item.element.classList.toggle('format-text-height',item.kind==='text'&&value.height!==undefined);
    item.element.classList.toggle('format-frame-height',item.kind==='frame'&&value.height!==undefined);
    item.element.classList.toggle('format-frame-width',item.kind==='frame'&&value.width!==undefined);
    item.element.classList.toggle('format-block-height',item.kind==='block'&&value.height!==undefined);
    item.element.classList.toggle('format-block-width',item.kind==='block'&&value.width!==undefined);
  }
  function applyLayout(override) {
    if(!grid)return;
    const value=safeSettings(override??state().layouts[context.api.page.id],'layout');
    const css={};
    if(value.split!==undefined)css['grid-template-columns']=`minmax(0,${value.split}fr) minmax(0,${100-value.split}fr)`;
    if(value.gap!==undefined)css.gap=value.gap+'px';
    patch(grid,css);grid.classList.toggle('has-formatted-split',value.split!==undefined);
  }
  function tracks(element) {
    const style=getComputedStyle(element);
    if(style.display!=='grid')return [];
    const values=style.gridTemplateColumns.split(/\s+/).map(parseFloat);
    return values.length===2&&values.every(Number.isFinite)?values:[];
  }
  function referenceWidth(element) {
    const parent=element.parentElement,style=getComputedStyle(parent);
    const columns=tracks(parent);
    if(columns.length) {
      const flow=[...parent.children].filter(child=>getComputedStyle(child).position!=='absolute');
      const index=flow.indexOf(element);if(index>=0&&index<columns.length)return columns[index];
    }
    return Math.max(1,parent.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0));
  }
  function layoutValues() {
    if(!grid)return {split:50,gap:0,enabled:false};
    const columns=tracks(grid),value=safeSettings(state().layouts[context.api.page.id],'layout');
    return {split:value.split??(columns.length?columns[0]/(columns[0]+columns[1])*100:50),gap:value.gap??(parseFloat(getComputedStyle(grid).columnGap)||0),enabled:columns.length===2};
  }
  function colour(value) {
    const numbers=value.match(/[\d.]+/g);return numbers?.length>=3?'#'+numbers.slice(0,3).map(number=>Math.round(Number(number)).toString(16).padStart(2,'0')).join(''):'#233e36';
  }
  function syncPanel() {
    if(!panel)return;
    const item=selected();
    const style=item?getComputedStyle(item.element):null;
    const saved=item?safeSettings((item.kind==='text'?state().styles:state().frames)[item.key],item.kind):{};
    const visual=window.visualLayoutEditor?.fontOverrides(item?.element);if(visual?.fontFamily)saved.fontFamily=visual.fontFamily==='system'?'jhenghei':visual.fontFamily;
    const rect=item?.element.getBoundingClientRect();
    const values={fontSize:style?round(saved.fontSize??window.PresentationFontHeight?.baseFontSize(item.element)??parseFloat(style.fontSize)):16,fontWeight:style?Number(style.fontWeight)||400:400,lineHeight:style?round(parseFloat(style.lineHeight)/parseFloat(style.fontSize))||1.6:1.6,letterSpacing:style?parseFloat(style.letterSpacing)||0:0,textAlign:style?.textAlign||'left',fontFamily:saved.fontFamily||'default',fontStyle:style?.fontStyle||'normal',color:style?colour(style.color):'#233e36',width:item?round(saved.width??rect.width/referenceWidth(item.element)*100):100,height:round(rect?.height||0)};
    for(const property of ['fontSize','fontWeight','lineHeight'])if(Number.isFinite(visual?.[property]))values[property]=visual[property];
    if(values.textAlign==='start')values.textAlign='left';if(values.textAlign==='end')values.textAlign='right';
    for(const input of fields()) {
      if(document.activeElement===input)continue;
      const property=input.dataset.formatProperty;
      if(values[property]!==undefined)input.value=String(values[property]);
    }
    panel.querySelector('.format-font-fields').disabled=!item||item.kind!=='text';
    panel.querySelector('.format-size-fields').disabled=!item;
    panel.querySelector('[data-format-auto-height]').checked=saved.height===undefined;
    panel.querySelector('[data-format-object]').value=selectedKey;
    panel.querySelector('.format-selection-kind').textContent=item?(item.kind==='text'?'文字｜字體與文字框':item.kind==='block'?'說明區塊｜外框尺寸與外觀':'圖框｜外框尺寸'):'先點選文字或圖框';
    panel.querySelector('[data-format-reset-object]').disabled=!item;
    const layout=layoutValues();
    for(const input of panel.querySelectorAll('[data-format-layout]')) {
      input.disabled=!layout.enabled;
      if(document.activeElement!==input)input.value=String(round(layout[input.dataset.formatLayout]));
    }
    panel.querySelector('.format-split-note').textContent=layout.enabled?`左側 ${round(layout.split)}% / 右側 ${round(100-layout.split)}%`:'本頁為單欄，或窄螢幕採上下排列';
    updateOverlay();positionSplitter();measure();
  }
  function select(key) {
    if(!items.some(item=>item.key===key))return;
    selectedKey=key;
    resizeObserver?.disconnect();
    const item=selected();if(item)resizeObserver?.observe(item.element);
    if(item)window.generalRoadBlocks?.selectElement(item.element);
    syncPanel();
  }
  function measure() {document.body.style.setProperty('--format-space',active?panel.offsetHeight+'px':'0px');}
  function updateOverlay() {
    if(!outline)return;
    const item=selected();outline.hidden=!active||!item||!item.element.isConnected;
    if(outline.hidden)return;
    const rect=item.element.getBoundingClientRect(),main=$('presentation').getBoundingClientRect();
    if(!rect.width||!rect.height||rect.bottom<main.top||rect.top>main.bottom){outline.hidden=true;return;}
    Object.assign(outline.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',clipPath:`inset(${Math.max(0,main.top-rect.top)}px ${Math.max(0,rect.right-main.right)}px ${Math.max(0,rect.bottom-main.bottom)}px ${Math.max(0,main.left-rect.left)}px)`});
  }
  function positionSplitter() {
    const splitter=grid?.querySelector('.format-splitter');if(!splitter)return;
    const columns=tracks(grid);splitter.hidden=!active||columns.length!==2;
    if(splitter.hidden)return;
    const style=getComputedStyle(grid),value=layoutValues();
    splitter.style.left=((parseFloat(style.paddingLeft)||0)+columns[0]+value.gap/2)+'px';
    splitter.style.top=((parseFloat(style.paddingTop)||0)+8)+'px';splitter.style.bottom=((parseFloat(style.paddingBottom)||0)+8)+'px';
    splitter.setAttribute('aria-valuenow',String(round(value.split)));
  }
  function updateGeometry() {
    cancelAnimationFrame(scheduled);scheduled=requestAnimationFrame(()=>{updateOverlay();positionSplitter();measure();});
  }
  function render() {
    if(!context||!$('presentation').firstElementChild)return;
    const page=context.api.page;
    items=[...document.querySelectorAll('main [data-edit-key]')].filter(element=>!element.closest('.content-block-removed')).map(element=>({key:element.dataset.editKey,kind:'text',element,label:'文字｜'+(element.textContent.trim().slice(0,24)||'空白文字')}));
    document.querySelectorAll('main .map-card,main .cover-art,main .custom-image-frame').forEach((element,index)=>{
      const key=page.id+'|frame|'+index;element.dataset.formatFrame=key;items.push({key,kind:'frame',element,label:'圖框｜'+(index+1)});
    });
    items.push(...(window.generalRoadBlocks?.formatItems()||[]));
    for(const item of items)applyItem(item);
    grid=document.querySelector('main .map-layout,main .context-grid,main .cover,main .review,main .chapter-opening,main .custom-cover,main .custom-image-slide,main .custom-steps-layout,main .custom-comparison-grid');
    document.querySelectorAll('.format-splitter').forEach(element=>element.remove());
    applyLayout();
    if(active&&grid) {
      grid.classList.add('format-grid-anchor');
      const splitter=document.createElement('button');splitter.type='button';splitter.className='format-splitter';splitter.dataset.editorUi='format-splitter';splitter.setAttribute('role','separator');splitter.setAttribute('aria-orientation','vertical');splitter.setAttribute('aria-label','拖曳調整左右分割比例');splitter.setAttribute('aria-valuemin','20');splitter.setAttribute('aria-valuemax','80');splitter.title='左右拖曳調整畫面分割';grid.append(splitter);
    }
    panel.querySelector('[data-format-object]').innerHTML=items.map(item=>`<option value="${escape(item.key)}">${escape(item.label)}</option>`).join('');
    if(!items.some(item=>item.key===selectedKey))selectedKey=items.find(item=>item.element.id==='slide-title')?.key||items[0]?.key||'';
    if(active)select(selectedKey);else{outline.hidden=true;measure();}
  }
  function setActive(value) {
    if(!context)return;
    if(value&&window.visualLayoutEditor?.editing)window.visualLayoutEditor.setMode(false);
    value=Boolean(value&&context.isEditing());
    if(value&&!active)context.stopHighlighting();
    if(drag)finishDrag(true);
    active=value;document.body.classList.toggle('is-formatting',active);panel.hidden=!active;
    document.querySelector('.editor-format')?.setAttribute('aria-pressed',String(active));
    render();measure();
  }
  function saveObject(property,value) {
    const item=selected();if(!item)return;
    const collection=item.kind==='text'?state().styles:state().frames;
    const settings={...safeSettings(collection[item.key],item.kind)};
    if(value===undefined)delete settings[property];else settings[property]=value;
    collection[item.key]=settings;applyItem(item,settings);context.changed(false);window.visualLayoutEditor?.formatChanged(item.element,property);syncPanel();
  }
  function saveLayout(property,value) {
    if(!grid||!validNumber(value,property))return;
    state().layouts[context.api.page.id]={...safeSettings(state().layouts[context.api.page.id],'layout'),[property]:value};
    applyLayout();context.changed();syncPanel();
  }
  function resizeSettings(item,width,height,reference) {
    return {width:round(clamp(width/reference*100,5,100)),height:round(clamp(height,item.kind==='frame'?120:16,1800))};
  }
  function finishDrag(cancel=false) {
    if(!drag)return;
    const finished=drag;drag=null;document.body.classList.remove('is-format-resizing');
    try{finished.handle.releasePointerCapture(finished.pointerId);}catch{}
    if(finished.type==='split') {
      if(!cancel&&finished.moved){state().layouts[finished.pageId]={...finished.original,split:round(finished.value)};context.changed();}
      applyLayout();
    } else {
      if(!cancel&&finished.moved){const collection=finished.item.kind==='text'?state().styles:state().frames;collection[finished.item.key]={...finished.original,...finished.value};context.changed();}
      applyItem(finished.item);
    }
    syncPanel();
  }
  function connect(value) {
    context=value;
    panel=document.createElement('aside');panel.id='format-panel';panel.className='format-panel';panel.dataset.editorUi='format-panel';panel.hidden=true;panel.setAttribute('aria-label','版面與字體調整');
    panel.innerHTML=`<div class="format-panel-head"><div><strong>版面與字體</strong><small>點選文字或圖框後調整</small></div><button type="button" data-format-close aria-label="關閉版面與字體">×</button></div><label class="format-object-label">選取物件<select data-format-object aria-label="選取要調整的物件"></select></label><p class="format-selection-kind"></p><fieldset class="format-font-fields"><legend>文字樣式</legend><div class="format-control-grid"><label title="以 1920×1080、Windows 125%、瀏覽器 100% 為基準">基準字級 px<input type="number" min="8" max="180" step="1" data-format-property="fontSize"></label><label>粗細<select data-format-property="fontWeight">${[100,200,300,400,500,600,700,800,900].map(weight=>`<option value="${weight}">${weight}${weight===400?' 一般':weight===700?' 粗體':''}</option>`).join('')}</select></label><label>行距倍數<input type="number" min="0.8" max="3.5" step="0.1" data-format-property="lineHeight"></label><label>字距 px<input type="number" min="-3" max="15" step="0.1" data-format-property="letterSpacing"></label><label>對齊<select data-format-property="textAlign"><option value="left">靠左</option><option value="center">置中</option><option value="right">靠右</option><option value="justify">左右對齊</option></select></label><label>顏色<input type="color" data-format-property="color"></label><label>字型<select data-format-property="fontFamily"><option value="default">版型預設</option><option value="jhenghei">微軟正黑體</option><option value="sans">無襯線黑體</option><option value="serif">明體</option><option value="latin">Lato</option></select></label><label>樣式<select data-format-property="fontStyle"><option value="normal">正常</option><option value="italic">斜體</option></select></label></div></fieldset><fieldset class="format-size-fields"><legend>物件尺寸</legend><div class="format-control-grid"><label>寬度 %<input type="number" min="5" max="100" step="1" data-format-property="width"></label><label>高度 px<input type="number" min="16" max="1800" step="1" data-format-property="height"></label></div><label class="format-auto-height"><input type="checkbox" data-format-auto-height>高度自動隨內容調整</label><small class="format-hint">也可拖曳選取框的右下角改尺寸。</small></fieldset><fieldset><legend>畫面分割</legend><label class="format-split-range">左側比例<input type="range" min="20" max="80" step="0.1" data-format-layout="split"></label><div class="format-control-grid"><label>左側 %<input type="number" min="20" max="80" step="1" data-format-layout="split"></label><label>欄間距 px<input type="number" min="0" max="100" step="1" data-format-layout="gap"></label></div><p class="format-split-note"></p><small class="format-hint">可直接拖曳圖文之間的分隔線。</small></fieldset><div class="format-reset-actions"><button type="button" data-format-reset-object>還原此物件樣式</button><button type="button" data-format-reset-layout>還原本頁分割</button></div><p class="format-save-note">調整會一起保存到「下載 HTML」。圖框尺寸與分割比例套用本頁所有步驟；文字樣式依解說步驟保存。</p>`;
    $('editor-toolbar').after(panel);
    outline=document.createElement('div');outline.className='format-selection';outline.dataset.editorUi='format-selection';outline.hidden=true;outline.innerHTML='<button type="button" class="format-resize-handle" data-format-resize aria-label="拖曳調整物件大小" title="拖曳調整物件寬高；方向鍵可微調"></button>';document.body.append(outline);
    resizeObserver=new ResizeObserver(updateGeometry);new ResizeObserver(measure).observe(panel);
    document.querySelector('.editor-format').addEventListener('click',()=>setActive(!active));
    panel.addEventListener('click',event=>{
      if(event.target.closest('[data-format-close]')){setActive(false);return;}
      const item=selected();
      if(event.target.closest('[data-format-reset-object]')&&item){delete(item.kind==='text'?state().styles:state().frames)[item.key];applyItem(item);context.changed(false);window.visualLayoutEditor?.resetTextStyle(item.element);syncPanel();}
      if(event.target.closest('[data-format-reset-layout]')){delete state().layouts[context.api.page.id];applyLayout();context.changed();syncPanel();}
    });
    panel.addEventListener('change',event=>{
      if(event.target.matches('[data-format-object]'))select(event.target.value);
      if(event.target.matches('[data-format-auto-height]'))saveObject('height',event.target.checked?undefined:round(selected().element.getBoundingClientRect().height));
    });
    panel.addEventListener('input',event=>{
      const input=event.target,property=input.dataset.formatProperty,layout=input.dataset.formatLayout;
      if(layout){if(input.value!=='')saveLayout(layout,Number(input.value));return;}
      if(!property)return;
      if(numeric[property]){if(input.value===''){saveObject(property,undefined);return;}const number=Number(input.value);if(validNumber(number,property))saveObject(property,number);}
      else saveObject(property,input.value);
    });
    window.addEventListener('resize',updateGeometry);document.addEventListener('scroll',updateGeometry,true);
  }
  document.addEventListener('pointerdown',event=>{
    if(!active||event.button!==0)return;
    const handle=event.target.closest('[data-format-resize],.format-splitter');
    if(handle) {
      event.preventDefault();event.stopImmediatePropagation();
      if(handle.matches('.format-splitter')) {
        const style=getComputedStyle(grid),current=layoutValues();
        const available=grid.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0)-current.gap;
        drag={type:'split',handle,pointerId:event.pointerId,x:event.clientX,start:current.split,value:current.split,available,pageId:context.api.page.id,original:clone(state().layouts[context.api.page.id]),moved:false};
      } else {
        const item=selected();if(!item)return;const rect=item.element.getBoundingClientRect();
        drag={type:'size',handle,pointerId:event.pointerId,x:event.clientX,y:event.clientY,width:rect.width,height:rect.height,reference:referenceWidth(item.element),item,original:clone((item.kind==='text'?state().styles:state().frames)[item.key]),moved:false};
      }
      document.body.classList.add('is-format-resizing');try{handle.setPointerCapture(event.pointerId);}catch{}return;
    }
    if(event.target.closest('[data-editor-ui],button,input,select'))return;
    const text=event.target.closest('main [data-edit-key]'),frame=event.target.closest('main [data-format-frame]'),block=event.target.closest('main [data-format-block]');
    if(text)select(text.dataset.editKey);else if(block)select(block.dataset.formatBlock);else if(frame)select(frame.dataset.formatFrame);
  },true);
  document.addEventListener('click',event=>{
    if(!active||event.target.closest('[data-editor-ui],button,input,select'))return;
    const text=event.target.closest('main [data-edit-key]'),frame=event.target.closest('main [data-format-frame]'),block=event.target.closest('main [data-format-block]');
    if(text)select(text.dataset.editKey);
    else if(block){select(block.dataset.formatBlock);event.preventDefault();event.stopImmediatePropagation();}
    else if(frame){select(frame.dataset.formatFrame);event.preventDefault();event.stopImmediatePropagation();}
  },true);
  document.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    event.preventDefault();drag.moved=true;
    if(drag.type==='split') {
      drag.value=clamp(drag.start+(event.clientX-drag.x)/Math.max(1,drag.available)*100,20,80);applyLayout({...drag.original,split:drag.value});
      panel.querySelectorAll('[data-format-layout="split"]').forEach(input=>input.value=String(round(drag.value)));
    } else {
      drag.value=resizeSettings(drag.item,drag.width+event.clientX-drag.x,drag.height+event.clientY-drag.y,drag.reference);applyItem(drag.item,{...drag.original,...drag.value});
      for(const [property,value]of Object.entries(drag.value))panel.querySelector(`[data-format-property="${property}"]`).value=String(value);
    }
    updateOverlay();positionSplitter();
  },{passive:false});
  document.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.pointerId)finishDrag();});
  document.addEventListener('pointercancel',event=>{if(drag&&event.pointerId===drag.pointerId)finishDrag(true);});
  document.addEventListener('keydown',event=>{
    if(!active)return;
    if(event.key==='Escape'&&drag){event.preventDefault();event.stopImmediatePropagation();finishDrag(true);return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    const step=event.shiftKey?10:1;
    if(event.target.matches('.format-splitter')){event.preventDefault();event.stopImmediatePropagation();saveLayout('split',clamp(layoutValues().split+(['ArrowLeft','ArrowDown'].includes(event.key)?-step:step),20,80));}
    else if(event.target.matches('[data-format-resize]')) {
      event.preventDefault();event.stopImmediatePropagation();const item=selected();if(!item)return;const rect=item.element.getBoundingClientRect();
      const value=resizeSettings(item,rect.width+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),rect.height+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0),referenceWidth(item.element));
      const collection=item.kind==='text'?state().styles:state().frames;collection[item.key]={...safeSettings(collection[item.key],item.kind),...value};applyItem(item);context.changed();syncPanel();
    }
  },true);
  window.generalRoadFormatting={connect,render,setActive,select,setLayout:saveLayout,get layout(){return layoutValues();},get active(){return active;},get selected(){return selected();}};
})();
