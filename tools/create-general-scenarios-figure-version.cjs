'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const sourcePath=path.join(root,'index.html');
const bytes=fs.readFileSync(sourcePath);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceHash=hash(bytes);
const unique=(folder,stem,extension)=>{
  let result=path.join(folder,stem+extension),index=2;
  while(fs.existsSync(result))result=path.join(folder,stem+'-'+(index++)+extension);
  return result;
};
const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
const timestamp=parts.year+parts.month+parts.day+'-'+parts.hour+parts.minute+parts.second;
const backupFolder=path.join(root,'backups');fs.mkdirSync(backupFolder,{recursive:true});
const backupPath=unique(backupFolder,'index-改版前備份-'+timestamp,'.html');
fs.writeFileSync(backupPath,bytes,{flag:'wx'});
if(hash(fs.readFileSync(backupPath))!==sourceHash)throw new Error('Backup verification failed');
let html=bytes.toString('utf8');
const dataMatch=html.match(/<script id="presentation-data" type="application\/json">([\s\S]*?)<\/script>/);
const stateMatch=html.match(/<script id="editor-saved-data" type="application\/json"([^>]*)>([\s\S]*?)<\/script>/);
if(!dataMatch||!stateMatch)throw new Error('Presentation data or editor state is missing');
const data=JSON.parse(dataMatch[1]);
const configSource=stateMatch[1].match(/data-source="([^"]+)"/)?.[1];
const configPath=configSource?path.resolve(root,configSource):null;
if(configPath&&!configPath.startsWith(root+path.sep))throw new Error('Layout configuration must stay inside the project');
const config=configPath?require('../assets/visual-editor-core.js').parse(fs.readFileSync(configPath,'utf8')):null;
const state=config?config.legacyState:JSON.parse(stateMatch[2]);
const outputPath=unique(root,'一般道路情境-圖面放大版','.html');
const outputConfigPath=config?outputPath.replace(/\.html$/,'.layout.json'):null;
state.layouts=state.layouts||{};state.frames=state.frames||{};state.blocks=state.blocks||{};
for(const article of data.articles) {
  state.layouts[article.id]={...state.layouts[article.id],split:72,gap:18};
  const frameKey=article.id+'|frame|0';
  state.frames[frameKey]={...state.frames[frameKey],width:100};
  const scope=article.id+'|1';
  const block=state.blocks[scope]||{added:[],removed:[],decor:{}};
  block.decor={...block.decor,metric:{...block.decor?.metric,border:false,background:false}};
  state.blocks[scope]=block;
}
state.updatedAt=Date.now();
html=html.replace(stateMatch[0],()=>config?'<script id="editor-saved-data" type="application/json" data-source="'+path.basename(outputConfigPath)+'"></script>':'<script id="editor-saved-data" type="application/json">'+JSON.stringify(state).replace(/</g,'\\u003c')+'</script>');
html=html.replace(/<body\b([^>]*)>/,(_match,attributes)=>'<body'+attributes.replace(/\sdata-presentation-variant=(["'])[^"']*\1/,'')+' data-presentation-variant="figure-focused">');
if(!html.includes('id="figure-focused-styles"')) {
  const css=fs.readFileSync(path.join(root,'src','general-scenarios','figure-focused.css'),'utf8');
  html=html.replace('</head>','<style id="figure-focused-styles">'+css+'</style></head>');
}
if(!html.includes('name="presentation-variant"'))html=html.replace('</head>','<meta name="presentation-variant" content="figure-focused"></head>');
html=html.replace(/<title>[\s\S]*?<\/title>/,'<title>一般道路情境｜圖面放大版</title>')
  .replaceAll('｜一般道路情境簡報`','｜一般道路情境簡報（圖面放大版）`')
  .replaceAll('一般道路情境-可編輯.html','一般道路情境-圖面放大版-可編輯.html')
  .replaceAll('重點數值卡（綠色）','重點數值資訊');
if(config)fs.writeFileSync(outputConfigPath,JSON.stringify(config,null,2)+'\n',{encoding:'utf8',flag:'wx'});
fs.writeFileSync(outputPath,html,{encoding:'utf8',flag:'wx'});
if(hash(fs.readFileSync(sourcePath))!==sourceHash)throw new Error('Original presentation was changed');
const manifest={createdAt:new Date().toISOString(),timezone:'Asia/Taipei',source:path.basename(sourcePath),sourceSha256:sourceHash,backup:path.relative(root,backupPath).split(path.sep).join('/'),backupSha256:hash(fs.readFileSync(backupPath)),output:path.basename(outputPath),outputSha256:hash(Buffer.from(html)),articlePages:data.articles.length,leftPercent:72,rightPercent:28,note:'Original and backup are byte-identical. New copy keeps article text and uses plain metric styling with a wider drawing area.'};
const manifestPath=outputPath.replace(/\.html$/,'.manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n','utf8');
if(config){manifest.layout=path.basename(outputConfigPath);fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n','utf8');}
console.log(JSON.stringify(manifest,null,2));
