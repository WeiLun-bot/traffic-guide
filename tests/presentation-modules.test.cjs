'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Modules=require('../assets/presentation-modules.js'),Core=require('../assets/visual-editor-core.js');
const root=path.resolve(__dirname,'..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const catalog=read('data/modules/catalog.json'),data=read('data/modules/M2-01.json');
test('module architecture has four themes, fifteen modules and twenty-seven submodules',()=>{
  Modules.validateCatalog(catalog);assert.equal(catalog.themes.length,4);assert.equal(catalog.modules.length,15);
  assert.equal(catalog.modules.flatMap(item=>item.submodules).length,27);assert.equal(catalog.modules.filter(item=>item.ready).length,15);
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
  const sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/',addEventListener(){}},fetch:async url=>({ok:true,json:async()=>read(new URL(url).pathname.slice(1))})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-modules.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();assert.equal(api.error,'');
  const pages=Array.from(api.pages()),ids=new Set(pages.map(page=>page.id));assert.equal(ids.size,pages.length);assert(pages.every(page=>/^[\w-]+$/.test(page.id)));
  assert.equal(pages.filter(page=>page.submoduleId==='M2-01.1').length,3);assert.equal(pages.filter(page=>page.submoduleId==='M2-01.2').length,3);
  for(const page of data.pages)assert(ids.has(api.resolvePage(page.id)));
  assert.equal(api.resolvePage('m201-stop-crosswalk'),'m201-stop-extensions');assert.equal(api.displayContext('m201-stop-extensions').topic.id,'crosswalk');
  assert.equal(api.resolvePage('m201-yield-buffer'),'m201-yield-extensions');assert.equal(api.displayContext('m201-yield-extensions').topic.id,'buffer');
  api.resolvePage('m201-stop-layout','topic-line');assert.equal(api.displayContext('m201-stop-layout').topic.id,'line');
  assert.equal(api.resolvePage('edge'),'edge');
  assert.equal(data.pages.filter(page=>page.submoduleId==='M2-01.1').length,5);assert.equal(data.pages.filter(page=>page.submoduleId==='M2-01.2').length,5);
  assert.equal(pages.find(page=>page.id==='m202-roundabout-issues').submoduleId,'M2-02.1');assert.equal(api.resolvePage('submodule-M2-04-3'),'m204-oneway-issues');
  const invalid=structuredClone(data);invalid.pages[0].submoduleId='M2-02.1';assert.throws(()=>Modules.validateModule(invalid,catalog));
  const badCatalog=structuredClone(catalog);badCatalog.modules[0].submodules[0].id='M1-01.bad/path';assert.throws(()=>Modules.validateCatalog(badCatalog));
  for(const change of [next=>next.submoduleFlows[0].stages.reverse(),next=>next.submoduleFlows[0].stages[1].topics[0].sourcePageId='m201-yield-layout',next=>next.submoduleFlows[0].stages[1].topics[0].pointIds=['unknown'],next=>next.submoduleFlows[0].stages[2].topics[0].assets=['yield-basic']]){const invalid=structuredClone(data);change(invalid);assert.throws(()=>Modules.validateModule(invalid,catalog));}
  for(const flow of data.submoduleFlows)for(const stage of flow.stages.filter(stage=>stage.topics)){
    const assigned=stage.topics.flatMap(topic=>(topic.pointIds||data.pages.find(page=>page.id===topic.sourcePageId).points.map(point=>point.id)).map(id=>topic.sourcePageId+':'+id));
    const expected=[...new Set(stage.topics.map(topic=>topic.sourcePageId))].flatMap(id=>data.pages.find(page=>page.id===id).points.map(point=>id+':'+point.id));assert.deepEqual([...assigned].sort(),expected.sort());
  }
  const store=new Core.Store(read('layout/presentation-layout.json')),next=store.snapshot();next.content.modules['m201-stop-layout']={points:[{id:'note',title:'新增說明',titleKey:'module|note|title',text:'只屬於停止線',textKey:'module|note|text',topicId:'line'}]};store.commit(next);assert.equal(Core.parse(store.serialize()).content.modules['m201-stop-layout'].points[0].topicId,'line');next.content.modules['m201-stop-layout'].points[0].topicId='../bad';assert.throws(()=>store.commit(next));
});

test('overview groups preserve child ownership while supporting shared diagrams and merged headings',async()=>{
  const sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/',addEventListener(){}},fetch:async url=>({ok:true,json:async()=>read(new URL(url).pathname.slice(1))})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-modules.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();
  for(const doc of api.contents){
    const entry=catalog.modules.find(entry=>entry.id===doc.id),first=doc.pages[0],groups=api.overviewGroups(first);
    assert.equal(groups.length,!first.submoduleId&&entry.submodules.length>1?entry.submodules.filter(sub=>!first.overviewGroups?.[sub.id]?.hidden).length:0);
    for(const group of groups){const source=doc.pages.find(page=>page.id===group.sourcePageId),options=first.overviewGroups?.[group.id]||{},owner=options.sourceModuleId?api.contents.find(doc=>doc.id===options.sourceModuleId):doc;assert.equal(source.submoduleId,group.id);assert.deepEqual(Array.from(group.assets),Array.from(options.assets||source.assets));assert(group.assets.every(id=>Object.hasOwn(owner.assets,id)));assert.equal(group.key,first.id+'/'+group.id);}
    for(const page of doc.pages.slice(1))assert.equal(api.overviewGroups(page).length,0,'Only the module overview groups children: '+page.id);
  }
  const groups=id=>JSON.parse(JSON.stringify(api.overviewGroups(api.contents.find(doc=>doc.id===id).pages[0])));
  assert.deepEqual(groups('M1-01').map(group=>group.assets),[['m101-lanes'],['m101-additional']]);
  assert.deepEqual(groups('M4-01').map(group=>group.assets.length),[2,1]);
  assert.deepEqual(groups('M2-04').map(group=>group.assets.length),[2,2,1]);
  assert.deepEqual(groups('M3-03').map(group=>group.assets),[['m101-slow-wide','m101-slow-narrow'],['m303-eb74f285de','m303-6861b608fc','m303-a5220c3ae3']]);
  assert.equal(groups('M3-02').length,1);assert.equal(groups('M3-02')[0].label,'M3-02.1 自行車道、M3-02.2 自行車穿越道');
  const motor=read('data/modules/M3-03.json');
  for(const change of [doc=>doc.pages[0].overviewGroups['M3-03.1'].sourceModuleId='M9-99',doc=>doc.pages[0].overviewGroups['M3-03.1'].assets=['../bad'],doc=>doc.pages[0].overviewGroups['M3-03.1'].hidden='yes',doc=>doc.pages[0].overviewGroups['M3-03.1'].label='']){const invalid=structuredClone(motor);change(invalid);assert.throws(()=>Modules.validateModule(invalid,catalog));}
});

test('overview explanations contain numbered children and omit removed legacy rows without changing saved edits or child detail pages',async()=>{
  const sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/',addEventListener(){}},fetch:async url=>({ok:true,json:async()=>read(new URL(url).pathname.slice(1))})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-modules.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();
  for(const doc of api.contents){const page=doc.pages[0];if(!api.overviewGroups(page).length)continue;const entry=catalog.modules.find(entry=>entry.id===doc.id),points=api.overviewPoints(page);assert.deepEqual(Array.from(points,point=>point.submoduleId),entry.submodules.map(sub=>sub.id));for(const point of points)assert(point.title.startsWith(point.submoduleId+' '));}
  const doc=api.contents.find(doc=>doc.id==='M1-01'),page=doc.pages[0],saved=[{id:'continuity',title:'先確認車道連續性',text:'舊設定中的原始列點'},{id:'layout',title:'自訂車道配置說明',text:'保留修改內容',titleKey:'same-title-key'},...Array.from(page.points).filter(point=>point.id!=='layout'),{id:'user-note',title:'自行新增的補充',text:'使用者內容'}],before=JSON.stringify(saved);
  const visible=api.overviewPoints(page,saved);assert.equal(JSON.stringify(saved),before);assert(!visible.some(point=>point.id==='continuity'));assert.equal(visible.find(point=>point.id==='layout').title,'M1-01.1 自訂車道配置說明');assert.equal(visible.find(point=>point.id==='layout').titleKey,'same-title-key');assert.equal(visible.find(point=>point.id==='user-note').text,'使用者內容');
  assert.equal(JSON.stringify(api.overviewPoints(page,visible)),JSON.stringify(visible));
  const detail=doc.pages.find(page=>page.id==='m101-lanes-issues');assert(detail.points.some(point=>point.id==='continuity'));assert.equal(JSON.stringify(api.overviewPoints(detail)),JSON.stringify(detail.points));
  const stop=api.contents.find(doc=>doc.id==='M2-01').pages[0];assert.deepEqual(Array.from(api.overviewPoints(stop,[{id:'purpose',title:'建立主次路權'},{id:'read',title:'配置重點'},...stop.points]),point=>point.id),['stop','yield']);
});

test('module highlights preserve legacy identities and support deletion, manual boxes and independent representative views',async()=>{
  const sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/',addEventListener(){}},fetch:async url=>({ok:true,json:async()=>read(new URL(url).pathname.slice(1))})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-modules.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();
  const doc=api.contents.find(doc=>doc.id==='M1-01'),page=doc.pages.find(page=>page.id==='m101-lanes-diagram'),point=page.points[0];
  const initial=api.highlightSpec(page,point,'m101-lanes');assert.equal(initial.key,'module:m101-lanes-diagram:dotted-width');assert(initial.enabled);assert(initial.hasBox);initial.box[0]+=50;assert.notEqual(initial.box[0],point.focus.rect[0]);
  const deleted={highlights:{[initial.key]:{deleted:true}},disabledHighlights:{[initial.key]:true}};assert.equal(api.highlightSpec(page,point,'m101-lanes',deleted).enabled,false);assert(api.highlightSpec(page,point,'m101-lanes',deleted).hasBox);
  const replaced={images:{'module:m101-lanes':{src:'replacement'}}};assert.equal(api.highlightSpec(page,point,'m101-lanes',replaced).enabled,false);
  const custom={id:'user-note',title:'新說明'},first=api.highlightSpec(page,custom,'m101-lanes'),second=api.highlightSpec(page,custom,'m101-taper');assert(!first.hasBox);assert.notEqual(first.key,second.key);
  const saved={highlights:{[first.key]:{box:[10,15,120,80],imageKey:'module:m101-lanes'}}};assert(api.highlightSpec(page,custom,'m101-lanes',saved).enabled);assert(!api.highlightSpec(page,custom,'m101-taper',saved).hasBox);
  const stop=api.contents.find(doc=>doc.id==='M2-01').pages.find(page=>page.id==='m201-stop-layout'),sign=stop.points.find(point=>point.focus?.rect);assert.equal(api.highlightSpec(stop,sign,sign.focus.asset).key,'module:'+stop.id+':'+sign.id);
});

test('all source subsections have content or explicit referrals, with only active Typst figures and preserved orientations',async()=>{
  const docs=catalog.modules.map(entry=>read('data/modules/'+entry.id+'.json'));
  assert.equal(docs.reduce((n,doc)=>n+(doc.submoduleFlows?.length||0),0),25);
  assert.equal(docs.flatMap(doc=>doc.pages).filter(page=>page.links).length,2);
  for(const entry of catalog.modules){const doc=docs.find(doc=>doc.id===entry.id);for(const sub of entry.submodules)assert(doc.pages.some(page=>page.submoduleId===sub.id),sub.id+' has no content');}
  const added=docs.filter(doc=>doc.source.imageFiles);assert.equal(added.length,10);assert.equal(added.reduce((n,doc)=>n+Object.keys(doc.assets).length,0),79);
  for(const doc of added){assert.deepEqual(Object.values(doc.assets).map(asset=>asset.file).sort(),[...doc.source.imageFiles].sort());const used=new Set(doc.pages.flatMap(page=>page.assets));for(const id of Object.keys(doc.assets))assert(used.has(id),'Unused declared image: '+id);}
  const sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/',addEventListener(){}},fetch:async url=>({ok:true,json:async()=>read(new URL(url).pathname.slice(1))})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-modules.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();const data={embeddedAssets:{},assetMeta:{}};api.prepare(data);
  const page=api.pages().find(page=>page.id==='m304-lane-diagram');api.connect({page,data});const source=docs.find(doc=>doc.id==='M3-04'),asset=Object.values(source.assets).find(asset=>asset.file.includes('公車專用道進出端'));
  const rendered=api.render(page);assert(rendered.includes('viewBox="0 0 '+asset.height+' '+asset.width+'"'));assert(rendered.includes('rotate(90)'));
  const referral=api.pages().find(page=>page.id==='m302-crossing-reference');api.connect({page:referral,data});assert.match(api.render(referral),/data-module-route="m302-lane-diagram\/topic-crossing"/);assert(!api.render(referral).includes('module-applications'));
  const invalid=structuredClone(source);Object.values(invalid.assets)[0].rotation=45;assert.throws(()=>Modules.validateModule(invalid,catalog));
});

test('new modules retain complete topic coverage, globally unique assets, old entry aliases and isolated load failures',async()=>{
  const assets=new Set(),pageIds=new Set();
  for(const entry of catalog.modules.filter(entry=>entry.ready)){
    const content=read('data/modules/'+entry.id+'.json');Modules.validateModule(content,catalog);
    for(const [id,asset]of Object.entries(content.assets)){assert(!assets.has(id));assets.add(id);assert(fs.existsSync(path.join(root,asset.file)));}
    for(const page of content.pages){assert(!pageIds.has(page.id));pageIds.add(page.id);}
    for(const flow of content.submoduleFlows)for(const stage of flow.stages.filter(stage=>stage.topics)){
      const assigned=stage.topics.flatMap(topic=>(topic.pointIds||content.pages.find(page=>page.id===topic.sourcePageId).points.map(point=>point.id)).map(id=>topic.sourcePageId+':'+id));
      const expected=[...new Set(stage.topics.map(topic=>topic.sourcePageId))].flatMap(id=>content.pages.find(page=>page.id===id).points.map(point=>id+':'+point.id));assert.deepEqual([...assigned].sort(),expected.sort(),entry.id+' / '+stage.id);
    }
  }
  const sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/',addEventListener(){}},fetch:async url=>({ok:!String(url).endsWith('M1-03.json'),status:404,json:async()=>read(new URL(url).pathname.slice(1))})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-modules.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();
  assert.equal(api.moduleErrors['M1-03'],'HTTP 404');assert(api.pages().some(page=>page.id==='m201-stop-layout'));assert(api.pages().some(page=>page.id==='m202-roundabout-issues'));
  assert.equal(api.resolvePage('m103-parking-diagram'),'module-M1-03');
  assert.equal(api.resolvePage('module-M1-01'),'m101-overview');assert.equal(api.resolvePage('submodule-M1-01-2'),'m101-additional-issues');assert.equal(api.resolvePage('module-M1-02'),'m102-route-issues');
  api.resolvePage('m102-route-diagram','topic-single');api.resolvePage('m201-stop-layout','topic-line');assert.equal(api.displayContext('m102-route-diagram').topic.id,'single');assert.equal(api.displayContext('m201-stop-layout').topic.id,'line');
});
