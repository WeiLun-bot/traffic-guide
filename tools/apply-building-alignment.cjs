'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),content=path.join(root,'content/04-general-scenarios');
const detection=JSON.parse(fs.readFileSync(path.join(root,'tests/artifacts/general-scenarios/building-alignment-detection.json'),'utf8'));
if(detection.error||detection.anchors?.length!==3)throw new Error('Validated building features are required');
const configPath=path.join(content,'current-conditions.json'),config=JSON.parse(fs.readFileSync(configPath,'utf8'));
const solve=(rows,values)=>{
  const m=rows.map((row,i)=>[...row,values[i]]);
  for(let col=0;col<3;col++){
    let pivot=col;for(let j=col+1;j<3;j++)if(Math.abs(m[j][col])>Math.abs(m[pivot][col]))pivot=j;
    [m[col],m[pivot]]=[m[pivot],m[col]];const divisor=m[col][col];if(Math.abs(divisor)<1e-9)throw new Error('Collinear anchors');
    for(let j=col;j<4;j++)m[col][j]/=divisor;
    for(let i=0;i<3;i++)if(i!==col){const factor=m[i][col];for(let j=col;j<4;j++)m[i][j]-=factor*m[col][j];}
  }
  return m.map(row=>row[3]);
};
const rows=detection.anchors.map(a=>[...a.source,1]);
const [a,c,e]=solve(rows,detection.anchors.map(p=>p.target[0])),[b,d,f]=solve(rows,detection.anchors.map(p=>p.target[1]));
const nativeMatrix=[a,b,c,d,e,f],project=(m,p)=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
const multiply=(m,n)=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];
const inverse=m=>{const det=m[0]*m[3]-m[1]*m[2];return [m[3]/det,-m[1]/det,-m[2]/det,m[0]/det,(m[2]*m[5]-m[3]*m[4])/det,(m[1]*m[4]-m[0]*m[5])/det];};
const fit90=(width,height)=>{const s=Math.min(1000/height,650/width),x=(1000-height*s)/2,y=(650-width*s)/2;return [0,s,-s,0,x+height*s,y];};
const beforeFit=fit90(1967,2454),afterFit=fit90(913,1402);
const matrix=multiply(multiply(afterFit,nativeMatrix),inverse(beforeFit));
const maxResidual=Math.max(...detection.anchors.map(p=>Math.hypot(...project(nativeMatrix,p.source).map((v,i)=>v-p.target[i]))));
if(!matrix.every(Number.isFinite)||maxResidual>.01||a<=0||d<=0)throw new Error('Invalid building registration');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
let backup=config.scenarios['g1-01'].alignment?.backup;
if(!backup){
  const timestamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(/[-:]/g,'').replace(' ','-');
  backup='backups/一般道路情境-圖面放大版-建築線校準前-'+timestamp+'.html';
  fs.copyFileSync(path.join(root,'一般道路情境-圖面放大版.html'),path.join(root,backup),fs.constants.COPYFILE_EXCL);
}
const report={method:'white-building-boundary-to-colored-parcel-boundary',scenario:'g1-01',createdAt:new Date().toISOString(),sourceSize:[1967,2454],targetSize:[913,1402],nativeMatrix,comparisonMatrix:matrix,beforeFit,afterFit,anchors:detection.anchors,regions:detection.regions,lines:detection.lines,anchorResidual:maxResidual,backup,backupSha256:sha(fs.readFileSync(path.join(root,backup))),note:'Anchors are intersections of fitted building boundary tangents, not the brick-red curb. Independent axis scales compensate for different schematic drawing proportions. Original images remain unchanged. G1-02 is not registered because corresponding building boundaries cannot be established.'};
config.scenarios['g1-01'].alignment={type:'building-boundaries',matrix,nativeMatrix,beforeFit,afterFit,anchors:detection.anchors,backup,source:'building-alignment-g101.json'};
fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n','utf8');
fs.writeFileSync(path.join(content,'building-alignment-g101.json'),JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify({nativeMatrix,comparisonMatrix:matrix,anchorResidual:maxResidual,backup},null,2));
