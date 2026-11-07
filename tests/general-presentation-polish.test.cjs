'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../assets/visual-editor-core.js'),Document=require('../assets/presentation-document.js'),{format}=require('../assets/presentation-text.js');
test('figure fit and mirror settings survive validation, project split/join and signatures',()=>{
 const config=require('./read-project-config.cjs')(),view={...Core.imageView('g103-overview','g103-after'),fit:'height',flipX:true,flipY:false};config.imageViews[view.id]=view;
 const valid=Core.validate(config),split=Document.split(valid),restored=Document.join(split.layout,split.navigation,Object.values(split.documents));
 assert.deepEqual(restored.imageViews[view.id],view);
 const before=Core.signature(restored);restored.imageViews[view.id].flipY=true;assert.notEqual(Core.signature(restored),before);
 for(const field of [{fit:'stretch'},{flipX:1},{flipY:'false'}])assert.throws(()=>Core.validate({...config,imageViews:{[view.id]:{...view,...field}}}));
});
test('general presentation text omits report figure references and the removed summary sentence',()=>{
 assert.equal(format('維持直行與右轉共用，如圖2.3-2所示。',{general:true}),'維持直行與右轉共用。');
 assert.equal(format('如圖2.3-2所示',{general:false}),'如圖2.3-2所示');
 assert.equal(format('本情境涵蓋路面邊線、行穿線、車流導引、路側停車及相關標誌配置。',{general:true}),'');
 assert.equal(format('請依§ 201配置，G2-01為示例。',{general:true}),'請依§ 201 配置，G2-01為示例。');
});
test('global card defaults and independent comparison positions survive project persistence',()=>{
 const config=require('./read-project-config.cjs')();config.legacyState.layouts['general-scenario-cards']={scenarioCardLayout:'horizontal'};
 config.legacyState.layouts.g2={scenarioCardLayout:'vertical'};
 config.legacyState.comparisonTransforms['g103-conditions']={before:{x:12,y:-4,scaleX:1,scaleY:1,angle:0},after:{x:-6,y:8,scaleX:1.3,scaleY:1.3,angle:0}};
 const split=Document.split(config),restored=Document.join(split.layout,split.navigation,Object.values(split.documents));
 assert.deepEqual(restored.legacyState.layouts['general-scenario-cards'],{scenarioCardLayout:'horizontal'});
 assert.deepEqual(restored.legacyState.layouts.g2,{scenarioCardLayout:'vertical'});
 assert.deepEqual(restored.legacyState.comparisonTransforms['g103-conditions'],config.legacyState.comparisonTransforms['g103-conditions']);
});
