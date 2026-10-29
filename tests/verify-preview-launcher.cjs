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
async function freePort() {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  return port;
}
async function check(label, executable, argumentsForScript) {
  const port = await freePort();
  const env = {...process.env, PORT: String(port)};
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, argumentsForScript, {cwd: process.env.USERPROFILE || path.dirname(root), env, windowsHide: true, windowsVerbatimArguments: path.basename(executable).toLowerCase() === 'cmd.exe', stdio: ['pipe', 'pipe', 'pipe']});
  let output = '', startupError;
  child.stdout.on('data', chunk => {output += chunk.toString();});
  child.stderr.on('data', chunk => {output += chunk.toString();});
  child.once('error', error => {startupError = error;});
  try {
    const deadline = Date.now() + 30000;
    while (!output.includes('Preview:') && Date.now() < deadline) {
      if (startupError) throw startupError;
      assert.equal(child.exitCode, null, label + ' exited before serving:\n' + output);
      await delay(100);
    }
    assert(output.includes('Preview:'), label + ' did not start:\n' + output);
    const base = 'http://127.0.0.1:' + port + '/presentation-demo/';
    const page = await fetch(base);
    assert.equal(page.status, 200);assert.match(await page.text(), /assets\/visual-editor\.js/);
    const json = await fetch(base + 'layout/presentation-layout.json');
    assert.equal(json.status, 200);assert.equal((await json.json()).documentId, 'general-road-scenarios');
    const asset = await fetch(base + 'assets/visual-editor.js');assert.equal(asset.status, 200);await asset.text();
    assert(!/ParserError|UnexpectedToken|MissingEndCurlyBrace/.test(output), label + ' had a PowerShell parse error');
    console.log('PASS: ' + label + ' starts from a different folder and serves HTML, JSON and editor assets.');
  } finally {
    // Only stop the exact child process tree created for this test.
    if (child.pid && child.exitCode === null) {
      const stopped = spawnSync(path.join(process.env.WINDIR, 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true, encoding: 'utf8'});
      if (stopped.error || stopped.status !== 0) { child.unref(); throw new Error('Unable to stop owned preview test process ' + child.pid + ': ' + (stopped.error?.message || stopped.stderr)); }
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(1000)]);
    }
    child.stdout.destroy();child.stderr.destroy();child.stdin.destroy();
  }
}
async function main() {
  assert([...fs.readFileSync(script)].every(byte => byte < 128), 'PowerShell launcher must remain ASCII');
  const windows = process.env.WINDIR;
  const engines = [
    ['64-bit Windows PowerShell', path.join(windows, 'System32/WindowsPowerShell/v1.0/powershell.exe')],
    ['32-bit Windows PowerShell', path.join(windows, 'SysWOW64/WindowsPowerShell/v1.0/powershell.exe')]
  ];
  for (const [name, executable] of engines) if (fs.existsSync(executable)) await check(name, executable, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script]);
  await check('Double-click CMD launcher', path.join(windows, 'System32/cmd.exe'), ['/d', '/s', '/c', '""' + path.join(root, 'start-editor.cmd') + '""']);
  console.log('PASS: all Windows preview launchers.');
}
main().catch(error => {console.error(error);process.exitCode = 1;});
