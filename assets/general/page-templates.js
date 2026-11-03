(() => {
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const types=[
    {id:'cover',name:'封面',description:'大標題、簡介與單張主圖'},
    {id:'image',name:'文字＋單張圖片',description:'並排圖文，適合現況與議題說明'},
    {id:'steps',name:'圖片＋逐步解說',description:'單張圖面、六步解說與可調整打亮框'},
    {id:'compare',name:'左右圖片比較',description:'左右圖面、六步比較與各自的打亮框'},
    {id:'closing',name:'結語',description:'重點標題與三項回顧'}
  ];
  const defaultSteps=()=>Array.from({length:6},(_,index)=>({
    title:['先看整體配置','第一個設置重點','第二個設置重點','第三個設置重點','第四個設置重點','回看整體配置'][index],
    description:'點選這段文字，寫下本步驟的解說。可在「調整打亮」中移動框身、拖曳四角，對準想說明的設施。',
    boxes:{main:[200+index*35,150+index*15,260,180],left:[160+index*40,180,260,180],right:[430-index*30,220,260,180]}
  }));
  function create(type,chapter) {
    if(!types.some(item=>item.id===type)) throw new Error('Unknown template');
    const id='custom-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8));
    return {id,kind:'custom',type,chapter,name:types.find(item=>item.id===type).name,steps:['steps','compare'].includes(type)?defaultSteps():undefined};
  }
  function validPage(page) {
    if(!page||page.kind!=='custom'||!/^custom-[\w-]+$/.test(page.id)||!types.some(type=>type.id===page.type))return false;
    if(!['intro','g1','g2','g3','g4'].includes(page.chapter)||typeof page.name!=='string')return false;
    if(!['steps','compare'].includes(page.type))return true;
    return Array.isArray(page.steps)&&page.steps.length>=1&&page.steps.length<=40&&page.steps.every(step=>
      step&&typeof step.title==='string'&&typeof step.description==='string'&&step.boxes&&
      ['main','left','right'].every(side=>Array.isArray(step.boxes[side])&&step.boxes[side].length===4&&step.boxes[side].every(Number.isFinite)));
  }
  function render(page,phase,editor) {
    const imageKey=side=>`page:${page.id}:${side}`;
    const img=side=>`<div class="custom-image-frame" data-editor-image-key="${imageKey(side)}"><img src="${editor.image(imageKey(side))}" alt="${side==='left'?'左側':side==='right'?'右側':'新增'}情境圖面"></div>`;
    const frame=side=>{
      const key=`custom:${page.id}:${side}:${phase}`;
      const [x,y,width,height]=editor.bounds(key,'box',page.steps[phase].boxes[side]);
      return `<div class="custom-image-frame custom-diagram-frame"><svg class="custom-diagram" viewBox="0 0 1000 640" role="img" aria-label="${side==='left'?'左側':side==='right'?'右側':'情境'}圖面與打亮框" data-custom-frame="${side}" data-editor-image-key="${imageKey(side)}"><image href="${editor.image(imageKey(side))}" width="1000" height="640"/><rect class="selection-box custom-highlight" x="${x}" y="${y}" width="${width}" height="${height}" rx="5"/></svg></div>`;
    };
    const steps=()=>`<nav class="custom-step-dots" aria-label="解說步驟">${page.steps.map((step,index)=>`<button type="button" data-custom-step="${index}" aria-label="第${index+1}步 ${escape(step.title)}" aria-current="${index===phase?'step':'false'}" class="${index===phase?'active':''}">${String(index+1).padStart(2,'0')}</button>`).join('')}</nav>`;
    const top=`<div class="eyebrow">${escape(page.chapter==='intro'?'INTRODUCTION':page.chapter.toUpperCase())} / 新增頁面</div>`;
    if(page.type==='cover')return `<section class="slide custom-cover" aria-labelledby="slide-title"><div>${top}<h1 id="slide-title">在這裡寫下<br>你的章節標題</h1><p class="custom-lead">點選文字修改簡介，並更換右側的情境圖面。</p><span class="tag">章節導讀</span></div>${img('main')}</section>`;
    if(page.type==='image')return `<section class="slide custom-image-slide" aria-labelledby="slide-title"><div>${top}<h1 id="slide-title">情境與設置議題</h1><p class="custom-lead">在這裡說明路口現況、交通需求，或希望觀眾先注意的重點。</p><ul class="custom-bullets"><li>第一項現況或設置考量。</li><li>第二項需要說明的重點。</li><li>第三項相關的參考資訊。</li></ul></div>${img('main')}</section>`;
    if(page.type==='closing')return `<section class="slide custom-closing" aria-labelledby="slide-title">${top}<h1 id="slide-title">回到情境，<br>整理設置重點。</h1><p class="custom-lead">將本段簡報的重要訊息，濃縮成三項回顧。</p><div class="custom-summary-grid">${['第一項重點','第二項重點','第三項重點'].map((title,index)=>`<div><span>0${index+1}</span><h2>${title}</h2><p>在這裡補上簡短的結論與下一步。</p></div>`).join('')}</div></section>`;
    const step=page.steps[phase];
    if(page.type==='compare')return `<section class="slide custom-compare" aria-labelledby="slide-title">${top}<h1 id="slide-title">左右圖例比較</h1><div class="custom-comparison-grid"><div><h2 class="custom-side-title">左圖 / 原配置</h2>${frame('left')}</div><div><h2 class="custom-side-title">右圖 / 調整配置</h2>${frame('right')}</div></div><div class="custom-compare-explanation"><h2>${escape(step.title)}</h2><p>${escape(step.description)}</p></div>${steps()}</section>`;
    return `<section class="slide custom-steps" aria-labelledby="slide-title">${top}<h1 id="slide-title">情境圖面逐步解說</h1><div class="custom-steps-layout">${frame('main')}<aside class="custom-explanation"><span class="tag">步驟 ${String(phase+1).padStart(2,'0')} / ${String(page.steps.length).padStart(2,'0')}</span><h2>${escape(step.title)}</h2><p>${escape(step.description)}</p></aside></div>${steps()}</section>`;
  }
  window.generalRoadTemplates={types,create,validPage,render};
})();
