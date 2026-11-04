'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'data/presentations.json'),'utf8')),Structure=require('../assets/presentation-structure.js');
async function navigationFixture(){
  const window={PresentationResults:require('../assets/presentation-results.js'),generalRoadEditor:{state:{texts:{}}}};
  const sandbox={module:{exports:{}},window,URL,document:{baseURI:'http://localhost/',addEventListener(){}},fetch:async()=>({ok:true,json:async()=>structuredClone(manifest)})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-structure.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();return {api,window};
}
test('chapter labels use saved cover titles across all four decks without changing chapter identities or defaults',async()=>{
  const {api,window}=await navigationFixture(),before=JSON.stringify(api.manifest),chapters=api.manifest.presentations.flatMap(deck=>deck.chapters);
  for(const chapter of chapters){assert.equal(api.chapterName(chapter),chapter.name);window.generalRoadEditor.state.texts['chapter-cover-'+chapter.id+'|shared|title']='新名稱 '+chapter.id;assert.equal(api.chapterName(chapter.id),'新名稱 '+chapter.id);}
  const chapter=chapters.find(chapter=>chapter.id==='results-review'),key='chapter-cover-'+chapter.id+'|shared|title';window.generalRoadEditor.state.texts[key]='情境\n圖例 <調整> & 討論';
  assert.equal(api.chapterName(chapter),'情境 圖例 <調整> & 討論');assert.match(api.toc([],{toc:()=>''}),/情境 圖例 &lt;調整&gt; &amp; 討論/);
  delete window.generalRoadEditor.state.texts[key];assert.equal(api.chapterName(chapter.id),chapter.name);window.generalRoadEditor.state.texts[key]='  ';assert.equal(api.chapterName(chapter),chapter.name);
  assert.equal(JSON.stringify(api.manifest),before);
});
test('next labels use the displayed results title and both saved title keys before a page is visited',async()=>{
  const {api,window}=await navigationFixture(),Results=window.PresentationResults;
  const framework={id:'framework',kind:'results',resultType:'framework',name:'原始名稱',content:{title:'情境架構表'}};
  const comparison={id:'comparison',kind:'results',resultType:'module-comparison',resultsModule:'M3-04',name:'M3-04 公車｜現況與模組圖對照',content:{title:'公車'}};
  const app={pageTitle:Results.pageTitle};assert.equal(api.pageTitle(comparison,{},app),'M3-04 公車');
  window.generalRoadEditor.state.texts[Results.titleKey(framework)]='重新命名的架構表';
  window.generalRoadEditor.state.texts[Results.titleKey(comparison)]='公車新版說明';
  assert.equal(api.pageTitle(framework,undefined,app),'重新命名的架構表');assert.equal(api.pageTitle(comparison,undefined,app),'公車新版說明');
  assert.equal(api.pageTitle({id:'chapter',kind:'chapter-cover',name:'章節'}, {'chapter|shared|title':'章節\n改名'}),'章節 改名');
});
test('label and movement share the reordered target, skipped preview stops and deck boundaries',async()=>{
  const {api}=await navigationFixture(),pages=[{id:'start',chapter:'g1',deckId:'general',name:'開場'},{id:'article',chapter:'g1',deckId:'general',article:{},name:'條文說明'},{id:'last',chapter:'g1',deckId:'general',name:'最後一頁'},{id:'other',chapter:'complex-intro',deckId:'complex',name:'另一場'}];
  const stops=[{page:0,phase:0},{page:1,phase:0},{page:1,phase:1},{page:2,phase:0},{page:3,phase:0}],app={pages,stops,position:0,get page(){return pages[stops[this.position].page];}};
  assert.equal(api.navigationTarget(1,app,false).index,2);assert.equal(api.navigationLabel(app),'條文說明');assert.equal(api.navigationTarget(1,app,true).index,1);
  app.position=1;assert.equal(api.navigationTarget(1,app,false).index,2);assert.equal(api.navigationTarget(-1,app,false).id,'start');
  [pages[1],pages[2]]=[pages[2],pages[1]];stops.splice(0,stops.length,{page:0,phase:0},{page:1,phase:0},{page:2,phase:0},{page:2,phase:1},{page:3,phase:0});app.position=0;assert.equal(api.navigationTarget(1,app,false).id,'last');assert.equal(api.navigationLabel(app),'最後一頁');
  app.position=3;assert.equal(api.navigationTarget(1,app,false).id,'start');assert.equal(api.navigationLabel(app),'回到本場開頭');app.position=0;assert.equal(api.navigationTarget(-1,app,false).id,'presentations');
});
test('four presentations own independent chapters, including all four PDF module themes',()=>{
  Structure.validate(manifest);assert.deepEqual(manifest.presentations.map(deck=>deck.title),['三年成果與模組化整體架構','交通管制設施模組設計','一般道路情境','複雜道路情境']);
  const modules=manifest.presentations.find(deck=>deck.id==='modules'),general=manifest.presentations.find(deck=>deck.id==='general');
  assert.deepEqual(modules.chapters.map(chapter=>chapter.code),['00','01','02','03','04']);assert.deepEqual(modules.chapters.slice(1).map(chapter=>chapter.name),['車道配置與動線導引','路口管制','行人、自行車、機車、公車','危險警示與通行管制']);
  assert.deepEqual(general.chapters.map(chapter=>chapter.id),['intro','g1','g2','g3','g4']);
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/modules/catalog.json'),'utf8'));assert.deepEqual(modules.chapters.slice(1).map(chapter=>chapter.name),catalog.themes.map(theme=>theme.name));
  const invalid=structuredClone(manifest);invalid.presentations[1].chapters[1].id='g1';assert.throws(()=>Structure.validate(invalid));
});
test('grouping preserves page identities and saved ordering inside each chapter',async()=>{
  const sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/',addEventListener(){}},fetch:async()=>({ok:true,json:async()=>structuredClone(manifest)})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-structure.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();
  const pages=[{id:'edge',chapter:'g1',kind:'map'},{id:'m201-stop-layout',chapter:'modules-M2',kind:'module'},{id:'cover',chapter:'intro',kind:'cover'},{id:'presentations',chapter:'presentations',kind:'presentations-home'},...api.placeholders()];
  const before=pages.filter(page=>page.chapter==='g1'||page.chapter==='intro');api.organize(pages);
  assert.equal(pages[0].id,'presentations');assert.equal(pages.find(page=>page.id==='m201-stop-layout').deckId,'modules');assert.deepEqual(pages.filter(page=>page.deckId==='general'),[before[1],before[0]]);
  assert(pages.filter(page=>page.kind==='presentation-empty').every(page=>['results','complex'].includes(page.deckId)));assert.equal(new Set(pages.map(page=>page.id)).size,pages.length);
});

test('all 23 chapters receive one stable cover while existing pages and explicit saved cover positions remain intact',async()=>{
  const sandbox={module:{exports:{}},URL,document:{baseURI:'http://localhost/',addEventListener(){}},fetch:async()=>({ok:true,json:async()=>structuredClone(manifest)})};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/presentation-structure.js'),'utf8'),sandbox);const api=sandbox.module.exports;await api.load();
  const originals=manifest.presentations.flatMap(deck=>deck.chapters.flatMap(chapter=>[{id:chapter.entry,chapter:chapter.id,kind:'content',payload:{text:chapter.name}},{id:chapter.entry+'-extra',chapter:chapter.id,kind:'content'}])),pages=[...originals].reverse();api.addChapterCovers(pages);api.organize(pages);
  assert.equal(pages.filter(page=>page.kind==='chapter-cover').length,23);assert.equal(new Set(pages.map(page=>page.id)).size,pages.length);for(const original of originals)assert(pages.includes(original));
  for(const deck of manifest.presentations)for(const chapter of deck.chapters){const members=pages.filter(page=>page.chapter===chapter.id);assert.equal(members[0].id,'chapter-cover-'+chapter.id);assert.deepEqual(members.slice(1).map(page=>page.id),[chapter.entry+'-extra',chapter.entry]);}
  api.addChapterCovers(pages);assert.equal(pages.filter(page=>page.kind==='chapter-cover').length,23);
  const cover=pages.find(page=>page.id==='chapter-cover-results-review'),at=pages.indexOf(cover);pages.splice(at,1);pages.splice(at+1,0,cover);api.organize(pages,{legacyState:{pageOrder:pages.map(page=>page.id)}});assert.equal(pages.filter(page=>page.chapter==='results-review')[1],cover);
  const bad=structuredClone(manifest);bad.presentations[0].chapterCovers='yes';assert.throws(()=>api.validate(bad));
});
