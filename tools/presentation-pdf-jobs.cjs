'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),Project=require('./presentation-project-store.cjs');
function createJobs(root,{launch}={}){
 const jobs=new Map();
 const publicJob=job=>({id:job.id,state:job.state,pages:job.pages,total:job.total,error:job.error,download:job.state==='complete'?'__pdf/'+job.id+'/file':null});
 function start(revision){
  const snapshot=Project.read(root);if(snapshot.revision!==revision){const error=new Error('專案已更新，請重新載入已儲存版本後再匯出。');error.status=409;throw error;}
  if([...jobs.values()].some(job=>job.state==='running')){const error=new Error('已有一份 PDF 正在匯出，請等候完成。');error.status=409;throw error;}
  const id=crypto.randomBytes(12).toString('hex'),directory=path.join(root,'exports','PDF-General',id);
  fs.mkdirSync(directory,{recursive:true});const snapshotFile=path.join(directory,'project-snapshot.json');fs.writeFileSync(snapshotFile,JSON.stringify(snapshot.config));
  const job={id,state:'running',pages:0,total:0,directory,error:null};jobs.set(id,job);
  const child=launch?launch(directory,snapshotFile):spawn(process.execPath,[path.join(__dirname,'export-general-pdf.cjs')],{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',TRAFFIC_GUIDE_PDF_OUTPUT:directory,TRAFFIC_GUIDE_PDF_SNAPSHOT:snapshotFile},windowsHide:true,stdio:['ignore','pipe','pipe']});
  const log=fs.createWriteStream(path.join(directory,'export.log'));let text='';
  child.stdout.on('data',chunk=>{log.write(chunk);text=(text+chunk.toString()).slice(-4000);const matches=[...text.matchAll(/Exported GENERAL (\d+) \/ (\d+)/g)],last=matches.at(-1);if(last){job.pages=Number(last[1]);job.total=Number(last[2]);}});
  child.stderr.on('data',chunk=>log.write(chunk));
  child.on('error',error=>{job.state='failed';job.error='無法啟動 PDF 匯出，請確認本機 Chrome／Edge 與 Python。';log.end(String(error));});
  child.on('close',code=>{if(job.state==='failed')return;job.state=code===0&&fs.existsSync(path.join(directory,'general-road-scenarios.pdf'))?'complete':'failed';if(job.state==='failed')job.error='PDF 匯出失敗，請查看 exports/PDF-General 下的匯出紀錄。';log.end();});
  return publicJob(job);
 }
 function handle(request,response,filename,token){
  if(!/^__pdf(?:\/|$)/.test(filename))return false;
  const send=(code,value)=>{response.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});response.end(JSON.stringify(value));};
  const host=request.headers.host||'';
  if(!/^(?:127\.0\.0\.1|localhost):\d+$/.test(host)||request.headers.origin&&request.headers.origin!=='http://'+host||request.headers['sec-fetch-site']&&!['same-origin','none'].includes(request.headers['sec-fetch-site'])){send(403,{error:'Only same-origin project requests are allowed.'});return true;}
  if(filename==='__pdf'&&request.method==='POST'){
   if(request.headers['x-project-token']!==token||request.headers['content-type']!=='application/json'){send(403,{error:'Invalid project token'});return true;}
   let body='',large=false;request.on('data',chunk=>{if(large)return;body+=chunk;if(body.length>2000){large=true;send(413,{error:'Request too large'});}});request.on('error',()=>{});
   request.on('end',()=>{if(large)return;try{const value=JSON.parse(body);if(value.deck!=='general')throw new Error('目前僅支援一般道路情境。');send(202,start(value.revision));}catch(error){send(error.status||400,{error:error.message});}});return true;
  }
  const match=filename.match(/^__pdf\/([a-f0-9]{24})(\/file)?$/),job=match&&jobs.get(match[1]);
  if(request.method!=='GET'){send(405,{error:'Method not allowed'});return true;}
  if(!job){send(404,{error:'找不到匯出工作'});return true;}
  if(!match[2]){send(200,publicJob(job));return true;}
  if(job.state!=='complete'){send(409,{error:'PDF 尚未完成'});return true;}
  response.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':"attachment; filename=general-road-scenarios.pdf; filename*=UTF-8''%E4%B8%80%E8%88%AC%E9%81%93%E8%B7%AF%E6%83%85%E5%A2%83.pdf",'Cache-Control':'no-store'});fs.createReadStream(path.join(job.directory,'general-road-scenarios.pdf')).pipe(response);return true;
 }
 return {handle,start,jobs};
}
module.exports={createJobs};
