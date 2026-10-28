'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const site=path.join(root,'_site');
const files=new Map([
  ['index.html','index.html'],
  ['一般道路情境-圖面放大版.html','index.html'],
  ['一般道路情境-demo.html','一般道路情境-demo.html'],
  ['路口管制.html','路口管制.html'],
  ['.nojekyll','.nojekyll']
]);
assert(fs.existsSync(site),'Run node tools/prepare-github-pages.cjs before this check');
const siteInfo=fs.lstatSync(site);
assert(siteInfo.isDirectory()&&!siteInfo.isSymbolicLink(),'_site must be a regular directory');
assert.deepEqual(fs.readdirSync(site).sort(),[...files.keys()].sort(),'Published files differ from the release allowlist');
let scripts=0,resources=0,svgImages=0;
const namespace='http://www.w3.org/2000/svg';
function resource(value,label){
  const reference=value.trim();
  if(!reference||reference.includes('${')||reference.startsWith('#')||/^(?:data:|blob:)/i.test(reference)||reference===namespace)return;
  assert(!/^(?:[\\/]|[a-z][a-z\d+.-]*:)/i.test(reference),label+' uses an absolute or external resource: '+reference.slice(0,100));
  const clean=decodeURIComponent(reference.split(/[?#]/)[0]);
  if(!clean)return;
  const target=path.resolve(site,clean),relative=path.relative(site,target);
  assert(relative!== '..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),label+' escapes the published folder');
  assert(fs.existsSync(target),label+' references a missing file: '+clean);
  resources++;
}
function validateResources(html,label){
  assert(!/\bfile:\/\//i.test(html),label+' contains a local file URL');
  assert(!/(?:^|[^a-z\d_])[a-z]:[\\/]/im.test(html),label+' contains a Windows drive path');
  for(const match of html.matchAll(/\b(?:src|href|xlink:href|poster)\s*=\s*(["'])([\s\S]*?)\1/gi))resource(match[2],label);
  for(const match of html.matchAll(/\burl\(\s*(["']?)(.*?)\1\s*\)/gi))resource(match[2],label+' CSS');
  for(const match of html.matchAll(/@import\s+(["'])(.*?)\1/gi))resource(match[2],label+' CSS import');
}
function attributes(text){
  const result={};for(const match of text.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g))result[match[1].toLowerCase()]=match[3];return result;
}
function parseScripts(html,label){
  const json=new Map();
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
    const attrs=attributes(match[1]);
    if(attrs.type==='application/json')json.set(attrs.id||String(json.size),JSON.parse(match[2]));
    else {new vm.Script(match[2],{filename:label+':'+(attrs.id||scripts)});scripts++;}
  }
  assert(!/\/\*\s*(?:STYLES|DATA|SCRIPT|[A-Z_]+_(?:SCRIPT|STYLES))\s*\*\//.test(html),label+' contains an unresolved build placeholder');
  assert(!/\{\{(?:STYLE|SCRIPT|DECK_|EDITOR_STATE)[^}]*\}\}/.test(html),label+' contains an unresolved shell placeholder');
  return json;
}
let indexHtml,indexJson;
for(const [name,source]of files){
  const output=path.join(site,name),info=fs.lstatSync(output);
  assert(info.isFile()&&!info.isSymbolicLink(),'Release entry must be a regular file: '+name);
  const bytes=fs.readFileSync(output);
  assert(bytes.equals(fs.readFileSync(path.join(root,source))),'Release changed source bytes: '+name);
  if(!name.endsWith('.html'))continue;
  const html=bytes.toString('utf8');validateResources(html,name);
  const json=parseScripts(html,name);
  if(name==='index.html'){indexHtml=html;indexJson=json;}
}
const data=indexJson.get('presentation-data');
assert(data,'Published index is not the general-road presentation');
assert.equal(data.chapters.length,5,'Chapter count changed');
assert.deepEqual(data.scenarios.map(scene=>scene.id),['g1-01','g1-02','g1-03','g1-04'],'Scenario missing');
assert.equal(data.articles.length,26,'Article count changed');
assert.equal(new Set(data.articles.map(article=>article.id)).size,26,'Duplicate article IDs');
assert.equal(Object.keys(data.embeddedAssets).length,28,'Embedded image or alias missing');
function imageUrl(key,visited=new Set()){
  assert(!visited.has(key),'Cyclic embedded image alias: '+key);visited.add(key);
  const asset=data.embeddedAssets[key];assert(asset,'Missing embedded image: '+key);
  assert(asset.width>0&&asset.height>0,'Invalid image dimensions: '+key);
  return asset.sourceAsset?imageUrl(asset.sourceAsset,visited):asset.url;
}
for(const key of Object.keys(data.embeddedAssets)){
  const url=imageUrl(key);
  assert(typeof url==='string'&&/^data:image\/(?:svg\+xml|png|jpeg|webp|gif);base64,/i.test(url),'Image is not embedded: '+key);
  const bytes=Buffer.from(url.slice(url.indexOf(',')+1),'base64');assert(bytes.length>0,'Empty embedded image: '+key);
  if(url.startsWith('data:image/svg+xml;')){validateResources(bytes.toString('utf8'),'SVG '+key);svgImages++;}
}
const originalImages=[...new Set(Object.values(data.assetMeta).map(meta=>meta.sourceFile).filter(Boolean))].sort();
assert.deepEqual(originalImages,['image1.png','image13.png','image14.png','image15.png','image16.png','image2.jpeg','image3.jpeg','image8.png','image9.png'],'Wrong PPTX images were included');
assert.equal(data.currentConditionsSource.file,'G1.pptx');
assert.deepEqual(data.currentConditionsSource.includedSlides,[3,4,8,9,13,14,15,16],'Missing current-condition slides');
assert.deepEqual(data.currentConditionsSource.excludedSlides,[5,6,10,11],'Other scenarios were included');
const sourceIndex=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sourceJson=parseScripts(sourceIndex,'source index');
assert.deepEqual(indexJson.get('editor-saved-data'),sourceJson.get('editor-saved-data'),'Saved editor settings changed during publishing');
assert(indexJson.get('editor-saved-data'),'Editor saved data is missing');
assert(/<style\b[^>]*>[\s\S]+?<\/style>/.test(indexHtml),'Embedded presentation CSS is missing');
assert(indexHtml.includes('id="general-editor"')&&indexHtml.includes('id="general-current-conditions"'),'Embedded editor or comparison script is missing');
assert(/@keyframes\s+appear\b/.test(indexHtml)&&indexHtml.includes('requestAnimationFrame')&&/\btransition\s*:/.test(indexHtml),'Existing presentation animation is missing');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/pages.yml'),'utf8');
const upload=workflow.match(/uses:\s*actions\/upload-pages-artifact@[^\r\n]+([\s\S]*?)(?=\r?\n\s*-\s+(?:name:|uses:)|$)/);
assert(upload,'Pages upload step is missing');
const uploadedPath=upload[1].match(/\bpath:\s*([^\r\n#]+)/);assert(uploadedPath,'Pages upload folder is missing');
const normalized=uploadedPath[1].trim().replace(/^['"]|['"]$/g,'').replace(/\\/g,'/').replace(/^\.\//,'').replace(/\/$/,'');
assert.equal(normalized,'_site','Workflow must publish only the prepared _site folder');
assert(/node\s+tools\/prepare-github-pages\.cjs/.test(workflow),'Workflow skips release preparation');
assert(/node\s+tests\/verify-github-pages\.cjs/.test(workflow),'Workflow skips release checks');
assert(/uses:\s*actions\/deploy-pages@/.test(workflow)&&/pages:\s*write/.test(workflow)&&/id-token:\s*write/.test(workflow),'Pages deployment or permissions missing');
console.log('PASS: 5 allowlisted files; byte-identical sources and saved edits; 5 chapters, 4 scenarios, 26 explanations; 28 embedded images ('+svgImages+' SVGs); '+scripts+' valid scripts; '+resources+' relative file references; no local paths or network dependencies; animation preserved; workflow uploads only _site.');
