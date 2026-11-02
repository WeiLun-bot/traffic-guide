'use strict';

// Reviewed against the current full layouts and signal diagrams. Percentages
// refer to the displayed drawing AFTER its quarter-turn; saved editor bounds
// always use the original, unrotated image coordinates.
const focusByCase = {
  g105: {
    'yellow-line': [13, 67, 17, 5],
    'red-line': [29, 59, 13, 13],
    'no-parking-sign': [20, 58, 7, 7],
    'no-stopping-sign': [86, 49, 5, 9],
    'parking-sign': [51, 54, 7, 7]
  },
  g106: {
    reflectors: [49, 22, 9, 9],
    'lane-line': [28, 52, 17, 9],
    'slow-line': [65, 21, 17, 7],
    'crosswalk-line': [46, 23, 7, 7],
    'yield-sign': [40, 29, 4, 8],
    'speed-sign': [54, 20, 3, 7]
  },
  g201: {
    waiting: [71.5, 41.5, 6.5, 6],
    permissive: [45, 69, 9, 10],
    protected: [45, 69, 9, 10],
    checklist: [63, 19, 10, 11],
    visible: [49, 29, 12, 13],
    left: [43, 2, 21, 39],
    far: [47, 12, 21, 68],
    near: [73, 37, 10, 10],
    gap: [35, 40, 34, 29],
    start: [44, 69, 11, 11],
    clearance: [73, 36, 10, 12],
    pedestrian: [54, 64, 14, 10]
  },
  g202: {
    center: [59, 54, 16, 5],
    'street-name': [59, 31, 10, 17],
    'signal-plan': [67, 57, 16, 23],
    pedestrians: [57, 47, 3, 12],
    glare: [58, 9, 34, 55],
    checklist: [17, 78, 13, 15]
  },
  g203: {
    channel: [61, 66, 20, 7],
    'bicycle-crossing': [52, 65, 5, 12],
    'lane-warning': [47, 10, 6, 6],
    speed: [65, 76, 2.5, 4],
    'signal-plan': [76, 47, 15, 16],
    'left-signal': [61, 66, 23, 31],
    'visible-1': [4, 10, 32, 44],
    'visible-2': [10, 30, 26, 55],
    'visible-3': [62, 15, 29, 39],
    privacy: [24, 33, 9, 39],
    checklist: [10, 76, 17, 17]
  },
  g204: {
    sidewalk: [42, 42, 9, 22],
    bend: [65, 33, 28, 14],
    'signal-warning': [87, 24, 5, 8],
    trajectory: [32, 27, 19, 34],
    'signal-plan': [40, 23, 20, 14],
    'recognition-distance': [54, 28, 9, 10],
    'curve-option-1': [1, 44, 16, 24],
    'curve-option-2': [10, 50, 7, 20],
    'curve-option-3': [9, 64, 7, 8],
    'near-alternative': [42, 25, 6, 8],
    'far-post': [86, 5, 6, 21],
    checklist: [67, 37, 10, 15]
  },
  g301: {
    guide: [40, 49, 19, 13],
    'staggered-layout': [50, 47, 21, 14]
  },
  g302: {
    channel: [24, 46, 19, 5],
    center: [12, 45, 14, 4],
    edge: [60, 54, 20, 6],
    crosswalk: [48, 42, 5, 8],
    'junction-warning': [90, 49, 6, 8]
  },
  g303: {
    crosswalk: [44, 48, 5, 11],
    sidewalk: [53, 40, 10, 9],
    'hump-warning': [55, 7, 7, 10]
  },
  g304: {
    stopline: [56, 38, 8, 5],
    edge: [12, 22, 16, 15],
    crosswalk: [38, 43, 11, 11],
    weight: [48, 26, 7, 8]
  },
  g401: {
    'left-waiting': [46, 47, 5, 12],
    crosswalk: [52, 33, 10, 9],
    dotted: [42, 43, 16, 23],
    'bus-bay': [66, 55, 21, 21],
    parking: [70.5, 82, 5, 9],
    'lane-advance': [9, 25, 6, 13],
    'signal-plan': [54, 7, 9, 15],
    visibility: [38, 19, 44, 59],
    'phase-two': [1, 5, 44, 26],
    'phase-three': [2, 7, 33, 18],
    checklist: [33, 29, 10, 12]
  },
  g402: {
    waiting: [61, 36, 8, 8],
    'two-stage-area': [48.3, 32.5, 3.5, 5],
    'two-stage-sign': [6, 42, 5, 7],
    'no-uturn': [38, 43, 3, 5],
    direction: [67, 23, 6, 12],
    'signal-plan': [50, 22, 14, 12],
    backboard: [64, 51, 12, 9],
    'visibility-1': [36, 8, 38, 81],
    'visibility-2': [19, 8, 65, 47],
    checklist: [73, 33, 11, 12]
  },
  g403: {
    guide: [46, 54, 8, 18],
    'two-stage-area': [49, 51, 2, 3],
    island: [42, 59.5, 6, 6],
    'accessible-crosswalk': [42, 55, 5, 10],
    'left-waiting': [48, 59, 5, 8],
    hospital: [49, 88, 3, 6],
    'signal-plan': [41, 13, 11, 11],
    checklist: [66, 57, 8, 15],
    phase: [35, 35, 28, 34]
  },
  g404: {
    'lane-reduction': [93, 8, 7, 15],
    'lane-warning': [89, 8, 4, 6],
    speed: [64, 57, 3, 6],
    permissive: [35, 11, 12, 9],
    protected: [35, 11, 12, 9],
    risk: [43, 42, 24, 23],
    'near-highspeed': [62, 81, 18, 12],
    privacy: [24, 10, 12, 10],
    checklist: [78, 7, 13, 10]
  }
};
const specs = Object.fromEntries(Object.entries(focusByCase).flatMap(([prefix,items])=>Object.entries(items).map(([id,box])=>[prefix+'-'+id,box])));
const round = n=>{const value=Math.round(n*100)/100;return value===0?0:value;};
function nativeBounds(box,asset){
  const rotation=asset.rotation||0,w=asset.width,h=asset.height;
  const dw=rotation%180?h:w,dh=rotation%180?w:h;
  const [x,y,bw,bh]=box.map((v,i)=>v*(i%2?dh:dw)/100);
  let result;
  if(rotation===90)result=[y,h-x-bw,bh,bw];
  else if(rotation===180)result=[w-x-bw,h-y-bh,bw,bh];
  else if(rotation===270)result=[w-y-bh,x,bh,bw];
  else result=[x,y,bw,bh];
  // Round edges together so a crop touching the image border cannot overflow.
  const [left,top,width,height]=result;
  return [round(left),round(top),round(round(left+width)-round(left)),round(round(top+height)-round(top))];
}
function cropFor(box,asset){
  const rotation=asset.rotation||0,dw=rotation%180?asset.height:asset.width,dh=rotation%180?asset.width:asset.height;
  const [x,y,w,h]=box.map((v,i)=>v*(i%2?dh:dw)/100),aspect=1.7;
  const padding=box[2]>45||box[3]>45?1.12:1.7;
  const width=Math.min(dw,Math.max(w*padding,h*padding*aspect,dw*.26,dh*.24*aspect));
  const height=Math.min(dh,Math.max(h*padding,width/aspect,dh*.24));
  return [Math.max(0,Math.min(dw-width,x+w/2-width/2))/dw*100,Math.max(0,Math.min(dh-height,y+h/2-height/2))/dh*100,width/dw*100,height/dh*100];
}
function placeholder(box,expected){return Array.isArray(box)&&box.length===4&&box.every((value,index)=>Math.abs(value-expected[index])<.02);}
function applyDefaults(doc){
  let count=0;
  for(const article of doc.articles){
    const asset=doc.assets[article.mapAsset],{width:w,height:h}=asset;
    // Only replace generated, unconfigured placeholders. Saved overrides from
    // presentation-layout.json are applied later by the existing editor.
    if(article.noDefaultHighlight!==true||!placeholder(article.box,[w*.025,h*.025,w*.95,h*.95])||!placeholder(article.crop,[0,0,w,h]))continue;
    const box=specs[article.id];
    if(!box)throw new Error('Missing reviewed article focus: '+article.id);
    article.box=nativeBounds(box,asset);
    article.crop=nativeBounds(cropFor(box,asset),asset);
    article.noDefaultHighlight=false;
    count++;
  }
  return count;
}
module.exports={applyDefaults,specs,nativeBounds,cropFor};
