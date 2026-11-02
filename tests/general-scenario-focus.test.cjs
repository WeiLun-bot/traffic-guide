'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Focus=require('../tools/general-scenario-focus.cjs'),Scenarios=require('../assets/presentation-scenarios.js');
const catalog=require('../data/scenarios/catalog.json');
const docs=catalog.details.map(file=>require('../'+file));
const inside=(box,crop)=>box[0]>=crop[0]-.02&&box[1]>=crop[1]-.02&&box[0]+box[2]<=crop[0]+crop[2]+.02&&box[1]+box[3]<=crop[1]+crop[3]+.02;
test('all 105 external explanations have reviewed visible focus boxes and contained zoom crops',()=>{
  const ids=docs.flatMap(doc=>doc.articles.map(a=>a.id));
  assert.equal(ids.length,105);assert.deepEqual(new Set(Object.keys(Focus.specs)),new Set(ids));
  for(const doc of docs){Scenarios.validateDetail(doc,catalog);for(const a of doc.articles){
    const asset=doc.assets[a.mapAsset];assert.equal(a.noDefaultHighlight,false,a.id);
    assert.deepEqual(a.box,Focus.nativeBounds(Focus.specs[a.id],asset),a.id);
    assert.deepEqual(a.crop,Focus.nativeBounds(Focus.cropFor(Focus.specs[a.id],asset),asset),a.id);
    assert(inside(a.box,a.crop),'Crop must contain the entire highlight: '+a.id);
    assert(a.box[2]*a.box[3]<asset.width*asset.height*.4,'Do not use a whole-image placeholder: '+a.id);
    assert(a.crop[2]*a.crop[3]<asset.width*asset.height*.99,'A zoom view must differ from the full drawing: '+a.id);
  }}
});
test('percentage focus boxes round-trip through all image quarter-turns',()=>{
  for(const rotation of [0,90,180,270]){
    const asset={width:400,height:800,rotation},box=[20,30,10,15],native=Focus.nativeBounds(box,asset);
    const displayed=Scenarios.bounds(native,asset),size=rotation%180?[800,400]:[400,800];
    assert.deepEqual(displayed,box.map((v,i)=>v*size[i%2]/100));
  }
});
test('importing fills placeholders once and preserves configured boxes and crops',()=>{
  const doc=structuredClone(docs[0]),asset=doc.assets[doc.articles[0].mapAsset],a=doc.articles[0];
  const configured=structuredClone(doc.articles.slice(1));
  a.box=[asset.width*.025,asset.height*.025,asset.width*.95,asset.height*.95];a.crop=[0,0,asset.width,asset.height];a.noDefaultHighlight=true;
  assert.equal(Focus.applyDefaults(doc),1);assert.deepEqual(doc.articles.slice(1),configured);
  const once=structuredClone(doc);assert.equal(Focus.applyDefaults(doc),0);assert.deepEqual(doc,once);
  a.noDefaultHighlight=true;a.box=[10,10,20,20];a.crop=[0,0,100,100];
  const custom=structuredClone(a);assert.equal(Focus.applyDefaults(doc),0);assert.deepEqual(a,custom);
});
