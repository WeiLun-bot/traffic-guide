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
  const originalRename=fs.renameSync;
  let replacements=0;
  t.mock.method(fs,'renameSync',function(file,target){
    if(target===destination&&++replacements===1)throw Object.assign(new Error('Temporarily locked'),{code});
    return originalRename.call(this,file,target);
  });
  writeVerifiedFile(destination,bytes);
  assert.equal(replacements,2);
  assert.deepEqual(fs.readFileSync(destination),bytes);
  assert.deepEqual(fs.readdirSync(path.dirname(destination)),[path.basename(destination)]);
});

test('persistent mismatches stop with the affected file name',t=>{
  t.mock.method(Atomics,'wait',()=> 'timed-out');
  const destination=fixture(t),originalRead=fs.readFileSync;
  let writes=0;
  const originalWrite=fs.writeFileSync;
  t.mock.method(fs,'writeFileSync',function(file,...args){writes++;return originalWrite.call(this,file,...args);});
  t.mock.method(fs,'readFileSync',function(file,...args){return file===destination?Buffer.from('bad'):originalRead.call(this,file,...args);});
  assert.throws(()=>writeVerifiedFile(destination,Buffer.from('expected'),'diagram.svg'),/after 7 attempts: diagram\.svg.*Copy verification failed/);
  assert.equal(writes,7);
  assert.deepEqual(fs.readdirSync(path.dirname(destination)),[path.basename(destination)]);
});

test('disk errors fail immediately and preserve their original cause',t=>{
  const destination=fixture(t),failure=Object.assign(new Error('Disk full'),{code:'ENOSPC'});
  const write=t.mock.method(fs,'writeFileSync',()=>{throw failure;});
  assert.throws(()=>writeVerifiedFile(destination,Buffer.from('expected')),error=>error===failure);
  assert.equal(write.mock.callCount(),1);
  assert.deepEqual(fs.readdirSync(path.dirname(destination)),[]);
});

test('keeps the old file intact when replacement remains locked',t=>{
  t.mock.method(Atomics,'wait',()=> 'timed-out');
  const destination=fixture(t),old=Buffer.from('previous working preview');
  fs.writeFileSync(destination,old);
  t.mock.method(fs,'renameSync',()=>{throw Object.assign(new Error('Still locked'),{code:'EPERM'});});
  assert.throws(()=>writeVerifiedFile(destination,Buffer.from('updated'),'presentation.css'),error=>{
    assert.match(error.message,/after 7 attempts: presentation\.css/);
    assert.equal(error.cause.code,'EPERM');
    return true;
  });
  assert.deepEqual(fs.readFileSync(destination),old);
  assert.deepEqual(fs.readdirSync(path.dirname(destination)),[path.basename(destination)]);
});

test('does not replace the old preview with an incomplete temporary file',t=>{
  t.mock.method(Atomics,'wait',()=> 'timed-out');
  const destination=fixture(t),old=Buffer.from('working preview'),originalRead=fs.readFileSync;
  fs.writeFileSync(destination,old);
  t.mock.method(fs,'readFileSync',function(file,...args){
    return path.basename(file).startsWith('.traffic-guide-')?Buffer.from('truncated'):originalRead.call(this,file,...args);
  });
  assert.throws(()=>writeVerifiedFile(destination,Buffer.from('updated preview')),/Copy verification failed/);
  assert.deepEqual(originalRead(destination),old);
  assert.deepEqual(fs.readdirSync(path.dirname(destination)),[path.basename(destination)]);
});

test('waits for a Windows reader lock that outlasts the previous retry window',{skip:process.platform!=='win32'},async t=>{
  const destination=fixture(t),bytes=Buffer.from('updated preview');
  fs.writeFileSync(destination,'previous preview');
  const script="$file = [IO.File]::Open($env:TRAFFIC_GUIDE_LOCK_FILE, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read); try { [Console]::WriteLine('LOCK_READY'); [Threading.Thread]::Sleep(2500) } finally { $file.Dispose() }";
  const child=require('node:child_process').spawn(path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{
    env:{...process.env,TRAFFIC_GUIDE_LOCK_FILE:destination},windowsHide:true,stdio:['pipe','pipe','pipe']
  });
  const closed=new Promise(resolve=>child.once('close',resolve));
  try{
    await new Promise((resolve,reject)=>{
      let output='';
      const timer=setTimeout(()=>reject(new Error('Windows file lock was not ready: '+output)),10000);
      child.once('error',reject);
      child.once('exit',code=>{clearTimeout(timer);reject(new Error('Windows lock process exited: '+code+' '+output));});
      child.stderr.on('data',chunk=>{output+=chunk;});
      child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('LOCK_READY')){clearTimeout(timer);resolve();}});
    });
    assert.throws(()=>fs.writeFileSync(destination,bytes),error=>['EPERM','EACCES','EBUSY'].includes(error.code));
    writeVerifiedFile(destination,bytes,'presentation.css');
    assert.deepEqual(fs.readFileSync(destination),bytes);
    assert.deepEqual(fs.readdirSync(path.dirname(destination)),[path.basename(destination)]);
  }finally{
    child.stdin.end();
    const timer=setTimeout(()=>child.kill(),3000);
    await closed;
    clearTimeout(timer);
  }
});

test('refuses non-file targets without writing to them',t=>{
  const destination=fixture(t);
  fs.mkdirSync(destination);
  assert.throws(()=>writeVerifiedFile(destination,Buffer.from('expected')),/must be a regular file/);
  assert(fs.statSync(destination).isDirectory());
});
