'use strict';
const fs=require('node:fs'),path=require('node:path');
const mime={'.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'};
function localPath(root,reference){
  if(typeof reference!=='string'||/^(?:[\\/]|[a-z][a-z\d+.-]*:)/i.test(reference)||reference.includes('\\'))throw new Error('Expected a project-relative resource: '+reference);
  const file=path.resolve(root,decodeURIComponent(reference)),within=path.relative(root,file);
  if(within==='..'||within.startsWith('..'+path.sep)||path.isAbsolute(within))throw new Error('Resource escapes project: '+reference);
  return file;
}
function imageBytes(root,url){return url.startsWith('data:')?Buffer.from(url.slice(url.indexOf(',')+1),'base64'):fs.readFileSync(localPath(root,url));}
function readData(root){
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/scenarios/presentation.json'),'utf8')),docs=manifest.caseFiles.map(file=>JSON.parse(fs.readFileSync(localPath(root,file),'utf8')));
  const combined={...manifest.core,scenarios:docs.map(doc=>doc.scenario),articles:docs.flatMap(doc=>doc.articles),assets:Object.assign({},...docs.map(doc=>doc.assetNames)),embeddedAssets:Object.assign({},...docs.map(doc=>doc.embeddedAssets)),assetMeta:Object.assign({},...docs.map(doc=>doc.assetMeta))};
  const order=(value,keys)=>Object.fromEntries(keys.map(key=>[key,value[key]]));
  for(const [field,keys]of [['assets',manifest.nameOrder],['embeddedAssets',manifest.assetOrder],['assetMeta',manifest.metaOrder]])combined[field]=order(combined[field],keys);
  const articles=new Map(combined.articles.map(article=>[article.id,article]));combined.articles=manifest.articleOrder.map(id=>articles.get(id));
  return order(combined,manifest.keys);
}
function dataFromHtml(html,{root=path.resolve(__dirname,'..')}={}){const match=html.match(/<script id="presentation-data" type="application\/json"([^>]*)>([\s\S]*?)<\/script>/);if(!match)throw new Error('Presentation data is missing');return /data-source=/.test(match[1])?readData(root):JSON.parse(match[2]);}
function writeData(root,data){
  const file=path.join(root,'data/scenarios/presentation.json'),manifest=JSON.parse(fs.readFileSync(file,'utf8'));
  const collections=['assets','articles','scenarios','embeddedAssets','assetMeta'];manifest.keys=Object.keys(data);manifest.core=Object.fromEntries(Object.entries(data).filter(([key])=>!collections.includes(key)));
  manifest.assetOrder=Object.keys(data.embeddedAssets);manifest.nameOrder=Object.keys(data.assets);manifest.metaOrder=Object.keys(data.assetMeta);manifest.articleOrder=data.articles.map(article=>article.id);
  for(const relative of manifest.caseFiles){const target=localPath(root,relative),doc=JSON.parse(fs.readFileSync(target,'utf8')),scene=data.scenarios.find(scene=>scene.id===doc.scenario.id);if(!scene)throw new Error('Missing base scenario: '+doc.scenario.id);
    const keys=Object.keys(data.assetMeta).filter(key=>data.assetMeta[key].scenario===scene.id),select=values=>Object.fromEntries(keys.filter(key=>Object.hasOwn(values,key)).map(key=>[key,values[key]]));
    Object.assign(doc,{scenario:scene,articles:data.articles.filter(article=>article.scenario===scene.id),embeddedAssets:select(data.embeddedAssets),assetMeta:select(data.assetMeta),assetNames:select(data.assets)});
    const text=JSON.stringify(doc,null,2)+'\n';if(fs.readFileSync(target,'utf8')!==text)fs.writeFileSync(target,text);
  }
  const text=JSON.stringify(manifest,null,2)+'\n';if(fs.readFileSync(file,'utf8')!==text)fs.writeFileSync(file,text);
}
// Reconstruct the former inline source for legacy source-based checks and tools.
// The browser and release always use the real external files.
function inlineHtml(html,root,{inlineImages=true}={}){
  html=html.replace(/<script id="presentation-data" type="application\/json" data-source="[^"]+"><\/script>/,()=>'<script id="presentation-data" type="application/json">'+JSON.stringify(readData(root)).replace(/</g,'\\u003c')+'</script>');
  html=html.replace(/<link\b([^>]*\bdata-extracted-style[^>]*)>/g,(_,attrs)=>{
    const id=attrs.match(/\bid="([^"]+)"/)?.[1],href=attrs.match(/\bhref="([^"]+)"/)?.[1];
    return '<style'+(id?' id="'+id+'"':'')+'>'+fs.readFileSync(localPath(root,href),'utf8')+'</style>';
  });
  html=html.replace(/<script\b([^>]*\bdata-extracted-script[^>]*)><\/script>/g,(_,attrs)=>{
    const id=attrs.match(/\bid="([^"]+)"/)?.[1],src=attrs.match(/\bsrc="([^"]+)"/)?.[1];
    return '<script'+(id?' id="'+id+'"':'')+'>'+fs.readFileSync(localPath(root,src),'utf8')+'</script>';
  });
  if(inlineImages)html=html.replace(/(<script id="presentation-data" type="application\/json">)([\s\S]*?)(<\/script>)/,(_,open,text,close)=>{
    const data=JSON.parse(text);
    for(const asset of Object.values(data.embeddedAssets))if(asset.url&&!asset.url.startsWith('data:')){
      const type=mime[path.extname(decodeURIComponent(asset.url)).toLowerCase()];if(!type)throw new Error('Unknown image type: '+asset.url);
      asset.url='data:'+type+';base64,'+imageBytes(root,asset.url).toString('base64');
    }
    return open+JSON.stringify(data).replace(/</g,'\\u003c')+close;
  });
  return html;
}
function readHtml(file,options={}){return inlineHtml(fs.readFileSync(file,'utf8'),options.root||path.dirname(file),options);}
module.exports={localPath,imageBytes,dataFromHtml,readData,writeData,inlineHtml,readHtml};
