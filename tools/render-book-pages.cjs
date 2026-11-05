'use strict';
// Rasterize only the configured PDF pages; use local Poppler and Edge/Chrome.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const write=require('./write-verified-file.cjs'),root=path.resolve(__dirname,'..');
const args=process.argv.slice(2),pdf=path.resolve(args[0]||'');
const configPath=path.resolve(args.find(arg=>arg.startsWith('--config='))?.slice(9)||path.join(root,'road_book_3d/navigation-config.json'));
const dpi=Number(args.find(arg=>arg.startsWith('--dpi='))?.slice(6)||200),quality=.92;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function executable(name){const candidates=[process.env[name.toUpperCase()],path.join(process.env.LOCALAPPDATA||'','Programs/MiKTeX/miktex/bin/x64',name+'.exe')].filter(Boolean);return candidates.find(file=>fs.existsSync(file))||name;}
function run(file,params){return new Promise((resolve,reject)=>{const child=spawn(file,params,{windowsHide:true}),out=[],err=[];child.stdout.on('data',bytes=>out.push(bytes));child.stderr.on('data',bytes=>err.push(bytes));child.on('error',reject);child.on('exit',code=>code===0?resolve(Buffer.concat(out).toString('utf8')):reject(new Error(file+' exited '+code+': '+Buffer.concat(err).toString('utf8').slice(0,1200))));});}
function save(file,bytes){for(let attempt=0;;attempt++)try{write(file,bytes,path.relative(root,file));return;}catch(error){if(error.code!=='UNKNOWN'||attempt>=4)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,[100,250,500,1000][attempt]);}}
class CDP{
  constructor(url){this.seq=0;this.pending=new Map();this.socket=new WebSocket(url);this.ready=new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve);this.socket.addEventListener('error',reject);});this.socket.addEventListener('message',event=>{const value=JSON.parse(event.data),entry=this.pending.get(value.id);if(!entry)return;clearTimeout(entry.timer);this.pending.delete(value.id);value.error?entry.reject(new Error(JSON.stringify(value.error))):entry.resolve(value.result);});}
  async send(method,params={}){await this.ready;const id=++this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Browser timeout: '+method));},45000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
  async evaluate(expression){const value=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(value.exceptionDetails)throw new Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;}
}
async function main(){
  if(!args[0]||!fs.statSync(pdf).isFile()||!Number.isFinite(dpi)||dpi<120||dpi>300)throw new Error('Usage: node tools/render-book-pages.cjs <PDF> [--config=JSON] [--dpi=200]');
  const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
  const info=await run(executable('pdfinfo'),['-enc','UTF-8',pdf]),pageCount=Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
  if(pageCount!==config.source_pages)throw new Error('PDF page count differs from the navigation configuration');
  const selected=[...new Set([1,...config.spreads.flatMap(spread=>[spread.left,spread.right])])].sort((a,b)=>a-b);
  for(const page of selected)if(!Number.isSafeInteger(page)||page<1||page>pageCount)throw new Error('Invalid selected page: '+page);
  const outputParent=path.join(root,'exports/book-page-renders');fs.mkdirSync(outputParent,{recursive:true});
  const output=fs.mkdtempSync(path.join(outputParent,path.basename(pdf,'.pdf')+'-'));
  const backup=path.join(output,'previous');fs.mkdirSync(backup);
  for(const file of ['index.html','navigation-config.json',...selected.map(page=>'pages/p'+page+'.webp')]){
    const source=path.join(root,'road_book_3d',file);if(!fs.existsSync(source))continue;const target=path.join(backup,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
  }
  console.log('Rendering '+selected.length+' selected pages at '+dpi+' DPI. Backup: '+path.relative(root,backup));
  let next=0,completed=0;
  await Promise.all([0,1].map(async()=>{while(next<selected.length){const page=selected[next++];await run(executable('pdftoppm'),['-f',String(page),'-l',String(page),'-r',String(dpi),'-png','-singlefile',pdf,path.join(output,'p'+page)]);console.log('Rendered PDF '+page+' ('+(++completed)+'/'+selected.length+')');}}));
  const server=http.createServer((request,response)=>{const name=new URL(request.url,'http://localhost').pathname.slice(1);if(!name){response.writeHead(200,{'Content-Type':'text/html'});response.end('<!doctype html><html><body></body></html>');return;}if(!/^p\d+\.png$/.test(name)||!fs.existsSync(path.join(output,name))){response.writeHead(404);response.end();return;}response.writeHead(200,{'Content-Type':'image/png'});fs.createReadStream(path.join(output,name)).pipe(response);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browserFile=process.env.VISUAL_EDITOR_BROWSER||['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(file=>fs.existsSync(file));
  if(!browserFile){server.close();throw new Error('Edge or Chrome is required for WebP encoding');}
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'traffic-guide-book-render-'));
  const browser=spawn(browserFile,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  const exited=new Promise(resolve=>browser.once('exit',resolve));let cdp;
  const manifest={sourcePdf:path.basename(pdf),sourcePages:pageCount,pdfPages:selected,dpi,quality,pages:[]};
  try{
    const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<200&&!fs.existsSync(active);i++){if(browser.exitCode!==null)throw new Error('Browser exited during startup');await pause(100);}if(!fs.existsSync(active))throw new Error('Browser did not start');
    const port=fs.readFileSync(active,'utf8').split(/\r?\n/)[0],targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();cdp=new CDP(targets.find(target=>target.type==='page').webSocketDebuggerUrl);await cdp.send('Page.enable');await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
    await cdp.evaluate('new Promise(resolve=>document.readyState==="complete"?resolve():addEventListener("load",resolve,{once:true}))');
    for(const page of selected){
      const result=await cdp.evaluate('(async()=>{const image=new Image();image.src="/p'+page+'.png";await image.decode();const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext("2d").drawImage(image,0,0);return {width:canvas.width,height:canvas.height,data:canvas.toDataURL("image/webp",'+quality+')}})()');
      if(!result.data.startsWith('data:image/webp;base64,'))throw new Error('WebP encoding failed');const bytes=Buffer.from(result.data.split(',')[1],'base64'),file='road_book_3d/pages/p'+page+'.webp';save(path.join(root,file),bytes);manifest.pages.push({pdfPage:page,file,width:result.width,height:result.height,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});console.log('Saved '+file+' ('+Math.round(bytes.length/1024)+' KB)');
    }
    const contact=await cdp.evaluate('(async()=>{const pages='+JSON.stringify(selected)+',canvas=document.createElement("canvas"),width=220,height=312,rows=Math.ceil(pages.length/5);canvas.width=5*(width+12)+12;canvas.height=rows*(height+35)+12;const ctx=canvas.getContext("2d");ctx.fillStyle="#e7ede3";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font="16px sans-serif";for(let i=0;i<pages.length;i++){const image=new Image();image.src="/p"+pages[i]+".png";await image.decode();const x=12+(i%5)*(width+12),y=12+Math.floor(i/5)*(height+35);ctx.drawImage(image,x,y,width,height);ctx.fillStyle="#233e36";ctx.fillText("PDF "+pages[i],x,y+height+22);}return canvas.toDataURL("image/png")})()');save(path.join(output,'contact-sheet.png'),Buffer.from(contact.split(',')[1],'base64'));
    const hash=crypto.createHash('sha256');for await(const bytes of fs.createReadStream(pdf))hash.update(bytes);manifest.sourceSha256=hash.digest('hex');save(path.join(output,'manifest.json'),Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
    console.log('Manifest: '+path.relative(root,path.join(output,'manifest.json')));
    console.log('Total WebP: '+(manifest.pages.reduce((sum,page)=>sum+page.bytes,0)/1024/1024).toFixed(2)+' MB');
  }finally{cdp?.socket.close();if(browser.exitCode===null)browser.kill();await Promise.race([exited,pause(3000)]);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
