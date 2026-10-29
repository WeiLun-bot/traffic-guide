'use strict';
// Real Edge/Chrome, built-in Node WebSocket/CDP; no downloaded dependencies.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const {createServer} = require('../tools/serve-github-pages.cjs');
const Core = require('../assets/visual-editor-core.js');
const root = path.resolve(__dirname, '..'), artifacts = process.env.VISUAL_EDITOR_ARTIFACTS || path.join(__dirname, 'artifacts/visual-editor');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const configPath = path.join(root, 'layout/presentation-layout.json');
const baselinePath = path.join(artifacts, 'baseline.html');
const initialConfigText = fs.readFileSync(configPath, 'utf8');
const initialConfig = Core.parse(initialConfigText);
// Keep visual interaction tests independent of the user's saved camera choices.
// The fixture is served through the same live-source route as the real project.
for(const [id,view] of Object.entries(initialConfig.imageViews))initialConfig.imageViews[id]=Core.imageView(view.pageId,view.assetKey);
const previewConfigPath=path.join(artifacts,'preview-layout.json');
const previewConfigText=JSON.stringify(initialConfig);
class CDP {
  constructor(url) {
    this.id = 0; this.pending = new Map(); this.events = new Map(); this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve); this.socket.addEventListener('error', reject); });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) { const pending = this.pending.get(message.id); if (!pending) return; clearTimeout(pending.timer); this.pending.delete(message.id); if (message.error) pending.reject(new Error(JSON.stringify(message.error))); else pending.resolve(message.result); }
      else for (const listener of this.events.get(message.method) || []) listener(message.params);
    });
  }
  on(name, listener) { this.events.set(name, [...this.events.get(name) || [], listener]); }
  async send(method, params = {}) {
    await this.ready; const id = ++this.id;
    return new Promise((resolve, reject) => { const timer = setTimeout(() => {this.pending.delete(id); reject(new Error('CDP timeout: ' + method));}, 15000); this.pending.set(id, {resolve, reject, timer}); this.socket.send(JSON.stringify({id, method, params})); });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  close() { this.socket.close(); }
}
async function main() {
  fs.mkdirSync(artifacts, {recursive: true});
  fs.writeFileSync(previewConfigPath,previewConfigText);
  const profile = path.join(os.tmpdir(), 'traffic-guide-browser-' + Date.now());
  const downloads = path.join(artifacts, 'downloads-' + Date.now()); fs.mkdirSync(downloads);
  const executable = process.env.VISUAL_EDITOR_BROWSER || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(file => fs.existsSync(file));
  assert(executable, 'Set VISUAL_EDITOR_BROWSER to a Chrome/Edge executable');
  let override = null, failConfig = false,failModules=false,failStartupScript=false,startupHold=null;
  const heldStartupRequests=[];
  const setStartupHold=value=>{startupHold=value;if(!value)for(const release of heldStartupRequests.splice(0))release();};
  const published = createServer(undefined,{configFile:previewConfigPath});
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/baseline.html' && fs.existsSync(baselinePath)) {response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});fs.createReadStream(baselinePath).pipe(response);return;}
    if(startupHold&&pathname.endsWith(startupHold)){heldStartupRequests.push(()=>published.emit('request',request,response));return;}
    if(failStartupScript&&pathname.endsWith('/assets/presentation-structure.js')){response.writeHead(404);response.end();return;}
    if (pathname.endsWith('/layout/presentation-layout.json') && failConfig) {response.writeHead(404);response.end();return;}
    if(failModules&&pathname.endsWith('/data/modules/M2-01.json')){response.writeHead(404);response.end();return;}
    if (pathname.endsWith('/layout/presentation-layout.json') && override) {response.writeHead(200, {'Content-Type': 'application/json'});response.end(override);return;}
    published.emit('request', request, response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], {windowsHide: true, stdio: 'ignore'});
  const browserExit = new Promise(resolve => browser.once('exit', resolve));
  let cdp;
  const checks = [], exceptions = [];
  const pass = name => {checks.push(name);console.log('PASS: ' + name);};
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let index = 0; index < 200 && !fs.existsSync(portFile); index++) {if(browser.exitCode !== null) throw new Error('Browser exited before CDP startup');await delay(100);}
    assert(fs.existsSync(portFile), 'Browser did not start remote debugging');
    const debugPort = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
    const targets = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json();
    cdp = new CDP(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    cdp.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    cdp.on('Page.javascriptDialogOpening', () => cdp.send('Page.handleJavaScriptDialog', {accept: true}).catch(() => {}));
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false});
    await cdp.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: downloads});
    const evaluate = expression => cdp.evaluate(expression);
    async function wait(expression, message, timeout = 10000) {
      const started = Date.now();
      while (Date.now() - started < timeout) {if (await evaluate(expression).catch(() => false)) return;await delay(50);}
      throw new Error(message || 'Wait failed: ' + expression);
    }
    async function navigate(url) {
      await evaluate('window.__previousTestDocument = true');
      const destination = new URL(url); destination.searchParams.set('test-document', String(Date.now()));
      await cdp.send('Page.navigate', {url: destination.href});
      await wait('Boolean(!window.__previousTestDocument && window.generalRoadPresentation && document.querySelector("main>.slide"))', 'New presentation document did not load');
      await delay(420);
    }
    async function view(id, phase = 0) {
      await evaluate(`window.generalRoadPresentation.goPage(${JSON.stringify(id)},${phase})`);
      await evaluate(`(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))})()`);
      await delay(80);
    }
    async function click(selector) {await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)}),menu=node?.closest('.vl-files');if(menu&&!menu.open)menu.querySelector('summary').click();if(node?.closest('.presentation-picker-menu')?.hidden)document.getElementById('presentation-picker-toggle').click();node.click()})()`);await delay(20);}
    async function mouse(type, x, y, extra = {}) {return cdp.send('Input.dispatchMouseEvent', {type, x, y, ...extra});}
    async function dragFrom(x, y, dx, dy) {
      await mouse('mouseMoved', x, y);await mouse('mousePressed', x, y, {button: 'left', buttons: 1, clickCount: 1});
      for (let step = 1; step <= 6; step++) await mouse('mouseMoved', x + dx * step / 6, y + dy * step / 6, {button: 'left', buttons: 1});
      await mouse('mouseReleased', x + dx, y + dy, {button: 'left', buttons: 0, clickCount: 1});await delay(60);
    }
    const moduleCheck=async()=>require('./presentation-modules-browser.cjs')({evaluate,view,click,navigate,wait,cdp,base,artifacts,pass,previewConfigPath,previewConfigText,editText,setModuleFailure:value=>{failModules=value;}});
    const libraryCheck=async()=>require('./module-library-browser.cjs')({evaluate,view,click,navigate,wait,cdp,base,artifacts,pass,previewConfigPath,previewConfigText,editText});
    if(process.argv.includes('--library-only')){await navigate(base+'/presentation-demo/#cover');await libraryCheck();assert.deepEqual(exceptions,[]);console.log('PASS: '+checks.length+' module library browser regression groups; no uncaught JavaScript exceptions.');return;}
    const structureCheck=async()=>require('./presentation-structure-browser.cjs')({evaluate,view,click,navigate,cdp,base,artifacts,pass});
    const pickerCheck=async()=>require('./presentation-picker-browser.cjs')({evaluate,view,click,navigate,wait,cdp,base,artifacts,pass});
    const directoryCheck=async()=>require('./presentation-directories-browser.cjs')({evaluate,view,click,navigate,cdp,base,artifacts,pass});
    const fullscreenCheck=async()=>require('./fullscreen-module-topics-browser.cjs')({evaluate,view,navigate,click,wait,cdp,base,artifacts,pass});
    const startupCheck=async()=>require('./presentation-startup-browser.cjs')({evaluate,click,wait,cdp,base,artifacts,pass,setStartupHold,setScriptFailure:value=>{failStartupScript=value;}});
    if(process.argv.includes('--startup-only')){await startupCheck();assert.deepEqual(exceptions,[]);console.log('PASS: '+checks.length+' startup browser regression groups; no uncaught JavaScript exceptions.');return;}
    const viewportCheck=async()=>require('./viewport-behavior-browser.cjs')({evaluate,view,navigate,click,cdp,base,pass});
    if(process.argv.includes('--viewport-only')){await viewportCheck();assert.deepEqual(exceptions,[]);console.log('PASS: viewport and reference browser regressions; no uncaught JavaScript exceptions.');return;}
    if(process.argv.includes('--fullscreen-only')){await fullscreenCheck();assert.deepEqual(exceptions,[]);console.log('PASS: '+checks.length+' fullscreen browser regression groups; no uncaught JavaScript exceptions.');return;}
    if(process.argv.includes('--directories-only')){await directoryCheck();assert.deepEqual(exceptions,[]);console.log('PASS: '+checks.length+' directory browser regression groups; no uncaught JavaScript exceptions.');return;}
    if(process.argv.includes('--picker-only')){await pickerCheck();assert.deepEqual(exceptions,[]);console.log('PASS: '+checks.length+' picker browser regression groups; no uncaught JavaScript exceptions.');return;}
    if(process.argv.includes('--structure-only')){await structureCheck();await pickerCheck();await directoryCheck();await moduleCheck();assert.deepEqual(exceptions,[]);console.log('PASS: '+checks.length+' structure/module browser regression groups; no uncaught JavaScript exceptions.');return;}
    if(process.argv.includes('--modules-only')){
      await navigate(base+'/presentation-demo/#cover');await moduleCheck();assert.deepEqual(exceptions,[]);
      console.log('PASS: '+checks.length+' module browser regression groups; no uncaught JavaScript exceptions.');return;
    }
    // Normalize only the requested label and new toolbar action before comparing
    // the original text and all existing geometry/font metrics.
    const metricsExpression = `(() => [...document.querySelectorAll('main h1,main h2,main p,main>section,main .map-layout,main .context-grid,main .cover-art,main svg')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height}).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),copy=e.cloneNode(true);copy.querySelectorAll('.scenario-switcher').forEach(node=>node.remove());return {tag:e.localName,classes:e.className.baseVal??e.className,text:e.matches('svg')?'':copy.textContent.replaceAll('現況路口圖','現況圖').replaceAll('設定初始畫面','').slice(0,120),x:r.x,y:r.y,width:r.width,height:r.height,fontSize:s.fontSize,fontFamily:s.fontFamily}}))()`;
    const baseline = {}, compared = ['cover', 'context', 'g102-context', 'g102-comparison', 'g104-context'];
    if (fs.existsSync(baselinePath)) {
      await navigate(base + '/baseline.html#cover');
      for (const id of compared) {await view(id, id === 'edge' ? 1 : 0);baseline[id] = await evaluate(metricsExpression);}
    }
    await navigate(base + '/presentation-demo/#cover');
    assert(await evaluate('Boolean(window.visualLayoutEditor && window.visualLayoutEditor.store)'), 'Visual editor did not start');
    for (const id of compared) {
      await view(id, id === 'edge' ? 1 : 0);
      const actual = await evaluate(metricsExpression);
      if (baseline[id]) {
        assert.equal(actual.length, baseline[id].length, 'Element count changed: ' + id);
        actual.forEach((entry, index) => {
          const expected = baseline[id][index];
          for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(entry[key] - expected[key]) < .6, `Initial layout changed: ${id} ${entry.tag}.${entry.classes} ${key}: ${entry[key]} vs ${expected[key]}`);
          for (const key of ['fontSize', 'fontFamily', 'text']) assert.equal(entry[key], expected[key], 'Initial content/font changed: ' + id);
        });
      }
    }
    pass(fs.existsSync(baselinePath) ? 'content, geometry and typography remain unchanged on five unaffected page types' : 'five unaffected page types load; original HTML artifact is unavailable, so geometry comparison was not run');
    await view('g101-conditions');
    assert.equal(await evaluate('document.querySelector("[data-vl-action=mode]").getClientRects().length'),0,'Preview must expose only the content editing entry');
    await click('.edit-toggle');
    assert(await evaluate('Boolean(document.querySelector("#editor-toolbar [data-vl-action=mode]").getClientRects().length)'));
    assert.equal(await evaluate('document.querySelectorAll("#editor-toolbar .editor-image").length'),0);
    assert(await evaluate('document.getElementById("slide-title").isContentEditable'));
    assert.equal(await evaluate('document.querySelectorAll(".image-edit-button").length'),3);
    await evaluate('window.__imagePickerCalls=0;document.getElementById("editor-image-file").click=()=>{window.__imagePickerCalls++}');
    await click('.condition-photo .image-edit-button');
    assert.equal(await evaluate('window.__imagePickerCalls'),1);
    await click('[data-vl-action="mode"]');
    assert(await evaluate('window.generalRoadEditor.editing && window.visualLayoutEditor.editing'));
    assert.equal(await evaluate('document.getElementById("slide-title").isContentEditable'),false,'Visual dragging must disable text entry');
    assert.equal(await evaluate('document.getElementById("editor-toolbar").hidden'),false);
    assert.equal(await evaluate('document.querySelector(".edit-toggle").textContent'),'完成編輯・預覽');
    await click('.condition-photo .image-edit-button');
    assert.equal(await evaluate('window.__imagePickerCalls'),2,'Image-side replacement must remain available in visual mode');
    const imageFixture=path.join(artifacts,'replacement-test.svg');fs.writeFileSync(imageFixture,'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#426c58"/></svg>');
    const {root:replacementRoot}=await cdp.send('DOM.getDocument');
    const {nodeId:replacementInput}=await cdp.send('DOM.querySelector',{nodeId:replacementRoot.nodeId,selector:'#editor-image-file'});
    await cdp.send('DOM.setFileInputFiles',{nodeId:replacementInput,files:[imageFixture]});
    await wait('Object.values(window.generalRoadEditor.state.images).some(image=>image.alt==="replacement-test.svg")','Image-side replacement did not update the content state');
    assert(await evaluate('window.visualLayoutEditor.editing'));
    const unifiedShot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'unified-editing.png'),Buffer.from(unifiedShot.data,'base64'));
    await click('[data-vl-action="mode"]');
    assert(await evaluate('window.generalRoadEditor.editing && !window.visualLayoutEditor.editing && document.getElementById("slide-title").isContentEditable'));
    await click('[data-vl-action="mode"]');await view('context');await click('.edit-toggle');
    assert.equal(await evaluate('window.generalRoadEditor.editing || window.visualLayoutEditor.editing'),false);
    assert.equal(await evaluate('document.querySelector("[data-vl-action=mode]").getClientRects().length'),0);
    assert.equal(await evaluate('document.querySelectorAll(".image-edit-button,[contenteditable]").length'),0);
    pass('one content-editing entry contains visual editing; switching modes preserves image-side replacement and closing returns to preview');
    await navigate(base+'/presentation-demo/#g101-conditions');await click('.edit-toggle');
    const contentCount=await evaluate('document.querySelectorAll(".condition-issue").length');
    assert.equal(await evaluate('document.querySelector(".editor-format").textContent'),'文字樣式');
    assert.equal(await evaluate('document.querySelector("[data-vl-action=mode]").textContent'),'進階版面');
    assert.equal(await evaluate('document.querySelector(".editor-add-explanation").getClientRects().length'),0);
    await click('[data-content-action="add-issue"]');
    const addedIssue=await evaluate('window.PresentationContent.current.model.issues.at(-1)');
    assert.equal(await evaluate('document.querySelectorAll(".condition-issue").length'),contentCount+1);
    const issueSelector='.condition-issue[data-content-item-id="'+addedIssue.id+'"]';
    async function editText(selector,text){await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.textContent=${JSON.stringify(text)};node.dispatchEvent(new Event('input',{bubbles:true}))})()`);}
    await editText(issueSelector+' h3','新增問題的固定標題');
    await click(issueSelector+' [data-content-action="add-point"]');await click(issueSelector+' [data-content-action="add-point"]');
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:2});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers:2});
    assert.equal(await evaluate('window.PresentationContent.current.model.issues.at(-1).points.length'),1,'Ctrl+Z must undo structural edits while a new item has focus');
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Z',code:'KeyZ',modifiers:10});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Z',code:'KeyZ',modifiers:10});
    assert.equal(await evaluate('window.PresentationContent.current.model.issues.at(-1).points.length'),2);
    const addedPoints=await evaluate('window.PresentationContent.current.model.issues.at(-1).points');
    await editText(issueSelector+' .content-point-row p','現況問題新增說明：保持固定 ID');
    await click(issueSelector+' .content-item-actions [data-content-action="up"]');
    assert.equal(await evaluate('window.PresentationContent.current.model.issues['+contentCount+'-1].id'),addedIssue.id);
    assert.equal(await evaluate('document.querySelector('+JSON.stringify(issueSelector+' h3')+').textContent'),'新增問題的固定標題');
    const pointSelector=issueSelector+' .content-point-row[data-content-item-id="'+addedPoints[0].id+'"]';
    await click(pointSelector+' [data-content-action="remove"]');await click('[data-vl-action="undo"]');
    assert.equal(await evaluate('document.querySelector('+JSON.stringify(pointSelector+' p')+').textContent'),'現況問題新增說明：保持固定 ID');
    await click(issueSelector+' .condition-card-heading [data-content-action="remove"]');await click('[data-vl-action="undo"]');
    assert(await evaluate('Boolean(document.querySelector('+JSON.stringify(issueSelector)+'))'));
    await evaluate('document.getElementById("editor-image-file").click=()=>{}');await click(issueSelector+' .content-add-photo');
    const {root:contentDocument}=await cdp.send('DOM.getDocument');const {nodeId:contentFile}=await cdp.send('DOM.querySelector',{nodeId:contentDocument.nodeId,selector:'#editor-image-file'});
    await cdp.send('DOM.setFileInputFiles',{nodeId:contentFile,files:[imageFixture]});
    await wait('Boolean(document.querySelector('+JSON.stringify(issueSelector+' .condition-photo img')+'))','New problem photo was not rendered');
    await click('[data-vl-action="undo"]');assert.equal(await evaluate('Boolean(document.querySelector('+JSON.stringify(issueSelector+' .condition-photo')+'))'),false,'Uploading a photo must have its own undo step');
    await click('[data-vl-action="redo"]');assert(await evaluate('Boolean(document.querySelector('+JSON.stringify(issueSelector+' .condition-photo img')+'))'));
    await view('g101-conditions');const contentEditingShot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'content-editing.png'),Buffer.from(contentEditingShot.data,'base64'));
    await view('speed',1);const articleCount=await evaluate('document.querySelectorAll(".explain-points>li:not([data-user-block])").length');
    await click('[data-content-action="add-point"]');const addedArticlePoint=await evaluate('window.PresentationContent.current.model.points.at(-1)');
    const articlePointSelector='.explain-points>li[data-content-item-id="'+addedArticlePoint.id+'"]';
    await editText(articlePointSelector+'>span','條文新增說明，排序後仍保持文字與樣式。');
    await click(articlePointSelector+' [data-content-action="up"]');
    assert.equal(await evaluate('window.PresentationContent.current.model.points['+articleCount+'-1].id'),addedArticlePoint.id);
    await click(articlePointSelector+' [data-content-action="remove"]');await click('[data-vl-action="undo"]');
    assert.equal(await evaluate('document.querySelector('+JSON.stringify(articlePointSelector+'>span')+').textContent'),'條文新增說明，排序後仍保持文字與樣式。');
    await evaluate('window.generalRoadFormatting.setActive(true);window.generalRoadFormatting.select(document.querySelector('+JSON.stringify(articlePointSelector+'>span')+').dataset.editKey)');
    await evaluate('(()=>{const input=document.querySelector("[data-format-property=fontSize]");input.value="19";input.dispatchEvent(new Event("input",{bubbles:true}))})()');
    const textStyleShot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'text-style-tools.png'),Buffer.from(textStyleShot.data,'base64'));
    await evaluate('window.generalRoadFormatting.setActive(false)');
    await click(articlePointSelector+' [data-content-action="up"]');
    assert.equal(await evaluate('getComputedStyle(document.querySelector('+JSON.stringify(articlePointSelector+'>span')+')).fontSize'),'19px');
    fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));
    await navigate(base+'/presentation-demo/#g101-conditions');
    assert.equal(await evaluate('document.querySelector('+JSON.stringify(issueSelector+' h3')+').textContent'),'新增問題的固定標題');
    assert(await evaluate('Boolean(document.querySelector('+JSON.stringify(issueSelector+' .condition-photo img')+'))'));
    await click(issueSelector+' .condition-photo-open');assert(await evaluate('document.getElementById("asset-dialog").open'));await evaluate('document.getElementById("asset-dialog").close()');
    assert.equal(await evaluate('document.querySelectorAll("[data-content-action]").length'),0,'Editing controls must disappear in preview');
    await view('speed',1);assert.equal(await evaluate('document.querySelectorAll(".explain-points>li:not([data-user-block])").length'),articleCount+1);
    assert.equal(await evaluate('getComputedStyle(document.querySelector('+JSON.stringify(articlePointSelector+'>span')+')).fontSize'),'19px');
    const structuredShot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'structured-content.png'),Buffer.from(structuredShot.data,'base64'));
    pass('problem groups, photos and both kinds of explanation items support editing, stable ordering, deletion/undo and JSON restoration');
    fs.writeFileSync(previewConfigPath,previewConfigText);
    await navigate(base+'/presentation-demo/#overview');
    assert.equal(await evaluate('document.querySelectorAll(".strategy-row").length'),4);
    assert.deepEqual(await evaluate('window.PresentationContent.current.model.items[0].articleIds'),['edge','parking']);
    assert.deepEqual(await evaluate('window.PresentationContent.current.model.items[2].articleIds'),['arrows','guidance','taper']);
    await click('.strategy-row:first-child .strategy-ref[data-page="parking"]');assert.equal(await evaluate('window.generalRoadPresentation.state.page'),'parking');
    await view('overview');await click('.strategy-row:first-child');assert.equal(await evaluate('window.generalRoadPresentation.state.page'),'edge');
    await view('overview');await click('.edit-toggle');
    const strategySelector='.strategy-row[data-content-item-id="strategy-original-0"]';
    const comparePoint=await evaluate('(()=>{const r=document.querySelector(".compare-stage").getBoundingClientRect();return {x:r.x+r.width*.7,y:r.y+r.height/2}})()');
    await mouse('mouseWheel',comparePoint.x,comparePoint.y,{deltaY:-100,deltaX:0});await delay(70);
    await evaluate('(()=>{const range=document.querySelector(".compare-range");range.value="37";range.dispatchEvent(new Event("input",{bubbles:true}))})()');
    const strategyCamera=await evaluate('window.generalRoadViewport.get(document.querySelector(".compare-after")).read()');
    async function checkStrategyCamera(){await delay(100);const view=await evaluate('window.generalRoadViewport.get(document.querySelector(".compare-after")).read()');const center=value=>[value[0]+value[2]/2,value[1]+value[3]/2,value[2]];const expected=center(strategyCamera);center(view).forEach((value,index)=>assert(Math.abs(value-expected[index])<.00001,'Editing strategies must preserve comparison center and zoom: '+JSON.stringify({view,original:strategyCamera})));assert.equal(await evaluate('document.querySelector(".compare-range").value'),'37');}
    await editText(strategySelector+' .strategy-title','可編輯的空間配置策略');
    await click(strategySelector+' .strategy-title');assert.equal(await evaluate('window.generalRoadPresentation.state.page'),'overview','Editing a strategy must not navigate');
    await click(strategySelector+' [data-content-action="links"]');
    assert.equal(await evaluate('document.querySelector(".strategy-links-dialog").open'),true);
    const strategyLinksShot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'strategy-links.png'),Buffer.from(strategyLinksShot.data,'base64'));
    assert.equal(await evaluate('document.querySelectorAll(".strategy-links-choices input").length'),9);
    assert.equal(await evaluate('Boolean(document.querySelector(".strategy-links-choices input[value=rural-stopline]"))'),false);
    await evaluate('(()=>{const input=document.querySelector(".strategy-links-choices input[value=edge]");input.checked=false;input.dispatchEvent(new Event("change",{bubbles:true}))})()');
    await click('.strategy-links-actions button[type="button"]');
    assert.deepEqual(await evaluate('window.PresentationContent.current.model.items[0].articleIds'),['edge','parking'],'Cancel must discard link selection changes');
    await click(strategySelector+' [data-content-action="links"]');
    await evaluate('(()=>{for(const input of document.querySelectorAll(".strategy-links-choices input")){input.checked=["crosswalk","pedestrian"].includes(input.value);input.dispatchEvent(new Event("change",{bubbles:true}))}const primary=document.querySelector(".strategy-primary-label select");primary.value="pedestrian";primary.dispatchEvent(new Event("change",{bubbles:true}))})()');
    await click('.strategy-links-actions button[type="submit"]');
    assert.deepEqual(await evaluate('window.PresentationContent.current.model.items[0].articleIds'),['crosswalk','pedestrian']);
    assert.equal(await evaluate('window.PresentationContent.current.model.items[0].targetId'),'pedestrian');
    assert.match(await evaluate('document.querySelector('+JSON.stringify(strategySelector+' .strategy-refs')+').textContent'),/§ 185 \/ § 41/);
    await evaluate('window.generalRoadFormatting.setActive(true);window.generalRoadFormatting.select(document.querySelector('+JSON.stringify(strategySelector+' .strategy-title')+').dataset.editKey)');
    await evaluate('(()=>{const input=document.querySelector("[data-format-property=fontSize]");input.value="17";input.dispatchEvent(new Event("input",{bubbles:true}))})()');
    await evaluate('window.generalRoadFormatting.setActive(false)');await checkStrategyCamera();
    assert.equal(await evaluate('document.querySelector(".compare-before").getAttribute("viewBox")'),await evaluate('document.querySelector(".compare-after").getAttribute("viewBox")'),'Both comparison layers must stay synchronized after a strategy edit');
    await click('[data-content-action="add-strategy"]');const plainStrategy=await evaluate('window.PresentationContent.current.model.items.at(-1)');
    const plainSelector='.strategy-row[data-content-item-id="'+plainStrategy.id+'"]';
    await editText(plainSelector+' .strategy-title','不需要跳轉的補充策略');
    await click(plainSelector+' [data-content-action="up"]');await click(plainSelector+' [data-content-action="up"]');
    assert.equal(await evaluate('window.PresentationContent.current.model.items[2].id'),plainStrategy.id);
    await click(plainSelector+' [data-content-action="remove"]');await click('[data-vl-action="undo"]');
    assert(await evaluate('Boolean(document.querySelector('+JSON.stringify(plainSelector)+'))'));
    await click(strategySelector+' [data-content-action="down"]');await click('[data-vl-action="undo"]');await click('[data-vl-action="redo"]');
    assert.equal(await evaluate('getComputedStyle(document.querySelector('+JSON.stringify(strategySelector+' .strategy-title')+')).fontSize'),'17px');
    await checkStrategyCamera();
    assert.deepEqual(await evaluate('[...document.querySelectorAll(".strategy-number")].map(node=>node.textContent)'),['01','02','03','04','05']);
    await view('overview');const strategyEditShot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'strategy-editing.png'),Buffer.from(strategyEditShot.data,'base64'));
    const strategySaved=await evaluate('window.visualLayoutEditor.store.serialize()');fs.writeFileSync(previewConfigPath,strategySaved);
    await navigate(base+'/presentation-demo/#overview');
    assert.equal(await evaluate('document.querySelectorAll(".strategy-row").length'),5);
    assert.equal(await evaluate('document.querySelectorAll(".strategy-row [data-content-action]").length'),0);
    assert.equal(await evaluate('document.querySelector('+JSON.stringify(strategySelector+' .strategy-title')+').textContent'),'可編輯的空間配置策略');
    assert.equal(await evaluate('getComputedStyle(document.querySelector('+JSON.stringify(strategySelector+' .strategy-title')+')).fontSize'),'17px');
    assert.equal(await evaluate('document.querySelector('+JSON.stringify(plainSelector)+').querySelectorAll("[data-page]").length'),0);
    await click(plainSelector);assert.equal(await evaluate('window.generalRoadPresentation.state.page'),'overview');
    await click(strategySelector+' .strategy-ref[data-page="crosswalk"]');assert.equal(await evaluate('window.generalRoadPresentation.state.page'),'crosswalk');
    await view('overview');await click(strategySelector);assert.equal(await evaluate('window.generalRoadPresentation.state.page'),'pedestrian');
    await view('g102-overview');assert.equal(await evaluate('window.PresentationContent.current.model.items.length'),5);
    await click('.edit-toggle');await click('.strategy-row:first-child [data-content-action="links"]');
    assert.equal(await evaluate('document.querySelectorAll(".strategy-links-choices input").length'),5);
    assert.equal(await evaluate('Boolean(document.querySelector(".strategy-links-choices input[value=edge]"))'),false);
    await click('.strategy-links-actions button[type="button"]');await click('.edit-toggle');
    await view('overview');const strategyPreviewShot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'strategy-preview.png'),Buffer.from(strategyPreviewShot.data,'base64'));
    pass('strategy titles, related articles, primary navigation, ordering and undo persist through JSON; scene isolation and comparison views remain intact');
    fs.writeFileSync(previewConfigPath,previewConfigText);
    await navigate(base+'/presentation-demo/#cover');
    const contextViewId=Core.imageView('context','g101-before').id,conditionViewId=Core.imageView('g101-conditions','g101-before').id;
    const readInitialView=()=>evaluate('window.generalRoadViewport.get(document.querySelector(".context-map,.conditions-current-diagram")).read()');
    const nearView=(actual,expected)=>{assert.equal(actual.length,4);actual.forEach((value,index)=>assert(Math.abs(value-expected[index])<.00001,'Initial view differs on component '+index));};
    async function initialField(name,value){await evaluate(`(()=>{const input=document.querySelector('.iv-panel:not([hidden]) [data-iv-field="${name}"]');input.value=${JSON.stringify(String(value))};input.dispatchEvent(new Event('change',{bubbles:true,cancelable:true}))})()`);}
    await view('context');
    assert.equal(await evaluate('document.querySelector(".context-map-card .map-toolbar strong").textContent'),'現況圖');
    const contextHome=await readInitialView();await click('.iv-trigger');
    assert(await evaluate('window.VisualInitialViews.isOpen'));
    await initialField('zoom',150);await initialField('x',12);await initialField('y',-8);
    nearView(await readInitialView(),Core.viewBoxFor(contextHome,{zoom:1.5,x:12,y:-8}));
    await click('.iv-panel:not([hidden]) [data-iv-action="close"]');
    await view('g101-conditions');const conditionHome=await readInitialView();await click('.iv-trigger');
    await initialField('zoom',125);await initialField('x',-5);await initialField('y',4);
    nearView(await readInitialView(),Core.viewBoxFor(conditionHome,{zoom:1.25,x:-5,y:4}));
    await view('context');nearView(await readInitialView(),Core.viewBoxFor(contextHome,{zoom:1.5,x:12,y:-8}));await click('.iv-trigger');
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:2});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers:2});
    assert.equal(await evaluate('window.visualLayoutEditor.store.config.imageViews['+JSON.stringify(conditionViewId)+'].y'),0);
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Z',code:'KeyZ',modifiers:10});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Z',code:'KeyZ',modifiers:10});
    assert.equal(await evaluate('window.visualLayoutEditor.store.config.imageViews['+JSON.stringify(conditionViewId)+'].y'),4);
    pass('context and issue diagrams have independent initial zoom/position, page restoration, undo and redo');
    const initialBeforePan=await evaluate('JSON.stringify(window.visualLayoutEditor.store.config.imageViews['+JSON.stringify(contextViewId)+'])');
    const initialPoint=await evaluate('(()=>{const r=document.querySelector(".context-map").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await mouse('mouseWheel',initialPoint.x,initialPoint.y,{deltaY:-80,deltaX:0});await delay(60);await dragFrom(initialPoint.x,initialPoint.y,24,-12);
    const capturedView=await readInitialView();
    assert.equal(await evaluate('JSON.stringify(window.visualLayoutEditor.store.config.imageViews['+JSON.stringify(contextViewId)+'])'),initialBeforePan,'Preview pan should not automatically overwrite the initial view');
    await click('.iv-panel:not([hidden]) [data-iv-action="capture"]');nearView(await readInitialView(),capturedView);
    await mouse('mouseWheel',initialPoint.x,initialPoint.y,{deltaY:-100,deltaX:0});await delay(50);await click('.context-map-canvas .viewport-tools button');nearView(await readInitialView(),capturedView);
    const initialShot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'initial-image-view.png'),Buffer.from(initialShot.data,'base64'));
    assert.equal(await evaluate('window.visualLayoutEditor.files.handle'),null);
    fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));
    await navigate(base+'/presentation-demo/#context');nearView(await readInitialView(),capturedView);
    await view('g101-conditions');nearView(await readInitialView(),Core.viewBoxFor(conditionHome,{zoom:1.25,x:-5,y:4}));
    pass('saved source JSON restores both initial views after refresh without a remembered file handle or rebuilding _site');
    fs.writeFileSync(previewConfigPath,previewConfigText);await navigate(base+'/presentation-demo/#cover');
    const scenes = await evaluate('window.generalRoadPresentation.data.scenarios.map(s=>({id:s.id,conditions:s.currentConditions.pageId,overview:s.overviewId,photos:s.currentConditions.photos.length}))');
    for (const scene of scenes) {
      await view(scene.conditions);
      assert.equal(await evaluate('document.getElementById("slide-title").textContent'), '現況問題');
      assert.equal(await evaluate('Boolean(document.querySelector(".compare-stage,.conditions-issues-heading"))'), false);
      assert.equal(await evaluate('document.querySelectorAll(".condition-photo").length'), scene.photos);
      assert.equal(await evaluate('document.querySelector("main").textContent.includes("ON SITE")'), false);
      const issueLayout=await evaluate('(()=>{const diagram=document.querySelector(".conditions-current-figure").getBoundingClientRect(),photos=document.querySelector(".conditions-issues").getBoundingClientRect();return {diagramLeft:diagram.left,diagramRight:diagram.right,photosLeft:photos.left,diagramWidth:diagram.width,photosWidth:photos.width}})()');
      assert(issueLayout.diagramLeft<issueLayout.photosLeft && issueLayout.diagramRight<=issueLayout.photosLeft+1 && issueLayout.diagramWidth>issueLayout.photosWidth,'Current diagram and photo sidebar must retain the original two-column arrangement');
      assert(issueLayout.diagramWidth/(issueLayout.diagramWidth+issueLayout.photosWidth)<.57,'Current diagram column should be narrower than the previous 60% layout');
      const photoRows=await evaluate('[...document.querySelectorAll(".condition-issue")].map(e=>{const photo=e.querySelector(".condition-photo").getBoundingClientRect(),points=e.querySelector(".condition-points").getBoundingClientRect();return {photoRight:photo.right,pointsLeft:points.left,photoTop:photo.top,pointsTop:points.top}})');
      for(const row of photoRows)assert(row.photoRight<=row.pointsLeft+1 && Math.abs(row.photoTop-row.pointsTop)<1,'Each photo and its bullet points must be side by side');
      const cover=await evaluate('(()=>{const svg=document.querySelector(".conditions-current-diagram"),image=svg.querySelector("image").getBoundingClientRect(),frame=svg.parentElement.getBoundingClientRect(),view=svg.getBoundingClientRect();return {mode:svg.getAttribute("preserveAspectRatio"),image:{left:image.left,right:image.right,top:image.top,bottom:image.bottom},frame:{left:frame.left,right:frame.right,top:frame.top,bottom:frame.bottom},view:{left:view.left,right:view.right,top:view.top,bottom:view.bottom}}})()');
      assert.equal(cover.mode,'xMidYMid slice');
      for(const edge of ['left','right','top','bottom'])assert(Math.abs(cover.frame[edge]-cover.view[edge])<1,'Current image viewport must fill the frame without padding');
      assert(cover.image.left<=cover.frame.left+1 && cover.image.right>=cover.frame.right-1 && cover.image.top<=cover.frame.top+1 && cover.image.bottom>=cover.frame.bottom-1,'Current image must cover all four frame edges without letterboxing');
      const currentView=await evaluate('document.querySelector(".conditions-current-diagram").getAttribute("viewBox")');
      const currentPoint=await evaluate('(()=>{const r=document.querySelector(".conditions-current-diagram").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
      await mouse('mouseWheel',currentPoint.x,currentPoint.y,{deltaY:-120,deltaX:0});await delay(80);
      assert.notEqual(await evaluate('document.querySelector(".conditions-current-diagram").getAttribute("viewBox")'),currentView);
      await click('.conditions-current-canvas .viewport-tools button');
      assert.equal(await evaluate('document.querySelector(".conditions-current-diagram").getAttribute("viewBox")'),currentView);
      if (scene.id === 'g1-01') {
        for (const index of [4,5,8,9]) assert.equal(await evaluate(`document.querySelector('[data-edit-key="g101-conditions|0|text-${index}"]').textContent`), initialConfig.legacyState.texts['g101-conditions|0|text-'+index]);
        const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'current-problems.png'),Buffer.from(shot.data,'base64'));
      }
      await view(scene.overview);
      assert.equal(await evaluate('document.getElementById("slide-title").textContent'), '整體佈設策略');
      assert.equal(await evaluate('document.querySelector(".compare-stage").dataset.comparisonKey'), scene.conditions);
      assert.equal(await evaluate('document.querySelector(".compare-range").value'), '0');
      assert(await evaluate('Boolean(document.querySelector("#explanation .overview-list"))'));
      assert.equal(await evaluate('document.querySelectorAll(".condition-photo").length'), 0);
      await click('[data-compare-position="50"]');
      const handle=await evaluate('(()=>{const r=document.querySelector(".compare-handle").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
      await dragFrom(handle.x,handle.y,-80,0);
      assert(await evaluate('Number(document.querySelector(".compare-range").value)<49'));
      await click('[data-compare-position="0"]');assert.equal(await evaluate('document.querySelector(".compare-range").value'),'0');
      await click('[data-compare-position="100"]');assert.equal(await evaluate('document.querySelector(".compare-range").value'),'100');
      await click('[data-compare-position="50"]');
      const stage=await evaluate('(()=>{const r=document.querySelector(".compare-stage").getBoundingClientRect();return {x:r.x+r.width*.7,y:r.y+r.height*.5}})()');
      const beforeWheel=await evaluate('document.querySelector("svg.compare-after").getAttribute("viewBox")');
      await mouse('mouseWheel',stage.x,stage.y,{deltaY:-100,deltaX:0});await delay(80);
      assert.notEqual(await evaluate('document.querySelector("svg.compare-after").getAttribute("viewBox")'),beforeWheel);
      assert.equal(await evaluate('document.querySelector("svg.compare-before").getAttribute("viewBox")'),await evaluate('document.querySelector("svg.compare-after").getAttribute("viewBox")'));
      if(scene.id==='g1-01'){const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'strategy-overview.png'),Buffer.from(shot.data,'base64'));}
    }
    pass('all four issue pages use a narrower, fully covered diagram and side-by-side photos/bullets; strategy dragging and zoom remain intact');
    await view('overview');await click('.edit-toggle');
    const originalX=await evaluate('window.generalRoadEditor.getComparisonTransform("g101-conditions","before").x');
    await evaluate(`(()=>{const p=document.querySelector('.compare-transform-editor');p.open=true;const input=p.querySelector('[data-compare-transform="x"]');input.value=${originalX+1};input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    assert.equal(await evaluate('window.generalRoadEditor.state.comparisonTransforms["g101-conditions"].before.x'),originalX+1);
    await click('.edit-toggle');assert.equal(await evaluate('window.generalRoadEditor.getComparisonTransform("g101-conditions","before").x'),originalX+1);
    pass('manual image alignment on the strategy page retains the existing JSON alignment key');
    await click('.edit-toggle');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    await view('overview');
    const mobileLayout=await evaluate('(()=>{const stage=document.querySelector(".compare-stage").getBoundingClientRect(),card=document.querySelector(".conditions-comparison").getBoundingClientRect(),explanation=document.getElementById("explanation").getBoundingClientRect();return {left:stage.left,right:stage.right,width:stage.width,height:stage.height,cardBottom:card.bottom,explanationTop:explanation.top}})()');
    assert(mobileLayout.left>=0 && mobileLayout.right<=391 && mobileLayout.width>200 && mobileLayout.height>200);
    assert(mobileLayout.explanationTop>=mobileLayout.cardBottom-1,'Mobile strategy text overlaps the comparison');
    await view('g104-conditions');
    const mobileProblem=await evaluate('(()=>{const photo=document.querySelector(".condition-photo").getBoundingClientRect(),points=document.querySelector(".condition-points").getBoundingClientRect(),diagram=document.querySelector(".conditions-current-figure").getBoundingClientRect(),sidebar=document.querySelector(".conditions-issues").getBoundingClientRect();return {left:photo.left,right:photo.right,photoTop:photo.top,pointsLeft:points.left,pointsRight:points.right,pointsTop:points.top,diagramBottom:diagram.bottom,sidebarTop:sidebar.top}})()');
    assert(mobileProblem.left>=0 && mobileProblem.pointsRight<=391 && mobileProblem.pointsLeft>=mobileProblem.right-1 && Math.abs(mobileProblem.pointsTop-mobileProblem.photoTop)<1);
    assert(mobileProblem.sidebarTop>=mobileProblem.diagramBottom-1);
    pass('relocated comparison and current-issue content stack without overlap at a 390px viewport');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await navigate(base+'/presentation-demo/#cover');
    await view('cover');await click('.edit-toggle');await click('[data-vl-action="mode"]');
    const titleId = await evaluate('document.getElementById("slide-title").dataset.layoutId');
    const titleBox = await evaluate('(() => {const r=document.getElementById("slide-title").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()');
    const history = await evaluate('window.visualLayoutEditor.store.past.length');
    await dragFrom(titleBox.x + 70, titleBox.y + 35, 40, 25);
    let selected = await evaluate('window.visualLayoutEditor.store.config.elements[' + JSON.stringify(titleId) + ']');
    assert.equal(selected.x, 40);assert.equal(selected.y, 25);
    assert.equal(await evaluate('window.visualLayoutEditor.store.past.length'), history + 1);
    await cdp.send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2});
    await cdp.send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2});
    assert.equal(await evaluate('window.visualLayoutEditor.store.config.elements[' + JSON.stringify(titleId) + '].x'), 0);
    await cdp.send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Z', code: 'KeyZ', modifiers: 10});
    await cdp.send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Z', code: 'KeyZ', modifiers: 10});
    assert.equal(await evaluate('window.visualLayoutEditor.store.config.elements[' + JSON.stringify(titleId) + '].x'), 40);
    pass('real mouse dragging creates one history step; keyboard undo and redo restore the exact layout');
    async function field(name, value) {
      if(['fontFamily','fontSize','fontWeight','lineHeight'].includes(name)){
        const advanced=await evaluate('window.visualLayoutEditor.editing');if(advanced)await click('[data-vl-action="mode"]');
        await evaluate('window.generalRoadFormatting.setActive(true);window.generalRoadFormatting.select(document.getElementById("slide-title").dataset.editKey)');
        await evaluate(`(()=>{const e=document.querySelector('[data-format-property="${name}"]');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
        if(name==='fontSize')assert.equal(await evaluate('getComputedStyle(document.getElementById("slide-title")).fontSize'),String(value)+'px','Text styling must apply immediately without switching modes');
        await evaluate('window.generalRoadFormatting.setActive(false)');if(advanced)await click('[data-vl-action="mode"]');
      } else await evaluate(`(()=>{const e=document.querySelector('[data-vl-field="${name}"]');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    }
    await evaluate('window.visualLayoutEditor.transact(next=>{next.elements['+JSON.stringify(titleId)+'].fontSize=89})');
    await field('fontFamily', 'serif');await field('fontSize', 54);
    assert.equal(await evaluate('window.visualLayoutEditor.store.config.elements['+JSON.stringify(titleId)+'].fontSize'),null,'The common text tool must clear competing visual font overrides');
    assert.equal(await evaluate('getComputedStyle(document.getElementById("slide-title")).fontSize'), '54px');
    assert.match(await evaluate('getComputedStyle(document.getElementById("slide-title")).fontFamily'), /Noto Serif/);
    await view('context');await view('cover');
    assert.equal(await evaluate('document.getElementById("slide-title").dataset.layoutId'), titleId);
    assert.equal(await evaluate('getComputedStyle(document.getElementById("slide-title")).fontSize'), '54px');
    pass('font family and font size persist when the DOM is rebuilt on page changes');
    const imageId = await evaluate('document.querySelector(".cover-map").dataset.layoutId');
    await evaluate('window.visualLayoutEditor.select(' + JSON.stringify(imageId) + ')');await click('[data-vl-action="panel"]');
    const image = await evaluate('(() => {const e=document.querySelector(".cover-map"),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,view:e.getAttribute("viewBox"),transform:e.getAttribute("transform")}})()');
    await dragFrom(image.x + image.width, image.y + image.height, 45, 30);
    const resized = await evaluate('window.visualLayoutEditor.store.config.elements[' + JSON.stringify(imageId) + ']');
    assert(resized.width > image.width);assert(Math.abs(resized.width / resized.height - image.width / image.height) < .002);
    assert.equal(await evaluate('document.querySelector(".cover-map").getAttribute("viewBox")'), image.view);
    assert.equal(await evaluate('document.querySelector(".cover-map").getAttribute("transform")'), image.transform);
    pass('corner resizing preserves image ratio and leaves SVG viewBox and transforms intact');
    // Cancel mid-gesture must not create history or keep transient styling.
    const beforeCancel = await evaluate('window.visualLayoutEditor.store.serialize()');
    const handle = await evaluate('(()=>{const r=document.querySelector("[data-vl-handle=move]").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await mouse('mousePressed', handle.x, handle.y, {button: 'left', buttons: 1, clickCount: 1});await mouse('mouseMoved', handle.x + 20, handle.y + 15, {button: 'left', buttons: 1});
    await cdp.send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Escape', code: 'Escape'});await mouse('mouseReleased', handle.x + 20, handle.y + 15, {button: 'left', buttons: 0});
    assert.equal(await evaluate('window.visualLayoutEditor.store.serialize()'), beforeCancel);
    pass('Escape cancels a live drag without altering state or history');
    // Simulate authorized native handles, retaining real browser click/async flows.
    await evaluate(`(async()=>{const config=await (await fetch('layout/presentation-layout.json')).text();window.__disk={text:config,pickers:0,writes:0,allow:true};const handle={name:'presentation-layout.json',queryPermission:async()=>__disk.allow?'granted':'prompt',requestPermission:async()=>__disk.allow?'granted':'denied',getFile:async()=>new File([__disk.text],'presentation-layout.json',{type:'application/json'}),createWritable:async()=>({write:async text=>{__disk.text=text;__disk.writes++},close:async()=>{},abort:async()=>{}})};window.visualLayoutEditor.files.candidate={queryPermission:async()=>'prompt',requestPermission:async()=>'denied'};window.visualLayoutEditor.files.env={isSecureContext:true,showOpenFilePicker:async()=>{__disk.pickers++;return [handle]},showSaveFilePicker:async()=>{__disk.pickers++;return handle}}})()`);
    await click('[data-vl-action="open"]');await wait('!window.visualLayoutEditor.busy');
    await evaluate('window.visualLayoutEditor.select(' + JSON.stringify(titleId) + ')');await field('x', 31);await field('fontSize', 55);
    await click('[data-vl-action="save"]');await wait('!window.visualLayoutEditor.busy');await click('[data-vl-action="save"]');await wait('!window.visualLayoutEditor.busy');
    assert.equal(await evaluate('__disk.pickers'), 1);assert.equal(await evaluate('__disk.writes'), 2);assert.equal(await evaluate('window.visualLayoutEditor.store.dirty'), false);
    const savedText = await evaluate('__disk.text');
    await evaluate('__disk.text += "\\n"');await field('x', 44);await click('[data-vl-action="save"]');await wait('!window.visualLayoutEditor.busy');
    assert.equal(await evaluate('__disk.writes'), 2);assert.equal(await evaluate('window.visualLayoutEditor.store.dirty'), true);
    assert.match(await evaluate('document.querySelector(".vl-status").textContent'), /其他程式/);
    await click('[data-vl-action="reload"]');await wait('!window.visualLayoutEditor.busy');
    assert.equal(await evaluate('window.visualLayoutEditor.store.config.elements[' + JSON.stringify(titleId) + '].x'), 31);
    await evaluate('__disk.allow=false');await field('x', 48);await click('[data-vl-action="save"]');await wait('!window.visualLayoutEditor.busy');
    assert.equal(await evaluate('__disk.writes'), 2);assert.equal(await evaluate('window.visualLayoutEditor.store.config.elements[' + JSON.stringify(titleId) + '].x'), 48);
    pass('same-handle save, external-change conflicts, reload and permission denial preserve edits (mocked native handles)');
    override = savedText;await navigate(base + '/presentation-demo/#cover');
    assert.equal(await evaluate('window.visualLayoutEditor.store.config.elements[' + JSON.stringify(titleId) + '].x'), 31);
    assert.equal(await evaluate('getComputedStyle(document.getElementById("slide-title")).fontSize'), '55px');
    pass('external JSON restores the edited layout on a fresh page load');
    // A real origin-private handle exercises Chromium's createWritable and IndexedDB
    // without automating the user's OS authorization dialog or touching project files.
    await click('.edit-toggle');await click('[data-vl-action="mode"]');
    await evaluate(`(async()=>{const directory=await navigator.storage.getDirectory();const handle=await directory.getFileHandle('layout-api-test.json',{create:true});const writable=await handle.createWritable();await writable.write(JSON.stringify(window.visualLayoutEditor.store.snapshot()));await writable.close();window.__nativeHandle=handle;window.visualLayoutEditor.files.env={isSecureContext:true,indexedDB:window.indexedDB,showOpenFilePicker:async()=>[handle],showSaveFilePicker:async()=>handle}})()`);
    await click('[data-vl-action="open"]');await wait('!window.visualLayoutEditor.busy');
    await evaluate('window.visualLayoutEditor.select(' + JSON.stringify(titleId) + ')');await field('x',37);await click('[data-vl-action="save"]');await wait('!window.visualLayoutEditor.busy');
    assert.equal(await evaluate('(async()=>JSON.parse(await (await __nativeHandle.getFile()).text()).elements['+JSON.stringify(titleId)+'].x)()'),37);
    await navigate(base+'/presentation-demo/#cover');
    assert.equal(await evaluate('window.visualLayoutEditor.files.handle.name'),'layout-api-test.json');
    assert.equal(await evaluate('window.visualLayoutEditor.store.config.elements['+JSON.stringify(titleId)+'].x'),37);
    await view('context');await click('.iv-trigger');await initialField('zoom',145);await initialField('x',11);await initialField('y',-6);
    await click('.iv-panel:not([hidden]) [data-iv-action="save"]');await wait('!window.visualLayoutEditor.busy');
    assert.equal(await evaluate('(async()=>JSON.parse(await (await window.visualLayoutEditor.files.handle.getFile()).text()).imageViews['+JSON.stringify(contextViewId)+'].zoom)()'),1.45);
    await view('g101-conditions');await click('.iv-trigger');await initialField('x',-3);await initialField('y',7);
    await evaluate('(()=>{const input=document.querySelector(".iv-panel:not([hidden]) [data-iv-field=zoom]");input.focus();input.value="174"})()');
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'s',code:'KeyS',modifiers:2});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'s',code:'KeyS',modifiers:2});await wait('!window.visualLayoutEditor.busy');
    assert.equal(await evaluate('(async()=>JSON.parse(await (await window.visualLayoutEditor.files.handle.getFile()).text()).imageViews['+JSON.stringify(conditionViewId)+'].zoom)()'),1.74);
    await navigate(base+'/presentation-demo/#context');nearView(await readInitialView(),Core.viewBoxFor(contextHome,{zoom:1.45,x:11,y:-6}));
    await view('g101-conditions');nearView(await readInitialView(),Core.viewBoxFor(conditionHome,{zoom:1.74,x:-3,y:7}));
    pass('initial view save button and Ctrl+S write real file handles and restore independent views after reload');
    await view('cover');
    await click('.edit-toggle');
    const legacyKey = await evaluate(`(()=>{const e=document.querySelector('.cover-intro');e.textContent='內容編輯器 JSON 往返測試';e.dispatchEvent(new Event('input',{bubbles:true}));return e.dataset.editKey})()`);
    await click('[data-vl-action="save"]');await wait('!window.visualLayoutEditor.busy');
    assert.equal(await evaluate(`(async()=>JSON.parse(await (await window.visualLayoutEditor.files.handle.getFile()).text()).legacyState.texts[${JSON.stringify(legacyKey)}])()`),'內容編輯器 JSON 往返測試');
    await navigate(base+'/presentation-demo/#cover');assert.equal(await evaluate('document.querySelector(".cover-intro").textContent'),'內容編輯器 JSON 往返測試');
    pass('the existing content editor saves through the same JSON file and restores its text after reload');
    await evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('road-visual-layout-files');r.onsuccess=resolve;r.onerror=()=>reject(r.error)})`);
    pass('real FileSystemFileHandle writes and IndexedDB handle restoration work across a fresh page load (origin-private test file)');
    await navigate(base+'/presentation-demo/#cover');
    await click('.edit-toggle');await click('[data-vl-action="mode"]');await evaluate('window.visualLayoutEditor.files.env={isSecureContext:true};window.visualLayoutEditor.setMode(true)');
    await click('[data-vl-action="export"]');
    for(let i=0;i<100&&!fs.readdirSync(downloads).some(name=>name.endsWith('.json'));i++)await delay(30);
    const exported = fs.readdirSync(downloads).find(name=>name.endsWith('.json'));assert(exported, 'Fallback JSON export did not download');Core.parse(fs.readFileSync(path.join(downloads, exported), 'utf8'));
    const validImport = path.join(artifacts, 'import-layout.json'), invalidImport = path.join(artifacts, 'invalid-layout.json');
    fs.writeFileSync(validImport, JSON.stringify(initialConfig));fs.writeFileSync(invalidImport, '{broken');
    async function importFile(filename) {const {root: documentNode}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:documentNode.nodeId,selector:'[data-vl-import]'});await cdp.send('DOM.setFileInputFiles',{nodeId,files:[filename]});await delay(100);await wait('!window.visualLayoutEditor.busy');}
    await importFile(invalidImport);assert.equal(await evaluate('window.visualLayoutEditor.store.config.elements[' + JSON.stringify(titleId) + '].x'),31);
    await importFile(validImport);assert.equal(await evaluate('getComputedStyle(document.getElementById("slide-title")).fontSize'), baseline.cover?.find(item=>item.tag==='h1')?.fontSize || '80.64px');
    pass('fallback export downloads valid JSON; valid import restores layout and invalid import leaves it intact');
    await click('.edit-toggle');await view('rural-merge-island',1);
    const facilityTopicShot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'facility-article-topic.png'),Buffer.from(facilityTopicShot.data,'base64'));
    await view('speed',1);
    const signTopicShot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'sign-article-topic.png'),Buffer.from(signTopicShot.data,'base64'));
    await view('edge',1);
    const markingTopicShot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'marking-article-topic.png'),Buffer.from(markingTopicShot.data,'base64'));
    assert(await evaluate('Boolean(document.querySelector(".selection-box,.map-shade,.selection-corners"))'), 'Highlight layer missing');
    const beforeZoom = await evaluate('document.getElementById("main-map").getAttribute("viewBox")');
    const mapBox = await evaluate('(()=>{const r=document.getElementById("main-map").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await mouse('mouseWheel',mapBox.x,mapBox.y,{deltaY:-140,deltaX:0});await delay(80);
    assert.notEqual(await evaluate('document.getElementById("main-map").getAttribute("viewBox")'),beforeZoom);
    await click('#original-map');assert(await evaluate('document.getElementById("asset-dialog").open'));
    const rotateBefore = await evaluate('document.querySelector("#asset-view g").getAttribute("transform")');await click('#asset-rotate');assert.notEqual(await evaluate('document.querySelector("#asset-view g").getAttribute("transform")'),rotateBefore);
    await evaluate('document.getElementById("asset-dialog").close()');const previousPage=await evaluate('window.generalRoadPresentation.state.page');await click('#next');assert.notEqual(await evaluate('window.generalRoadPresentation.state.page'),previousPage);
    await view('overview');assert(await evaluate('Boolean(document.querySelector(".compare-stage"))'));
    pass('preview retains highlight layers, wheel zoom, original-image dialog, rotation, page switching and comparison pages');
    // Responsive layout changes are not caused by editor chrome.
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:768,height:1024,deviceScaleFactor:1,mobile:false});await view('cover');
    assert(await evaluate('document.querySelector("main").clientWidth <= innerWidth'));
    const screenshot = await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'preview-tablet.png'),Buffer.from(screenshot.data,'base64'));
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await click('.edit-toggle');await click('[data-vl-action="mode"]');await evaluate('window.visualLayoutEditor.select(document.getElementById("slide-title").dataset.layoutId)');
    const editorShot = await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'editor-desktop.png'),Buffer.from(editorShot.data,'base64'));
    pass('desktop editor and tablet preview render with floating controls and unchanged slide dimensions');
    override=null;await evaluate('window.visualLayoutEditor.files.disconnect()');
    await structureCheck();await pickerCheck();await directoryCheck();await moduleCheck();await libraryCheck();await fullscreenCheck();await startupCheck();
    // Failed automatic JSON loading must expose recovery instead of silently resetting the layout.
    failConfig = true;override = null;await cdp.send('Page.navigate',{url:base+'/presentation-demo/?missing-config=1#cover'});
    await wait('Boolean(document.querySelector(".vl-recovery:not([hidden])"))');assert.equal(await evaluate('Boolean(window.generalRoadPresentation)'),false);
    assert.equal(await evaluate('document.documentElement.dataset.presentationState'),'recovery');
    assert(await evaluate('document.getElementById("presentation-startup-import").checkVisibility()'));
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".header")).visibility'),'hidden');
    await importFile(validImport);await wait('Boolean(window.generalRoadPresentation && document.querySelector("main>.slide"))');
    assert.equal(await evaluate('document.documentElement.dataset.presentationState'),'ready');
    failConfig = false;
    pass('missing/blocked JSON shows recovery and importing the project JSON starts the presentation');
    if (process.argv.includes('--catalog')) {
      await navigate(base+'/presentation-demo/?catalog=1#cover');
      const seen = await evaluate(`(async()=>{const seen=new Set();window.generalRoadEditor.setEditing(true);const api=window.generalRoadPresentation;for(let i=0;i<api.stops.length;i++){api.navigate(i,{force:true});for(const id of window.visualLayoutEditor.items.keys())seen.add(id);await new Promise(r=>requestAnimationFrame(r));}window.generalRoadEditor.setEditing(false);return [...seen]})()`);
      const registered = await evaluate('window.visualLayoutEditor.store.config.elements');
      const elements = Object.fromEntries(Object.entries(registered).filter(([id,item])=>seen.includes(id)||Core.overrides(item)));
      assert(Object.keys(elements).length>100,'Incomplete element catalogue');
      assert(Object.values(elements).every(item=>!Core.overrides(item)),'Catalogue must not contain test edits');
      const next=Core.parse(initialConfigText);next.elements=Object.fromEntries(Object.entries(elements).sort(([a],[b])=>a.localeCompare(b)));Core.validate(next);
      assert.equal(fs.readFileSync(configPath,'utf8'),initialConfigText,'Configuration changed during the test; refusing to overwrite user edits');
      fs.writeFileSync(configPath,JSON.stringify(next,null,2)+'\n');pass('catalogued '+Object.keys(elements).length+' stable element IDs with no layout overrides');
    }
    assert.deepEqual(exceptions, [], 'Uncaught browser exceptions');
    fs.writeFileSync(path.join(artifacts,'browser-results.json'),JSON.stringify({browser:executable,checks,uncaughtExceptions:exceptions,baselineCompared:fs.existsSync(baselinePath),nativeFilePicker:'Actual createWritable/IndexedDB tested with an origin-private native handle; permission/conflict flows use mocks. OS picker and project-file permission UI require manual user authorization.'},null,2)+'\n');
    console.log('PASS: '+checks.length+' browser regression groups; no uncaught JavaScript exceptions.');
  } catch (error) {
    if(cdp){try{const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'failure.png'),Buffer.from(shot.data,'base64'));const info=await cdp.evaluate('({status:document.querySelector(".vl-status")?.textContent,editing:window.visualLayoutEditor?.editing,page:window.generalRoadPresentation?.state,selected:document.querySelector("[data-vl-selected]")?.textContent})');console.error(JSON.stringify({info,exceptions}));}catch{}}
    throw error;
  } finally {
    setStartupHold(null);
    if(cdp){try{await cdp.send('Browser.close');}catch{}cdp.close();}
    if(browser.exitCode===null){await Promise.race([browserExit,delay(2000)]);if(browser.exitCode===null)browser.kill();}
    await new Promise(resolve=>server.close(resolve));
    // Only remove this run's generated browser profile, after verifying its absolute location.
    const resolved=path.resolve(profile);assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep+'traffic-guide-browser-'));
    try{fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch{}
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
