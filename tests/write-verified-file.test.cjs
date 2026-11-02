'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const writeVerifiedFile=require('../tools/write-verified-file.cjs');

function fixture(t){
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'traffic-guide-copy-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  return path.join(folder,'preview.svg');
}

test('copies exact binary bytes and does not rewrite an unchanged preview',t=>{
  const destination=fixture(t),bytes=Buffer.from([0,255,13,10,128,1]);
  writeVerifiedFile(destination,bytes);
  assert.deepEqual(fs.readFileSync(destination),bytes);
  const write=t.mock.method(fs,'writeFileSync',()=>assert.fail('Unchanged file must not be rewritten'));
  writeVerifiedFile(destination,bytes);
  assert.equal(write.mock.callCount(),0);
});

test('recovers when immediate verification reads truncated or stale bytes',t=>{
  const destination=fixture(t),bytes=Buffer.from('<svg>updated diagram</svg>');
  const originalRead=fs.readFileSync;
  let reads=0;
  t.mock.method(fs,'readFileSync',function(file,...args){
    if(file===destination&&++reads<=2)return reads===1?bytes.subarray(0,4):Buffer.alloc(bytes.length);
    return originalRead.call(this,file,...args);
  });
  writeVerifiedFile(destination,bytes,'diagram.svg');
  assert.deepEqual(originalRead(destination),bytes);
  assert(reads>=3,'Verification must retry before accepting the copy');
});

for(const code of ['EBUSY','EACCES','EPERM'])test('recovers from a temporary '+code+' file lock',t=>{
  const destination=fixture(t),bytes=Buffer.from('replacement');
  fs.writeFileSync(destination,'old');
  const originalWrite=fs.writeFileSync;
  let writes=0;
  t.mock.method(fs,'writeFileSync',function(file,...args){
    if(file===destination&&++writes===1)throw Object.assign(new Error('Temporarily locked'),{code});
    return originalWrite.call(this,file,...args);
  });
  writeVerifiedFile(destination,bytes);
  assert.equal(writes,2);
  assert.deepEqual(fs.readFileSync(destination),bytes);
});

test('persistent mismatches stop with the affected file name',t=>{
  const destination=fixture(t),originalRead=fs.readFileSync;
  let writes=0;
  const originalWrite=fs.writeFileSync;
  t.mock.method(fs,'writeFileSync',function(file,...args){if(file===destination)writes++;return originalWrite.call(this,file,...args);});
  t.mock.method(fs,'readFileSync',function(file,...args){return file===destination?Buffer.from('bad'):originalRead.call(this,file,...args);});
  assert.throws(()=>writeVerifiedFile(destination,Buffer.from('expected'),'diagram.svg'),/after 5 attempts: diagram\.svg.*Copy verification failed/);
  assert.equal(writes,5);
});

test('disk errors fail immediately and preserve their original cause',t=>{
  const destination=fixture(t),failure=Object.assign(new Error('Disk full'),{code:'ENOSPC'});
  const write=t.mock.method(fs,'writeFileSync',()=>{throw failure;});
  assert.throws(()=>writeVerifiedFile(destination,Buffer.from('expected')),error=>error===failure);
  assert.equal(write.mock.callCount(),1);
});

test('refuses non-file targets without writing to them',t=>{
  const destination=fixture(t);
  fs.mkdirSync(destination);
  assert.throws(()=>writeVerifiedFile(destination,Buffer.from('expected')),/must be a regular file/);
  assert(fs.statSync(destination).isDirectory());
});
