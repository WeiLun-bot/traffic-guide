'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Results=require('../assets/presentation-results.js'),content=require('../data/results/outline.json'),conditions=require('../data/results/current-conditions.json'),strategies=require('../data/results/general-strategies.json'),catalog=require('../data/scenarios/catalog.json'),modules=require('../data/modules/catalog.json');
const merged=()=>Results.mergeStrategies(Results.mergeConditions(content,conditions),strategies);

test('complex overview preserves all 18 case identities and explicitly records the shared C4-04 layout for C2-02',()=>{
  Results.validate(content);const thumbnails=content.scenarioThumbnails;assert.equal(Object.keys(thumbnails).length,18);assert.equal(thumbnails['C2-02'].reuseFrom,'C4-04');assert.equal(thumbnails['C2-02'].key,thumbnails['C4-04'].key);
  for(const [code,image]of Object.entries(thumbnails)){
    assert(catalog.scenarios.some(scene=>scene.id===code));const asset=content.assets[image.key];
    const owner=image.reuseFrom||code;assert(asset.file.startsWith('materials/05-複雜道路情境/'+owner+'/'+owner+'_'));const bytes=fs.readFileSync(path.resolve(__dirname,'..',asset.file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.deepEqual(require('../tools/svg-native-size.cjs')(bytes.toString('utf8'),asset.file),[asset.width,asset.height]);
  }
  const complex=content.pages.find(page=>page.id==='results-complex');assert.equal(complex.title,'複雜道路情境｜整體佈設圖總覽');assert(!complex.intro);
  assert.equal(Results.buildPages(merged(),catalog).length,82);
  const foreign=structuredClone(content);foreign.scenarioThumbnails['C1-01']=foreign.scenarioThumbnails['C1-02'];assert.throws(()=>Results.validate(foreign));
  const unsafe=structuredClone(content);Object.values(unsafe.assets)[0].file='../../private.svg';assert.throws(()=>Results.validate(unsafe));
});
test('all 18 general scenarios have adjacent issue and strategy pages, while complex cases and G1-01 identities remain intact',()=>{
  const data=merged(),pages=Results.buildPages(data,catalog);assert.equal(pages.length,82);assert.equal(pages.filter(page=>page.stage==='strategy').length,18);
  for(const scene of catalog.scenarios){
    const entries=pages.filter(page=>page.resultsScenario===scene.id);assert.deepEqual(entries.map(page=>page.stage),scene.id[0]==='G'?['issue','strategy']:['issue']);
    assert.deepEqual(data.scenarioExamples[scene.id].issue,conditions.scenarios[scene.id].issue);
    if(scene.id[0]==='G'){const index=pages.indexOf(entries[0]);assert.equal(pages[index+1],entries[1]);assert.equal(entries[1].id,Results.scenarioPageId(scene.id)+'-strategy');}
  }
  assert.deepEqual(data.scenarioExamples['G1-01'].strategy,content.scenarioExamples['G1-01'].strategy);
  assert(!data.scenarioExamples['C2-02'].issue.sourceMissing);assert(data.scenarioExamples['C2-02'].issue.images.some(image=>image.role==='photo'));assert(data.scenarioExamples['C1-01'].issue.images.some(image=>image.role==='photo'));
});
test('each strategy retains its owning SVG, source provenance and valid optional module references',()=>{
  const ids=new Set(modules.modules.map(module=>module.id));Results.validateStrategies(strategies);
  for(const [code,entry]of Object.entries(strategies.scenarios)){
    assert.equal(entry.strategy.images.length,1);
    assert(entry.source.file.startsWith('chapters/04-general-scenarios/04-'+code[1]+'-'+code.slice(3)+'-'));
    for(const point of entry.strategy.items){if(point.moduleId!==undefined)assert(ids.has(point.moduleId));assert(!/原稿|待補/.test(point.title+point.text));}
    const asset=strategies.assets[entry.strategy.images[0].key];assert.equal(asset.scenario,code);assert(asset.file.startsWith('materials/04-一般道路情境/'+code+'/'+code+'_'));
    const raw=fs.readFileSync(path.resolve(__dirname,'..',asset.file));assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),asset.sha256);assert.match(raw.toString('utf8'),/<svg\b/);
  }
  assert(strategies.assets['results:g1-02-strategy'].file.endsWith('G1-02_無號誌鄉區正交三叉路口設施設置圖例.svg'));
  assert(strategies.assets['results:g4-02-strategy'].file.includes('/G4-02/'),'Ignore the duplicate G4-02 file in the G4-01 folder');
});
test('strategy input rejects cross-case images, unsafe paths, duplicate points and missing issue pages',()=>{
  const foreign=structuredClone(strategies);foreign.scenarios['G1-03'].strategy.images[0].key='results:g1-04-strategy';assert.throws(()=>Results.validateStrategies(foreign));
  const unsafe=structuredClone(strategies);Object.values(unsafe.assets)[0].file='../../private.svg';assert.throws(()=>Results.validateStrategies(unsafe));
  const duplicate=structuredClone(strategies);const items=duplicate.scenarios['G1-03'].strategy.items;items.push(items[0]);assert.throws(()=>Results.validateStrategies(duplicate));
  assert.throws(()=>Results.mergeStrategies(content,strategies),/缺少對應現況頁/);
});
