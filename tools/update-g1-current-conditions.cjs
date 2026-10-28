'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),content=path.join(root,'content/04-general-scenarios'),source=path.join(root,'src/general-scenarios');
const target=path.join(root,'index.html'),original=fs.readFileSync(target,'utf8');
const dataPattern=/<script id="presentation-data" type="application\/json">([\s\S]*?)<\/script>/;
const statePattern=/<script id="editor-saved-data"[^>]*>([\s\S]*?)<\/script>/;
const data=JSON.parse(original.match(dataPattern)[1]),saved=original.match(statePattern)[1];
const config=JSON.parse(fs.readFileSync(path.join(content,'g1-current-conditions.json'),'utf8'));
const inventory=JSON.parse(fs.readFileSync(path.join(content,'g1-conditions-inventory.json'),'utf8'));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const assets=[];
for(const asset of config.assets){
  const filename=path.join(root,'materials/04-一般道路情境/current-conditions',asset.file),bytes=fs.readFileSync(filename);
  const item=inventory.media.find(media=>media.path===path.relative(root,filename).split(path.sep).join('/'));
  assert(item&&item.sha256===digest(bytes),'Source asset changed: '+asset.key);
  assert.deepEqual(item.dimensions,{width:asset.width,height:asset.height});
  const slide=inventory.slides.find(slide=>slide.number===asset.slide);assert(slide.pictures.some(picture=>picture.zipPath===item.zipPath),'Wrong slide: '+asset.key);
  data.embeddedAssets[asset.key]={url:'data:image/'+(/\.jpe?g$/i.test(asset.file)?'jpeg':'png')+';base64,'+bytes.toString('base64'),width:asset.width,height:asset.height};
  data.assetMeta[asset.key]={scenario:asset.scenario,rotation:asset.rotation,label:asset.label,sourceFile:path.basename(asset.file),sourcePresentation:config.source,sourceSlide:asset.slide};
  data.assets[asset.key]=asset.label;
  assets.push({key:asset.key,file:path.relative(root,filename).split(path.sep).join('/'),slide:asset.slide,width:asset.width,height:asset.height,rotation:asset.rotation,sha256:item.sha256});
}
for(const scene of data.scenarios){
  assert(config.scenarios[scene.id]);scene.currentConditions=config.scenarios[scene.id];
  scene.source.note=scene.source.note.replace('現況圖與現況問題照片尚待提供。','現況圖與問題照片已補入，來源為 G1.pptx。');
}
const used=new Set(data.scenarios.flatMap(scene=>[scene.currentConditions.before,scene.currentConditions.after,...scene.currentConditions.photos.map(photo=>photo.image)]));
for(const [key,asset]of Object.entries(data.embeddedAssets))if(asset.sourceAsset&&!used.has(key)){
  delete data.embeddedAssets[key];delete data.assetMeta[key];delete data.assets[key];
}
const prior=data.currentConditionsSource;
data.currentConditionsSource={file:config.source,sha256:inventory.source_sha256,includedSlides:config.includedSlides,excludedSlides:config.excludedSlides,skippedSlides:config.skippedSlides,exclusionReason:config.exclusionReason,scenarioSlides:config.scenarioSlides,previousSources:prior?.file!==config.source?[...(prior?.previousSources||[]),...(prior?[prior]:[])]:prior.previousSources||[]};
let html=original.replace(dataPattern,()=>'<script id="presentation-data" type="application/json">'+JSON.stringify(data).replace(/</g,'\\u003c')+'</script>');
for(const [id,file]of [['general-scenario-structure','scenarios.js'],['general-current-conditions','current-conditions.js'],['general-editor','editor.js']]){
  let script=fs.readFileSync(path.join(source,file),'utf8');
  if(file==='editor.js')script=script.replaceAll('一般道路情境-可編輯.html','一般道路情境-圖面放大版-可編輯.html');
  new vm.Script(script,{filename:file});
  const pattern=new RegExp('(<script id="'+id+'">)[\\s\\S]*?(</script>)');assert(pattern.test(html));
  html=html.replace(pattern,(_,open,close)=>open+'\n'+script.trimEnd()+'\n'+close);
}
html=html.replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="一般道路情境互動簡報：四個情境、現況問題照片、可拖曳現況與改善對照，以及條文放大解說與編輯功能。">');
assert.equal(html.match(statePattern)[1],saved,'Existing saved edits changed');
assert.equal(Object.keys(data.embeddedAssets).length,28);assert.equal(data.scenarios.filter(scene=>scene.currentConditions).length,4);
for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!script[1].includes('application/json'))new vm.Script(script[2]);
const backup=path.join(root,'backups','index-before-G1-current-conditions-'+new Date().toISOString().replace(/[:.]/g,'-')+'.html');
fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,original,'utf8');fs.writeFileSync(target,html,'utf8');
for(const id of ['g1-03','g1-04']){
  const filename=path.join(content,id+'.json'),scene=JSON.parse(fs.readFileSync(filename,'utf8'));
  scene.source.note=scene.source.note.replace('現況圖與現況問題照片尚待提供。','現況圖與問題照片已補入，來源為 G1.pptx。');
  fs.writeFileSync(filename,JSON.stringify(scene,null,2)+'\n','utf8');
}
fs.writeFileSync(path.join(content,'g1-current-conditions-manifest.json'),JSON.stringify({source:config.source,sha256:inventory.source_sha256,assets,scenarioSlides:config.scenarioSlides,backup:path.relative(root,backup).split(path.sep).join('/')},null,2)+'\n','utf8');
console.log('Updated index.html: 4 current-condition pages, 4 diagrams, 5 on-site photos; 50 pages, 28 embedded assets; saved edits preserved.');
console.log('Backup: '+path.relative(root,backup));
