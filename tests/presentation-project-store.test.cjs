'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Document=require('../assets/presentation-document.js'),Core=require('../assets/visual-editor-core.js'),Project=require('../tools/presentation-project-store.cjs');
const root=path.resolve(__dirname,'..');
function config(){const result=Document.empty();result.updatedAt='2026-11-04T00:00:00.000Z';return Core.validate(result);}
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'traffic-guide-project-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function writePlan(dir,value,owners={}){for(const [file,bytes]of Object.entries(Project.plan(value,owners))){const target=path.join(dir,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}}
test('content, navigation and sparse layout have independent ownership and lossless runtime reconstruction',()=>{
  const c=config(),element=Core.element('context',0,'text',{type:'edit-key',value:'context|shared|title'}),changed=Core.element('context',0,'image',{type:'image-key',value:'overall'});
  c.elements[element.id]=element;c.elements[changed.id]={...changed,x:12};
  c.legacyState.texts={'context|shared|title':'案例標題','results-scenario-c1-01|results|a-text':'複雜情境','m101-lanes-issues|module|a-title':'模組文字','context|point':'舊鏡像'};
  c.legacyState.pageOrder=['context','m101-lanes-issues'];c.coverArt={'results-intro':{rotation:-40,tilt:52,scale:1,x:0,y:0}};
  c.legacyState.blocks['context|1']={added:[],removed:['metric'],decor:{metric:{border:false}}};
  c.content.articles.context={points:[{id:'a',text:'正式解說',textKey:'context|point'}]};
  const owners={context:'scenarios/G1-01'},parts=Document.split(c,owners),restored=Document.join(parts.layout,parts.navigation,Object.values(parts.documents));
  assert(!parts.layout.content);assert(!parts.layout.legacyState.texts);assert(!parts.layout.legacyState.images);assert(!parts.layout.legacyState.pageOrder);
  assert.equal(Object.keys(parts.layout.elements).length,1);assert.equal(parts.documents['scenarios/G1-01'].texts['context|shared|title'],'案例標題');
  assert(parts.documents['modules/M1-01']);assert(parts.documents['results/scenarios/C1-01']);assert(!parts.documents['scenarios/G1-01'].texts['context|point']);
  assert.equal(restored.legacyState.texts['context|point'],'正式解說');assert.deepEqual(restored.legacyState.blocks,c.legacyState.blocks);assert.deepEqual(restored.coverArt,c.coverArt);assert.deepEqual(restored.legacyState.pageOrder,c.legacyState.pageOrder);
  assert.deepEqual(Document.split(restored,owners),parts);assert.deepEqual(Document.parse(JSON.stringify(Document.bundle(c,owners))),restored);
});
test('project saves preserve unrelated module files, reject stale revisions and externalize replacement images',t=>{
  const dir=fixture(t),c=config();c.legacyState.texts['m101-overview|shared|title']='模組一';c.legacyState.texts['m201-overview|shared|title']='模組二';
  writePlan(dir,c);const first=Project.read(dir),untouched=fs.readFileSync(path.join(dir,'data/content/modules/M2-01.json'));
  const next=Core.clone(first.config);next.legacyState.texts['m101-overview|shared|title']='新標題';next.legacyState.images['module:test']={src:'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'),alt:'新圖'};
  const saved=Project.save({root:dir,config:next,expectedRevision:first.revision});assert(saved.backup);const after=Project.read(dir);
  assert.equal(after.config.legacyState.texts['m101-overview|shared|title'],'新標題');assert(fs.readFileSync(path.join(dir,'data/content/modules/M2-01.json')).equals(untouched));
  const image=after.config.legacyState.images['module:test'];assert.match(image.src,/^materials\/edited\/[a-f0-9]{64}\.svg$/);assert(fs.existsSync(path.join(dir,image.src)));assert(Project.releaseFiles(dir).includes(image.src));
  assert.throws(()=>Project.save({root:dir,config:c,expectedRevision:first.revision}),/其他程式修改/);assert.equal(Project.read(dir).revision,after.revision);
});
test('failed multi-file writes roll back every modified file and retain the backup',t=>{
  const dir=fixture(t),c=config();writePlan(dir,c);const before=Project.read(dir),next=Core.clone(c);next.legacyState.texts['context|title']='新增';next.updatedAt='later';let writes=0;
  assert.throws(()=>Project.save({root:dir,config:next,expectedRevision:before.revision,write(file,bytes){fs.writeFileSync(file,bytes);if(++writes===2)throw new Error('simulated disk error');}}),/simulated disk error/);
  assert.equal(Project.read(dir).revision,before.revision);assert(fs.readdirSync(path.join(dir,'exports/project-backups')).length);
});
test('legacy migration preserves collaborator edits, cameras, cover art and content, and is idempotent',t=>{
  const dir=fixture(t),current=Project.read(root),c=current.config;
  fs.mkdirSync(path.join(dir,'layout'),{recursive:true});fs.mkdirSync(path.join(dir,'data'),{recursive:true});fs.writeFileSync(path.join(dir,Document.layoutFile),JSON.stringify(c));
  fs.copyFileSync(path.join(root,'data/presentation-registry.json'),path.join(dir,'data/presentation-registry.json'));
  const result=Project.migrate({root:dir});assert(result.migrated);const migrated=Project.read(dir);
  assert.deepEqual(migrated.config.content,c.content);assert.deepEqual(migrated.config.imageViews,Object.fromEntries(Object.entries(c.imageViews).filter(([,v])=>v.zoom!==1||v.x!==0||v.y!==0||(v.rotation||0)!==0||v.fit||v.flipX||v.flipY||v.aspect)));assert.deepEqual(migrated.config.coverArt,c.coverArt);
  for(const [key,text]of Object.entries(c.legacyState.texts))assert.equal(migrated.config.legacyState.texts[key],text,'Text changed: '+key);
  assert(result.layoutBytes<result.beforeBytes);const revision=migrated.revision;assert.equal(Project.migrate({root:dir}).migrated,false);assert.equal(Project.read(dir).revision,revision);
});
test('content catalogs cannot traverse paths or introduce duplicate content keys',()=>{
  for(const owner of ['../escape','modules/../escape','__proto__','modules/M1-01/extra'])assert(!Document.validOwner(owner));
  assert.throws(()=>Document.validateCatalog({kind:'presentation-content-catalog',schemaVersion:1,owners:{},files:['data/content/../../escape.json']}));
  const parts=Document.split(config()),doc={schemaVersion:1,owner:'shared',texts:{a:'first'},images:{},blocks:{},pages:[],content:{}};
  assert.throws(()=>Document.join(parts.layout,parts.navigation,[doc,{...doc,texts:{a:'second'}}]),/重複/);
});
test('hosted presentations use portable project backups without probing a local write API',async()=>{
  const {ProjectFiles}=require('../assets/visual-editor-io.js');let requests=0;
  const files=new ProjectFiles({PresentationDocument:Document,document:{baseURI:'https://example.test/presentation/index.html'},fetch:async()=>{requests++;throw new Error('No local API on a static host');}});
  assert.equal(await files.connectLocal(),null);assert.equal(requests,0);const c=config();c.legacyState.texts['context|title']='Static content';
  const saved=await files.save(c);assert(saved.download);assert.equal(Document.parse(saved.text).legacyState.texts['context|title'],'Static content');assert.equal(JSON.parse(saved.text).kind,'presentation-project');
});
test('local save endpoint is authenticated, checks revisions, and static viewers expose no write API',async t=>{
  const {createServer}=require('../tools/serve-github-pages.cjs'),dir=fixture(t),c=config();writePlan(dir,c);fs.writeFileSync(path.join(dir,'index.html'),'<!doctype html><title>fixture</title>');
  const server=createServer(dir,{projectRoot:dir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port+'/presentation-demo/';
  const initial=await(await fetch(base+'__project')).json(),next=Core.clone(initial.config);next.legacyState.texts['context|title']='HTTP 儲存';
  const post=(token,revision,origin)=>fetch(base+'__project',{method:'POST',headers:{'Content-Type':'application/json','X-Project-Token':token,...origin?{Origin:origin}:{}},body:JSON.stringify({revision,config:next})});
  assert.equal((await post('wrong',initial.revision)).status,403);assert.equal((await post(initial.token,initial.revision,'https://unrelated.example')).status,403);
  assert.equal((await post(initial.token,initial.revision)).status,200);assert.equal((await post(initial.token,initial.revision)).status,409);assert.equal(Project.read(dir).config.legacyState.texts['context|title'],'HTTP 儲存');
  const staticServer=createServer(dir);await new Promise(resolve=>staticServer.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>staticServer.close(resolve)));assert.equal((await fetch('http://127.0.0.1:'+staticServer.address().port+'/__project',{method:'POST'})).status,405);
});

// An old preview process must never report success after dropping new route fields.
test('local save verifies that route geometry survived the server round trip',async()=>{
  const {ProjectFiles}=require('../assets/visual-editor-io.js'),c=config();
  c.roadFlowPaths={'results-road-clarity':{assetKey:'results:c1-08-layout',routes:[{id:'north-west',points:[[100,200],[300,400]]}]}};
  const old=structuredClone(c);delete old.roadFlowPaths;
  const files=new ProjectFiles({PresentationDocument:Document,fetch:async(_url,options)=>({ok:true,json:async()=>options?.method==='POST'?{revision:'new'}:{config:old}})});
  files.local={url:'http://127.0.0.1:4173/__project',token:'token',revision:'old'};
  await assert.rejects(files.save(c),/路線未完整寫入/);
});
