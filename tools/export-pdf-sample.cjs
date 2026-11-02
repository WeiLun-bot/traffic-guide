'use strict';
// Export the saved presentation through a separate Edge/Chrome instance; never write its JSON.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createServer}=require('./serve-github-pages.cjs');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'exports','G1-01-PDF-sample');
const sheets=[
 {id:'context',phase:0,title:'路口現況與改善目標'},
 {id:'g101-conditions',phase:0,title:'現況問題'},
 {id:'overview',phase:0,title:'整體佈設策略'},
 {id:'edge',phase:1,title:'路面邊線'},
 {id:'crosswalk',phase:1,title:'枕木紋行人穿越道線'},
 {id:'speed',phase:1,title:'最高速限標誌'}
];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class CDP{
 constructor(url){this.seq=0;this.pending=new Map();this.listeners=new Map();this.socket=new WebSocket(url);this.ready=new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve);this.socket.addEventListener('error',reject);});this.socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const request=this.pending.get(message.id);if(!request)return;clearTimeout(request.timer);this.pending.delete(message.id);message.error?request.reject(new Error(JSON.stringify(message.error))):request.resolve(message.result);}else for(const callback of this.listeners.get(message.method)||[])callback(message.params);});}
 on(event,callback){this.listeners.set(event,[...(this.listeners.get(event)||[]),callback]);}
 async send(method,params={}){await this.ready;const id=++this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Browser timeout: '+method));},45000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
 async evaluate(expression){const result=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
 close(){this.socket.close();}
}
async function main(){
 const configPath=path.join(root,'layout/presentation-layout.json'),config=fs.readFileSync(configPath),fingerprint=crypto.createHash('sha256').update(config).digest('hex');
 const executable=process.env.VISUAL_EDITOR_BROWSER||['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(file=>fs.existsSync(file));
 if(!executable)throw new Error('Chrome or Edge is required.');
 fs.mkdirSync(output,{recursive:true});
 // A private immutable snapshot ensures all exported sheets use one saved revision.
 const published=createServer(),http=require('node:http');
 const server=http.createServer((req,res)=>{if(new URL(req.url,'http://localhost').pathname.endsWith('/layout/presentation-layout.json')){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(config);}else published.emit('request',req,res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/presentation-demo/';
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'traffic-guide-pdf-'));
 const browser=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 const exited=new Promise(resolve=>browser.once('exit',resolve));let cdp;
 try{
  const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<200&&!fs.existsSync(portFile);i++){if(browser.exitCode!==null)throw new Error('Browser exited before starting');await delay(100);}if(!fs.existsSync(portFile))throw new Error('Browser startup timed out');
  const port=fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0],targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();cdp=new CDP(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
  const errors=[];cdp.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails.exception?.description||event.exceptionDetails.text));
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1018,deviceScaleFactor:1,mobile:false});
  await cdp.send('Emulation.setEmulatedMedia',{media:'screen',features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await cdp.send('Page.navigate',{url:base+'#context'});
  let loaded=false;for(let i=0;i<400;i++){if(await cdp.evaluate('Boolean(window.generalRoadPresentation&&window.visualLayoutEditor?.store&&document.querySelector("main>.slide"))').catch(()=>false)){loaded=true;break;}await delay(100);}if(!loaded)throw new Error('Presentation did not load');
  await cdp.evaluate('(()=>{const style=document.createElement("style");style.id="pdf-sample-styles";style.textContent='+JSON.stringify(fs.readFileSync(path.join(__dirname,'pdf-sample.css'),'utf8'))+';document.head.append(style);const label=document.createElement("span");label.className="pdf-section-label";label.textContent="一般道路情境 / G1-01";document.querySelector(".header").append(label);const footer=document.createElement("div");footer.className="pdf-footer";document.body.append(footer);})()');
  const manifest={scenario:'G1-01 無號誌市區正交三岔路口',paper:'A4 landscape',configSha256:fingerprint,generatedAt:new Date().toISOString(),sheets:[]};
  for(let i=0;i<sheets.length;i++){
   const sheet=sheets[i];await cdp.evaluate('window.generalRoadPresentation.goPage('+JSON.stringify(sheet.id)+','+sheet.phase+')');
   await cdp.evaluate('(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll("main img,main svg image")].map(node=>{const src=node.currentSrc||node.src||node.getAttribute("href");if(!src)return;const img=new Image();img.src=src;return img.decode();}));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()');
   await delay(140);
   const metadata=await cdp.evaluate('(()=>{document.querySelector(".pdf-footer").innerHTML="<span>G1-01 無號誌市區正交三岔路口 · '+sheet.title+'</span><span>'+String(i+1).padStart(2,'0')+' / '+sheets.length+'</span>";const slide=document.querySelector("main>.slide"),root=document.getElementById("presentation").getBoundingClientRect();const clipped=[...slide.querySelectorAll(".explanation,.conditions-issues,.context-grid,.context-note,.road-facts,.map-card,.condition-issue,.explain-points li")].filter(n=>n.getClientRects().length).map(n=>({node:n.className,bottom:n.getBoundingClientRect().bottom,scroll:n.scrollHeight,height:n.clientHeight})).filter(n=>n.bottom>root.bottom+2||n.scroll>n.height+3);return {id:window.generalRoadPresentation.page.id,title:slide.querySelector("h1")?.textContent,text:slide.innerText,clipped};})()');
   if(metadata.id!==sheet.id)throw new Error('Wrong page selected: '+sheet.id);
   if(metadata.clipped.length)throw new Error('Content would be clipped on '+sheet.id+': '+JSON.stringify(metadata.clipped));
   const filename=String(i+1).padStart(2,'0')+'-'+sheet.id;
   const screenshot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,filename+'.png'),Buffer.from(screenshot.data,'base64'));
   const pdf=await cdp.send('Page.printToPDF',{landscape:false,printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0,paperWidth:15,paperHeight:1018/96,scale:1,generateTaggedPDF:true});fs.writeFileSync(path.join(output,filename+'.pdf'),Buffer.from(pdf.data,'base64'));
   manifest.sheets.push({...sheet,file:filename+'.pdf',image:filename+'.png',titleInPresentation:metadata.title});console.log('Exported '+(i+1)+' / '+sheets.length+': '+sheet.id);
  }
  if(errors.length)throw new Error(errors.join('\n'));
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log('PDF sheets: '+output);
  console.log(fs.readFileSync(configPath).equals(config)?'Saved presentation JSON is unchanged.':'Saved JSON changed outside the export; sheets use the revision recorded in manifest.json.');
 }finally{if(cdp)await cdp.send('Browser.close').catch(()=>{});cdp?.close();if(browser.exitCode===null)browser.kill();await Promise.race([exited,delay(1500)]);await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
