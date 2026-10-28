'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../_site'),port=Number(process.env.PORT||4173),prefix='/presentation-demo/';
if(!fs.existsSync(path.join(root,'index.html')))throw new Error('Run npm run pages:prepare first.');
const server=http.createServer((request,response)=>{
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
  let pathname;
  try{pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}catch{response.writeHead(400);response.end();return;}
  if(pathname==='/presentation-demo'){response.writeHead(302,{Location:prefix});response.end();return;}
  const relative=pathname.startsWith(prefix)?pathname.slice(prefix.length):pathname.replace(/^\//,'');
  const filename=relative||'index.html';
  // Pages serves only the files packaged into _site; reject nested/traversal paths.
  if(path.basename(filename)!==filename||filename.includes('\\')||filename.startsWith('.')){response.writeHead(404);response.end();return;}
  const file=path.join(root,filename);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return;}
  response.writeHead(200,{'Content-Type':filename.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream','Cache-Control':'no-store'});
  if(request.method==='HEAD')response.end();else fs.createReadStream(file).pipe(response);
});
server.listen(port,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:'+server.address().port+prefix+' (also available at /)'));
