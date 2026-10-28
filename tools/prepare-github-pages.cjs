'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),output=path.join(root,'_site');
const files=[
  ['index.html','index.html'],
  ['index.html','一般道路情境-圖面放大版.html'],
  ['路口管制.html','路口管制.html'],
  ['.nojekyll','.nojekyll']
];
// Copy a strict allowlist: source inventories, backups and test logs stay local.
fs.mkdirSync(output,{recursive:true});
if(fs.lstatSync(output).isSymbolicLink())throw new Error('_site must be a regular directory');
const allowed=new Set(files.map(([,name])=>name));
for(const name of fs.readdirSync(output))if(!allowed.has(name))throw new Error('Unexpected file in _site: '+name+'. Move it out before preparing the release.');
const report=[];
for(const [source,name]of files){
  const input=path.join(root,source),destination=path.join(output,name);
  if(!fs.statSync(input).isFile())throw new Error('Missing presentation: '+source);
  if(fs.existsSync(destination)&&(!fs.lstatSync(destination).isFile()||fs.lstatSync(destination).isSymbolicLink()))throw new Error('Release target must be a regular file: '+name);
  const bytes=fs.readFileSync(input);fs.writeFileSync(destination,bytes);
  if(!fs.readFileSync(destination).equals(bytes))throw new Error('Copy verification failed: '+name);
  report.push({file:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
console.log(JSON.stringify({output:'_site/',entry:'index.html',files:report},null,2));
