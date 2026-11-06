'use strict';
const fs=require('node:fs');
const path=require('node:path'),{randomUUID}=require('node:crypto');
const retryDelays=[100,250,500,1000,2000,4000];
const retryable=new Set(['EBUSY','EACCES','EPERM','ERR_COPY_VERIFICATION']);
const pause=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);

// Synced folders can briefly lock a file or return stale bytes after a write.
// Replace complete files instead of truncating the working copy. Windows can
// lock replacements too, so allow nearly eight seconds for readers to finish.
// Keep byte verification and avoid unchanged writes.
module.exports=function writeVerifiedFile(destination,bytes,label=destination){
  for(let attempt=0;;attempt++){
    let temporary;
    try{
      let info;
      try{info=fs.lstatSync(destination);}catch(error){if(error.code!=='ENOENT')throw error;}
      if(info){
        if(!info.isFile()||info.isSymbolicLink())throw new Error('Release target must be a regular file: '+label);
        if(fs.readFileSync(destination).equals(bytes))return;
      }
      temporary=path.join(path.dirname(destination),'.traffic-guide-'+randomUUID()+'.tmp');
      fs.writeFileSync(temporary,bytes,{flag:'wx',flush:true});
      const staged=fs.readFileSync(temporary);
      if(!staged.equals(bytes)){
        const error=new Error('Copy verification failed: '+label+' (temporary file, expected '+bytes.length+' bytes, read '+staged.length+')');
        error.code='ERR_COPY_VERIFICATION';
        throw error;
      }
      fs.renameSync(temporary,destination);
      temporary=undefined;
      const copied=fs.readFileSync(destination);
      if(copied.equals(bytes))return;
      const error=new Error('Copy verification failed: '+label+' (expected '+bytes.length+' bytes, read '+copied.length+')');
      error.code='ERR_COPY_VERIFICATION';
      throw error;
    }catch(error){
      if(!retryable.has(error.code))throw error;
      if(attempt===retryDelays.length)throw new Error('Unable to copy preview file after '+(attempt+1)+' attempts: '+label+'. '+error.message,{cause:error});
    }finally{
      if(temporary)fs.rmSync(temporary,{force:true});
    }
    pause(retryDelays[attempt]);
  }
};
