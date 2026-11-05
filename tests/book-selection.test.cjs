'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),config=require('../road_book_3d/navigation-config.json');
const pairs=[[4,5],[94,95],[134,135],[142,143],[318,319],[502,503],[518,519],[530,531],[532,533]];
test('output_1105 book uses the cover and every requested PDF spread in order',()=>{
  assert.equal(config.source_pdf_name,'output_1105.pdf');assert.equal(config.source_pages,541);
  assert.deepEqual(config.spreads.map(({left,right})=>[left,right]),pairs);
  const selected=[1,...pairs.flat()];assert.deepEqual(config.rendering.pdf_pages,selected);
  assert.equal(config.rendering.pages.length,pairs.length*2+1);assert.match(config.source_pdf_sha256,/^[a-f0-9]{64}$/);
  const html=fs.readFileSync(path.join(root,'road_book_3d/index.html'),'utf8'),embedded=JSON.parse(html.match(/const DATA = (\{[^\n]+\});/)[1]);assert.deepEqual(embedded,config);
  for(const section of config.sections)assert(section.start<=section.end&&section.end<=config.source_pages);
});
test('all selected rendered book images retain recorded dimensions and byte fingerprints; only selected pages are released',()=>{
  assert.equal(config.rendering.dpi,200);
  for(const [i,page]of config.rendering.pages.entries()){
    assert.equal(page.pdfPage,config.rendering.pdf_pages[i]);assert.equal(page.file,'road_book_3d/pages/p'+page.pdfPage+'.webp');
    assert(page.width>=1600&&page.height>=2300);
    const bytes=fs.readFileSync(path.join(root,page.file));assert.equal(bytes.length,page.bytes);assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),page.sha256);
  }
  const released=require('../tools/book-release-files.cjs');assert.equal(released.length,pairs.length*2+4);
  assert.deepEqual(released.filter(file=>file.endsWith('.webp')),config.rendering.pdf_pages.map(page=>'road_book_3d/pages/p'+page+'.webp'));
  assert(!released.some(file=>file.endsWith('.pdf')));
});
