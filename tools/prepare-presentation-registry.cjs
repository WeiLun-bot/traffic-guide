'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const write=require('./write-verified-file.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,clone(value[key])]));
function build({root=path.resolve(__dirname,'..')}={}){
  const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const save=(file,value)=>{const bytes=Buffer.from(JSON.stringify(value)+'\n');fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});write(path.join(root,file),bytes,file);return bytes;};
  const shared=read('data/scenarios/presentation.json'),baseDocs=shared.caseFiles.map(read),catalog=read('data/scenarios/catalog.json'),detailDocs=(catalog.details||[]).map(read);
  const resources={},resource=(key,file,type,id)=>{resources[key]={file,type,id,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')};};
  resource('scenario:shared','data/scenarios/presentation.json','scenario-shared','general');
  for(const file of [...shared.caseFiles,...catalog.details||[]]){const doc=read(file);resource('scenario:'+doc.scenario.code,file,'scenario',doc.scenario.code);}
  const slimArticle=article=>({...pick(article,['id','reg','regLabel','name','category','scenario','asset','mapAsset','box','crop','page','noDefaultHighlight']),points:[]});
  const slimScene=scene=>({...pick(scene,['id','code','chapter','name','short','setting','geometry','rotation','overall','figure','contextId','overviewId','reviewId','comparisonId','source','modules','summary','assetRotations','assetLabels','width','height','articleIds']),...(scene.currentConditions?{currentConditions:pick(scene.currentConditions,['pageId','before','after'])}:{})});
  const slimDetail=doc=>({schemaVersion:1,scenario:slimScene(doc.scenario),assets:doc.assets,articles:doc.articles.map(slimArticle)});
  const core=pick(shared.core,Object.keys(shared.core).filter(key=>key!=='originalTypst'));
  const base={...core,assets:{},embeddedAssets:{},assetMeta:{},scenarios:baseDocs.map(doc=>slimScene(doc.scenario)),articles:baseDocs.flatMap(doc=>doc.articles.map(slimArticle))};
  for(const doc of baseDocs){Object.assign(base.assets,doc.assetNames);Object.assign(base.embeddedAssets,doc.embeddedAssets);Object.assign(base.assetMeta,doc.assetMeta);}
  const moduleCatalog=read('data/modules/catalog.json'),moduleDocs=moduleCatalog.modules.filter(entry=>entry.ready).map(entry=>read('data/modules/'+entry.id+'.json'));
  const slimModule=doc=>({...pick(doc,['schemaVersion','id','title','assets','referenceNames','directoryAssets','submoduleFlows']),pages:doc.pages.map(page=>({...pick(page,['id','section','submoduleId','title','assets','defaultView','mode','overviewGroups','excludedOverviewPointIds','references','links']),points:(page.points||[]).map(point=>pick(point,['id','submoduleId','title','focus','topicId']))}))});
  for(const doc of moduleDocs)resource('module:'+doc.id,'data/modules/'+doc.id+'.json','module',doc.id);
  resource('modules:formation','data/modules/formation.json','formation','modules-formation');
  const Results=require('../assets/presentation-results.js');
  let outline=read('data/results/outline.json');
  if(outline.currentConditions)outline=Results.mergeConditions(outline,read(outline.currentConditions));
  if(outline.strategies)outline=Results.mergeStrategies(outline,read(outline.strategies));
  const common={...clone(outline),assets:{},scenarioExamples:{}};delete common.currentConditions;delete common.strategies;
  save('data/results/presentation.json',common);resource('results:common','data/results/presentation.json','results-common','results');
  for(const [code,example]of Object.entries(outline.scenarioExamples)){
    const keys=new Set(Object.values(example).flatMap(stage=>stage?.images?.map(image=>image.key)||[]));
    const doc={schemaVersion:1,code,example,assets:Object.fromEntries([...keys].map(key=>[key,outline.assets[key]]).filter(([,asset])=>asset))};
    const file='data/results/scenarios/'+code+'.json';save(file,doc);resource('results:'+code,file,'results-scenario',code);
  }
  const slimItems=items=>(items||[]).map(item=>({...pick(item,['id','title','moduleId']),text:''}));
  const slimResults={...common,assets:outline.assets,pages:common.pages.map(page=>({...pick(page,['id','chapter','type','title','deck']),...(page.items?{items:slimItems(page.items)}:{})})),scenarioExamples:Object.fromEntries(Object.entries(outline.scenarioExamples).map(([code,example])=>[code,Object.fromEntries(Object.entries(example).map(([key,value])=>[key,value?.images?{...pick(value,['title','images','sourceMissing']),items:slimItems(value.items)}:value]))]))};
  const registry={schemaVersion:1,presentations:read('data/presentations.json'),base,scenarios:{catalog,details:detailDocs.map(slimDetail)},modules:{catalog:moduleCatalog,formation:read('data/modules/formation.json'),contents:moduleDocs.map(slimModule)},results:slimResults,resources};
  const bytes=save('data/presentation-registry.json',registry);
  return {bytes:bytes.length,resources:Object.keys(resources).length};
}
module.exports={build};
if(require.main===module)console.log(JSON.stringify(build()));
