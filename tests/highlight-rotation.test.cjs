'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Core=require('../assets/visual-editor-core.js');
const original=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../layout/presentation-layout.json'),'utf8'));
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const inside=(box,w,h)=>{assert(box[0]>=-1e-6&&box[1]>=-1e-6&&box[0]+box[2]<=w+1e-6&&box[1]+box[3]<=h+1e-6,JSON.stringify(box));};
test('highlight rotations keep legacy JSON intact and persist independently through history and reload',()=>{
  const config=original(),store=new Core.Store(config);
  assert.deepEqual(store.config.legacyState.highlights,config.legacyState.highlights);
  const next=store.snapshot();next.legacyState.highlights['article:rotation-test']={box:[20,30,100,40],crop:[0,0,300,200],rotation:37};
  next.legacyState.highlights['module:rotation-test']={box:[10,10,80,60],rotation:-22,deleted:true};store.commit(next);
  const loaded=Core.parse(store.serialize());assert.equal(loaded.legacyState.highlights['article:rotation-test'].rotation,37);
  assert.equal(loaded.legacyState.highlights['module:rotation-test'].rotation,-22);
  store.undo();assert.deepEqual(store.config.legacyState.highlights,config.legacyState.highlights);store.redo();assert.equal(store.config.legacyState.highlights['article:rotation-test'].rotation,37);
  for(const rotation of [NaN,Infinity,361,-361,'30',null]){const invalid=store.snapshot();invalid.legacyState.highlights['article:rotation-test'].rotation=rotation;assert.throws(()=>store.commit(invalid));}
  assert.equal(Core.highlightAngle(360),0);assert.equal(Core.highlightAngle(270),-90);assert.equal(Core.highlightAngle(-370),-10);
});
test('rotated envelopes, mask vertices and fitting contain every corner at all angles and image edges',()=>{
  const box=[100,80,120,40];assert.deepEqual(Core.highlightBounds(box,0),box);
  const bounds=Core.highlightBounds(box,90);near(bounds[0],140);near(bounds[1],40);near(bounds[2],40);near(bounds[3],120);
  assert.equal(Core.highlightTransform(box,37),'rotate(37 160 100)');
  for(let angle=-180;angle<=180;angle+=3)for(const box of [[0,0,290,40],[240,170,60,30],[100,70,100,50]]){
    const fitted=Core.fitHighlight(box,angle,300,200),envelope=Core.highlightBounds(fitted,angle);
    inside(fitted,300,200);inside(envelope,300,200);
    for(const [x,y]of Core.highlightCorners(fitted,angle)){assert(x>=-1e-6&&x<=300+1e-6&&y>=-1e-6&&y<=200+1e-6);}
    const again=Core.fitHighlight(fitted,angle,300,200);again.forEach((n,i)=>near(n,fitted[i]));
  }
});
test('rotated resizing preserves the opposite corner and stops at image boundaries',()=>{
  const start=[100,80,120,60],indices={nw:2,ne:3,se:0,sw:1};
  for(const angle of [-143,-45,0,37,90,179])for(const corner of Object.keys(indices))for(const [dx,dy]of [[15,9],[-10,15],[1000,-1000]]){
    const box=Core.resizeHighlight(start,angle,corner,dx,dy,400,300);
    inside(box,400,300);inside(Core.highlightBounds(box,angle),400,300);
    const a=Core.highlightCorners(start,angle)[indices[corner]],b=Core.highlightCorners(box,angle)[indices[corner]];
    near(a[0],b[0]);near(a[1],b[1]);assert(box[2]>=4-1e-6&&box[3]>=4-1e-6);
  }
});
