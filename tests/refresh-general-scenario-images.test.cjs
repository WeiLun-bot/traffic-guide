'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {refresh}=require('../tools/refresh-general-scenario-images.cjs');
const svgNativeSize=require('../tools/svg-native-size.cjs');
test('native SVG sizes accept declared pixel dimensions without rewriting the original artwork',()=>{
  assert.deepEqual(svgNativeSize('<svg width="3395" height="2479"/>'),[3395,2479]);
  assert.deepEqual(svgNativeSize("<svg width='120px' height='80px'/>"),[120,80]);
  assert.deepEqual(svgNativeSize('<svg viewBox="0 0 150 90" width="100%"/>'),[150,90]);
  for(const svg of ['<svg width="100%" height="200%"/>','<svg viewBox="2 0 150 90" width="150" height="90"/>','<svg width="0" height="5"/>'])assert.throws(()=>svgNativeSize(svg));
});
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'traffic-guide-images-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file='materials/04-一般道路情境/G1-01/G1-01_full.svg';fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.mkdirSync(path.join(root,'data/results'),{recursive:true});
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><path d="M0 0H240V120Z"/></svg>';fs.writeFileSync(path.join(root,file),svg);
  const data={title:'Keep this title',embeddedAssets:{overall:{url:'data:image/svg+xml;base64,'+Buffer.from('<svg/>').toString('base64'),width:100,height:80},photo:{url:'data:image/png;base64,unchanged',width:4,height:3},alias:{sourceAsset:'overall',width:100,height:80}},assetMeta:{overall:{scenario:'g1-01',rotation:90}},assets:{overall:'G1-01_full.svg'},scenarios:[{id:'g1-01',overall:'overall',width:100,height:80}],articles:[{id:'article',text:'Keep explanation',box:[1,2,3,4]}]};
  const html='<style>keep styles</style><script id="presentation-data" type="application/json">'+JSON.stringify(data)+'</script><script>keepAnimation()</script>';
  fs.writeFileSync(path.join(root,'index.html'),html);const manifest={assets:{'results:g1-01-strategy':{file,width:100,height:80,sha256:'old'}},scenarios:{'G1-01':{strategy:{items:[{text:'Keep strategy'}]}}}};fs.writeFileSync(path.join(root,'data/results/general-strategies.json'),JSON.stringify(manifest));
  fs.mkdirSync(path.join(root,'layout'));fs.writeFileSync(path.join(root,'layout/presentation-layout.json'),'saved camera and content');return {root,file,svg,html,data,manifest};
}
test('replaced material refreshes embedded SVG and strategy metadata while preserving all other content and saved settings',t=>{
  const f=fixture(t),result=refresh({root:f.root});assert.equal(result.embeddedImages,1);assert.equal(result.strategyImages,1);
  const html=fs.readFileSync(path.join(f.root,'index.html'),'utf8'),data=JSON.parse(html.match(/type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(Buffer.from(data.embeddedAssets.overall.url.split(',')[1],'base64').toString(),f.svg);assert.equal(data.embeddedAssets.overall.width,240);assert.equal(data.scenarios[0].height,120);
  assert.deepEqual(data.articles,f.data.articles);assert.deepEqual(data.assetMeta,f.data.assetMeta);assert.deepEqual(data.embeddedAssets.photo,f.data.embeddedAssets.photo);assert.deepEqual(data.embeddedAssets.alias,f.data.embeddedAssets.alias);
  assert.equal(html.replace(/(<script id="presentation-data" type="application\/json">)[\s\S]*?(<\/script>)/,'$1DATA$2'),f.html.replace(/(<script id="presentation-data" type="application\/json">)[\s\S]*?(<\/script>)/,'$1DATA$2'));
  const manifest=JSON.parse(fs.readFileSync(path.join(f.root,'data/results/general-strategies.json'),'utf8'));assert.equal(manifest.assets['results:g1-01-strategy'].sha256,crypto.createHash('sha256').update(f.svg).digest('hex'));assert.deepEqual(manifest.scenarios,f.manifest.scenarios);
  assert.equal(fs.readFileSync(path.join(f.root,'layout/presentation-layout.json'),'utf8'),'saved camera and content');
  const next=refresh({root:f.root});assert.equal(next.embeddedImages,0);assert.equal(next.strategyImages,0);assert.equal(fs.readFileSync(path.join(f.root,'index.html'),'utf8'),html);
});
test('invalid or missing SVG aborts before modifying either presentation or metadata',t=>{
  const f=fixture(t),manifest=fs.readFileSync(path.join(f.root,'data/results/general-strategies.json'),'utf8');
  for(const svg of ['<svg viewBox="0 0 0 10"/>','<svg viewBox="0 0 10 10"><image href="file:///private.png"/></svg>','<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>']){
    fs.writeFileSync(path.join(f.root,f.file),svg);assert.throws(()=>refresh({root:f.root}));assert.equal(fs.readFileSync(path.join(f.root,'index.html'),'utf8'),f.html);assert.equal(fs.readFileSync(path.join(f.root,'data/results/general-strategies.json'),'utf8'),manifest);
  }
  fs.unlinkSync(path.join(f.root,f.file));assert.throws(()=>refresh({root:f.root}));assert.equal(fs.readFileSync(path.join(f.root,'index.html'),'utf8'),f.html);
});
test('external case diagrams refresh their dimensions and default focus without rewriting saved cameras',t=>{
  const f=fixture(t);fs.mkdirSync(path.join(f.root,'data/scenarios'));
  fs.writeFileSync(path.join(f.root,'data/scenarios/catalog.json'),JSON.stringify({details:['data/scenarios/G1-01.json']}));
  const file=path.join(f.root,'data/scenarios/G1-01.json');fs.writeFileSync(file,JSON.stringify({scenario:{overall:'overall',width:100,height:80},assets:{overall:{file:f.file,width:100,height:80,sha256:'old'}},articles:[{mapAsset:'overall',box:[10,8,30,16],crop:[0,0,100,80]}]}));
  assert.equal(refresh({root:f.root}).detailFiles,1);const doc=JSON.parse(fs.readFileSync(file,'utf8'));assert.deepEqual(doc.articles[0].box,[24,12,72,24]);assert.deepEqual(doc.articles[0].crop,[0,0,240,120]);assert.equal(doc.scenario.width,240);assert.equal(refresh({root:f.root}).detailFiles,0);assert.equal(fs.readFileSync(path.join(f.root,'layout/presentation-layout.json'),'utf8'),'saved camera and content');
});
