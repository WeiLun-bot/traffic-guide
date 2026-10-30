'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {withoutComments,chapter}=require('../tools/typst-module-source.cjs');
test('Typst comments do not import unused images, quoted URLs remain data and surrounding rotations are retained',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'traffic-guide-typst-'));
  try{
    fs.mkdirSync(path.join(root,'materials/03-modules/M2-03'),{recursive:true});
    fs.writeFileSync(path.join(root,'materials/03-modules/M2-03/active.svg'),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"/>');
    const text='=== [M2-03] 號誌\n==== [M2-03.1] 路口 <a>\n// image("../../media/03-modules/M2-03/unused.svg")\n/* nested /* image("missing") */ comment */\nrotate(-90deg, reflow: true, image("../../media/03-modules/M2-03/active.svg"))\n#guide-item[現況與議題][說明]\n"https://example.test/a//b"';
    const file=path.join(root,'source.typ');fs.writeFileSync(file,text);const result=chapter(file,root);
    assert.equal(result.images.length,1);assert.equal(result.images[0].rotation,270);assert.equal(result.images[0].width,120);assert.equal(result.images[0].height,80);assert(withoutComments(text).includes('"https://example.test/a//b"'));
  }finally{const resolved=path.resolve(root);assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep+'traffic-guide-typst-'));fs.rmSync(resolved,{recursive:true,force:true});}
});
