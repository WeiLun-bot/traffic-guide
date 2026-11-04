'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const writeVerifiedFile=require('./write-verified-file.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'_site');
const quiet=process.argv.includes('--quiet');
if(quiet)console.log('Refreshing source images...');
// Material files can be replaced between preview sessions. Refresh only image
// bytes and dimensions before copying the current presentation into _site.
require('./refresh-general-scenario-images.cjs').refresh({root});
require('./refresh-module-comparison-images.cjs').refresh({root});
if(fs.existsSync(path.join(root,'data/scenarios/presentation.json')))require('./prepare-presentation-registry.cjs').build({root});
const projectStore=require('./presentation-project-store.cjs');
const migration=projectStore.migrate({root});
if(migration.migrated)console.log('Separated presentation content and layout; backup: '+migration.backup);
const files=Array.from(new Map([
  ['index.html','index.html'],
  ['viewer.html','viewer.html'],
  ['index.html','一般道路情境-圖面放大版.html'],
  ['路口管制.html','路口管制.html'],
  ['assets/visual-editor-core.js','assets/visual-editor-core.js'],
  ['assets/visual-editor-io.js','assets/visual-editor-io.js'],
  ['assets/visual-editor.js','assets/visual-editor.js'],
  ['assets/initial-image-view.js','assets/initial-image-view.js'],
  ['assets/structured-content.js','assets/structured-content.js'],
  ['assets/visual-editor.css','assets/visual-editor.css'],
  ['layout/presentation-layout.json','layout/presentation-layout.json'],
  ...projectStore.releaseFiles(root).map(name=>[name,name]),
  ['.nojekyll','.nojekyll'],
  ...require('./module-release-files.cjs').map(name=>[name,name])
].map(pair=>[pair[1],pair])).values());
// Copy a strict allowlist: source inventories, backups and test logs stay local.
const archived=require('./prepare-release-output.cjs')({root,files:files.map(([,name])=>name),archiveStale:process.argv.includes('--archive-stale-preview-files')});
if(archived)console.log('Backed up '+archived.entries+' obsolete preview entries to '+archived.backup);
const report=[];
for(const [source,name]of files){
  const input=path.join(root,source),destination=path.join(output,name);
  if(!fs.statSync(input).isFile())throw new Error('Missing presentation: '+source);
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  if(fs.existsSync(destination)&&(!fs.lstatSync(destination).isFile()||fs.lstatSync(destination).isSymbolicLink()))throw new Error('Release target must be a regular file: '+name);
  const bytes=fs.readFileSync(input);
  writeVerifiedFile(destination,bytes,name);
  report.push({file:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  if(quiet&&report.length%100===0)console.log('Updated '+report.length+' / '+files.length+' preview files...');
}
if(quiet)console.log('Preview files updated: '+report.length+'.');
else console.log(JSON.stringify({output:'_site/',entry:'index.html',files:report},null,2));
