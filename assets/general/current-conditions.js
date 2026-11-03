
(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const positions=new Map();
  const manualSessions=new Map();
  let resizeObserver;
  function prepare(data) {
    for(const asset of Object.values(data.embeddedAssets))if(asset.sourceAsset)asset.url=data.embeddedAssets[asset.sourceAsset].url;
  }
  function orientation(asset,rotation) {
    const swapped=rotation===90||rotation===270;
    const transform=rotation===90?`translate(${asset.height} 0) rotate(90)`:rotation===180?`translate(${asset.width} ${asset.height}) rotate(180)`:rotation===270?`translate(0 ${asset.width}) rotate(270)`:'';
    return {width:swapped?asset.height:asset.width,height:swapped?asset.width:asset.height,transform};
  }
  function diagram(data,key,className,view,fit='meet') {
    const asset=data.embeddedAssets[key],rotation=data.assetMeta[key]?.rotation||0;
    const oriented=orientation(asset,rotation);
    return `<svg class="${className}" viewBox="${view||`0 0 ${oriented.width} ${oriented.height}`}" preserveAspectRatio="xMidYMid ${fit}" role="img" aria-label="${esc(data.assetMeta[key]?.label)}"><g transform="${oriented.transform}"><image href="${asset.url}" width="${asset.width}" height="${asset.height}"/></g></svg>`;
  }
  function transform(value,offsetY=0) {
    return `translate(${value.x*10} ${value.y*6.5}) translate(500 ${325+offsetY}) rotate(${value.angle}) scale(${value.scaleX} ${value.scaleY}) translate(-500 ${-325-offsetY})`;
  }
  function layer(data,key,position,offsetY=0,value={x:0,y:0,scaleX:1,scaleY:1,angle:0}) {
    const asset=data.embeddedAssets[key],oriented=orientation(asset,data.assetMeta[key]?.rotation||0);
    return `<svg class="compare-diagram compare-${position}" viewBox="0 0 1000 650" role="img" aria-label="${position==='before'?'現況圖':'改善設置示意'}"><g class="compare-manual-transform" transform="${transform(value,offsetY)}"><g class="compare-registration" transform="translate(0 ${offsetY})"><svg x="0" y="0" width="1000" height="650" viewBox="0 0 ${oriented.width} ${oriented.height}" preserveAspectRatio="xMidYMid meet"><g transform="${oriented.transform}"><image href="${asset.url}" width="${asset.width}" height="${asset.height}"/></g></svg></g></g></svg>`;
  }
  function photoImage(data,photo) {
    const replacement=window.generalRoadEditor?.state.images[photo.editKey||photo.image]?.src;
    if(photo.kind==='detail'&&!replacement)return diagram(data,photo.image,'condition-detail',photo.crop.join(' '));
    return `<img src="${replacement||data.embeddedAssets[photo.image].url}" alt="${esc(photo.alt||photo.title)}" draggable="false">`;
  }
  function transformEditor(){
    return `<details class="compare-transform-editor" data-editor-ui="comparison-transform"><summary>微調圖面對齊 <span>位置・大小・旋轉</span></summary><div class="compare-transform-body"><div class="compare-transform-top"><label>調整對象<select data-compare-target aria-label="選擇要調整的圖"><option value="before">現況圖</option><option value="after">改善示意圖</option></select></label><label class="compare-transform-check"><input type="checkbox" data-compare-lock checked>等比縮放</label></div><label class="compare-transform-check compare-direct-control"><input type="checkbox" data-compare-direct>在圖上拖曳移動、滾輪調整大小</label><div class="compare-transform-fields">${[['x','左右位置 %',.1,-1000,1000],['y','上下位置 %',.1,-1000,1000],['scaleX','寬度 %',.1,5,2000],['scaleY','高度 %',.1,5,2000],['angle','旋轉角度 °',.1,-3600,3600]].map(([key,label,step,min,max])=>`<label>${label}<input type="number" data-compare-transform="${key}" step="${step}" min="${min}" max="${max}" aria-label="${label}"></label>`).join('')}<label class="compare-angle-range">旋轉滑桿<input type="range" data-compare-angle-slider min="-180" max="180" step="0.1" value="0" aria-label="連續調整旋轉角度"></label></div><div class="compare-transform-actions"><button type="button" data-compare-rotate="-90">左轉 90°</button><button type="button" data-compare-rotate="90">右轉 90°</button><button type="button" data-compare-reset>還原這張圖</button></div><small class="compare-transform-note">向右、向下、順時針為正值。調整後請儲存 JSON 設定。</small></div></details>`;
  }
  function textKey(item,name){
    if(item.textKey)return ` data-block-edit-key="${esc(item.textKey+':'+name)}"`;
    // Keep the original text IDs when removing the comparison and its hidden heading.
    const fields=item.photos.flatMap(photo=>['photo:'+photo.image+':title',...photo.points.map((_,index)=>'photo:'+photo.image+':point-'+index)]).concat('source','takeaway');
    const index=fields.indexOf(name);
    return index<0?'':` data-block-edit-key="${esc(item.pageId+'|0|text-'+(index+3))}"`;
  }
  function comparison(scene,data) {
    const item=scene.currentConditions,editor=window.generalRoadEditor;
    return `<figure class="map-card conditions-comparison" style="margin:0"><div class="map-toolbar"><div class="map-tools"><span class="compare-help">拖曳中線，左右比較</span><button type="button" data-asset="${item.before}">現況原圖 ↗</button><button type="button" data-asset="${item.after}">改善原圖 ↗</button></div></div><div class="map-canvas compare-stage" data-comparison-key="${esc(item.pageId)}" data-compare-default="0" style="--compare-position:0%">${layer(data,item.after,'after',0,editor.getComparisonTransform(item.pageId,'after'))}<div class="compare-before-wrap">${layer(data,item.before,'before',item.beforeOffsetY||0,editor.getComparisonTransform(item.pageId,'before'))}</div><span class="compare-label compare-label-before">BEFORE <b>現況圖</b></span><span class="compare-label compare-label-after">AFTER <b>改善示意</b></span><div class="compare-divider" aria-hidden="true"></div><button type="button" class="compare-handle" aria-label="拖曳比較現況與改善圖" title="左右拖曳比較；也可使用下方滑桿"><span aria-hidden="true">‹　›</span></button></div><div class="compare-controls"><div class="compare-presets"><button type="button" data-compare-position="100">看現況</button><button type="button" data-compare-position="50">左右對照</button><button type="button" data-compare-position="0">看改善</button></div><label class="compare-range-label"><span>改善</span><input class="compare-range" type="range" min="0" max="100" step="0.1" value="0" aria-label="現況圖顯示比例"><span>現況</span><output class="compare-percent">改善前 0% / 改善後 100%</output></label><div class="compare-edit-controls" data-editor-ui="condition-images"><button type="button" data-replace-image="${item.before}">更換現況圖</button><button type="button" data-replace-image="${item.after}">更換改善圖</button></div>${editor.editing?transformEditor():''}</div><figcaption class="map-foot"><span>圖面尺度依原稿呈現，供設置前後示意比較。</span><span>滾輪縮放 · 左鍵拖曳平移</span></figcaption></figure>`;
  }
  function currentFigure(scene,data) {
    const item=scene.currentConditions;
    return `<figure class="map-card conditions-current-figure" style="margin:0"><div class="map-toolbar"><strong>現況圖</strong><div class="map-tools"><button type="button" data-asset="${item.before}">現況原圖 ↗</button></div></div><div class="map-canvas conditions-current-canvas" data-editor-image-key="${item.before}">${diagram(data,item.before,'scenario-detail-image conditions-current-diagram',undefined,'slice')}</div><figcaption class="map-foot"><span>現況圖依原稿呈現。</span><span>滾輪縮放 · 左鍵拖曳平移</span></figcaption></figure>`;
  }
  function render(scene,data) {
    const item=scene.currentConditions;
    return `<section class="slide conditions-slide conditions-current-slide" aria-labelledby="slide-title"><div class="map-heading conditions-heading"><div><span class="eyebrow">${scene.code} / CURRENT CONDITIONS</span><h1 id="slide-title">現況問題</h1></div><p>${scene.name}</p></div><div class="map-layout conditions-layout">${currentFigure(scene,data)}<aside class="conditions-issues context-issues" aria-label="現況照片與問題">${item.photos.map((photo,index)=>`<article class="issue-row condition-issue" data-photo-index="${index}"><div class="condition-card-heading"><span>${String(index+1).padStart(2,'0')}</span><h3${textKey(item,`photo:${photo.image}:title`)}>${esc(photo.title)}</h3></div><div class="condition-photo custom-image-frame" data-editor-image-key="${photo.editKey||photo.image}" data-editor-default-image-key="${photo.image}"><button class="condition-photo-open" type="button" data-asset="${photo.image}" aria-label="放大查看${esc(photo.title)}">${photoImage(data,photo)}<span class="condition-photo-caption">${photo.kind==='detail'?'現況圖局部':'現況照片'} ↗</span></button></div><div class="condition-points">${photo.points.map((point,pointIndex)=>`<p${textKey(item,`photo:${photo.image}:point-${pointIndex}`)}>${esc(point)}</p>`).join('')}</div></article>`).join('')}<p class="conditions-source"${textKey(item,'source')}>${esc(item.sourceNote)}</p></aside></div><div class="conditions-bottom"><p${textKey(item,'takeaway')}>${esc(item.takeaway)}</p><button type="button" class="text-button" data-page="${scene.overviewId}">看整體佈設策略 ↗</button></div></section>`;
  }
  function mount(root=document) {
    const stage=root.querySelector('.compare-stage');if(!stage){resizeObserver?.disconnect();return;}if(stage.dataset.comparisonMounted)return;
    stage.dataset.comparisonMounted='true';
    const page=window.generalRoadPresentation.page.id,key=stage.dataset.comparisonKey||page,slide=stage.closest('.slide'),range=slide.querySelector('.compare-range');
    const handle=stage.querySelector('.compare-handle'),before=stage.querySelector('svg.compare-before'),after=stage.querySelector('svg.compare-after');
    stage.dataset.buildingAligned='false';
    const update=value=>{
      value=Math.max(0,Math.min(100,Number(value)));if(!Number.isFinite(value))return;
      positions.set(page,value);stage.style.setProperty('--compare-position',value+'%');range.value=String(value);
      range.setAttribute('aria-valuetext',`現況 ${Math.round(value)}%，改善 ${Math.round(100-value)}%`);
      slide.querySelector('.compare-percent').textContent=`改善前 ${Math.round(value)}% / 改善後 ${Math.round(100-value)}%`;
      slide.querySelectorAll('[data-compare-position]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.comparePosition)===value)));
      stage.classList.toggle('compare-only-after',value===0);stage.classList.toggle('compare-only-before',value===100);
    };
    update(positions.get(page)??Number(stage.dataset.compareDefault));
    range.addEventListener('input',()=>update(range.value));
    slide.querySelectorAll('[data-compare-position]').forEach(button=>button.addEventListener('click',()=>update(button.dataset.comparePosition)));
    const pointerValue=event=>{const rect=stage.getBoundingClientRect();return (event.clientX-rect.left)/rect.width*100;};
    let drag=null;
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();event.stopPropagation();drag={id:event.pointerId,value:Number(range.value)};
      try{handle.setPointerCapture(event.pointerId);}catch{}stage.classList.add('is-comparing');
    });
    handle.addEventListener('pointermove',event=>{if(drag&&drag.id===event.pointerId){event.preventDefault();update(pointerValue(event));}});
    const finish=(event,cancel)=>{if(!drag||event.pointerId!==drag.id)return;if(cancel)update(drag.value);drag=null;stage.classList.remove('is-comparing');try{handle.releasePointerCapture(event.pointerId);}catch{}};
    handle.addEventListener('pointerup',event=>finish(event,false));handle.addEventListener('pointercancel',event=>finish(event,true));
    handle.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      update(event.key==='Home'?0:event.key==='End'?100:Number(range.value)+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?10:1));
    });
    const sync=()=>before.setAttribute('viewBox',after.getAttribute('viewBox'));
    const home=()=>{const height=1000*stage.clientHeight/Math.max(1,stage.clientWidth);return [0,(650-height)/2,1000,height];};
    const initial=home();after.setAttribute('viewBox',initial.join(' '));
    const controller=window.generalRoadViewport?.attach(after,{home:initial,onSync:sync,enabled:()=>!manualActive()});
    resizeObserver?.disconnect();
    const observer=new ResizeObserver(()=>{
      if(!stage.isConnected){observer.disconnect();return;}
      const view=controller.read(),height=view[2]*stage.clientHeight/Math.max(1,stage.clientWidth);
      controller.configure({home:home()});controller.write([view[0],view[1]+(view[3]-height)/2,view[2],height]);
    });resizeObserver=observer;observer.observe(stage);
    sync();
    const editor=window.generalRoadEditor,item=window.generalRoadPresentation.data.scenarios.find(scene=>scene.id===window.generalRoadPresentation.page.scenario).currentConditions;
    const panel=slide.querySelector('.compare-transform-editor');if(!panel)return;
    const target=panel.querySelector('[data-compare-target]'),direct=panel.querySelector('[data-compare-direct]'),lock=panel.querySelector('[data-compare-lock]');
    const session=manualSessions.get(page)||{side:'before',open:false};target.value=session.side;panel.open=session.open;
    function manualActive(){return Boolean(window.generalRoadEditor?.editing&&slide.querySelector('[data-compare-direct]')?.checked);}
    const value=()=>editor.getComparisonTransform(key,target.value);
    function updateFields(){
      const current=value();
      panel.querySelectorAll('[data-compare-transform]').forEach(input=>{if(document.activeElement!==input){const key=input.dataset.compareTransform;input.value=String(Math.round(current[key]*(key.startsWith('scale')?100:1)*1000)/1000);}});
      const angleSlider=panel.querySelector('[data-compare-angle-slider]');if(document.activeElement!==angleSlider)angleSlider.value=String(((current.angle+180)%360+360)%360-180);
      stage.classList.toggle('is-manual-aligning',manualActive());
    }
    function apply(patch){
      const current=editor.setComparisonTransform(key,target.value,patch);if(!current)return;
      const offset=target.value==='before'?item.beforeOffsetY||0:0;
      stage.querySelector(`svg.compare-${target.value}>.compare-manual-transform`).setAttribute('transform',transform(current,offset));updateFields();
    }
    panel.addEventListener('toggle',()=>{session.open=panel.open;manualSessions.set(page,session);});
    target.addEventListener('change',()=>{session.side=target.value;manualSessions.set(page,session);updateFields();});
    direct.addEventListener('change',updateFields);
    panel.querySelectorAll('[data-compare-transform]').forEach(input=>{input.addEventListener('blur',updateFields);input.addEventListener('input',()=>{
      if(!editor.editing||input.value.trim()==='')return;
      const number=Number(input.value);if(!Number.isFinite(number))return;
      const key=input.dataset.compareTransform,current=value(),next=key.startsWith('scale')?number/100:number,patch={[key]:next};
      if(lock.checked&&key.startsWith('scale')&&next>0){const other=key==='scaleX'?'scaleY':'scaleX';patch[other]=current[other]*next/current[key];}
      apply(patch);
    });});
    panel.querySelector('[data-compare-angle-slider]').addEventListener('input',event=>apply({angle:Number(event.target.value)}));
    panel.querySelectorAll('[data-compare-rotate]').forEach(button=>button.addEventListener('click',()=>apply({angle:value().angle+Number(button.dataset.compareRotate)})));
    panel.querySelector('[data-compare-reset]').addEventListener('click',()=>apply(null));
    let imageDrag=null;
    const point=event=>new DOMPoint(event.clientX,event.clientY).matrixTransform(after.getScreenCTM().inverse());
    after.addEventListener('pointerdown',event=>{
      if(!manualActive()||event.button!==0)return;
      event.preventDefault();event.stopPropagation();imageDrag={id:event.pointerId,point:point(event),value:value(),side:target.value};
      try{after.setPointerCapture(event.pointerId);}catch{}
    });
    after.addEventListener('pointermove',event=>{
      if(!imageDrag||event.pointerId!==imageDrag.id)return;
      if(!manualActive()||imageDrag.side!==target.value){imageDrag=null;return;}
      event.preventDefault();const current=point(event);apply({x:imageDrag.value.x+(current.x-imageDrag.point.x)/10,y:imageDrag.value.y+(current.y-imageDrag.point.y)/6.5});
    });
    const finishImage=(event,cancel=false)=>{if(!imageDrag||event.pointerId!==imageDrag.id)return;const old=imageDrag;imageDrag=null;if(cancel)apply(old.value);try{after.releasePointerCapture(event.pointerId);}catch{}};
    after.addEventListener('pointerup',event=>finishImage(event));after.addEventListener('pointercancel',event=>finishImage(event,true));
    after.addEventListener('wheel',event=>{
      if(!manualActive()||!event.deltaY)return;
      event.preventDefault();event.stopPropagation();
      const old=value(),unit=event.deltaMode===1?16:event.deltaMode===2?after.clientHeight:1,requested=Math.exp(-Math.max(-1800,Math.min(1800,event.deltaY*unit))*.0015);
      const factor=Math.max(Math.max(.05/old.scaleX,.05/old.scaleY),Math.min(Math.min(20/old.scaleX,20/old.scaleY),requested));
      apply({scaleX:old.scaleX*factor,scaleY:old.scaleY*factor});
    },{passive:false});
    updateFields();
  }
  window.generalRoadConditions={prepare,render,comparison,mount};
})();
