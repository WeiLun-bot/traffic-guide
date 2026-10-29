'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Modules=require('../assets/presentation-modules.js'),Core=require('../assets/visual-editor-core.js');
const root=path.resolve(__dirname,'..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const catalog=read('data/modules/catalog.json'),data=read('data/modules/M2-01.json');
test('module architecture has four themes, fifteen modules and twenty-seven submodules',()=>{
  Modules.validateCatalog(catalog);assert.equal(catalog.themes.length,4);assert.equal(catalog.modules.length,15);
  assert.equal(catalog.modules.flatMap(item=>item.submodules).length,27);assert.deepEqual(catalog.modules.filter(item=>item.ready).map(item=>item.id),['M2-01']);
});
test('complete M2-01 has twelve unique content pages and eight local original figures',()=>{
  Modules.validateModule(data,catalog);assert.equal(data.pages.length,12);assert.equal(Object.keys(data.assets).length,8);
  assert(data.pages.some(page=>page.id==='m201-stop-extensions'));assert(data.pages.some(page=>page.id==='m201-yield-buffer'));
  for(const asset of Object.values(data.assets)){
    const bytes=fs.readFileSync(path.join(root,asset.file));assert(bytes.length>100);
    if(asset.file.endsWith('.png')){assert.equal(bytes.readUInt32BE(16),asset.width);assert.equal(bytes.readUInt32BE(20),asset.height);}
  }
  for(const change of [next=>next.assets['stop-basic'].file='../secret.png',next=>next.pages[0].id=next.pages[1].id,next=>next.pages.find(page=>page.points.some(point=>point.focus?.rect)).points.find(point=>point.focus?.rect).focus.rect=[0,0,99999,1]]){const next=structuredClone(data);change(next);assert.throws(()=>Modules.validateModule(next,catalog));}
});
test('module point identities, headings, fonts, images and initial views survive JSON and history together',()=>{
  const store=new Core.Store(read('layout/presentation-layout.json')),next=store.snapshot();
  next.content.modules['m201-stop-layout']={points:[{id:'original-sign',title:'停車再開',titleKey:'module|sign|title',text:'設置說明',textKey:'module|sign|text'},{id:'added-note',title:'補充',titleKey:'module|note|title',text:'新增說明',textKey:'module|note|text'}]};
  const camera=Core.imageView('m201-stop-layout','module:stop-basic');next.imageViews[camera.id]={...camera,zoom:1.5,x:4,y:-5};store.commit(next);const saved=store.serialize();
  const changed=store.snapshot();changed.content.modules['m201-stop-layout'].points.reverse();store.commit(changed);assert(store.undo());assert.equal(store.serialize(),saved);assert(store.redo());assert.deepEqual(Core.parse(store.serialize()).content,store.config.content);
  const invalid=store.snapshot();invalid.content.modules['m201-stop-layout'].points[0].titleKey='';assert.throws(()=>store.commit(invalid));
});
test('submodule flows expose three stages, preserve legacy routes, and reject foreign references',async()=>{
  const sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/',addEventListener(){}},fetch:async url=>({ok:true,json:async()=>structuredClone(String(url).endsWith('catalog.json')?catalog:data)})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-modules.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();assert.equal(api.error,'');
  const pages=Array.from(api.pages()),ids=new Set(pages.map(page=>page.id));assert.equal(ids.size,pages.length);assert(pages.every(page=>/^[\w-]+$/.test(page.id)));
  assert.equal(pages.filter(page=>page.submoduleId==='M2-01.1').length,3);assert.equal(pages.filter(page=>page.submoduleId==='M2-01.2').length,3);
  for(const page of data.pages)assert(ids.has(api.resolvePage(page.id)));
  assert.equal(api.resolvePage('m201-stop-crosswalk'),'m201-stop-extensions');assert.equal(api.displayContext('m201-stop-extensions').topic.id,'crosswalk');
  assert.equal(api.resolvePage('m201-yield-buffer'),'m201-yield-extensions');assert.equal(api.displayContext('m201-yield-extensions').topic.id,'buffer');
  api.resolvePage('m201-stop-layout','topic-line');assert.equal(api.displayContext('m201-stop-layout').topic.id,'line');
  assert.equal(api.resolvePage('edge'),'edge');
  assert.equal(data.pages.filter(page=>page.submoduleId==='M2-01.1').length,5);assert.equal(data.pages.filter(page=>page.submoduleId==='M2-01.2').length,5);
  assert.equal(pages.find(page=>page.id==='module-M2-02').submoduleId,'M2-02.1');assert(ids.has('submodule-M2-04-3'));
  const invalid=structuredClone(data);invalid.pages[0].submoduleId='M2-02.1';assert.throws(()=>Modules.validateModule(invalid,catalog));
  const badCatalog=structuredClone(catalog);badCatalog.modules[0].submodules[0].id='M1-01.bad/path';assert.throws(()=>Modules.validateCatalog(badCatalog));
  for(const change of [next=>next.submoduleFlows[0].stages.reverse(),next=>next.submoduleFlows[0].stages[1].topics[0].sourcePageId='m201-yield-layout',next=>next.submoduleFlows[0].stages[1].topics[0].pointIds=['unknown'],next=>next.submoduleFlows[0].stages[2].topics[0].assets=['yield-basic']]){const invalid=structuredClone(data);change(invalid);assert.throws(()=>Modules.validateModule(invalid,catalog));}
  for(const flow of data.submoduleFlows)for(const stage of flow.stages.filter(stage=>stage.topics)){
    const assigned=stage.topics.flatMap(topic=>(topic.pointIds||data.pages.find(page=>page.id===topic.sourcePageId).points.map(point=>point.id)).map(id=>topic.sourcePageId+':'+id));
    const expected=[...new Set(stage.topics.map(topic=>topic.sourcePageId))].flatMap(id=>data.pages.find(page=>page.id===id).points.map(point=>id+':'+point.id));assert.deepEqual([...assigned].sort(),expected.sort());
  }
  const store=new Core.Store(read('layout/presentation-layout.json')),next=store.snapshot();next.content.modules['m201-stop-layout']={points:[{id:'note',title:'新增說明',titleKey:'module|note|title',text:'只屬於停止線',textKey:'module|note|text',topicId:'line'}]};store.commit(next);assert.equal(Core.parse(store.serialize()).content.modules['m201-stop-layout'].points[0].topicId,'line');next.content.modules['m201-stop-layout'].points[0].topicId='../bad';assert.throws(()=>store.commit(next));
});
