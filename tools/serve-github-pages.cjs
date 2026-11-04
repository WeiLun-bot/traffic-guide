'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Project=require('./presentation-project-store.cjs');
const root=path.resolve(__dirname,'../_site'),port=Number(process.env.PORT||4173),prefix='/presentation-demo/';
const projectConfig=path.resolve(__dirname,'../layout/presentation-layout.json');
function createServer(directory=root,options={}) {
directory=path.resolve(directory);
// The preview stays live after the browser writes the source JSON. Published
// hosts still use the copy in _site; only this local server reads the source.
const configFile=options.configFile===undefined?(directory===root?projectConfig:null):options.configFile;
const sourceRoot=options.projectRoot===undefined?(directory===root&&options.configFile===undefined?path.resolve(__dirname,'..'):null):options.projectRoot;
const token=crypto.randomBytes(32).toString('hex');
if(!fs.existsSync(path.join(directory,'index.html')))throw new Error('Run node tools/prepare-github-pages.cjs first.');
return http.createServer((request,response)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}catch{response.writeHead(400);response.end();return;}
  if(pathname==='/presentation-demo'){response.writeHead(302,{Location:prefix});response.end();return;}
  const relative=pathname.startsWith(prefix)?pathname.slice(prefix.length):pathname.replace(/^\//,'');
  const filename=relative||'index.html';
  if(filename==='__preview'&&request.method==='GET'){
    response.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});response.end(JSON.stringify({version:1,projectStorage:Boolean(sourceRoot)}));return;
  }
  if(filename==='__project'&&sourceRoot){
    const send=(status,value)=>{response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(value));};
    const host=request.headers.host||'';
    if(!/^(?:127\.0\.0\.1|localhost):\d+$/.test(host)||request.headers.origin&&request.headers.origin!=='http://'+host||request.headers['sec-fetch-site']&& !['same-origin','none'].includes(request.headers['sec-fetch-site'])){send(403,{error:'Only same-origin local project requests are allowed.'});return;}
    if(request.method==='GET'){try{const current=Project.read(sourceRoot);send(200,{token,revision:current.revision,config:current.config,owners:current.owners});}catch(error){send(500,{error:error.message});}return;}
    if(request.method!=='POST'){send(405,{error:'Method not allowed'});return;}
    if(request.headers['x-project-token']!==token||request.headers['content-type']!=='application/json'){send(403,{error:'Invalid project save request'});return;}
    let size=0,body=[],oversized=false;
    request.on('data',chunk=>{size+=chunk.length;if(size>25*1024*1024){if(!oversized)send(413,{error:'Project limit is 25 MB'});oversized=true;body=[];}else if(!oversized)body.push(chunk);});
    request.on('end',()=>{if(oversized)return;try{const value=JSON.parse(Buffer.concat(body).toString('utf8')),saved=Project.save({root:sourceRoot,config:value.config,expectedRevision:value.revision});send(200,{revision:saved.revision});}catch(error){send(error.status||400,{error:error.message});}});
    request.on('error',()=>{});return;
  }
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
  let file=path.resolve(directory,filename);
  const within=path.relative(directory,file);
  if(within==='..'||within.startsWith('..'+path.sep)||path.isAbsolute(within)||filename.includes('\\')||filename.split('/').some(part=>part.startsWith('.'))){response.writeHead(404);response.end();return;}
  if(filename==='layout/presentation-layout.json'&&configFile)file=configFile;
  if(sourceRoot&&(filename==='data/presentation-navigation.json'||filename.startsWith('data/content/')||/^materials\/edited\/[a-f0-9]{64}\.(?:png|jpeg|webp|gif|svg)$/.test(filename))){
    try{const allowed=Project.releaseFiles(sourceRoot);if(allowed.includes(filename))file=Project.resolveFile(path.resolve(sourceRoot),filename);}catch(error){response.writeHead(500);response.end('Project data could not be loaded');return;}
  }
  if(!fs.existsSync(file)||!fs.lstatSync(file).isFile()){response.writeHead(404);response.end();return;}
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml'};
  response.writeHead(200,{'Content-Type':(mime[path.extname(filename)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  if(request.method==='HEAD')response.end();else fs.createReadStream(file).pipe(response);
});
}
module.exports={createServer};
if(require.main===module){
  const parentIndex=process.argv.indexOf('--parent-pid');
  const parent=parentIndex<0?null:Number(process.argv[parentIndex+1]);
  if(parentIndex>=0&&(!Number.isSafeInteger(parent)||parent<1||parent===process.pid))throw new Error('Invalid preview parent PID');
  const server=createServer();
  let closing=false,watcher,control;
  function shutdown(reason){
    if(closing)return;
    closing=true;clearInterval(watcher);
    if(control?.listening)control.close();
    console.log('Stopping preview: '+reason);
    const deadline=setTimeout(()=>process.exit(0),2000);deadline.unref();
    server.close(()=>process.exit(0));
    server.closeAllConnections();
  }
  process.on('SIGINT',()=>shutdown('Ctrl+C'));
  process.on('SIGTERM',()=>shutdown('termination requested'));
  // Local Windows IPC lets the stop script shut down cleanly without an HTTP
  // shutdown endpoint or a PID file that could become stale.
  if(process.platform==='win32'){
    control=require('node:net').createServer(socket=>{
      let command='';socket.setEncoding('utf8');
      socket.setTimeout(1000,()=>socket.destroy());socket.on('error',()=>{});
      socket.on('data',chunk=>{
        command+=chunk;
        if(command.trim()==='stop'){socket.end();shutdown('stop-editor requested');}
        else if(command.length>16)socket.destroy();
      });
    });
    control.on('error',error=>console.error('Preview stop control unavailable: '+error.message));
    control.listen('\\\\.\\pipe\\traffic-guide-preview-'+process.pid);
  }
  if(parent)watcher=setInterval(()=>{
    try{process.kill(parent,0);}catch(error){if(error.code==='ESRCH')shutdown('launcher window closed');}
  },1000).unref();
  server.listen(port,'127.0.0.1',()=>{
    console.log('Preview: http://127.0.0.1:'+server.address().port+prefix+' (also available at /)');
    console.log('Server PID: '+process.pid+(parent?' / launcher PID: '+parent:''));
  });
}
