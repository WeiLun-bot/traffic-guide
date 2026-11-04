'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Results=require('../assets/presentation-results.js'),Core=require('../assets/visual-editor-core.js'),content=require('../data/results/outline.json'),comparisons=require('../data/results/module-comparisons.json'),catalog=require('../data/modules/catalog.json'),scenarios=require('../data/scenarios/catalog.json');
function merged(){let data=Results.mergeConditions(content,require('../data/results/current-conditions.json'));for(const file of ['general-strategies','complex-strategies'])data=Results.mergeStrategies(data,require('../data/results/'+file+'.json'));return Results.mergeModuleComparisons(data,comparisons);}

test('the results deck has one module overview followed by all 15 comparisons, with preserved scenario pairs and legacy destinations',()=>{
  const data=merged(),pages=Results.buildPages(data,scenarios),start=pages.findIndex(page=>page.id==='results-modules');assert.equal(pages.length,114);assert.equal(new Set(pages.map(page=>page.id)).size,114);
  assert.equal(pages[start].resultType,'module-overview');assert.deepEqual(pages.slice(start+1,start+16).map(page=>page.resultsModule),catalog.modules.map(module=>module.id));assert.equal(pages[start+16].id,'results-review-g1-01');
  assert(!pages.some(page=>page.id==='results-module-list-2'));assert.equal(data.pageAliases['results-module-list-2'],'results-modules');assert.equal(pages.find(page=>page.id==='results-module-example').resultsModule,'M2-01');assert.equal(data.pageAliases['results-module-m2-01'],'results-module-example');
  for(const scene of scenarios.scenarios)assert.deepEqual(pages.filter(page=>page.resultsScenario===scene.id).map(page=>page.stage),['issue','strategy']);
});

test('each comparison uses its own supplied photos and an original SVG, plus concise points traced to the provided Typst',()=>{
  Results.validateModuleComparisons(comparisons);assert.equal(Object.keys(comparisons.modules).length,15);
  for(const module of catalog.modules){
    const example=comparisons.modules[module.id];assert.equal(example.title,module.name);assert.equal(example.source.moduleId,module.id);assert.match(example.source.file,/^chapters\/03-modules\/\d{2}-.+\.typ$/);assert.match(example.source.sha256,/^[a-f0-9]{64}$/);
    assert(example.items.length>=3&&example.items.length<=4);assert(example.items.every(point=>point.text.length<=85));assert(example.images.some(image=>image.role==='current'));assert.equal(example.images.filter(image=>image.role==='module').length,1);
    for(const image of example.images){const asset=comparisons.assets[image.key];assert.equal(asset.moduleId,module.id);assert(asset.file.startsWith('materials/03-modules/'+module.id+'/'));const bytes=fs.readFileSync(path.resolve(__dirname,'..',asset.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.deepEqual(require('../tools/typst-module-source.cjs').imageSize(path.resolve(__dirname,'..',asset.file)),[asset.width,asset.height]);assert.equal(asset.role,image.role);if(image.role==='current')assert.match(asset.file,/\.(png|jpe?g)$/);else assert(asset.file.endsWith('.svg'));}
  }
  assert(comparisons.assets[comparisons.modules['M2-01'].images.find(image=>image.role==='module').key].file.endsWith('M2-01_停管制路口代表型.svg'));
});

test('comparison input rejects cross-module photos and unsafe paths, and its editable points and cameras persist through history',()=>{
  const foreign=structuredClone(comparisons);foreign.modules['M1-01'].images[0].key=foreign.modules['M1-02'].images[0].key;assert.throws(()=>Results.validateModuleComparisons(foreign));
  const unsafe=structuredClone(comparisons);Object.values(unsafe.assets)[0].file='../../private.png';assert.throws(()=>Results.validateModuleComparisons(unsafe));
  const store=new Core.Store(require('./read-project-config.cjs')()),example=comparisons.modules['M1-01'],next=store.snapshot(),point=example.items[0];
  next.content.results[example.pageId]={points:[{...point,titleKey:example.pageId+'|results|'+point.id+'-title',textKey:example.pageId+'|results|'+point.id+'-text'}]};const view=Core.imageView(example.pageId,example.images.find(image=>image.role==='module').key);next.imageViews[view.id]={...view,zoom:1.3,rotation:37};store.commit(next);const saved=store.serialize();assert(store.undo());assert(store.redo());assert.equal(store.serialize(),saved);assert(Core.parse(saved).content.results[example.pageId]);
});
