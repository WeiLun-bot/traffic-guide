'use strict';
module.exports=function svgNativeSize(svg,file='SVG'){
  const header=svg.match(/<svg\b([^>]*)>/i)?.[1];
  const attribute=name=>header?.match(new RegExp('\\b'+name+'\\s*=\\s*(["\x27])(.*?)\\1','i'))?.[2];
  const view=attribute('viewBox');
  if(view){const values=view.trim().split(/[\s,]+/).map(Number);if(values.length===4&&values.every(Number.isFinite)&&values[0]===0&&values[1]===0&&values[2]>0&&values[3]>0)return values.slice(2);}
  else{
    const dimension=name=>{const value=attribute(name);return value&&/^\d+(?:\.\d+)?(?:px)?$/.test(value.trim())?Number(value.trim().replace(/px$/,'')):NaN;};
    const width=dimension('width'),height=dimension('height');if(width>0&&height>0)return[width,height];
  }
  throw new Error('Invalid SVG dimensions: '+file);
};
