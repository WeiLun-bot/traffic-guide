(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.PresentationStructure=api;root.presentationStructureReady=api.load();}
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  let manifest=null,app=null,scenarioUI=null,loadError='';
  let picker,menu,pickerButton,pickerPinned=false,pickerOpenTimer=0,pickerCloseTimer=0;
  function closePicker(){setPicker(false);}
  function setPicker(open,pinned=false){
    clearTimeout(pickerOpenTimer);clearTimeout(pickerCloseTimer);
    if(!menu)return;
    menu.hidden=!open;pickerButton.setAttribute('aria-expanded',String(open));pickerPinned=open&&pinned;
  }
  function menuButtons(){return [...menu.querySelectorAll('button')];}
  function focusMenu(last=false){
    setPicker(true,true);const buttons=menuButtons();(last?buttons.at(-1):menu.querySelector('[aria-current="page"]')||buttons[0])?.focus({preventScroll:true});
  }
  function revealChapter(){
    const nav=document.getElementById('lecture-chapters'),button=nav?.querySelector('.active');if(!button)return;
    const n=nav.getBoundingClientRect(),b=button.getBoundingClientRect();
    if(b.left<n.left)nav.scrollLeft-=n.left-b.left;else if(b.right>n.right)nav.scrollLeft+=b.right-n.right;
  }
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function validate(value){
    const ids=new Set(),chapters=new Set();
    if(value?.schemaVersion!==1||!Array.isArray(value.presentations)||value.presentations.length!==4)throw new Error('簡報架構格式無效');
    for(const deck of value.presentations){
      if(!/^[\w-]+$/.test(deck.id)||ids.has(deck.id)||typeof deck.title!=='string'||!deck.title.trim()||!Array.isArray(deck.chapters)||!deck.chapters.length)throw new Error('簡報主題無效');ids.add(deck.id);
      for(const chapter of deck.chapters){if(!/^[\w-]+$/.test(chapter.id)||chapters.has(chapter.id)||!/^\d{2}$/.test(chapter.code)||typeof chapter.name!=='string'||!chapter.name.trim()||!/^[\w-]+$/.test(chapter.entry))throw new Error('簡報章節無效');chapters.add(chapter.id);}
      if(!deck.chapters.some(chapter=>chapter.entry===deck.entry))throw new Error('簡報入口不在章節架構中');
    }
    return value;
  }
  async function load(){try{const response=await fetch(new URL('data/presentations.json',document.baseURI),{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);manifest=validate(await response.json());}catch(error){loadError=error.message;}}
  const decks=()=>manifest?.presentations||[];
  const deckFor=page=>decks().find(deck=>deck.chapters.some(chapter=>chapter.id===page.chapter))||null;
  function organize(pages){
    for(const page of pages){if(page.chapter==='modules')page.chapter='modules-M2';page.deckId=deckFor(page)?.id||null;}
    const order=new Map(decks().map((deck,index)=>[deck.id,index]));
    pages.sort((left,right)=>(left.kind==='presentations-home'?-1:order.get(left.deckId)??99)-(right.kind==='presentations-home'?-1:order.get(right.deckId)??99));
  }
  function placeholders(){return decks().flatMap(deck=>deck.chapters.filter(chapter=>chapter.empty||chapter.directory).map(chapter=>({id:chapter.entry,chapter:chapter.id,kind:chapter.directory?'scenario-directory':'presentation-empty',name:chapter.directory?'全部情境總覽':chapter.name,deckId:deck.id})));}
  function home(){return `<section class="slide presentations-home" aria-labelledby="slide-title"><header class="presentations-heading"><span class="eyebrow">PRESENTATION SERIES</span><h1 id="slide-title">${esc(manifest?.title||'簡報總覽')}</h1><p>四場簡報</p></header>${loadError?`<p role="alert">簡報架構尚未載入：${esc(loadError)}。請確認 data/presentations.json 可讀取後重新整理。</p>`:''}<div class="presentation-cards">${decks().map(deck=>`<button class="presentation-card" data-deck="${deck.id}"><span class="presentation-number">${deck.code}</span><h2>${esc(deck.title)}</h2><div class="presentation-chapter-preview">${deck.chapters.map(chapter=>`<span>${chapter.code} ${esc(chapter.name)}</span>`).join('')}</div><span class="presentation-card-action">開啟簡報 <b>↗</b></span></button>`).join('')}</div></section>`;}
  function empty(page){const deck=deckFor(page),chapter=deck?.chapters.find(item=>item.id===page.chapter);return `<section class="slide presentation-empty" aria-labelledby="slide-title">${page.moduleId?(window.PresentationModules?.switcher(page)||'')+(window.PresentationModules?.subnavigation(page)||''):''}<header><span class="eyebrow">${esc(deck?.title)}</span><h1 id="slide-title">${esc(page.moduleId?(page.submoduleId||page.moduleId)+' '+page.name:page.scenarioCode?page.scenarioCode+' '+page.name:(chapter?.code||'00')+' '+page.name)}</h1></header><div class="presentation-empty-space" aria-label="尚未加入素材"></div></section>`;}
  function toc(pages,scenarios=scenarioUI){return `<button class="text-button presentations-toc-home" data-page="presentations">← 四場簡報總覽</button>${decks().map(deck=>`<details class="toc-presentation" data-toc-presentation="${deck.id}" ${app?.page.deckId===deck.id?'open':''}><summary><span>${deck.code}</span><strong>${esc(deck.title)}</strong></summary><div class="toc-presentation-body">${deck.id==='general'?scenarios.toc(pages.filter(page=>page.deckId===deck.id)):deck.chapters.map(chapter=>`<section class="toc-group"><button class="toc-chapter" data-chapter="${chapter.id}"><span>${chapter.code}</span>${esc(chapter.name)}</button><div class="toc-chapter-content"><div class="toc-pages">${pages.filter(page=>page.chapter===chapter.id).map(page=>`<button data-page="${page.id}">${esc(page.moduleId?(page.submoduleId||page.moduleId)+' '+page.name:page.scenarioCode?page.scenarioCode+' '+page.name:page.name)}</button>`).join('')}</div></div></section>`).join('')}</div></details>`).join('')}`;}
  function connect(api,scenarios){
    app=api;scenarioUI=scenarios;
    const nav=document.getElementById('chapters'),wrapper=document.createElement('div'),chapters=document.createElement('nav');
    wrapper.className='presentation-navigation';nav.before(wrapper);
    picker=document.createElement('div');picker.className='presentation-picker';pickerButton=document.createElement('button');pickerButton.type='button';pickerButton.id='presentation-picker-toggle';pickerButton.className='presentation-picker-toggle';pickerButton.setAttribute('aria-expanded','false');pickerButton.setAttribute('aria-controls','chapters');pickerButton.innerHTML='<span class="presentation-picker-label">四場簡報</span><span class="presentation-picker-arrow" aria-hidden="true">▾</span>';
    menu=nav;menu.className='presentation-picker-menu';menu.hidden=true;menu.setAttribute('aria-label','四場簡報');
    menu.innerHTML='<span class="presentation-picker-heading">切換簡報</span>'+decks().map(deck=>`<button type="button" data-deck="${deck.id}" ${deck.id==='modules'?'data-module-entry="true"':''}><span class="presentation-picker-number">${deck.code}</span><span class="presentation-picker-title">${esc(deck.title)}</span><span class="presentation-picker-check" aria-hidden="true">✓</span></button>`).join('')+'<button type="button" class="presentation-picker-home" data-page="presentations">← 四場簡報總覽</button>';
    picker.append(pickerButton,menu);wrapper.append(picker,chapters);chapters.id='lecture-chapters';chapters.className='lecture-chapters';chapters.setAttribute('aria-label','本場簡報章節');
    pickerButton.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();setPicker(menu.hidden||!pickerPinned,true);});
    picker.addEventListener('pointerenter',event=>{clearTimeout(pickerCloseTimer);if(event.pointerType==='mouse'&&matchMedia('(hover: hover) and (pointer: fine)').matches&&menu.hidden)pickerOpenTimer=setTimeout(()=>setPicker(true),150);});
    picker.addEventListener('pointerleave',event=>{clearTimeout(pickerOpenTimer);if(event.pointerType==='mouse'&&!pickerPinned)pickerCloseTimer=setTimeout(closePicker,180);});
    picker.addEventListener('focusin',event=>{if(menu.contains(event.target))pickerPinned=true;});
    picker.addEventListener('focusout',event=>{if(!picker.contains(event.relatedTarget))closePicker();});
    picker.addEventListener('keydown',event=>{
      if(event.target===pickerButton&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();event.stopPropagation();focusMenu(event.key==='ArrowUp');return;}
      if(menu.hidden)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closePicker();pickerButton.focus({preventScroll:true});return;}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();event.stopPropagation();const buttons=menuButtons(),index=buttons.indexOf(document.activeElement),target=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[target]?.focus({preventScroll:true});
      }else if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.stopPropagation();}
    });
    menu.addEventListener('click',event=>{if(event.target.closest('button[data-page]'))closePicker();});
    document.addEventListener('pointerdown',event=>{if(!picker.contains(event.target))closePicker();},true);
    window.addEventListener('resize',()=>{closePicker();revealChapter();});window.addEventListener('blur',closePicker);
    const brand=document.querySelector('.brand');brand.href='#presentations';brand.setAttribute('aria-label','回四場簡報總覽');
    document.getElementById('toc-title').textContent='簡報與章節目錄';
  }
  function decorate(page){
    if(!app)return;
    const deck=deckFor(page),chapterNav=document.getElementById('lecture-chapters');
    closePicker();
    const pickerLabel=deck?deck.code+' '+deck.title:'四場簡報';pickerButton.querySelector('.presentation-picker-label').textContent=pickerLabel;pickerButton.title=pickerLabel;pickerButton.setAttribute('aria-label','切換簡報，目前：'+pickerLabel);
    document.body.dataset.presentation=deck?.id||'home';
    for(const button of document.querySelectorAll('#chapters [data-deck]')){const active=button.dataset.deck===deck?.id;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
    chapterNav.innerHTML=deck?deck.chapters.map(chapter=>`<button type="button" data-chapter="${chapter.id}" ${chapter.id===page.chapter?'class="active" aria-current="step"':''}><span>${chapter.code}</span>${esc(chapter.name)}</button>`).join(''):'<span class="lecture-nav-hint">請選擇簡報主題</span>';
    revealChapter();
    document.querySelector('.footer-label').textContent=deck?.footer||'ROAD DESIGN PRESENTATIONS';
    const selected=deck?app.pages.filter(item=>item.deckId===deck.id):[page],pageIndex=selected.findIndex(item=>item.id===page.id),positions=app.stops.map((stop,index)=>({stop,index})).filter(item=>selected.includes(app.pages[item.stop.page])),position=positions.findIndex(item=>item.index===app.position);
    document.getElementById('page-number').textContent=String(pageIndex+1).padStart(2,'0');document.getElementById('page-total').textContent=String(selected.length).padStart(2,'0');
    document.getElementById('page-track').style.width=((pageIndex+1)/selected.length*100)+'%';document.getElementById('progress').style.width=(positions.length>1?position/(positions.length-1)*100:0)+'%';
    const nextLabel=document.getElementById('next-label');
    if(!deck){nextLabel.textContent='選擇第一場簡報';document.getElementById('previous').disabled=true;}
    else{document.getElementById('previous').disabled=false;if(position===positions.length-1)nextLabel.textContent='回到本場開頭';else if(page.kind==='presentation-empty'||page.kind==='module')nextLabel.textContent=app.pages[positions[position+1]?.stop.page]?.name||'繼續';}
    document.getElementById('next').setAttribute('aria-label',nextLabel.textContent);
    document.getElementById('announcer').textContent=(deck?deck.title+'，':'')+`第 ${pageIndex+1} 頁，共 ${selected.length} 頁。${page.name}`;
    document.title=page.kind==='presentations-home'?(manifest?.title||'簡報總覽'):`${page.name}｜${deck?.title||'道路設施簡報'}`;
    document.getElementById('toc-content').innerHTML=toc(app.pages);
    window.PresentationModules?.syncExtensionControls(page);
  }
  function move(direction){
    if(!app)return false;const deck=deckFor(app.page);
    if(!deck){if(direction>0&&decks()[0])app.goPage(decks()[0].entry);return true;}
    const candidates=app.stops.map((stop,index)=>({stop,index})).filter(item=>app.pages[item.stop.page].deckId===deck.id&&(window.generalRoadEditor?.editing||!app.pages[item.stop.page].article||item.stop.phase!==0));
    const at=candidates.findIndex(item=>item.index===app.position),next=at+direction;
    if(next<0)app.goPage('presentations');else if(next>=candidates.length)app.goPage(deck.entry);else app.navigate(candidates[next].index);return true;
  }
  function edge(last=false){const deck=deckFor(app.page),pages=app.pages.filter(page=>page.deckId===deck?.id);app.goPage(last?pages.at(-1)?.id||'presentations':deck?.entry||'presentations');}
  if(typeof document==='object')document.addEventListener('click',event=>{const button=event.target.closest('[data-deck]');if(!button||!app)return;const deck=decks().find(deck=>deck.id===button.dataset.deck);if(!deck)return;event.preventDefault();event.stopImmediatePropagation();const fromPicker=menu?.contains(button);closePicker();app.goPage(deck.entry);if(fromPicker)pickerButton.focus({preventScroll:true});},true);
  return {load,validate,organize,placeholders,connect,decorate,toc,move,edge,render:page=>page.kind==='presentations-home'?home():empty(page),get manifest(){return manifest;},get error(){return loadError;}};
});
