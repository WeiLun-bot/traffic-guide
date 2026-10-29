'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../_site'),port=Number(process.env.PORT||4173),prefix='/presentation-demo/';
const projectConfig=path.resolve(__dirname,'../layout/presentation-layout.json');
function createServer(directory=root,options={}) {
directory=path.resolve(directory);
// The preview stays live after the browser writes the source JSON. Published
// hosts still use the copy in _site; only this local server reads the source.
const configFile=options.configFile===undefined?(directory===root?projectConfig:null):options.configFile;
if(!fs.existsSync(path.join(directory,'index.html')))throw new Error('Run node tools/prepare-github-pages.cjs first.');
return http.createServer((request,response)=>{
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
  let pathname;
  try{pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}catch{response.writeHead(400);response.end();return;}
  if(pathname==='/presentation-demo'){response.writeHead(302,{Location:prefix});response.end();return;}
  const relative=pathname.startsWith(prefix)?pathname.slice(prefix.length):pathname.replace(/^\//,'');
  const filename=relative||'index.html';
  let file=path.resolve(directory,filename);
  const within=path.relative(directory,file);
  if(within==='..'||within.startsWith('..'+path.sep)||path.isAbsolute(within)||filename.includes('\\')||filename.split('/').some(part=>part.startsWith('.'))){response.writeHead(404);response.end();return;}
  if(filename==='layout/presentation-layout.json'&&configFile)file=configFile;
  if(!fs.existsSync(file)||!fs.lstatSync(file).isFile()){response.writeHead(404);response.end();return;}
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'};
  response.writeHead(200,{'Content-Type':(mime[path.extname(filename)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  if(request.method==='HEAD')response.end();else fs.createReadStream(file).pipe(response);
});
}
module.exports={createServer};
if(require.main===module){const server=createServer();server.listen(port,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:'+server.address().port+prefix+' (also available at /)'));}
