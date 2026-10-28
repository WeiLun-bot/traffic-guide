'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const sourcePath=path.join(root,'一般道路情境-demo.html');
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
const backupPath=unique(backupFolder,'一般道路情境-demo-改版前備份-'+timestamp,'.html');
fs.writeFileSync(backupPath,bytes,{flag:'wx'});
if(hash(fs.readFileSync(backupPath))!==sourceHash)throw new Error('Backup verification failed');
let html=bytes.toString('utf8');
const dataMatch=html.match(/<script id="presentation-data" type="application\/json">([\s\S]*?)<\/script>/);
const stateMatch=html.match(/<script id="editor-saved-data" type="application\/json">([\s\S]*?)<\/script>/);
if(!dataMatch||!stateMatch)throw new Error('Presentation data or editor state is missing');
const data=JSON.parse(dataMatch[1]);
const state=JSON.parse(stateMatch[1]);
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
html=html.replace(stateMatch[0],()=>'<script id="editor-saved-data" type="application/json">'+JSON.stringify(state).replace(/</g,'\\u003c')+'</script>');
html=html.replace(/<body\b([^>]*)>/,(_match,attributes)=>'<body'+attributes+' data-presentation-variant="figure-focused">');
const css=fs.readFileSync(path.join(root,'src','general-scenarios','figure-focused.css'),'utf8');
html=html.replace('</head>','<meta name="presentation-variant" content="figure-focused"><style id="figure-focused-styles">'+css+'</style></head>');
html=html.replace(/<title>[\s\S]*?<\/title>/,'<title>一般道路情境｜圖面放大版</title>')
  .replaceAll('｜一般道路情境簡報`','｜一般道路情境簡報（圖面放大版）`')
  .replaceAll('一般道路情境-可編輯.html','一般道路情境-圖面放大版-可編輯.html')
  .replaceAll('重點數值卡（綠色）','重點數值資訊');
const outputPath=unique(root,'一般道路情境-圖面放大版','.html');
fs.writeFileSync(outputPath,html,{encoding:'utf8',flag:'wx'});
if(hash(fs.readFileSync(sourcePath))!==sourceHash)throw new Error('Original presentation was changed');
const manifest={createdAt:new Date().toISOString(),timezone:'Asia/Taipei',source:path.basename(sourcePath),sourceSha256:sourceHash,backup:path.relative(root,backupPath).split(path.sep).join('/'),backupSha256:hash(fs.readFileSync(backupPath)),output:path.basename(outputPath),outputSha256:hash(Buffer.from(html)),articlePages:data.articles.length,leftPercent:72,rightPercent:28,note:'Original and backup are byte-identical. New copy keeps article text and uses plain metric styling with a wider drawing area.'};
const manifestPath=outputPath.replace(/\.html$/,'.manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n','utf8');
console.log(JSON.stringify(manifest,null,2));
