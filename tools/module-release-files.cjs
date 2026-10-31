'use strict';
const path=require('node:path');
const root=path.resolve(__dirname,'..'),Modules=require('../assets/presentation-modules.js');
const catalog=Modules.validateCatalog(require('../data/modules/catalog.json'));
const contentFiles=catalog.modules.filter(entry=>entry.ready).flatMap(entry=>{
  const file='data/modules/'+entry.id+'.json',content=Modules.validateModule(require(path.join(root,file)),catalog);
  if(content.id!==entry.id)throw new Error('Module content belongs to a different module: '+file);
  return [file,...Object.values(content.assets).map(asset=>asset.file)];
});
const currentConditions=require('../assets/presentation-results.js').validateConditions(require('../data/results/current-conditions.json'));
const strategies=require('../assets/presentation-results.js').validateStrategies(require('../data/results/general-strategies.json'));
module.exports=[
  'assets/presentation-order.js','assets/presentation-order.css',
  'assets/presentation-image-order.js','assets/presentation-image-order.css',
  'assets/presentation-scenarios.js','assets/presentation-scenarios.css','data/scenarios/catalog.json',
  'assets/presentation-structure.js','assets/presentation-structure.css','data/presentations.json',
  'assets/presentation-results.js','assets/presentation-results.css','data/results/outline.json',
  'data/results/current-conditions.json',...new Set(Object.values(currentConditions.assets).map(asset=>asset.file)),
  'data/results/general-strategies.json',...new Set(Object.values(strategies.assets).map(asset=>asset.file)),
  'assets/presentation-modules.js','assets/presentation-modules.css',
  'data/modules/catalog.json',...new Set(contentFiles)
];
