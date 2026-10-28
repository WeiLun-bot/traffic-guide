'use strict';
// Add the supplied merge scenarios to the current edited index without rebuilding its saved draft.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const content=path.join(root,'content','04-general-scenarios');
const source=path.join(root,'src','general-scenarios');
const target=path.join(root,'index.html');
const {deck:prepared,manifest}=require('./prepare-general-scenario-data.cjs')({root,content});
const original=fs.readFileSync(target,'utf8');
const pattern=/<script id="presentation-data" type="application\/json">([\s\S]*?)<\/script>/;
const savedPattern=/<script id="editor-saved-data"[^>]*>([\s\S]*?)<\/script>/;
const data=JSON.parse(original.match(pattern)[1]);
const saved=original.match(savedPattern)[1];
const existingScenes=data.scenarios.filter(scene=>!['g1-03','g1-04'].includes(scene.id));
const existingArticles=data.articles.filter(article=>!['g1-03','g1-04'].includes(article.scenario));
const additions=prepared.scenarios.filter(scene=>['g1-03','g1-04'].includes(scene.id)).map(scene=>{
  const existing=data.scenarios.find(item=>item.id===scene.id);
  return {...scene,...(existing?.currentConditions?{currentConditions:existing.currentConditions}:{})};
});
assert.equal(additions.length,2);
data.scenarios=[...existingScenes,...additions];
data.articles=[...existingArticles,...prepared.articles.filter(article=>additions.some(scene=>scene.id===article.scenario))];
for(const scene of additions)for(const key of Object.keys(scene.assets)) {
  data.assets[key]=prepared.assets[key];data.embeddedAssets[key]=prepared.embeddedAssets[key];data.assetMeta[key]=prepared.assetMeta[key];
}
let html=original.replace(pattern,()=>'<script id="presentation-data" type="application/json">'+JSON.stringify(data).replace(/</g,'\\u003c')+'</script>');
for(const [tag,id,file]of [['script','general-scenario-structure','scenarios.js'],['style','general-scenario-styles','scenarios.css']]) {
  const expression=new RegExp('(<'+tag+' id="'+id+'">)[\\s\\S]*?(</'+tag+'>)');
  assert(expression.test(html),'Missing inline block '+id);
  html=html.replace(expression,(_,open,close)=>open+'\n'+fs.readFileSync(path.join(source,file),'utf8').trimEnd()+'\n'+close);
}
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const main=scripts.at(-1);assert(main&&main[1].includes('window.generalRoadPresentation'));
let runtime=fs.readFileSync(path.join(source,'presentation.js'),'utf8');
if(main[1].includes('一般道路情境簡報（圖面放大版）'))runtime=runtime.replace('｜一般道路情境簡報`','｜一般道路情境簡報（圖面放大版）`');
html=html.slice(0,main.index)+'<script>\n'+runtime.trimEnd()+'\n</script>'+html.slice(main.index+main[0].length);
assert.equal(html.match(savedPattern)[1],saved,'Saved editor draft changed');
assert.equal(data.scenarios.length,4);assert.equal(data.articles.length,26);assert([25,28].includes(Object.keys(data.embeddedAssets).length));
for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!script[1].includes('application/json'))new vm.Script(script[2]);
const backup=path.join(root,'backups','index-before-G1-03-G1-04-'+new Date().toISOString().replace(/[:.]/g,'-')+'.html');
fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,original,'utf8');
fs.writeFileSync(target,html,'utf8');
const addedManifest={scenarios:manifest.scenarios.filter(scene=>additions.some(added=>added.id===scene.id)),assets:manifest.assets.filter(asset=>additions.some(added=>added.id===asset.scenario)),articles:manifest.articles.filter(article=>additions.some(added=>added.id===article.scenario))};
fs.writeFileSync(path.join(content,'merge-scenarios-manifest.json'),JSON.stringify(addedManifest,null,2)+'\n','utf8');
console.log('Updated index.html: 4 scenarios, 26 explanations, '+Object.keys(data.embeddedAssets).length+' embedded assets; original saved edits preserved.');
console.log('Backup: '+path.relative(root,backup));
