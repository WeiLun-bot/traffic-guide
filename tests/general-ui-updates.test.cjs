'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Core=require('../assets/visual-editor-core.js'),Document=require('../assets/presentation-document.js'),Order=require('../assets/presentation-order.js');
test('hidden articles are a third isolated category and persist independently of visible other articles',()=>{
 const config=require('./read-project-config.cjs')();config.scenarioOtherArticles['g4-03']=['g403-left-waiting'];config.scenarioHiddenArticles['g4-03']=['g403-left-waiting'];
 const items=[{id:'g403-left-waiting'},{id:'g403-guidance'}],groups=Order.articleGroups(items,'g4-03',config);
 assert.deepEqual(groups,{primary:[items[1]],other:[],hidden:[items[0]]});assert(Order.hidden({id:items[0].id,scenario:'g4-03',article:{}},config));
 const split=Document.split(config),saved=Document.join(split.layout,split.navigation,Object.values(split.documents));assert.deepEqual(saved.scenarioHiddenArticles,config.scenarioHiddenArticles);
 const before=Core.signature(config);config.scenarioHiddenArticles['g4-03']=[];assert.notEqual(Core.signature(config),before);
});
test('strategy references order rules numerically, then standards, bracket checks and planning',()=>{
 const values=['時相規劃','[9] § 201','規範 § 10.1','§ 201','[2a] § 221','§ 58','規範 § 4.2','§ 185','[2] § 221'].map(regLabel=>({regLabel}));
 assert.deepEqual(values.sort(Core.compareReferences).map(x=>x.regLabel),['§ 58','§ 185','§ 201','規範 § 4.2','規範 § 10.1','[2] § 221','[2a] § 221','[9] § 201','時相規劃']);
});
test('multiple highlight identities and disabling the primary survive project storage; malformed identities are rejected',()=>{
 const config=require('./read-project-config.cjs')();config.legacyState.highlights['article:edge']={deleted:true,extraIds:['extra-test']};config.legacyState.highlights['article:edge:extra-test']={box:[10,20,50,60],rotation:15};
 const split=Document.split(config),saved=Document.join(split.layout,split.navigation,Object.values(split.documents));assert.deepEqual(saved.legacyState.highlights,config.legacyState.highlights);
 config.legacyState.highlights['article:edge'].extraIds=['../bad'];assert.throws(()=>Core.validate(config));
});
