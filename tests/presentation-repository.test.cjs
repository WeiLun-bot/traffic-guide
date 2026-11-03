'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Repository}=require('../assets/presentation-repository.js');
const root=path.resolve(__dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
test('metadata alone validates saved overview links and resolves every case and module without fetching details',async()=>{
  const files=[],repository=new Repository({read:async file=>{files.push(file);return read(file);}});await repository.ready;
  assert.deepEqual(files,['data/presentation-registry.json']);const data=repository.fresh();
  assert.equal(data.scenarios.length,18);assert.equal(data.articles.length,131);
  require('../assets/visual-editor-core.js').validateOverviewReferences(read('layout/presentation-layout.json'),data);
  assert(data.articles.every(article=>article.points.length===0));
  assert.deepEqual(repository.requirements({id:'presentations',kind:'presentations-home'}),[]);
  assert.deepEqual(repository.requirements({id:'m101-overview',kind:'module',moduleId:'M1-01'}),['module:M1-01']);
});
test('concurrent loads share one request, cache successes and keep source documents immutable',async()=>{
  const files=[],repository=new Repository({read:async file=>{files.push(file);return read(file);}});await repository.ready;
  await Promise.all(Array.from({length:5},()=>repository.ensure('scenario:G1-01')));assert.equal(files.filter(file=>file==='data/scenarios/G1-01.json').length,1);
  const data=repository.fresh(),article=data.articles.find(article=>article.id==='edge');assert.equal(article.points.length,3);
  article.points[0]='temporary editor mutation';assert.notEqual(repository.fresh().articles.find(article=>article.id==='edge').points[0],article.points[0]);
  assert.equal(repository.fresh().scenarios.find(scene=>scene.id==='g1-01').presentation.context.cropFraction,.56);
  assert.equal(repository.revision,1);await repository.ensure('scenario:G1-01');assert.equal(repository.revision,1);
});
test('failed loads retry, malformed ownership never enters the cache and unrelated resources remain usable',async()=>{
  let failed=true;const repository=new Repository({read:async file=>{if(file==='data/modules/M1-01.json'&&failed)throw new Error('temporary failure');return read(file);}});await repository.ready;
  await assert.rejects(repository.ensure('module:M1-01'),/temporary failure/);assert.equal(repository.get('module:M1-01'),undefined);
  await repository.ensure('scenario:G1-02');failed=false;await repository.ensure('module:M1-01');assert.equal(repository.get('module:M1-01').id,'M1-01');
  const invalid=new Repository({read:async file=>file==='data/modules/M1-01.json'?{schemaVersion:1,id:'M2-01'}:read(file)});await invalid.ready;await assert.rejects(invalid.ensure('module:M1-01'),/歸屬不符/);assert.equal(invalid.get('module:M1-01'),undefined);
});
