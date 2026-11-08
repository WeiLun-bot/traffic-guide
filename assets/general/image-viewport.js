(() => {
  'use strict';
  const controllers=new WeakMap();
  const pairedLayouts=new Map();
  const selector='#main-map,.cover-map,.custom-diagram,.scenario-detail-image,.condition-detail,#asset-view>svg,.custom-image-frame>img,.condition-photo-open>img';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  let pan=null;
  let suppressClick=null;
  function readView(svg) {return svg.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);}
  function alignPair(record) {
    if(!record.pair.isConnected)return;
    for(const [header,value,priority]of record.headers){if(value)header.style.setProperty('min-height',value,priority);else header.style.removeProperty('min-height');}
    const [first,second]=record.cards.map(card=>card.getBoundingClientRect());
    if(!second||Math.abs(first.left-second.left)<2)return;
    const height=Math.max(0,...record.headers.map(([header])=>header.offsetHeight));
    for(const [header]of record.headers)header.style.setProperty('min-height',height+'px');
  }
  function mountPairs(root) {
    for(const [pair,record]of pairedLayouts)if(!pair.isConnected){record.observer.disconnect();cancelAnimationFrame(record.frame);pairedLayouts.delete(pair);}
    for(const pair of root.querySelectorAll('.results-image-pair,.module-pair,.module-overview-grid,.custom-comparison-grid')){
      const cards=[...pair.children],images=cards.flatMap(card=>[...card.querySelectorAll('svg.scenario-detail-image,svg.custom-diagram,.custom-image-frame>img')]);
      if(images.length<2&&!pair.matches('.results-image-pair'))continue;
      for(const image of images){if(image.dataset.imageFitExplicit)continue;const contain=Boolean(image.closest('[data-image-fit="contain"]'));if(contain)delete image.dataset.pairCover;else image.dataset.pairCover='';if(image instanceof SVGSVGElement)image.setAttribute('preserveAspectRatio',contain?'xMidYMid meet':'xMidYMid slice');controllers.get(image)?.configure({fullLabel:contain?'完整圖面':'填滿圖框'});}
      if(pairedLayouts.has(pair))continue;
      const headers=cards.map(card=>card.querySelector('.map-toolbar,.custom-side-title')).filter(Boolean).map(header=>[header,header.style.getPropertyValue('min-height'),header.style.getPropertyPriority('min-height')]);
      const record={pair,cards,headers,frame:0};
      record.observer=new ResizeObserver(()=>{cancelAnimationFrame(record.frame);record.frame=requestAnimationFrame(()=>alignPair(record));});
      pairedLayouts.set(pair,record);alignPair(record);
      record.observer.observe(pair);for(const [header]of headers)record.observer.observe(header);
    }
  }
  function releasePan(cancel=false) {
    if(!pan)return;
    const finished=pan;pan=null;
    try{finished.controller.element.releasePointerCapture(finished.pointerId);}catch{}
    finished.controller.element.classList.remove('is-panning');
    if(cancel)finished.controller.write(finished.start);
    else if(finished.moved)suppressClick={element:finished.controller.element,until:performance.now()+450};
  }
  function attach(element,options={}) {
    let controller=controllers.get(element);
    if(controller) {controller.configure(options);return controller;}
    const vector=element instanceof SVGSVGElement;
    let home=vector?readView(element):[0,0,1];
    const contentBounds=[...home];
    let imageView=[0,0,1];
    let settings={};
    const container=element.closest('.map-canvas,.asset-view,.custom-image-frame,.cover-art')||element.parentElement;
    element.classList.add('interactive-viewport',vector?'viewport-svg':'viewport-image');
    element.setAttribute('draggable','false');
    element.setAttribute('title','滾輪連續縮放；按住滑鼠左鍵拖曳平移');
    if(!vector)element.style.transformOrigin='0 0';
    const tools=document.createElement('div');tools.className='viewport-tools viewport-tools-compact';tools.dataset.editorUi='viewport-controls';
    const percentage=document.createElement('span');percentage.className='viewport-percentage';percentage.textContent='100%';percentage.hidden=true;percentage.setAttribute('aria-label','目前縮放比例');
    const reset=document.createElement('button');reset.type='button';reset.textContent='↺';reset.setAttribute('aria-label','重設視圖');tools.append(percentage,reset);container.append(tools);
    if(element.matches('.compare-source-image'))tools.hidden=true;
    let displayOptions;
    // Shared viewport controllers also serve the results, modules and complex decks.
    // Their compact toolbars keep the original controls; this menu belongs to general roads.
    // The body deck marker updates after mounting, so use the destination page instead.
    if(window.generalRoadPresentation?.page?.deckId==='general'&&!element.matches('.compare-diagram')){
      displayOptions=document.createElement('details');displayOptions.className='viewport-display-options';displayOptions.dataset.editorUi='image-display';
      if(element.dataset.comparisonSide)displayOptions.dataset.comparisonSide=element.dataset.comparisonSide;
      const label=element.dataset.comparisonSide==='before'?'現況圖':element.dataset.comparisonSide==='after'?'改善圖':'圖面';
      displayOptions.innerHTML='<summary>'+label+'顯示 ▾</summary><div>'+[['reset','重設全圖'],['all','全圖'],['width','全寬'],['height','全高'],['rotate-left','左轉 90°'],['rotate-right','右轉 90°'],['flip-x','水平翻轉'],['flip-y','垂直翻轉']].map(([action,label])=>'<button type="button" data-viewport-action="'+action+'">'+label+'</button>').join('')+'</div>';
      const initialButton=document.createElement('button');initialButton.type='button';initialButton.dataset.viewportAction='initial';initialButton.textContent='設定初始畫面';if(!window.PresentationMode?.readOnly)displayOptions.lastElementChild.append(initialButton);
      const displayToolbar=element.closest('figure,.map-card')?.querySelector('.map-toolbar .map-tools')||element.closest('figure,.map-card')?.querySelector('.map-toolbar');
      if(displayToolbar){
        displayOptions.classList.add('is-toolbar-menu');let host=displayToolbar;
        if(element.dataset.comparisonSide){host=displayToolbar.querySelector('.comparison-display-pair');if(!host){host=document.createElement('span');host.className='comparison-control-pair comparison-display-pair';displayToolbar.append(host);}}
        host.insertBefore(displayOptions,element.dataset.comparisonSide==='before'?host.querySelector('.viewport-display-options[data-comparison-side="after"]'):null);
      }else container.append(displayOptions);
      displayOptions.addEventListener('click',event=>{const button=event.target.closest('[data-viewport-action]');if(!button)return;event.preventDefault();event.stopPropagation();controller.imageAction(button.dataset.viewportAction);});
    }
    const toolbar=element.matches('.compare-source-image')?null:container.closest('.map-card')?.querySelector('.map-toolbar .map-tools');
    let status,returnToFull;
    if(toolbar) {
      status=toolbar.querySelector('.map-status');
      if(!status){status=document.createElement('span');status.className='map-status';status.innerHTML='<i></i><span></span>';toolbar.prepend(status);}
      returnToFull=toolbar.querySelector('#peek-map');
      if(!returnToFull){returnToFull=document.createElement('button');returnToFull.type='button';returnToFull.dataset.viewportFull='';toolbar.append(returnToFull);}
      returnToFull.textContent='回看全圖 ↙';returnToFull.hidden=true;
      returnToFull.addEventListener('click',event=>{event.stopPropagation();controller.showFull();});
    }
    controller={
      element,
      read:()=>vector?readView(element):[...imageView],
      write(view,notify=true) {
        if(!view.every(Number.isFinite))return;
        if(vector)element.setAttribute('viewBox',view.join(' '));
        else {imageView=[...view];element.style.transform=`translate(${view[0]}px,${view[1]}px) scale(${view[2]}) translate(${element.clientWidth/2}px,${element.clientHeight/2}px) rotate(${settings.imageRotation||0}deg) scale(${settings.flipX?-1:1},${settings.flipY?-1:1}) translate(${-element.clientWidth/2}px,${-element.clientHeight/2}px)`;}
        controller.sync();
        if(notify)settings.onChange?.(controller.zoom);
      },
      configure(next) {
        settings={...settings,...next};
        if(next.home)home=[...next.home];
        if(next.resetView)settings.resetView=[...next.resetView];
        controller.sync();
      },
      sync() {
        percentage.textContent=(controller.zoom*100).toLocaleString('en-US',{maximumFractionDigits:1})+'%';
        reset.title='重設視圖（'+percentage.textContent+'）—'+(settings.resetView?'回到本步驟的預設視角':'回到全圖預設比例與位置');
        if(status){status.lastElementChild.textContent=controller.zoom>1+1e-6?'局部放大':controller.zoom<1?'縮小檢視':controller.partial?'位置已偏移':settings.fullLabel||'完整圖面';returnToFull.hidden=!controller.partial;}
        settings.onSync?.();
        element.dispatchEvent(new Event('viewportchange',{bubbles:true}));
      },
      get zoom() {return vector?home[2]/controller.read()[2]:imageView[2];},
      get partial() {
        const view=controller.read(),epsilon=vector?Math.max(home[2],home[3])*1e-6:1e-4;
        const dx=vector?view[0]+view[2]/2-home[0]-home[2]/2:view[0]-home[0];
        const dy=vector?view[1]+view[3]/2-home[1]-home[3]/2:view[1]-home[1];
        return controller.zoom>1+1e-6||Math.abs(dx)>epsilon||Math.abs(dy)>epsilon;
      },
      start() {settings.onStart?.();},
      get contentBounds(){return [...contentBounds];},
      imageAction(action){
        releasePan();controller.start();
        if(settings.onImageAction){settings.onImageAction(action);return;}
        if(vector){
          element.setAttribute('preserveAspectRatio','xMidYMid meet');
          let box=[...contentBounds],ratio=element.clientWidth/Math.max(1,element.clientHeight);
          if(action==='width'){const height=box[2]/ratio;box=[box[0],box[1]+(box[3]-height)/2,box[2],height];}
          if(action==='height'){const width=box[3]*ratio;box=[box[0]+(box[2]-width)/2,box[1],width,box[3]];}
          controller.write(box,false);
        }else controller.reset();
      },
      reset() {releasePan();controller.start();settings.onReset?.();controller.write(settings.resetView||home,false);},
      showFull() {releasePan();controller.start();settings.onFullView?.();controller.write(home,false);},
      enabled:()=>settings.enabled?.()!==false
    };
    controllers.set(element,controller);controller.configure(options);
    reset.addEventListener('click',event=>{event.stopPropagation();controller.reset();});
    element.addEventListener('wheel',event=>{
      if(event.ctrlKey||event.metaKey)return;
      if(!controller.enabled()||!event.deltaY)return;
      event.preventDefault();event.stopPropagation();
      releasePan();controller.start();
      const unit=event.deltaMode===1?16:event.deltaMode===2?element.clientHeight:1;
      const factor=Math.exp(clamp(event.deltaY*unit,-1800,1800)*.0015);
      const before=controller.read();
      if(vector) {
        const matrix=element.getScreenCTM();if(!matrix)return;
        const anchor=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
        const width=clamp(before[2]*factor,home[2]/200,home[2]/.02);
        const ratio=width/before[2];
        controller.write([anchor.x+(before[0]-anchor.x)*ratio,anchor.y+(before[1]-anchor.y)*ratio,width,before[3]*ratio]);
      } else {
        const rect=element.getBoundingClientRect();
        const scale=clamp(before[2]/factor,.02,200);
        const localX=(event.clientX-rect.left)/before[2],localY=(event.clientY-rect.top)/before[2];
        controller.write([before[0]+localX*(before[2]-scale),before[1]+localY*(before[2]-scale),scale]);
      }
    },{passive:false});
    element.addEventListener('pointerdown',event=>{
      if(!controller.enabled()||event.button!==0||event.pointerType==='touch'||event.target.closest('[data-handle],button,input,select,[contenteditable]'))return;
      event.preventDefault();releasePan();controller.start();
      const matrix=vector?element.getScreenCTM()?.inverse():null;
      if(vector&&!matrix)return;
      const startPoint=matrix?new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix):{x:event.clientX,y:event.clientY};
      pan={controller,vector,matrix,startPoint,start:controller.read(),screenX:event.clientX,screenY:event.clientY,pointerId:event.pointerId,moved:false};
      try{element.setPointerCapture(event.pointerId);}catch{}
    });
    element.addEventListener('dragstart',event=>event.preventDefault());
    return controller;
  }
  document.addEventListener('pointermove',event=>{
    if(!pan||event.pointerId!==pan.pointerId)return;
    if(!pan.controller.element.isConnected){releasePan();return;}
    if(!pan.moved&&Math.hypot(event.clientX-pan.screenX,event.clientY-pan.screenY)<3)return;
    event.preventDefault();pan.moved=true;pan.controller.element.classList.add('is-panning');
    const point=pan.matrix?new DOMPoint(event.clientX,event.clientY).matrixTransform(pan.matrix):{x:event.clientX,y:event.clientY};
    const dx=point.x-pan.startPoint.x,dy=point.y-pan.startPoint.y;
    pan.controller.write(pan.vector?[pan.start[0]-dx,pan.start[1]-dy,pan.start[2],pan.start[3]]:[pan.start[0]+dx,pan.start[1]+dy,pan.start[2]]);
  },{passive:false});
  document.addEventListener('pointerup',event=>{if(pan&&event.pointerId===pan.pointerId)releasePan();});
  document.addEventListener('pointercancel',event=>{if(pan&&event.pointerId===pan.pointerId)releasePan(true);});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&pan){event.preventDefault();event.stopImmediatePropagation();releasePan(true);}
  },true);
  document.addEventListener('click',event=>{
    if(!suppressClick)return;
    if(performance.now()>suppressClick.until){suppressClick=null;return;}
    if(suppressClick.element.contains(event.target)) {suppressClick=null;event.preventDefault();event.stopImmediatePropagation();}
  },true);
  window.generalRoadViewport={attach,mount(root=document){root.querySelectorAll(selector).forEach(element=>attach(element,element.matches('.compare-source-image')?{enabled:()=>false}:{}));mountPairs(root);},sync:element=>controllers.get(element)?.sync(),get:element=>controllers.get(element),cancel:()=>releasePan(true)};
})();
