'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Scenarios=require('../assets/presentation-scenarios.js'),root=path.resolve(__dirname,'..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'data/scenarios/catalog.json'),'utf8'));
test('PDF directories have eighteen general and eighteen complex scenarios in the correct chapters',()=>{
  Scenarios.validate(catalog);assert.equal(catalog.groups.length,8);assert.equal(catalog.scenarios.length,36);
  assert.deepEqual(catalog.groups.map(group=>catalog.scenarios.filter(item=>item.group===group.id).length),[6,4,4,4,9,2,1,6]);
  for(const mutate of [value=>value.scenarios.push({...value.scenarios[0]}),value=>value.scenarios[0].group='C1',value=>value.groups[0].deck='complex',value=>value.scenarios[0].sourcePage=0]){const invalid=structuredClone(catalog);mutate(invalid);assert.throws(()=>Scenarios.validate(invalid));}
});
test('unbuilt scenarios get blank pages while the four existing scenario IDs and data stay intact',async()=>{
  const data=JSON.parse(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script id="presentation-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const before=JSON.stringify(data),sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/'},fetch:async()=>({ok:true,json:async()=>structuredClone(catalog)})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-scenarios.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();assert.equal(api.error,'');
  const originals=data.scenarios.map(scene=>({id:scene.contextId,chapter:scene.chapter,kind:'context',scenario:scene.id})),pages=[...catalog.groups.map(group=>({id:group.entry,chapter:group.chapter,kind:'opening'})),...originals];api.extendPages(pages,data);
  const pending=pages.filter(page=>page.scenarioCode);assert.equal(pending.length,32);assert(pending.every(page=>page.kind==='presentation-empty'));assert.equal(new Set(pages.map(page=>page.id)).size,pages.length);assert(pages.every(page=>/^[\w-]+$/.test(page.id)));assert(originals.every(page=>pages.includes(page)));assert.equal(JSON.stringify(data),before);
});
