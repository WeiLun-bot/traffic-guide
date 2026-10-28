'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=path.join(root,'src','general-scenarios');
const target=path.join(root,'一般道路情境-圖面放大版.html'),original=path.join(root,'一般道路情境-demo.html');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const originalHash=sha(fs.readFileSync(original)),bytes=fs.readFileSync(target);
const pagesEntry=path.join(root,'index.html');
const syncPagesEntry=fs.existsSync(pagesEntry)&&fs.readFileSync(pagesEntry).equals(bytes);
let html=bytes.toString('utf8');
const config=JSON.parse(fs.readFileSync(path.join(root,'content/04-general-scenarios/current-conditions.json'),'utf8'));
const inventory=JSON.parse(fs.readFileSync(path.join(root,'content/04-general-scenarios/current-conditions-inventory.json'),'utf8'));
const match=html.match(/<script id="presentation-data" type="application\/json">([\s\S]*?)<\/script>/);
if(!match)throw new Error('Presentation data missing');
const data=JSON.parse(match[1]);
let backupPath='';
if(!data.currentConditionsSource) {
  const timestamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(/[-:]/g,'').replace(' ','-');
  backupPath=path.join(root,'backups','一般道路情境-圖面放大版-加入現況前-'+timestamp+'.html');
  fs.writeFileSync(backupPath,bytes,{flag:'wx'});
  if(sha(fs.readFileSync(backupPath))!==sha(bytes))throw new Error('Backup hash mismatch');
}
for(const asset of config.assets) {
  const file=path.join(root,'materials/04-一般道路情境/current-conditions',asset.file),assetBytes=fs.readFileSync(file);
  const sourceAsset=inventory.media.find(item=>path.basename(item.path)===asset.file);
  if(!sourceAsset||sourceAsset.sha256!==sha(assetBytes))throw new Error('Source bytes changed: '+asset.file);
  data.embeddedAssets[asset.key]={url:'data:image/'+(asset.file.endsWith('.jpeg')?'jpeg':'png')+';base64,'+assetBytes.toString('base64'),width:asset.width,height:asset.height};
  data.assetMeta[asset.key]={scenario:asset.scenario,rotation:asset.rotation,label:asset.label,sourceFile:asset.file};
  data.assets[asset.key]=asset.label;
}
for(const scene of data.scenarios)scene.currentConditions=config.scenarios[scene.id];
for(const asset of config.aliases||[]) {
  const origin=data.embeddedAssets[asset.sourceAsset];
  data.embeddedAssets[asset.key]={sourceAsset:asset.sourceAsset,width:origin.width,height:origin.height};
  data.assetMeta[asset.key]={...data.assetMeta[asset.sourceAsset],label:asset.label};
  data.assets[asset.key]=asset.label;
}
data.currentConditionsSource={file:config.source,sha256:inventory.source_sha256,includedSlides:config.includedSlides,excludedSlides:config.excludedSlides,exclusionReason:config.exclusionReason};
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c');
html=html.replace(match[0],()=>'<script id="presentation-data" type="application/json">'+json(data)+'</script>');
function replaceScript(id,file) {
  let script=fs.readFileSync(path.join(source,file),'utf8');
  if(file==='editor.js')script=script.replaceAll('一般道路情境-可編輯.html','一般道路情境-圖面放大版-可編輯.html');
  new vm.Script(script,{filename:file});
  const pattern=new RegExp('<script id="'+id+'">[\\s\\S]*?<\\/script>');
  if(!pattern.test(html))throw new Error('Missing script '+id);
  html=html.replace(pattern,()=>'<script id="'+id+'">'+script+'</script>');
}
replaceScript('general-scenario-structure','scenarios.js');
replaceScript('general-editor','editor.js');
let runtime=fs.readFileSync(path.join(source,'presentation.js'),'utf8');
runtime=runtime.replace('｜一般道路情境簡報`','｜一般道路情境簡報（圖面放大版）`');new vm.Script(runtime);
let runtimeCount=0;
html=html.replace(/<script>([\s\S]*?)<\/script>/g,(full,script)=>{
  if(!script.includes('window.generalRoadPresentation='))return full;
  runtimeCount++;return '<script>'+runtime+'</script>';
});
if(runtimeCount!==1)throw new Error('Expected a single presentation runtime');
const script=fs.readFileSync(path.join(source,'current-conditions.js'),'utf8');new vm.Script(script);
const scriptTag='<script id="general-current-conditions">'+script+'</script>';
const scriptPattern=/<script id="general-current-conditions">[\s\S]*?<\/script>/;
html=scriptPattern.test(html)?html.replace(scriptPattern,()=>scriptTag):html.replace('<script id="general-scenario-structure">',()=>scriptTag+'\n<script id="general-scenario-structure">');
const styleTag='<style id="current-conditions-styles">'+fs.readFileSync(path.join(source,'current-conditions.css'),'utf8')+'</style>';
const stylePattern=/<style id="current-conditions-styles">[\s\S]*?<\/style>/;
html=stylePattern.test(html)?html.replace(stylePattern,()=>styleTag):html.replace('</head>',()=>styleTag+'</head>');
html=html.replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="一般道路情境互動簡報：兩個情境、現況問題照片、可拖曳現況與改善對照，以及條文放大解說。">');
fs.writeFileSync(target,html,'utf8');
if(syncPagesEntry)fs.writeFileSync(pagesEntry,html,'utf8');
if(sha(fs.readFileSync(original))!==originalHash)throw new Error('Original presentation changed');
const manifestPath=target.replace(/\.html$/,'.manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
manifest.outputSha256=sha(Buffer.from(html));
delete manifest.buildingAlignment;
manifest.comparisonEditing={default:'Previous placement restored; no automatic building registration',controls:['position','width','height','rotation','direct drag','continuous wheel scale'],savedIn:'editor-saved-data.comparisonTransforms'};
manifest.currentConditions={updatedAt:new Date().toISOString(),pptx:config.source,pptxSha256:inventory.source_sha256,pages:2,newImages:4,excludedSlides:config.excludedSlides,backup:backupPath?path.relative(root,backupPath).split(path.sep).join('/'):manifest.currentConditions?.backup,backupSha256:backupPath?sha(bytes):manifest.currentConditions?.backupSha256};
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n','utf8');
console.log(JSON.stringify({file:path.basename(target),bytes:Buffer.byteLength(html),newPages:2,totalImages:Object.keys(data.embeddedAssets).length,excludedSlide:4,originalUnchanged:true,backup:manifest.currentConditions.backup},null,2));
