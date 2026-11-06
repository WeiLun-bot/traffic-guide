'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),http=require('node:http');
const {spawn,spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ps=path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe');
const cmd=path.join(process.env.WINDIR,'System32/cmd.exe'),serverScript=path.join(root,'tools/serve-github-pages.cjs');
const env={...process.env,TRAFFIC_GUIDE_NO_BROWSER:'1',TRAFFIC_GUIDE_NO_PAUSE:'1'};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const runs=[];
function launch(executable,args,extra={}){
  const child=spawn(executable,args,{cwd:path.dirname(root),env:{...env,...extra},windowsHide:true,windowsVerbatimArguments:path.basename(executable).toLowerCase()==='cmd.exe',stdio:['ignore','pipe','pipe']});
  const run={child,output:'',error:null};runs.push(run);
  child.stdout.on('data',chunk=>run.output+=chunk);child.stderr.on('data',chunk=>run.output+=chunk);child.on('error',error=>run.error=error);
  return run;
}
async function until(check,message,run,timeout=60000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(run?.error)throw run.error;if(await check())return;await delay(100);}
  throw new Error(message+'\n'+(run?.output||''));
}
async function canBind(port){
  const probe=net.createServer();
  return new Promise((resolve,reject)=>{
    probe.once('error',error=>error.code==='EADDRINUSE'?resolve(false):reject(error));
    probe.listen(port,'127.0.0.1',()=>probe.close(()=>resolve(true)));
  });
}
async function freePort(){const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));return port;}
function powershell(script,args=[]){return ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,script),...args];}
async function command(executable,args){const run=launch(executable,args);await until(()=>run.child.exitCode!==null,'Command did not finish',run);assert.equal(run.child.exitCode,0,run.output);return run.output;}
async function preview(entry='start-editor.ps1',executable=ps){
  const port=await freePort(),args=path.basename(executable).toLowerCase()==='cmd.exe'?['/d','/s','/c','""'+path.join(root,entry)+'""']:powershell(entry,['-NoBrowser']);
  const run=launch(executable,args,{PORT:String(port)});
  await until(()=>run.output.includes('Server PID:')||run.child.exitCode!==null,'Preview did not start',run);
  assert.match(run.output,/Server PID: (\d+) \/ launcher PID: (\d+)/);
  return {run,port,serverPid:Number(run.output.match(/Server PID: (\d+)/)[1])};
}
async function closeWindows(){
  const cases=[['start-viewer.cmd',cmd],['start-editor.cmd',cmd]];
  const cmd32=path.join(process.env.WINDIR,'SysWOW64/cmd.exe'),ps32=path.join(process.env.WINDIR,'SysWOW64/WindowsPowerShell/v1.0/powershell.exe');
  if(fs.existsSync(cmd32))cases.push(['start-viewer.cmd',cmd32]);
  if(fs.existsSync(ps32))cases.push(['start-viewer.ps1',ps32]);
  for(const [entry,executable] of cases){
    const owned=await preview(entry,executable),label=entry+(executable.includes('SysWOW64')?' (32-bit)':'');
    try{
      // Close only the outer launcher, without /T. Its child PowerShell may
      // survive, including the 64-bit process forwarded by a 32-bit launcher.
      assert(owned.run.output.includes(' / window PIDs: '),owned.run.output);
      const killed=spawnSync(path.join(process.env.WINDIR,'System32/taskkill.exe'),['/PID',String(owned.run.child.pid),'/F'],{windowsHide:true,encoding:'utf8'});
      assert.equal(killed.status,0,killed.stderr);
      await until(()=>canBind(owned.port),label+' left its server running after its launcher closed',owned.run,10000);
      const pids=[owned.serverPid,Number(owned.run.output.match(/launcher PID: (\d+)/)[1])];
      await until(()=>pids.every(pid=>{try{process.kill(pid,0);return false;}catch(error){if(error.code==='ESRCH')return true;throw error;}}),label+' left a server or child PowerShell process running',owned.run,10000);
      console.log('PASS: closing '+label+' stops its server and child PowerShell and releases the port.');
    }finally{
      // Address only the server created by this test, including on failure.
      await new Promise(resolve=>{
        const control=net.createConnection('\\\\.\\pipe\\traffic-guide-preview-'+owned.serverPid,()=>control.end('stop\n'));
        control.on('error',()=>{});control.once('close',resolve);
        control.setTimeout(1000,()=>control.destroy());
      });
    }
  }
}
async function main(){
  const unrelated=http.createServer((request,response)=>response.end('Unrelated service'));
  await new Promise(resolve=>unrelated.listen(0,'127.0.0.1',resolve));
  const artifacts=path.resolve(__dirname,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
  const fixture=fs.mkdtempSync(path.join(artifacts,'preview-lifecycle-'));
  try{
    const saved=fs.readFileSync(path.join(root,'layout/presentation-layout.json'));
    if(process.argv.includes('--window-only')){
      await closeWindows();
      assert(saved.equals(fs.readFileSync(path.join(root,'layout/presentation-layout.json'))));
      return;
    }
    const active=await preview(),legacyPort=await freePort();
    // Simulate version 1 with project saving, but without window monitoring.
    const legacyFile=path.join(fixture,'legacy.cjs');
    fs.writeFileSync(legacyFile,"const handler=require(process.argv[2]).createServer();require('node:http').createServer((request,response)=>{if(request.url.endsWith('/__preview')){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({version:1,projectStorage:true}));return;}handler.emit('request',request,response);}).listen(Number(process.env.PORT),'127.0.0.1',()=>console.log('LEGACY_READY'));\n");
    const legacy=launch(process.execPath,[legacyFile,serverScript],{PORT:String(legacyPort),ELECTRON_RUN_AS_NODE:'1'});
    await until(()=>legacy.output.includes('LEGACY_READY'),'Legacy preview did not start',legacy);
    const status=await command(ps,powershell('stop-editor.ps1',['-Status']));
    for(const value of [active.serverPid,active.port,legacy.child.pid,legacyPort])assert(status.includes(String(value)),status);
    assert.equal(active.run.child.exitCode,null,'Status must not stop the preview');assert.equal(legacy.child.exitCode,null);
    const stopped=await command(cmd,['/d','/s','/c','""'+path.join(root,'stop-editor.cmd')+'" -Port '+active.port+'"']);
    assert.match(stopped,/Project preview servers on port .* have stopped/);
    await until(()=>active.run.child.exitCode!==null,'Launcher did not exit after graceful stop',active.run,10000);
    assert.equal(active.run.child.exitCode,0,active.run.output);
    assert.match(active.run.output,/Stopping preview: stop-editor requested/);
    assert(await canBind(active.port));assert.equal(legacy.child.exitCode,null,'Stopping one port must preserve other project previews');
    const upgraded=launch(ps,powershell('start-editor.ps1',['-NoBrowser']),{PORT:String(legacyPort)});
    await until(()=>upgraded.output.includes('Server PID:')||upgraded.child.exitCode!==null,'Old preview did not upgrade',upgraded);
    assert.match(upgraded.output,/Restarting this project preview/);assert.match(upgraded.output,/Server PID:/);
    assert.deepEqual(await(await fetch('http://127.0.0.1:'+legacyPort+'/presentation-demo/__preview')).json(),{version:2,projectStorage:true});
    const reused=launch(ps,powershell('start-editor.ps1',['-NoBrowser']),{PORT:String(legacyPort)});
    await until(()=>reused.child.exitCode!==null,'Second launcher did not reuse the current server',reused);
    assert.equal(reused.child.exitCode,0,reused.output);assert.match(reused.output,/already running/);assert.equal(upgraded.child.exitCode,null);
    console.log('PASS: the launcher replaces an outdated preview on its own port and reuses an up-to-date server without interrupting its owner.');
    await command(cmd,['/d','/s','/c','""'+path.join(root,'stop-editor.cmd')+'" -Port '+legacyPort+'"']);assert(await canBind(legacyPort));
    assert.match(await command(cmd,['/d','/s','/c','""'+path.join(root,'stop-editor.cmd')+'" -Port '+active.port+'"']),/No preview is running/);
    assert.equal(await(await fetch('http://127.0.0.1:'+unrelated.address().port,{signal:AbortSignal.timeout(5000)})).text(),'Unrelated service');
    console.log('PASS: status is read-only; stop CMD gracefully stops the current preview, handles legacy servers, releases all project ports and preserves unrelated services; repeated stop is safe.');
    const orphan=await preview();
    const killed=spawnSync(path.join(process.env.WINDIR,'System32/taskkill.exe'),['/PID',String(orphan.run.child.pid),'/F'],{windowsHide:true,encoding:'utf8'});
    assert.equal(killed.status,0,killed.stderr);
    // Kill only the launcher, leaving the server alive to exercise its watchdog.
    await until(()=>canBind(orphan.port),'Orphan preview did not release its port',orphan.run,10000);
    assert(saved.equals(fs.readFileSync(path.join(root,'layout/presentation-layout.json'))));
    console.log('PASS: terminating just the launcher automatically stops its server and releases the port; saved layout is unchanged.');
    await closeWindows();
  }finally{
    for(const run of runs)if(run.child.pid&&run.child.exitCode===null)spawnSync(path.join(process.env.WINDIR,'System32/taskkill.exe'),['/PID',String(run.child.pid),'/T','/F'],{windowsHide:true});
    await new Promise(resolve=>unrelated.close(resolve));
    assert(path.dirname(fixture)===artifacts&&path.basename(fixture).startsWith('preview-lifecycle-'));
    fs.rmSync(fixture,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
