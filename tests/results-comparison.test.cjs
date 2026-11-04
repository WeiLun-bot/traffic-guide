'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Results=require('../assets/presentation-results.js'),Core=require('../assets/visual-editor-core.js'),outline=require('../data/results/outline.json'),catalog=require('../data/scenarios/catalog.json');
const page=Results.buildPages(outline,catalog).find(page=>page.id==='results-review');
test('the review compares the requested original and modular drawings with blank numbered notes',()=>{
  Results.validate(outline);assert.equal(page.resultType,'comparison');assert.equal(Results.stepCount(page),2);assert(page.content.items.every(point=>point.title===''&&point.text===''));
  assert(outline.assets[page.content.images[0].key].file.endsWith('01_情境_台北市松山區南京東路光復北路舊版.png'));
  assert(outline.assets[page.content.images[1].key].file.endsWith('C1-01_號誌化左或右錯位T字路口交通設施設置圖例.svg'));
  for(const image of page.content.images){const asset=outline.assets[image.key],file=path.resolve(__dirname,'..',asset.file);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),asset.sha256);assert.deepEqual(require('../tools/typst-module-source.cjs').imageSize(file),[asset.width,asset.height]);}
});
test('each note owns two independent highlights, and changing the number or order of notes updates navigation without changing identities',()=>{
  const specs=page.content.items.flatMap(point=>page.content.images.map(image=>Results.comparisonSpec(page,point,image,outline.assets[image.key])));assert.equal(new Set(specs.map(spec=>spec.key)).size,4);
  const image=page.content.images[0],asset=outline.assets[image.key],point=page.content.items[0],spec=specs[0],box=[100,200,500,400],state={highlights:{[spec.key]:{box,rotation:23,crop:[0,0,1600,1400],imageKey:image.key}}};
  assert.deepEqual(Results.comparisonSpec(page,point,image,asset,state).box,box);assert.equal(Results.comparisonSpec(page,point,image,asset,state).rotation,23);assert.deepEqual(Results.comparisonSpec(page,page.content.items[1],image,asset,state).box,specs[2].box);
  state.disabledHighlights={[spec.key]:true};assert(!Results.comparisonSpec(page,point,image,asset,state).enabled);
  const config=Core.parse(fs.readFileSync(path.resolve(__dirname,'../layout/presentation-layout.json'),'utf8'));config.content.results[page.id]={points:page.content.items.map(point=>({id:point.id,title:'',text:'',titleKey:page.id+'|results|'+point.id+'-title',textKey:page.id+'|results|'+point.id+'-text'}))};
  config.content.results[page.id].points.push({id:'added',title:'',text:'',titleKey:page.id+'|results|added-title',textKey:page.id+'|results|added-text'});assert.equal(Results.stepCount(page,Core.parse(JSON.stringify(config))),3);
  config.content.results[page.id].points.reverse();assert.equal(Results.comparisonSpec(page,point,image,asset,state).key,spec.key);config.content.results[page.id].points=[];assert.equal(Results.stepCount(page,config),1);
});
test('comparison validation rejects unsafe images, missing pairs and out-of-image highlight defaults',()=>{
  for(const change of [value=>{value.pages.find(page=>page.id==='results-review').images.pop();},value=>{value.assets[page.content.images[0].key].file='../../private.png';},value=>{value.pages.find(page=>page.id==='results-review').items[0].focus[page.content.images[0].key].rect=[0,0,9000,400];}]){const invalid=structuredClone(outline);change(invalid);assert.throws(()=>Results.validate(invalid));}
});

test('the additional G1-01 comparison retains its requested originals and saves notes and highlights independently of C1-01',()=>{
  const pages=Results.buildPages(outline,catalog),index=pages.findIndex(page=>page.id==='results-review-g1-01'),added=pages[index];
  assert.equal(pages[index+1].id,'results-review');assert.equal(pages[index+2].id,'results-general');assert.equal(added.chapter,'results-review');assert.equal(added.resultType,'comparison');assert.equal(Results.stepCount(added),1);
  const [before,after]=added.content.images.map(image=>outline.assets[image.key]);
  assert.equal(before.file,'materials/04-一般道路情境/G1-01/G1-01_無號誌市區正交三岔路口交叉設施設置圖例_舊.png');
  assert.equal(after.file,'materials/04-一般道路情境/G1-01/G1-01_無號誌市區正交三岔路口交叉設施設置圖例.svg');
  assert.deepEqual([before.width,before.height,after.width,after.height],[1361,1743,913,1402]);
  for(const asset of [before,after]){assert.equal(asset.scenario,'G1-01');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'..',asset.file))).digest('hex'),asset.sha256);}
  const config=Core.parse(fs.readFileSync(path.resolve(__dirname,'../layout/presentation-layout.json'),'utf8')),existing=structuredClone(config),point=added.content.items[0];
  config.content.results[added.id]={points:[{id:point.id,title:'路口比較',text:'差異說明',descriptionHidden:true,titleKey:added.id+'|results|'+point.id+'-title',textKey:added.id+'|results|'+point.id+'-text'}]};
  const image=added.content.images[0],spec=Results.comparisonSpec(added,point,image,before),oldSpec=Results.comparisonSpec(page,page.content.items[0],page.content.images[0],outline.assets[page.content.images[0].key]);
  assert.notEqual(spec.key,oldSpec.key);config.legacyState.highlights[spec.key]={box:[100,200,300,400],crop:[0,0,1361,1743],imageKey:image.key};
  const restored=Core.parse(JSON.stringify(config));assert.equal(restored.content.results[added.id].points[0].descriptionHidden,true);assert.deepEqual(restored.content.results[page.id],existing.content.results[page.id]);assert.deepEqual(restored.imageViews,existing.imageViews);assert.deepEqual(restored.legacyState.highlights[oldSpec.key],existing.legacyState.highlights[oldSpec.key]);
  assert.deepEqual(Results.comparisonSpec(added,point,image,before,restored.legacyState).box,[100,200,300,400]);
  const foreign=structuredClone(outline);foreign.pages.find(p=>p.id===added.id).images[1]=foreign.pages.find(p=>p.id===page.id).images[1];assert.throws(()=>Results.validate(foreign));
});
