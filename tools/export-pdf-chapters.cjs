'use strict';
// Print the actual saved slides at their screen size, with no reflow into A4.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {createServer}=require('./serve-github-pages.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'exports','PDF-M1-01-G1-01');
const width=1600,height=900,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class CDP{
 constructor(url){this.seq=0;this.pending=new Map();this.listeners=new Map();this.socket=new WebSocket(url);this.ready=new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve);this.socket.addEventListener('error',reject);});this.socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const request=this.pending.get(message.id);if(!request)return;clearTimeout(request.timer);this.pending.delete(message.id);message.error?request.reject(new Error(JSON.stringify(message.error))):request.resolve(message.result);}else for(const callback of this.listeners.get(message.method)||[])callback(message.params);});}
 on(event,callback){this.listeners.set(event,[...(this.listeners.get(event)||[]),callback]);}
 async send(method,params={}){await this.ready;const id=++this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Browser timeout: '+method));},45000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
 async evaluate(expression){const result=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
 close(){this.socket.close();}
}
async function main(){
 const configFile=path.join(root,'layout/presentation-layout.json'),config=fs.readFileSync(configFile);
 const executable=process.env.VISUAL_EDITOR_BROWSER||['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(file=>fs.existsSync(file));
 assert(executable,'Chrome or Edge is required.');fs.mkdirSync(output,{recursive:true});
 const published=createServer(),server=require('node:http').createServer((req,res)=>{if(new URL(req.url,'http://localhost').pathname.endsWith('/layout/presentation-layout.json')){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(config);}else published.emit('request',req,res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/presentation-demo/';
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'traffic-guide-pdf-'));
 const browser=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 const exited=new Promise(resolve=>browser.once('exit',resolve));let cdp;
 try{
  const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<200&&!fs.existsSync(portFile);i++){if(browser.exitCode!==null)throw new Error('Browser exited before starting');await delay(100);}assert(fs.existsSync(portFile),'Browser startup timed out');
  const port=fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0],targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();cdp=new CDP(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
  const errors=[];cdp.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails.exception?.description||event.exceptionDetails.text));
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await cdp.send('Emulation.setEmulatedMedia',{media:'screen',features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await cdp.send('Page.navigate',{url:base+'#m101-overview'});
  let loaded=false;for(let i=0;i<400;i++){if(await cdp.evaluate('Boolean(document.documentElement.dataset.presentationState==="ready"&&window.visualLayoutEditor?.store&&document.querySelector("main>.slide"))').catch(()=>false)){loaded=true;break;}await delay(100);}assert(loaded,'Presentation did not load');
  let documents=await cdp.evaluate(`(()=>{
    const api=window.generalRoadPresentation,content=window.PresentationModules.contents.find(doc=>doc.id==='M1-01');
    const moduleSheets=[{id:content.pages[0].id,title:content.pages[0].title}];
    for(const flow of content.submoduleFlows)for(const stage of window.PresentationModules.visibleStages(flow)){
      if(stage.id==='diagram')for(const topic of window.PresentationOrder.forKey(stage.topics,'module:'+stage.pageId))moduleSheets.push({id:stage.pageId,topic:topic.id,title:flow.submoduleId+' '+stage.title+'｜'+topic.label});
      else moduleSheets.push({id:stage.pageId,title:flow.submoduleId+' '+stage.title});
    }
    const generalSheets=api.pages.filter(page=>page.scenario==='g1-01'&&!['chapter-scenarios'].includes(page.kind)).map(page=>({id:page.id,phase:page.article?1:0,title:page.name}));
    return [{id:'M1-01',title:'M1-01 路口動線導引',sheets:moduleSheets},{id:'G1-01',title:'G1-01 無號誌市區正交三岔路口',sheets:generalSheets}];
  })()`);
  assert(documents.every(doc=>doc.sheets.length>0),'Both chapters must have pages.');
  const chapter=process.argv.find(arg=>arg.startsWith('--chapter='))?.slice('--chapter='.length);
  if(chapter){assert(documents.some(doc=>doc.id===chapter),'Unknown chapter: '+chapter);documents=documents.filter(doc=>doc.id===chapter);}
  await cdp.evaluate(`(()=>{const style=document.createElement('style');style.id='pdf-slides-styles';style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'pdf-slides.css'),'utf8'))};document.head.append(style);const label=document.createElement('span');label.className='pdf-section-label';document.querySelector('.header').append(label);const footer=document.createElement('div');footer.className='pdf-footer';document.body.append(footer);})()`);
  const manifest={paper:'16:9 landscape',viewport:{width,height},configSha256:crypto.createHash('sha256').update(config).digest('hex'),generatedAt:new Date().toISOString(),documents:[]};
  for(const doc of documents){
   const folder=path.join(output,doc.id);fs.mkdirSync(folder,{recursive:true});const sheets=[];
   for(const sheet of doc.sheets){
    await cdp.evaluate(`(()=>{document.body.classList.remove('pdf-hide-controls');const api=window.generalRoadPresentation;api.goPage(${JSON.stringify(sheet.id)},${sheet.phase||0},{force:true});${sheet.topic?`api.goPage(window.PresentationModules.resolvePage(${JSON.stringify(sheet.id)},${JSON.stringify('topic-'+sheet.topic)}),0,{force:true});`:''}})()`);
    await cdp.evaluate(`(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('main img,main svg image')].map(node=>{const src=node.currentSrc||node.src||node.getAttribute('href');if(!src)return;const image=new Image();image.src=src;return image.decode();}));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);
    await delay(500);
    const metadata=await cdp.evaluate(`(()=>{
      const slide=document.querySelector('main>.slide'),rect=node=>{const r=node.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
      const maps=[...slide.querySelectorAll('.map-card,.module-map-canvas,.map-canvas,.conditions-current-canvas,.context-map-canvas')];const before=maps.map(rect);
      const contentImages=[...slide.querySelectorAll('img,svg image')].filter(n=>!n.closest('.compare-before-wrap')&&n.getClientRects().length&&getComputedStyle(n).visibility==='visible');
      // Some content uses buttons as containers. Keep its text and pictures as static content.
      slide.querySelectorAll('.overview-list button,.module-reference-row button,.module-scenario-refs button,.module-case,.module-link,.module-extension-image-open,.condition-photo-open').forEach(node=>node.classList.add('pdf-content-control'));
      document.body.classList.add('pdf-hide-controls');
      document.querySelector('.pdf-section-label').textContent=${JSON.stringify(doc.title)};
      const after=maps.map(rect);if(before.some((r,i)=>r.some((v,k)=>Math.abs(v-after[i][k])>0.5)))throw new Error('Hiding controls changed an image frame: '+${JSON.stringify(sheet.id)}+' '+JSON.stringify({before,after,body:rect(document.body),main:rect(document.querySelector('main'))}));
      if(contentImages.some(node=>getComputedStyle(node).visibility!=='visible'))throw new Error('Hiding controls hid a content image: '+${JSON.stringify(sheet.id)});
      const scroll=[...slide.querySelectorAll('.explanation,.module-explanation,.module-extension-copy,.conditions-issues')].filter(n=>n.getClientRects().length&&n.scrollHeight>n.clientHeight+3).map(n=>({class:n.className,height:n.clientHeight,scroll:n.scrollHeight}));
      const bottom=document.getElementById('presentation').getBoundingClientRect().bottom;
      const clipped=[...slide.querySelectorAll('h1,h2,h3,p,li,.road-fact,.condition-issue,.context-note,.map-card')].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility==='visible'&&n.getBoundingClientRect().bottom>bottom+2).map(n=>({class:n.className,text:n.textContent.slice(0,90),bottom:n.getBoundingClientRect().bottom}));
      return {id:window.generalRoadPresentation.page.id,title:slide.querySelector('h1')?.textContent,text:slide.innerText,frames:after,overflow:scroll,clipped,mainHeight:document.getElementById('presentation').clientHeight,mainScroll:document.getElementById('presentation').scrollHeight};
    })()`);
    assert.equal(metadata.id,sheet.id,'Wrong page selected');
    if(metadata.overflow.length||metadata.clipped.length){const diagnostic=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(folder,'overflow-'+sheet.id+'.png'),Buffer.from(diagnostic.data,'base64'));throw new Error('Content needs continuation pages: '+JSON.stringify({sheet,...metadata,text:undefined,frames:undefined}));}
    const number=sheets.length+1,filename=String(number).padStart(2,'0')+'-'+sheet.id+(sheet.topic?'-'+sheet.topic:'');
    await cdp.evaluate(`document.querySelector('.pdf-footer').innerHTML='<span>'+${JSON.stringify(sheet.title)}+'</span><span>'+${JSON.stringify(String(number).padStart(2,'0')+' / '+doc.sheets.length)}+'</span>'`);
    const png=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(folder,filename+'.png'),Buffer.from(png.data,'base64'));
    const pdf=await cdp.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0,paperWidth:width/96,paperHeight:height/96,scale:1,generateTaggedPDF:true});fs.writeFileSync(path.join(folder,filename+'.pdf'),Buffer.from(pdf.data,'base64'));
    sheets.push({...sheet,file:doc.id+'/'+filename+'.pdf',image:doc.id+'/'+filename+'.png',titleInPresentation:metadata.title,frames:metadata.frames,textCharacters:metadata.text.length});
    console.log('Exported '+doc.id+' '+number+' / '+doc.sheets.length+': '+filename);
   }
   manifest.documents.push({...doc,sheets});
  }
  assert.deepEqual(errors,[],'Uncaught presentation errors');
  assert(fs.readFileSync(configFile).equals(config),'Saved presentation settings changed during export');
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('PDF sheets ready: '+output);
 }finally{if(cdp)await cdp.send('Browser.close').catch(()=>{});cdp?.close();if(browser.exitCode===null)browser.kill();await Promise.race([exited,delay(1500)]);await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
