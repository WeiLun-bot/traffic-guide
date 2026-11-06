'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Modules=require('../assets/presentation-modules.js'),Core=require('../assets/visual-editor-core.js');
const root=path.resolve(__dirname,'..'),read=file=>file==='layout/presentation-layout.json'?require('./read-project-config.cjs')():JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const catalog=read('data/modules/catalog.json'),data=read('data/modules/M2-01.json');
test('module architecture has four themes, fifteen modules and twenty-seven submodules',()=>{
  Modules.validateCatalog(catalog);assert.equal(catalog.themes.length,4);assert.equal(catalog.modules.length,15);
  assert.equal(catalog.modules.flatMap(item=>item.submodules).length,27);assert.equal(catalog.modules.filter(item=>item.ready).length,15);
});

test('module formation keeps ten ordered stages with eight native drawings, independent shared-image focus and isolated load failures',async()=>{
  const formation=read('data/modules/formation.json');Modules.validateFormation(formation,catalog);
  assert.equal(formation.stages.length,10);assert.deepEqual(formation.stages.map(stage=>stage.moduleId||null),[null,'M1-01','M1-02','M1-03','M2-03','M2-04','M3-01','M3-02','M3-03','M4-01']);
  for(const [index,stage]of formation.stages.entries()){
    const asset=formation.assets[stage.asset];assert.equal(asset.file,'materials/03-modules/00/'+[1,2,3,4,5,6,7,7,7,8][index]+'.svg');
    const size=require('../tools/svg-native-size.cjs')(fs.readFileSync(path.join(root,asset.file),'utf8'));assert.deepEqual([asset.width,asset.height],size);
  }
  assert.equal(Object.keys(formation.assets).length,8);assert.deepEqual(formation.stages.filter(stage=>stage.startView==='focus').map(stage=>stage.moduleId),['M3-02','M3-03']);assert.notDeepEqual(formation.stages[7].focus.crop,formation.stages[8].focus.crop);
  for(const mutate of [doc=>doc.stages[0].moduleId='M1-01',doc=>doc.stages[1].moduleId='missing',doc=>doc.stages[2].asset='missing',doc=>doc.stages[1].id=doc.stages[0].id,doc=>doc.assets['formation-base'].file='../private.svg',doc=>doc.assets['formation-base'].rotation=45,doc=>doc.stages[7].startView='other',doc=>delete doc.stages[7].focus,doc=>doc.stages[7].focus.rect=[0,0,99999,1],doc=>doc.stages[7].focus.crop=[0,0,1,1]]){const invalid=structuredClone(formation);mutate(invalid);assert.throws(()=>Modules.validateFormation(invalid,catalog));}
  const sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/',addEventListener(){}},fetch:async url=>({ok:true,json:async()=>read(new URL(url).pathname.slice(1))})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-modules.js'),'utf8'),sandbox);let api=sandbox.module.exports;await api.load();
  const pages=Array.from(api.pages());assert.deepEqual(pages.slice(0,3).map(page=>page.id),['modules-structure','modules-index','modules-formation']);assert.equal(pages[2].stepCount,10);
  const data={embeddedAssets:{},assetMeta:{}};api.prepare(data);for(const stage of formation.stages)assert.equal(data.embeddedAssets['module:'+stage.asset].url,formation.assets[stage.asset].file);
  for(const [index,stage]of formation.stages.entries()){
    const empty=api.formationHighlightSpec(index);assert.equal(empty.key,'module:modules-formation:'+stage.id);assert.equal(empty.enabled,Boolean(stage.focus));assert.equal(empty.hasBox,Boolean(stage.focus));
    const box=[1000,800,700,350],crop=[800,600,1100,750],saved={highlights:{[empty.key]:{box,crop,rotation:27,imageKey:empty.imageKey}}};
    const spec=api.formationHighlightSpec(index,saved);assert(spec.enabled);assert.deepEqual(Array.from(spec.box),box);assert.deepEqual(Array.from(spec.crop),crop);assert.equal(spec.rotation,27);
    const other=(index+1)%formation.stages.length;assert.deepEqual(api.formationHighlightSpec(other,saved).box,api.formationHighlightSpec(other).box);
    saved.highlights[empty.key].deleted=true;assert.equal(api.formationHighlightSpec(index,saved).enabled,false);assert.equal(api.formationHighlightSpec(index,saved).hasBox,true);
    delete saved.highlights[empty.key].deleted;saved.disabledHighlights={[empty.key]:true};assert.equal(api.formationHighlightSpec(index,saved).enabled,false);
  }
  assert.equal(api.formationHighlightSpec(99),null);
  sandbox.fetch=async url=>new URL(url).pathname.endsWith('/formation.json')?{ok:false,status:404}:{ok:true,json:async()=>read(new URL(url).pathname.slice(1))};
  await api.load();assert(api.pages().some(page=>page.id==='m101-overview'));assert.equal(api.pages().find(page=>page.id==='modules-formation').stepCount,1);assert.match(api.render(api.pages().find(page=>page.id==='modules-formation')),/模組形成示範尚未載入/);
});

test('directory representatives cover every module and retain shared/merged diagrams without issue photos or close-up sign details',async()=>{
  const sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/',addEventListener(){}},fetch:async url=>({ok:true,json:async()=>read(new URL(url).pathname.slice(1))})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-modules.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();
  const all=new Map(api.contents.flatMap(doc=>Object.entries(doc.assets)));
  for(const entry of catalog.modules){
    const ids=Array.from(api.directoryAssets(entry.id));assert(ids.length>0,entry.id+' has no representative');assert.equal(new Set(ids).size,ids.length);
    for(const id of ids){assert(all.has(id));assert(!/現況|附牌配置|箭頭起始端示例|車道數示例/.test(all.get(id).label),entry.id+': '+all.get(id).label);}
  }
  assert.deepEqual(Array.from(api.directoryAssets('M1-02')),['m102-offset','m102-roundabout']);
  assert.deepEqual(Array.from(api.directoryAssets('M1-03')),['m103-layout']);
  assert.deepEqual(Array.from(api.directoryAssets('M2-03')),['m203-2f27e58a6a']);
  assert.equal(api.directoryAssets('M2-04').length,5);
  assert.deepEqual(Array.from(api.directoryAssets('M3-02')),['m302-b172c5ac34']);
  assert(api.directoryAssets('M3-03').includes('m101-slow-wide'));assert(api.directoryAssets('M3-03').includes('m101-slow-narrow'));
  assert.deepEqual(Array.from(api.directoryAssets('missing')),[]);
  for(const directoryAssets of [[],['missing'],['m102-offset','m102-offset']]){const invalid=read('data/modules/M1-02.json');invalid.directoryAssets=directoryAssets;assert.throws(()=>Modules.validateModule(invalid,catalog));}
});
test('complete M2-01 has twelve unique content pages, eight original figures and four issue photos',()=>{
  Modules.validateModule(data,catalog);assert.equal(data.pages.length,12);assert.equal(Object.keys(data.assets).length,12);
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

test('empty concept drafts remain valid and editable while ordinary topics still require content',()=>{
  const doc=read('data/modules/M1-02.json'),flow=doc.submoduleFlows[0],stage=flow.stages.find(item=>item.id==='diagram');
  const draft=stage.topics[0],assigned=new Set(draft.pointIds),source=doc.pages.find(page=>page.id===draft.sourcePageId);
  source.points=source.points.filter(point=>!assigned.has(point.id));draft.pointIds=[];draft.facilities=[];
  Modules.validateModule(doc,catalog);
  assert.deepEqual(draft.facilities,[]);
  for(const change of [
    next=>{delete next.submoduleFlows[0].stages[1].topics[0].facilities;},
    next=>{next.submoduleFlows[0].stages[1].topics[0].facilities={};},
    next=>{next.submoduleFlows[0].stages[1].topics[0].pointIds=['missing'];},
    next=>{const topic=next.submoduleFlows[0].stages[2].topics[0];topic.pointIds=[];topic.facilities=[];}
  ]){const invalid=structuredClone(doc);change(invalid);assert.throws(()=>Modules.validateModule(invalid,catalog));}
});

test('concept item categories distinguish control facilities from design elements and survive saved content',()=>{
  for(const file of ['M1-01','M1-02']){
    const doc=read('data/modules/'+file+'.json');Modules.validateModule(doc,catalog);
    for(const flow of doc.submoduleFlows)for(const stage of flow.stages)for(const topic of stage.topics||[]){
      for(const facility of topic.facilities||[])assert(['control','design'].includes(facility.kind));
    }
  }
  const doc=read('data/modules/M1-01.json'),topic=doc.submoduleFlows[0].stages.find(stage=>stage.id==='diagram').topics.find(topic=>topic.id==='trajectory');
  assert.deepEqual(topic.facilities.map(item=>[item.id,item.kind]),[['guides','control'],['channel','control'],['curb','design'],['island','design']]);
  const facility=topic.facilities[0];delete facility.kind;Modules.validateModule(doc,catalog);
  facility.kind='other';assert.throws(()=>Modules.validateModule(doc,catalog));
  const store=new Core.Store(read('layout/presentation-layout.json')),next=store.snapshot(),page=next.content.modules['m101-lanes-diagram'];
  page.conceptFacilities={trajectory:structuredClone(topic.facilities)};
  page.conceptFacilities.trajectory[0].kind='control';store.commit(next);
  assert.deepEqual(Core.parse(store.serialize()).content.modules['m101-lanes-diagram'].conceptFacilities,page.conceptFacilities);
  const invalid=store.snapshot();invalid.content.modules['m101-lanes-diagram'].conceptFacilities.trajectory[0].kind='other';assert.throws(()=>store.commit(invalid));
});

test('forward entry starts diagram topics in their current order without changing same-page, backward, edit or explicit topic selections',async()=>{
  const window={generalRoadEditor:{editing:false},PresentationOrder:{forKey:items=>items},addEventListener(){}};
  const sandbox={module:{exports:{}},window,URL,document:{baseURI:'http://localhost/',addEventListener(){}},fetch:async url=>({ok:true,json:async()=>read(new URL(url).pathname.slice(1))})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-modules.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();
  let current={id:'modules-index'};api.connect({get page(){return current;}});
  for(const doc of api.contents)for(const flow of doc.submoduleFlows||[]){
    const diagram=flow.stages.find(stage=>stage.id==='diagram'),first=diagram.topics[0],last=diagram.topics.at(-1);
    current={id:flow.stages[0].pageId};
    api.resolvePage(diagram.pageId,'topic-'+last.id);
    api.prepareNavigation(diagram.pageId,1);assert.equal(api.displayContext(diagram.pageId).topic.id,first.id,diagram.pageId);
    api.resolvePage(diagram.pageId,'topic-'+last.id);
    current={id:diagram.pageId};api.prepareNavigation(diagram.pageId,1);assert.equal(api.displayContext(diagram.pageId).topic.id,last.id);
    current={id:flow.stages[2].pageId};api.prepareNavigation(diagram.pageId,-1);assert.equal(api.displayContext(diagram.pageId).topic.id,last.id);
    window.generalRoadEditor.editing=true;api.prepareNavigation(diagram.pageId,1);assert.equal(api.displayContext(diagram.pageId).topic.id,last.id);window.generalRoadEditor.editing=false;
  }
  window.PresentationOrder.forKey=items=>[...items].reverse();
  current={id:'m101-lanes-issues'};api.prepareNavigation('m101-lanes-diagram',1);assert.equal(api.displayContext('m101-lanes-diagram').topic.id,'trajectory');
  api.resolvePage('m101-lanes-diagram','topic-continuity');assert.equal(api.displayContext('m101-lanes-diagram').topic.id,'continuity');
  api.prepareNavigation('m101-additional-issues',1);api.prepareNavigation('results-modules',1);assert.equal(api.displayContext('m101-lanes-diagram').topic.id,'continuity');
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

test('all source subsections have content or explicit referrals, with active Typst figures, explicit user photos and preserved orientations',async()=>{
  const docs=catalog.modules.map(entry=>read('data/modules/'+entry.id+'.json'));
  assert.equal(docs.reduce((n,doc)=>n+(doc.submoduleFlows?.length||0),0),25);
  assert.equal(docs.flatMap(doc=>doc.pages).filter(page=>page.links).length,2);
  for(const entry of catalog.modules){const doc=docs.find(doc=>doc.id===entry.id);for(const sub of entry.submodules)assert(doc.pages.some(page=>page.submoduleId===sub.id),sub.id+' has no content');}
  const added=docs.filter(doc=>doc.source.imageFiles);assert.equal(added.length,10);assert.equal(added.reduce((n,doc)=>n+doc.source.imageFiles.length,0),79);assert.equal(added.reduce((n,doc)=>n+(doc.source.userImageFiles?.length||0),0),26);
  for(const doc of added){assert.deepEqual(Object.values(doc.assets).map(asset=>asset.file).sort(),[...doc.source.imageFiles,...doc.source.userImageFiles||[]].sort());const used=new Set(doc.pages.flatMap(page=>page.assets));for(const [id,asset]of Object.entries(doc.assets)){assert(used.has(id),'Unused declared image: '+id);if(doc.source.userImageFiles?.includes(asset.file)){const bytes=fs.readFileSync(path.join(root,asset.file));assert.equal(bytes.readUInt32BE(16),asset.width);assert.equal(bytes.readUInt32BE(20),asset.height);}}}
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
