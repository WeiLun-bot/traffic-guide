'use strict';
const fs=require('node:fs'),path=require('node:path');

// Preview sessions can leave obsolete assets after source files are renamed.
// Preserve those entries outside the served folder; releases remain strict.
module.exports=function prepareOutput({root,files,archiveStale=false}) {
  const output=path.join(root,'_site'),allowed=new Set(files);
  fs.mkdirSync(output,{recursive:true});
  if(!fs.lstatSync(output).isDirectory()||fs.lstatSync(output).isSymbolicLink())throw new Error('_site must be a regular directory');
  const stale=[];
  function inspect(folder,prefix='',obsolete=false) {
    for(const name of fs.readdirSync(folder)) {
      const relative=prefix+name,entry=path.join(folder,name),info=fs.lstatSync(entry);
      if(info.isSymbolicLink())throw new Error('Release entries cannot be symbolic links: '+relative);
      if(!info.isFile()&&!info.isDirectory())throw new Error('Release entry must be a regular file or directory: '+relative);
      const expected=info.isDirectory()?files.some(file=>file.startsWith(relative+'/')):allowed.has(relative);
      if(info.isDirectory())inspect(entry,relative+'/',obsolete||!expected);
      if(!obsolete&&!expected)stale.push(relative);
    }
  }
  // Inspect the entire tree before moving anything, including obsolete folders.
  inspect(output);
  if(!stale.length)return null;
  if(!archiveStale)throw new Error('Unexpected file in _site: '+stale[0]+'. Move it out before preparing the release.');
  let backupRoot=root;
  for(const name of ['exports','preview-backups']) {
    backupRoot=path.join(backupRoot,name);
    if(!fs.existsSync(backupRoot))fs.mkdirSync(backupRoot);
    const info=fs.lstatSync(backupRoot);
    if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Preview backup must be a regular directory: '+backupRoot);
  }
  const backup=fs.mkdtempSync(path.join(backupRoot,new Date().toISOString().replace(/[:.]/g,'-')+'-'));
  for(const relative of stale) {
    const destination=path.join(backup,relative);
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.renameSync(path.join(output,relative),destination);
  }
  return {backup:path.relative(root,backup).split(path.sep).join('/'),entries:stale.length};
};
