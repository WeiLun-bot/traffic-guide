'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../assets/visual-editor-core.js'),Document=require('../assets/presentation-document.js'),Paths=require('../assets/road-flow-editor.js');
const route={id:'north-west',points:[[1132,-100],[1107,525],[1005,684],[818,875],[700,962],[-100,995]]};
test('editable road paths persist as independent layout geometry and reconstruct without changing content',()=>{
  const config=Core.validate(Document.empty());config.roadFlowPaths['results-road-clarity']={assetKey:'results:c1-08-layout',routes:[route]};
  config.legacyState.texts['results-road-clarity|results|title']='使用者的標題';const parts=Document.split(config),restored=Document.join(parts.layout,parts.navigation,Object.values(parts.documents));
  assert.deepEqual(parts.layout.roadFlowPaths,config.roadFlowPaths);assert.deepEqual(restored.roadFlowPaths,config.roadFlowPaths);assert.equal(restored.legacyState.texts['results-road-clarity|results|title'],'使用者的標題');
  const page={id:'results-road-clarity',images:[{key:'results:c1-08-layout'}],flowPaths:[{id:'north-west',path:'M 0 0 L 10 10',duration:17,phase:.28},{id:'south-east',path:'M 2 2 L 9 9'}]};
  const paths=Paths.pathsFor(page,restored);assert.match(paths[0].path,/^M 1132 -100 C /);assert(paths[0].path.endsWith('-100 995'));assert.equal(paths[0].duration,17);assert.equal(paths[1].path,page.flowPaths[1].path);
  assert.deepEqual(Paths.pathsFor({...page,images:[{key:'other-asset'}]},restored),page.flowPaths);
});
test('road path geometry rejects invalid, duplicate and oversized node lists',()=>{
  for(const routes of [[route,route],[{...route,points:[[0,0]]}],[{...route,points:[[0,0],[Infinity,1]]}],[{...route,points:Array.from({length:101},()=>[0,0])}]]){
    const config=Document.empty();config.roadFlowPaths={'results-road-clarity':{assetKey:'results:c1-08-layout',routes}};assert.throws(()=>Core.validate(config));
  }
  assert.throws(()=>Paths.curve([[0,0],[NaN,2]]));
});
test('route changes alone are dirty, undoable and redoable',()=>{
  const store=new Core.Store(Core.validate(Document.empty())),next=store.snapshot();next.roadFlowPaths['results-road-clarity']={assetKey:'results:c1-08-layout',routes:[route]};
  assert(store.commit(next));assert(store.dirty);assert(store.undo());assert.deepEqual(store.config.roadFlowPaths,{});assert(!store.dirty);assert(store.redo());assert.deepEqual(store.config.roadFlowPaths,next.roadFlowPaths);
});
