'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Scenarios=require('../assets/presentation-scenarios.js'),root=path.resolve(__dirname,'..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'data/scenarios/catalog.json'),'utf8'));
test('PDF directories have eighteen general and eighteen complex scenarios in the correct chapters',()=>{
  Scenarios.validate(catalog);assert.equal(catalog.groups.length,8);assert.equal(catalog.scenarios.length,36);
  assert.deepEqual(catalog.groups.map(group=>catalog.scenarios.filter(item=>item.group===group.id).length),[6,4,4,4,9,2,1,6]);
  for(const mutate of [value=>value.scenarios.push({...value.scenarios[0]}),value=>value.scenarios[0].group='C1',value=>value.groups[0].deck='complex',value=>value.scenarios[0].sourcePage=0]){const invalid=structuredClone(catalog);mutate(invalid);assert.throws(()=>Scenarios.validate(invalid));}
});
test('unbuilt scenarios get blank pages while the four existing scenario IDs and data stay intact',async()=>{
  const data=require('../tools/presentation-source.cjs').dataFromHtml(fs.readFileSync(path.join(root,'index.html'),'utf8'));
  const before=JSON.stringify(data),sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/'},fetch:async()=>({ok:true,json:async()=>structuredClone(catalog)})};
  const directory=structuredClone(catalog);delete directory.details;sandbox.fetch=async()=>({ok:true,json:async()=>directory});
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-scenarios.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();assert.equal(api.error,'');
  const originals=data.scenarios.map(scene=>({id:scene.contextId,chapter:scene.chapter,kind:'context',scenario:scene.id})),pages=[...catalog.groups.map(group=>({id:group.entry,chapter:group.chapter,kind:'opening'})),...originals];api.extendPages(pages,data);
  const pending=pages.filter(page=>page.scenarioCode);assert.equal(pending.length,32);assert(pending.every(page=>page.kind==='presentation-empty'));assert.equal(new Set(pages.map(page=>page.id)).size,pages.length);assert(pages.every(page=>/^[\w-]+$/.test(page.id)));assert(originals.every(page=>pages.includes(page)));assert.equal(JSON.stringify(data),before);
});

test('all supplied cases prepare eighteen scenarios and 131 explanations without changing the original cases',async()=>{
  const data=require('../tools/presentation-source.cjs').dataFromHtml(fs.readFileSync(path.join(root,'index.html'),'utf8')),before=JSON.stringify({scenes:data.scenarios,articles:data.articles}),sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/'},fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,new URL(url).pathname),'utf8'))})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-scenarios.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();assert.equal(api.error,'');api.prepare(data);
  assert.equal(data.scenarios.length,18);assert.equal(data.articles.length,131);assert.equal(JSON.stringify({scenes:data.scenarios.slice(0,4),articles:data.articles.slice(0,26)}),before);
  const once=JSON.stringify(data);api.prepare(data);assert.equal(JSON.stringify(data),once,'Preparing twice must not duplicate cases');
  const originals=data.scenarios.map(scene=>({id:scene.contextId,chapter:scene.chapter,kind:'context',scenario:scene.id})),pages=[...catalog.groups.map(group=>({id:group.entry,chapter:group.chapter,kind:'opening'})),...originals];api.extendPages(pages,data);
  assert.equal(pages.filter(page=>page.scenarioCode).length,18);for(const id of ['g2','g3','g4'])assert.equal(pages.find(page=>page.id===id).kind,'chapter-scenarios');
  const scenarioFirst=[...originals,...catalog.groups.map(group=>({id:group.entry,chapter:group.chapter,kind:'opening'}))];api.extendPages(scenarioFirst,data);
  for(const group of catalog.groups.filter(group=>group.deck==='general')){const entry=scenarioFirst.findIndex(page=>page.id===group.entry);assert(scenarioFirst.filter(page=>page.chapter===group.chapter&&page.scenario).every(page=>scenarioFirst.indexOf(page)>entry),'Directory must come before its cases: '+group.id);}
  for(const doc of api.details){
    const local=JSON.parse(JSON.stringify(doc));Scenarios.validateDetail(local,catalog);assert(local.scenario.currentConditions.photos.length);for(const asset of Object.values(local.assets))assert(fs.existsSync(path.join(root,asset.file)));
    for(const mutate of [value=>value.articles[0].mapAsset='foreign',value=>Object.values(value.assets)[0].file='../../private.svg',value=>value.scenario.articleIds.push(value.scenario.articleIds[0])]){const invalid=structuredClone(local);mutate(invalid);assert.throws(()=>Scenarios.validateDetail(invalid,catalog));}
  }
});

test('local explanation drawings preserve native orientation and reversible highlight coordinates',()=>{
  for(const rotation of [0,90,180,270]){const scene={width:300,height:200,rotation},box=[23,41,80,60],display=Scenarios.bounds(box,scene);assert.deepEqual(Scenarios.bounds(display,scene,true),box);if(rotation)assert.match(Scenarios.transform(scene),new RegExp('rotate\\('+rotation+'\\)'));}
});

test('facility article pages use full scenario layouts while signal checks and the crossing comparison keep their diagrams',()=>{
  const expected={
    'G1-05':['yellow-line','red-line','no-parking-sign','no-stopping-sign','parking-sign'],
    'G1-06':['reflectors','lane-line','slow-line','crosswalk-line','yield-sign','speed-sign'],
    'G2-01':['waiting','pedestrian'],
    'G2-02':['center','street-name','pedestrians']
  };
  for(const [code,ids]of Object.entries(expected)){
    const doc=require('../data/scenarios/'+code+'.json'),prefix=code.toLowerCase().replace('-',''),overall=doc.assets[doc.scenario.overall];
    for(const id of ids){const article=doc.articles.find(item=>item.id===prefix+'-'+id);assert(article,id);assert.equal(article.mapAsset,doc.scenario.overall);assert.equal(article.asset,doc.scenario.overall);assert(article.crop[2]*article.crop[3]<overall.width*overall.height,'Facility explanations should zoom into the full layout');}
    const used=new Set([doc.scenario.overall,doc.scenario.currentConditions.before,...doc.scenario.currentConditions.photos.map(photo=>photo.image),...(doc.scenario.comparisonRows||[]).map(row=>row[0]),...doc.articles.flatMap(item=>[item.mapAsset,item.asset])]);assert.deepEqual(new Set(Object.keys(doc.assets)),used,'Do not bundle unused report crops');
    if(code==='G1-06')assert(doc.scenario.comparisonRows.every(row=>row[0]!==doc.scenario.overall));
    for(const article of doc.articles.filter(item=>!ids.includes(item.id.slice(prefix.length+1))))assert.notEqual(article.mapAsset,doc.scenario.overall,'Keep specialized signal check drawings');
  }
});

test('remaining case content preserves source-specific signal results, full-layout facilities and real alternatives',()=>{
  const docs=catalog.details.map(file=>require('../'+file)),byCode=Object.fromEntries(docs.map(doc=>[doc.scenario.code,doc]));
  assert.equal(docs.length,14);
  for(const doc of docs){
    for(const article of doc.articles.filter(item=>['標線','標誌'].includes(item.category)))assert.equal(article.mapAsset,doc.scenario.overall,article.id);
    assert.equal(doc.scenario.setting,doc.scenario.name.includes('市區')?'市區':'鄉區');
    for(const article of doc.articles){assert(article.sourceRaw.length>(article.sourceDocument?0:80)&&/[道路號誌標線]/.test(article.sourceRaw),article.id+' source excerpt is missing');if(article.sourceDocument)assert.equal(article.sourceRaw,article.sourceParagraphs.join('\n\n'));}
  }
  for(const code of ['G2-03','G2-04','G4-01','G4-02','G4-03','G4-04']){const table=byCode[code].articles.find(item=>item.id.endsWith('-checklist')).table;assert.equal(table.rows.length,11);assert.match(table.rows[10][0],/^\[9\]/);assert(table.rows.some(row=>row.some(cell=>/現地檢查/.test(cell))));}
  assert(byCode['G2-03'].articles.find(item=>item.id==='g203-checklist').table.rows[10][1].includes('防窺'));
  assert(byCode['G2-04'].articles.find(item=>item.id==='g204-checklist').table.rows[0][1].includes('注意號誌'));
  assert(byCode['G4-02'].articles.find(item=>item.id==='g402-checklist').table.rows[4][1].includes('建議增設'));
  assert.equal(byCode['G4-02'].scenario.facts[1].speed,null,'Do not invent a side-road speed omitted in the source');
  for(const code of ['G3-02','G3-04'])assert.equal(byCode[code].scenario.comparisonRows.length,2);
  assert.equal(byCode['G2-04'].articles.filter(item=>/^g204-curve-option-/.test(item.id)).length,3);
  assert.equal(byCode['G4-01'].articles.filter(item=>/^g401-phase-/.test(item.id)).length,2);
  assert.equal(byCode['G4-04'].articles.find(item=>item.id==='g404-risk').table.rows.length,2);
  assert(!byCode['G3-01'].articles.some(item=>item.reg==='54'),'A commented-out explanation must not be treated as active source content');
});
