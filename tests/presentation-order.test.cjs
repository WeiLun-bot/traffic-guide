'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Order=require('../assets/presentation-order.js'),Core=require('../assets/visual-editor-core.js');
const original=()=>require('./read-project-config.cjs')();
test('ordering uses stable identities, appends new items and ignores removed entries without mutating source data',()=>{
  const items=['a','b','c'].map(id=>({id,title:id})),ids=['removed','b','b','a'];
  assert.deepEqual(Order.ordered(items,ids).map(item=>item.id),['b','a','c']);assert.deepEqual(items.map(item=>item.id),['a','b','c']);
  assert.deepEqual(Order.moved(['a','b','c'],'a','c',true),['b','c','a']);
  assert.deepEqual(Order.moved(['a','b','c'],'c','a'),['c','a','b']);
  assert.deepEqual(Order.moved(['a','b','c'],'b','b'),['a','b','c']);
  assert.deepEqual(Order.forKey(items,'module:one',{navigationOrders:{'module:two':['c','b','a']}}),items);
});

test('TOC page moves retain page identities and leave all other chapters and presentations in place',()=>{
  const pages=[{id:'home',chapter:'intro'},{id:'a',chapter:'review',content:{title:'A'}},{id:'b',chapter:'review',content:{title:'B'}},{id:'module',chapter:'modules-M1'}],before=structuredClone(pages);
  const next=Order.reorderedPages(pages,['a','b'],['b','a']);assert.deepEqual(next.map(page=>page.id),['home','b','a','module']);assert.equal(next[1],pages[2]);assert.equal(next[2],pages[1]);assert.deepEqual(pages,before);
  for(const invalid of [['a','a'],['a','missing'],['b','a','a']])assert.throws(()=>Order.reorderedPages(pages,['a','b'],invalid));
  const store=new Core.Store(original()),snapshot=store.snapshot();snapshot.legacyState.pageOrder=next.map(page=>page.id);store.commit(snapshot);assert.deepEqual(Core.parse(store.serialize()).legacyState.pageOrder,next.map(page=>page.id));assert(store.undo());assert(store.redo());assert.deepEqual(store.config.legacyState.pageOrder,next.map(page=>page.id));
});
test('navigation settings are backward compatible, validated and participate in JSON, dirty state and undo/redo',()=>{
  const config=original();delete config.navigationOrders;const store=new Core.Store(config);assert.deepEqual(store.config.navigationOrders,{});
  const next=store.snapshot();next.navigationOrders['module:m101-lanes-diagram']=['waiting','arrows'];next.navigationOrders['scenario:c1-01']=['second','first'];
  assert(store.commit(next));assert(store.dirty);assert(store.undo());assert(!store.dirty);assert(store.redo());
  assert.deepEqual(Core.parse(store.serialize()).navigationOrders,next.navigationOrders);
  for(const invalid of [null,[],{'bad:key':['one']},{'module:one':['a','a']},{'scenario:c1-01':['../bad']},{'module:one':'bad'}]){
    const bad=store.snapshot();bad.navigationOrders=invalid;assert.throws(()=>Core.validate(bad));
  }
  const snapshot=store.serialize();assert.throws(()=>store.commit({...store.snapshot(),navigationOrders:{'module:one':['a','a']}}));assert.equal(store.serialize(),snapshot);
});
test('general and complex article pages follow their own order, keep comparison pages with the related article, and restore after undo',()=>{
  for(const id of ['g1-01','c1-01']){
    const scene={id,articleIds:['edge','crosswalk','sign'],comparisonId:'compare'},data={scenarios:[scene]};
    const pages=[{id:'intro'},...scene.articleIds.flatMap((key,index)=>[{id:key,scenario:id,article:{id:key,reg:index===1?'185':'183'}},...(index===1?[{id:'compare',scenario:id}]:[])]),{id:'review'}];
    const originals=[...pages],config={navigationOrders:{['scenario:'+id]:['sign','crosswalk','edge']}};
    Order.organize(pages,data,config);assert.deepEqual(pages.map(page=>page.id),['intro','sign','crosswalk','compare','edge','review']);
    assert(pages.every(page=>originals.includes(page)),'Content and highlight identities must be retained');
    Order.organize(pages,data,{});assert.deepEqual(pages.map(page=>page.id),['intro','edge','crosswalk','compare','sign','review']);
    Order.organize(pages,data,{legacyState:{pageOrder:['sign','edge','crosswalk']}});assert.deepEqual(pages.map(page=>page.id),['intro','sign','edge','crosswalk','compare','review']);
    Order.organize(pages,data,{legacyState:{pageOrder:['sign','compare','edge','crosswalk']}});assert.deepEqual(pages.map(page=>page.id),['intro','sign','compare','edge','crosswalk','review']);
  }
});
