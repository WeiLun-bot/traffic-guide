'use strict';
// Test the user's actual Windows launchers, including x86 PowerShell 5.1.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {spawn, spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const script = path.join(root, 'tools/preview-editor.ps1');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function launch(executable,args,env){
  const child=spawn(executable,args,{cwd:process.env.USERPROFILE||path.dirname(root),env,windowsHide:true,windowsVerbatimArguments:path.basename(executable).toLowerCase()==='cmd.exe',stdio:['pipe','pipe','pipe']});
  const run={child,output:'',error:null};
  child.stdout.on('data',chunk=>{run.output+=chunk.toString();});child.stderr.on('data',chunk=>{run.output+=chunk.toString();});child.once('error',error=>{run.error=error;});
  return run;
}
async function waitFor(run,predicate,message,timeout=60000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(run.error)throw run.error;if(predicate())return;await delay(100);}
  throw new Error(message+':\n'+run.output);
}
async function stop(run){
  const child=run.child;
  if(child.pid&&child.exitCode===null){const result=spawnSync(path.join(process.env.WINDIR,'System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,encoding:'utf8'});if(result.error||result.status!==0){child.unref();throw new Error('Unable to stop owned preview test process '+child.pid+': '+(result.error?.message||result.stderr));}await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(1000)]);}
  child.stdout.destroy();child.stderr.destroy();child.stdin.destroy();
}
async function freePort() {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  return port;
}
async function check(label, executable, argumentsForScript, browser='disabled', viewer=false) {
  const port = await freePort();
  const env = {...process.env, PORT: String(port), TRAFFIC_GUIDE_NO_PAUSE:'1', TRAFFIC_GUIDE_NO_BROWSER:'1'};
  if(browser!=='disabled')delete env.TRAFFIC_GUIDE_NO_BROWSER;
  delete env.ELECTRON_RUN_AS_NODE;
  const obsolete=path.join(root,'_site','preview-launcher-obsolete-'+port+'.txt');
  fs.mkdirSync(path.dirname(obsolete),{recursive:true});
  fs.writeFileSync(obsolete,'Obsolete preview fixture');
  const run=launch(executable,argumentsForScript,env),child=run.child;
  try {
    await waitFor(run,()=>run.output.includes('Preview:')||child.exitCode!==null,label+' did not start');
    assert(run.output.includes('Preview:'),label+' exited before serving:\n'+run.output);
    const browserMessage=browser==='automatic'?'TEST_BROWSER_READY http://127.0.0.1:'+port+'/presentation-demo/'+(viewer?'viewer.html':''):'Automatic browser opening is disabled.';
    await waitFor(run,()=>run.output.includes(browserMessage)||child.exitCode!==null,label+' did not handle browser opening');
    assert(run.output.includes(browserMessage),run.output);
    if(browser==='automatic')assert.equal(run.output.split('TEST_BROWSER_READY ').length-1,1,'Open the browser only once after the server is ready');
    assert.match(run.output,/Backed up \d+ obsolete preview entries to exports\/preview-backups\//);
    assert(!fs.existsSync(obsolete),label+' must archive obsolete preview files before serving');
    assert(run.output.includes('[1/3]')&&run.output.includes('[2/3]')&&run.output.includes('[3/3]'),'Startup stages must be visible: '+label);
    assert(!run.output.includes('"sha256"'),'The launcher should not flood the console with the full build manifest');
    const base = 'http://127.0.0.1:' + port + '/presentation-demo/';
    if(viewer){assert(run.output.includes(base+'viewer.html'),run.output);const entry=await fetch(base+'viewer.html');assert.equal(entry.status,200);assert.match(await entry.text(),/searchParams.set\('mode', 'view'\)/);}
    const page = await fetch(base);
    assert.equal(page.status, 200);assert.match(await page.text(), /assets\/visual-editor\.js/);
    const json = await fetch(base + 'layout/presentation-layout.json');
    assert.equal(json.status, 200);const layout=await json.json();assert.equal(layout.documentId, 'general-road-scenarios');assert.equal(layout.kind,'presentation-layout');assert(!layout.content&&!layout.legacyState.texts);
    for(const file of ['data/content/catalog.json','data/presentation-navigation.json','assets/presentation-document.js'])assert.equal((await fetch(base+file)).status,200,file);
    const project=await(await fetch(base+'__project')).json();assert(project.token&&project.revision);assert(project.config.content&&project.config.legacyState.texts);
    const status=await(await fetch(base+'__preview')).json();assert.equal(status.version,2);assert.equal(status.projectStorage,true);assert.match(status.storageSignature,/^[a-f0-9]{64}(:[a-f0-9]{64}){3}$/);
    const asset = await fetch(base + 'assets/visual-editor.js');assert.equal(asset.status, 200);await asset.text();
    assert(!/ParserError|UnexpectedToken|MissingEndCurlyBrace/.test(run.output), label + ' had a PowerShell parse error');
    console.log('PASS: ' + label + ' starts from a different folder and serves HTML, JSON and editor assets.');
    if(label==='Double-click CMD launcher'||browser==='automatic'){
      const again=launch(executable,argumentsForScript,env);
      try{await waitFor(again,()=>again.child.exitCode!==null,'Second launch did not finish');assert.equal(again.child.exitCode,0,again.output);assert(again.output.includes('already running')&&again.output.includes('Ctrl+Shift+R'),again.output);assert(again.output.includes(browserMessage),again.output);assert.equal(child.exitCode,null,'Re-launch must not stop the existing server');assert.equal((await fetch(base)).status,200);console.log('PASS: a second launch updates files, handles browser opening and reuses the same project server without a port error.');}finally{await stop(again);}
    }
  } finally {
    await stop(run);
  }
}
async function main() {
  const savedSettings=fs.readFileSync(path.join(root,'layout/presentation-layout.json'));
  assert([...fs.readFileSync(script)].every(byte => byte < 128), 'PowerShell launcher must remain ASCII');
  const entry=path.join(root,'start-editor.ps1');
  assert([...fs.readFileSync(entry)].every(byte=>byte<128),'Root PowerShell launcher must remain ASCII');
  const windows = process.env.WINDIR;
  const engines = [
    ['64-bit Windows PowerShell', path.join(windows, 'System32/WindowsPowerShell/v1.0/powershell.exe')],
    ['32-bit Windows PowerShell', path.join(windows, 'SysWOW64/WindowsPowerShell/v1.0/powershell.exe')]
  ];
  if(process.argv.includes('--viewer-only')){
    const viewerEntry=path.join(root,'start-viewer.ps1');
    assert([...fs.readFileSync(viewerEntry)].every(byte=>byte<128));
    await check('Viewer CMD launcher',path.join(windows,'System32/cmd.exe'),['/d','/s','/c','""'+path.join(root,'start-viewer.cmd')+'""'],'disabled',true);
    if(fs.existsSync(engines[1][1]))await check('32-bit viewer launcher with -NoBrowser',engines[1][1],['-NoProfile','-ExecutionPolicy','Bypass','-File',viewerEntry,'-NoBrowser'],'switch',true);
    const autoViewer="function Start-Process { param([string]$FilePath) $page = Invoke-WebRequest -UseBasicParsing -Uri $FilePath -TimeoutSec 5; if ($page.StatusCode -ne 200) { throw 'Preview is not ready' }; Write-Host ('TEST_BROWSER_READY ' + $FilePath) }; & '"+viewerEntry.replace(/'/g,"''")+"'";
    await check('Automatic viewer browser opening',engines[0][1],['-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(autoViewer,'utf16le').toString('base64')],'automatic',true);
    assert(savedSettings.equals(fs.readFileSync(path.join(root,'layout/presentation-layout.json'))));
    console.log('PASS: viewer launchers and automatic opening preserve saved settings.');return;
  }
  for (const [name, executable] of engines) if (fs.existsSync(executable)) await check(name, executable, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script]);
  const ps64=engines[0][1],ps32=engines[1][1];
  await check('Root PowerShell launcher with -NoBrowser',ps64,['-NoProfile','-ExecutionPolicy','Bypass','-File',entry,'-NoBrowser'],'switch');
  if(fs.existsSync(ps32))await check('32-bit root launcher with -NoBrowser',ps32,['-NoProfile','-ExecutionPolicy','Bypass','-File',entry,'-NoBrowser'],'switch');
  // Intercept only the OS browser dispatch, and request the real server at that
  // exact moment to prove opening occurs after readiness. Avoid opening tabs.
  const autoScript="function Start-Process { param([string]$FilePath) $page = Invoke-WebRequest -UseBasicParsing -Uri $FilePath -TimeoutSec 5; if ($page.StatusCode -ne 200) { throw 'Preview is not ready' }; Write-Host ('TEST_BROWSER_READY ' + $FilePath) }; & '"+entry.replace(/'/g,"''")+"'";
  await check('Automatic browser opening',ps64,['-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(autoScript,'utf16le').toString('base64')],'automatic');
  await check('Double-click CMD launcher', path.join(windows, 'System32/cmd.exe'), ['/d', '/s', '/c', '""' + path.join(root, 'start-editor.cmd') + '""']);
  await check('Explorer CMD launcher',path.join(windows,'System32/cmd.exe'),['/c','""'+path.join(root,'start-editor.cmd')+'""']);
  const cmd32=path.join(windows,'SysWOW64/cmd.exe');if(fs.existsSync(cmd32))await check('32-bit CMD launcher',cmd32,['/d','/s','/c','""'+path.join(root,'start-editor.cmd')+'""']);
  const http=require('node:http'),busy=http.createServer((request,response)=>{response.end('Unrelated service');});await new Promise(resolve=>busy.listen(0,'127.0.0.1',resolve));
  const env={...process.env,PORT:String(busy.address().port),TRAFFIC_GUIDE_NO_PAUSE:'1',TRAFFIC_GUIDE_NO_BROWSER:'1'};delete env.ELECTRON_RUN_AS_NODE;
  const rejected=launch(path.join(windows,'System32/cmd.exe'),['/d','/s','/c','""'+path.join(root,'start-editor.cmd')+'""'],env);
  try{await waitFor(rejected,()=>rejected.child.exitCode!==null,'Occupied-port launch did not finish');assert.equal(rejected.child.exitCode,1,rejected.output);assert.match(rejected.output,/ERROR:.*in use by another program/);assert.equal(await(await fetch('http://127.0.0.1:'+busy.address().port)).text(),'Unrelated service');console.log('PASS: an unrelated occupied port gets a readable error and its process is left running.');}finally{await stop(rejected);await new Promise(resolve=>busy.close(resolve));}
  assert(savedSettings.equals(fs.readFileSync(path.join(root,'layout/presentation-layout.json'))),'Preview launch must preserve saved settings');
  console.log('PASS: all Windows preview launchers.');
}
main().catch(error => {console.error(error);process.exitCode = 1;});
