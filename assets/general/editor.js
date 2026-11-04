
(async () => {
  'use strict';
  const readOnly=Boolean(window.PresentationMode?.readOnly);
  await window.visualLayoutReady;
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const copy=value=>JSON.parse(JSON.stringify(value));
  const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const safeImage=value=>typeof value==='string'&&(/^(?:data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[a-z\d+/=\s]+)$/i.test(value)||/^materials\/edited\/[a-f0-9]{64}\.(?:png|jpeg|webp|gif|svg)$/.test(value));
  const empty=()=>({version:1,updatedAt:0,texts:{},images:{},highlights:{},disabledHighlights:{},styles:{},frames:{},layouts:{},blocks:{},comparisonTransforms:{},templateMigrations:{},pages:[],pageOrder:[]});
  function parse(text) {
    try {
      const value=JSON.parse(text);
      if(value?.version!==1||!Number.isFinite(value.updatedAt))return null;
      const state=empty();
      state.updatedAt=value.updatedAt;
      for(const key of ['texts','images','highlights','disabledHighlights','styles','frames','layouts','blocks','comparisonTransforms','templateMigrations'])if(record(value[key]))state[key]=value[key];
      state.pages=(Array.isArray(value.pages)?value.pages:[]).filter(window.generalRoadTemplates.validPage);
      state.pageOrder=Array.isArray(value.pageOrder)?value.pageOrder.filter(id=>typeof id==='string'):[];
      return state;
    } catch {return null;}
  }
  const storageKey='general-road-editor:v1:'+location.pathname;
  const embedded=parse($('editor-saved-data')?.textContent)||empty();
  let draft;
  try{if(!$('editor-saved-data').dataset.source)draft=parse(localStorage.getItem(storageKey));}catch{}
  const restored=Boolean(draft&&draft.updatedAt>embedded.updatedAt);
  let state=restored?draft:embedded;
  let api;
  let data;
  let editing=false;
  let adjusting=false;
  let dirty=restored;
  let draftTimer=0;
  let drag=null;
  let imageTarget='overall';
  const baseline={};
  const targetKinds=new Map();
  const placeholder='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 640"><rect width="1000" height="640" fill="#edf2e7"/><path d="M450 0h100v270h450v100H550v270H450V370H0V270h450Z" fill="#d1dec4"/><path d="M500 0v640M0 320h1000" fill="none" stroke="#f9fbf5" stroke-width="4" stroke-dasharray="16 16"/><rect x="315" y="230" width="370" height="180" rx="12" fill="#f9fbf5" stroke="#bdcdb0"/><path d="M472 289h56m-28-28v56" stroke="#8da67d" stroke-width="5"/><text x="500" y="363" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#6c855c">新增情境圖面</text></svg>');
  const validBounds=(box,width,height)=>Array.isArray(box)&&box.length===4&&box.every(Number.isFinite)&&box[0]>=0&&box[1]>=0&&box[2]>0&&box[3]>0&&box[0]+box[2]<=width+.01&&box[1]+box[3]<=height+.01;
  const contains=(outer,inner)=>inner[0]>=outer[0]-.01&&inner[1]>=outer[1]-.01&&inner[0]+inner[2]<=outer[0]+outer[2]+.01&&inner[1]+inner[3]<=outer[1]+outer[3]+.01;
  const image=key=>safeImage(state.images[key]?.src)?state.images[key].src:placeholder;
  const bounds=(key,kind,fallback)=>validBounds(state.highlights[key]?.[kind],1000,640)?[...state.highlights[key][kind]]:[...fallback];
  function report(message) {const status=document.querySelector('.editor-status');if(status)status.textContent=message;if(/上限|無法|格式|失敗|請選擇/.test(message))window.visualLayoutEditor?.report(message,true);}
  function saveDraft() {
    if(readOnly)return false;
    try {localStorage.setItem(storageKey,JSON.stringify(state));report(dirty?'草稿已暫存；請儲存 JSON 設定':'已儲存');return true;}
    catch {report('瀏覽器無法暫存；請按儲存寫入 JSON 設定');return false;}
  }
  function changed(commit=true) {
    if(readOnly)return;
    state.updatedAt=Date.now();
    dirty=true;
    if(commit)window.visualLayoutEditor?.legacyChanged();
    report('修改尚未儲存');
    clearTimeout(draftTimer);
    draftTimer=setTimeout(saveDraft,350);
  }
  function getComparisonTransform(pageId,side) {
    const initial=data?.scenarios.find(scene=>scene.currentConditions?.pageId===pageId)?.currentConditions.defaultTransforms?.[side]||{};
    const saved={...initial,...state.comparisonTransforms[pageId]?.[side]},result={x:0,y:0,scaleX:1,scaleY:1,angle:0};
    const limits={x:[-1000,1000],y:[-1000,1000],scaleX:[.05,20],scaleY:[.05,20],angle:[-3600,3600]};
    for(const [key,[min,max]]of Object.entries(limits))if(Number.isFinite(saved[key]))result[key]=Math.max(min,Math.min(max,saved[key]));
    return result;
  }
  function setComparisonTransform(pageId,side,patch) {
    if(readOnly)return;
    if(!['before','after'].includes(side)||!api?.pages.some(page=>page.id===pageId&&page.kind==='current-conditions'))return;
    if(patch===null){
      if(state.comparisonTransforms[pageId]){delete state.comparisonTransforms[pageId][side];if(!Object.keys(state.comparisonTransforms[pageId]).length)delete state.comparisonTransforms[pageId];}
    } else {
      if(!record(patch))return;
      const current=getComparisonTransform(pageId,side),limits={x:[-1000,1000],y:[-1000,1000],scaleX:[.05,20],scaleY:[.05,20],angle:[-3600,3600]};
      for(const [key,[min,max]]of Object.entries(limits))if(Number.isFinite(patch[key]))current[key]=Math.max(min,Math.min(max,patch[key]));
      if(!record(state.comparisonTransforms[pageId]))state.comparisonTransforms[pageId]={};
      state.comparisonTransforms[pageId][side]=current;
    }
    changed();return getComparisonTransform(pageId,side);
  }
  function prepare(value) {
    data=value;
    // Older browser drafts can retain the former edge-only 18px typography.
    const typographyRevision=Number(document.querySelector('meta[name="article-typography-revision"]')?.content)||0;
    if(typographyRevision&&state.templateMigrations.edgeTypography!==typographyRevision){
      let migrated=false;
      for(const index of [2,6,7,8]){
        const key='edge|1|text-'+index,style=state.styles[key];if(!record(style))continue;
        for(const property of ['fontSize','lineHeight'])if(Object.hasOwn(style,property)){delete style[property];migrated=true;}
        if(!Object.keys(style).length)delete state.styles[key];
      }
      state.templateMigrations.edgeTypography=typographyRevision;
      if(migrated)changed();
    }
    for(const article of data.articles) {
      const scenario=data.scenarios.find(value=>value.id===article.scenario)||data.scenarios[0];
      const image=data.embeddedAssets[article.mapAsset]||scenario,width=image.width,height=image.height;
      baseline['article:'+article.id]={box:[...article.box],crop:[...article.crop]};
      const saved=state.highlights['article:'+article.id];
      if(validBounds(saved?.box,width,height))article.box=[...saved.box];
      if(validBounds(saved?.crop,width,height))article.crop=[...saved.crop];
      if(!contains(article.crop,window.VisualLayoutCore.highlightBounds(article.box,rotation('article:'+article.id))))article.crop=[0,0,width,height];
    }
    for(const [key,asset] of Object.entries(data.embeddedAssets)) {
      if(safeImage(state.images[key]?.src))asset.url=state.images[key].src;
    }
  }
  function restorePages(pages) {
    const builtinIds=pages.map(page=>page.id);
    const ids=new Set(pages.map(page=>page.id));
    state.pages=state.pages.filter(page=>!ids.has(page.id)&&Boolean(ids.add(page.id)));
    pages.push(...state.pages);
    for(const page of pages) {
      const title=state.texts[page.id+'|shared|title'];
      if(typeof title==='string'&&title.trim())page.name=title.replace(/\n/g,' ');
    }
    if(state.pageOrder.length) {
      const merged=state.pageOrder.filter(id=>pages.some(page=>page.id===id));
      for(const [index,id]of builtinIds.entries())if(!merged.includes(id)) {
        const following=builtinIds.slice(index+1).find(value=>merged.includes(value));
        if(following)merged.splice(merged.indexOf(following),0,id);else merged.push(id);
      }
      const order=new Map(merged.map((id,index)=>[id,index]));
      const original=new Map(pages.map((page,index)=>[page.id,index]));
      pages.sort((left,right)=>(order.get(left.id)??merged.length+original.get(left.id))-(order.get(right.id)??merged.length+original.get(right.id)));
      state.pageOrder=pages.map(page=>page.id);
    }
    pages.forEach((page,index)=>{if(page.kind==='custom'&&!page.scenario){const before=pages.slice(0,index).reverse().find(value=>value.chapter===page.chapter&&value.scenario);if(before)page.scenario=before.scenario;}});
  }
  function setText(element,text) {
    const nodes=text.split('\n').flatMap((line,index)=>index?[document.createElement('br'),document.createTextNode(line)]:[document.createTextNode(line)]);
    element.replaceChildren(...nodes);
  }
  function bindTexts() {
    document.querySelectorAll('.metric-value').forEach(element=>{
      const node=[...element.childNodes].find(child=>child.nodeType===Node.TEXT_NODE&&child.textContent.trim());
      if(node){const span=document.createElement('span');span.className='metric-number';node.replaceWith(span);span.append(node);}
    });
    const selector=['#slide-title','main h2','main h3','main p','main .tag','main .context-note','main .issue-row strong','main .metric-number','main .metric-value small','main .metric-label','main .takeaway','main .explain-points li>span','main .road-fact strong','main .custom-bullets li','main .contents-intro strong'].join(',');
    let baseIndex=0;
    [...document.querySelectorAll(selector)].forEach(element=>{
      const index=element.closest('[data-user-block]')?-1:baseIndex++;
      if(element.closest('[data-template-hidden]')||element.closest('[data-editor-ui]')||element.querySelector('button'))return;
      const key=element.dataset.blockEditKey||(element.id==='slide-title'?api.page.id+'|shared|title':api.page.id+'|'+api.state.phase+'|text-'+index);
      element.dataset.editKey=key;
      if(typeof state.texts[key]==='string')setText(element,state.texts[key]);
      if(editing&&!window.visualLayoutEditor?.editing){element.setAttribute('contenteditable','plaintext-only');element.spellcheck=false;}
      else {element.removeAttribute('contenteditable');element.removeAttribute('spellcheck');}
    });
  }
  function imageElements() {return [...document.querySelectorAll('main [data-editor-image-key]')];}
  function bindImages() {
    const cover=document.querySelector('.cover-map');
    if(cover)cover.dataset.editorImageKey='overall';
    document.querySelectorAll('[data-editor-ui="image-button"]').forEach(button=>button.remove());
    const seen=new Set();
    for(const element of imageElements()) {
      const key=element.dataset.editorImageKey;
      const src=data.embeddedAssets[key]?.url||image(key);
      const img=element.matches('img')?element:element.querySelector('img');
      const vector=element.querySelector('image');
      if(img&&img.getAttribute('src')!==src)img.src=src;
      if(vector&&vector.getAttribute('href')!==src)vector.setAttribute('href',src);
      if(!editing||seen.has(key))continue;
      seen.add(key);
      const button=document.createElement('button');
      button.type='button';button.className='image-edit-button';button.dataset.editorUi='image-button';button.dataset.replaceImage=key;button.textContent='更換圖片';
      const container=element.closest('.map-card,.cover-art,.custom-image-frame')||element.parentElement;
      container.append(button);
    }

  }
  function decorate() {
    if(!api||!$('presentation').firstElementChild)return;
    window.generalRoadBlocks?.render();
    bindTexts();window.PresentationContent?.render({api,root:$('presentation'),state});bindImages();
    const frames=api.editorFrames();
    for(const frame of frames) {
      const custom=frame.element.querySelector('.custom-highlight');
      if(custom){custom.style.display=state.disabledHighlights[frame.key]&&!adjusting?'none':'';custom.setAttribute('transform',window.VisualLayoutCore.highlightTransform(frame.getBox(),rotation(frame.key)));}
    }
    document.querySelector('.editor-highlight').disabled=!frames.length;
    const custom=api.page.kind==='custom';
    document.querySelectorAll('[data-page-order]').forEach(button=>button.disabled=!custom);
    document.querySelector('.editor-remove-page').disabled=!custom;
    document.querySelectorAll('.editor-highlight-controls,.editor-handle-layer').forEach(element=>element.remove());
    if(editing&&adjusting)frames.forEach(addFrameControls);
    window.generalRoadFormatting?.render();
    measure();
  }
  function measure() {
    const toolbar=$('editor-toolbar');
    document.body.style.setProperty('--editor-space',editing?toolbar.offsetHeight+'px':'0px');
  }
  function setEditing(value) {
    if(readOnly)return;
    if(!value)window.visualLayoutEditor?.setMode(false);
    if(!value)window.generalRoadFormatting?.setActive(false);
    if(!value)setAdjusting(false,false);
    editing=Boolean(value);
    document.body.classList.toggle('is-editing',editing);
    $('editor-toolbar').hidden=!editing;
    const toggle=document.querySelector('.edit-toggle');
    toggle.textContent=editing?'完成編輯・預覽':'編輯內容';
    toggle.setAttribute('aria-pressed',String(editing));
    if(window.visualLayoutEditor?.refresh)window.visualLayoutEditor.refresh();else api.refresh();
    window.visualLayoutEditor?.sessionChanged();
    if(!editing&&dirty){clearTimeout(draftTimer);saveDraft();}
  }
  function setAdjusting(value,refresh=true) {
    if(readOnly)return;
    if(value)window.generalRoadFormatting?.setActive(false);
    drag=null;adjusting=Boolean(value&&editing);
    document.body.classList.toggle('is-highlighting',adjusting);
    const button=document.querySelector('.editor-highlight');
    if(button){button.textContent=adjusting?'完成打亮調整':'調整打亮';button.setAttribute('aria-pressed',String(adjusting));}
    if(refresh&&api){if(window.visualLayoutEditor?.refresh)window.visualLayoutEditor.refresh();else api.refresh();}
  }
  function chooseImage(key) {imageTarget=key;$('editor-image-file').value='';$('editor-image-file').click();}
  async function replaceImage(key,src,alt='替換圖面') {
    if(readOnly)return;
    if(!safeImage(src))throw new Error('圖片格式無法使用');
    await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>img.naturalWidth&&img.naturalHeight?resolve():reject(new Error('圖片沒有有效尺寸'));img.onerror=()=>reject(new Error('無法讀取這張圖片'));img.src=src;});
    state.images[key]={src,alt};
    window.PresentationModules?.noteReplacement(key);
    window.PresentationResults?.noteReplacement(key);
    if(data.embeddedAssets[key])data.embeddedAssets[key].url=src;
    const overallScenario=data.scenarios.find(value=>value.overall===key);
    if(overallScenario)data.articles.filter(article=>article.scenario===overallScenario.id).forEach(article=>state.disabledHighlights['article:'+article.id]=true);
    for(const page of state.pages)if(key.startsWith('page:'+page.id+':')&&page.steps) {
      const side=key.slice(('page:'+page.id+':').length);
      page.steps.forEach((_,index)=>state.disabledHighlights[`custom:${page.id}:${side}:${index}`]=true);
    }
    changed();api.refresh();
    if($('asset-dialog').open&&data.embeddedAssets[key])api.showAsset(key);
    report(overallScenario||key.startsWith('page:')?'已更換圖片；原打亮已隱藏，請調整對齊後儲存 JSON 設定':'已更換圖片；請儲存 JSON 設定');
  }
  function decorateAsset(key) {
    document.querySelector('[data-editor-ui="asset-replace"]')?.remove();
    if(!editing)return;
    const button=document.createElement('button');button.type='button';button.className='quiet-button';button.dataset.editorUi='asset-replace';button.dataset.replaceImage=key;button.textContent='更換此圖';
    document.querySelector('#asset-dialog .dialog-actions').prepend(button);
  }
  function serialize() {
    clearTimeout(draftTimer);
    state.updatedAt=Math.max(Date.now(),state.updatedAt);
    const clone=document.documentElement.cloneNode(true);
    clone.querySelectorAll('[data-editor-ui]').forEach(element=>element.remove());
    clone.querySelectorAll('[contenteditable],[data-edit-key]').forEach(element=>{element.removeAttribute('contenteditable');element.removeAttribute('data-edit-key');element.removeAttribute('spellcheck');});
    clone.querySelectorAll('dialog[open]').forEach(dialog=>dialog.removeAttribute('open'));
    const body=clone.querySelector('body');body.classList.remove('is-editing','is-highlighting','is-dragging-highlight','is-formatting','is-format-resizing');body.style.removeProperty('--editor-space');body.style.removeProperty('--format-space');
    clone.querySelector('#editor-saved-data').textContent=JSON.stringify(state).replace(/</g,'\\u003c');
    clone.querySelector('#presentation').replaceChildren();
    return '<!doctype html>\n'+clone.outerHTML;
  }
  function download() {
    if(readOnly)return;
    const serialized=serialize();
    const url=URL.createObjectURL(new Blob([serialized],{type:'text/html;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='一般道路情境-圖面放大版-可編輯.html';link.dataset.editorUi='download';document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);dirty=false;saveDraft();report('已下載「一般道路情境-圖面放大版-可編輯.html」；請保留下載檔');
  }
  function rememberOrder() {state.pageOrder=api.pages.map(page=>page.id);changed();}
  function addPage(type,afterId=api.page.id) {
    if(readOnly)return;
    const after=api.pages.findIndex(page=>page.id===afterId);
    const chapter=after>=0?api.pages[after].chapter:'intro';
    const page=window.generalRoadTemplates.create(type,chapter);
    if(after>=0&&api.pages[after].scenario)page.scenario=api.pages[after].scenario;
    state.pages.push(page);api.pages.splice(after+1,0,page);rememberOrder();api.refreshStructure(page.id,0);return page;
  }
  function movePage(id,direction) {
    if(readOnly)return;
    const index=api.pages.findIndex(page=>page.id===id);
    if(index<0||api.pages[index].kind!=='custom')return;
    const destination=Math.max(0,Math.min(api.pages.length-1,index+direction));
    if(destination===index)return;
    const [page]=api.pages.splice(index,1);api.pages.splice(destination,0,page);rememberOrder();api.refreshStructure(id,api.state.phase);
  }
  function removePage(id) {
    if(readOnly)return;
    const index=api.pages.findIndex(page=>page.id===id);
    if(index<0||api.pages[index].kind!=='custom')return;
    const next=api.pages[index-1]?.id||api.pages[index+1]?.id;
    api.pages.splice(index,1);state.pages=state.pages.filter(page=>page.id!==id);
    for(const field of ['texts','images','highlights','disabledHighlights','styles','frames','layouts','blocks'])for(const key of Object.keys(state[field]))if(key===id||key.startsWith(id+'|')||key.startsWith('page:'+id+':')||key.startsWith('custom:'+id+':'))delete state[field][key];
    rememberOrder();api.refreshStructure(next,0);
  }
  function showAddPage() {
    $('editor-insert-after').innerHTML='<option value="">整份簡報最前面</option>'+api.pages.map(page=>`<option value="${escape(page.id)}">${escape(page.name)}</option>`).join('');
    $('editor-insert-after').value=api.page.id;$('editor-template-dialog').showModal();
  }
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function rotation(key) {return window.VisualLayoutCore.highlightAngle(state.highlights[key]?.rotation??0);}
  function frameEnvelope(frame,box=frame.getBox(),angle=rotation(frame.key)) {return window.VisualLayoutCore.highlightBounds(box,angle);}
  function fitBox(box,frame) {
    const width=Math.min(frame.width,Math.max(box[2]*1.8,150));
    const height=Math.min(frame.height,Math.max(box[3]*1.8,120));
    return [clamp(box[0]+box[2]/2-width/2,0,frame.width-width),clamp(box[1]+box[3]/2-height/2,0,frame.height-height),width,height];
  }
  function commitFrame(frame,kind,next,{refresh=true,rotation:angle=rotation(frame.key)}={}) {
    next=next.map(value=>Math.round(value*10)/10);
    if(!validBounds(next,frame.width,frame.height)){report('框選需保持在圖面內，寬高需大於零');return false;}
    if(!Number.isFinite(angle)||Math.abs(angle)>360){report('打亮框旋轉角度須介於 -360° 與 360°');return false;}
    angle=window.VisualLayoutCore.highlightAngle(Math.round(angle*10)/10);
    if(kind==='box')next=window.VisualLayoutCore.fitHighlight(next,angle,frame.width,frame.height);
    if(kind==='crop'&&!contains(next,frameEnvelope(frame))){report('放大範圍需要涵蓋旋轉後的打亮框，請放大範圍或先移動打亮框');return false;}
    const saved=state.highlights[frame.key]||{};
    saved[kind]=frame.setBounds(kind,next);
    if(kind==='box'){
      saved.rotation=angle;
      const envelope=frameEnvelope(frame,next,angle);
      if(frame.getCrop&&!contains(frame.getCrop(),envelope))saved.crop=frame.setBounds('crop',fitBox(envelope,frame));
    }
    state.highlights[frame.key]=saved;
    delete saved.deleted;
    if(frame.allowDelete)saved.imageKey=frame.imageKey;
    delete state.disabledHighlights[frame.key];changed();
    if(refresh) {
      const viewport=window.generalRoadViewport;
      const views=new Map(api.editorFrames().map(item=>[item.key,viewport?.get(item.element)?.read()]));
      api.refresh();
      for(const item of api.editorFrames()) {
        const view=views.get(item.key),controller=viewport?.get(item.element);
        if(view&&controller){controller.start();controller.write(view);}
      }
    }
    return true;
  }
  function resetFrame(frame,kind) {
    const original=baseline[frame.key]?.[kind]||frame.defaults?.[kind];
    if(!original)return;
    let next=frame.fromSource([...original]);
    if(kind==='crop'&&!contains(next,frameEnvelope(frame)))next=fitBox(frameEnvelope(frame),frame);
    commitFrame(frame,kind,next,kind==='box'?{rotation:0}:{});
  }
  function toggleModuleFrame(frame) {
    if(!frame.allowDelete)return;
    const saved=state.highlights[frame.key]||{};
    if(frame.hasBox===false||state.disabledHighlights[frame.key]||saved.deleted){commitFrame(frame,'box',frame.getBox());return;}
    const viewport=window.generalRoadViewport,view=viewport?.get(frame.element)?.read();
    state.highlights[frame.key]={...saved,deleted:true,imageKey:frame.imageKey};state.disabledHighlights[frame.key]=true;changed();api.refresh();
    const current=api.editorFrames().find(item=>item.key===frame.key);if(view&&current)viewport?.get(current.element)?.write(view);
  }
  function setLayer(layer,box,frame,angle=(targetKinds.get(frame.key)==='crop'?0:rotation(frame.key))) {
    const [x,y,width,height]=box;
    const matrix=(frame.coordinateElement||frame.element).getScreenCTM();
    const size=10/Math.max(.02,Math.hypot(matrix?.a||1,matrix?.b||0));
    layer.setAttribute('transform',window.VisualLayoutCore.highlightTransform(box,angle));
    const rect=layer.querySelector('.editor-focus-box');
    for(const [key,value]of Object.entries({x,y,width,height}))rect.setAttribute(key,value);
    for(const corner of ['nw','ne','sw','se']) {
      const handle=layer.querySelector(`[data-handle="${corner}"]`);
      handle.setAttribute('x',(corner.includes('e')?x+width:x)-size/2);handle.setAttribute('y',(corner.includes('s')?y+height:y)-size/2);handle.setAttribute('width',size);handle.setAttribute('height',size);
    }
    const rotate=layer.querySelector('[data-handle="rotate"]');
    if(rotate){
      let handleY=y-size*2.8;
      const rad=angle*Math.PI/180,offset=handleY-y-height/2,px=x+width/2-offset*Math.sin(rad),py=y+height/2+offset*Math.cos(rad);
      if(px<0||px>frame.width||py<0||py>frame.height)handleY=y+Math.min(height/2,size*2.8);
      rotate.setAttribute('cx',x+width/2);rotate.setAttribute('cy',handleY);rotate.setAttribute('r',size*.65);
      const stem=layer.querySelector('.editor-rotation-stem');
      for(const [key,value]of Object.entries({x1:x+width/2,x2:x+width/2,y1:y,y2:handleY}))stem.setAttribute(key,value);
    }
    const controls=document.querySelector(`[data-controls-key="${frame.key}"]`);
    controls?.querySelectorAll('[data-bound-index]').forEach(input=>{input.value=String(Math.round(box[Number(input.dataset.boundIndex)]*10)/10);});
    const field=controls?.querySelector('[data-highlight-rotation]');if(field)field.value=String(Math.round(angle*10)/10);
  }
  function addFrameControls(frame) {
    const kind=targetKinds.get(frame.key)==='crop'&&frame.getCrop?'crop':'box';
    const box=kind==='crop'?frame.getCrop():frame.getBox();
    const controls=document.createElement('div');controls.className='editor-highlight-controls';controls.dataset.editorUi='highlight-controls';controls.dataset.controlsKey=frame.key;
    controls.innerHTML=`<div class="editor-frame-heading"><strong>${escape(frame.label)}</strong><select data-frame-target="${escape(frame.key)}" aria-label="選擇調整打亮或放大範圍"><option value="box" ${kind==='box'?'selected':''}>打亮框</option>${frame.getCrop?`<option value="crop" ${kind==='crop'?'selected':''}>放大範圍</option>`:''}</select><button type="button" data-reset-frame="${escape(frame.key)}">還原框選</button></div><div class="editor-bounds-fields">${['左','上','寬','高'].map((label,index)=>`<label>${label}<input type="number" step="1" min="${index>1?1:0}" value="${Math.round(box[index]*10)/10}" data-bound-index="${index}" aria-label="${label}座標或尺寸"></label>`).join('')}<small>拖曳框身移動，拖曳四角改大小</small></div>`;
    if(kind==='box'){
      const field=document.createElement('label');field.className='editor-rotation-field';field.innerHTML=`旋轉角度<input type="number" step="1" min="-360" max="360" value="${rotation(frame.key)}" data-highlight-rotation aria-label="打亮框旋轉角度">°`;
      const actions=document.createElement('span');actions.className='editor-rotation-actions';actions.innerHTML='<button type="button" data-rotate-highlight="-15" title="逆時針旋轉 15°">↶ 15°</button><button type="button" data-rotate-highlight="15" title="順時針旋轉 15°">↷ 15°</button><button type="button" data-rotate-highlight="0" title="打亮框角度歸零">歸零</button>';
      const fields=controls.querySelector('.editor-bounds-fields'),hint=controls.querySelector('small');fields.insertBefore(field,hint);fields.insertBefore(actions,hint);
      controls.querySelector('small').textContent='拖曳圓點旋轉；按住 Shift 每次旋轉 15°';
    }
    const container=frame.element.closest('.map-card,.custom-diagram-frame')||frame.element.parentElement;
    if(container.classList.contains('map-card'))container.querySelector('.map-toolbar').after(controls);else container.prepend(controls);
    if(frame.allowDelete){
      const saved=state.highlights[frame.key]||{},absent=frame.hasBox===false,deleted=Boolean(saved.deleted),disabled=Boolean(state.disabledHighlights[frame.key]);
      const toggle=document.createElement('button');toggle.type='button';toggle.dataset.toggleModuleFrame=frame.key;toggle.dataset.frameToggleState=absent?'add':disabled||deleted?'restore':'delete';toggle.textContent=absent?'新增打亮框':disabled||deleted?'恢復打亮框':'刪除打亮框';controls.querySelector('.editor-frame-heading').append(toggle);
      if(absent||deleted){controls.querySelectorAll('input,select,[data-reset-frame],[data-rotate-highlight]').forEach(node=>node.disabled=true);controls.querySelector('small').textContent=deleted?'打亮框已刪除，可恢復原位置。':'按「新增打亮框」後拖曳調整位置。';return;}
    }
    const layer=document.createElementNS('http://www.w3.org/2000/svg','g');layer.classList.add('editor-handle-layer');layer.dataset.editorUi='highlight-handles';layer.dataset.layerKey=frame.key;
    const makeHandle=(tag,corner,label)=>{
      const element=document.createElementNS('http://www.w3.org/2000/svg',tag);element.dataset.frameKey=frame.key;element.dataset.handle=corner;element.setAttribute('tabindex','0');element.setAttribute('role','button');element.setAttribute('aria-label',frame.label+' '+label);return element;
    };
    const rect=makeHandle('rect','move','移動框選');rect.classList.add('editor-focus-box');rect.setAttribute('rx','3');layer.append(rect);
    for(const corner of ['nw','ne','sw','se']){const handle=makeHandle('rect',corner,({nw:'左上',ne:'右上',sw:'左下',se:'右下'})[corner]+'角縮放');handle.classList.add('editor-corner');layer.append(handle);}
    if(kind==='box'){
      const stem=document.createElementNS('http://www.w3.org/2000/svg','line');stem.classList.add('editor-rotation-stem');layer.append(stem);
      const handle=makeHandle('circle','rotate','旋轉打亮框；方向鍵旋轉 1°，Shift 方向鍵旋轉 15°');handle.classList.add('editor-rotation-handle');layer.append(handle);
    }
    (frame.coordinateElement||frame.element).append(layer);setLayer(layer,box,frame);
  }
  function point(event,svg) {
    const matrix=svg.getScreenCTM();if(!matrix)throw new Error('圖面尚未就緒');
    return new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
  }
  function adjustedBox(start,corner,dx,dy,frame,angle=0) {
    const [x,y,width,height]=start;
    if(corner==='move')return window.VisualLayoutCore.fitHighlight([x+dx,y+dy,width,height],angle,frame.width,frame.height);
    if(angle)return window.VisualLayoutCore.resizeHighlight(start,angle,corner,dx,dy,frame.width,frame.height);
    const minimum=4;
    const left=corner.includes('w')?clamp(x+dx,0,x+width-minimum):x;
    const right=corner.includes('e')?clamp(x+width+dx,x+minimum,frame.width):x+width;
    const top=corner.includes('n')?clamp(y+dy,0,y+height-minimum):y;
    const bottom=corner.includes('s')?clamp(y+height+dy,y+minimum,frame.height):y+height;
    return [left,top,right-left,bottom-top];
  }
  function focusHandle(key,corner) {document.querySelector(`[data-frame-key="${key}"][data-handle="${corner}"]`)?.focus({preventScroll:true});}
  function connect(value) {
    api=value;
    const toggle=document.createElement('button');toggle.type='button';toggle.className='edit-toggle';toggle.dataset.editorUi='toggle';toggle.textContent='編輯內容';toggle.setAttribute('aria-pressed','false');toggle.setAttribute('aria-controls','editor-toolbar');document.querySelector('.header').append(toggle);
    const toolbar=document.createElement('div');toolbar.id='editor-toolbar';toolbar.className='editor-toolbar';toolbar.dataset.editorUi='toolbar';toolbar.hidden=true;
    toolbar.innerHTML='<div class="editor-instructions"><strong>直接編輯這份簡報</strong><p>點文字修改，使用圖片旁的按鈕更換圖片。</p><span class="editor-status" role="status" aria-live="polite"></span></div><div class="editor-actions"><button type="button" class="editor-highlight" aria-pressed="false">調整打亮</button><button type="button" class="editor-add-page">新增頁面</button><button type="button" data-page-order="-1" title="新增頁面往前移">往前移</button><button type="button" data-page-order="1" title="新增頁面往後移">往後移</button><button type="button" class="editor-remove-page">移除此頁</button><button type="button" class="editor-download">下載 HTML</button></div>';
    document.querySelector('.header').after(toolbar);
    const formatButton=document.createElement('button');formatButton.type='button';formatButton.className='editor-format';formatButton.textContent='版面與字體';formatButton.setAttribute('aria-pressed','false');toolbar.querySelector('.editor-highlight').after(formatButton);
    window.generalRoadFormatting?.connect({api,getState:()=>state,changed,isEditing:()=>editing,stopHighlighting:()=>setAdjusting(false)});
    window.generalRoadBlocks?.connect({api,getState:()=>state,changed,isEditing:()=>editing});
    const file=document.createElement('input');file.id='editor-image-file';file.type='file';file.accept='image/png,image/jpeg,image/webp,image/gif,image/svg+xml';file.hidden=true;file.dataset.editorUi='file';document.body.append(file);
    const dialog=document.createElement('dialog');dialog.id='editor-template-dialog';dialog.className='editor-template-dialog';dialog.dataset.editorUi='templates';dialog.setAttribute('aria-labelledby','editor-template-title');
    dialog.innerHTML=`<div class="dialog-head"><div><span class="eyebrow">PAGE TEMPLATES</span><h2 id="editor-template-title">使用版型新增頁面</h2></div><button class="close-button" data-close aria-label="關閉新增頁面">×</button></div><label class="editor-insert-label">插入位置<select id="editor-insert-after"></select></label><div class="editor-template-grid">${window.generalRoadTemplates.types.map((type,index)=>`<button type="button" data-template-type="${type.id}"><span>0${index+1}</span><strong>${type.name}</strong><small>${type.description}</small></button>`).join('')}</div><p class="dialog-note">新增頁面沿用插入位置的章節，可編輯文字、換圖、調整打亮並下載保存。</p>`;
    document.body.append(dialog);
    new ResizeObserver(measure).observe(toolbar);
    toggle.addEventListener('click',()=>setEditing(!editing));
    toolbar.querySelector('.editor-highlight').addEventListener('click',()=>setAdjusting(!adjusting));
    toolbar.querySelector('.editor-add-page').addEventListener('click',showAddPage);
    toolbar.querySelector('.editor-download').addEventListener('click',download);
    toolbar.querySelector('.editor-remove-page').addEventListener('click',()=>removePage(api.page.id));
    toolbar.querySelectorAll('[data-page-order]').forEach(button=>button.addEventListener('click',()=>movePage(api.page.id,Number(button.dataset.pageOrder))));
    file.addEventListener('change',async()=>{
      const selected=file.files?.[0];if(!selected)return;
      if(selected.size>10*1024*1024){report('每張圖片上限為 10 MB');return;}
      const mime=selected.type||(/\.svg$/i.test(selected.name)?'image/svg+xml':'');
      if(!/^image\/(png|jpeg|webp|gif|svg\+xml)$/i.test(mime)){report('請選擇 PNG、JPG、WebP、GIF 或 SVG 圖片');return;}
      try {
        const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('檔案讀取失敗'));reader.readAsDataURL(selected);});
        await replaceImage(imageTarget,src,selected.name);
      }catch(error){report(error.message);}
    });
    document.addEventListener('input',event=>{
      if(!editing||window.visualLayoutEditor?.editing)return;
      const element=event.target.closest('[data-edit-key]');if(!element)return;
      const text=(element.innerText??element.textContent).replace(/\r/g,'');state.texts[element.dataset.editKey]=text;
      if(element.id==='slide-title'){api.page.name=text.replace(/\n/g,' ');api.updateContents();}
      changed();
    });
    document.addEventListener('click',event=>{
      if(!editing)return;
      if(event.target.closest('.viewport-tools'))return;
      if(event.target.closest('[data-edit-key]')){event.stopPropagation();return;}
      const replacement=event.target.closest('[data-replace-image]');
      if(replacement){event.preventDefault();event.stopPropagation();chooseImage(replacement.dataset.replaceImage);return;}
      if(window.visualLayoutEditor?.editing)return;
      const template=event.target.closest('[data-template-type]');
      if(template){event.stopPropagation();const after=$('editor-insert-after').value;dialog.close();addPage(template.dataset.templateType,after);return;}
      const toggleFrame=event.target.closest('[data-toggle-module-frame]');
      if(toggleFrame){const frame=api.editorFrames().find(item=>item.key===toggleFrame.dataset.toggleModuleFrame);if(frame)toggleModuleFrame(frame);event.preventDefault();event.stopPropagation();return;}
      const reset=event.target.closest('[data-reset-frame]');
      if(reset){const frame=api.editorFrames().find(item=>item.key===reset.dataset.resetFrame);if(frame)resetFrame(frame,targetKinds.get(frame.key)||'box');event.stopPropagation();return;}
      const step=event.target.closest('[data-custom-step]');
      if(step){api.goPage(api.page.id,Number(step.dataset.customStep));event.stopPropagation();return;}
      const imageElement=event.target.closest('main [data-editor-image-key]');
      if(imageElement&&!adjusting){event.preventDefault();event.stopPropagation();chooseImage(imageElement.dataset.editorImageKey);}
    },true);
    document.addEventListener('click',event=>{
      if(!editing||!adjusting)return;
      const button=event.target.closest('[data-rotate-highlight]');if(!button)return;
      event.preventDefault();event.stopPropagation();
      const frame=api.editorFrames().find(item=>item.key===button.closest('[data-controls-key]').dataset.controlsKey);
      if(frame)commitFrame(frame,'box',frame.getBox(),{rotation:Number(button.dataset.rotateHighlight)===0?0:window.VisualLayoutCore.highlightAngle(rotation(frame.key)+Number(button.dataset.rotateHighlight))});
    });
    document.addEventListener('change',event=>{
      if(!editing)return;
      const angleField=event.target.closest('[data-highlight-rotation]');
      if(angleField){const frame=api.editorFrames().find(item=>item.key===angleField.closest('[data-controls-key]').dataset.controlsKey);if(frame&&!commitFrame(frame,'box',frame.getBox(),{rotation:angleField.valueAsNumber}))angleField.value=rotation(frame.key);return;}
      const select=event.target.closest('[data-frame-target]');
      if(select){targetKinds.set(select.dataset.frameTarget,select.value);api.refresh();return;}
      const field=event.target.closest('[data-bound-index]');
      if(field){const controls=field.closest('[data-controls-key]');const frame=api.editorFrames().find(item=>item.key===controls.dataset.controlsKey);if(frame)commitFrame(frame,targetKinds.get(frame.key)||'box',[...controls.querySelectorAll('[data-bound-index]')].map(input=>Number(input.value)));}
    });
    document.addEventListener('pointerdown',event=>{
      if(!editing||!adjusting||event.button!==0)return;
      const target=event.target.closest('[data-frame-key][data-handle]');if(!target)return;
      const frame=api.editorFrames().find(item=>item.key===target.dataset.frameKey);if(!frame)return;
      event.preventDefault();event.stopPropagation();target.focus({preventScroll:true});
      const kind=targetKinds.get(frame.key)||'box';const start=kind==='crop'?frame.getCrop():frame.getBox();
      const angle=kind==='box'?rotation(frame.key):0;
      drag={frame,kind,corner:target.dataset.handle,start,current:[...start],angle,currentAngle:angle,point:point(event,frame.coordinateElement||frame.element),pointerId:event.pointerId,target};
      try{target.setPointerCapture(event.pointerId);}catch{}
      document.body.classList.add('is-dragging-highlight');
    },true);
    document.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      event.preventDefault();const end=point(event,drag.frame.coordinateElement||drag.frame.element);
      if(drag.corner==='rotate'){
        const cx=drag.start[0]+drag.start[2]/2,cy=drag.start[1]+drag.start[3]/2;
        const delta=(Math.atan2(end.y-cy,end.x-cx)-Math.atan2(drag.point.y-cy,drag.point.x-cx))*180/Math.PI;
        let angle=window.VisualLayoutCore.highlightAngle(drag.angle+delta);if(event.shiftKey)angle=Math.round(angle/15)*15;
        drag.currentAngle=angle;drag.current=window.VisualLayoutCore.fitHighlight(drag.start,angle,drag.frame.width,drag.frame.height);
      }else drag.current=adjustedBox(drag.start,drag.corner,end.x-drag.point.x,end.y-drag.point.y,drag.frame,drag.angle);
      const layer=drag.frame.element.querySelector('.editor-handle-layer');if(layer)setLayer(layer,drag.current,drag.frame,drag.currentAngle);
    },{passive:false});
    const finish=(event,cancelled=false)=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      const finished=drag;drag=null;document.body.classList.remove('is-dragging-highlight');
      try{finished.target.releasePointerCapture(finished.pointerId);}catch{}
      if(!cancelled&&(Math.abs(finished.currentAngle-finished.angle)>.01||finished.current.some((value,index)=>Math.abs(value-finished.start[index])>.01)))commitFrame(finished.frame,finished.kind,finished.current,{rotation:finished.currentAngle});else api.refresh();
      focusHandle(finished.frame.key,finished.corner);
    };
    document.addEventListener('pointerup',event=>finish(event));document.addEventListener('pointercancel',event=>finish(event,true));
    document.addEventListener('keydown',event=>{
      if(!editing)return;
      if(event.key==='Escape'&&drag){event.preventDefault();event.stopImmediatePropagation();try{drag.target.releasePointerCapture(drag.pointerId);}catch{}drag=null;document.body.classList.remove('is-dragging-highlight');api.refresh();return;}
      const target=event.target.closest('[data-frame-key][data-handle]');if(!target||!adjusting||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();event.stopImmediatePropagation();const frame=api.editorFrames().find(item=>item.key===target.dataset.frameKey);if(!frame)return;
      const kind=targetKinds.get(frame.key)||'box';const start=kind==='crop'?frame.getCrop():frame.getBox();const amount=event.shiftKey?10:1;
      if(target.dataset.handle==='rotate'){
        const sign=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;
        commitFrame(frame,'box',start,{rotation:window.VisualLayoutCore.highlightAngle(rotation(frame.key)+sign*(event.shiftKey?15:1))});focusHandle(frame.key,'rotate');return;
      }
      const next=adjustedBox(start,target.dataset.handle,event.key==='ArrowLeft'?-amount:event.key==='ArrowRight'?amount:0,event.key==='ArrowUp'?-amount:event.key==='ArrowDown'?amount:0,frame,kind==='box'?rotation(frame.key):0);
      commitFrame(frame,kind,next);focusHandle(frame.key,target.dataset.handle);
    },true);
    document.addEventListener('click',event=>{
      if(editing)return;const step=event.target.closest('[data-custom-step]');if(step)api.goPage(api.page.id,Number(step.dataset.customStep));
    });
    report(restored?'已恢復上次草稿，請儲存 JSON 設定':'點選虛線框即可編輯；請儲存 JSON 設定保存');
  }
  window.generalRoadEditor={prepare,restorePages,connect,decorate,decorateAsset,image,bounds,rotation,serialize,setEditing,setAdjusting,addPage,movePage,removePage,replaceImage,getComparisonTransform,setComparisonTransform,get state(){return state;},get editing(){return editing;},get adjusting(){return adjusting;},needsAlignment:id=>Boolean(state.disabledHighlights['article:'+id])};
})();
