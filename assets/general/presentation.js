
'use strict';
(async () => {
  await window.presentationDataReady;
  await window.visualLayoutReady;
  const repository=window.PresentationRepository;
  await window.PresentationReferences?.ready;
  const data = repository?repository.fresh():JSON.parse(document.getElementById('presentation-data').textContent);
  await window.presentationModulesReady;
  await window.presentationStructureReady;
  await window.presentationScenariosReady;
  await window.presentationResultsReady;
  window.PresentationScenarios?.prepare(data);
  window.PresentationModules?.prepare(data);
  window.generalRoadConditions?.prepare(data);
  window.PresentationResults?.prepare(data);
  const editor = window.generalRoadEditor;
  const viewport = window.generalRoadViewport;
  editor?.prepare(data);
  const scenarioUI = (window.RoadScenarioComponents||window.generalRoadScenarios).create(data);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fullView = [0, 0, 1402, 913];
  // Keep editable boxes in the source SVG coordinates; rotate them for display.
  const scene = () => window.PresentationScenarios.sceneFor(currentPage(),data);
  const scenarioArticles = (value=scene()) => scenarioUI.articles(value);
  const displayBounds = bounds => window.PresentationScenarios.bounds(bounds,scene());
  const sourceBounds = bounds => window.PresentationScenarios.bounds(bounds,scene(),true);
  function pageTitle(page){
    if(page.kind==='results')return window.PresentationResults.pageTitle(page);
    if(page.kind==='module')return window.PresentationModules.pageTitle(page);
    if(page.kind==='presentations-home')return window.PresentationStructure.manifest.title;
    if(page.kind==='cover')return data.cover.title;
    if(page.kind==='general-ending')return page.ending==='closing'?data.conclusion.closing.title:data.conclusion.title;
    if(page.kind==='scenario-directory')return '全部情境總覽';
    if(page.kind==='chapter-scenarios')return '無號誌三岔路口從正交，到匯入。';
    if(page.kind==='current-conditions')return '現況分析';
    if(page.kind==='scenario-comparison')return /^G\d-\d{2}$/.test(window.PresentationScenarios.sceneFor(page,data).code)?'行穿線設置條件與方案比較':'有、無行穿線，怎麼選？';
    if(page.kind==='map')return !page.article?'整體佈設策略':page.article.category==='道路設施'?'道路設施運用解說':(page.article.category||'交通設施')+'條文運用解說';
    if(['context','review'].includes(page.kind)){
      const value=window.PresentationScenarios.sceneFor(page,data);
      return page.kind==='context'?value.name:/^G\d-\d{2}$/.test(value.code)?'情境小結':value.presentation?.review?.title||value.recapTitle||'同一章節，不同的設置重點。';
    }
    if(page.kind==='custom')return {cover:'在這裡寫下你的章節標題',image:'情境與設置議題',closing:'回到情境，整理設置重點。',compare:'左右圖例比較',steps:'情境圖面逐步解說'}[page.type]||page.name;
    return page.name;
  }
  const pages = [
    {id:'presentations',chapter:'presentations',kind:'presentations-home',name:'四場簡報總覽'},
    ...(window.PresentationStructure?.placeholders()||[]),
    ...(window.PresentationResults?.pages()||[]),
    { id:'cover', chapter:'intro', kind:'cover', name:'一般道路情境' },
    { id:'contents', chapter:'intro', kind:'results', resultType:'outline', name:'簡報大綱', content:{title:'簡報大綱',deck:'general',eyebrow:'CONTENTS / 03'} },
    {id:'general-scenarios-index',chapter:'intro',kind:'scenario-directory',name:'全部情境總覽'},
    ...(window.PresentationModules?.pages()||[]),
    { id:'g1-scenarios',chapter:'g1',kind:'chapter-scenarios',name:'G1 章內情境總覽' },
    ...data.scenarios.flatMap(scenarioUI.pages),
    ...data.chapters.slice(2).filter(chapter=>chapter.group).map(chapter => ({id:chapter.id, chapter:chapter.id, kind:'opening', name:chapter.name})),
    {id:'general-conclusion',chapter:'general-conclusion',kind:'general-ending',ending:'conclusion',name:data.conclusion.title},
    {id:'general-closing',chapter:'general-conclusion',kind:'general-ending',ending:'closing',name:data.conclusion.closing.title}
  ];
  window.PresentationScenarios?.extendPages(pages,data);
  window.PresentationStructure?.addChapterCovers(pages);
  editor?.restorePages(pages);
  window.PresentationModules?.syncPages(pages);
  window.PresentationStructure?.organize(pages);
  window.PresentationOrder?.organize(pages,data,window.visualLayoutEditor?.store.config);
  const generalArticle=page=>Boolean(page.article&&/^g[1-4]-\d{2}$/.test(page.scenario));
  const makeStops = () => pages.flatMap((page,index) => generalArticle(page)?[{page:index,phase:1}]:Array.from({length:page.article?2:page.kind==='results'?window.PresentationResults.stepCount(page):page.kind==='module'?page.stepCount||1:page.kind==='custom'&&['steps','compare'].includes(page.type)?page.steps.length:1},(_,phase)=>({page:index,phase})));
  const stops = makeStops();
  let position = -1;
  let fullPeek = false;
  let animation = 0;
  let animationEnd = 0;
  let overviewResizeObserver;
  let rotation = 0;
  let shownAsset = 'overall';
  let appliedRevision=repository?.revision||0,navigationVersion=0,pendingNavigation=Promise.resolve();
  const loadStatus=document.createElement('div');loadStatus.className='presentation-load-status';loadStatus.hidden=true;loadStatus.setAttribute('role','status');loadStatus.setAttribute('aria-live','polite');
  const loadMessage=document.createElement('span'),loadRetry=document.createElement('button'),loadCancel=document.createElement('button');loadRetry.type=loadCancel.type='button';loadRetry.textContent='重試';loadCancel.textContent='取消';loadStatus.append(loadMessage,loadRetry,loadCancel);document.body.append(loadStatus);
  loadRetry.dataset.loadRetry='true';loadCancel.dataset.loadCancel='true';
  let retryNavigation=null;
  loadRetry.onclick=()=>retryNavigation?.();loadCancel.onclick=()=>{navigationVersion++;pendingNavigation=Promise.resolve();loadStatus.hidden=true;retryNavigation=null;};
  function synchronizeData(){
    if(!repository||appliedRevision===repository.revision)return;
    repository.apply(data);window.PresentationScenarios.prepare(data);window.PresentationModules.prepare(data);window.PresentationResults.prepare(data);window.generalRoadConditions.prepare(data);editor.prepare(data);
    for(const page of pages)if(page.article)page.article=data.articles.find(article=>article.id===page.article.id);
    appliedRevision=repository.revision;
  }
  function loadPage(page,phase,options,version){
    loadStatus.hidden=false;loadStatus.classList.remove('is-error');loadMessage.textContent='正在載入內容…';loadRetry.hidden=true;loadCancel.hidden=false;
    const promise=repository.ensurePage(page).then(()=>{
      if(version!==navigationVersion)return false;
      synchronizeData();loadStatus.hidden=true;return goPage(page.id,phase,{...options,fromLoad:true});
    }).catch(error=>{
      if(version!==navigationVersion)return false;
      console.warn('簡報內容載入失敗',error);loadStatus.hidden=false;loadStatus.classList.add('is-error');loadMessage.textContent='這一頁暫時無法載入，請重試或選擇其他內容。';loadRetry.hidden=false;
      retryNavigation=()=>goPage(page.id,phase,options);
      if(position<0){const home=stops.findIndex(stop=>pages[stop.page].id==='presentations');navigate(home,{hash:false,fromLoad:true,keepLoadStatus:true});}
      return false;
    });
    pendingNavigation=promise;return promise;
  }
  const current = () => stops[Math.max(0,position)];
  const currentPage = () => pages[current().page];
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const image = key => data.embeddedAssets[key].url;
  const overallImage = (id='') => {const value=scene();return `<g${id?` id="${id}"`: ''} transform="${window.PresentationScenarios.transform(value)}"><image href="${image(value.overall)}" width="${value.width}" height="${value.height}"/></g>`;};
  const svgImage = (key, viewBox, className = '') => `<svg class="${className}" viewBox="${viewBox.join(' ')}" aria-hidden="true"><image href="${image(key)}" width="${data.embeddedAssets[key].width}" height="${data.embeddedAssets[key].height}"/></svg>`;
  function roadSymbol(cross = false, signal = false) {
    return `<svg class="road-symbol" viewBox="0 0 160 145" aria-hidden="true"><path class="road" d="${cross ? 'M57 0h46v44h57v46h-57v55H57V90H0V44h57Z' : 'M57 0h46v44h57v46h-57v55H57Z'}"/><path class="centerline" d="M80 0v145M${cross ? '0' : '80'} 67h160"/>${signal ? '<g transform="translate(105 6)"><rect class="signal-case" width="14" height="36" rx="5"/><circle class="signal-light" cx="7" cy="8" r="3.3"/><circle class="signal-light" cx="7" cy="18" r="3.3"/><circle class="signal-light" cx="7" cy="28" r="3.3"/></g>' : ''}</svg>`;
  }
  function chapterButton(chapter) {
    return `<button type="button" data-chapter="${chapter.id}"><span>${chapter.code}</span>${chapter.short}</button>`;
  }
  $('chapters').innerHTML = data.chapters.map(chapterButton).join('');
  function updateContents() {
    $('page-total').textContent = String(pages.length).padStart(2,'0');
    const visible=editor?.editing?pages:pages.filter(page=>!window.PresentationOrder?.hidden(page));
    if(window.PresentationStructure)window.PresentationStructure.refreshToc(visible,scenarioUI);else $('toc-content').innerHTML=scenarioUI.toc(visible);
  }
  updateContents();

  const generalScenes=()=>data.scenarios.filter(scene=>!scene.code.startsWith('C'));
  function cover() {
    return window.PresentationResults.render({id:'cover',resultType:'cover',content:data.cover},data);
  }
  function context() {
    return scenarioUI.context(scene());
  }
  function mapShell(comparison='') {
    return `<section class="slide map-slide${comparison?' is-overview overview-comparison-slide':''}" aria-labelledby="slide-title"><div class="map-heading"><div><span class="eyebrow" id="map-eyebrow">${comparison?esc(scene().code)+' / SCENARIO OVERVIEW':''}</span><h1 id="slide-title">${comparison?'整體佈設策略':''}</h1></div><span class="case-code">${comparison?esc(scene().code+' / '+scene().setting+'・'+(scene().geometry||'正交')):'G1-01 / 市區・正交'}</span></div><div class="map-layout">${comparison || `<figure class="map-card" style="margin:0"><div class="map-toolbar"><strong id="figure-name">情境整體配置圖</strong><div class="map-tools"><span class="map-status"><i></i><span id="map-status">全圖</span></span><button id="peek-map" type="button" hidden>回看全圖 ↙</button><button id="original-map" type="button" title="開啟情境完整圖面">⛶ 原圖</button></div></div><div class="map-canvas"><svg id="main-map" class="main-map" viewBox="${fullView.join(' ')}" role="img" aria-labelledby="map-svg-title"><title id="map-svg-title">G1-01 無號誌市區正交三岔路口交通設施整體圖</title>${overallImage('map-artwork')}<g id="selection-group" style="display:none"><path id="map-shade" class="map-shade" fill-rule="evenodd"/><rect id="selection-box" class="selection-box" rx="3"/><path id="selection-corners" class="selection-corners"/><text id="selection-label-outline" class="selection-label selection-label-outline" aria-hidden="true"></text><text id="selection-label" class="selection-label"></text></g></svg><span class="zoom-label" id="zoom-label" hidden></span></div><figcaption class="map-foot"><span>圖 4.1 / 原始 SVG 圖面</span><span>琥珀色框線為講解位置提示</span></figcaption></figure>`}<aside class="explanation" id="explanation" aria-label="情境與條文解說">${comparison?overviewExplanation():''}</aside></div><nav class="article-nav" aria-label="本情境條文與設施解說快速選擇"><span class="nav-label">條文索引</span>${scenarioArticles().map(article=>`<button class="article-chip" data-page="${article.id}" title="${esc(article.reference||'《設置規則》§ '+article.reg)} ${article.name}"><span>${article.regLabel||'§ '+article.reg}</span>${article.name.replace('枕木紋行人穿越道線','行穿線').replace('路口行車導引線','導引線').replace('當心行人標誌','當心行人').replace('最高速限標誌','速限標誌')}</button>`).join('')}</nav></section>`;
  }
  function overviewExplanation() {
    return scenarioUI.overview(scene());
  }
  function explainArticle(article, phase) {
    const index = scenarioArticles().indexOf(article)+1;
    const top = `<div class="explain-topline"><span class="tag ${phase===0?'warm':''}">${esc(article.reference||`《設置規則》§ ${article.reg}`)}</span><span class="explain-index">${String(index).padStart(2,'0')} / ${String(scenarioArticles().length).padStart(2,'0')}　${article.category}</span></div>`;
    if (phase === 0) return `<div>${top}<div class="locate-number">${String(index).padStart(2,'0')}</div><p class="locate-caption">${/^G\d-\d{2}$/.test(scene().code)?'01 / 設施位置與配置':'01 / 在全圖定位'}</p><h2>${esc(article.name)}</h2><p class="explain-intro">${esc(article.locate)}</p><div class="locate-instruction"><p>${/^G\d-\d{2}$/.test(scene().code)?'琥珀色框線標示設施位置。<br>放大圖面提供設置細節與解說。':'琥珀色框線標示本次說明的位置。<br>下一步放大圖面，對照右側解說。'}</p><button class="primary-button" data-action="zoom">放大並解說 <span>↗</span></button></div><div class="phase-steps"><span class="on">01 框選定位</span><i></i><span>02 放大解說</span></div></div>`;
    return `<div>${top}<h2>${esc(article.name)}</h2><div class="metric-row content-block-removed" hidden data-template-hidden aria-hidden="true"><div class="metric-value">${esc(article.metric)}<small>${esc(article.unit)}</small></div><div class="metric-label">${esc(article.metricLabel)}</div></div><ol class="explain-points">${article.points.map(point=>`<li><span>${esc(point)}</span></li>`).join('')}</ol><div class="takeaway">${esc(article.takeaway)}</div><div class="explain-footer">${article.asset?'<button class="text-button" data-action="supplement">補充圖例 ↗</button>':''}<button class="text-button" data-action="source">指引原文 ↗</button></div><p class="source-line">${/^G\d-\d{2}$/.test(scene().code)?'資料：本情境設置圖例及運用解說':'依提供之指引稿整理'} / ${article.page?'PDF 第 '+article.page+' 頁':/^G\d-\d{2}$/.test(scene().code)?'設置解說':'本情境 Typst 稿件'}${article.sign?' / '+article.sign:''}</p></div>`;
  }
  function cancelMapAnimation() {
    cancelAnimationFrame(animation);
    clearTimeout(animationEnd);
  }
  function animateViewBox(target, animate) {
    cancelMapAnimation();
    const svg = $('main-map');
    const start = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    const write=view=>{svg.setAttribute('viewBox',view.join(' '));viewport?.sync(svg);};
    if (!animate || reducedMotion()) { write(target); return; }
    const since = performance.now();
    const tick = () => {
      const t = Math.max(0,Math.min(1,(performance.now()-since)/650));
      const eased = 1-Math.pow(1-t,3);
      write(target.map((value,i)=>start[i]+(value-start[i])*eased));
      if(t<1) animation=requestAnimationFrame(tick);
    };
    animation=requestAnimationFrame(tick);
    animationEnd=setTimeout(()=>{
      cancelAnimationFrame(animation);
      if(svg.isConnected) write(target);
    },680);
  }
  function overviewHome(svg) {
    const rect=svg.getBoundingClientRect(),height=fullView[2]*Math.max(1,rect.height)/Math.max(1,rect.width);
    return [0,(fullView[3]-height)/2,fullView[2],height];
  }
  function watchOverview(svg,pageId) {
    let {width,height}=svg.getBoundingClientRect();
    const observer=new ResizeObserver(()=>{
      if(!svg.isConnected||currentPage().id!==pageId||currentPage().article){observer.disconnect();return;}
      const rect=svg.getBoundingClientRect();
      if(!rect.width||!rect.height||Math.abs(width-rect.width)<.01&&Math.abs(height-rect.height)<.01)return;
      width=rect.width;height=rect.height;cancelMapAnimation();
      const control=viewport.get(svg),view=control.read(),nextHeight=view[2]*height/Math.max(1,width);
      control.configure({home:overviewHome(svg)});
      control.write([view[0],view[1]+(view[3]-nextHeight)/2,view[2],nextHeight],false);
    });
    overviewResizeObserver=observer;observer.observe(svg);
  }
  function updateMap(pageChanged = false) {
    overviewResizeObserver?.disconnect();
    const page = currentPage();
    const currentScene=scene();
    const article = page.article;
    // Reusing the map shell must also update the source image geometry.
    // Asset decoration can replace href, but dimensions and native rotation belong to this article.
    const artwork=$('map-artwork'),drawing=artwork.querySelector('image');
    artwork.setAttribute('transform',window.PresentationScenarios.transform(currentScene));
    drawing.setAttribute('width',currentScene.width);
    drawing.setAttribute('height',currentScene.height);
    if(drawing.getAttribute('href')!==image(currentScene.overall))drawing.setAttribute('href',image(currentScene.overall));
    $('main-map').closest('.map-slide').classList.toggle('is-overview',!article);
    const phase = current().phase;
    $('main-map').closest('.map-slide').classList.toggle('is-article-explanation',Boolean(article&&phase===1));
    const articleView = Boolean(article && phase === 1 && !editor?.adjusting && !editor?.needsAlignment(article.id));
    const zoomed = articleView && !fullPeek;
    $('map-eyebrow').textContent = article ? `${currentScene.code} / ${article.category==='標線'?'MARKING':article.category==='標誌'?'SIGNAGE':article.category==='號誌'?'SIGNAL':'ROAD FACILITY'} APPLICATION` : `${currentScene.code} / SCENARIO OVERVIEW`;
    const articleTitle = pageTitle(page);
    $('slide-title').textContent = articleTitle;
    $('figure-name').textContent = `${currentScene.code} / ${article?article.name:'情境整體配置圖'}`;
    document.querySelector('.case-code').textContent=`${currentScene.code} / ${currentScene.setting}・${currentScene.geometry||'正交'}`;
    document.querySelector('.map-foot>span').textContent=`${currentScene.figure} / 原始 SVG 圖面`;




    $('zoom-label').hidden = !zoomed;
    $('zoom-label').textContent = article ? `${article.regLabel||'§ '+article.reg} / 局部放大` : '';
    $('map-svg-title').textContent = article ? `${currentScene.code} ${article.name}，${zoomed?'局部放大':'全圖框選位置'}` : currentScene.code+' '+currentScene.name+'交通設施整體圖';
    $('selection-group').style.display = article && !editor?.state.highlights['article:'+article.id]?.deleted && (editor?.adjusting || !editor?.needsAlignment(article.id)) ? '' : 'none';
    $('main-map').dataset.editorImageKey=currentScene.overall;
    $('main-map').dataset.scenarioId=currentScene.id;
    if(article) {
      const [x,y,w,h] = displayBounds(article.box);
      const angle=editor?.rotation('article:'+article.id)||0,geometry=window.VisualLayoutCore,boxBounds=[x,y,w,h];
      const transform=geometry.highlightTransform(boxBounds,angle),envelope=geometry.highlightBounds(boxBounds,angle);
      for (const id of ['selection-box']) {
        const box = $(id);
        for(const [key,value] of Object.entries({x,y,width:w,height:h})) box.setAttribute(key,value);
        box.setAttribute('transform',transform);
      }
      const c=Math.min(12,w/3,h/3);
      $('selection-corners').setAttribute('d',`M${x} ${y+c}v-${c}h${c}M${x+w-c} ${y}h${c}v${c}M${x+w} ${y+h-c}v${c}h-${c}M${x+c} ${y+h}h-${c}v-${c}`);
      $('selection-corners').setAttribute('transform',transform);
      const shadeHole=geometry.highlightCorners([x-9,y-9,w+18,h+18],angle).map(p=>p.join(' ')).join('L');
      $('map-shade').setAttribute('d',`M0 0H${fullView[2]}V${fullView[3]}H0Z M${shadeHole}Z`);
      $('map-shade').style.opacity=phase===0&&!fullPeek?'1':'0';
      // Draw a wider black stroke behind the existing white text halo.
      for(const id of ['selection-label-outline','selection-label']) {
        $(id).setAttribute('x',envelope[0]-2);
        $(id).setAttribute('y',envelope[1]-17);
        $(id).textContent=`§ ${article.reg}`;
      }
    }
    if(pageChanged) $('main-map').setAttribute('viewBox',fullView.join(' '));
    const target=zoomed?displayBounds(article.crop):article?fullView:overviewHome($('main-map'));
    viewport?.attach($('main-map'),{
      home:article?fullView:overviewHome($('main-map')),
      resetView:articleView?displayBounds(article.crop):article?fullView:overviewHome($('main-map')),
      fullLabel:article?'全圖定位':'完整圖面',
      onStart:cancelMapAnimation,
      onSync:()=>{
        const control=viewport.get($('main-map')),partial=control?.partial;
        $('zoom-label').hidden=!control||control.zoom<=1+1e-6;
        $('map-shade').style.opacity=article&&phase===0&&!fullPeek&&!partial?'1':'0';
      },
      onReset:()=>{
        fullPeek=false;
      },
      onFullView:()=>{
        fullPeek=Boolean(article);
      }
    });
    animateViewBox(target,!pageChanged||(zoomed&&Boolean(editor?.editing)));
    if(!article)watchOverview($('main-map'),page.id);
    $('explanation').innerHTML=article?explainArticle(article,phase):overviewExplanation();
    $('explanation').scrollTop=0;
    document.querySelectorAll('.article-chip').forEach(button=>{
      const active=button.dataset.page===page.id;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
  }
  function review() {
    return scenarioUI.review(scene());
  }
  function opening(page) {
    const chapter=data.chapters.find(item=>item.id===page.chapter);
    const cross=['g3','g4'].includes(page.chapter);
    const signal=['g2','g4'].includes(page.chapter);
    return `<section class="slide chapter-opening" aria-labelledby="slide-title"><div><div class="eyebrow">${chapter.code} / ${chapter.group} ROAD SCENARIOS</div><h1 id="slide-title">${signal?'號誌化':'無號誌'}<br>${cross?'四岔':'三岔'}路口</h1><span class="tag">章節預留</span><p>以${signal?'號誌化':'無號誌'}${cross?'四岔':'三岔'}路口為本章主題，依市區與鄉區、正交與斜交，編排 ${chapter.count} 種情境。</p><p>後續可延續 G1-01 的講解方式：<br>情境大圖 → 框選定位 → 放大解說。</p><div class="opening-actions"><button class="primary-button" data-page="overview">回到 G1-01 示範 <span>↗</span></button><button class="text-button" data-action="toc">查看目錄</button></div><div class="opening-status">本次 demo 已建立章節開場；本章的情境圖面與條文解說待加入。</div></div><div class="opening-art"><span class="opening-number">${chapter.code}</span>${roadSymbol(cross,signal)}<span class="eyebrow">${chapter.group} / ${signal?'SIGNALIZED':'UNSIGNALIZED'} ${cross?'CROSS':'T'}-INTERSECTION</span></div></section>`;
  }
  function captureScroll(){
    const root=$('presentation'),nodes=[];
    for(const element of [root,...root.querySelectorAll('*')]){
      if(!(element.scrollTop||element.scrollLeft))continue;
      const path=[];let node=element;
      while(node!==root){const parent=node.parentElement;if(!parent)break;path.unshift([...parent.children].indexOf(node));node=parent;}
      if(node===root)nodes.push({path,tag:element.tagName,top:element.scrollTop,left:element.scrollLeft});
    }
    return {nodes,x:window.scrollX,y:window.scrollY};
  }
  function restoreScroll(snapshot){
    if(!snapshot)return;
    const root=$('presentation');
    for(const item of snapshot.nodes){let node=root;for(const index of item.path)node=node?.children[index];if(node?.tagName===item.tag){node.scrollTop=item.top;node.scrollLeft=item.left;}}
    if(window.scrollX!==snapshot.x||window.scrollY!==snapshot.y)window.scrollTo(snapshot.x,snapshot.y);
  }
  function navigate(index, options={}) {
    index=Math.max(0,Math.min(stops.length-1,index));
    const requested=pages[stops[index].page];
    if(!editor?.editing&&window.PresentationOrder?.hidden(requested))return goPage(data.scenarios.find(s=>s.id===requested.scenario).overviewId,0,{...options,hash:true});
    if(!editor?.editing&&pages[stops[index].page].article&&stops[index].phase===0) {
      index=stops.findIndex(stop=>stop.page===stops[index].page&&stop.phase===1);
    }
    if(!options.fromLoad){navigationVersion++;pendingNavigation=Promise.resolve();}
    const target=pages[stops[index].page];
    if(repository&&!repository.isReady(target))return loadPage(target,stops[index].phase,options,navigationVersion);
    synchronizeData();
    if(!options.keepLoadStatus)loadStatus.hidden=true;
    if(index===position&&!options.force) return;
    const previousScroll=options.preserveScroll?captureScroll():null;
    window.PresentationResults?.beforeNavigate(target,stops[index].phase);
    window.visualLayoutEditor?.beforeRender();
    viewport?.cancel();
    overviewResizeObserver?.disconnect();
    const before=position>=0?currentPage():null;
    position=index;
    const page=currentPage();
    const currentScene=scene();
    fullView.splice(0,4,0,0,[90,270].includes(currentScene.rotation)?currentScene.height:currentScene.width,[90,270].includes(currentScene.rotation)?currentScene.width:currentScene.height);
    fullPeek=false;
    cancelAnimationFrame(animation);
    clearTimeout(animationEnd);
    const pageChanged=before?.id!==page.id;
    if(page.kind==='results') {
      $('presentation').innerHTML=window.PresentationResults.render(page,data);
    } else if(page.kind==='scenario-directory') {
      $('presentation').innerHTML=window.PresentationScenarios.render(page,data);
    } else if(['presentations-home','presentation-empty','chapter-cover'].includes(page.kind)) {
      $('presentation').innerHTML=window.PresentationStructure.render(page);
    } else if(page.kind==='module') {
      $('presentation').innerHTML=window.PresentationModules.render(page);
    } else if(page.kind==='general-ending') {
      $('presentation').innerHTML=page.ending==='closing'?window.PresentationModules.renderClosing(data.conclusion.closing,page.id):window.PresentationModules.renderConclusion(data.conclusion,page.id);
    } else if(page.kind==='map'&&!page.article&&currentScene.currentConditions) {
      $('presentation').innerHTML=mapShell(window.generalRoadConditions.comparison(currentScene,data));
    } else if(page.kind==='map') {
      if(!$('main-map')||$('main-map').dataset.scenarioId!==currentScene.id) $('presentation').innerHTML=mapShell();
      updateMap(pageChanged);
    } else {
      $('presentation').innerHTML=page.kind==='custom'?window.generalRoadTemplates.render(page,current().phase,editor):({'chapter-scenarios':()=>window.PresentationScenarios.chapter(page,data,scenarioUI),'scenario-comparison':()=>scenarioUI.comparison(currentScene),'current-conditions':()=>window.generalRoadConditions.render(currentScene,data),cover,context,review,opening:()=>opening(page)})[page.kind]();
    }
    if(pageChanged||page.kind!=='map') $('presentation').scrollTop=0;
    if(!pageChanged&&page.article&&current().phase===1&&innerWidth<=620) {
      $('presentation').scrollTop=0;
    }
    document.querySelectorAll('#chapters [data-chapter]').forEach(button=>{
      const active=button.dataset.chapter===page.chapter;
      button.classList.toggle('active',active);
      if(active) button.setAttribute('aria-current','step'); else button.removeAttribute('aria-current');
    });
    const progress=position/(stops.length-1)*100;
    $('progress').style.width=`${progress}%`;
    $('page-track').style.width=`${(current().page+1)/pages.length*100}%`;
    $('page-number').textContent=String(current().page+1).padStart(2,'0');
    $('phase-label').textContent=page.article?(editor?.editing?`${current().phase+1} / 2 ${current().phase?'放大解說':'框選定位'}`:'放大解說'):page.kind==='custom'&&page.steps?`${current().phase+1} / ${page.steps.length} 解說`:'';
    $('previous').disabled=position===0;
    $('next').disabled=false;
    $('next-label').textContent=window.PresentationStructure.navigationLabel();
    $('next').setAttribute('aria-label',$('next-label').textContent);
    $('announcer').textContent=`第 ${current().page+1} 頁，共 ${pages.length} 頁。${page.name}${page.article?'，'+(current().phase?'放大解說':'框選定位'):''}`;
    if(!['module','results','presentations-home','presentation-empty','scenario-directory','chapter-cover','general-ending'].includes(page.kind))scenarioUI.decorate(page);
    window.PresentationScenarios?.decorate(page,data);
    window.PresentationModules?.decorate(page);
    window.PresentationText?.apply($('presentation'),{general:page.deckId==='general'});
    editor?.decorate();
    viewport?.mount($('presentation'));
    if(page.kind==='map'&&!page.article&&$('main-map')){
      const svg=$('main-map'),home=overviewHome(svg);cancelMapAnimation();
      const control=viewport.attach(svg,{home});control.write(home,false);
    }
    window.generalRoadConditions?.mount($('presentation'));
    window.visualLayoutEditor?.render();
    window.PresentationModules?.afterRender();
    document.title=`${page.name}｜${page.kind==='module'?'交通設施功能模組':'一般道路情境簡報（圖面放大版）'}`;
    window.PresentationStructure?.decorate(page);
    window.PresentationResults?.afterRender();
    window.PresentationOrder?.mount(window.generalRoadPresentation);
    window.PresentationImageOrder?.mount(window.generalRoadPresentation);
    window.GeneralScenarioLayout?.decorate(page);
    window.PresentationReferences?.mount(page);
    window.PresentationText?.apply(document.body);
    restoreScroll(previousScroll);
    if(options.hash!==false) {
      const hash=page.kind==='module'?window.PresentationModules.hashFor(page):`#${page.id}${page.article&&current().phase?'/zoom':['custom','results'].includes(page.kind)&&current().phase?'/step-'+current().phase:''}`;
      try {history.replaceState(null,'',hash);} catch {location.hash=hash;}
    }
  }
  function resolvePageId(id,phase){const mapped=window.PresentationResults?.resolvePage(id)||id;return window.PresentationModules?.resolvePage(mapped,phase)||mapped;}
  function goPage(id,phase=0,options={}) {
    const resolved=resolvePageId(id);
    if(resolved!==id)options={...options,force:true};
    id=resolved;
    const page=pages.findIndex(item=>item.id===id);
    if(generalArticle(pages[page]||{}))phase=1;
    const index=stops.findIndex(stop=>stop.page===page&&stop.phase===phase);
    if(index>=0)return navigate(index,options);
  }
  function move(direction) {
    if(window.PresentationResults?.move(direction))return;
    if(window.PresentationStructure?.move(direction))return;
    let index=position+direction;
    while(index>=0&&index<stops.length&&!editor?.editing&&pages[stops[index].page].article&&stops[index].phase===0)index+=Math.sign(direction);
    navigate(index);
  }
  function goChapter(id) {
    const page=pages.find(item=>item.chapter===id);
    if(page) goPage(page.id);
  }
  function openDialog(id) { if(id==='toc-dialog')updateContents();const dialog=$(id); if(!dialog.open) dialog.showModal(); }
  function showSource() {
    const article=currentPage().article;
    const currentScene=scene();
    const sourcePages=article?article.page:currentScene.source.pages;
    const sourceDocument=article?article.sourceDocument:currentScene.sourceDocument;
    const sourceLabel=sourceDocument?`${/^G\d-\d{2}$/.test(currentScene.code)?sourceDocument.file.replace(/(?:[（(]草案[）)])?\.docx$/i,''):sourceDocument.file} / §${sourceDocument.section}`:currentScene.source.pdf&&sourcePages?`${currentScene.source.pdf} / 第 ${sourcePages} 頁`:currentScene.source.typst;
    $('source-title').textContent=article?`${article.name} / ${article.reference||'《設置規則》§ '+article.reg}`:'資料來源與示範範圍';
    document.querySelector('#source-dialog .eyebrow').textContent='SOURCE / '+currentScene.code;
    const table=article?.id==='taper'?`<h3>減速車道長度及寬度漸變比例</h3><div style="overflow-x:auto"><table style="border-collapse:collapse;min-width:550px;width:100%;font-size:11px;text-align:center"><thead><tr>${['設計速率 (km/h)',20,30,40,50,60,70,80,90].map(value=>`<th style="padding:8px;border-bottom:1px solid #cad8be">${value}</th>`).join('')}</tr></thead><tbody><tr>${['長寬比例','3:1','4:1','6:1','8:1','10:1','12:1','14:1','15:1'].map(value=>`<td style="padding:8px;border-bottom:1px solid #cad8be">${value}</td>`).join('')}</tr></tbody></table></div><p class="dialog-note">表 4.1，資料來源：《市區道路及附屬工程設計規範》。</p>`:'';
    $('source-content').innerHTML=`<div class="source-content"><div class="source-meta">${esc(sourceLabel)}<br>${currentScene.code} ${currentScene.name}設置圖例與運用解說</div>${article?(article.sourceParagraphs||[]).map(paragraph=>`<p>${esc(paragraph)}</p>`).join(''):currentScene.sourceParagraphs?currentScene.sourceParagraphs.map(paragraph=>`<p>${esc(paragraph)}</p>`).join(''):`<p>${esc(currentScene.source.note)}</p><p>本簡報共有五章：緒論與四大主題。目前收錄 ${data.scenarios.map(value=>value.code).join('、')} 共 ${data.scenarios.length} 個情境、${data.articles.length} 項條文與設施解說；尚未製作的情境保留預留頁。</p><p>圖面與照片已隨簡報附上，可透過本機預覽離線使用。</p>`}${table}<details><summary>查看原始 Typst ${article?'條目':/^G\d-\d{2}$/.test(currentScene.code)?'情境資料':'情境稿件'}</summary><pre>${esc(article?article.sourceRaw:currentScene.originalTypst)}</pre></details></div>`;
    openDialog('source-dialog');
  }
  function renderAsset() {
    const asset=data.embeddedAssets[shownAsset];
    const swapped=rotation%2===1;
    const transforms=['',`translate(${asset.height} 0) rotate(90)`,`translate(${asset.width} ${asset.height}) rotate(180)`,`translate(0 ${asset.width}) rotate(270)`];
    $('asset-view').innerHTML=`<svg viewBox="0 0 ${swapped?asset.height:asset.width} ${swapped?asset.width:asset.height}" role="img" aria-label="${esc($('asset-title').textContent)}"><g transform="${transforms[rotation]}"><image href="${asset.url}" width="${asset.width}" height="${asset.height}"/></g></svg>`;
    $('asset-view').firstElementChild.dataset.editorImageKey=shownAsset;
    viewport?.mount($('asset-view'));
    window.visualLayoutEditor?.mountImageViews($('asset-view'),currentPage().id+'-asset');
  }
  function showAsset(key='overall') {
    if(arguments.length===0)key=scene().overall;
    shownAsset=key;
    rotation=(data.assetMeta[key]?.rotation||0)/90;
    $('asset-title').textContent=data.assetMeta[key]?.label||data.assets[key];
    $('asset-kicker').textContent=data.assetMeta[key]?.module?data.assetMeta[key].module+' / ORIGINAL DIAGRAM':scenarioUI.find(data.assetMeta[key]?.scenario).code+' / ORIGINAL VECTOR DIAGRAM';
    renderAsset();
    openDialog('asset-dialog');
    editor?.decorateAsset(key);
  }
  function fromHash() {
    let hash=location.hash.slice(1);
    try {hash=decodeURIComponent(hash);} catch {hash='cover';}
    const [requestedId,phase]=hash.split('/');
    const id=resolvePageId(requestedId,phase);
    const page=pages.findIndex(item=>item.id===id);
    const rawPhase=phase==='zoom'?1:/^step-\d+$/.test(phase||'')?Number(phase.slice(5)):0;
    const requestedPhase=generalArticle(pages[page]||{})?1:pages[page]?.resultType==='comparison'?Math.min(rawPhase,window.PresentationResults.stepCount(pages[page])-1):rawPhase;
    if(generalArticle(pages[page]||{})&&phase!=='zoom')history.replaceState(null,'',location.pathname+location.search+'#'+id+'/zoom');
    const index=stops.findIndex(stop=>stop.page===page&&stop.phase===requestedPhase);
    return navigate(index>=0?index:0,{hash:false,force:pages[page]?.kind==='module'});
  }
  document.addEventListener('click',event=>{
    if(editor?.editing&&event.target.closest('[contenteditable]'))return;
    const button=event.target.closest('button,a');
    if(!button) return;
    if(button.dataset.scenario){goPage(scenarioUI.find(button.dataset.scenario).contextId);return;}
    if(button.dataset.asset){showAsset(button.dataset.asset);return;}
    if(button.matches('[data-close]')) {button.closest('dialog').close(); return;}
    if(button.matches('[data-page],[data-chapter]')) {
      button.closest('dialog')?.close();
      if(button.dataset.page) {
        const directZoom=button.classList.contains('article-chip');
        goPage(button.dataset.page,directZoom?1:0,{force:directZoom});
      } else goChapter(button.dataset.chapter);
      return;
    }
    if(button.matches('.brand')) {event.preventDefault(); goPage('presentations'); return;}
    const action=button.dataset.action;
    if(action==='zoom') navigate(position+1);
    if(action==='source') showSource();
    if(action==='supplement') showAsset(currentPage().article.asset);
    if(action==='toc') openDialog('toc-dialog');
    if(button.id==='original-map') showAsset();

  });
  $('previous').addEventListener('click',()=>move(-1));
  $('next').addEventListener('click',()=>move(1));
  $('toc-button').addEventListener('click',()=>openDialog('toc-dialog'));
  $('help-button').addEventListener('click',()=>openDialog('help-dialog'));
  $('asset-rotate').addEventListener('click',()=>{rotation=(rotation+1)%4;renderAsset();});
  $('fullscreen-button').addEventListener('click',async()=>{
    try {if(document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen();}
    catch {$('announcer').textContent='瀏覽器未開放全螢幕，可使用 F11。';}
  });
  document.addEventListener('fullscreenchange',()=>{$('fullscreen-button').innerHTML=document.fullscreenElement?'⛶ <span>離開全螢幕</span>':'⛶ <span>全螢幕</span>';});
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{
    if(event.target!==dialog) return;
    const bounds=dialog.getBoundingClientRect();
    if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom) dialog.close();
  }));
  document.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||editor?.editing||window.visualLayoutEditor?.editing||document.querySelector('dialog[open]')||event.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)) return;
    if(['BUTTON','A'].includes(event.target.tagName)&&[' ','Enter'].includes(event.key)) return;
    if(['ArrowRight','ArrowDown','PageDown',' '].includes(event.key)) {event.preventDefault();move(1);}
    if(['ArrowLeft','ArrowUp','PageUp'].includes(event.key)) {event.preventDefault();move(-1);}
    if(event.key==='Home') {event.preventDefault();window.PresentationStructure.edge();}
    if(event.key==='End') {event.preventDefault();window.PresentationStructure.edge(true);}
    if(event.key.toLowerCase()==='m') openDialog('toc-dialog');
    if(event.key.toLowerCase()==='h') openDialog('help-dialog');
    if(event.key.toLowerCase()==='f') $('fullscreen-button').click();
  });
  window.addEventListener('hashchange',fromHash);
  function refreshStructure(id=currentPage().id,phase=current().phase) {
    window.PresentationModules?.syncPages(pages);
    window.PresentationStructure?.organize(pages);
    window.PresentationOrder?.organize(pages,data,window.visualLayoutEditor?.store.config);
    id=resolvePageId(id);
    if(generalArticle(pages.find(page=>page.id===id)||{}))phase=1;
    const comparison=pages.find(page=>page.id===id&&page.resultType==='comparison');if(comparison)phase=Math.min(phase,window.PresentationResults.stepCount(comparison)-1);
    stops.splice(0,stops.length,...makeStops());
    updateContents();
    let index=stops.findIndex(stop=>pages[stop.page].id===id&&stop.phase===phase);
    if(index<0) index=Math.min(position,stops.length-1);
    position=-1;
    navigate(Math.max(0,index),{force:true});
  }
  function editorFrames() {
    const page=currentPage();
    if(page.kind==='results')return window.PresentationResults?.frames()||[];
    if(page.kind==='module')return window.PresentationModules?.frames()||[];
    if(page.article&&$('main-map')) return editor.articleFrames({key:'article:'+page.id,label:page.article.name,element:$('main-map'),width:fullView[2],height:fullView[3],imageKey:scene().overall,articleId:page.id,getBox:()=>displayBounds(page.article.box),getCrop:()=>displayBounds(page.article.crop),toSource:sourceBounds,fromSource:displayBounds,setBounds:(kind,bounds)=>{const raw=sourceBounds(bounds);page.article[kind]=raw;return raw;}});
    if(page.kind!=='custom') return [];
    return [...document.querySelectorAll('[data-custom-frame]')].map(element=>{
      const side=element.dataset.customFrame;
      const key=`custom:${page.id}:${side}:${current().phase}`;
      const fallback=page.steps[current().phase].boxes[side];
      return {key,label:side==='left'?'左圖':side==='right'?'右圖':'情境圖',element,width:1000,height:640,imageKey:element.dataset.editorImageKey,getBox:()=>editor.bounds(key,'box',fallback),toSource:bounds=>bounds,fromSource:bounds=>bounds,setBounds:(_kind,bounds)=>bounds,defaults:{box:fallback}};
    });
  }
  window.generalRoadPresentation={data,pages,stops,fullView,displayBounds,pageTitle,goPage,navigate,updateContents,editorFrames,refresh:()=>navigate(position,{force:true,preserveScroll:true}),refreshStructure,showAsset,whenIdle:()=>pendingNavigation,get page(){return currentPage();},get position(){return position;},get state(){return {page:currentPage().id,phase:current().phase,fullPeek};}};
  editor?.connect(window.generalRoadPresentation);
  window.visualLayoutEditor?.connect(window.generalRoadPresentation);
  window.PresentationModules?.connect(window.generalRoadPresentation);
  window.PresentationStructure?.connect(window.generalRoadPresentation,scenarioUI);
  window.PresentationResults?.connect(window.generalRoadPresentation);
  await fromHash();
  window.presentationStartup.complete();
})().catch(error=>{console.error('簡報初始化失敗',error);window.presentationStartup.fail();});
