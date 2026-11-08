'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const Project=require('../tools/presentation-project-store.cjs'),{createJobs}=require('../tools/presentation-pdf-jobs.cjs');
test('local PDF jobs require project authorization, freeze saved configuration and return only their completed PDF',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'traffic-pdf-job-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const config=require('./read-project-config.cjs')();Project.transaction(root,Project.plan(config,{}),{backup:false});let child,folder,launches=0;
 const jobs=createJobs(root,{launch(directory,snapshot){launches++;folder=directory;assert.deepEqual(JSON.parse(fs.readFileSync(snapshot,'utf8')),Project.read(root).config);child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();return child;}});
 const server=http.createServer((request,response)=>{if(!jobs.handle(request,response,request.url.slice(1),'token')){response.writeHead(404);response.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const post=(body,token='token',origin)=>fetch(base+'/__pdf',{method:'POST',headers:{'Content-Type':'application/json','X-Project-Token':token,...(origin?{Origin:origin}:{})},body:JSON.stringify(body)}),revision=Project.read(root).revision;
 assert.equal((await post({deck:'general',revision},'wrong')).status,403);assert.equal((await post({deck:'general',revision},'token','https://example.com')).status,403);assert.equal((await post({deck:'general',revision:'stale'})).status,409);assert.equal((await post({deck:'other',revision})).status,400);assert.equal(launches,0);
 const response=await post({deck:'general',revision});assert.equal(response.status,202);const job=await response.json();assert.equal(job.state,'running');assert.equal((await post({deck:'general',revision})).status,409);
 child.stdout.write('Exported GENERAL 3 / 220: sheet\n');assert.equal((await(await fetch(base+'/__pdf/'+job.id)).json()).pages,3);assert.equal((await fetch(base+'/__pdf/'+job.id+'/file')).status,409);
 const bytes=Buffer.from('%PDF-1.7\nfixture');fs.writeFileSync(path.join(folder,'general-road-scenarios.pdf'),bytes);child.emit('close',0);await new Promise(r=>setImmediate(r));
 const status=await(await fetch(base+'/__pdf/'+job.id)).json();assert.equal(status.state,'complete');const file=await fetch(base+'/'+status.download);assert.equal(file.headers.get('content-type'),'application/pdf');assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);
 assert.equal((await fetch(base+'/__pdf/aaaaaaaaaaaaaaaaaaaaaaaa/file')).status,404);assert.equal(Project.read(root).revision,revision);
});
