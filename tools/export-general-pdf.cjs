'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),output=process.env.TRAFFIC_GUIDE_PDF_OUTPUT||path.join(root,'exports','PDF-General');
function run(executable,args){const result=spawnSync(executable,args,{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',TRAFFIC_GUIDE_PDF_OUTPUT:output},stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status!==0)throw new Error('PDF step failed: '+path.basename(args[0]||executable));}
fs.mkdirSync(output,{recursive:true});
const assembleOnly=process.argv.includes('--assemble-only');
if(!assembleOnly){
 if(!process.env.TRAFFIC_GUIDE_PDF_SNAPSHOT){process.env.TRAFFIC_GUIDE_PDF_SNAPSHOT=path.join(output,'project-snapshot.json');fs.writeFileSync(process.env.TRAFFIC_GUIDE_PDF_SNAPSHOT,JSON.stringify(require('./presentation-project-store.cjs').read(root).config));}
 run(process.execPath,['tools/prepare-github-pages.cjs','--quiet']);run(process.execPath,['tools/export-pdf-chapters.cjs','--deck=general']);
}
const manifestFile=path.join(output,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')),registry=JSON.parse(fs.readFileSync(path.join(root,'data/presentation-registry.json'),'utf8'));
const config=process.env.TRAFFIC_GUIDE_PDF_SNAPSHOT?JSON.parse(fs.readFileSync(process.env.TRAFFIC_GUIDE_PDF_SNAPSHOT,'utf8')):require('./presentation-project-store.cjs').read(root).config;
const articles=[...registry.base.articles,...registry.scenarios.details.flatMap(doc=>doc.articles)],scenes=[...registry.base.scenarios,...registry.scenarios.details.map(doc=>doc.scenario)];
for(const doc of manifest.documents)for(const sheet of doc.sheets){sheet.title=sheet.title.replace(/（續 \d+ \/ \d+）$/,'');const article=articles.find(a=>a.id===sheet.id);if(article)sheet.title=(scenes.find(s=>s.id===article.scenario)?.code||'')+' '+(config.legacyState.texts[article.id+'|article|name']||article.name);if(sheet.continuation>1)sheet.title+='（續 '+sheet.continuation+' / '+sheet.continuations+'）';}
fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
const localPython=path.join(root,'.venv-pdf','Scripts','python.exe'),python=process.env.TRAFFIC_GUIDE_PDF_PYTHON||(fs.existsSync(localPython)?localPython:'py');
run(python,[...(python==='py'?['-3']:[]),'tools/assemble-pdf-chapters.py','--output',output]);
console.log('General PDF ready: '+path.join(output,'general-road-scenarios.pdf'));
