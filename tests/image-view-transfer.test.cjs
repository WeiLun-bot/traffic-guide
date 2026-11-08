'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../assets/visual-editor-core.js'),Document=require('../assets/presentation-document.js');
const near=(a,b)=>a.forEach((n,i)=>assert(Math.abs(n-b[i])<1e-8,JSON.stringify({a,b})));
test('capturing a crop with a different aspect ratio preserves every viewBox coordinate',()=>{
  for(const rotation of [0,37,90,-90]){
    const home=[0,0,913,1402],view=[123.456789,235.987654,251.375,83.125];
    const value=Core.settingsForView(home,view,rotation);
    assert(value.aspect);near(Core.viewBoxFor(home,value),view);
    near(Core.viewBoxFor(home,Core.parseCameraParameters(Core.cameraParameters(value))),view);
  }
});
test('aspect-only cameras and independent summary ordering persist through project split/join',()=>{
  const config=require('./read-project-config.cjs')(),view={...Core.imageView('edge-zoom','overall'),aspect:.75};
  config.imageViews[view.id]=view;config.navigationOrders['review:review']=['row-2','row-0','row-1'];
  const signature=Core.signature(config),split=Document.split(config),restored=Document.join(split.layout,split.navigation,Object.values(split.documents));
  assert.deepEqual(restored.imageViews[view.id],view);assert.deepEqual(restored.navigationOrders['review:review'],['row-2','row-0','row-1']);
  config.imageViews[view.id].aspect=.8;assert.notEqual(Core.signature(config),signature);
  assert.throws(()=>Core.validate({...config,imageViews:{[view.id]:{...view,aspect:0}}}));
});
test('camera parameters preserve precision and omit source identities; invalid values cannot be applied',()=>{
  const source={...Core.imageView('edge-zoom','overall'),zoom:1.234567891234,x:3.456789123,y:-2.987654321,rotation:37.5,fit:'width',flipX:true,aspect:.78123456789};
  const text=Core.cameraParameters(source),parsed=Core.parseCameraParameters(text);
  assert(!text.includes('edge')&&!text.includes('overall'));for(const key of ['zoom','x','y','rotation','fit','flipX','aspect'])assert.equal(parsed[key],source[key]);
  for(const bad of [{zoom:-1},{x:'5'},{rotation:999},{fit:'stretch'},{flipX:1},{aspect:-.1}])assert.throws(()=>Core.parseCameraParameters(JSON.stringify({kind:'traffic-camera',version:1,view:{...source,...bad}})));
  assert.throws(()=>Core.parseCameraParameters('{broken'));assert.throws(()=>Core.parseCameraParameters(Core.focusParameters([1,2,30,40],100,100,'crop')));
});
test('focus parameters scale by destination image dimensions and keep box/crop kinds separate',()=>{
  const bounds=[12.3456789,23.4567891,34.5678912,45.6789123];
  const text=Core.focusParameters(bounds,100,200,'box',-17.25),same=Core.parseFocusParameters(text,100,200),scaled=Core.parseFocusParameters(text,200,400);
  near(same.bounds,bounds);near(scaled.bounds,bounds.map(n=>n*2));assert.equal(same.rotation,-17.25);assert.equal(same.target,'box');
  assert.equal(Core.parseFocusParameters(Core.focusParameters(bounds,100,200,'crop'),100,200).target,'crop');
  assert.throws(()=>Core.parseFocusParameters(JSON.stringify({kind:'traffic-focus',version:1,target:'crop',bounds:[.9,0,.5,.5]}),100,100));
  assert.throws(()=>Core.parseFocusParameters(Core.cameraParameters(Core.imageView('edge','overall')),100,100));
});
test('local project saving retains aspect-only views and review order without changing highlight ranges',t=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Project=require('../tools/presentation-project-store.cjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'traffic-view-transfer-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const config=require('./read-project-config.cjs')();Project.transaction(root,Project.plan(config,{}),{backup:false});
  const current=Project.read(root),next=Core.clone(current.config),view={...Core.imageView('edge-zoom','overall'),aspect:.8123456789};
  next.imageViews[view.id]=view;next.navigationOrders['review:review']=['row-2','row-0','row-1'];
  Project.save({root,config:next,expectedRevision:current.revision,backup:false});const saved=Project.read(root).config;
  assert.deepEqual(saved.imageViews[view.id],view);assert.deepEqual(saved.navigationOrders['review:review'],next.navigationOrders['review:review']);assert.deepEqual(saved.legacyState.highlights,current.config.legacyState.highlights);
});
