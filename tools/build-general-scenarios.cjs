'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const content=path.join(root,'content','04-general-scenarios');
const source=path.join(root,'src','general-scenarios');
const {deck,manifest}=require('./prepare-general-scenario-data.cjs')({root,content});
let html=fs.readFileSync(path.join(source,'presentation.html'),'utf8');
html=html.replace('/* STYLES */',()=>fs.readFileSync(path.join(source,'presentation.css'),'utf8'))
  .replace('/* EDITOR_STYLES */',()=>fs.readFileSync(path.join(source,'editor.css'),'utf8'))
  .replace('/* VIEWPORT_STYLES */',()=>fs.readFileSync(path.join(source,'viewport.css'),'utf8'))
  .replace('/* VIEWPORT_SCRIPT */',()=>fs.readFileSync(path.join(source,'viewport.js'),'utf8'))
  .replace('/* FORMATTING_STYLES */',()=>fs.readFileSync(path.join(source,'formatting.css'),'utf8'))
  .replace('/* FORMATTING_SCRIPT */',()=>fs.readFileSync(path.join(source,'formatting.js'),'utf8'))
  .replace('/* BLOCK_STYLES */',()=>fs.readFileSync(path.join(source,'blocks.css'),'utf8'))
  .replace('/* BLOCK_SCRIPT */',()=>fs.readFileSync(path.join(source,'blocks.js'),'utf8'))
  .replace('/* SCENARIO_STYLES */',()=>fs.readFileSync(path.join(source,'scenarios.css'),'utf8'))
  .replace('/* SCENARIO_SCRIPT */',()=>fs.readFileSync(path.join(source,'scenarios.js'),'utf8'))
  .replace('/* TEMPLATES */',()=>fs.readFileSync(path.join(source,'page-templates.js'),'utf8'))
  .replace('/* EDITOR_SCRIPT */',()=>fs.readFileSync(path.join(source,'editor.js'),'utf8'))
  .replace('/* DATA */',()=>JSON.stringify(deck).replace(/</g,'\u003c'))
  .replace('/* SCRIPT */',()=>fs.readFileSync(path.join(source,'presentation.js'),'utf8'));
if(/\/\* (STYLES|DATA|SCRIPT|EDITOR_STYLES|TEMPLATES|EDITOR_SCRIPT|VIEWPORT_STYLES|VIEWPORT_SCRIPT|FORMATTING_STYLES|FORMATTING_SCRIPT|BLOCK_STYLES|BLOCK_SCRIPT|SCENARIO_STYLES|SCENARIO_SCRIPT) \*\//.test(html)) throw new Error('Unresolved build token');
const output=path.join(root,'index.html');
fs.writeFileSync(output,html,'utf8');
fs.writeFileSync(path.join(content,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
console.log('Created '+path.basename(output)+' | 5 chapters | '+deck.scenarios.length+' scenarios | '+deck.articles.length+' explanations | '+Object.keys(deck.embeddedAssets).length+' embedded SVGs | '+fs.statSync(output).size+' bytes');
