'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=async({evaluate,view,navigate,click,cdp,base,artifacts,pass,wait})=>{
 const run=fn=>evaluate('('+fn.toString()+')()'),moduleFile=path.resolve(__dirname,'../data/modules/M2-01.json'),before=crypto.createHash('sha256').update(fs.readFileSync(moduleFile)).digest('hex');
 await navigate(base+'/presentation-demo/#results-module-example');await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'results-stop-extensions');
 const expected=[['行人穿越道線','庇護空間'],['路緣轉角槽化','路口預告標誌']],ids=['results-stop-extensions','results-stop-extensions-2'];
 for(let i=0;i<2;i++)for(const [width,height]of [[1600,1000],[1280,800]]){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await view(ids[i]);
  assert.equal(await run(()=>window.generalRoadPresentation.page.deckId),'results');assert.deepEqual(await run(()=>[...document.querySelectorAll('.results-extension-card>header h2')].map(h=>h.textContent)),expected[i]);
  const b=await run(()=>{const root=document.getElementById('presentation');return {y:root.scrollHeight-root.clientHeight,x:document.documentElement.scrollWidth-innerWidth,images:[...document.querySelectorAll('.results-extension-images')].map(el=>el.getBoundingClientRect().height),sources:[...document.querySelectorAll('.results-extension-images image')].map(img=>decodeURI(img.getAttribute('href')))};});assert(b.x<=1&&b.y<=2,JSON.stringify(b));assert(b.images.every(h=>h>=100),JSON.stringify(b));assert.equal(b.sources.length,i===0?2:1);if(i===0)assert(b.sources[0].startsWith('materials/edited/'));
  if(width===1600){const screenshot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'stop-extensions-'+(i+1)+'.png'),Buffer.from(screenshot.data,'base64'));}
 }
 await click('#next');assert.equal(await run(()=>window.generalRoadPresentation.page.id),'chapter-cover-results-review');
 await view(ids[0]);await click('.edit-toggle');
 const edited=await run(()=>{const h=document.querySelector('.results-extension-copy h3');const key=h.dataset.editKey;h.textContent='複本修改測試';h.dispatchEvent(new Event('input',{bubbles:true}));return {key,original:window.PresentationModules.contents.find(d=>d.id==='M2-01').pages.find(p=>p.id==='m201-stop-crosswalk').points[0].title};});
 assert(edited.key.startsWith('results-stop-extensions|'));assert.equal(edited.original,'先停讓行人');
 assert.equal((await run(()=>window.visualLayoutEditor.save())).saved,true);await navigate(base+'/presentation-demo/#results-stop-extensions');
 assert.equal(await run(()=>document.querySelector('.results-extension-copy h3').textContent),'複本修改測試');
 await view('m201-stop-extensions');assert.equal(await run(()=>window.generalRoadPresentation.page.deckId),'modules');assert.equal(await run(()=>document.querySelector('.module-explain-points h3').textContent),'先停讓行人');
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(moduleFile)).digest('hex'),before);
 pass('Both extension groups follow the first-deck stop example, use the current source images and text, fit 16:10 screens, and edits save independently of the original second deck');
};
