'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const Core = require('../assets/visual-editor-core.js');
const {Files} = require('../assets/visual-editor-io.js');
const {createServer} = require('../tools/serve-github-pages.cjs');
const root = path.resolve(__dirname, '..');
const original = () => Core.parse(fs.readFileSync(path.join(root, 'layout/presentation-layout.json'), 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
test('original data and unaffected presentation blocks remain unchanged', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/presentation-baseline.json'), 'utf8'));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(hash(html.match(/<script id="presentation-data" type="application\/json">([\s\S]*?)<\/script>/)[1]), baseline.data);
  // The external JSON is user-editable; its current highlights and layout may
  // legitimately differ from the original migration fixture.
  Core.validate(original());
  assert.match(html, /id="editor-saved-data"[^>]+data-source="layout\/presentation-layout.json"><\/script>/);
  for (const match of html.matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    if (/type="application\/json"|\bsrc=/.test(match[2])) continue;
    const id = match[2].match(/id="([^"]+)"/)?.[1] || 'anonymous';
    // These blocks intentionally change comparison placement, article headings,
    // and the shared content/visual editing controls.
    if (match[1] === 'script' && ['general-editor', 'general-formatting', 'general-current-conditions', 'general-scenario-structure', 'anonymous'].includes(id)) continue;
    if (match[1] === 'style' && id === 'overview-comparison-layout-styles') continue;
    let content = match[3];
    if (match[1] === 'script' && id === 'anonymous') content = content.replace('(async () => {', '(() => {').replace('\n  await window.visualLayoutReady;', '').replace('\n    window.visualLayoutEditor?.beforeRender();', '').replace('\n    window.visualLayoutEditor?.render();', '').replace('||window.visualLayoutEditor?.editing||', '||').replace('\n  window.visualLayoutEditor?.connect(window.generalRoadPresentation);', '');
    assert.equal(hash(content), baseline[match[1] === 'style' ? 'styles' : 'scripts'][id], 'Original block changed: ' + id);
  }
});
test('comparison relocation preserves article animation and original-image interactions', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/overview-relocation.json'), 'utf8'));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  const runtime = html.match(/<script>\n'use strict';([\s\S]*?)<\/script>/)[1];
  for (const [name, expected] of Object.entries(fixture.unaffected)) {
    const start = runtime.indexOf('  function ' + name + '('), end = runtime.indexOf('\n  function ', start + 1);
    let source = runtime.slice(start, end < 0 ? runtime.length : end);
    // The article heading now identifies its subject; all other rendering stays intact.
    if (name === 'explainArticle') source = source.replace('return `<div>${top}<h2>${esc(article.name)}</h2><div class="metric-row', 'return `<div>${top}<h2>${esc(article.headline)}</h2><div class="metric-row');
    if(name==='showAsset')source=source.replace("data.assetMeta[key]?.module?data.assetMeta[key].module+' / ORIGINAL DIAGRAM':", '');
    assert(start >= 0); assert.equal(hash(source), expected, name + ' changed');
  }
});
test('all four scenarios separate current issues from the reusable comparison and retain saved alignment keys', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const data = JSON.parse(html.match(/<script id="presentation-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const state = original().legacyState, calls = [];
  const window = {generalRoadEditor: {state, editing: false, getComparisonTransform(key, side) {calls.push([key, side]);return state.comparisonTransforms[key]?.[side] || {x: 0, y: 0, scaleX: 1, scaleY: 1, angle: 0};}}};
  for (const id of ['general-current-conditions', 'general-scenario-structure']) {
    const code = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'))[1];
    new vm.Script(code).runInNewContext({window});
  }
  const scenarios = window.generalRoadScenarios.create(data);
  for (const scene of data.scenarios) {
    const problems = window.generalRoadConditions.render(scene, data);
    assert.match(problems, /<h1 id="slide-title">現況問題<\/h1>/);
    assert(!problems.includes('compare-stage')); assert(!problems.includes('ON SITE')); assert(!problems.includes('conditions-issues-heading'));
    assert(problems.includes('conditions-current-figure') && problems.includes('conditions-current-diagram'));
    assert.match(problems, /class="scenario-detail-image conditions-current-diagram"[^>]+preserveAspectRatio="xMidYMid slice"/);
    assert(problems.includes('data-editor-image-key="' + scene.currentConditions.before + '"'));
    assert(problems.includes('<aside class="conditions-issues context-issues"'));
    assert(problems.indexOf('conditions-current-figure') < problems.indexOf('<aside class="conditions-issues context-issues"'));
    for (const photo of scene.currentConditions.photos) {assert(problems.includes(photo.title));assert(problems.includes('data-asset="' + photo.image + '"'));}
    const comparison = window.generalRoadConditions.comparison(scene, data);
    assert(comparison.includes('data-comparison-key="' + scene.currentConditions.pageId + '"'));
    assert(comparison.includes('data-asset="' + scene.currentConditions.before + '"'));
    assert(comparison.includes('data-asset="' + scene.currentConditions.after + '"'));
    assert(comparison.includes('compare-handle') && comparison.includes('compare-range'));
    assert(calls.some(([key, side]) => key === scene.currentConditions.pageId && side === 'before'));
    const pages = scenarios.pages(scene);
    assert.equal(pages.find(page => page.id === scene.currentConditions.pageId).name, scene.code + ' 現況問題');
    assert.equal(pages.find(page => page.id === scene.overviewId).name, scene.code + ' 整體佈設策略');
  }
  const first = window.generalRoadConditions.render(data.scenarios[0], data);
  for (const index of [4, 5, 8, 9]) assert(first.includes('data-block-edit-key="g101-conditions|0|text-' + index + '"'));
});
test('IDs persist across text changes and do not collide between pages, phases and kinds', () => {
  const target = {type: 'edit-key', value: 'edge|1|text-2'};
  const item = Core.element('edge', 1, 'text', target);
  assert.deepEqual(item, Core.element('edge', 1, 'text', target));
  assert.equal(new Set([item.id, Core.element('edge', 0, 'text', target).id, Core.element('parking', 1, 'text', target).id, Core.element('edge', 1, 'image', target).id]).size, 4);
});
test('passive registration preserves layout; history, reset and JSON round trips restore values', () => {
  const store = new Core.Store(original());
  const entry = Core.element('edge', 1, 'text', {type: 'edit-key', value: 'edge|1|text-2'});
  store.register(entry); assert.equal(store.dirty, false); assert.equal(Core.overrides(entry), false);
  store.patch(entry.id, {x: 24, y: -12, width: 360, fontSize: 27, fontFamily: 'serif'});
  assert.equal(store.past.length, 1); assert.equal(store.dirty, true);
  const changed = store.serialize();
  assert.equal(store.undo(), true); assert.equal(store.dirty, false);
  assert.equal(store.redo(), true); assert.equal(store.serialize(), changed);
  assert.deepEqual(Core.parse(changed), store.snapshot());
  store.markSaved(store.snapshot()); store.patch(entry.id, {x: 45}); store.undo(); assert.equal(store.dirty, false);
  store.patch(entry.id, entry); assert.equal(Core.overrides(store.config.elements[entry.id]), false);
});
test('invalid numbers, prototypes, identities and legacy settings are rejected atomically', () => {
  const config = original(), item = Core.element('edge', 1, 'text', {type: 'path', value: 'section:0>p:1'});
  config.elements[item.id] = item;
  for (const patch of [{fontSize: Infinity}, {x: NaN}, {width: -1}, {fontFamily: 'url(https://bad.invalid)'}, {id: 'wrong'}]) {
    const invalid = Core.clone(config); Object.assign(invalid.elements[item.id], patch); assert.throws(() => Core.validate(invalid));
  }
  assert.throws(() => Core.parse('{"__proto__": {"polluted": true}}'));
  const broken = Core.clone(config); broken.legacyState.styles = null; assert.throws(() => Core.validate(broken));
  assert.equal({}.polluted, undefined);
  const store = new Core.Store(config), snapshot = store.serialize();
  assert.throws(() => store.patch(item.id, {height: 0})); assert.equal(store.serialize(), snapshot); assert.equal(store.past.length, 0);
});
test('initial image views are independent, backward compatible, and survive JSON/history round trips', () => {
  const old=original();delete old.imageViews;
  const store=new Core.Store(old);assert.deepEqual(store.config.imageViews,{});
  const first=Core.imageView('context','g101-before'),second=Core.imageView('g101-conditions','g101-before');
  assert.notEqual(first.id,second.id);
  let next=store.snapshot();next.imageViews[first.id]=first;store.commit(next);assert.equal(store.dirty,false);
  next=store.snapshot();next.imageViews[first.id]={...first,zoom:1.5,x:12,y:-7};next.imageViews[second.id]={...second,zoom:2,x:-4,y:9};store.commit(next);
  const saved=store.serialize();assert.deepEqual(Core.parse(saved).imageViews,store.config.imageViews);
  assert(store.undo());assert.equal(store.dirty,false);assert(store.redo());assert.equal(store.serialize(),saved);
  store.markSaved(store.snapshot());assert.equal(store.dirty,false);
  next=store.snapshot();next.imageViews[first.id].zoom=0;assert.throws(()=>store.commit(next));assert.equal(store.serialize(),saved);
  next=store.snapshot();next.imageViews[first.id].x=Infinity;assert.throws(()=>store.commit(next));
  next=store.snapshot();next.imageViews[first.id].assetKey='other';assert.throws(()=>store.commit(next));
});
test('capturing and restoring an initial camera preserves zoom, offsets and aspect ratio', () => {
  const home=[0,35,2454,1101.52],settings={zoom:1.75,x:14.2,y:-9.5};
  const view=Core.viewBoxFor(home,settings),captured=Core.settingsForView(home,view);
  for(const key of ['zoom','x','y'])assert(Math.abs(captured[key]-settings[key])<1e-9);
  assert(Math.abs(view[2]/view[3]-home[2]/home[3])<1e-9);
  assert(view[0]<Core.viewBoxFor(home,{...settings,x:0})[0],'Positive X shifts image right');
  assert(view[1]>Core.viewBoxFor(home,{...settings,y:0})[1],'Negative Y shifts image up');
  assert.deepEqual(Core.viewBoxFor(home,{zoom:1,x:0,y:0}),home);
  assert.throws(()=>Core.settingsForView(home,[0,0,0,1]));
});

test('structured content is backward compatible and preserves identities through ordering, deletion, history and JSON',()=>{
  const legacy=original();delete legacy.content;
  const store=new Core.Store(legacy);assert.deepEqual(store.config.content,{conditions:{},articles:{},overviews:{},modules:{}});
  const next=store.snapshot();
  const point=id=>({id,text:'說明 '+id,textKey:'context|content|'+id});
  next.content.conditions['g101-conditions']={issues:[{id:'issue-a',title:'現況問題',titleKey:'context|title',imageKey:'content:issue-a',photo:false,points:[point('a'),point('b')]}]};
  next.content.articles.edge={points:[point('article-a'),point('article-b')]};store.commit(next);
  const saved=store.serialize();const reordered=store.snapshot();reordered.content.conditions['g101-conditions'].issues[0].points.reverse();reordered.content.articles.edge.points.splice(0,1);store.commit(reordered);
  assert.equal(store.config.content.conditions['g101-conditions'].issues[0].points[0].textKey,'context|content|b');
  assert(store.undo());assert.equal(store.serialize(),saved);assert(store.redo());
  assert.deepEqual(Core.parse(store.serialize()).content,store.config.content);
  for(const change of [value=>value.content.articles.edge.points.push({...value.content.articles.edge.points[0]}),value=>value.content.conditions['g101-conditions'].issues[0].points[0].text=42]){const invalid=store.snapshot();change(invalid);assert.throws(()=>store.commit(invalid));}
});
test('overview strategies retain linked articles and stable identities through history and reject invalid navigation',()=>{
  const config=original();config.content.overviews.overview={items:[
    {id:'first',title:'界定空間',titleKey:'overview|strategy|first',articleIds:['edge','parking'],targetId:'edge'},
    {id:'plain',title:'補充策略',titleKey:'overview|strategy|plain',articleIds:[],targetId:null}
  ]};
  const data={scenarios:[{id:'g1-01',overviewId:'overview'},{id:'g1-02',overviewId:'g102-overview'}],articles:[{id:'edge',scenario:'g1-01'},{id:'parking',scenario:'g1-01'},{id:'rural-stopline',scenario:'g1-02'}]};
  const store=new Core.Store(Core.validateOverviewReferences(config,data));
  const next=store.snapshot();next.content.overviews.overview.items.reverse();store.commit(next);
  assert.equal(store.config.content.overviews.overview.items[1].titleKey,'overview|strategy|first');
  assert.deepEqual(store.config.content.overviews.overview.items[1].articleIds,['edge','parking']);assert(store.undo());assert(store.redo());
  assert.deepEqual(Core.parse(store.serialize()).content.overviews,store.config.content.overviews);
  for(const mutate of [value=>value.content.overviews.overview.items[1].targetId='school',value=>value.content.overviews.overview.items[1].articleIds.push('edge'),value=>value.content.overviews.overview.items.push({...value.content.overviews.overview.items[0]})]){const invalid=store.snapshot();mutate(invalid);assert.throws(()=>Core.validate(invalid));}
  for(const target of ['rural-stopline','missing']){const invalid=store.snapshot();invalid.content.overviews.overview.items[1].articleIds=[target];invalid.content.overviews.overview.items[1].targetId=target;Core.validate(invalid);assert.throws(()=>Core.validateOverviewReferences(invalid,data));}
  const missing=store.snapshot();missing.content.overviews.unknown={items:[]};assert.throws(()=>Core.validateOverviewReferences(missing,data));
});
function fileEnvironment(text = JSON.stringify(original())) {
  let contents = text, allow = true, failWrite = false, writeCount = 0, pickerCount = 0, abortCount = 0;
  const handle = {
    name: 'presentation-layout.json', queryPermission: async () => allow ? 'granted' : 'prompt', requestPermission: async () => allow ? 'granted' : 'denied',
    getFile: async () => ({size: contents.length, text: async () => contents}),
    createWritable: async () => ({write: async value => { if (failWrite) throw new Error('disk full'); contents = value; writeCount++; }, close: async () => {}, abort: async () => { abortCount++; }})
  };
  const env = {isSecureContext: true, showOpenFilePicker: async () => { pickerCount++; return [handle]; }, showSaveFilePicker: async () => { pickerCount++; return handle; }};
  return {env, handle, setContents: value => {contents = value;}, deny: () => {allow = false;}, fail: () => {failWrite = true;}, get contents() {return contents;}, get writes() {return writeCount;}, get pickers() {return pickerCount;}, get aborts() {return abortCount;}};
}
test('native saving reuses one authorized file handle and reload reads the same file', async () => {
  const mock = fileEnvironment(), files = new Files(mock.env);
  const config = await files.open(); await files.save(config); await files.save(config);
  assert.equal(mock.pickers, 1); assert.equal(mock.writes, 2); assert.deepEqual(await files.read(), config);
});
test('denial, cancellation, disk failure and concurrent external edits do not discard the editor state', async () => {
  const mock = fileEnvironment(), files = new Files(mock.env), config = await files.open();
  mock.setContents(mock.contents + '\n'); await assert.rejects(files.save(config), {name: 'ConflictError'}); assert.equal(mock.writes, 0);
  await files.read(); mock.deny(); await assert.rejects(files.save(config), /授權/); assert.equal(mock.writes, 0);
  const broken = fileEnvironment(), writer = new Files(broken.env); await writer.open(); broken.fail(); await assert.rejects(writer.save(config), /disk full/); assert.equal(broken.aborts, 1);
  const abort = new Error('cancelled'); abort.name = 'AbortError'; const cancelled = new Files({...mock.env, showOpenFilePicker: async () => {throw abort;}});
  await assert.rejects(cancelled.open(), {name: 'AbortError'}); assert.equal(cancelled.handle, null);
  const store = new Core.Store(config); assert.equal(store.serialize(), JSON.stringify(config, null, 2) + '\n');
});
test('unsupported browsers export valid JSON and malformed imports leave the linked file unchanged', async () => {
  const files = new Files({isSecureContext: true}), result = await files.save(original());
  assert.equal(result.download, true); assert.deepEqual(Core.parse(result.text), original());
  const mock = fileEnvironment(), native = new Files(mock.env); await native.open();
  mock.setContents('{broken'); await assert.rejects(native.read()); assert.equal(native.handle, mock.handle); assert.equal(mock.writes, 0);
});
test('UTF-8 limits apply before saving as well as loading', async () => {
  assert.throws(() => Core.checkSize('字'.repeat(9 * 1024 * 1024)), /25 MB/);
  const config = original(); config.legacyState.texts.large = 'a'.repeat(26 * 1024 * 1024);
  await assert.rejects(new Files({}).save(config), /25 MB/);
});
test('the existing figure-version tool reads external JSON and writes a separate configuration', () => {
  fs.mkdirSync(path.join(__dirname, 'artifacts'), {recursive: true});
  const fixture = fs.mkdtempSync(path.join(__dirname, 'artifacts', 'variant-'));
  try {
    for (const directory of ['tools', 'assets', 'layout']) fs.mkdirSync(path.join(fixture, directory));
    for (const file of ['index.html', 'tools/create-general-scenarios-figure-version.cjs', 'assets/visual-editor-core.js', 'layout/presentation-layout.json']) fs.copyFileSync(path.join(root, file), path.join(fixture, file));
    const result = spawnSync(process.execPath, [path.join(fixture, 'tools/create-general-scenarios-figure-version.cjs')], {encoding: 'utf8', env: {...process.env, ELECTRON_RUN_AS_NODE: '1'}, windowsHide: true});
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(result.stdout), variant = fs.readFileSync(path.join(fixture, manifest.output), 'utf8');
    assert.match(variant, /id="editor-saved-data"[^>]+data-source="[^"]+\.layout.json"><\/script>/);
    assert.equal((variant.match(/<style id="figure-focused-styles">/g) || []).length, 1);
    Core.parse(fs.readFileSync(path.join(fixture, manifest.layout), 'utf8'));
    assert.equal(fs.readFileSync(path.join(fixture, 'layout/presentation-layout.json'), 'utf8'), fs.readFileSync(configPathForTest(), 'utf8'));
    assert.equal(hash(fs.readFileSync(path.join(fixture, 'index.html'))), hash(fs.readFileSync(path.join(root, 'index.html'))));
  } finally { assert(path.resolve(fixture).startsWith(path.join(__dirname, 'artifacts', 'variant-'))); fs.rmSync(fixture, {recursive: true, force: true,maxRetries:5,retryDelay:200}); }
});
function configPathForTest() { return path.join(root, 'layout/presentation-layout.json'); }
test('preview server serves nested JSON and JavaScript with MIME types and blocks traversal', async () => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port + '/presentation-demo/';
    const json = await fetch(base + 'layout/presentation-layout.json'); assert.equal(json.status, 200); assert.match(json.headers.get('content-type'), /application\/json/); Core.validate(await json.json());
    const script = await fetch(base + 'assets/visual-editor.js'); assert.equal(script.status, 200); assert.match(script.headers.get('content-type'), /text\/javascript/);
    assert.equal((await fetch(base + '..%2Findex.html')).status, 404);
    assert.equal((await fetch(base + '.git/config')).status, 404);
    assert.equal((await fetch(base + 'index.html', {method: 'POST'})).status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('preview rereads saved source settings while the published JSON copy is stale', async () => {
  const artifacts=path.join(__dirname,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
  const fixture=fs.mkdtempSync(path.join(artifacts,'preview-config-'));
  const site=path.join(fixture,'_site'),source=path.join(fixture,'presentation-layout.json');
  fs.mkdirSync(path.join(site,'layout'),{recursive:true});fs.writeFileSync(path.join(site,'index.html'),'preview');
  const config=original(),view=Core.imageView('context','g101-before');
  config.imageViews[view.id]=view;
  const stale=JSON.stringify(config);fs.writeFileSync(path.join(site,'layout/presentation-layout.json'),stale);fs.writeFileSync(source,stale);
  const server=createServer(site,{configFile:source});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base='http://127.0.0.1:'+server.address().port;
    assert.equal((await (await fetch(base+'/presentation-demo/layout/presentation-layout.json')).json()).imageViews[view.id].zoom,1);
    const files=new Files({isSecureContext:true,showOpenFilePicker:async()=>[],showSaveFilePicker:async()=>({
      name:'presentation-layout.json',queryPermission:async()=>'granted',
      createWritable:async()=>({write:async text=>fs.writeFileSync(source,text),close:async()=>{}})
    })});
    config.imageViews[view.id]={...view,zoom:1.45,x:11,y:-6};await files.save(config);
    for(const prefix of ['/presentation-demo/','/']){
      const response=await fetch(base+prefix+'layout/presentation-layout.json');
      assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(Core.parse(await response.text()).imageViews[view.id],config.imageViews[view.id]);
    }
    assert.equal(fs.readFileSync(path.join(site,'layout/presentation-layout.json'),'utf8'),stale,'Refreshing must not require rebuilding the published copy');
    assert.equal((await fetch(base+'/presentation-layout.json')).status,404,'Do not expose the source directory');
    assert.equal((await fetch(base+'/presentation-demo/layout/presentation-layout.json',{method:'POST'})).status,405);
    fs.writeFileSync(source,'{invalid');assert.equal(await (await fetch(base+'/layout/presentation-layout.json')).text(),'{invalid','Do not silently fall back to the old copy');
  } finally {
    await new Promise(resolve=>server.close(resolve));
    assert(path.resolve(fixture).startsWith(path.join(artifacts,'preview-config-')));fs.rmSync(fixture,{recursive:true,force:true});
  }
});
