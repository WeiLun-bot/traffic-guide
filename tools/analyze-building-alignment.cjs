'use strict';
// Raster pixels are read for geometry; source pictures are never modified.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'一般道路情境-圖面放大版.html'),'utf8');
const data=JSON.parse(html.match(/<script id="presentation-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const assets={before:data.embeddedAssets['g101-before'],after:data.embeddedAssets.overall};
const script=fs.readFileSync(path.join(__dirname,'building-boundary-detector.js'),'utf8');
const output=path.join(root,'tests/artifacts/general-scenarios/building-alignment-analysis.html');
fs.writeFileSync(output,'<!doctype html><html><head><meta charset="utf-8"><title>建築線特徵校準檢查</title><style>body{margin:16px;font:14px sans-serif;background:#e8ece5}main{display:flex;gap:20px;align-items:start}canvas{max-width:44vw;height:auto;background:white}pre{white-space:pre-wrap}</style></head><body><h1>白色建築區 ↔ 彩色地塊建築線</h1><main></main><script>window.alignmentAssets='+JSON.stringify(assets).replace(/</g,'\\u003c')+';</script><script>'+script+'</script></body></html>','utf8');
console.log(output);
