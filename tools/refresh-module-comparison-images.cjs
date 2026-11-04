'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {localPath}=require('./presentation-source.cjs'),{imageSize}=require('./typst-module-source.cjs');
function refresh({root=path.resolve(__dirname,'..')}={}){
  const file=path.join(root,'data/results/module-comparisons.json');if(!fs.existsSync(file))return {updated:0};
  const data=require('../assets/presentation-results.js').validateModuleComparisons(JSON.parse(fs.readFileSync(file,'utf8')));let updated=0;
  for(const asset of Object.values(data.assets)){
    const target=localPath(root,asset.file),bytes=fs.readFileSync(target),svg=asset.file.endsWith('.svg')?bytes.toString('utf8'):null;
    const [width,height]=svg?require('./svg-native-size.cjs')(svg,asset.file):imageSize(target);
    if(svg){
      if(/<\s*(?:script|foreignObject)\b/i.test(svg))throw new Error('Unexpected interactive SVG: '+asset.file);
      for(const href of svg.matchAll(/\b(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi))if(href[2]&&!href[2].startsWith('#')&&!href[2].startsWith('data:'))throw new Error('External SVG dependency: '+asset.file);
    }
    const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
    if(asset.width!==width||asset.height!==height||asset.sha256!==sha256){Object.assign(asset,{width,height,sha256});updated++;}
  }
  if(updated)require('./write-verified-file.cjs')(file,Buffer.from(JSON.stringify(data,null,2)+'\n'),'module comparison image metadata');
  return {updated};
}
module.exports={refresh};
if(require.main===module)console.log(JSON.stringify(refresh()));
