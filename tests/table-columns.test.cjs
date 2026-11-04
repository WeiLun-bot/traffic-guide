'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Columns=require('../assets/table-column-editor.js'),Core=require('../assets/visual-editor-core.js'),original=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../layout/presentation-layout.json'),'utf8'));
test('resizing a column boundary preserves the total and the other column, and clamps both adjacent columns',()=>{
  const before=[20,27,53];assert.deepEqual(Columns.resizeColumns(before,0,6),[26,21,53]);assert.deepEqual(Columns.resizeColumns(before,1,-10),[20,17,63]);assert.deepEqual(Columns.resizeColumns(before,0,500),[39,8,53]);assert.deepEqual(Columns.resizeColumns(before,1,-500),[20,8,72]);assert.deepEqual(before,[20,27,53]);assert.throws(()=>Columns.resizeColumns(before,2,10));assert.throws(()=>Columns.resizeColumns(before,0,Infinity));
});
test('column widths are optional in old settings and remain independent per page and panel through history and JSON',()=>{
  const config=original();delete config.tableColumns;const store=new Core.Store(config);assert.deepEqual(store.config.tableColumns,{});assert(!store.dirty);
  const next=store.snapshot();next.tableColumns['results-phase-three/framework-0']=[26,21,53];assert(store.commit(next));assert(store.dirty);assert(store.undo());assert(!store.dirty);assert(store.redo());
  const restored=Core.parse(store.serialize());assert.deepEqual(restored.tableColumns,{'results-phase-three/framework-0':[26,21,53]});assert.deepEqual(restored.content,store.config.content);assert.deepEqual(restored.imageViews,store.config.imageViews);
  for(const values of [[10,10,10],[1,46,53],[26,NaN,74],[20,30],['20',27,53]]){const bad=store.snapshot();bad.tableColumns['results-phase-two/framework-1']=values;assert.throws(()=>Core.validate(bad));}
  const bad=store.snapshot();bad.tableColumns['../../private']=[20,27,53];assert.throws(()=>Core.validate(bad));
});
