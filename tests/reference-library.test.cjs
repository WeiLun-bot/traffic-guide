'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const References=require('../assets/reference-library.js'),Core=require('../assets/visual-editor-core.js'),Document=require('../assets/presentation-document.js');
const library=require('../data/reference-library.json');

test('supplied sight-distance values and grade corrections remain in one popup',()=>{
  References.initialize(library);
  const item=library.items[0],data={articles:[],scenarios:[]};
  assert.equal(References.collect(data).length,library.items.length);
  assert.deepEqual(item.tables[0].rows,[['20','20','35','40','40'],['30','30','45','60','60'],['40','45','60','80','90'],['50','65','75','100','120'],['60','85','90','120','160'],['70','110','110','140','210'],['80','135','135','160','270']]);
  assert.deepEqual(item.tables[1].rows,[['修正比例','0.7','0.9','1.0','1.1','1.3']]);
  for(const reg of ['30','41','58','59'])assert.deepEqual(References.defaults({article:{reg}}),['sight-distance']);
  assert.deepEqual(References.defaults({article:{reg:'183'}}),[]);
  assert.match(References.tableHtml(item.tables[0]),/scope="col"/);
  assert(!References.tableHtml({title:'<script>',columns:['<b>'],rows:[['<img>']]}).includes('<script>'));
});

test('all existing tables and article references are catalogued with stable targets',()=>{
  const docs=require('../data/scenarios/catalog.json').details.map(file=>require('../'+file));
  const data={articles:docs.flatMap(doc=>doc.articles),scenarios:docs.map(doc=>doc.scenario)};
  const catalog=References.collect(data),tables=data.articles.filter(article=>article.table);
  assert(tables.length>0);
  assert.equal(catalog.filter(item=>item.kind==='table').length,tables.length+library.items.length);
  assert.equal(new Set(catalog.map(item=>item.id)).size,catalog.length);
  for(const article of tables)assert(catalog.some(item=>item.id==='table:'+article.id&&item.tables[0].rows===article.table.rows));
  assert(catalog.some(item=>item.label==='表：反光導標及危險標記'));
});

test('reference ordering, explicit removal of defaults, undo and project round trips preserve content',()=>{
  const config=Core.validate(Document.empty()),page={id:'pedestrian',article:{reg:'41'}};
  assert.deepEqual(References.selected(page,config),['sight-distance']);
  config.content.references.pedestrian={ids:['table:g106-reflectors','sight-distance']};
  const store=new Core.Store(config),next=store.snapshot();next.content.references.pedestrian.ids=[];store.commit(next);
  assert.deepEqual(References.selected(page,store.config),[]);
  store.undo();assert.deepEqual(References.selected(page,store.config),['table:g106-reflectors','sight-distance']);
  const bundle=Document.bundle(store.config,{pedestrian:'scenarios/G1-01'});
  assert.deepEqual(bundle.documents['scenarios/G1-01'].content.references.pedestrian.ids,['table:g106-reflectors','sight-distance']);
  assert.deepEqual(Document.parse(JSON.stringify(bundle)).content.references,store.config.content.references);
  const invalid=store.snapshot();invalid.content.references.pedestrian.ids=['sight-distance','sight-distance'];assert.throws(()=>Core.validate(invalid));
});
