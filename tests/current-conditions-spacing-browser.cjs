'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,navigate,view,click,cdp,base,artifacts,pass})=>{
 const run=fn=>evaluate('('+fn.toString()+')()');
 const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
 const shot=async name=>{const s=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(s.data,'base64'));};
 const metrics=()=>run(()=>{
  const slide=document.querySelector('.conditions-current-slide'),grid=slide.querySelector('.conditions-issues'),left=slide.querySelector('.conditions-current-figure');
  const baseline=node=>{const marker=document.createElement('span');marker.style.cssText='display:inline-block;width:0;height:0;padding:0;margin:0;vertical-align:baseline';node.prepend(marker);const y=marker.getBoundingClientRect().top;marker.remove();return y;};
  const cards=[...grid.querySelectorAll('.condition-issue')].map(card=>{const image=card.querySelector('.condition-photo'),r=image.getBoundingClientRect(),heading=card.querySelector('.condition-card-heading').getBoundingClientRect(),points=card.querySelector('.condition-points'),pr=points.getBoundingClientRect(),point=points.querySelector('p'),bullet=point&&getComputedStyle(point,'::before');return {top:card.getBoundingClientRect().top,heading:heading.top,image:r.top,points:pr.top,width:r.width,height:r.height,overflow:card.scrollHeight-card.clientHeight,textOverflow:points.scrollHeight-points.clientHeight,bulletWidth:bullet&&parseFloat(bullet.width),font:point&&parseFloat(getComputedStyle(point).fontSize)};});
  return {mode:slide.dataset.conditionsLayout,bounded:slide.dataset.conditionHeightBounded,titleBaseline:baseline(document.getElementById('slide-title')),nameBaseline:baseline(slide.querySelector('.conditions-heading>p')),left:left.getBoundingClientRect().width/(left.getBoundingClientRect().width+grid.getBoundingClientRect().width),gridOverflow:grid.scrollHeight-grid.clientHeight,outerOverflow:document.documentElement.scrollWidth-innerWidth,cards};
 });
 await navigate(base+'/presentation-demo/#g201-conditions');
 const scenes=await run(()=>generalRoadPresentation.data.scenarios.filter(s=>s.code.startsWith('G')&&s.currentConditions).map(s=>s.currentConditions.pageId));
 const report=[];
 for(const [width,height]of [[1536,864],[2560,1440],[1024,768]]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1,mobile:false});
  for(const id of width===1536?scenes:['g201-conditions','g203-conditions']){
   await view(id);await click('[data-condition-layout="cards"]');await evaluate('Promise.all([...document.querySelectorAll(".condition-photo img")].map(i=>i.decode().catch(()=>{})))');await settle();
   const m=await metrics();report.push({id,width,...m});fs.writeFileSync(path.join(artifacts,'measurements.json'),JSON.stringify(report,null,2));
   assert(Math.abs(m.titleBaseline-m.nameBaseline)<1,'Heading baselines: '+id+' '+JSON.stringify(m));assert(m.left>=.279&&m.left<=.521);assert(m.outerOverflow<=1);
   {
    assert(m.gridOverflow<=2,'No card-column scrollbar: '+id+' '+JSON.stringify(m));assert(m.cards.every(c=>c.overflow<=2&&c.textOverflow<=2),'No clipped card text: '+id+' '+JSON.stringify(m));
    assert(Math.max(...m.cards.map(c=>c.height))-Math.min(...m.cards.map(c=>c.height))<2,'All card photos share one height: '+id);
   }
   for(const card of m.cards)if(card.bulletWidth)assert(card.bulletWidth>=card.font*.32);
   const rows=[];for(const card of m.cards){let row=rows.find(r=>Math.abs(r[0].top-card.top)<3);if(!row)rows.push(row=[]);row.push(card);}for(const row of rows)if(row.length>1)for(const part of ['heading','image','points'])assert(Math.max(...row.map(c=>c[part]))-Math.min(...row.map(c=>c[part]))<2,'Card alignment: '+id+' '+part);
   if(id==='g201-conditions'||id==='g203-conditions')await shot(id+'-'+width);
  }
 }
 assert(report.some(m=>m.id==='g201-conditions'&&m.left>.29),'The left diagram should grow when that reduces photo side space');
 for(const id of ['g201-conditions','g203-conditions'])for(const mode of ['cards-4','auto']){await view(id);await click('[data-condition-layout="'+mode+'"]');await settle();const m=await metrics();assert(m.gridOverflow<=2,id+' '+mode+' must fit the available height');assert(Math.max(...m.cards.map(c=>c.height))-Math.min(...m.cards.map(c=>c.height))<2);}
 await view('g203-conditions');await click('[data-condition-layout="split"]');await settle();const split=await metrics();assert(Math.abs(split.left-.5)<.01);assert(!split.bounded);
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,screenWidth:390,screenHeight:844,deviceScaleFactor:1,mobile:true});
 for(const id of ['g201-conditions','g203-conditions']){await view(id);await settle();assert((await metrics()).outerOverflow<=1);}
 pass('general current-condition headings share a text baseline; G2-01 and G2-03 photos stay equally tall with no added scrollbars or clipped text; adaptive diagram widths and mobile layout verified');
};
