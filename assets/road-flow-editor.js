(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RoadFlowEditor=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value)),round=n=>Math.round(n*1000)/1000;
  let app=null,current=null,openedPage='',routeId='',selected=0,adding=false;
  function curve(points){
    if(!Array.isArray(points)||points.length<2||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n))))throw new Error('動線節點無效');
    const pair=p=>p.map(round).join(' ');let d='M '+pair(points[0]);
    for(let i=0;i<points.length-1;i++){const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],e=points[Math.min(points.length-1,i+2)];d+=' C '+pair(b.map((n,j)=>n+(c[j]-a[j])/6))+' '+pair(c.map((n,j)=>n-(e[j]-b[j])/6))+' '+pair(c);}
    return d;
  }
  function pathsFor(page,config){
    const content=page.content||page,settings=config?.roadFlowPaths?.[page.id],saved=settings?.assetKey===content.images[0].key?settings.routes:[];
    return content.flowPaths.map(route=>{const override=saved?.find(item=>item.id===route.id);return override?{...route,path:curve(override.points)}:route;});
  }
  const editor=()=>window.visualLayoutEditor;
  const editable=()=>!window.PresentationMode?.readOnly&&!editor()?.busy;
  function cleanup(){
    if(!current)return;if(current.drag){model().path.setAttribute('d',current.drag.path);}current.abort.abort();current.layer.remove();current.panel.remove();current.observer.disconnect();current.svg.classList.remove('is-road-path-editing','is-adding-road-point');current=null;document.body.classList.remove('is-road-flow-editing');
  }
  function beforeNavigate(id){cleanup();if(openedPage!==id){openedPage='';adding=false;}}
  function close(){openedPage='';adding=false;cleanup();}
  function position(){
    if(!current)return;const copy=document.querySelector('.road-clarity-copy').getBoundingClientRect(),width=Math.min(300,innerWidth-24),left=innerWidth>900?Math.min(copy.left,innerWidth-width-12):innerWidth-width-12,top=innerWidth>900?Math.max(96,Math.min(copy.top,innerHeight-310)):Math.max(100,innerHeight-300);
    Object.assign(current.panel.style,{left:left+'px',top:top+'px',width:width+'px',maxHeight:Math.max(150,innerHeight-top-20)+'px'});
  }
  function sample(path){const length=path.getTotalLength(),count=Math.max(6,Math.min(48,Math.ceil(length/110)));return Array.from({length:count+1},(_,i)=>{const p=path.getPointAtLength(i/count*length);return [round(p.x),round(p.y)];});}
  function model(){return current.models.find(route=>route.id===routeId)||current.models[0];}
  function updatePath(route){route.path.setAttribute('d',curve(route.points));}
  function draw(){
    if(!current)return;const route=model();routeId=route.id;selected=Math.max(0,Math.min(route.points.length-1,selected));
    current.panel.querySelector('select').value=routeId;current.panel.querySelector('[data-rp-remove]').disabled=route.points.length<=2;
    current.panel.querySelector('[data-rp-add]').setAttribute('aria-pressed',String(adding));current.panel.querySelector('[data-rp-count]').textContent=`${route.points.length} 個節點 · 已選第 ${selected+1} 點`;
    current.svg.classList.toggle('is-adding-road-point',adding);
    for(const item of current.models)item.path.classList.toggle('is-route-selected',item===route);
    const matrix=current.art.getScreenCTM(),scale=Math.hypot(matrix.a,matrix.b)||1;
    if(current.renderedRoute!==route.id||current.layer.children.length!==route.points.length)current.layer.replaceChildren();current.renderedRoute=route.id;
    route.points.forEach(([x,y],index)=>{let circle=current.layer.children[index];if(!circle){circle=document.createElementNS('http://www.w3.org/2000/svg','circle');current.layer.append(circle);}for(const [key,value]of Object.entries({cx:x,cy:y,r:(index===selected?9:7)/scale,tabindex:0,role:'button','aria-label':'路徑節點 '+(index+1),'data-road-node':index,'data-handle':'road-point'}))circle.setAttribute(key,value);circle.classList.add('road-path-node');circle.classList.toggle('is-selected',index===selected);});
  }
  function commit(route){
    if(!current||!editable())return false;const page=current.page;
    return editor().transact(config=>{const stored=config.roadFlowPaths[page.id];let routes=stored?.assetKey===page.content.images[0].key?clone(stored.routes):[];routes=routes.filter(item=>item.id!==route.id);routes.push({id:route.id,points:clone(route.points)});config.roadFlowPaths[page.id]={assetKey:page.content.images[0].key,routes};},false);
  }
  function coordinates(event){const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(current.art.getScreenCTM().inverse()),asset=app.data.embeddedAssets[current.page.content.images[0].key];return [round(Math.max(-100,Math.min(asset.width+100,point.x))),round(Math.max(-100,Math.min(asset.height+100,point.y)))];}
  function mount(api){
    app=api;cleanup();if(!openedPage||api.page.id!==openedPage||api.page.resultType!=='road-clarity'||!editable())return;
    const page=api.page,svg=document.querySelector('.road-clarity-figure svg.results-diagram'),art=svg.querySelector('[data-results-artwork]'),panel=document.createElement('section'),layer=document.createElementNS('http://www.w3.org/2000/svg','g'),abort=new AbortController();
    const settings=editor().store.config.roadFlowPaths?.[page.id],saved=settings?.assetKey===page.content.images[0].key?settings.routes:[];
    const models=[...svg.querySelectorAll('.road-flow-path')].map(path=>{const override=saved?.find(route=>route.id===path.dataset.roadRoute);return {id:path.dataset.roadRoute,path,points:override?clone(override.points):sample(path)};});
    const names={'north-west':'北側進入 → 西側離開','south-east':'南側進入 → 東側離開','east-west':'東側進入 → 西側離開'};
    panel.className='road-path-panel';panel.dataset.editorUi='road-path-editor';panel.setAttribute('aria-label','發光路線設定');
    panel.innerHTML='<div class="road-path-heading"><strong>發光路線設定</strong><button type="button" data-rp-close aria-label="關閉路徑設定">×</button></div><label>選擇路徑<select aria-label="選擇發光路線"></select></label><p>拖曳節點調整路線。新增節點後，點選圖面放置；選取節點可刪除，也可用方向鍵微調。</p><small data-rp-count></small><div class="road-path-actions"><button type="button" data-rp-add aria-pressed="false">新增節點</button><button type="button" data-rp-remove>刪除節點</button><button type="button" data-rp-reset>還原這條路徑</button><button type="button" data-rp-save>儲存路徑</button></div><p class="road-path-note" role="status" aria-live="polite">修改後請儲存路徑；切頁及重新開啟會沿用已儲存的設定。</p>';
    for(const [index,route]of models.entries())panel.querySelector('select').add(new Option(names[route.id]||'路徑 '+(index+1),route.id));
    layer.dataset.editorUi='road-path-handles';layer.classList.add('road-path-handles');art.append(layer);document.body.append(panel);svg.classList.add('is-road-path-editing');document.body.classList.add('is-road-flow-editing');
    current={page,svg,art,panel,layer,models,abort,observer:new ResizeObserver(()=>{position();draw();}),drag:null};current.observer.observe(svg);position();draw();
    const listen=(node,type,handler,options={})=>node.addEventListener(type,handler,{...options,signal:abort.signal});
    listen(panel,'change',event=>{if(event.target.tagName==='SELECT'){routeId=event.target.value;selected=0;adding=false;draw();}});
    listen(panel,'click',async event=>{const button=event.target.closest('button');if(!button)return;event.preventDefault();if(button.hasAttribute('data-rp-close')){close();return;}if(!editable())return;
      const route=model();if(button.hasAttribute('data-rp-add')){adding=!adding;draw();}
      if(button.hasAttribute('data-rp-remove')&&route.points.length>2){route.points.splice(selected,1);updatePath(route);commit(route);draw();}
      if(button.hasAttribute('data-rp-reset')){const original=page.content.flowPaths.find(item=>item.id===route.id);route.path.setAttribute('d',original.path);route.points=sample(route.path);editor().transact(config=>{const entry=config.roadFlowPaths[page.id];if(entry){entry.routes=entry.routes.filter(item=>item.id!==route.id);if(!entry.routes.length)delete config.roadFlowPaths[page.id];}},false);selected=0;draw();}
      if(button.hasAttribute('data-rp-save')){const note=panel.querySelector('.road-path-note');button.disabled=true;note.textContent='正在儲存路線…';try{const result=await editor().save();note.textContent=result?.saved?'路線已寫入專案，重新整理後仍會保留。':result?.download?'已匯出專案檔；匯入並寫回專案後，重新整理才能保留。':result?.error||'路線尚未儲存，請再試一次。';}finally{button.disabled=false;}}
    });
    listen(svg,'pointerdown',event=>{const node=event.target.closest('[data-road-node]');if(adding&&!node&&event.button===0){event.preventDefault();event.stopImmediatePropagation();return;}if(!node||event.button!==0||!editable())return;event.preventDefault();event.stopImmediatePropagation();selected=Number(node.dataset.roadNode);const route=model();current.drag={pointerId:event.pointerId,points:clone(route.points),path:route.path.getAttribute('d')};svg.setPointerCapture(event.pointerId);draw();}, {capture:true});
    listen(document,'pointermove',event=>{if(!current.drag||event.pointerId!==current.drag.pointerId)return;event.preventDefault();event.stopImmediatePropagation();model().points[selected]=coordinates(event);updatePath(model());draw();},{capture:true});
    const finish=(event,cancel=false)=>{if(!current?.drag||event.pointerId!==current.drag.pointerId)return;event.preventDefault();event.stopImmediatePropagation();const drag=current.drag;current.drag=null;if(cancel||JSON.stringify(model().points)===JSON.stringify(drag.points)){model().points=drag.points;model().path.setAttribute('d',drag.path);}else commit(model());try{svg.releasePointerCapture(event.pointerId);}catch{}draw();};
    listen(document,'pointerup',event=>finish(event),{capture:true});listen(document,'pointercancel',event=>finish(event,true),{capture:true});listen(window,'blur',()=>{if(current?.drag)finish({pointerId:current.drag.pointerId,preventDefault(){},stopImmediatePropagation(){}},true);});
    listen(svg,'click',event=>{if(!adding&&!event.target.closest('[data-road-node]'))return;event.preventDefault();event.stopImmediatePropagation();if(adding&&editable()){
      const route=model();if(route.points.length>=100)return;const point=coordinates(event);let best=Infinity,at=1;for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1))),distance=Math.hypot(point[0]-a[0]-dx*t,point[1]-a[1]-dy*t);if(distance<best){best=distance;at=i;}}
      route.points.splice(at,0,point);selected=at;adding=false;updatePath(route);commit(route);draw();
    }},{capture:true});
    listen(document,'keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(current.drag){model().points=current.drag.points;model().path.setAttribute('d',current.drag.path);current.drag=null;draw();}else close();return;}if(!event.target.closest('[data-road-node]')||!editable())return;
      selected=Number(event.target.dataset.roadNode);
      if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();draw();current.layer.querySelector(`[data-road-node="${selected}"]`)?.focus({preventScroll:true});}
      if(['Delete','Backspace'].includes(event.key)&&model().points.length>2){event.preventDefault();event.stopImmediatePropagation();model().points.splice(selected,1);updatePath(model());commit(model());draw();current.layer.querySelector(`[data-road-node="${selected}"]`)?.focus({preventScroll:true});}
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();const point=model().points[selected],step=event.shiftKey?10:2,asset=app.data.embeddedAssets[page.content.images[0].key];point[0]=Math.max(-100,Math.min(asset.width+100,point[0]+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0)));point[1]=Math.max(-100,Math.min(asset.height+100,point[1]+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)));updatePath(model());commit(model());draw();current.layer.querySelector(`[data-road-node="${selected}"]`)?.focus({preventScroll:true});}
    },{capture:true});
    listen(window,'resize',position);
  }
  function open(){if(!app||!editable())return;openedPage=app.page.id;adding=false;if(editor().editing)editor().setMode(false);if(window.generalRoadEditor.editing)window.generalRoadEditor.setEditing(false);mount(app);}
  if(typeof document==='object')document.addEventListener('click',event=>{if(!event.target.closest('[data-road-path-edit]'))return;event.preventDefault();if(current)close();else open();});
  return {curve,pathsFor,mount,beforeNavigate,cleanup,close,get isOpen(){return Boolean(current);}};
});
