(async()=>{
  'use strict';
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  let debug={};
  async function raster(asset) {
    const img=new Image();img.src=asset.url;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=asset.width;canvas.height=asset.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return {canvas,ctx,pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height};
  }
  function components(image,predicate) {
    const {width:w,height:h,pixels}=image,count=w*h,mask=new Uint8Array(count),queue=new Int32Array(count),result=[];
    for(let i=0;i<count;i++){const k=i*4;mask[i]=predicate(pixels[k],pixels[k+1],pixels[k+2])?1:0;}
    for(let seed=0;seed<count;seed++) {
      if(mask[seed]!==1)continue;
      let head=0,tail=1,area=0,sumX=0,sumY=0,minX=w,minY=h,maxX=0,maxY=0;
      queue[0]=seed;mask[seed]=2;
      while(head<tail) {
        const i=queue[head++],y=Math.floor(i/w),x=i-y*w;
        area++;sumX+=x;sumY+=y;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
        if(x>0&&mask[i-1]===1){mask[i-1]=2;queue[tail++]=i-1;}
        if(x<w-1&&mask[i+1]===1){mask[i+1]=2;queue[tail++]=i+1;}
        if(y>0&&mask[i-w]===1){mask[i-w]=2;queue[tail++]=i-w;}
        if(y<h-1&&mask[i+w]===1){mask[i+w]=2;queue[tail++]=i+w;}
      }
      if(area<5000)continue;
      const left=new Int32Array(h).fill(w),right=new Int32Array(h).fill(-1),top=new Int32Array(w).fill(h),bottom=new Int32Array(w).fill(-1);
      for(let j=0;j<tail;j++){const i=queue[j],y=Math.floor(i/w),x=i-y*w;left[y]=Math.min(left[y],x);right[y]=Math.max(right[y],x);top[x]=Math.min(top[x],y);bottom[x]=Math.max(bottom[x],y);}
      result.push({area,center:[sumX/area,sumY/area],bounds:[minX,minY,maxX,maxY],left,right,top,bottom});
    }
    return result.sort((a,b)=>b.area-a.area);
  }
  function fit(points) {
    assert(points.length>12,'Not enough boundary samples');
    const solve=values=>{
      const n=values.length,sx=values.reduce((s,p)=>s+p[0],0),sy=values.reduce((s,p)=>s+p[1],0),sxx=values.reduce((s,p)=>s+p[0]*p[0],0),sxy=values.reduce((s,p)=>s+p[0]*p[1],0),k=(n*sxy-sx*sy)/(n*sxx-sx*sx);
      return {k,b:(sy-k*sx)/n};
    };
    let values=points;
    for(let i=0;i<4;i++){const line=solve(values),errors=values.map(p=>Math.abs(p[1]-line.k*p[0]-line.b)).sort((a,b)=>a-b),cutoff=Math.max(1.5,errors[Math.floor(errors.length*.7)]*2);values=values.filter(p=>Math.abs(p[1]-line.k*p[0]-line.b)<=cutoff);}
    return {...solve(values),samples:values.length};
  }
  function colorRegion(image,predicate) {
    const {width:w,height:h,pixels}=image,left=new Int32Array(h).fill(w),right=new Int32Array(h).fill(-1),top=new Int32Array(w).fill(h),bottom=new Int32Array(w).fill(-1);
    let area=0,sumX=0,sumY=0,minX=w,minY=h,maxX=0,maxY=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(y*w+x)*4;if(!predicate(pixels[i],pixels[i+1],pixels[i+2],x,y))continue;
      area++;sumX+=x;sumY+=y;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      left[y]=Math.min(left[y],x);right[y]=Math.max(right[y],x);top[x]=Math.min(top[x],y);bottom[x]=Math.max(bottom[x],y);
    }
    return {area,center:[sumX/area,sumY/area],bounds:[minX,minY,maxX,maxY],left,right,top,bottom};
  }
  function edge(component,name,start,end) {
    const values=component[name],points=[];
    const limit=component.bounds[['top','bottom'].includes(name)?3:2];
    for(let i=Math.ceil(start);i<=Math.floor(end);i++)if(values[i]>=0&&values[i]<=limit)points.push([i,values[i]]);
    return fit(points);
  }
  const intersect=(vertical,horizontal)=>{
    const x=(vertical.k*horizontal.b+vertical.b)/(1-vertical.k*horizontal.k);return [x,horizontal.k*x+horizontal.b];
  };
  function corner(component,which) {
    const [x0,y0,x1,y1]=component.bounds,w=x1-x0,h=y1-y0;
    const vertical=which==='bottom-left'?edge(component,'left',y0+h*.12,y0+h*.60):edge(component,'left',y0+h*.35,y0+h*.82);
    const horizontal=edge(component,which==='bottom-left'?'bottom':'top',x0+w*.30,x0+w*.85);
    return {point:intersect(vertical,horizontal),vertical,horizontal};
  }
  const summary=component=>({area:component.area,center:component.center,bounds:component.bounds});
  try {
    const before=await raster(window.alignmentAssets.before),after=await raster(window.alignmentAssets.after);
    const white=components(before,(r,g,b)=>r>249&&g>249&&b>249).slice(0,3);
    assert(white.length===3,'Could not identify three large white building regions');
    const left=white.reduce((a,b)=>a.center[0]<b.center[0]?a:b),others=white.filter(c=>c!==left).sort((a,b)=>a.center[1]-b.center[1]);
    const yellow=colorRegion(after,(r,g,b,x)=>x>after.width*.6&&r>242&&g>240&&Math.min(r,g)-b>10);
    const purple=colorRegion(after,(r,g,b,x)=>x>after.width*.6&&r>218&&b>240&&b-g>10&&b-r>3);
    const pink=colorRegion(after,(r,g,b,x)=>x<after.width*.5&&r>240&&b>195&&r-g>12&&b>=g);
    debug={source:white.map(summary),target:{yellow:yellow&&summary(yellow),purple:purple&&summary(purple),pink:pink&&summary(pink)}};
    assert(yellow&&purple&&pink,'Colored building boundaries were not identified');
    const sourceUpper=corner(others[0],'bottom-left'),sourceLower=corner(others[1],'top-left');
    const targetUpper=corner(yellow,'bottom-left'),targetLower=corner(purple,'top-left');
    const sourceMid=(sourceUpper.point[1]+sourceLower.point[1])/2,targetMid=(targetUpper.point[1]+targetLower.point[1])/2;
    const sourceOpposite=edge(left,'right',sourceMid-150,sourceMid+150),targetOpposite=edge(pink,'right',targetMid-80,targetMid+80);
    const anchors=[
      {name:'支道上側建築線交點',source:sourceUpper.point,target:targetUpper.point},
      {name:'支道下側建築線交點',source:sourceLower.point,target:targetLower.point},
      {name:'對側建築線',source:[sourceOpposite.k*sourceMid+sourceOpposite.b,sourceMid],target:[targetOpposite.k*targetMid+targetOpposite.b,targetMid]}
    ];
    function annotate(image,points) {
      image.ctx.lineWidth=4;image.ctx.font='bold 30px sans-serif';
      points.forEach((p,i)=>{image.ctx.strokeStyle='#008bff';image.ctx.fillStyle='#008bff';image.ctx.beginPath();image.ctx.arc(p[0],p[1],14,0,Math.PI*2);image.ctx.stroke();image.ctx.fillText(String(i+1),p[0]+20,p[1]-15);});
      document.querySelector('main').append(image.canvas);
    }
    annotate(before,anchors.map(a=>a.source));annotate(after,anchors.map(a=>a.target));
    const result={anchors,regions:{source:white.map(summary),target:{yellow:summary(yellow),purple:summary(purple),pink:summary(pink)}},lines:{sourceUpper,sourceLower,targetUpper,targetLower,sourceOpposite,targetOpposite}};
    const pre=document.createElement('pre');pre.id='current-conditions-test-result';pre.textContent=JSON.stringify(result);document.body.append(pre);
  } catch(error) {const pre=document.createElement('pre');pre.id='current-conditions-test-result';pre.textContent=JSON.stringify({error:error.message,stack:error.stack,debug});document.body.append(pre);}
})();
