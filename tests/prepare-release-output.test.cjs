'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const prepare=require('../tools/prepare-release-output.cjs');
const artifacts=path.resolve(__dirname,'artifacts');
fs.mkdirSync(artifacts,{recursive:true});
const root=fs.mkdtempSync(path.join(artifacts,'preview-output-'));
function write(relative,bytes) {
  const file=path.join(root,relative);
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);return file;
}
try {
  const stale='materials/03-modules/M2-01/stop-crosswalk.png',bytes=Buffer.from([0,255,128,10]);
  const old=write('_site/'+stale,bytes);
  const current=write('_site/materials/03-modules/M2-01/new.png','current');
  write('_site/old-folder/nested/notes.txt','keep these notes');
  const layout=write('layout/presentation-layout.json','saved layout');
  const files=['materials/03-modules/M2-01/new.png'];
  assert.throws(()=>prepare({root,files}),/Unexpected file in _site/);
  assert(fs.readFileSync(old).equals(bytes),'Strict release must leave unexpected files intact');
  assert(!fs.existsSync(path.join(root,'exports')),'Strict release must not create backups');
  const result=prepare({root,files,archiveStale:true});
  assert.equal(result.entries,2);
  assert(fs.readFileSync(path.join(root,result.backup,stale)).equals(bytes));
  assert.equal(fs.readFileSync(path.join(root,result.backup,'old-folder/nested/notes.txt'),'utf8'),'keep these notes');
  assert(!fs.existsSync(old));assert.equal(fs.readFileSync(current,'utf8'),'current');
  assert.equal(fs.readFileSync(layout,'utf8'),'saved layout');
  assert.equal(prepare({root,files,archiveStale:true}),null,'Repeated previews should not create empty backups');
  assert.equal(prepare({root,files}),null,'Clean preview output must pass strict release checks');
  // Windows directory junctions do not require developer mode or elevation.
  const outside=path.join(root,'outside');fs.mkdirSync(outside);
  const junction=path.join(root,'_site','unexpected-link');
  fs.symlinkSync(outside,junction,process.platform==='win32'?'junction':'dir');
  const another=write('_site/another-old.txt','preserve');
  assert.throws(()=>prepare({root,files,archiveStale:true}),/symbolic links/);
  assert(fs.existsSync(another),'Invalid output must be rejected before any file is moved');
  fs.unlinkSync(junction);
  const backups=path.join(root,'exports','preview-backups');
  // An existing non-directory backup target must also leave stale files intact.
  const previous=path.join(root,'saved-backups');fs.renameSync(backups,previous);
  fs.writeFileSync(backups,'not a directory');
  assert.throws(()=>prepare({root,files,archiveStale:true}),/regular directory/);
  assert(fs.existsSync(another));
  console.log('PASS: stale preview files are backed up intact; current assets and layout are preserved; repeated builds, strict releases and invalid paths are handled.');
} finally {
  assert(path.dirname(root)===artifacts&&path.basename(root).startsWith('preview-output-'));
  fs.rmSync(root,{recursive:true,force:true});
}
