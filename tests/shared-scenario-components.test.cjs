'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),Scenarios=require('../assets/presentation-scenarios.js');
test('general and complex details use the same schema, page construction and renderer without cross-deck asset paths',()=>{
  const directory=JSON.parse(fs.readFileSync(path.join(root,'data/scenarios/catalog.json'),'utf8'));
  const doc=JSON.parse(fs.readFileSync(path.join(root,'data/scenarios/G1-05.json'),'utf8')),entry=directory.scenarios.find(item=>item.id==='C1-01');
  doc.scenario.code=entry.id;doc.scenario.id=entry.id.toLowerCase();doc.scenario.chapter='complex-c1';doc.scenario.name=entry.name;
  for(const article of doc.articles)article.scenario=doc.scenario.id;
  for(const asset of Object.values(doc.assets)){asset.scenario=entry.id;asset.file=asset.file.replace('04-一般道路情境','05-複雜道路情境').replaceAll('G1-05','C1-01');}
  const extended=structuredClone(directory);extended.details.push('data/scenarios/C1-01.json');Scenarios.validate(extended);Scenarios.validateDetail(doc,extended);
  const invalid=structuredClone(doc);Object.values(invalid.assets)[0].file=Object.values(invalid.assets)[0].file.replace('05-複雜道路情境','04-一般道路情境');assert.throws(()=>Scenarios.validateDetail(invalid,extended));
  const window={},data={scenarios:[doc.scenario],articles:doc.articles,embeddedAssets:{},assetMeta:{}};
  for(const [key,asset]of Object.entries(doc.assets)){data.embeddedAssets[key]={url:asset.file,width:asset.width,height:asset.height};data.assetMeta[key]={rotation:asset.rotation||0,label:asset.label};}
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/general/scenario-structure.js'),'utf8'),{window});
  assert.equal(window.RoadScenarioComponents,window.generalRoadScenarios);
  const renderer=window.RoadScenarioComponents.create(data);assert(renderer.context(doc.scenario).includes('C1-01'));assert(renderer.overview(doc.scenario).includes('overview-list'));assert(renderer.review(doc.scenario).includes('review-rows'));
  assert(renderer.pages(doc.scenario).every(page=>page.chapter==='complex-c1'));
});
