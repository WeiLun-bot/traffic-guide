'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function integrate(html) {
  if (html.includes('src="assets/visual-editor.js"')) return html;
  function replace(before, after) { assert(html.includes(before), 'Missing integration point: ' + before.slice(0, 90)); html = html.replace(before, () => after); }
  replace('</head>', '<link rel="stylesheet" href="assets/visual-editor.css">\n</head>');
  const saved = /<script id="editor-saved-data" type="application\/json">([\s\S]*?)<\/script>/;
  assert(saved.test(html), 'Missing editor-saved-data');
  html = html.replace(saved, '<script id="editor-saved-data" type="application/json" data-source="layout/presentation-layout.json"></script>\n<script src="assets/visual-editor-core.js"></script>\n<script src="assets/visual-editor-io.js"></script>\n<script src="assets/visual-editor.js"></script>\n<script src="assets/initial-image-view.js"></script>');
  replace('<script id="general-editor">\n(() => {\n  \'use strict\';', '<script id="general-editor">\n(async () => {\n  \'use strict\';\n  await window.visualLayoutReady;');
  replace('try{draft=parse(localStorage.getItem(storageKey));}catch{}', 'try{if(!$(\'editor-saved-data\').dataset.source)draft=parse(localStorage.getItem(storageKey));}catch{}');
  replace('<script>\n\'use strict\';\n(() => {', '<script>\n\'use strict\';\n(async () => {\n  await window.visualLayoutReady;');
  replace('if(index===position&&!options.force) return;', 'if(index===position&&!options.force) return;\n    window.visualLayoutEditor?.beforeRender();');
  replace("window.generalRoadConditions?.mount($('presentation'));", "window.generalRoadConditions?.mount($('presentation'));\n    window.visualLayoutEditor?.render();");
  replace('||editor?.editing||document.querySelector', '||editor?.editing||window.visualLayoutEditor?.editing||document.querySelector');
  replace('editor?.connect(window.generalRoadPresentation);', 'editor?.connect(window.generalRoadPresentation);\n  window.visualLayoutEditor?.connect(window.generalRoadPresentation);');
  html=html.replace('<script src="assets/initial-image-view.js"></script>','<script src="assets/initial-image-view.js"></script>\n<script src="assets/structured-content.js"></script>');
  replace('bindTexts();bindImages();',"bindTexts();window.PresentationContent?.render({api,root:$('presentation'),state});bindImages();");
  replace('collection[item.key]=settings;applyItem(item,settings);context.changed();syncPanel();','collection[item.key]=settings;applyItem(item,settings);context.changed(false);window.visualLayoutEditor?.formatChanged(item.element,property);syncPanel();');
  replace('window.generalRoadFormatting={connect,render,setActive,select,','window.generalRoadFormatting={connect,render,setActive,select,setLayout:saveLayout,get layout(){return layoutValues();},');
  replace("if(editing){element.setAttribute('contenteditable','plaintext-only');element.spellcheck=false;}","if(editing&&!window.visualLayoutEditor?.editing){element.setAttribute('contenteditable','plaintext-only');element.spellcheck=false;}");
  replace('function changed() {\n    state.updatedAt=Date.now();\n    dirty=true;','function changed(commit=true) {\n    state.updatedAt=Date.now();\n    dirty=true;\n    if(commit)window.visualLayoutEditor?.legacyChanged();');
  return html;
}
module.exports = {integrate};
if (require.main === module) {
  const file = path.join(root, 'index.html');
  const original = fs.readFileSync(file, 'utf8');
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const html = original.replace(/\r\n/g, '\n');
  assert(!html.includes('src="assets/visual-editor.js"'), 'Editor already installed');
  const state = JSON.parse(html.match(/<script id="editor-saved-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  fs.mkdirSync(path.join(root, 'layout'), {recursive: true});
  const config = {schemaVersion: 1, documentId: 'general-road-scenarios', units: 'css-px', updatedAt: null, legacyState: state, elements: {}, imageViews: {}};
  fs.writeFileSync(path.join(root, 'layout/presentation-layout.json'), JSON.stringify(config, null, 2) + '\n', {flag: 'wx'});
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const baseline = {styles: {}, scripts: {}, data: hash(html.match(/<script id="presentation-data" type="application\/json">([\s\S]*?)<\/script>/)[1]), legacyState: state};
  for (const match of html.matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    if (/type="application\/json"/.test(match[2])) continue;
    const id = match[2].match(/id="([^"]+)"/)?.[1] || 'anonymous';
    baseline[match[1] === 'style' ? 'styles' : 'scripts'][id] = hash(match[3]);
  }
  fs.mkdirSync(path.join(root, 'tests/fixtures'), {recursive: true});
  fs.writeFileSync(path.join(root, 'tests/fixtures/presentation-baseline.json'), JSON.stringify(baseline, null, 2) + '\n');
  fs.mkdirSync(path.join(root, 'tests/artifacts/visual-editor'), {recursive: true});
  fs.writeFileSync(path.join(root, 'tests/artifacts/visual-editor/baseline.html'), html);
  fs.writeFileSync(file, integrate(html).replace(/\n/g, newline));
  console.log('Migrated existing editor state to layout/presentation-layout.json; integrated visual editor without changing original presentation CSS or content.');
}
