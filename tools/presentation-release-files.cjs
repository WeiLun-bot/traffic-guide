'use strict';
const fs=require('node:fs'),path=require('node:path');
const {dataFromHtml,localPath}=require('./presentation-source.cjs');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),data=dataFromHtml(html);
const files=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"[^>]*>/g)].map(match=>match[1]);
if(html.includes('data-source="data/scenarios/presentation.json"')){
  const shared=JSON.parse(fs.readFileSync(path.join(root,'data/scenarios/presentation.json'),'utf8')),registry=JSON.parse(fs.readFileSync(path.join(root,'data/presentation-registry.json'),'utf8'));
  files.push('data/scenarios/presentation.json','data/presentation-registry.json',...shared.caseFiles,...Object.values(registry.resources).map(resource=>resource.file));
}
for(const asset of Object.values(data.embeddedAssets))if(asset.url&&!asset.url.startsWith('data:'))files.push(decodeURIComponent(asset.url));
for(const file of files){if(!/^(?:assets|materials|data)\//.test(file)||!fs.statSync(localPath(root,file)).isFile())throw new Error('Invalid presentation dependency: '+file);}
module.exports=Array.from(new Set(files));
