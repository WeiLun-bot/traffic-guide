(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.PresentationText=api;api.connect();}
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const units={'平方公尺':'m²','平方公分':'cm²','立方公尺':'m³','公里每小時':'km/h','公里／小時':'km/h','公里/小時':'km/h','公尺／秒':'m/s','公尺/秒':'m/s','公里':'km','公尺':'m','公分':'cm','毫米':'mm','公釐':'mm','公厘':'mm','秒':'s','分鐘':'min','小時':'h','公斤':'kg'};
  const names=Object.keys(units).sort((a,b)=>b.length-a.length).map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const bracketUnits=new RegExp('([（(])\\s*('+names+')\\s*([）)])','g'),labelUnits=new RegExp('(單位[：:]\\s*)('+names+')','g');
  const quantity='(?:\\d+(?:\\.\\d+)?|[零〇一二兩三四五六七八九十百千]+(?:點[零〇一二兩三四五六七八九\\d]+)?|半)';
  const quantityPair=new RegExp('('+quantity+')\\s*(至|到|或|[~～–])\\s*('+quantity+')\\s*('+names+'|cm|m)(?=\\b|[^a-zA-Z]|$)','g');
  function chineseNumber(value){
    if(/^\d+(?:[.-]\d+)*$/.test(value))return value;
    const digits={零:0,〇:0,一:1,二:2,兩:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
    if(value==='半')return '0.5';
    if(value.includes('點')){const [whole,fraction]=value.split('點');return chineseNumber(whole)+'.'+[...fraction].map(c=>digits[c]??c).join('');}
    let total=0,n=0;
    for(const c of value){if(c in digits)n=digits[c];else{total+=(n||1)*({十:10,百:100,千:1000}[c]||1);n=0;}}
    return String(total+n);
  }
  function generalText(value){
    let text=value.replace(/整理(?=車流|路側|路口|斜交|銳角|人行|人車|車道|槽化|轉角|左轉|偏移|停車|高速|混合|停讓)/g,'調整').replace(/(需共同|需要|分向標線)整理/g,'$1調整');
    text=text.replace(/依本情境章節整理/g,'依本情境章節彙整').replace(/(\.typ\s*)整理/g,'$1彙整');
    text=text.replace(/「(市區道路及附屬工程設計規範|公路路線設計規範|交通工程規範)」/g,'《$1》');
    text=text.replace(/第\s*(\d+(?:\.\d+)+)\s*節(?:之規定)?/g,'§ $1').replace(/(《[^》]+》)\s*§/g,'$1§');
    const decimals=n=>(String(n).split('.')[1]||'').length;
    const metres=(n,unit,places=0)=>(Number(n)/(unit==='cm'?100:1)).toFixed(Math.min(12,Math.max(places,decimals(n)+(unit==='cm'?2:0))));
    text=text.replace(/(\d+(?:\.\d+)?)\s*(cm|m)\s*(?:至|到|[~～–])\s*(\d+(?:\.\d+)?)\s*\2\b(?![²³^\d/])/g,'$1–$3 $2');
    text=text.replace(/(\d+(?:\.\d+)?)\s*(?:至|到|[~～–])\s*(\d+(?:\.\d+)?)\s*(cm|m)\b(?![²³^\d/])/g,(_all,a,b,unit)=>{
      const precise=unit==='cm'||a.includes('.')||b.includes('.'),scale=unit==='cm'?100:1;
      const places=precise?Math.max(2,decimals(a)+(unit==='cm'?2:0),decimals(b)+(unit==='cm'?2:0)):0;
      const number=n=>precise?metres(n,unit,places):String(Number(n)/scale);
      return number(a)+'–'+number(b)+' m';
    });
    text=text.replace(/(\d+(?:\.\d+)?)\s*或\s*(\d+(?:\.\d+)?)\s*cm\b(?![²³^\d/])/g,(_all,a,b)=>metres(a,'cm',2)+' 或 '+metres(b,'cm',2)+' m');
    text=text.replace(/(\d+(?:\.\d+)?)\s*cm\b(?![²³^\d/])/g,(_all,n)=>metres(n,'cm',2)+' m');
    text=text.replace(/(\d+(?:\.\d+)?)\s*(?:至|到|[~～])\s*(\d+(?:\.\d+)?)(?=\s*(?:m\b|km\/h\b|s\b))/g,'$1–$2');
    text=text.replace(/(?<![\d.])(\d+\.\d)\s*m\b(?![²³^\d/])/g,(_all,n)=>Number(n).toFixed(2)+' m');
    return text.replace(/(§ \d+(?:[.-]\d+)*)(?=[\u3400-\u9fff])/g,'$1 ');
  }
  function format(value,options={}){
    let text=String(value??'').replace(/情境回顧|情境小節/g,'情境小結').replace(/條文與(?:回顧|小節)/g,'條文與小結');
    text=text.replace(/第\s*(\d+(?:-\d+)?|[零〇一二兩三四五六七八九十百千]+)\s*條(?:之\s*(\d+))?/g,(_all,n,sub)=>'§ '+chineseNumber(n)+(sub?'-'+sub:''));
    text=text.replace(/§\s*(?=\d)/g,'§ ');
    text=text.replace(/每小時\s*(\d+(?:\.\d+)?)\s*公里/g,'$1 km/h');
    text=text.replace(quantityPair,(_all,a,join,b,unit)=>chineseNumber(a)+(join==='或'?' 或 ':join)+chineseNumber(b)+' '+unit);
    text=text.replace(/([\d]+(?:\.\d+)?|[零〇一二兩三四五六七八九十百千]+(?:點[零〇一二兩三四五六七八九\d]+)?|半)\s*(平方公尺|平方公分|立方公尺|公里每小時|公里[／/]小時|公尺[／/]秒|公里|公尺|公分|毫米|公釐|公厘|分鐘|小時|公斤|秒)/g,(_all,n,unit,offset,input)=>(/[數幾]/.test(input[offset-1]||'')?n:chineseNumber(n))+' '+units[unit]);
    text=text.replace(/(\d)\s*(?:kph|km\s*\/\s*hr|KM\s*\/\s*H)\b/gi,'$1 km/h');
    text=text.replace(/(\d)\s*(km\/h|m\/s|cm²|m²|m³|mm|cm|km|kg|m|s)\b/g,'$1 $2');
    text=text.replace(bracketUnits,(_all,_left,unit)=>'（'+units[unit]+'）');
    text=text.replace(labelUnits,(_all,label,unit)=>label+units[unit]);
    if(Object.hasOwn(units,text.trim()))text=text.replace(text.trim(),units[text.trim()]);
    text=text.replace(/(\d)\s*度(?=以內|以下|以上|角|[、，。；）)]|$)/g,'$1°').replace(/(\d)\s*℃/g,'$1 °C');
    text=text.replace(/(\d)\s*(cm|m)\^?([23])\b/g,(_all,n,unit,power)=>n+' '+unit+(power==='2'?'²':'³'));
    text=text.replace(/(^|\s)0(\d)(?=$|[\s、．])/g,'$1$2');
    for(let i=0;i<3;i++)text=text.replace(/\(([^()]*)\)/g,(all,inner)=>/[\u3400-\u9fff]/.test(inner)||/^(?:km\/h|m\/s|mm|cm|km|m²|m³|m|s|%)$/.test(inner)?'（'+inner+'）':all);
    text=text.replace(/^(標誌|標線|號誌)條文$/,'$1條文運用解說');
    return options.general?generalText(text):text;
  }
  function isGeneral(node){
    return Boolean(node.closest('[data-toc-presentation="general"]')||document.body.dataset.presentation==='general'&&node.closest('#presentation,#source-dialog,#asset-dialog'));
  }
  function apply(host,options={}){
    if(!host)return;
    const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT),nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      const parent=node.parentElement;
      if(!parent||parent.closest('script,style,textarea,input,select,pre,code,[contenteditable]:not([contenteditable="false"]),[data-preserve-text]'))continue;
      const next=format(node.nodeValue,{general:options.general??isGeneral(parent)});if(next!==node.nodeValue)node.nodeValue=next;
    }
    for(const node of host.querySelectorAll('[title],[aria-label],[alt]'))for(const name of ['title','aria-label','alt']){
      if(!node.hasAttribute(name))continue;
      const before=node.getAttribute(name),next=format(before,{general:options.general??isGeneral(node)});if(next!==before)node.setAttribute(name,next);
    }
    if(host===document.body){const title=format(document.title,{general:document.body.dataset.presentation==='general'});if(title!==document.title)document.title=title;}
  }
  function connect(){
    let pending=false;
    const observer=new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;apply(document.body);});});
    observer.observe(document.body,{subtree:true,childList:true});apply(document.body);
  }
  return {format,apply,connect};
});
