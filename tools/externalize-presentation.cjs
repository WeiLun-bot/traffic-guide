'use strict';
// Losslessly extract the four-deck entry point; run again after a legacy import.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {dataFromHtml,inlineHtml,localPath}=require('./presentation-source.cjs');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'index.html');
const original=fs.readFileSync(entry,'utf8'),data=dataFromHtml(original),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const planned=new Map(),images=[];
const current=require('../data/results/current-conditions.json');
for(const [key,asset]of Object.entries(data.embeddedAssets)){
  if(!asset.url?.startsWith('data:'))continue;
  const bytes=Buffer.from(asset.url.slice(asset.url.indexOf(',')+1),'base64'),sha256=hash(bytes),meta=data.assetMeta[key];
  let relative;
  if(asset.url.startsWith('data:image/svg+xml;'))relative='materials/04-一般道路情境/'+meta.scenario.toUpperCase()+'/'+data.assets[key];
  else{
    const fromResults=Object.values(current.assets).find(item=>item.sha256===sha256&&item.scenario===meta.scenario.toUpperCase());
    relative=fromResults?.file||'materials/04-一般道路情境/current-conditions/G1/'+meta.sourceFile;
  }
  assert(fs.readFileSync(localPath(root,relative)).equals(bytes),'Original image bytes differ: '+key);
  asset.url=encodeURI(relative);images.push({key,file:relative,bytes:bytes.length,sha256});
}
let html=original.replace(/(<script id="presentation-data" type="application\/json">)[\s\S]*?(<\/script>)/,(_,open,close)=>open+JSON.stringify(data).replace(/</g,'\\u003c')+close);
html=html.replace(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/g,(tag,kind,attrs,body)=>{
  if(!body||/\bsrc=|application\/json/.test(attrs))return tag;
  const id=attrs.match(/\bid="([^"]+)"/)?.[1];
  // Retain the small startup guard so missing external files still show recovery.
  if(id?.startsWith('presentation-startup-'))return tag;
  const name=(id||'general-presentation').replace(/^general-/,'').replace(/-styles$/,'');
  const file='assets/general/'+(name==='general-presentation'?'presentation':name)+(kind==='script'?'.js':'.css');
  assert(!planned.has(file),'Duplicate extracted resource: '+file);planned.set(file,body);
  return kind==='script'?'<script'+(id?' id="'+id+'"':'')+' src="'+file+'" data-extracted-script></script>':'<link'+(id?' id="'+id+'"':'')+' rel="stylesheet" href="'+file+'" data-extracted-style>';
});
if(!planned.size&&!images.length){console.log('Presentation already uses external resources.');process.exit(0);}
const artifact=path.join(root,'tests/artifacts/asset-extraction');fs.mkdirSync(artifact,{recursive:true});
const config=fs.readFileSync(path.join(root,'layout/presentation-layout.json'));
fs.writeFileSync(path.join(artifact,'before.html'),original);
for(const [file,body]of planned){const target=localPath(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});if(fs.existsSync(target))assert.equal(fs.readFileSync(target,'utf8'),body,'Refusing to overwrite a different resource: '+file);else fs.writeFileSync(target,body);}
assert.equal(inlineHtml(html,root),original,'Extraction must reproduce every original byte, including image URLs, script order and styles.');
fs.writeFileSync(entry,html);
assert(fs.readFileSync(path.join(root,'layout/presentation-layout.json')).equals(config),'Saved settings must remain unchanged');
const report={beforeBytes:Buffer.byteLength(original),afterBytes:Buffer.byteLength(html),originalSha256:hash(original),reconstructedSha256:hash(inlineHtml(html,root)),settingsSha256:hash(config),resources:[...planned].map(([file,body])=>({file,bytes:Buffer.byteLength(body),sha256:hash(body)})),images};
fs.writeFileSync(path.join(artifact,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({beforeBytes:report.beforeBytes,afterBytes:report.afterBytes,extractedResources:planned.size,externalImages:images.length,byteIdenticalReconstruction:true},null,2));
