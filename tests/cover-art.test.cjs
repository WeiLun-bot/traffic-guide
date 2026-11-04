'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Core=require('../assets/visual-editor-core.js');
const original=()=>require('./read-project-config.cjs')();
test('cover art settings remain optional in older files and reject invalid fields, ranges and page IDs',()=>{
  const raw=original();delete raw.coverArt;const config=Core.validate(raw);assert.deepEqual(config.coverArt,{});assert.equal(raw.coverArt,undefined);
  assert.deepEqual(Core.coverArtSettings(),{rotation:-52,tilt:52,scale:1,x:0,y:0});assert.deepEqual(Core.coverArtSettings({rotation:-30}),{rotation:-30,tilt:52,scale:1,x:0,y:0});
  for(const [key,values]of Object.entries({rotation:[-86,86,'30',Infinity],tilt:[14,71],scale:[.69,1.41],x:[-26,26],y:[NaN,26]}))for(const value of values)assert.throws(()=>Core.coverArtSettings({[key]:value}));
  assert.throws(()=>Core.coverArtSettings({unknown:1}));assert.throws(()=>Core.coverArtSettings(null));
  const bad=Core.clone(config);bad.coverArt['../private']={rotation:0};assert.throws(()=>Core.validate(bad));
});
test('cover rotation, tilt, scale and position survive JSON, save state, undo, redo and per-cover reset independently',()=>{
  const store=new Core.Store(original()),baseline=store.snapshot();assert(!store.dirty);
  const next=store.snapshot();next.coverArt['results-intro']={rotation:-40,tilt:45,scale:1.12,x:4,y:-6};next.coverArt['another-cover']={rotation:12};assert(store.commit(next));assert(store.dirty);
  const restored=Core.parse(store.serialize());assert.deepEqual(restored.coverArt['results-intro'],next.coverArt['results-intro']);assert.equal(restored.coverArt['another-cover'].tilt,52);
  assert.deepEqual(restored.legacyState,baseline.legacyState);assert.deepEqual(restored.imageViews,baseline.imageViews);assert.deepEqual(restored.content,baseline.content);
  assert(store.undo());assert.deepEqual(store.config.coverArt,baseline.coverArt);assert(!store.dirty);assert(store.redo());store.markSaved(store.snapshot());assert(!store.dirty);
  const reset=store.snapshot();delete reset.coverArt['results-intro'];store.commit(reset);assert(store.dirty);assert(store.config.coverArt['another-cover']);assert(store.undo());assert.deepEqual(store.config.coverArt['results-intro'],next.coverArt['results-intro']);assert(!store.dirty);
});
