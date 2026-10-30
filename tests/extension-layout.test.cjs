'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Core=require('../assets/visual-editor-core.js'),Modules=require('../assets/presentation-modules.js');
const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',name),'utf8'));
test('extension defaults stack flat figures using their displayed orientation and retain horizontal layout for other figures',()=>{
  const doc=read('data/modules/M1-01.json'),stage=doc.submoduleFlows[0].stages.find(stage=>stage.id==='extensions');
  for(const topic of stage.topics)assert.equal(Modules.extensionLayout(doc,stage,topic).layout,'vertical');
  const sample={assets:{figure:{width:200,height:1000,rotation:90}},pages:[{id:'source',assets:['figure']}]},flow={pageId:'example'},topic={id:'one',sourcePageId:'source'};
  assert.equal(Modules.extensionLayout(sample,flow,topic).layout,'vertical');sample.assets.figure.rotation=0;assert.equal(Modules.extensionLayout(sample,flow,topic).layout,'horizontal');
  sample.pages[0].assets=[];assert.equal(Modules.extensionLayout(sample,flow,topic).layout,'horizontal');
});
test('card-specific overrides preserve defaults on other cards and survive history and JSON reload',()=>{
  const config=read('layout/presentation-layout.json');delete config.extensionLayouts;const store=new Core.Store(config);assert.deepEqual(store.config.extensionLayouts,{});
  const doc=read('data/modules/M1-01.json'),stage=doc.submoduleFlows[0].stages.find(stage=>stage.id==='extensions'),[one,two]=stage.topics;
  const key=Modules.extensionLayout(doc,stage,one).key,next=store.snapshot();next.extensionLayouts[key]='horizontal';assert(store.commit(next));assert(store.dirty);
  assert.equal(Modules.extensionLayout(doc,stage,one,store.config).layout,'horizontal');assert.equal(Modules.extensionLayout(doc,stage,two,store.config).layout,'vertical');
  assert(store.undo());assert.equal(Modules.extensionLayout(doc,stage,one,store.config).selected,'auto');assert(!store.dirty);assert(store.redo());
  const parsed=Core.parse(store.serialize());assert.equal(parsed.extensionLayouts[key],'horizontal');assert.equal(Modules.extensionLayout(doc,stage,one,parsed).layout,'horizontal');
  const auto=store.snapshot();delete auto.extensionLayouts[key];store.commit(auto);assert.equal(Modules.extensionLayout(doc,stage,one,store.config).layout,'vertical');
});
test('malformed extension layouts are rejected without changing editor state',()=>{
  const store=new Core.Store(read('layout/presentation-layout.json')),before=store.serialize();
  for(const extensionLayouts of [null,[],{'page/topic':'diagonal'},{'bad path/topic':'horizontal'},{'page/topic/extra':'vertical'},{'page/topic':true}]){
    const next=store.snapshot();next.extensionLayouts=extensionLayouts;assert.throws(()=>store.commit(next));assert.equal(store.serialize(),before);
  }
});
