'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {dataFromHtml,localPath,inlineHtml}=require('../tools/presentation-source.cjs');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
test('the four-deck HTML stays small and loads ordered external code and unchanged image identities',()=>{
  assert(Buffer.byteLength(html)<250000,'Entry HTML must not embed large image or program payloads');
  const data=dataFromHtml(html),dependencies=new Set(require('../tools/presentation-release-files.cjs'));
  assert.equal(Object.keys(data.embeddedAssets).length,28);
  for(const [key,asset]of Object.entries(data.embeddedAssets)){
    if(asset.sourceAsset)continue;
    assert(!asset.url.startsWith('data:'),key);assert(dependencies.has(decodeURIComponent(asset.url)),key);
    assert(fs.statSync(localPath(root,asset.url)).isFile(),key);
  }
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
    if(match[1].includes('application/json'))continue;
    if(match[1].includes('data-extracted-script'))assert(!/\b(?:async|defer)\b/.test(match[1]),'Classic script order must remain unchanged');
    assert(Buffer.byteLength(match[2])<2048,'Only the small startup recovery guard stays inline');
  }
  const reconstructed=inlineHtml(html,root,{inlineImages:false});
  for(const match of reconstructed.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!match[1].includes('application/json'))new vm.Script(match[2]);
  assert(reconstructed.includes('window.generalRoadPresentation='));
});
