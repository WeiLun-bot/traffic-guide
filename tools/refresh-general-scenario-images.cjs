'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function refresh({root=path.resolve(__dirname,'..')}={}){
  const index=path.join(root,'index.html'),original=fs.readFileSync(index,'utf8');
  const match=original.match(/<script id="presentation-data" type="application\/json">([\s\S]*?)<\/script>/);
  if(!match)throw new Error('Presentation data is missing');
  const data=JSON.parse(match[1]),updates=[],cache=new Map();
  const inspect=relative=>{
    if(cache.has(relative))return cache.get(relative);
    const file=path.resolve(root,relative),within=path.relative(root,file);
    if(!relative.startsWith('materials/04-一般道路情境/')||relative.includes('\\')||within==='..'||within.startsWith('..'+path.sep)||path.isAbsolute(within))throw new Error('Invalid general-scenario image path: '+relative);
    const bytes=fs.readFileSync(file),svg=bytes.toString('utf8');
    const [width,height]=require('./svg-native-size.cjs')(svg,relative);
    if(/<\s*(?:script|foreignObject)\b/i.test(svg))throw new Error('Unexpected interactive SVG content: '+relative);
    for(const href of svg.matchAll(/\b(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi))if(href[2]&&!href[2].startsWith('#')&&!href[2].startsWith('data:'))throw new Error('External SVG dependency: '+relative);
    const image={bytes,width,height,sha256:digest(bytes)};cache.set(relative,image);return image;
  };
  for(const [key,asset]of Object.entries(data.embeddedAssets)){
    if(!asset.url?.startsWith('data:image/svg+xml;'))continue;
    const scenario=data.assetMeta[key]?.scenario,name=data.assets[key];
    if(!/^g[1-4]-\d{2}$/.test(scenario)||typeof name!=='string'||path.basename(name)!==name||!name.endsWith('.svg'))throw new Error('Missing source identity for embedded SVG: '+key);
    const image=inspect('materials/04-一般道路情境/'+scenario.toUpperCase()+'/'+name),url='data:image/svg+xml;base64,'+image.bytes.toString('base64');
    if(asset.url!==url||asset.width!==image.width||asset.height!==image.height){Object.assign(asset,{url,width:image.width,height:image.height});updates.push(key);}
  }
  for(const scenario of data.scenarios){const image=data.embeddedAssets[scenario.overall];if(image){scenario.width=image.width;scenario.height=image.height;}}
  const manifestFile=path.join(root,'data/results/general-strategies.json'),manifestText=fs.readFileSync(manifestFile,'utf8'),manifest=JSON.parse(manifestText),strategies=[];
  for(const [key,asset]of Object.entries(manifest.assets)){
    const image=inspect(asset.file);
    if(asset.width!==image.width||asset.height!==image.height||asset.sha256!==image.sha256){Object.assign(asset,{width:image.width,height:image.height,sha256:image.sha256});strategies.push(key);}
  }
  const catalogFile=path.join(root,'data/scenarios/catalog.json'),detailWrites=[];
  if(fs.existsSync(catalogFile))for(const relative of JSON.parse(fs.readFileSync(catalogFile,'utf8')).details||[]){
    const file=path.join(root,relative),doc=JSON.parse(fs.readFileSync(file,'utf8'));let changed=false;
    for(const [key,asset]of Object.entries(doc.assets)){
      if(!asset.file.endsWith('.svg'))continue;
      const image=inspect(asset.file),sx=image.width/asset.width,sy=image.height/asset.height;
      if(asset.width===image.width&&asset.height===image.height&&asset.sha256===image.sha256)continue;
      for(const article of doc.articles.filter(article=>article.mapAsset===key))for(const property of ['box','crop'])article[property]=article[property].map((value,index)=>value*(index%2?sy:sx));
      Object.assign(asset,{width:image.width,height:image.height,sha256:image.sha256});changed=true;
    }
    if(changed){const image=doc.assets[doc.scenario.overall];doc.scenario.width=image.width;doc.scenario.height=image.height;detailWrites.push([file,JSON.stringify(doc,null,2)+'\n']);}
  }
  // Validate every source before writing; retain all IDs, explanation text,
  // scripts, styles, aliases and saved layout settings.
  const replacement=JSON.stringify(data).replace(/</g,'\\u003c');
  if(updates.length){const offset=match.index+match[0].indexOf(match[1]);fs.writeFileSync(index,original.slice(0,offset)+replacement+original.slice(offset+match[1].length),'utf8');}
  if(strategies.length)fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n','utf8');
  for(const [file,text]of detailWrites)fs.writeFileSync(file,text,'utf8');
  return {embeddedImages:updates.length,strategyImages:strategies.length,detailFiles:detailWrites.length,embeddedKeys:updates,strategyKeys:strategies};
}
module.exports={refresh};
if(require.main===module)console.log(JSON.stringify(refresh()));
