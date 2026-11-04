(function(){
  'use strict';
  const Core=window.VisualLayoutCore;
  const fields=[
    {key:'rotation',label:'旋轉角度',unit:'°',hint:'逆時針 ← → 順時針',factor:1},
    {key:'tilt',label:'透視傾斜',unit:'°',hint:'較俯視 ← → 較平視',factor:1},
    {key:'scale',label:'圖片大小',unit:'%',hint:'縮小 ← → 放大',factor:100},
    {key:'x',label:'左右位置',unit:'%',hint:'向左 ← → 向右',factor:1},
    {key:'y',label:'上下位置',unit:'%',hint:'向上 ← → 向下',factor:1}
  ];
  let picture=null,pageId=null,ui=null,draft=null,opened=false,pointerActive=false,cancelled=false;
  let position=null,panelDrag=null,sizeObserver=null;
  const editor=()=>window.visualLayoutEditor;
  const editable=()=>Boolean(window.generalRoadEditor?.editing&&!editor()?.editing&&!editor()?.busy);
  const saved=()=>Core.coverArtSettings(editor()?.store?.config.coverArt?.[pageId]);
  function place(x,y){
    if(!ui)return;
    const box=ui.getBoundingClientRect(),margin=8,top=Math.max(margin,...Array.from(document.querySelectorAll('.header,#editor-toolbar'),node=>node.getBoundingClientRect().bottom+margin));
    position={x:Math.round(Math.max(margin,Math.min(innerWidth-box.width-margin,x))*100)/100,y:Math.round(Math.max(top,Math.min(Math.max(top,innerHeight-box.height-margin),y))*100)/100};
    ui.style.left=position.x+'px';ui.style.top=position.y+'px';ui.style.right='auto';
  }
  function defaultPosition(){position=null;if(ui)for(const name of ['left','top','right'])ui.style.removeProperty(name);}
  function finishMove(cancelMove=false){
    if(!panelDrag)return;
    const move=panelDrag;panelDrag=null;ui?.classList.remove('is-dragging');
    try{move.handle.releasePointerCapture(move.pointerId);}catch{}
    if(cancelMove){if(move.previous)place(move.previous.x,move.previous.y);else defaultPosition();}
    else if(position)place(position.x,position.y);
  }
  function apply(settings){
    if(!picture)return;
    for(const [key,value]of Object.entries(settings))picture.style.setProperty('--cover-'+key,value+(key==='rotation'||key==='tilt'?'deg':key==='x'?'vw':key==='y'?'vh':''));
  }
  function values(settings){
    if(!ui)return;
    for(const field of fields){const value=Math.round(settings[field.key]*field.factor*100)/100;ui.querySelector('[data-cover-setting="'+field.key+'"]').value=value;ui.querySelector('[data-cover-value="'+field.key+'"]').textContent=value+field.unit;}
  }
  function cancel(){draft=null;if(picture)apply(saved());values(saved());}
  function commit(){
    if(!draft||!editable())return;
    const next=draft;draft=null;
    const defaults=Object.keys(Core.coverArtDefaults).every(key=>next[key]===Core.coverArtDefaults[key]);
    if(editor().transact(config=>{if(defaults)delete config.coverArt[pageId];else config.coverArt[pageId]=next;},false)){
      apply(saved());values(saved());editor().report('封面圖已調整，請儲存設定。');
    }else cancel();
  }
  function update(){
    if(!ui)return;
    for(const input of ui.querySelectorAll('input,[data-cover-reset]'))input.disabled=!editable();
    ui.querySelector('[data-cover-drag]').setAttribute('aria-disabled',String(!editable()));
    const save=document.querySelector('#visual-layout-editor [data-vl-action="save"]');
    ui.querySelector('[data-cover-save]').disabled=!editable()||!save||save.disabled;
  }
  function cleanup(){
    finishMove(true);sizeObserver?.disconnect();sizeObserver=null;
    if(ui){opened=ui.open;ui.remove();}
    if(draft&&picture)apply(saved());
    picture=null;pageId=null;ui=null;draft=null;pointerActive=false;cancelled=false;
  }
  function mount(app){
    cleanup();picture=document.querySelector('#presentation .results-cover-art img');if(!picture)return;
    pageId=app.page.id;apply(saved());if(!editable())return;
    const node=document.createElement('details');ui=node;node.className='cover-art-editor';node.dataset.editorUi='cover-art';node.open=opened;
    const fieldMarkup=field=>{
      const [min,max]=Core.coverArtLimits[field.key].map(value=>value*field.factor);
      return '<label class="cover-art-field"><span>'+field.label+'<output data-cover-value="'+field.key+'"></output></span><input type="range" min="'+min+'" max="'+max+'" step="1" data-cover-setting="'+field.key+'" aria-label="'+field.label+'"><small>'+field.hint+'</small></label>';
    };
    node.innerHTML='<summary>調整封面圖</summary><div class="cover-art-panel"><header><strong data-cover-drag tabindex="0" role="button" aria-label="拖曳移動調整視窗，可用方向鍵微調" title="拖曳移動；方向鍵微調；Home 回到右上角">封面圖調整<span class="cover-art-drag-hint">拖曳移動</span></strong><button type="button" data-cover-close aria-label="關閉封面圖調整">×</button></header><p>拖動滑桿即時預覽，完成後按「儲存」。</p>'+fields.slice(0,3).map(fieldMarkup).join('')+'<details class="cover-art-position"><summary>位置微調</summary>'+fields.slice(3).map(fieldMarkup).join('')+'</details><footer><button type="button" data-cover-reset>回到預設</button><button type="button" data-cover-save>儲存</button></footer></div>';
    node.addEventListener('input',event=>{
      const input=event.target.closest('[data-cover-setting]');if(!input||!editable())return;
      if(cancelled){values(saved());return;}
      const field=fields.find(field=>field.key===input.dataset.coverSetting);
      draft=Core.coverArtSettings({... (draft||saved()),[field.key]:Number(input.value)/field.factor});apply(draft);values(draft);
    });
    node.addEventListener('change',event=>{if(!event.target.matches('[data-cover-setting]'))return;if(cancelled){cancelled=false;cancel();return;}commit();});
    node.addEventListener('pointerdown',event=>{
      const handle=event.target.closest('[data-cover-drag]');
      if(handle&&editable()&&event.button===0&&event.isPrimary!==false){
        event.preventDefault();event.stopPropagation();commit();const box=node.getBoundingClientRect();
        panelDrag={handle,pointerId:event.pointerId,x:event.clientX,y:event.clientY,left:box.left,top:box.top,previous:position&&{...position}};
        node.classList.add('is-dragging');handle.focus({preventScroll:true});try{handle.setPointerCapture(event.pointerId);}catch{}return;
      }
      if(event.target.matches('[data-cover-setting]')){pointerActive=true;cancelled=false;}
    });
    node.addEventListener('pointermove',event=>{if(panelDrag?.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();place(panelDrag.left+event.clientX-panelDrag.x,panelDrag.top+event.clientY-panelDrag.y);});
    node.addEventListener('pointerup',event=>{if(panelDrag?.pointerId===event.pointerId){event.preventDefault();event.stopPropagation();finishMove();}pointerActive=false;});
    node.addEventListener('pointercancel',event=>{if(panelDrag?.pointerId===event.pointerId){finishMove(true);return;}cancelled=true;pointerActive=false;cancel();});
    node.addEventListener('lostpointercapture',event=>{if(panelDrag?.pointerId===event.pointerId)finishMove();});
    node.addEventListener('keydown',event=>{
      if(panelDrag&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finishMove(true);return;}
      if(event.target.closest('[data-cover-drag]')&&editable()&&!panelDrag&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key)){
        event.preventDefault();event.stopImmediatePropagation();if(event.key==='Home'){defaultPosition();return;}
        const box=node.getBoundingClientRect(),step=event.shiftKey?20:10;
        place(box.left+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),box.top+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0));return;
      }
      if(event.key!=='Escape'){if(!pointerActive)cancelled=false;return;}event.preventDefault();event.stopImmediatePropagation();
      if(draft){cancelled=pointerActive;cancel();}else{opened=false;node.open=false;node.querySelector('summary').focus();}
    });
    node.addEventListener('toggle',event=>{if(ui!==node||event.target!==node)return;opened=node.open;if(!opened)commit();});
    node.addEventListener('click',event=>{
      if(event.target.closest('[data-cover-close]')){commit();opened=false;node.open=false;node.querySelector('summary').focus();}
      if(event.target.closest('[data-cover-reset]')&&editable()){
        draft=null;editor().transact(config=>{delete config.coverArt[pageId];},false);apply(saved());values(saved());editor().report('已恢復預設封面圖，請儲存設定。');
      }
      if(event.target.closest('[data-cover-save]')&&editable()){commit();document.querySelector('#visual-layout-editor [data-vl-action="save"]').click();}
    });
    document.body.append(node);values(saved());update();if(position)place(position.x,position.y);
    sizeObserver=new ResizeObserver(()=>{if(ui===node&&position&&!panelDrag)place(position.x,position.y);});sizeObserver.observe(node);
  }
  window.addEventListener('blur',()=>{finishMove(true);if(draft){cancelled=pointerActive;pointerActive=false;cancel();}});
  window.addEventListener('resize',()=>{finishMove();if(position)place(position.x,position.y);});
  window.CoverArtEditor={mount,cleanup,update};
})();
