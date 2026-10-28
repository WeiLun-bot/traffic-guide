'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
module.exports=({root,content})=>{
  const deck=JSON.parse(fs.readFileSync(path.join(content,'deck.json'),'utf8'));
  const first={id:'g1-01',code:'G1-01',chapter:'g1',name:'無號誌市區正交三岔路口',short:'市區正交',setting:'市區',rotation:90,overall:'overall',figure:'圖 4.1',contextId:'context',overviewId:'overview',reviewId:'review',source:deck.source,modules:deck.modules,assets:{...deck.assets},articles:deck.articles,summary:'住宅與商業集結區域，檢視行人穿越、車流動線與路側停車空間。',assetRotations:{overall:90,edge:90,crosswalk:0,guidance:0,taper:90,parking:90,sign:90},assetLabels:{overall:'G1-01 完整情境圖',sign:'當心行人、最高速限、學校標誌設置圖例'}};
  const second=JSON.parse(fs.readFileSync(path.join(content,'g1-02.json'),'utf8'));
  const additional=['g1-03.json','g1-04.json'].filter(name=>fs.existsSync(path.join(content,name))).map(name=>JSON.parse(fs.readFileSync(path.join(content,name),'utf8')));
  deck.scenarios=[first,second,...additional];deck.articles=[];deck.assets={};deck.embeddedAssets={};deck.assetMeta={};
  const manifest={title:deck.title,source:deck.source,chapters:deck.chapters.map(({id,name,count})=>({id,name,count})),scenarios:[],assets:[],articles:[]};
  for(const scenario of deck.scenarios) {
    const material=path.join(root,'materials','04-一般道路情境',scenario.code);
    const typst=fs.readFileSync(path.join(content,scenario.source.typst),'utf8');
    const active=typst.split(/\r?\n/).filter(line=>!line.trimStart().startsWith('//')).join('\n');
    scenario.originalTypst=typst;if(scenario===first)deck.originalTypst=typst;
    for(const [key,name]of Object.entries(scenario.assets)) {
      const bytes=fs.readFileSync(path.join(material,name));
      const dimensions=bytes.toString('utf8').match(/<svg\b[^>]*\bviewBox="([^"]+)"/);
      if(!dimensions)throw new Error('Missing SVG viewBox: '+name);
      const viewBox=dimensions[1].trim().split(/[\s,]+/).map(Number);
      if(viewBox[0]!==0||viewBox[1]!==0)throw new Error('Expected zero origin SVG: '+name);
      deck.assets[key]=name;deck.embeddedAssets[key]={url:'data:image/svg+xml;base64,'+bytes.toString('base64'),width:viewBox[2],height:viewBox[3]};
      deck.assetMeta[key]={scenario:scenario.id,rotation:scenario.assetRotations[key]||0,label:scenario.assetLabels?.[key]||name.replace(/^G1-\d{2}_?/,'').replace('.svg','')};
      manifest.assets.push({key,scenario:scenario.id,file:'materials/04-一般道路情境/'+scenario.code+'/'+name,viewBox,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
    }
    const {width,height}=deck.embeddedAssets[scenario.overall];scenario.width=width;scenario.height=height;
    scenario.articleIds=scenario.articles.map(article=>article.id);
    for(const article of scenario.articles) {
      article.scenario=scenario.id;
      const anchor='g1-01-reg-'+article.reg;
      let start=active.indexOf(`+ #guide-item(anchor: <${anchor}>)`);
      const sourceAnchor=start>=0?anchor:null;
      if(start<0&&article.sourceHeading)start=active.indexOf('+ #guide-item['+article.sourceHeading+'，');
      if(start<0)start=active.search(new RegExp('^\\+ #guide-item\\[[^\\n]*第\\s*'+article.reg+'\\s*條','m'));
      if(start<0)throw new Error('Source article not found: '+scenario.code+' / '+article.reg);
      let end=active.indexOf('\n+ #guide-item',start+1);
      const heading=active.indexOf('\n==== ',start+1);
      if(end<0)end=active.length;if(heading>=0&&heading<end)end=heading;
      article.sourceRaw=active.slice(start,end).trim();article.sourceAnchor=sourceAnchor;
      article.sourceParagraphs=article.sourceRaw.split('\n').map(line=>line.trim()).filter(line=>/^[\u3400-\u9fff《「]/u.test(line)&&/[。；]/u.test(line)).map(line=>line.replace(/~(?=[a-zA-Z])/g,' ').replace(/@[\w:.-]+(?:\[\])?/g,'（見原稿圖例或章節）').replace(/\]\s*$/,''));
      if(!article.sourceParagraphs.length)throw new Error('Source text missing: '+article.id);
      for(const [label,box]of [['box',article.box],['crop',article.crop]]) {
        if(box.length!==4||box.some(value=>!Number.isFinite(value))||box[0]<0||box[1]<0||box[2]<=0||box[3]<=0||box[0]+box[2]>width||box[1]+box[3]>height)throw new Error('Invalid '+label+': '+article.id);
      }
      deck.articles.push(article);manifest.articles.push({id:article.id,scenario:scenario.id,reg:article.reg,pdfPages:article.page,box:article.box,crop:article.crop,sourceFile:scenario.source.typst,sourceAnchor});
    }
    delete scenario.articles;
    manifest.scenarios.push({id:scenario.id,code:scenario.code,name:scenario.name,source:scenario.source,overall:scenario.overall,width,height,rotation:scenario.rotation,articleIds:scenario.articleIds});
  }
  return {deck,manifest};
};
