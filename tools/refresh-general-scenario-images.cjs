'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function refresh({root=path.resolve(__dirname,'..')}={}){
  const index=path.join(root,'index.html'),original=fs.readFileSync(index,'utf8');
  const match=original.match(/<script id="presentation-data" type="application\/json"([^>]*)>([\s\S]*?)<\/script>/);
  if(!match)throw new Error('Presentation data is missing');
  const separated=match[1].includes('data-source='),data=separated?require('./presentation-source.cjs').readData(root):JSON.parse(match[2]),updates=[],cache=new Map();
  const inspect=relative=>{
    if(cache.has(relative))return cache.get(relative);
    const file=path.resolve(root,relative),within=path.relative(root,file);
    if(!/^materials\/(?:04-一般道路情境|05-複雜道路情境)\//.test(relative)||relative.includes('\\')||within==='..'||within.startsWith('..'+path.sep)||path.isAbsolute(within))throw new Error('Invalid scenario image path: '+relative);
    const bytes=fs.readFileSync(file),svg=bytes.toString('utf8');
    const [width,height]=require('./svg-native-size.cjs')(svg,relative);
    if(/<\s*(?:script|foreignObject)\b/i.test(svg))throw new Error('Unexpected interactive SVG content: '+relative);
    for(const href of svg.matchAll(/\b(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi))if(href[2]&&!href[2].startsWith('#')&&!href[2].startsWith('data:'))throw new Error('External SVG dependency: '+relative);
    const image={bytes,width,height,sha256:digest(bytes)};cache.set(relative,image);return image;
  };
  for(const [key,asset]of Object.entries(data.embeddedAssets)){
    const embedded=asset.url?.startsWith('data:image/svg+xml;');
    if(!embedded&&!asset.url?.endsWith('.svg'))continue;
    const scenario=data.assetMeta[key]?.scenario,name=data.assets[key];
    if(!/^g[1-4]-\d{2}$/.test(scenario)||typeof name!=='string'||path.basename(name)!==name||!name.endsWith('.svg'))throw new Error('Missing source identity for embedded SVG: '+key);
    const relative='materials/04-一般道路情境/'+scenario.toUpperCase()+'/'+name;
    if(!embedded&&decodeURIComponent(asset.url)!==relative)throw new Error('Source identity differs from external SVG: '+key);
    const image=inspect(relative),url=embedded?'data:image/svg+xml;base64,'+image.bytes.toString('base64'):encodeURI(relative);
    if(asset.url!==url||asset.width!==image.width||asset.height!==image.height){Object.assign(asset,{url,width:image.width,height:image.height});updates.push(key);}
  }
  for(const scenario of data.scenarios){const image=data.embeddedAssets[scenario.overall];if(image){scenario.width=image.width;scenario.height=image.height;}}
  const strategies=[],strategyWrites=[];
  for(const relative of ['data/results/general-strategies.json','data/results/complex-strategies.json']){
    const file=path.join(root,relative);if(relative.includes('/complex-')&&!fs.existsSync(file))continue;
    const manifest=JSON.parse(fs.readFileSync(file,'utf8'));let changed=false;
    for(const [key,asset]of Object.entries(manifest.assets)){
      const image=inspect(asset.file);
      if(asset.width!==image.width||asset.height!==image.height||asset.sha256!==image.sha256){Object.assign(asset,{width:image.width,height:image.height,sha256:image.sha256});strategies.push(key);changed=true;}
    }
    if(changed)strategyWrites.push([file,JSON.stringify(manifest,null,2)+'\n']);
  }
  const overviewFile=path.join(root,'data/results/outline.json'),overview=fs.existsSync(overviewFile)?JSON.parse(fs.readFileSync(overviewFile,'utf8')):null,layouts=[];
  for(const [key,asset]of Object.entries(overview?.assets||{}))if(asset.role==='layout'){
    const image=inspect(asset.file);
    if(asset.width!==image.width||asset.height!==image.height||asset.sha256!==image.sha256){Object.assign(asset,{width:image.width,height:image.height,sha256:image.sha256});layouts.push(key);}
  }
  const comparisons=[];
  for(const page of overview?.pages||[])if(page.type==='comparison')for(const entry of page.images){
    const asset=overview.assets[entry.key];
    if(!/^materials\/(?:04-一般道路情境\/G|05-複雜道路情境\/C)[1-4]-\d{2}\/[^/\\]+\.(?:png|svg)$/.test(asset.file))throw new Error('Invalid comparison image path: '+asset.file);
    const file=path.join(root,asset.file),bytes=fs.readFileSync(file),[width,height]=asset.file.endsWith('.svg')?(()=>{const image=inspect(asset.file);return [image.width,image.height];})():require('./typst-module-source.cjs').imageSize(file),sha256=digest(bytes);
    if(asset.width!==width||asset.height!==height||asset.sha256!==sha256){
      const sx=width/asset.width,sy=height/asset.height;
      for(const point of page.items){const focus=point.focus?.[entry.key];if(focus)for(const name of ['rect','crop'])if(focus[name])focus[name]=focus[name].map((value,index)=>value*(index%2?sy:sx));}
      Object.assign(asset,{width,height,sha256});comparisons.push(entry.key);
    }
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
  if(updates.length){if(separated)require('./presentation-source.cjs').writeData(root,data);else{const offset=match.index+match[0].indexOf(match[2]);fs.writeFileSync(index,original.slice(0,offset)+replacement+original.slice(offset+match[2].length),'utf8');}}
  for(const [file,text]of strategyWrites)fs.writeFileSync(file,text,'utf8');
  if(layouts.length||comparisons.length)fs.writeFileSync(overviewFile,JSON.stringify(overview,null,2)+'\n','utf8');
  for(const [file,text]of detailWrites)fs.writeFileSync(file,text,'utf8');
  return {embeddedImages:updates.length,strategyImages:strategies.length,layoutImages:layouts.length,comparisonImages:comparisons.length,detailFiles:detailWrites.length,embeddedKeys:updates,strategyKeys:strategies};
}
module.exports={refresh};
if(require.main===module)console.log(JSON.stringify(refresh()));
