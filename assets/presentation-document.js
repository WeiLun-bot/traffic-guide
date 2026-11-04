(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./visual-editor-core.js'):root.VisualLayoutCore);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PresentationDocument=api;
})(typeof globalThis==='object'?globalThis:this,function(Core){
  'use strict';
  const clone=Core.clone;
  const layoutFile='layout/presentation-layout.json',structureFile='data/presentation-navigation.json',manifestFile='data/content/catalog.json';
  const contentKinds=['conditions','articles','overviews','modules','results'];
  const layoutKeys=['elements','imageViews','extensionLayouts','tableColumns','coverArt'];
  const legacyLayoutKeys=['highlights','disabledHighlights','styles','frames','layouts','comparisonTransforms'];
  const contentPath=owner=>'data/content/'+owner+'.json';
  const validOwner=owner=>/^(?:shared|results\/common|(?:results\/)?(?:modules\/M[1-4]-\d{2}|scenarios\/[GC][1-4]-\d{2}))$/.test(owner);
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  function empty(){return {schemaVersion:1,documentId:Core.DOCUMENT_ID,units:'css-px',updatedAt:'',legacyState:{version:1,updatedAt:0,texts:{},images:{},blocks:{},pages:[],pageOrder:[],templateMigrations:{},...Object.fromEntries(legacyLayoutKeys.map(key=>[key,{}]))},elements:{}};}
  function ownerFor(key,owners={}){
    if(Object.hasOwn(owners,key))return owners[key];
    const page=key.split('|')[0];if(Object.hasOwn(owners,page))return owners[page];
    let match=page.match(/^results-scenario-([gc][1-4]-\d{2})(?:-|$)/i);
    if(match)return 'results/scenarios/'+match[1].toUpperCase();
    match=page.match(/^results-module-(m[1-4]-\d{2})(?:-|$)/i);
    if(match)return 'results/modules/'+match[1].toUpperCase();
    if(page.startsWith('results-')||page.startsWith('chapter-cover-results-'))return 'results/common';
    match=page.match(/^m([1-4])(\d{2})(?:-|$)/i);if(match)return 'modules/M'+match[1]+'-'+match[2];
    match=page.match(/^([gc][1-4])(\d{2})(?:-|$)/i);if(match)return 'scenarios/'+match[1].toUpperCase()+'-'+match[2];
    return 'shared';
  }
  function split(value,owners={}){
    const config=Core.validate(value),legacy=config.legacyState,documents={};
    const layout={kind:'presentation-layout',schemaVersion:1,documentId:config.documentId,units:config.units,updatedAt:config.updatedAt,legacyState:{version:1,updatedAt:legacy.updatedAt}};
    for(const key of legacyLayoutKeys)layout.legacyState[key]=clone(legacy[key]);
    for(const key of layoutKeys)layout[key]=clone(config[key]||{});
    layout.elements=Object.fromEntries(Object.entries(layout.elements).filter(([,item])=>Core.overrides(item)));
    layout.imageViews=Object.fromEntries(Object.entries(layout.imageViews).filter(([,view])=>view.zoom!==1||view.x!==0||view.y!==0||(view.rotation||0)!==0));
    const navigation={kind:'presentation-navigation',schemaVersion:1,pageOrder:clone(legacy.pageOrder),templateMigrations:clone(legacy.templateMigrations),navigationOrders:clone(config.navigationOrders),imageOrders:clone(config.imageOrders),removedModuleExtensions:clone(config.removedModuleExtensions)};
    const docFor=key=>{
      const owner=ownerFor(key,owners);check(validOwner(owner),'內容歸屬無效：'+owner);
      return documents[owner]||(documents[owner]={schemaVersion:1,owner,texts:{},images:{},blocks:{},pages:[],content:Object.fromEntries(contentKinds.map(key=>[key,{}]))});
    };
    // Structured lists are authoritative. Do not also persist their text-key mirrors.
    const mirrored=new Set();
    function textKeys(value){if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(['textKey','titleKey'].includes(key)&&typeof item==='string')mirrored.add(item);else textKeys(item);}}
    textKeys(config.content);
    for(const [key,text]of Object.entries(legacy.texts))if(!mirrored.has(key))docFor(key).texts[key]=text;
    for(const [key,image]of Object.entries(legacy.images))docFor(key).images[key]=clone(image);
    layout.blockDecorations={};
    for(const [key,block]of Object.entries(legacy.blocks)){
      const content=clone(block);if(Object.hasOwn(content,'decor')){layout.blockDecorations[key]=content.decor;delete content.decor;}
      if(Object.values(content).some(value=>Array.isArray(value)?value.length:Object.keys(value||{}).length))docFor(key).blocks[key]=content;
    }
    for(const page of legacy.pages)docFor(page.id).pages.push(clone(page));
    for(const kind of contentKinds)for(const [key,content]of Object.entries(config.content[kind]))docFor(key).content[kind][key]=clone(content);
    const catalog={kind:'presentation-content-catalog',schemaVersion:1,owners:clone(owners),files:Object.keys(documents).sort().map(contentPath)};
    return {layout,navigation,catalog,documents};
  }
  function validateCatalog(catalog){
    check(catalog?.kind==='presentation-content-catalog'&&catalog.schemaVersion===1&&Array.isArray(catalog.files)&&catalog.files.length<=2000,'內容目錄格式無效');
    check(new Set(catalog.files).size===catalog.files.length&&catalog.files.every(file=>file.startsWith('data/content/')&&file.endsWith('.json')&&validOwner(file.slice(13,-5))),'內容檔案路徑無效');
    check(catalog.owners&&typeof catalog.owners==='object'&&!Array.isArray(catalog.owners)&&Object.keys(catalog.owners).every(key=>!['__proto__','constructor','prototype'].includes(key))&&Object.values(catalog.owners).every(validOwner),'內容歸屬目錄無效');
    return catalog;
  }
  function join(layout,navigation,documents){
    check(layout?.kind==='presentation-layout'&&layout.schemaVersion===1,'版面檔格式無效');
    check(navigation?.kind==='presentation-navigation'&&navigation.schemaVersion===1,'導覽檔格式無效');
    check(!layout.content&&['texts','images','blocks','pages','pageOrder','templateMigrations'].every(key=>!Object.hasOwn(layout.legacyState||{},key)),'版面檔不可包含內容或導覽資料');
    const config=empty();config.updatedAt=layout.updatedAt;config.documentId=layout.documentId;config.units=layout.units;
    config.legacyState.updatedAt=layout.legacyState.updatedAt;
    for(const key of legacyLayoutKeys)config.legacyState[key]=clone(layout.legacyState[key]||{});
    for(const key of layoutKeys)config[key]=clone(layout[key]||{});
    for(const key of ['navigationOrders','imageOrders','removedModuleExtensions'])config[key]=clone(navigation[key]);
    for(const key of ['pageOrder','templateMigrations'])config.legacyState[key]=clone(navigation[key]);
    config.content=Object.fromEntries(contentKinds.map(key=>[key,{}]));
    const assigned=new Set();
    function merge(target,items,scope){for(const [key,value]of Object.entries(items||{})){check(!['__proto__','constructor','prototype'].includes(key),'內容鍵無效');const id=scope+'|'+key;check(!assigned.has(id),'內容鍵重複：'+id);assigned.add(id);target[key]=clone(value);}}
    for(const doc of documents){
      check(doc?.schemaVersion===1&&validOwner(doc.owner),'內容檔格式無效');
      for(const key of ['texts','images','blocks'])merge(config.legacyState[key],doc[key],key);
      config.legacyState.pages.push(...clone(doc.pages||[]));
      for(const kind of contentKinds)merge(config.content[kind],doc.content?.[kind],kind);
    }
    for(const [key,decor]of Object.entries(layout.blockDecorations||{})){
      const block=config.legacyState.blocks[key]||(config.legacyState.blocks[key]={added:[],removed:[]});block.decor=clone(decor);
    }
    function mirrors(value){if(!value||typeof value!=='object')return;if(typeof value.textKey==='string')config.legacyState.texts[value.textKey]=value.text;if(typeof value.titleKey==='string')config.legacyState.texts[value.titleKey]=value.title;for(const item of Object.values(value))if(item&&typeof item==='object')mirrors(item);}
    mirrors(config.content);
    return Core.validate(config);
  }
  function bundle(config,owners={}){return {kind:'presentation-project',schemaVersion:1,...split(config,owners)};}
  function parse(text){Core.checkSize(text);const value=JSON.parse(text);if(value.kind==='presentation-project'){validateCatalog(value.catalog);check(value.catalog.files.length===Object.keys(value.documents).length&&Object.entries(value.documents).every(([owner,doc])=>owner===doc.owner&&value.catalog.files.includes(contentPath(owner))),'專案內容清單不符');return join(value.layout,value.navigation,Object.values(value.documents));}check(value.kind!=='presentation-layout','這是純版面檔；請載入整份專案，或匯入 presentation-project.json。');return Core.validate(value);}
  async function load(read,layout){
    if(layout.kind==='presentation-project')return {config:parse(JSON.stringify(layout)),owners:layout.catalog.owners};
    if(layout.kind!=='presentation-layout')return {config:Core.validate(layout),owners:{}};
    const [navigation,catalog]=await Promise.all([read(structureFile),read(manifestFile)]);validateCatalog(catalog);
    const documents=await Promise.all(catalog.files.map(read));
    documents.forEach((doc,index)=>check(contentPath(doc.owner)===catalog.files[index],'內容檔歸屬不符'));
    return {config:join(layout,navigation,documents),owners:catalog.owners};
  }
  return {layoutFile,structureFile,manifestFile,contentPath,validOwner,empty,ownerFor,split,join,validateCatalog,bundle,parse,load};
});
