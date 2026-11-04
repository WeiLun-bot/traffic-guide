'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Results=require('../assets/presentation-results.js'),content=require('../data/results/outline.json'),conditions=require('../data/results/current-conditions.json'),general=require('../data/results/general-strategies.json'),complex=require('../data/results/complex-strategies.json'),catalog=require('../data/scenarios/catalog.json'),modules=require('../data/modules/catalog.json');
const merged=()=>Results.mergeModuleComparisons(Results.mergeStrategies(Results.mergeStrategies(Results.mergeConditions(content,conditions),general),complex),require('../data/results/module-comparisons.json'));

test('all 36 scenarios retain their issue content and adjacent strategy pages alongside all module comparisons',()=>{
  const data=merged(),pages=Results.buildPages(data,catalog);assert.equal(pages.length,112);assert.equal(new Set(pages.map(page=>page.id)).size,112);
  for(const scene of catalog.scenarios){
    const pair=pages.filter(page=>page.resultsScenario===scene.id);assert.deepEqual(pair.map(page=>page.stage),['issue','strategy']);assert.equal(pages.indexOf(pair[1]),pages.indexOf(pair[0])+1);
    assert.equal(pair[1].id,Results.scenarioPageId(scene.id)+'-strategy');assert.equal(pair[1].sceneName,scene.name);assert.deepEqual(data.scenarioExamples[scene.id].issue,conditions.scenarios[scene.id].issue);
  }
  assert.deepEqual(data.scenarioExamples['G1-01'].strategy,content.scenarioExamples['G1-01'].strategy);
});

test('complex source mapping follows the case title and actual road content instead of the skipped filename numbers',()=>{
  Results.validateStrategies(complex);assert.equal(Object.keys(complex.scenarios).length,18);
  const roadSources={'C4-01':'05-4-01-fast-slow-lane-separation.typ','C4-02':'05-4-03-reversible-lane.typ','C4-03':'05-4-04-one-way-street.typ','C4-04':'05-4-05-midblock-median-u-turn.typ','C4-05':'05-4-06-zebra-crossing.typ','C4-06':'05-4-07-mountain-road-curve.typ'};
  const moduleIds=new Set(modules.modules.map(module=>module.id)),normalize=value=>value.replace(/[\s／/]/g,'');
  for(const [code,entry]of Object.entries(complex.scenarios)){
    const scene=catalog.scenarios.find(scene=>scene.id===code);assert.equal(normalize(entry.source.title),normalize(scene.name));assert.equal(entry.source.scenario,code);assert.match(entry.source.sha256,/^[a-f0-9]{64}$/);
    if(roadSources[code])assert.equal(entry.source.file,'chapters/05-complex-scenarios/'+roadSources[code]);
    assert(entry.strategy.items.length>=3&&entry.strategy.items.length<=4);assert.equal(entry.strategy.images.length,1);
    for(const point of entry.strategy.items){assert(moduleIds.has(point.moduleId));assert(point.text.length<=85);assert(!/原稿|待補/.test(point.title+point.text));}
    const asset=complex.assets[entry.strategy.images[0].key],overview=content.assets[content.scenarioThumbnails[code].key];assert.equal(asset.scenario,code);assert.equal(asset.file,overview.file);
    const bytes=fs.readFileSync(path.resolve(__dirname,'..',asset.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.deepEqual(require('../tools/svg-native-size.cjs')(bytes.toString('utf8'),asset.file),[asset.width,asset.height]);
  }
});

test('C2-02 reuse is explicitly traced to the U-turn source and retains separate editable image and page identities',()=>{
  const target=complex.scenarios['C2-02'],source=complex.scenarios['C4-04'];assert.equal(target.reusedFrom,'C4-04');assert.deepEqual(target.source.reference,source.source);
  assert.deepEqual(target.strategy.items,source.strategy.items);const first=complex.assets[target.strategy.images[0].key],second=complex.assets[source.strategy.images[0].key];assert.equal(first.file,second.file);assert.equal(first.sha256,second.sha256);assert.notEqual(target.strategy.images[0].key,source.strategy.images[0].key);
  const implicit=structuredClone(complex);delete implicit.scenarios['C2-02'].reusedFrom;assert.throws(()=>Results.validateStrategies(implicit));
  const foreign=structuredClone(complex);foreign.scenarios['C1-01'].strategy.images[0].key=foreign.scenarios['C1-02'].strategy.images[0].key;assert.throws(()=>Results.validateStrategies(foreign));
  const unsafe=structuredClone(complex);Object.values(unsafe.assets)[0].file='../../private.svg';assert.throws(()=>Results.validateStrategies(unsafe));
});
