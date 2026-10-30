'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chapter}=require('./typst-module-source.cjs'),Modules=require('../assets/presentation-modules.js');
const root=path.resolve(__dirname,'..'),sourceDirectory=process.argv[2],write=process.argv.includes('--write');
if(!sourceDirectory)throw new Error('Usage: node tools/complete-module-presentations.cjs <Typst chapter directory> [--write]');
const sourceFiles=['05-roundabout-control.typ','06-signalized-control.typ','07-intersection-movement-control.typ','08-pedestrian.typ','09-bicycle.typ','10-motorcycle.typ','11-bus.typ','12-hazard-warning.typ','13-access-restriction.typ','14-roadway-behavior-control.typ','15-area-control.typ'];
const chapters=sourceFiles.map(file=>chapter(path.join(sourceDirectory,file),root)),catalogPath=path.join(root,'data/modules/catalog.json'),catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));
const artifact=path.join(root,'tests/artifacts/module-completion');fs.mkdirSync(artifact,{recursive:true});
const initialFiles=['layout/presentation-layout.json',...catalog.modules.filter(entry=>entry.ready).map(entry=>'data/modules/'+entry.id+'.json')];
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
if(!fs.existsSync(path.join(artifact,'before.json')))fs.writeFileSync(path.join(artifact,'before.json'),JSON.stringify(Object.fromEntries(initialFiles.map(file=>[file,digest(file)])),null,2));
fs.writeFileSync(path.join(artifact,'source-inventory.json'),JSON.stringify(chapters,null,2));
const credit='道路交通標誌標線號誌設置參考指引';
function make(id){
  const source=chapters.find(item=>item.id===id),entry=catalog.modules.find(item=>item.id===id);if(!source||!entry)throw new Error('Unknown module '+id);
  const assets=Object.fromEntries(source.images.map(image=>{
    const key=id.toLowerCase().replace('-','')+'-'+crypto.createHash('sha256').update(image.name).digest('hex').slice(0,10);
    const label=image.name.replace(/\.[^.]+$/,'').replace(/^M\d-\d{2}_/,'').replace(/「[^」]*」/g,'');
    return [key,{file:image.file,width:image.width,height:image.height,label,caption:label,credit,...(image.rotation?{rotation:image.rotation}:{})}];
  }));
  const doc={schemaVersion:1,id,title:entry.name,source:{file:source.file,section:id+'「'+entry.name+'」',sha256:source.sha256,imageFiles:source.images.map(image=>image.file),notes:[]},assets,pages:[],referenceNames:Object.fromEntries(source.submodules.flatMap(sub=>sub.references.map(ref=>[ref.number,ref.name]))),submoduleFlows:[]};
  const image=(part,label,sourceCredit)=>{const matches=Object.keys(assets).filter(key=>assets[key].file.endsWith('/'+part)||path.basename(assets[key].file).includes(part));if(matches.length!==1)throw new Error(id+' ambiguous image '+part+': '+matches.length);const key=matches[0];if(label)assets[key].label=assets[key].caption=label;if(sourceCredit)assets[key].credit=sourceCredit;return key;};
  const page=(id,sub,title,intro,figures,points,references=[])=>{const item={id,section:'module',...(sub?{submoduleId:sub}:{}),title,intro,assets:figures,points:points.map(([id,title,text])=>({id,title,text})),sourcePages:[],references};doc.pages.push(item);return item;};
  function topic(id,label,sourcePageId,pointIds,figures){return {id,label,sourcePageId,...(pointIds?{pointIds}:{}),...(figures?{assets:figures}:{})};}
  function flow(subId,slug,figures,issuePoints,diagramTopics,extensionTopics,intro){
    const sub=source.submodules.find(sub=>sub.id===subId),prefix=id.toLowerCase().replace('-','')+'-'+slug,issues=prefix+'-issues',diagram=prefix+'-diagram',extensions=prefix+'-extensions';
    const names=new Set(sub.references.map(ref=>ref.number));
    const issue=page(issues,subId,sub.name+'｜現況議題與相關條文',intro,figures,issuePoints,[...names]);if(sub.applications.length)issue.applications=sub.applications;
    const diPoints=diagramTopics.flatMap(value=>value.points),diAssets=[...new Set([...figures,...diagramTopics.flatMap(value=>value.images||[])])];
    page(diagram,subId,sub.name+'｜圖例說明','對照圖例，逐項檢視設施位置與配置方式。',diAssets,diPoints,[...names]);
    const ext=[];extensionTopics.forEach((value,index)=>{const pageId=index===0?extensions:prefix+'-extension-'+value.id;page(pageId,subId,value.title||value.label,value.intro||intro,value.images||[],value.points,[...names]);ext.push(topic(value.id,value.label,pageId));});
    doc.submoduleFlows.push({submoduleId:subId,stages:[{id:'issues',pageId:issues,title:'現況議題與相關條文'},{id:'diagram',pageId:diagram,title:'圖例說明',topics:diagramTopics.map(value=>topic(value.id,value.label,diagram,value.points.map(p=>p[0]),value.images||figures))},{id:'extensions',pageId:extensions,title:'延伸應用',intro:extensionTopics.intro||'依道路條件，檢視設施搭配與延伸運用。',topics:ext}]});
    return {issues,diagram,extensions};
  }
  function referral(subId,slug,description,links){const sub=source.submodules.find(sub=>sub.id===subId),id=doc.id.toLowerCase().replace('-','')+'-'+slug+'-reference';const item=page(id,subId,sub.name,description,[],[['reference','相關配置說明',description]]);item.links=links;return id;}
  function overview(figures,description,points){if(points.length!==entry.submodules.length)throw new Error('Overview must describe each child: '+doc.id);const item={id:doc.id.toLowerCase().replace('-','')+'-overview',section:'overview',title:doc.id+' '+entry.name,intro:description,assets:figures,points:points.map(([id,title,text],index)=>({id,title:entry.submodules[index].id+' '+title,text,submoduleId:entry.submodules[index].id})),sourcePages:[],references:[]};doc.pages.unshift(item);}
  return {doc,source,image,page,flow,referral,overview};
}
const definitions=require('./remaining-module-content.cjs'),docs=definitions(make);
const audit=[];
for(const doc of docs){
  Modules.validateModule(doc,catalog);
  const used=new Set(doc.pages.flatMap(page=>page.assets));
  for(const key of Object.keys(doc.assets))if(!used.has(key))throw new Error('Active Typst image omitted from slides: '+doc.assets[key].file);
  const active=new Set(Object.values(doc.assets).map(asset=>path.basename(asset.file)));
  const ignored=fs.readdirSync(path.join(root,'materials/03-modules',doc.id)).filter(name=>!active.has(name));
  audit.push({id:doc.id,submodules:doc.submoduleFlows.length,referrals:doc.pages.filter(page=>page.links).length,pages:doc.pages.filter(page=>!doc.submoduleFlows.some(flow=>flow.submoduleId===page.submoduleId)||doc.submoduleFlows.some(flow=>flow.stages.some(stage=>stage.pageId===page.id))).length,images:active.size,ignored});
  if(write){fs.writeFileSync(path.join(root,'data/modules',doc.id+'.json'),JSON.stringify(doc,null,2)+'\n');catalog.modules.find(entry=>entry.id===doc.id).ready=true;}
}
if(write)fs.writeFileSync(catalogPath,JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync(path.join(artifact,'import-audit.json'),JSON.stringify(audit,null,2));
console.log(JSON.stringify(audit.map(({ignored,...item})=>({...item,ignored:ignored.length})),null,2));
