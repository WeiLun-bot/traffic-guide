'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,wait,cdp,base,artifacts,pass,previewConfigPath}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),config=JSON.parse(baseline);config.removedModuleExtensions=[];fs.writeFileSync(previewConfigPath,JSON.stringify(config));
  const extension='m102-route-extensions',diagram='m102-route-diagram',button=id=>'[data-module-toggle-extensions="'+id+'"]';
  const exists=id=>evaluate('window.generalRoadPresentation.pages.some(page=>page.id==='+JSON.stringify(id)+')');
  const current=()=>evaluate('window.generalRoadPresentation.page.id');
  const numbers=()=>evaluate('document.querySelector(".module-heading .eyebrow").textContent');
  const shot=async name=>{await evaluate('(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))})()');const result=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));};
  await navigate(base+'/presentation-demo/#'+extension);assert(await exists(extension));assert.equal(await evaluate('document.querySelectorAll("[data-module-toggle-extensions]").length'),0);
  const total=await evaluate('window.generalRoadPresentation.pages.length'),notes=await evaluate('[...document.querySelectorAll(".module-extension-copy h3,.module-extension-copy p")].map(node=>node.textContent)'),images=await evaluate('[...document.querySelectorAll(".module-extension-thumbnail")].map(node=>node.getAttribute("src"))');
  await click('.edit-toggle');assert.equal(await evaluate('document.querySelector('+JSON.stringify(button(extension))+').textContent'),'刪除整頁延伸應用');await shot('extension-page-remove-button');await click(button(extension));
  assert.equal(await current(),diagram);assert(!await exists(extension));assert.equal(await evaluate('window.generalRoadPresentation.pages.length'),total-1);assert.match(await numbers(),/2\s*\/\s*2/);
  assert.equal(await evaluate('document.querySelectorAll(\'#toc-content [data-page="'+extension+'"]\').length'),0);assert.equal(await evaluate('document.querySelector('+JSON.stringify(button(extension))+').textContent'),'恢復延伸應用頁');
  await click('[data-vl-action="undo"]');assert(await exists(extension));assert.equal(await current(),diagram);assert.match(await numbers(),/2\s*\/\s*3/);await click('[data-vl-action="redo"]');assert(!await exists(extension));assert.match(await numbers(),/2\s*\/\s*2/);
  fs.writeFileSync(previewConfigPath,await evaluate('window.visualLayoutEditor.store.serialize()'));await navigate(base+'/presentation-demo/#'+extension);assert.equal(await current(),diagram);assert(!await exists(extension));
  const alias=await evaluate('window.PresentationModules.content.submoduleFlows[0].stages[2].topics.at(-1).sourcePageId');await navigate(base+'/presentation-demo/#'+alias);assert.equal(await current(),diagram);
  await click('#next');assert.equal(await current(),'m103-parking-issues');await click('#previous');assert.equal(await current(),diagram);
  pass('deleting an extension removes the whole page from contents, page totals and previous/next navigation; undo/redo and fresh reload retain the intended two-stage flow, and old links resolve to its diagram');

  await click('.edit-toggle');await click(button(extension));assert.equal(await current(),extension);assert(await exists(extension));assert.equal(await evaluate('window.generalRoadPresentation.pages.length'),total);assert.match(await numbers(),/3\s*\/\s*3/);
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".module-extension-copy h3,.module-extension-copy p")].map(node=>node.textContent)'),notes);assert.deepEqual(await evaluate('[...document.querySelectorAll(".module-extension-thumbnail")].map(node=>node.getAttribute("src"))'),images);
  await click('[data-vl-action="undo"]');assert.equal(await current(),diagram);assert(!await exists(extension));await click('[data-vl-action="redo"]');assert(await exists(extension));await view(extension);await click(button(extension));
  await view('m102-route-issues');assert.match(await numbers(),/1\s*\/\s*2/);assert.equal(await evaluate('document.querySelector('+JSON.stringify(button(extension))+').textContent'),'恢復延伸應用頁');
  await view('m101-lanes-extensions');await click(button('m101-lanes-extensions'));assert.equal(await current(),'m101-lanes-diagram');assert(!await exists('m101-lanes-extensions'));assert(await exists('m101-additional-extensions'));await view('m101-additional-issues');assert.match(await numbers(),/1\s*\/\s*3/);assert.equal(await evaluate('document.querySelectorAll("[data-module-toggle-extensions]").length'),0);
  await click('.edit-toggle');await view('m101-lanes-diagram');await click('#next');assert.equal(await current(),'m101-additional-issues');await click('#previous');assert.equal(await current(),'m101-lanes-diagram');await shot('extension-page-removed-diagram');
  pass('restoring recovers the original cards, text and images; each child controls its own extension, with recovery available on both remaining stages and correct behavior when undo removes the active page');

  await evaluate('(async()=>{const directory=await navigator.storage.getDirectory(),handle=await directory.getFileHandle("module-extension-removal.json",{create:true}),writable=await handle.createWritable();await writable.write(window.visualLayoutEditor.store.serialize());await writable.close();window.visualLayoutEditor.files.env={isSecureContext:true,indexedDB:window.indexedDB,showOpenFilePicker:async()=>[handle],showSaveFilePicker:async()=>handle}})()');
  await click('.edit-toggle');await click('[data-vl-action="open"]');await wait('!window.visualLayoutEditor.busy');await click(button('m101-lanes-extensions'));assert.equal(await current(),'m101-lanes-extensions');await click('[data-vl-action="save"]');await wait('!window.visualLayoutEditor.busy');
  assert(!await evaluate('(async()=>JSON.parse(await (await window.visualLayoutEditor.files.handle.getFile()).text()).removedModuleExtensions.includes("m101-lanes-extensions"))()'));
  await click(button('m101-lanes-extensions'));await click('[data-vl-action="save"]');await wait('!window.visualLayoutEditor.busy');
  await navigate(base+'/presentation-demo/#m101-lanes-extensions');assert.equal(await current(),'m101-lanes-diagram');assert(!await exists('m101-lanes-extensions'));assert(!await exists(extension));
  await click('.edit-toggle');assert.equal(await evaluate('document.querySelector('+JSON.stringify(button('m101-lanes-extensions'))+').textContent'),'恢復延伸應用頁');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));assert(await evaluate('(()=>{const r=document.querySelector('+JSON.stringify(button('m101-lanes-extensions'))+').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()'));
  pass('native Chromium file saving and remembered handles preserve deleted extensions after reload; restore controls remain usable at 390px without modifying project files');
  fs.writeFileSync(previewConfigPath,baseline);
};
