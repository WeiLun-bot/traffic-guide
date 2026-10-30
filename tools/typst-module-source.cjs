'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

// Inspect the provided chapters as data; imports and Typst expressions are never executed.
function withoutComments(text){
  let out='',quoted=false,line=false,depth=0;
  for(let i=0;i<text.length;i++){
    const c=text[i],next=text[i+1];
    if(line){if(c==='\n'){line=false;out+=c;}else out+=' ';continue;}
    if(depth){if(c==='/'&&next==='*'){depth++;out+='  ';i++;}else if(c==='*'&&next==='/'){depth--;out+='  ';i++;}else out+=c==='\n'?'\n':' ';continue;}
    if(quoted){out+=c;if(c==='\\'&&next){out+=next;i++;}else if(c==='"')quoted=false;continue;}
    if(c==='"'){quoted=true;out+=c;}else if(c==='/'&&next==='/'){line=true;out+='  ';i++;}else if(c==='/'&&next==='*'){depth=1;out+='  ';i++;}else out+=c;
  }
  return out;
}
function imageSize(file){
  const bytes=fs.readFileSync(file),ext=path.extname(file).toLowerCase();
  if(ext==='.png'){if(bytes.readUInt32BE(0)!==0x89504e47)throw new Error('Invalid PNG: '+file);return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];}
  if(ext==='.svg'){
    const root=bytes.toString('utf8').match(/<svg\b[^>]*>/i)?.[0];if(!root)throw new Error('Invalid SVG: '+file);
    const box=root.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1]?.trim().split(/[\s,]+/).map(Number);
    const size=box?.slice(2)||['width','height'].map(key=>parseFloat(root.match(new RegExp('\\b'+key+'\\s*=\\s*["\']([^"\']+)["\']','i'))?.[1]));
    if(size.length!==2||size.some(v=>!Number.isFinite(v)||v<=0))throw new Error('Missing SVG dimensions: '+file);return size;
  }
  if(ext==='.jpg'||ext==='.jpeg'){
    let p=2;while(p<bytes.length){while(bytes[p]===0xff)p++;const marker=bytes[p++];if(marker===0xd8||marker===0xd9||marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;const size=bytes.readUInt16BE(p);if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return [bytes.readUInt16BE(p+5),bytes.readUInt16BE(p+3)];p+=size;}
  }
  throw new Error('Unsupported image: '+file);
}
function rotationAt(text,position){
  const stack=[];let quoted=false;
  for(let i=0;i<position;i++){const c=text[i];if(quoted){if(c==='\\')i++;else if(c==='"')quoted=false;continue;}if(c==='"'){quoted=true;continue;}if(c==='(')stack.push({name:text.slice(0,i).match(/[\w-]+\s*$/)?.[0].trim(),start:i+1});else if(c===')')stack.pop();}
  const rotate=stack.findLast(item=>item.name==='rotate'),angle=rotate&&text.slice(rotate.start,position).match(/^\s*(-?\d+)deg\s*,/)?.[1];return angle?((Number(angle)%360)+360)%360:0;
}
function chapter(file,projectRoot){
  const bytes=fs.readFileSync(file),text=withoutComments(bytes.toString('utf8'));
  const id=text.match(/^===[^\n]*\[(M[1-4]-\d{2})\]/m)?.[1];if(!id)throw new Error('Missing module ID: '+file);
  const headings=[...text.matchAll(/^====[^\n]*\[(M[1-4]-\d{2}\.\d+)\]\s*([^\n]*)/gm)];
  const images=[...text.matchAll(/\bimage\s*\(\s*"\.\.\/\.\.\/media\/03-modules\/([^"\n]+)"/g)].map(match=>{
    const relative='materials/03-modules/'+match[1];if(!relative.startsWith('materials/03-modules/'+id+'/')||relative.split('/').includes('..'))throw new Error('Invalid image path: '+relative);
    const [width,height]=imageSize(path.join(projectRoot,relative));return {file:relative,name:path.basename(relative),width,height,rotation:rotationAt(text,match.index),index:match.index};
  });
  const unique=new Map();for(const image of images){if(unique.has(image.file)&&unique.get(image.file).rotation!==image.rotation)throw new Error('Multiple image orientations need explicit handling: '+image.name);unique.set(image.file,image);}
  const subs=headings.map((heading,i)=>{
    const end=headings[i+1]?.index||text.length,body=text.slice(heading.index,end);
    const refs=[...body.matchAll(/#module-reg-link\("([^"]+)",\s*\[([^\]]+)\]([^)]*)\)/g)].map(match=>({number:match[3].match(/display-no:\s*"([^"]+)"/)?.[1]||match[1],name:match[2].replace(/「[^」]*」(?:至「[^」]*」)?/g,'').trim()}));
    const scenarios=body.match(/#scenario-reference-list\(\(([\s\S]*?)\)\)/)?.[1];
    return {id:heading[1],name:heading[2].replace(/\s*<[^>]*>\s*$/,'').trim(),body,images:images.filter(image=>image.index>=heading.index&&image.index<end).map(image=>image.file),references:refs,applications:scenarios?[...new Set([...scenarios.matchAll(/"([GC]\d-\d{2})"/g)].map(match=>match[1]))]:[],referral:!body.includes('#guide-item[')};
  });
  return {file:path.basename(file),id,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),text,submodules:subs,images:[...unique.values()]};
}
module.exports={withoutComments,imageSize,chapter};
