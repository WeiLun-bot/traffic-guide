'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Results=require('../assets/presentation-results.js');
const catalog=require('../data/modules/catalog.json'),documents=catalog.modules.map(m=>require('../data/modules/'+m.id+'.json'));
test('all modules, all submodules and every full representative variant are included without duplicate shared figures',()=>{
  const entries=Results.moduleRepresentatives(catalog,documents);
  assert.equal(entries.length,38);assert.equal(new Set(entries.map(e=>e.id)).size,38);
  assert.deepEqual([...new Set(entries.map(e=>e.moduleId))],catalog.modules.map(m=>m.id));
  assert.deepEqual([...new Set(entries.flatMap(e=>e.submodules.map(s=>s.id)))].sort(),catalog.modules.flatMap(m=>m.submodules.map(s=>s.id)).sort());
  for(const d of documents)for(const [id,a]of Object.entries(d.assets))if(a.file.includes('代表型')&&!a.file.includes('放大'))assert(entries.some(e=>e.moduleId===d.id&&e.assetId===id),d.id+':'+id);
  const shared=entries.find(e=>e.moduleId==='M3-02');assert.deepEqual(shared.submodules.map(s=>s.id),['M3-02.1','M3-02.2']);
  assert(entries.some(e=>e.moduleId==='M3-03'&&e.assetId==='m101-slow-wide'));assert(entries.some(e=>e.assetId==='m403-36895aca28'));
  assert(entries.every(e=>!e.file.includes('現況')));
});
test('five overview pages across four themes precede module comparisons and comparison return links match their themes',()=>{
  const content=Results.mergeModuleComparisons(require('../data/results/outline.json'),require('../data/results/module-comparisons.json'));
  const pages=Results.buildPages(content,require('../data/scenarios/catalog.json')),overview=pages.filter(p=>p.resultType==='module-overview');
  assert.deepEqual(overview.map(p=>p.id),['results-modules','results-modules-m2','results-modules-m3','results-modules-m3-2','results-modules-m4']);
  const start=pages.indexOf(overview[0]);assert.deepEqual(pages.slice(start,start+5),overview);assert.equal(pages[start+5].resultType,'module-comparison');
  for(const p of pages.filter(p=>p.resultType==='module-comparison'))assert.equal(p.directoryId,overview.find(o=>o.moduleOverviewTheme===p.resultsModule.slice(0,2)).id);
});

test('representative captions suppress repeated names and keep only the meaningful variant suffix',()=>{
  const entries=Results.moduleRepresentatives(catalog,documents),name=id=>Results.representativeName(entries.find(e=>e.assetId===id),entries);
  assert.equal(name('m101-lanes'),'路口與路段車道配置');assert.equal(name('m101-additional'),'附加車道');assert.equal(name('m103-layout'),'路側停放與裝卸車位配置');
  assert.equal(name('m102-offset'),'路徑與地點指示－錯位T字路口指示配置');assert.equal(name('m102-roundabout'),'路徑與地點指示－渦輪圓環指示配置');
  assert.equal(name('m301-1ce77bf207'),'人行道標線－型式1');assert.equal(name('m301-7f710fdd90'),'人行道標線－型式2');
  assert.equal(name('m303-6861b608fc'),'機車左轉－兩段式左轉（型式1）');assert.equal(name('m303-a5220c3ae3'),'機車左轉－兩段式左轉（型式2）');
});
