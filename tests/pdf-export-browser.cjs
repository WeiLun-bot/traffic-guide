'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,navigate,click,wait,cdp,base,artifacts,pass})=>{
 const run=fn=>evaluate('('+fn.toString()+')()');
 await navigate(base+'/presentation-demo/#context');await run(()=>generalRoadEditor.setEditing(true));
 await run(()=>{visualLayoutEditor.files.local={token:'pdf-token',revision:'saved-revision'};visualLayoutEditor.transact(config=>{config.legacyState.texts['pdf-test']='unsaved';},false);});
 await click('[data-vl-action="pdf-general"]');assert(await run(()=>document.querySelector('.vl-status').textContent.includes('先儲存')));
 await run(()=>{
   visualLayoutEditor.store.markSaved(visualLayoutEditor.store.snapshot());visualLayoutEditor.files.local={token:'pdf-token',revision:'saved-revision'};
   const original=window.fetch;window.__pdfRequests=[];
   window.fetch=async(input,options)=>{
     const url=new URL(typeof input==='string'?input:input.url||String(input),document.baseURI);
     if(url.pathname.endsWith('/__pdf')){window.__pdfRequests.push({headers:options.headers,body:JSON.parse(options.body)});return new Response(JSON.stringify({id:'a'.repeat(24),state:'running',pages:0,total:220}),{status:202,headers:{'Content-Type':'application/json'}});}
     if(url.pathname.endsWith('/__pdf/'+'a'.repeat(24)))return new Response(JSON.stringify({id:'a'.repeat(24),state:'complete',pages:220,total:220,download:'__pdf/'+'a'.repeat(24)+'/file'}),{headers:{'Content-Type':'application/json'}});
     return original(input,options);
   };
 });
 const downloads=path.join(artifacts,'pdf-downloads');fs.mkdirSync(downloads,{recursive:true});await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
 await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*__pdf/*/file',requestStage:'Request'}]});
 cdp.on('Fetch.requestPaused',event=>cdp.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/pdf'},{name:'Content-Disposition',value:'attachment; filename=general-road-scenarios.pdf'}],body:Buffer.from('%PDF-1.7\nfixture').toString('base64')}).catch(()=>{}));
 await click('[data-vl-action="pdf-general"]');await wait('!visualLayoutEditor.busy');
 assert.equal(await run(()=>window.__pdfRequests.length),1);assert.equal(await run(()=>window.__pdfRequests[0].body.deck),'general');assert.equal(await run(()=>window.__pdfRequests[0].body.revision),'saved-revision');assert.equal(await run(()=>window.__pdfRequests[0].headers['X-Project-Token']),'pdf-token');
 assert(await run(()=>Boolean(document.querySelector('.pdf-download-link'))));assert(await run(()=>document.querySelector('.vl-status').textContent.includes('已完成')));
 for(let i=0;i<50&&!fs.readdirSync(downloads).some(n=>n.endsWith('.pdf'));i++)await new Promise(r=>setTimeout(r,100));
 const file=fs.readdirSync(downloads).find(n=>n.endsWith('.pdf'));assert(file,'The completed PDF must download');assert(fs.readFileSync(path.join(downloads,file),'utf8').startsWith('%PDF'));
 pass('PDF export guards unsaved changes, submits the authorized saved revision, polls progress and downloads the completed PDF');
};
