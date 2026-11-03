'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'index.html');
const html=fs.readFileSync(entry,'utf8'),data=require('./presentation-source.cjs').dataFromHtml(html);
const target=path.join(root,'data/scenarios/presentation.json');
if(fs.existsSync(target))throw new Error('Presentation data has already been split.');
const collections=['assets','articles','scenarios','embeddedAssets','assetMeta'];
const manifest={schemaVersion:1,keys:Object.keys(data),core:Object.fromEntries(Object.entries(data).filter(([key])=>!collections.includes(key))),caseFiles:[],assetOrder:Object.keys(data.embeddedAssets),nameOrder:Object.keys(data.assets),metaOrder:Object.keys(data.assetMeta),articleOrder:data.articles.map(a=>a.id)};
for(const scene of data.scenarios){
  const keys=Object.keys(data.assetMeta).filter(key=>data.assetMeta[key].scenario===scene.id);
  const select=source=>Object.fromEntries(keys.filter(key=>Object.hasOwn(source,key)).map(key=>[key,source[key]]));
  const doc={schemaVersion:1,scenario:scene,articles:data.articles.filter(article=>article.scenario===scene.id),embeddedAssets:select(data.embeddedAssets),assetMeta:select(data.assetMeta),assetNames:select(data.assets)};
  const file='data/scenarios/'+scene.code+'.json';assert(!fs.existsSync(path.join(root,file)),'Refusing to replace '+file);manifest.caseFiles.push(file);fs.writeFileSync(path.join(root,file),JSON.stringify(doc,null,2)+'\n');
}
fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n');
const catalogPath=path.join(root,'data/scenarios/catalog.json'),catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));catalog.baseDetails=manifest.caseFiles;fs.writeFileSync(catalogPath,JSON.stringify(catalog,null,2)+'\n');
const next=html.replace(/<script id="presentation-data" type="application\/json">[\s\S]*?<\/script>/,'<script id="presentation-data" type="application/json" data-source="data/scenarios/presentation.json"></script>');
fs.writeFileSync(entry,next);
console.log(JSON.stringify({caseFiles:manifest.caseFiles,htmlBytes:Buffer.byteLength(next)}));
