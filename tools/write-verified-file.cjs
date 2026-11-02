'use strict';
const fs=require('node:fs');
const retryDelays=[100,250,500,1000];
const retryable=new Set(['EBUSY','EACCES','EPERM','ERR_COPY_VERIFICATION']);
const pause=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);

// Synced folders can briefly lock a file or return stale bytes after a write.
// Keep byte verification, but avoid unnecessary writes and allow time to settle.
module.exports=function writeVerifiedFile(destination,bytes,label=destination){
  for(let attempt=0;;attempt++){
    try{
      let info;
      try{info=fs.lstatSync(destination);}catch(error){if(error.code!=='ENOENT')throw error;}
      if(info){
        if(!info.isFile()||info.isSymbolicLink())throw new Error('Release target must be a regular file: '+label);
        if(fs.readFileSync(destination).equals(bytes))return;
      }
      fs.writeFileSync(destination,bytes,{flush:true});
      const copied=fs.readFileSync(destination);
      if(copied.equals(bytes))return;
      const error=new Error('Copy verification failed: '+label+' (expected '+bytes.length+' bytes, read '+copied.length+')');
      error.code='ERR_COPY_VERIFICATION';
      throw error;
    }catch(error){
      if(!retryable.has(error.code))throw error;
      if(attempt===retryDelays.length)throw new Error('Unable to copy preview file after '+(attempt+1)+' attempts: '+label+'. '+error.message,{cause:error});
      pause(retryDelays[attempt]);
    }
  }
};
