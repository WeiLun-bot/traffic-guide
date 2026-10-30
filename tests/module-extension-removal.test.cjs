'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Core=require('../assets/visual-editor-core.js'),root=path.resolve(__dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
async function modules(config){const sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/',addEventListener(){}},window:{visualLayoutEditor:{store:{config}},addEventListener(){}},fetch:async url=>({ok:true,json:async()=>read(new URL(url).pathname.slice(1))})};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-modules.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();return api;}
test('removed extension settings are backward compatible, validated and persist through JSON and history',()=>{
  const config=read('layout/presentation-layout.json');delete config.removedModuleExtensions;const store=new Core.Store(config);assert.deepEqual(store.config.removedModuleExtensions,[]);
  const next=store.snapshot();next.removedModuleExtensions=['m102-route-extensions'];store.commit(next);assert(store.dirty);assert(store.undo());assert(!store.dirty);assert(store.redo());assert.deepEqual(Core.parse(store.serialize()).removedModuleExtensions,next.removedModuleExtensions);
  const before=store.serialize();for(const removedModuleExtensions of [null,{},['bad/id'],['same','same'],[3]]){assert.throws(()=>store.commit({...store.snapshot(),removedModuleExtensions}));assert.equal(store.serialize(),before);}
});
test('removing a module extension updates pages and stages, redirects old routes and restores its original content and position',async()=>{
  const config={removedModuleExtensions:[]},api=await modules(config),content=api.contents.find(doc=>doc.id==='M1-02'),source=JSON.stringify(content),flow=content.submoduleFlows[0],extension=flow.stages[2].pageId,diagram=flow.stages[1].pageId;
  const pages=Array.from(api.pages()),before=pages.length;config.removedModuleExtensions=[extension];api.syncPages(pages,config);
  assert.equal(pages.length,before-1);assert(!pages.some(page=>page.id===extension));assert.deepEqual(Array.from(api.visibleStages(flow,config),stage=>stage.id),['issues','diagram']);
  assert.equal(api.resolvePage(extension),diagram);for(const topic of flow.stages[2].topics)assert.equal(api.resolvePage(topic.sourcePageId),diagram);
  assert(!api.toc().includes('data-page="'+extension+'"'));assert.equal(JSON.stringify(content),source);
  config.removedModuleExtensions=[];api.syncPages(pages,config);assert.equal(pages.length,before);assert.equal(pages.findIndex(page=>page.id===extension),pages.findIndex(page=>page.id===diagram)+1);assert.equal(api.resolvePage(extension),extension);assert.equal(api.visibleStages(flow,config).length,3);assert.equal(JSON.stringify(content),source);
});
test('child modules remove extensions independently and preserve unrelated pages and legacy placement on restore',async()=>{
  const config={removedModuleExtensions:['m101-lanes-extensions']},api=await modules(config),content=api.contents.find(doc=>doc.id==='M1-01'),pages=Array.from(api.pages()),others=pages.filter(page=>page.id!=='m101-lanes-extensions');
  api.syncPages(pages,config);assert(pages.every((page,index)=>page===others[index]));assert(pages.some(page=>page.id==='m101-additional-extensions'));assert.equal(api.visibleStages(content.submoduleFlows[1],config).length,3);
  config.removedModuleExtensions=[];config.legacyState={pageOrder:['m101-lanes-diagram','m101-lanes-extensions','m101-additional-issues']};api.syncPages(pages,config);assert(pages.findIndex(page=>page.id==='m101-lanes-extensions')<pages.findIndex(page=>page.id==='m101-additional-issues'));
});
test('every extension can be omitted and later restored without removing other module content',async()=>{
  const config={removedModuleExtensions:[]},api=await modules(config),pages=Array.from(api.pages()),before=pages.length;
  const ids=api.contents.flatMap(doc=>doc.submoduleFlows.flatMap(flow=>flow.stages.filter(stage=>stage.id==='extensions').map(stage=>stage.pageId)));config.removedModuleExtensions=Array.from(ids);api.syncPages(pages,config);assert.equal(pages.length,before-ids.length);assert(pages.some(page=>page.id==='m201-overview'));config.removedModuleExtensions=[];api.syncPages(pages,config);assert.equal(pages.length,before);assert.equal(new Set(pages.map(page=>page.id)).size,before);
});
