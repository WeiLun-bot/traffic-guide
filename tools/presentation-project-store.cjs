'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Document=require('../assets/presentation-document.js'),Core=require('../assets/visual-editor-core.js');
const writeVerified=require('./write-verified-file.cjs');
const projectRoot=path.resolve(__dirname,'..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
function resolveFile(root,file){
  if(typeof file!=='string'||file.includes('\\')||file.split('/').some(part=>!part||part==='.'||part==='..'||part.startsWith('.'))||!file.startsWith('data/')&&!file.startsWith('layout/')&&!file.startsWith('materials/edited/'))throw new Error('Invalid project file: '+file);
  const target=path.resolve(root,file),relative=path.relative(root,target);if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('File outside project');
  for(let current=target;current!==root;current=path.dirname(current))if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw new Error('Project file must not use symbolic links: '+file);
  return target;
}
function ownersFromRegistry(registry){
  const owners={};
  for(const doc of registry.modules.contents){const owner='modules/'+doc.id;for(const page of doc.pages)owners[page.id]=owner;for(const key of Object.keys(doc.assets))owners['module:'+key]=owner;}
  const scenes=[...registry.base.scenarios,...registry.scenarios.details.map(doc=>doc.scenario)];
  for(const scene of scenes){const owner='scenarios/'+scene.code;for(const key of ['contextId','overviewId','reviewId','comparisonId'])if(scene[key])owners[scene[key]]=owner;if(scene.currentConditions)owners[scene.currentConditions.pageId]=owner;}
  for(const article of [...registry.base.articles,...registry.scenarios.details.flatMap(doc=>doc.articles)])owners[article.id]='scenarios/'+article.scenario.toUpperCase();
  for(const [key,meta]of Object.entries(registry.base.assetMeta))if(meta.scenario)owners[key]='scenarios/'+meta.scenario.toUpperCase();
  for(const doc of registry.scenarios.details)for(const key of Object.keys(doc.assets))owners[key]='scenarios/'+doc.scenario.code;
  return owners;
}
function read(root=projectRoot){
  root=path.resolve(root);const files={};
  const get=file=>{const bytes=fs.readFileSync(resolveFile(root,file));files[file]=bytes;return JSON.parse(bytes);};
  const layout=get(Document.layoutFile);
  if(layout.kind!=='presentation-layout')return {config:Core.validate(layout),owners:{},files,revision:revision(files)};
  const navigation=get(Document.structureFile),catalog=Document.validateCatalog(get(Document.manifestFile));
  const documents=catalog.files.map(file=>{const doc=get(file);if(Document.contentPath(doc.owner)!==file)throw new Error('Content owner does not match file: '+file);return doc;});
  return {config:Document.join(layout,navigation,documents),owners:catalog.owners,files,revision:revision(files)};
}
function revision(files){const digest=crypto.createHash('sha256');for(const file of Object.keys(files).sort())digest.update(file+'\0').update(files[file]).update('\0');return digest.digest('hex');}
function plan(config,owners){
  const split=Document.split(config,owners),files={};
  // Replacement artwork belongs to materials, never to a layout or a text file.
  for(const doc of Object.values(split.documents))for(const image of Object.values(doc.images)){
    const match=image.src?.match(/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,([a-z\d+/=\s]+)$/i);if(!match)continue;
    const bytes=Buffer.from(match[2],'base64'),extension=match[1].toLowerCase()==='svg+xml'?'svg':match[1].toLowerCase();
    const file='materials/edited/'+hash(bytes)+'.'+extension;files[file]=bytes;image.src=file;
  }
  files[Document.layoutFile]=json(split.layout);files[Document.structureFile]=json(split.navigation);
  for(const [owner,doc]of Object.entries(split.documents))files[Document.contentPath(owner)]=json(doc);
  files[Document.manifestFile]=json(split.catalog);
  return files;
}
function transaction(root,files,{write=writeVerified,backup=true}={}){
  const changed=Object.entries(files).filter(([file,bytes])=>{const target=resolveFile(root,file);return !fs.existsSync(target)||!fs.readFileSync(target).equals(bytes);});
  if(!changed.length)return null;
  const previous=new Map(changed.map(([file])=>[file,fs.existsSync(resolveFile(root,file))?fs.readFileSync(resolveFile(root,file)):null]));
  let backupPath=null;
  if(backup){
    backupPath=path.join(root,'exports/project-backups',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));
    fs.mkdirSync(backupPath,{recursive:true});
    for(const [file,bytes]of previous)if(bytes){const target=path.join(backupPath,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
    fs.writeFileSync(path.join(backupPath,'changes.json'),json({files:[...previous].map(([file,bytes])=>({file,created:bytes===null}))}));
  }
  const written=[];
  try{
    for(const [file,bytes]of changed){const target=resolveFile(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});written.push(file);write(target,bytes,file);}
  }catch(error){
    const failures=[];for(const file of written.reverse())try{const target=resolveFile(root,file),bytes=previous.get(file);if(bytes===null){if(fs.existsSync(target))fs.unlinkSync(target);}else fs.writeFileSync(target,bytes,{flush:true});}catch(restoreError){failures.push(restoreError.message);}
    if(failures.length)throw new Error(error.message+'; restore from '+backupPath+': '+failures.join('; '),{cause:error});
    throw error;
  }
  return backupPath;
}
function migrate({root=projectRoot}={}){
  root=path.resolve(root);const current=read(root);if(JSON.parse(current.files[Document.layoutFile]).kind==='presentation-layout')return {migrated:false};
  const registry=JSON.parse(fs.readFileSync(path.join(root,'data/presentation-registry.json'),'utf8')),owners=ownersFromRegistry(registry);
  const files=plan(current.config,owners),backup=transaction(root,files),after=read(root);
  return {migrated:true,backup,beforeBytes:current.files[Document.layoutFile].length,layoutBytes:after.files[Document.layoutFile].length,contentFiles:JSON.parse(after.files[Document.manifestFile]).files.length};
}
function save({root=projectRoot,config,expectedRevision,...options}){
  root=path.resolve(root);const current=read(root);
  if(expectedRevision!==current.revision){const error=new Error('專案已被其他程式修改。請先匯出目前版本，再重新載入合併。');error.status=409;throw error;}
  const files=plan(config,current.owners),backup=transaction(root,files,options),result=read(root);
  return {revision:result.revision,backup};
}
function releaseFiles(root=projectRoot){
  const current=read(root),files=Object.keys(current.files);
  for(const image of Object.values(current.config.legacyState.images))if(/^materials\/edited\/[a-f0-9]{64}\.(?:png|jpeg|webp|gif|svg)$/.test(image.src))files.push(image.src);
  return [...new Set(files)];
}
module.exports={read,save,migrate,plan,transaction,releaseFiles,resolveFile,ownersFromRegistry};
if(require.main===module)console.log(JSON.stringify(migrate()));
