'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function({evaluate,view,navigate,click,wait,mouse,cdp,base,artifacts,pass,previewConfigPath}){
  const baseline=fs.readFileSync(previewConfigPath,'utf8'),fixture=JSON.parse(baseline);fixture.coverArt={};fs.writeFileSync(previewConfigPath,JSON.stringify(fixture));
  const input=key=>'.cover-art-editor [data-cover-setting="'+key+'"]';
  const settings=()=>evaluate('window.visualLayoutEditor.store.config.coverArt["results-intro"]||null');
  const styles=()=>evaluate(`(()=>{const s=document.querySelector('.results-cover-art img').style;return Object.fromEntries(['rotation','tilt','scale','x','y'].map(key=>[key,s.getPropertyValue('--cover-'+key)]))})()`);
  const history=()=>evaluate('window.visualLayoutEditor.store.past.length');
  const panel=()=>evaluate(`(()=>{const r=document.querySelector('.cover-art-editor').getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom}})()`);
  async function key(key,modifiers=0){await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key,modifiers});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key,modifiers});}
  async function movePanel(dx,dy,release=true){
    const r=await evaluate(`(()=>{const r=document.querySelector('[data-cover-drag]').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await mouse('mouseMoved',r.x,r.y);await mouse('mousePressed',r.x,r.y,{button:'left',buttons:1,clickCount:1});
    await mouse('mouseMoved',r.x+dx,r.y+dy,{button:'left',buttons:1});
    if(release)await mouse('mouseReleased',r.x+dx,r.y+dy,{button:'left',buttons:0,clickCount:1});
    return{x:r.x+dx,y:r.y+dy};
  }
  async function bounded(){
    assert(await evaluate(`(()=>{const r=document.querySelector('.cover-art-editor').getBoundingClientRect(),top=Math.max(...Array.from(document.querySelectorAll('.header,#editor-toolbar'),n=>n.getBoundingClientRect().bottom));return r.left>=7.9&&r.right<=innerWidth-7.9&&r.top>=top+7.9&&r.bottom<=innerHeight-7.9})()`),'The complete panel remains within the available viewport');
    assert(await evaluate(`(()=>{const n=document.querySelector('[data-cover-drag]'),r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})()`),'The drag handle stays accessible');
  }
  const range=async(key,value,commit=true)=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(input(key))});n.value=${value};n.dispatchEvent(new Event('input',{bubbles:true}));${commit?"n.dispatchEvent(new Event('change',{bubbles:true}));":''}})()`);
  async function dragStart(key,delta){
    const r=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(input(key))}),r=n.getBoundingClientRect(),p=(Number(n.value)-Number(n.min))/(Number(n.max)-Number(n.min));return{x:r.left+8+(r.width-16)*p,y:r.top+r.height/2}})()`);
    await mouse('mouseMoved',r.x,r.y);await mouse('mousePressed',r.x,r.y,{button:'left',buttons:1,clickCount:1});for(let i=1;i<=6;i++)await mouse('mouseMoved',r.x+delta*i/6,r.y,{button:'left',buttons:1});return {x:r.x+delta,y:r.y};
  }
  try{
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await navigate(base+'/presentation-demo/#results-intro');assert.equal(await evaluate('document.querySelector(".cover-art-editor")'),null);assert.equal((await styles()).rotation,'-52deg');
    await click('.edit-toggle');await click('.cover-art-editor summary');assert.equal(await evaluate('document.querySelectorAll("[data-cover-setting]").length'),5);
    const initialPanel=await panel(),initialHistory=await history(),initialStyles=await styles(),initialSignature=await evaluate('window.VisualLayoutCore.signature(window.visualLayoutEditor.store.config)');
    await movePanel(-500,30);const movedPanel=await panel();assert(Math.abs(movedPanel.x-initialPanel.x+500)<1);assert(Math.abs(movedPanel.y-initialPanel.y-30)<1);await bounded();
    await click('.cover-art-editor>summary');await click('.cover-art-editor>summary');assert.deepEqual(await panel(),movedPanel);
    await evaluate('document.querySelector("[data-cover-drag]").focus()');await key('ArrowLeft');assert.equal((await panel()).x,movedPanel.x-10);await key('ArrowDown',8);assert.equal((await panel()).y,movedPanel.y+20);await key('Home');assert.deepEqual(await panel(),initialPanel);
    await movePanel(-500,30);const cancelPanel=await panel(),cancelMove=await movePanel(120,60,false);await key('Escape');await mouse('mouseReleased',cancelMove.x,cancelMove.y,{button:'left',buttons:0,clickCount:1});assert.deepEqual(await panel(),cancelPanel);assert(await evaluate('document.querySelector(".cover-art-editor").open'));
    await movePanel(-5000,-5000);await bounded();await movePanel(5000,5000);await bounded();
    assert.equal(await history(),initialHistory);assert.deepEqual(await styles(),initialStyles);assert.equal(await evaluate('window.VisualLayoutCore.signature(window.visualLayoutEditor.store.config)'),initialSignature);
    await evaluate('document.querySelector("[data-cover-drag]").focus()');await key('Home');await movePanel(-500,30);const stablePanel=await panel();
    pass('Cover adjustment panel moves by mouse or keyboard, clamps to visible bounds, cancels with Escape and preserves image settings and history');
    const before=await history(),point=await dragStart('rotation',45);assert.equal(await settings(),null);assert.notEqual((await styles()).rotation,'-52deg');assert.equal(await history(),before);await mouse('mouseReleased',point.x,point.y,{button:'left',buttons:0,clickCount:1});await wait('Boolean(window.visualLayoutEditor.store.config.coverArt["results-intro"])');assert.equal(await history(),before+1);const rotated=await settings();
    await click('[data-vl-action="undo"]');assert.equal(await settings(),null);assert.equal((await styles()).rotation,'-52deg');assert.deepEqual(await panel(),stablePanel);await click('[data-vl-action="redo"]');assert.deepEqual(await settings(),rotated);assert.deepEqual(await panel(),stablePanel);
    await click('.cover-art-position summary');for(const [key,value]of [['tilt',43],['scale',112],['x',4],['y',-6]])await range(key,value);const custom=await settings();assert.deepEqual(custom,{rotation:rotated.rotation,tilt:43,scale:1.12,x:4,y:-6});assert.deepEqual(await styles(),{rotation:custom.rotation+'deg',tilt:'43deg',scale:'1.12',x:'4vw',y:'-6vh'});
    const count=await history(),cancelPoint=await dragStart('rotation',-35);assert.notEqual((await styles()).rotation,custom.rotation+'deg');await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await mouse('mouseReleased',cancelPoint.x,cancelPoint.y,{button:'left',buttons:0,clickCount:1});assert.deepEqual(await settings(),custom);assert.equal((await styles()).rotation,custom.rotation+'deg');assert.equal(await history(),count);
    await click('[data-cover-reset]');assert.equal(await settings(),null);assert.equal((await styles()).rotation,'-52deg');await click('[data-vl-action="undo"]');assert.deepEqual(await settings(),custom);
    pass('Cover sliders preview live with one history step per drag; rotation, tilt, scale and position support undo/redo, Escape cancellation and reset');
    await evaluate('window.visualLayoutEditor.files.save=async snapshot=>{window.__coverSaved=JSON.stringify(snapshot);return{name:"preview-layout.json",download:false};}');await click('[data-cover-save]');await wait('Boolean(window.__coverSaved)&&!window.visualLayoutEditor.busy&&!window.visualLayoutEditor.store.dirty');fs.writeFileSync(previewConfigPath,await evaluate('window.__coverSaved'));await navigate(base+'/presentation-demo/#results-intro');assert.deepEqual(await settings(),custom);assert.equal((await styles()).rotation,custom.rotation+'deg');assert.equal(await evaluate('document.querySelector(".cover-art-editor")'),null);
    await click('.edit-toggle');await click('.cover-art-editor summary');await click('[data-vl-action="mode"]');assert.equal(await evaluate('document.querySelector(".cover-art-editor")'),null);await click('[data-vl-action="mode"]');assert(await evaluate('Boolean(document.querySelector(".cover-art-editor"))'));await view('results-outline');assert.equal(await evaluate('document.querySelector(".cover-art-editor")'),null);await view('results-intro');assert.deepEqual(await settings(),custom);
    for(const [width,height]of [[1366,768],[390,844]]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await view('results-intro');await evaluate('document.querySelector(".cover-art-editor").open=true');assert(await evaluate('(()=>{const r=document.querySelector(".cover-art-editor").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight})()'));
      for(const rotation of [-85,85]){await range('rotation',rotation);await range('tilt',70);await range('scale',140);assert(await evaluate(`(()=>{const n=document.querySelector('.results-cover-art img'),m=new DOMMatrixReadOnly(getComputedStyle(n).transform),o=getComputedStyle(n).transformOrigin.split(' ').map(parseFloat);return [[0,0],[n.offsetWidth,0],[0,n.offsetHeight],[n.offsetWidth,n.offsetHeight]].every(([x,y])=>m.transformPoint(new DOMPoint(x-o[0],y-o[1],0,1)).w>.1)})()`));}
      if(width===1366){await movePanel(-5000,5000);await bounded();}else{await bounded();await click('.cover-art-position summary');await bounded();}
      const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'cover-art-editor-'+width+'.png'),Buffer.from(shot.data,'base64'));
    }
    pass('Panel save delegates to the existing settings workflow; saved composition survives reload, stays isolated to the cover, fits phone/desktop editing and remains finite at angle/scale limits');
    const mobileHistory=await history(),mobileSettings=await settings(),beforeTouch=await panel(),touch=await evaluate(`(()=>{const r=document.querySelector('[data-cover-drag]').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touch,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x+24,y:touch.y-55,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
    assert.notDeepEqual(await panel(),beforeTouch);await bounded();assert.equal(await history(),mobileHistory);assert.deepEqual(await settings(),mobileSettings);
    pass('Moved panel stays accessible after viewport resizing and control expansion, and supports touch dragging without changing the saved composition');
  }finally{fs.writeFileSync(previewConfigPath,baseline);}
};
