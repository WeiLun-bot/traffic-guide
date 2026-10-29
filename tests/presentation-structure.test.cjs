'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'data/presentations.json'),'utf8')),Structure=require('../assets/presentation-structure.js');
test('four presentations own independent chapters, including all four PDF module themes',()=>{
  Structure.validate(manifest);assert.deepEqual(manifest.presentations.map(deck=>deck.title),['三年成果與模組化整體架構','交通管制設施模組設計','一般道路情境','複雜道路情境']);
  const modules=manifest.presentations.find(deck=>deck.id==='modules'),general=manifest.presentations.find(deck=>deck.id==='general');
  assert.deepEqual(modules.chapters.map(chapter=>chapter.code),['00','01','02','03','04']);assert.deepEqual(modules.chapters.slice(1).map(chapter=>chapter.name),['車道配置與動線導引','路口管制','行人、自行車、機車、公車','危險警示與通行管制']);
  assert.deepEqual(general.chapters.map(chapter=>chapter.id),['intro','g1','g2','g3','g4']);
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/modules/catalog.json'),'utf8'));assert.deepEqual(modules.chapters.slice(1).map(chapter=>chapter.name),catalog.themes.map(theme=>theme.name));
  const invalid=structuredClone(manifest);invalid.presentations[1].chapters[1].id='g1';assert.throws(()=>Structure.validate(invalid));
});
test('grouping preserves old page identities and saved ordering inside each presentation',async()=>{
  const sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/',addEventListener(){}},fetch:async()=>({ok:true,json:async()=>structuredClone(manifest)})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-structure.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();
  const pages=[{id:'edge',chapter:'g1',kind:'map'},{id:'m201-stop-layout',chapter:'modules-M2',kind:'module'},{id:'cover',chapter:'intro',kind:'cover'},{id:'presentations',chapter:'presentations',kind:'presentations-home'},...api.placeholders()];
  const before=pages.filter(page=>page.chapter==='g1'||page.chapter==='intro');api.organize(pages);
  assert.equal(pages[0].id,'presentations');assert.equal(pages.find(page=>page.id==='m201-stop-layout').deckId,'modules');assert.deepEqual(pages.filter(page=>page.deckId==='general'),before);
  assert(pages.filter(page=>page.kind==='presentation-empty').every(page=>['results','complex'].includes(page.deckId)));assert.equal(new Set(pages.map(page=>page.id)).size,pages.length);
});
