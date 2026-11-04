'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Core=require('../assets/visual-editor-core.js'),Order=require('../assets/presentation-image-order.js');
const original=()=>require('./read-project-config.cjs')();
test('image ordering tolerates old settings, missing assets and new photos without changing identities',()=>{
  const items=[{id:'a'},{id:'b'},{id:'c'}],key='results:results-scenario-g1-02/photo';
  assert.deepEqual(Order.ordered(items,key,undefined,{}),items);
  assert.deepEqual(Order.ordered(items,key,undefined,{imageOrders:{[key]:['c','missing','a']}}),[items[2],items[0],items[1]]);
  assert.deepEqual(items.map(item=>item.id),['a','b','c']);
  assert.deepEqual(Order.moved(['a','b','c'],'c','a'),['c','a','b']);
  assert.deepEqual(Order.moved(['a','b','c'],'a','c',true),['b','c','a']);
  assert.deepEqual(Order.moved(['a','b'],'a','missing'),['a','b']);
  const old=original();delete old.imageOrders;assert.deepEqual(Core.validate(old).imageOrders,{});
});
test('photo orders participate in undo, redo and JSON saving independently of image cameras and replacements',()=>{
  const config=original();config.imageOrders={};const store=new Core.Store(config),key='module:m401-overview/overview:M4-01.1';
  const before=store.snapshot(),next=store.snapshot();next.imageOrders[key]=['module:m401-bridge','module:m401-tunnel'];
  assert(store.commit(next));assert(store.dirty);assert.equal(store.past.length,1);assert(!store.commit(next));
  assert.deepEqual(store.config.imageViews,before.imageViews);assert.deepEqual(store.config.legacyState.images,before.legacyState.images);
  assert(store.undo());assert.deepEqual(store.config.imageOrders,{});assert(!store.dirty);assert(store.redo());
  const restored=Core.parse(store.serialize());assert.deepEqual(restored.imageOrders,next.imageOrders);
  store.markSaved(restored);assert(!store.dirty);
});
test('image orders reject malformed groups, duplicate IDs and unsafe values',()=>{
  for(const imageOrders of [[],{'other:page/photos':['a']},{'results:page/photos':['a','a']},{'results:page/photos':['../x']},{'module:page/topic:x':'a'}]){
    const config=original();config.imageOrders=imageOrders;assert.throws(()=>Core.validate(config),/圖片排序/);
  }
});
