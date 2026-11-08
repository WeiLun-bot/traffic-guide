(() => {
  'use strict';
  const Core = window.VisualLayoutCore;
  const records = new WeakMap(), active = new Map(), opened = new Set(), positions = new Map();
  let panelDrag=null;
  const selector = 'svg.interactive-viewport,img.interactive-viewport';
  const isEditing=()=>Boolean(window.generalRoadEditor?.editing||window.visualLayoutEditor?.editing);
  const number = value => String(Math.round(value * 1000) / 1000);
  function place(record) {
    if (record.panel.hidden) return;
    const panel=record.panel,rect=record.figure.getBoundingClientRect(),margin=12,width=Math.min(300,innerWidth-margin*2);
    panel.style.width=width+'px';panel.style.maxHeight=Math.max(100,innerHeight-margin*2)+'px';
    const saved=positions.get(record.id),height=panel.getBoundingClientRect().height,beside=rect.right+margin;
    const desired=saved||{x:beside+width<=innerWidth-margin?beside:rect.right-width,y:Math.min(Math.max(90,rect.top+42),Math.max(90,innerHeight-460))};
    const x=Math.max(margin,Math.min(innerWidth-width-margin,desired.x)),y=Math.max(margin,Math.min(Math.max(margin,innerHeight-height-margin),desired.y));
    panel.style.left=x+'px';panel.style.top=y+'px';
    if(saved)positions.set(record.id,{x,y});
  }
  function finishPanelDrag(cancel=false){
    if(!panelDrag)return;
    const current=panelDrag;panelDrag=null;
    current.record.panel.classList.remove('is-dragging');
    if(cancel){if(current.previous)positions.set(current.record.id,current.previous);else positions.delete(current.record.id);place(current.record);}
    try{current.handle.releasePointerCapture(current.pointerId);}catch{}
  }
  function movePanel(event){
    if(!panelDrag||event.pointerId!==panelDrag.pointerId)return;
    event.preventDefault();
    positions.set(panelDrag.record.id,{x:panelDrag.x+event.clientX-panelDrag.startX,y:panelDrag.y+event.clientY-panelDrag.startY});place(panelDrag.record);
  }
  document.addEventListener('pointermove',movePanel,{passive:false});
  document.addEventListener('pointerup',event=>{if(panelDrag?.pointerId===event.pointerId)finishPanelDrag();});
  document.addEventListener('pointercancel',event=>{if(panelDrag?.pointerId===event.pointerId)finishPanelDrag(true);});
  window.addEventListener('blur',()=>finishPanelDrag(true));
  function setting(record) { return record.preview || record.context.getConfig().imageViews[record.id] || Core.imageView(record.pageId, record.assetKey); }
  function fields(record) {
    const value = setting(record);
    for (const input of record.panel.querySelectorAll('[data-iv-field]')) {
      if (input !== document.activeElement) input.value = number(input.dataset.ivField === 'zoom' ? value.zoom * 100 : value[input.dataset.ivField] ?? 0);
      input.disabled = record.context.isBusy();
    }
    for (const button of record.panel.querySelectorAll('button')) button.disabled = record.context.isBusy();
  }
  function fittedHome(record,value){
    const base=Core.viewBoxFor(record.home,{...value,zoom:1,x:0,y:0,aspect:undefined}),ratio=record.svg.clientWidth/Math.max(1,record.svg.clientHeight);
    if(value.fit==='width'){const height=base[2]/ratio;base[1]+=(base[3]-height)/2;base[3]=height;}
    if(value.fit==='height'){const width=base[3]*ratio;base[0]+=(base[2]-width)/2;base[2]=width;}
    return base;
  }
  function rasterBase(record,value){
    const w=record.svg.clientWidth,h=record.svg.clientHeight,nw=record.svg.naturalWidth||w,nh=record.svg.naturalHeight||h,contain=Math.min(w/nw,h/nh),angle=(value.rotation||0)*Math.PI/180;
    const dw=(Math.abs(Math.cos(angle))*nw+Math.abs(Math.sin(angle))*nh)*contain,dh=(Math.abs(Math.sin(angle))*nw+Math.abs(Math.cos(angle))*nh)*contain;
    return {w,h,fit:value.fit==='width'?w/dw:value.fit==='height'?h/dh:value.fit==='all'?Math.min(w/dw,h/dh):1};
  }
  function apply(record, force = false) {
    const value = setting(record), signature = JSON.stringify(value);
    if(value.fit&&(!record.svg.clientWidth||!record.svg.clientHeight)){fields(record);return;}
    if (force || record.signature !== signature) {
      if(record.svg.matches('#main-map,.condition-detail')&&!record.context.getConfig().imageViews[record.id]&&!force){fields(record);return;}
      let view = Core.viewBoxFor(fittedHome(record,value), {...value,rotation:0});
      if(value.fit){
        record.svg.dataset.imageFitExplicit=value.fit;
        if(record.vector)record.svg.setAttribute('preserveAspectRatio','xMidYMid meet');
        else record.svg.style.objectFit='contain';
      }
      if (!record.vector){
        const {w,h,fit}=rasterBase(record,value),z=fit*value.zoom;
        record.controller.configure({imageRotation:value.rotation||0,flipX:value.flipX,flipY:value.flipY});
        const rasterView=[(w-w*z)/2+w*value.x/100,(h-h*z)/2+h*value.y/100,z];record.controller.configure({home:rasterView});record.controller.write(rasterView,false);record.signature=signature;fields(record);place(record);return;
      }
      if (value.rotation || value.flipX || value.flipY || record.rotationLayer) {
        if (!record.rotationLayer) {
          const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          layer.dataset.initialViewRotation = '';
          // Keep definitions/metadata at the root and rotate artwork and highlights together.
          for (const child of [...record.svg.children]) if (!['defs', 'title', 'desc', 'style', 'metadata'].includes(child.localName)) layer.append(child);
          record.svg.append(layer); record.rotationLayer = layer;
        }
        const [x, y, width, height] = record.home;
        const cx=x+width/2,cy=y+height/2;
        record.rotationLayer.setAttribute('transform', `rotate(${value.rotation ?? 0} ${cx} ${cy}) translate(${cx} ${cy}) scale(${value.flipX?-1:1} ${value.flipY?-1:1}) translate(${-cx} ${-cy})`);
      }
      record.controller.start();record.controller.configure(record.svg.closest('[data-zoom-steps]')?{home:record.home,resetView:view}:{home:view}); record.controller.write(view, false);
      record.signature = signature;
    }
    fields(record); place(record);
  }
  function close(record) {
    if(panelDrag?.record===record)finishPanelDrag();
    opened.delete(record.id); record.panel.hidden = true; record.button.setAttribute('aria-expanded', 'false');
  }
  function open(record) {
    if(window.PresentationMode?.readOnly||!isEditing()){record.context.report('請先開啟編輯模式，再設定初始畫面。');return;}
    if(window.generalRoadEditor?.adjusting){record.context.report('請先按「完成打亮調整」，再設定初始畫面。');return;}
    opened.add(record.id);
    record.context.prepare();
    const current = active.get(record.id);
    if (!current) return;
    current.panel.hidden = false; current.button.setAttribute('aria-expanded', 'true'); fields(current);current.panel.querySelector('[data-iv-parameters]').value=Core.cameraParameters(setting(current)); place(current);
  }
  function commit(record, patch) {
    if(window.PresentationMode?.readOnly||!isEditing())return false;
    if (record.context.isBusy()) return false;
    try {
      const next={...setting(record),...patch};record.preview=null;record.context.setView(next);
      const current = active.get(record.id); if (current) apply(current, true);
      status(current||record,'初始畫面已設定成功；請儲存設定以保存。');
      return true;
    } catch (error) { record.context.report(error.message, true); status(record,'設定失敗：'+error.message,true);fields(record); return false; }
  }
  function status(record,message,error=false){const node=record.panel.querySelector('.iv-status');if(node){node.textContent=message;node.dataset.error=String(error);place(record);}}
  function inherited(record,sourceId){
    const app=window.generalRoadPresentation,article=app.data.articles.find(a=>a.id===sourceId);
    if(!article||article.scenario!==app.page.scenario)throw new Error('找不到同一情境的解說');
    const zoom=record.pageId===app.page.id+'-zoom',pageId=article.id+(zoom?'-zoom':''),saved=record.context.getConfig().imageViews[Core.imageView(pageId,record.assetKey).id];
    if(saved)return Core.parseCameraParameters(Core.cameraParameters(saved));
    const defaults=Core.imageView(record.pageId,record.assetKey);
    return zoom?{...defaults,...Core.settingsForView(fittedHome(record,defaults),app.displayBounds(article.crop))}:defaults;
  }
  function create(svg, context, pageId, assetKey) {
    const figure = svg.closest('figure,.scenario-compare-card,.custom-image-frame,.cover-art')||svg.parentElement;
    let toolbar = figure?.querySelector('.map-toolbar .map-tools') || figure?.querySelector('.map-toolbar');
    if(figure&&!toolbar){toolbar=document.createElement('div');toolbar.className='viewport-initial-toolbar';toolbar.dataset.editorUi='initial-toolbar';figure.append(toolbar);}
    const controller = window.generalRoadViewport?.get(svg);
    if (!figure || !toolbar || !controller) return null;
    const id = Core.imageView(pageId, assetKey).id;
    const zoomStep=Boolean(svg.closest('[data-zoom-steps]'))&&pageId!==context.pageId;
    const heading=zoomStep?'設定放大範圍':'設定初始畫面';
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'iv-trigger'; button.textContent = (svg.dataset.comparisonSide==='before'?'現況圖 / ':svg.dataset.comparisonSide==='after'?'改善圖 / ':'')+heading;
    if(svg.dataset.comparisonSide)button.dataset.comparisonSide=svg.dataset.comparisonSide;
    button.dataset.editorUi = 'initial-view-toggle'; button.setAttribute('aria-expanded', 'false');
    const panel = document.createElement('section');
    panel.className = 'iv-panel'; panel.dataset.editorUi = 'initial-image-view'; panel.dataset.imageViewId = id;
    panel.setAttribute('aria-label', heading); panel.hidden = !opened.has(id);
    const note = pageId.startsWith('modules-concept-')?'只調整目前這個概念的初始畫面；各概念分別儲存，切換時會套用自己的縮放、位置與旋轉。':(pageId.startsWith('results-representative-')||pageId.startsWith('modules-topic-'))?'只調整這張總覽縮圖；不會連動其他圖例或模組詳細頁。儲存後重新開啟也會保留。':/^results-scenario-[gc][1-4]-\d{2}-strategy$/.test(pageId)||context.overviewAssetKey===assetKey
      ? `此設定會同步到${context.overviewAssetKey===assetKey?'模組':'情境'}總覽縮圖；儲存設定後，重新開啟也會保留。`
      : zoomStep?'儲存後，按「播放局部放大」會平順移到這個範圍。':'儲存後，切頁、重新開啟及重設視圖會使用這個初始畫面。';
    panel.innerHTML = `<div class="iv-heading"><strong class="iv-drag-handle" tabindex="0" role="button" aria-label="拖曳移動視窗；方向鍵微調，Home 回到預設位置" title="拖曳移動視窗；方向鍵微調，Home 回到預設位置">${heading}<span class="iv-drag-hint">拖曳移動</span></strong><button type="button" data-iv-action="close" aria-label="關閉初始畫面設定">×</button></div>
      <p>可調整旋轉角度，再在圖上縮放、拖曳並套用目前畫面，也可直接調整下方數值。</p>
      <div class="iv-fields"><label>初始縮放（%）<input type="number" data-iv-field="zoom" min="2" max="20000" step="1"></label><label>左右位置（%）<input type="number" data-iv-field="x" min="-1000" max="1000" step="0.1"></label><label>上下位置（%）<input type="number" data-iv-field="y" min="-1000" max="1000" step="0.1"></label></div>
      <div class="iv-fields iv-rotation"><label>旋轉角度（°）<input type="number" data-iv-field="rotation" min="-360" max="360" step="1"></label><button type="button" data-iv-action="rotate-left">左轉 90°</button><button type="button" data-iv-action="rotate-right">右轉 90°</button></div>
      <small>左右正值向右、上下正值向下；角度正值順時針。各頁與各圖分別保存。</small>
      <div class="iv-actions"><button type="button" data-iv-action="capture">套用目前畫面</button><button type="button" data-iv-action="reset">回到原始畫面</button><button type="button" data-iv-action="save">儲存設定</button></div>
      <p class="iv-note">${note}</p><details class="view-parameter-tools"><summary>複製、貼上或沿用視角</summary><textarea data-iv-parameters aria-label="初始畫面純文字參數" spellcheck="false"></textarea><div class="iv-actions"><button type="button" data-iv-action="copy">複製參數</button><button type="button" data-iv-action="paste">套用貼上參數</button></div><label class="view-inherit-label">沿用同情境、同圖面的其他解說<select data-iv-source aria-label="選擇要沿用視角的解說"></select></label><button type="button" data-iv-action="inherit">沿用所選解說</button></details>`;
    const sourceSelect=panel.querySelector('[data-iv-source]'),app=window.generalRoadPresentation,scene=app?.data.scenarios.find(s=>s.id===app.page.scenario);
    sourceSelect.add(new Option('選擇其他運用解說',''));
    for(const article of app?.data.articles||[])if(article.scenario===app.page.scenario&&article.id!==app.page.id&&(article.mapAsset||scene?.overall)===assetKey)sourceSelect.add(new Option(article.name,article.id));
    if(sourceSelect.options.length===1){sourceSelect.closest('label').hidden=true;panel.querySelector('[data-iv-action="inherit"]').hidden=true;}
    if(svg.id==='main-map'&&app?.page.article&&app.state.phase){
      const note=panel.querySelector('.iv-note');note.textContent='這是目前運用解說的初始畫面，與打亮框、放大範圍分開保存。已設定時優先使用此畫面；可按下方按鈕恢復沿用打亮的放大範圍。';
      const useCrop=document.createElement('button');useCrop.type='button';useCrop.dataset.ivAction='use-crop';useCrop.textContent='沿用打亮的放大範圍';note.after(useCrop);
    }
    const dialog=svg.closest('dialog');let triggerHost=toolbar;
    if(svg.dataset.comparisonSide){triggerHost=toolbar.querySelector('.comparison-initial-pair');if(!triggerHost){triggerHost=document.createElement('span');triggerHost.className='comparison-control-pair comparison-initial-pair';toolbar.append(triggerHost);}}
    triggerHost.insertBefore(button,svg.dataset.comparisonSide==='before'?triggerHost.querySelector('.iv-trigger[data-comparison-side="after"]'):null);(dialog||document.body).append(panel);
    const feedback=document.createElement('p');feedback.className='iv-status';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');panel.append(feedback);
    const vector=svg instanceof SVGSVGElement,asset=window.generalRoadPresentation?.data.embeddedAssets[assetKey],meta=window.generalRoadPresentation?.data.assetMeta[assetKey];
    let home=vector?controller.contentBounds:[0,0,svg.clientWidth||1,svg.clientHeight||1];
    if(vector&&asset&&svg.matches('#main-map,.scenario-detail-image,.compare-source-image,.condition-detail')){const swapped=[90,270].includes(meta?.rotation||0);home=[0,0,swapped?asset.height:asset.width,swapped?asset.width:asset.height];}
    const record = {id, pageId, assetKey, svg, figure, button, panel, controller, context, home, vector, signature: null,originalAspect:svg.getAttribute('preserveAspectRatio')};
    controller.configure({onImageAction(action){
      if(action==='initial'){open(record);return;}
      const current=setting(record);let patch;
      if(['all','width','height'].includes(action))patch={fit:action,zoom:1,x:0,y:0,aspect:undefined};
      else if(action==='reset'){
        patch={...Core.imageView(pageId,assetKey),fit:'all',flipX:false,flipY:false,aspect:undefined};
        const stage=svg.closest('.compare-stage');
        if(stage){
          const app=window.generalRoadPresentation,scene=app.data.scenarios.find(s=>s.id===app.page.scenario),side=svg.dataset.comparisonSide,offset=side==='before'?scene.currentConditions.beforeOffsetY||0:0;
          if(isEditing())window.generalRoadEditor.setComparisonTransform(stage.dataset.comparisonKey,side,{x:0,y:-offset/6.5,scaleX:1,scaleY:1,angle:0});
          svg.closest('.compare-manual-transform')?.setAttribute('transform',`translate(0 ${-offset})`);
          const outer=stage.querySelector('svg.compare-after');window.generalRoadViewport.get(outer)?.imageAction('all');
        }
      }
      else if(action==='flip-x'||action==='flip-y')patch=action==='flip-x'?{flipX:!current.flipX}:{flipY:!current.flipY};
      else if(action.startsWith('rotate-'))patch={rotation:((current.rotation+(action==='rotate-left'?-90:90)+540)%360)-180};
      if(patch){if(window.PresentationMode?.readOnly||!isEditing()){record.preview={...current,...patch};apply(record,true);}else commit(record,patch);}
    }});
    records.set(svg, record); active.set(id, record);
    dialog?.addEventListener('close',()=>close(record),{once:true});
    record.resizeObserver=new ResizeObserver(()=>{if(svg.isConnected&&active.get(id)===record&&setting(record).fit)apply(record,true);});record.resizeObserver.observe(svg);
    if(!vector)svg.addEventListener('load',()=>{if(active.get(id)===record)apply(record,true);});
    const display=document.createElement('div');display.className='iv-actions';display.innerHTML=[['all','全圖'],['width','全寬'],['height','全高'],['flip-x','水平翻轉'],['flip-y','垂直翻轉']].map(([action,label])=>`<button type="button" data-iv-display="${action}">${label}</button>`).join('');panel.querySelector('.iv-actions').before(display);
    display.addEventListener('click',event=>{const button=event.target.closest('[data-iv-display]');if(button){event.preventDefault();record.controller.imageAction(button.dataset.ivDisplay);}});
    const handle=panel.querySelector('.iv-drag-handle');
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||record.context.isBusy())return;
      event.preventDefault();event.stopPropagation();finishPanelDrag();
      const rect=panel.getBoundingClientRect();
      panelDrag={record,handle,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:rect.left,y:rect.top,previous:positions.get(id)};
      panel.classList.add('is-dragging');handle.focus({preventScroll:true});
      try{handle.setPointerCapture(event.pointerId);}catch{}
    });
    handle.addEventListener('lostpointercapture',event=>{if(panelDrag?.pointerId===event.pointerId)finishPanelDrag();});
    handle.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      if(event.key==='Home'){positions.delete(id);place(record);return;}
      const rect=panel.getBoundingClientRect(),step=event.shiftKey?30:10;
      positions.set(id,{x:rect.left+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),y:rect.top+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)});place(record);
    });

    button.addEventListener('click', event => {event.preventDefault();event.stopPropagation();if(!record.context.isBusy())record.panel.hidden ? open(record) : close(record);});
    panel.addEventListener('change', event => {
      const input = event.target.closest('[data-iv-field]'); if (!input) return;
      if (input.value.trim() === '') {fields(record);return;}
      const value = Number(input.value), key = input.dataset.ivField;
      if(!commit(record, {[key]: key === 'zoom' ? value / 100 : value}))event.preventDefault();
    });
    panel.addEventListener('click', event => {
      const target = event.target.closest('[data-iv-action]'); if (!target) return;
      event.preventDefault(); event.stopPropagation();
      const action = target.dataset.ivAction;
      if (action === 'close') {close(record);return;}
      if (record.context.isBusy()) return;
      if (action === 'save') {Promise.resolve(record.context.save()).then(()=>status(record,record.context.isDirty?.()?'設定尚未儲存，請再次儲存設定。':'初始畫面已儲存成功。')).catch(error=>status(record,'儲存失敗：'+error.message,true));return;}
      if(action==='copy'){
        const field=panel.querySelector('[data-iv-parameters]');field.value=Core.cameraParameters(setting(record));field.focus();field.select();
        navigator.clipboard?.writeText(field.value).catch(()=>{});status(record,'參數已列出並選取，可複製到另一圖面貼上。');return;
      }
      if(action==='paste'||action==='inherit'){
        try{
          const value=action==='paste'?Core.parseCameraParameters(panel.querySelector('[data-iv-parameters]').value):Core.parseCameraParameters(Core.cameraParameters(inherited(record,sourceSelect.value)));
          if(commit(record,value))panel.querySelector('[data-iv-parameters]').value=Core.cameraParameters(setting(record));
        }catch(error){status(record,'未套用：'+error.message,true);}return;
      }
      if(action==='use-crop'){
        close(record);record.preview=null;record.signature=null;
        if(record.rotationLayer)record.rotationLayer.setAttribute('transform','');
        if(record.originalAspect)record.svg.setAttribute('preserveAspectRatio',record.originalAspect);else record.svg.removeAttribute('preserveAspectRatio');delete record.svg.dataset.imageFitExplicit;
        record.context.clearView(record.id);return;
      }
      if (action === 'reset') {record.controller.imageAction('reset');return;}
      if (action === 'rotate-left' || action === 'rotate-right') {
        const angle = (setting(record).rotation ?? 0) + (action === 'rotate-left' ? -90 : 90);
        commit(record, {rotation: ((angle + 180) % 360 + 360) % 360 - 180});return;
      }
      if (action === 'capture') {
        try {
          record.controller.start();
          const value=setting(record),view=record.controller.read();
          const patch=record.vector?{aspect:undefined,...Core.settingsForView(fittedHome(record,value),view,0),rotation:value.rotation??0}:{zoom:view[2]/rasterBase(record,value).fit,x:(view[0]-(record.svg.clientWidth-record.svg.clientWidth*view[2])/2)/record.svg.clientWidth*100,y:(view[1]-(record.svg.clientHeight-record.svg.clientHeight*view[2])/2)/record.svg.clientHeight*100};
          commit(record,patch);
        }
        catch (error) {record.context.report(error.message, true);}
      }
    });
    panel.addEventListener('keydown', event => {if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(record);button.focus({preventScroll:true});}});
    button.setAttribute('aria-expanded', String(!panel.hidden));
    return record;
  }
  function mount(root, context) {
    for (const [id, record] of active) if (!record.svg.isConnected) {if(panelDrag?.record===record)finishPanelDrag(true);record.resizeObserver?.disconnect();record.panel.remove();active.delete(id);}
    for (const svg of root.querySelectorAll(selector)) {
      if(svg.matches('.compare-diagram'))continue;
      const app=window.generalRoadPresentation,scene=app?.data.scenarios.find(s=>s.id===app.page.scenario);
      const assetKey = svg.closest('[data-editor-image-key]')?.dataset.editorImageKey||(svg.id==='main-map'?app?.page.article?.mapAsset||scene?.overall:null);
      if (!assetKey) continue;
      const pageId=svg.closest('[data-initial-view-page]')?.dataset.initialViewPage||svg.closest('[data-module-source-page]')?.dataset.moduleSourcePage||(svg.id==='main-map'&&app?.state.phase?context.pageId+'-zoom':context.pageId);
      let record = records.get(svg);
      if(record&&(record.pageId!==pageId||record.assetKey!==assetKey)){
        record.resizeObserver?.disconnect();record.button.remove();record.panel.remove();
        if(record.rotationLayer){for(const child of [...record.rotationLayer.children])svg.insertBefore(child,record.rotationLayer);record.rotationLayer.remove();}
        if(record.originalAspect)svg.setAttribute('preserveAspectRatio',record.originalAspect);else svg.removeAttribute('preserveAspectRatio');delete svg.dataset.imageFitExplicit;
        active.delete(record.id);record=null;
      }
      if (!record) record = create(svg, context, pageId, assetKey);
      if (!record) continue;
      record.context = context; active.set(record.id, record);
      if(svg.id==='main-map'&&window.generalRoadEditor?.adjusting){if(record.rotationLayer)record.rotationLayer.setAttribute('transform','');record.signature=null;close(record);continue;}
      apply(record);
      if(!window.generalRoadEditor?.editing&&!window.visualLayoutEditor?.editing)close(record);
    }
  }
  window.addEventListener('resize', () => {for(const record of active.values())place(record);});
  document.addEventListener('scroll', () => {for(const record of active.values())place(record);}, true);
  window.VisualInitialViews = {
    mount,
    restore() {for(const record of active.values())apply(record, true);},
    close() {for(const record of active.values())close(record);},
    update() {for(const record of active.values())fields(record);},
    get isOpen() {return [...active.values()].some(record => !record.panel.hidden && record.svg.isConnected);}
  };
})();
