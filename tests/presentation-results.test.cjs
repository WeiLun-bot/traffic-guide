'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Results=require('../assets/presentation-results.js'),Structure=require('../assets/presentation-structure.js');
const content=require('../data/results/outline.json'),catalog=require('../data/scenarios/catalog.json'),manifest=require('../data/presentations.json');
test('results presentation covers every scenario exactly once, with only G1-01 expanded into a two-page example',()=>{
  Results.validate(content);Structure.validate(manifest);
  const pages=Results.buildPages(content,catalog),ids=pages.map(page=>page.id),deck=manifest.presentations.find(deck=>deck.id==='results');
  assert.equal(new Set(ids).size,ids.length);assert.equal(ids[0],deck.entry);
  for(const chapter of deck.chapters){assert(pages.some(page=>page.id===chapter.entry&&page.chapter===chapter.id));assert(pages.filter(page=>page.chapter===chapter.id).length);}
  for(const scene of catalog.scenarios){const group=catalog.groups.find(group=>group.id===scene.group),entries=pages.filter(page=>page.resultsScenario===scene.id);assert.equal(entries.length,scene.id==='G1-01'?2:1);assert(entries.every(page=>page.chapter==='results-'+group.deck));assert.equal(entries[0].id,Results.scenarioPageId(scene.id));}
  assert.equal(pages.filter(page=>page.resultType==='scenario-placeholder').length,35);assert.equal(pages.filter(page=>page.resultType==='scenario-example').length,2);
  const issue=ids.indexOf('results-scenario-g1-01');assert.equal(ids[issue+1],'results-scenario-g1-01-strategy');assert.equal(ids[issue+2],'results-scenario-g1-02');
});
test('draft content rejects duplicate page and point identities, unsafe figures and invalid scenario stages',()=>{
  const duplicate=structuredClone(content);duplicate.pages.push(duplicate.pages[0]);assert.throws(()=>Results.validate(duplicate));
  const point=structuredClone(content);point.pages.find(page=>page.items).items.push(point.pages.find(page=>page.items).items[0]);assert.throws(()=>Results.validate(point));
  const image=structuredClone(content);image.scenarioExamples['G1-01'].issue.images[0].key='javascript:alert(1)';assert.throws(()=>Results.validate(image));
  const missing=structuredClone(content);delete missing.scenarioExamples['G1-01'].issue;assert.throws(()=>Results.validate(missing));
  assert.equal(Results.buildPages(null,catalog)[0].id,'results-intro');
});

test('extracted current conditions cover every scenario, retain G1-01 strategy and never substitute the unmatched living side road',()=>{
  const conditions=require('../data/results/current-conditions.json'),merged=Results.mergeConditions(content,conditions),pages=Results.buildPages(merged,catalog);
  assert.equal(Object.keys(conditions.scenarios).length,36);assert.equal(pages.filter(page=>page.stage==='issue').length,36);assert.equal(pages.filter(page=>page.resultType==='scenario-placeholder').length,0);
  assert.equal(pages.filter(page=>page.stage==='strategy').length,1);assert.deepEqual(merged.scenarioExamples['G1-01'].strategy,content.scenarioExamples['G1-01'].strategy);
  assert.equal(conditions.scenarios['C2-02'].reuseSource.scenario,'C4-04');assert(!conditions.scenarios['C2-02'].issue.sourceMissing);assert.equal(conditions.scenarios['C2-02'].issue.images.length,2);
  assert.equal(conditions.unmatched[0].id,'legacy-living-side-road');assert(!pages.some(page=>page.resultsScenario==='legacy-living-side-road'));
  for(const scene of catalog.scenarios){const entry=conditions.scenarios[scene.id];assert(entry);if(entry.issue.sourceMissing)continue;assert(entry.issue.images.some(image=>image.role==='diagram'));assert(entry.issue.items.length>=2);if(scene.id[0]==='G')assert(entry.issue.images.some(image=>image.role==='photo'));for(const image of entry.issue.images)assert.equal(conditions.assets[image.key].scenario,scene.id);}
  assert.equal(pages.length,64);
});

test('archived original files match source checksums and current-condition validation rejects cross-case images or unsafe paths',()=>{
  const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),conditions=require('../data/results/current-conditions.json');
  for(const asset of Object.values(conditions.assets)){const file=path.resolve(__dirname,'..',asset.file);assert(fs.statSync(file).isFile());assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),asset.sha256);}
  const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8'),data=require('../tools/presentation-source.cjs').dataFromHtml(html);
  assert.equal(crypto.createHash('sha256').update(require('../tools/presentation-source.cjs').imageBytes(path.resolve(__dirname,'..'),data.embeddedAssets['g101-before'].url)).digest('hex'),conditions.assets['g101-before'].sha256,'Reusing the G1-01 camera key requires identical source image bytes');
  const unsafe=structuredClone(conditions);Object.values(unsafe.assets)[0].file='../../private.png';assert.throws(()=>Results.validateConditions(unsafe));
  const foreign=structuredClone(conditions);foreign.scenarios['C1-01'].issue.images[0].key=conditions.scenarios['G1-02'].issue.images[0].key;assert.throws(()=>Results.validateConditions(foreign));
});

test('approved C2-02 reuse retains its identity and independent media IDs while tracing the unchanged C4-04 sources',()=>{
  const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),conditions=require('../data/results/current-conditions.json');
  const target=conditions.scenarios['C2-02'],source=conditions.scenarios['C4-04'],reference=target.reuseSource.source;
  assert.equal(target.name,catalog.scenarios.find(scene=>scene.id==='C2-02').name);assert.equal(reference.type,'scenario-reuse');
  const raw=fs.readFileSync(path.resolve(__dirname,'..',target.archive,reference.file));assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),reference.sha256);
  const snapshot=JSON.parse(raw);assert.equal(snapshot.scenario,'C2-02');assert.equal(snapshot.fromScenario,'C4-04');
  assert.deepEqual(target.issue.items,source.issue.items);assert.equal(target.issue.intro,source.issue.intro);assert.deepEqual(snapshot.issue,target.issue);
  assert.equal(target.issue.photoStatus,'available');assert.deepEqual(target.sourceSlides,source.sourceSlides);
  for(const [index,image]of target.issue.images.entries()){
    const asset=conditions.assets[image.key],original=conditions.assets[source.issue.images[index].key];
    assert(image.key.startsWith('results:c2-02-'));assert.equal(asset.scenario,'C2-02');assert(asset.file.includes('/C2-02/C2-02_'));
    assert.equal(asset.sha256,original.sha256);assert.notEqual(asset.file,original.file);assert.equal(asset.reusedFrom.key,source.issue.images[index].key);assert.deepEqual(asset.source,reference);
    assert.deepEqual({...image,key:source.issue.images[index].key},source.issue.images[index]);
  }
});

test('supplemental complex photos retain independent source provenance and match the reviewed scenario',()=>{
  const fs=require('node:fs'),path=require('node:path'),conditions=require('../data/results/current-conditions.json'),reviewed=require('../data/results/complex-photo-sources.json');
  Results.validateConditions(conditions);
  for(const [code,review]of Object.entries(reviewed.scenarios)){
    const entry=conditions.scenarios[code],photos=entry.issue.images.filter(image=>image.role==='photo');
    assert.equal(entry.issue.photoStatus,'available');assert(photos.length>=review.photos.length);assert(entry.issue.images.some(image=>image.role==='diagram'));
    assert.deepEqual(entry.photoSource.source,reviewed.source);assert.deepEqual(entry.photoSource.slides,review.photos.map(photo=>photo.slide));
    for(let i=0;i<review.photos.length;i++){
      const asset=conditions.assets[photos[i].key],source=review.photos[i];assert.equal(asset.sourcePart,source.part);assert.equal(asset.sourceSlide,source.slide);assert.equal(asset.sha256,source.sha256);assert.equal(asset.scenario,code);assert.deepEqual(asset.source,reviewed.source);
      const archive=JSON.parse(fs.readFileSync(path.resolve(__dirname,'..',entry.archive,'source.json'),'utf8'));
      assert(archive.supplementalSources.some(item=>item.source.sha256===reviewed.source.sha256&&item.files.some(file=>file.key===photos[i].key)));
    }
  }
  assert.notEqual(conditions.source.sha256,reviewed.source.sha256,'The original diagram source must remain independent');
  assert(conditions.supplementalSources.some(item=>item.source.sha256===reviewed.source.sha256));
});

test('confirmed user attachments retain their original files, case ownership and gallery identities',()=>{
  const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),conditions=require('../data/results/current-conditions.json');
  const sources=conditions.supplementalSources.filter(item=>item.source.type==='user-attachments');assert(sources.length>=2);
  for(const supplemental of sources)for(const code of supplemental.scenarios){
    const entry=conditions.scenarios[code],source=supplemental.source;assert.equal(entry.issue.photoStatus,'available');
    const raw=fs.readFileSync(path.resolve(__dirname,'..',entry.archive,source.file));assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),source.sha256);
    const archive=JSON.parse(raw);assert.equal(archive.scenario,code);assert(archive.files.length);
    for(const file of archive.files){const photo=entry.issue.images.find(image=>image.key===file.key),asset=conditions.assets[file.key];assert(photo);assert.equal(photo.role,'photo');assert.equal(asset.scenario,code);assert.deepEqual(asset.source,source);assert.equal(file.sha256,asset.sha256);assert(!photo.crop);}
  }
  assert(conditions.scenarios['G1-02'].issue.images.filter(image=>image.role==='photo').every(image=>image.key.startsWith('results:g1-02-')));
});

test('the new C1-06 photos remain separate from the corrected C1-07 set and both retain their diagrams',()=>{
  const fs=require('node:fs'),path=require('node:path'),conditions=require('../data/results/current-conditions.json');
  const old=conditions.scenarios['C1-06'],entry=conditions.scenarios['C1-07'];
  assert.equal(old.issue.photoStatus,'available');assert(old.photoSource);assert.equal(old.issue.images.filter(image=>image.role==='diagram').length,2);
  assert.deepEqual(entry.issue.images.filter(image=>image.role==='photo').map(image=>image.key),['results:c1-07-photo-1','results:c1-07-photo-2']);
  const archive=JSON.parse(fs.readFileSync(path.resolve(__dirname,'..',entry.archive,'C1-07_user-photos.json'),'utf8'));assert.equal(archive.correctedFrom,'C1-06');
  const current=JSON.parse(fs.readFileSync(path.resolve(__dirname,'..',old.archive,'C1-06_user-photos.json'),'utf8'));assert.equal(current.scenario,'C1-06');assert.equal(current.files.length,2);
  assert.deepEqual(current.files.map(file=>[file.width,file.height]),[[1806,1116],[1851,1191]]);
  assert(current.files.every(file=>!archive.files.some(other=>other.sha256===file.sha256)),'The two cases must use different photo sets');
  assert.equal(entry.issue.images.filter(image=>image.role==='diagram').length,2);
});

test('scenario issue and strategy items preserve stable text, module references and cameras through JSON and history',()=>{
  const Core=require('../assets/visual-editor-core.js'),fs=require('node:fs'),path=require('node:path');
  const old=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../layout/presentation-layout.json'),'utf8'));delete old.content.results;
  const store=new Core.Store(old);assert.deepEqual(store.config.content.results,{});
  const page='results-scenario-g1-02-strategy',issue='results-scenario-c2-02';
  const point=(id,pageId)=>({id,title:'標題 '+id,titleKey:pageId+'|results|'+id+'-title',text:'說明 '+id,textKey:pageId+'|results|'+id+'-text'});
  const next=store.snapshot();next.content.results[page]={points:[{...point('stop',page),moduleId:'M2-01'},point('new-note',page)]};next.content.results[issue]={points:[point('merge',issue)]};
  const camera=Core.imageView(page,'results:g1-02-strategy');next.imageViews[camera.id]={...camera,zoom:1.4,x:8,y:-3,rotation:90};store.commit(next);const saved=store.serialize();
  const changed=store.snapshot();changed.content.results[page].points.reverse();changed.content.results[issue].points=[];store.commit(changed);
  assert.equal(store.config.content.results[page].points[1].moduleId,'M2-01');assert.deepEqual(store.config.imageViews[camera.id],next.imageViews[camera.id]);
  assert(store.undo());assert.equal(store.serialize(),saved);assert(store.redo());assert.deepEqual(Core.parse(store.serialize()).content.results,store.config.content.results);assert.equal(store.config.content.results[issue].points.length,0);
  for(const change of [value=>value.content.results[page].points.push({...value.content.results[page].points[0]}),value=>value.content.results[page].points[0].titleKey='',value=>value.content.results[page].points[0].moduleId='../bad',value=>value.content.results['m201-stop-layout']={points:[]}]){const invalid=store.snapshot();change(invalid);assert.throws(()=>store.commit(invalid));}
});
