
(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  window.RoadScenarioComponents=window.generalRoadScenarios={create(data){
    const find=id=>data.scenarios.find(scene=>scene.id===id)||data.scenarios[0];
    const articles=scene=>{const items=scene.articleIds.map(id=>data.articles.find(article=>article.id===id));return window.PresentationOrder?.forKey(items,'scenario:'+scene.id)||items;};
    const image=(key,className='scenario-preview',options={})=>{
      const asset=data.embeddedAssets[key],rotation=data.assetMeta[key].rotation;
      const swapped=rotation===90||rotation===270;
      const transform=rotation===90?'translate('+asset.height+' 0) rotate(90)':rotation===180?'translate('+asset.width+' '+asset.height+') rotate(180)':rotation===270?'translate(0 '+asset.width+') rotate(270)':'';
      const view=options.view||[0,0,swapped?asset.height:asset.width,swapped?asset.width:asset.height];
      return `<svg class="${className}" viewBox="${view.join(' ')}" preserveAspectRatio="${options.cover?'xMidYMid slice':'xMidYMid meet'}" role="img" aria-label="${esc(data.assetMeta[key].label)}"><g transform="${transform}"><image href="${asset.url}" width="${asset.width}" height="${asset.height}"/></g></svg>`;
    };
    function pages(scene) {
      const result=[{id:scene.contextId,chapter:scene.chapter,scenario:scene.id,kind:'context',name:scene.code+' 路口現況與議題'}];
      if(scene.currentConditions)result.push({id:scene.currentConditions.pageId,chapter:scene.chapter,scenario:scene.id,kind:'current-conditions',name:scene.code+' 現況問題'});
      result.push({id:scene.overviewId,chapter:scene.chapter,scenario:scene.id,kind:'map',name:scene.code+' 整體佈設策略'});
      for(const article of articles(scene)) {
        result.push({id:article.id,chapter:scene.chapter,scenario:scene.id,kind:'map',name:article.name,article});
        if(scene.comparisonId&&article.reg==='185')result.push({id:scene.comparisonId,chapter:scene.chapter,scenario:scene.id,kind:'scenario-comparison',name:'有、無行穿線配置比較'});
      }
      result.push({id:scene.reviewId,chapter:scene.chapter,scenario:scene.id,kind:'review',name:scene.code+' 情境回顧'});
      return result;
    }
    function toc(allPages) {
      const buttons=values=>values.map(page=>`<button data-page="${esc(page.id)}">${page.article?'§ '+esc(page.article.reg)+' ':page.scenarioCode?esc(page.scenarioCode)+' ':''}${esc(page.kind==='chapter-cover'?window.PresentationStructure?.chapterName(page.chapter)||page.name:page.name)}${page.kind==='chapter-cover'?'｜章節頁':''}</button>`).join('');
      return data.chapters.map(chapter=>{
        const chapterPages=allPages.filter(page=>page.chapter===chapter.id);
        const scenes=data.scenarios.filter(scene=>scene.chapter===chapter.id);
        const content=scenes.length?`<div class="toc-chapter-overview">${buttons(chapterPages.filter(page=>!page.scenario))}</div>${scenes.map(scene=>`<section class="toc-scenario" data-toc-scenario="${scene.id}"><button class="toc-scenario-title" data-page="${scene.contextId}"><strong>${scene.code}</strong><span>${scene.name}</span></button><div class="toc-pages">${buttons(chapterPages.filter(page=>page.scenario===scene.id))}</div></section>`).join('')}`:`<div class="toc-pages">${buttons(chapterPages)}${['g2','g3','g4'].includes(chapter.id)?'<small>章節開場已建立，情境圖面與解說待加入。</small>':''}</div>`;
        return `<section class="toc-group"><button class="toc-chapter" data-chapter="${chapter.id}"><span>${chapter.code}</span>${esc(window.PresentationStructure?.chapterName(chapter)||chapter.name)}</button><div class="toc-chapter-content">${content}</div></section>`;
      }).join('');
    }
    function chapter() {
      const count=data.scenarios.length,total=data.articles.length;
      return `<section class="slide scenario-chapter ${count>2?'has-many-scenarios':''}" aria-labelledby="slide-title"><div class="section-heading"><div><span class="eyebrow">01 / G1 / SCENARIO DIRECTORY</span><h1 id="slide-title">無號誌三岔路口<br>從正交，到匯入。</h1></div><p>一個主題章節，依路口環境與路型展開。<br>目前已製作 ${count} 個情境，共 ${total} 項條文與設施解說。</p></div><div class="scenario-card-grid">${data.scenarios.map((scene,index)=>`<button class="scenario-card" data-scenario="${scene.id}"><div class="scenario-card-top"><span>${scene.code}</span><span class="tag">${scene.setting} / ${scene.geometry||'正交'}</span></div><div class="scenario-card-visual">${image(scene.overall)}</div><div class="scenario-card-copy"><h2>${scene.name}</h2><p>${scene.summary}</p><div class="scenario-card-footer"><span>${scene.articleIds.length} 項條文${scene.comparisonId?'・含行穿線比較':''}</span><strong>進入情境 ${String(index+1).padStart(2,'0')} ↗</strong></div></div></button>`).join('')}</div><div class="scenario-flow"><span>章節</span><i>→</i><span>情境現況</span><i>→</i>${data.scenarios.some(scene=>scene.currentConditions)?'<span>現況對照</span><i>→</i>':''}<span>整體配置</span><i>→</i><span>條文放大解說</span><i>→</i><span>情境回顧</span></div><p class="contents-note">G1 原章節共 6 種情境；其餘案例可沿用這個架構擴充。上方五章導覽切換主題，章內情境列切換案例，下方索引選擇條文。</p></section>`;
    }
    function context(scene,copy={}) {
      const details={...scene,...scene.presentation?.context,...copy};
      const before=scene.currentConditions?.before;
      const fraction=scene.presentation?.context?.cropFraction;
      const contextView=before&&fraction?[0,0,data.embeddedAssets[before].height,data.embeddedAssets[before].width*fraction]:undefined;
      // Keep the original editable text order, including the retired code badge.
      return `<section class="slide context context-opening" aria-labelledby="slide-title"><header class="context-header"><div class="eyebrow">01 / ${scene.code} / ${scene.setting==='市區'?'URBAN':'RURAL'} T-INTERSECTION</div><h1 id="slide-title" class="context-title">${esc(scene.name)}</h1><span class="tag" hidden data-template-hidden aria-hidden="true">${scene.code}</span><p class="context-intro">${esc(details.summary)}</p></header><div class="context-grid"><div class="context-visual">${contextFigure(scene,before,contextView)}<div class="road-facts">${details.facts.map(fact=>`<div class="road-fact"><h3>${esc(fact.title)}</h3><strong>${esc(fact.width)} <small>m</small></strong><p>${esc(fact.description)}<br><span class="road-speed">路段速限 ${esc(fact.speed)} km/h</span></p></div>`).join('')}</div></div><aside class="context-issues" aria-label="本例改善目標"><h2>本例改善目標</h2>${details.issues.map((issue,index)=>`<div class="issue-row"><span>0${index+1}</span><div><strong>${esc(issue[0])}</strong><p>${esc(issue[1])}</p></div></div>`).join('')}</aside></div><div class="context-note">${details.condition}</div><p class="source-line">${esc(details.sourceLine||`資料：${scene.source.pdf}，第 120–121 頁 / ${scene.code} 路口現況與設置建議`)}</p></section>`;
    }
    function contextFigure(scene,before,contextView) {
      const key=before||`pending:${scene.id}:before`;
      const uploaded=!before&&window.generalRoadEditor?.state.images[key];
      const graphic=before?image(before,'scenario-detail-image context-map',{cover:true,view:contextView}):uploaded?`<img class="scenario-detail-image context-map context-pending-image" src="${esc(uploaded.src)}" alt="${esc(uploaded.alt||scene.code+' 現況圖')}">`:'<div class="context-pending"><span class="context-pending-symbol" aria-hidden="true">＋</span><strong>現況圖待補</strong><span>現況問題照片待補</span></div>';
      return `<figure class="map-card context-map-card"><div class="map-toolbar"><strong>現況圖</strong><div class="map-tools">${before?`<button type="button" data-asset="${before}" title="開啟完整現況圖">⛶ 原圖</button>`:`<span class="context-pending-label">${uploaded?'已補現況圖':'素材待補'}</span>`}</div></div><div class="map-canvas context-map-canvas" data-editor-image-key="${key}">${graphic}</div><figcaption class="map-foot"><span>${before?'現況圖・路口範圍':'現況圖'}</span><span>${before||uploaded?'滾輪縮放・左鍵拖曳':'道路條件依提供稿整理'}</span></figcaption></figure>`;
    }
    function overview(scene) {
      const view=scene.presentation?.overview,rows=view?.rows||scene.overviewRows||[['rural-stopline','01　保留停止與轉彎空間','§ 170'],['rural-stopword','02　提前提示停車再開','§ 177'],['rural-crosswalk','03　依需求比較行穿線配置','§ 185'],['rural-stop-sign','04　明確主次道路停讓關係','§ 58'],['rural-warning','05　讓駕駛提前察覺路口','§ 30']];
      return `<div><div hidden aria-hidden="true"><span class="tag" data-template-hidden></span></div><h2 hidden data-template-hidden aria-hidden="true"></h2><p class="explain-intro">${esc(view?.intro||scene.overviewIntro||'鄉區道路以路口預告、主次道路辨識與轉彎空間為主軸，並依人行環境比較有、無行穿線的配置。')}</p><div class="overview-list">${rows.map(row=>`<button data-page="${row[0]}"><span>${row[1]}</span><small>${esc(row[2]).replace(/§\s*(?=\d)/g,'§ ')} ↗</small></button>`).join('')}</div><div class="module-row">${scene.modules.map(module=>`<span title="${module}">${module.split(' ')[0]}</span>`).join('')}</div>${view?.miniNote?`<p class="mini-diagram-note">${esc(view.miniNote)}</p>`:''}<div class="explain-footer"><button class="text-button" data-action="source">查看資料來源 ↗</button>${scene.comparisonId?`<button class="text-button" data-page="${scene.comparisonId}">有、無行穿線比較 ↗</button>`:''}</div></div>`;
    }
    function comparison(scene) {
      const rows=scene.comparisonRows||[['g102-crosswalk','設置行穿線','次要道路需提供行人穿越環境時，配置行穿線、停止線與停標字。','圖 4.10'],['g102-no-crosswalk','不設置行穿線','路側無人行道且評估通行需求較低時，原稿示範不設行穿線。','圖 4.11']];
      return `<section class="slide custom-compare scenario-comparison" aria-labelledby="slide-title"><div class="eyebrow">${scene.code} / OPTIONS / § 185</div><h1 id="slide-title">有、無行穿線，怎麼選？</h1><div class="custom-comparison-grid">${rows.map(row=>`<article class="scenario-compare-card"><h2 class="custom-side-title">${row[1]}</h2><div class="custom-image-frame scenario-detail-frame" data-editor-image-key="${row[0]}">${image(row[0],'scenario-detail-image')}</div><p>${esc(row[2]).replace(/§\s*(?=\d)/g,'§ ')}</p><button class="text-button" data-asset="${row[0]}">${row[3]} / 開啟原始圖例 ↗</button></article>`).join('')}</div><div class="custom-compare-explanation"><h2>${esc(scene.comparisonHeadline||'停止線的退縮，仍要保留。')}</h2><p>${esc(scene.comparisonNote||'本例次要道路狹窄，需檢核大型車轉向軌跡；不因沒有行穿線，就將原本退縮的停止線移至下游。兩個方案都要保留轉彎空間。')}</p></div><p class="source-line">${esc(scene.comparisonSourceLine||`資料：${scene.source.pdf}，第 123–124 頁 / 第185條運用解說`)}</p></section>`;
    }
    function review(scene) {
      const view=scene.presentation?.review,rows=view?.rows||scene.recapRows||[['讓路口先被辨識','以岔路標誌、速限提示與路面設施，提醒駕駛提早留意前方路口。','§ 30'],['把停車再開的位置說清楚','以立桿標誌為主、停標字為輔，並將停止線位置與大型車轉彎軌跡一起檢核。','§ 58 / § 170 / § 177'],['依行人環境選擇配置','是否設置行穿線，需對照行人需求與路側條件；兩種方案都保留停止線退縮空間。','§ 185']];
      const title=view?.title||scene.recapTitle,intro=esc(view?.intro||scene.recapIntro||'市區案例著重行人與路側空間，鄉區案例著重路口自明性與停讓位置。每個情境各自保留全圖、條文與回顧。'),primary=view?.primary||{page:'g1-scenarios',label:'回到 G1 情境總覽'};
      return `<section class="slide review" aria-labelledby="slide-title"><div><div class="eyebrow">${scene.code} / SCENARIO RECAP</div><h1 id="slide-title" class="review-title">${title?esc(title).replace(/\n/g,'<br>'):'同一章節，<br>不同的設置重點。'}</h1><p class="review-copy">${view?.breakIntro?intro.replace(/\n/g,'<br>'):intro}</p><div class="opening-actions"><button class="primary-button" data-page="${primary.page}">${esc(primary.label)} <span>↗</span></button>${view?.hideSecondary?'':`<button class="text-button" data-page="${scene.overviewId}">重看本情境</button>`}</div>${view?.sourceLine?`<p class="source-line">${esc(view.sourceLine)}</p>`:''}</div><div class="review-rows">${rows.map((row,index)=>`<div class="review-row"><span>0${index+1}</span><div><h2>${row[0]}</h2><p>${row[1]}</p><small>${esc(row[2]).replace(/§\s*(?=\d)/g,'§ ')}</small></div></div>`).join('')}</div></section>`;
    }
    function decorate(page) {
      const slide=document.querySelector('main>.slide');if(!slide)return;
      slide.querySelector('.scenario-switcher')?.remove();
      if(!page.scenario)return;
      const scene=find(page.scenario),nav=document.createElement('nav');nav.className='scenario-switcher';nav.setAttribute('aria-label','G1 章內情境切換');
      nav.innerHTML=`<button type="button" data-page="g1-scenarios" class="scenario-back">G1 情境總覽 ↖</button>${data.scenarios.map(item=>`<button type="button" data-scenario="${item.id}" class="${scene.id===item.id?'active':''}" ${scene.id===item.id?'aria-current="page"':''}><strong>${item.code}</strong> ${item.short}</button>`).join('')}<span>${scene.code} / ${scene.setting}情境</span>`;
      slide.prepend(nav);
      if(page.kind==='review'&&page.id!=='review') {
        const next=data.scenarios[data.scenarios.findIndex(item=>item.id===scene.id)+1];
        const actions=slide.querySelector('.opening-actions');
        if(next&&actions&&!actions.querySelector('[data-next-scenario]'))actions.insertAdjacentHTML('beforeend',`<button class="text-button" data-next-scenario data-page="${next.contextId}">下一個情境 ${next.code} →</button>`);
      }
      if(page.id==='review') {
        const actions=slide.querySelector('.opening-actions');
        if(!actions.querySelector('[data-page="g102-context"]'))actions.insertAdjacentHTML('beforeend','<button class="text-button" data-page="g102-context">下一個情境 G1-02 →</button>');
        slide.querySelector('.source-line').textContent='G1-01 示範完成。下一個情境：G1-02 無號誌鄉區正交三岔路口。';
      }
    }
    return {find,articles,image,pages,toc,chapter,context,overview,comparison,review,decorate};
  }};
})();
