(() => {
  'use strict';
  // Preserve the authored responsive typography, but calibrate its display sizes
  // to 1920x1080 at Windows 125% and browser 100% (864 logical screen pixels).
  const authoredViewport=Object.freeze({width:2560/1.75,height:1600/1.75});
  const reference=Object.freeze({width:1920/1.25,height:1080/1.25});
  const root=document.documentElement;
  let host,observer,frame=0,connected=false,printing=false,baselineSheet;
  function refresh(){cancelAnimationFrame(frame);frame=requestAnimationFrame(apply);}
  function selectorList(value){
    const values=[];let start=0,depth=0,quote='';
    for(let i=0;i<value.length;i++){
      const c=value[i];if(quote){if(c===quote&&value[i-1]!=='\\')quote='';continue;}
      if(c==='"'||c==="'"){quote=c;continue;}
      if(c==='('||c==='[')depth++;else if(c===')'||c===']')depth--;
      else if(c===','&&!depth){values.push(value.slice(start,i).trim());start=i+1;}
    }
    values.push(value.slice(start).trim());return values.filter(Boolean);
  }
  function referenceMedia(query){
    const rewritten=query.replace(/\(\s*(min|max)-(width|height)\s*:\s*([\d.]+)(px|em|rem)\s*\)/gi,(_all,bound,axis,n,unit)=>{
      const threshold=Number(n)*(unit.toLowerCase()==='px'?1:16),value=authoredViewport[axis.toLowerCase()];
      return (bound.toLowerCase()==='min'?value>=threshold:value<=threshold)?'(min-width:0px)':'(max-width:0px)';
    }).replace(/\(\s*orientation\s*:\s*(landscape|portrait)\s*\)/gi,(_all,value)=>value.toLowerCase()==='landscape'?'(min-width:0px)':'(max-width:0px)');
    return matchMedia(rewritten).matches;
  }
  function referenceUnits(value){
    return value.replace(/(-?\d*\.?\d+)(dvh|svh|lvh|dvw|svw|lvw|vmin|vmax|vh|vw)\b/gi,(_all,n,unit)=>{
      unit=unit.toLowerCase();const dimension=unit.endsWith('vh')?authoredViewport.height:unit.endsWith('vw')?authoredViewport.width:unit==='vmin'?Math.min(authoredViewport.width,authoredViewport.height):Math.max(authoredViewport.width,authoredViewport.height);
      return Number(n)*dimension/100+'px';
    });
  }
  function buildBaseline(){
    const rules=[];
    function visit(list){
      for(const rule of list){
        if(rule instanceof CSSMediaRule){if(referenceMedia(rule.conditionText))visit(rule.cssRules);continue;}
        if(typeof CSSSupportsRule==='function'&&rule instanceof CSSSupportsRule){if(CSS.supports(rule.conditionText))visit(rule.cssRules);continue;}
        if(!(rule instanceof CSSStyleRule))continue;
        const declarations=['font-size','line-height'].filter(name=>rule.style.getPropertyValue(name)).map(name=>name+':'+referenceUnits(rule.style.getPropertyValue(name))+(rule.style.getPropertyPriority(name)?'!important':'')+';').join('');
        if(!declarations)continue;
        for(const selector of selectorList(rule.selectorText)){
          const pseudo=selector.match(/^(.*?)(::(?:before|after|marker|first-letter|first-line)\b.*)$/);
          const target=pseudo?':is('+pseudo[1]+')'+pseudo[2]:':is('+selector+')';
          rules.push('html:is([data-screen-fonts="measure"],[data-screen-fonts="active"]) :where(#presentation,#presentation *)'+target+'{'+declarations+'}');
        }
      }
    }
    for(const sheet of document.styleSheets){if(sheet.ownerNode===baselineSheet||sheet.ownerNode?.id==='screen-font-height-styles')continue;try{if(!sheet.media.mediaText||referenceMedia(sheet.media.mediaText))visit(sheet.cssRules);}catch{/* Keep readable native typography if a sheet cannot be inspected. */}}
    baselineSheet.textContent=rules.join('\n');
  }
  function observe(){observer.observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class'],attributeOldValue:true});}
  function apply(){
    if(!host)return;
    const desktop=!matchMedia('(pointer: coarse)').matches&&(screen.width>=768||innerWidth>=768);
    if(!desktop||printing||document.getElementById('pdf-slides-styles')){
      root.dataset.screenFonts='suspended';return;
    }
    observer.disconnect();root.dataset.screenFonts='measure';
    try{
      // Browser chrome and editor panels must not alter text/screen proportions.
      // screen.height is already expressed in logical pixels after OS scaling.
      // Keep browser page zoom available as an intentional reading adjustment.
      const scale=(screen.height||innerHeight)/reference.height;
      root.style.setProperty('--screen-font-scale',String(scale));
      // Navigation dimensions and text use 1920x1080 / Windows 100% as reference.
      root.style.setProperty('--screen-chrome-scale',String((screen.height||innerHeight)/1080));
      const records=[];
      for(const node of host.querySelectorAll('*')){
        if(!(node instanceof HTMLElement)||node.closest('[data-editor-ui]'))continue;
        const style=getComputedStyle(node),font=parseFloat(style.fontSize),line=parseFloat(style.lineHeight);
        if(!Number.isFinite(font)||font<=0)continue;
        const record={node,font,line,pseudos:[]};
        for(const side of ['before','after']){
          const pseudo=getComputedStyle(node,'::'+side),size=parseFloat(pseudo.fontSize);
          if(pseudo.content&& !['none','normal','""',"''"].includes(pseudo.content)&&Number.isFinite(size))record.pseudos.push({side,font:size,line:parseFloat(pseudo.lineHeight)});
        }
        records.push(record);
      }
      for(const {node,font,line,pseudos}of records){
        node.dataset.screenFontSize='';node.style.setProperty('--screen-font-base',font+'px');
        if(Number.isFinite(line)){node.dataset.screenLineHeight='';node.style.setProperty('--screen-line-base',line+'px');}else delete node.dataset.screenLineHeight;
        for(const {side,font,line}of pseudos){node.setAttribute('data-screen-'+side+'-font','');node.style.setProperty('--screen-'+side+'-font',font+'px');node.style.setProperty('--screen-'+side+'-line',Number.isFinite(line)?'calc('+line+'px * var(--screen-font-scale))':'normal');}
      }
      root.dataset.screenFonts='active';
    }finally{observe();}
  }
  function baseFontSize(element){
    if(!element)return undefined;
    const style=getComputedStyle(element);
    return root.dataset.screenFonts==='active'&&element.hasAttribute('data-screen-font-size')?parseFloat(style.getPropertyValue('--screen-font-base')):parseFloat(style.fontSize);
  }
  function connect(){
    if(connected)return;connected=true;host=document.getElementById('presentation');
    baselineSheet=document.createElement('style');baselineSheet.id='screen-font-height-baseline';document.head.append(baselineSheet);buildBaseline();
    observer=new MutationObserver(records=>{
      const typography=value=>(value||'').match(/(?:^|;)\s*(?:font(?:-size|-family|-weight|-style)?|line-height|letter-spacing)\s*:[^;]+/gi)?.join(';')||'';
      if(records.some(record=>record.type==='childList'||record.target instanceof HTMLElement&&(record.attributeName==='class'||typography(record.oldValue)!==typography(record.target.getAttribute('style')))))refresh();
    });observe();
    new MutationObserver(refresh).observe(document.body,{attributes:true,attributeFilter:['class']});
    window.addEventListener('resize',refresh);window.visualViewport?.addEventListener('resize',refresh);document.addEventListener('fullscreenchange',refresh);
    // Moving between displays can change resolution without a window resize.
    function watchResolution(){const query=matchMedia('(resolution: '+devicePixelRatio+'dppx)');query.addEventListener('change',()=>{refresh();watchResolution();},{once:true});}watchResolution();
    document.fonts?.ready.then(refresh);
    window.addEventListener('beforeprint',()=>{printing=true;apply();});window.addEventListener('afterprint',()=>{printing=false;refresh();});
    refresh();
  }
  window.PresentationFontHeight={connect,refresh,reference,baseFontSize};
})();
