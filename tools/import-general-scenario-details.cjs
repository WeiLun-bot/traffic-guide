'use strict';
// Curated presentation text; diagrams and original excerpts come from the supplied chapters.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),chapters=process.argv[2];
if(!chapters)throw new Error('Usage: node tools/import-general-scenario-details.cjs <Typst chapter folder>');
const conditions=require('../data/results/current-conditions.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function dimensions(bytes,file){
  if(file.endsWith('.svg'))return require('./svg-native-size.cjs')(bytes.toString('utf8'),file);
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
  if(bytes[0]===255&&bytes[1]===216){for(let i=2;i<bytes.length;){if(bytes[i++]!==255)continue;const marker=bytes[i++];if(marker===255)continue;if(marker===217||marker===218)break;const length=bytes.readUInt16BE(i);if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return [bytes.readUInt16BE(i+5),bytes.readUInt16BE(i+3)];i+=length;}}
  throw new Error('Unsupported image: '+file);
}
function build(code,typst,definition){
 const prefix=code.toLowerCase().replace('-',''),source=fs.readFileSync(path.join(chapters,typst),'utf8'),active=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,''),assets={},articles=[];
 const add=(id,name,rotation=0)=>{const key=prefix+'-'+id,file=name.startsWith('materials/')?name:'materials/04-一般道路情境/'+code+'/'+name,bytes=fs.readFileSync(path.join(root,file)),[width,height]=dimensions(bytes,file);assets[key]={file,width,height,rotation,scenario:code,label:name.split('/').at(-1).replace(/\.(svg|png|jpe?g)$/i,'').replace(new RegExp('^'+code+'_'),''),sha256:hash(bytes)};return key;};
 const article=(id,reg,name,category,mapAsset,points,options={})=>{
   const useOverall=['標線','標誌'].includes(category)||(category==='號誌'&&['pedestrian','pedestrians'].includes(id));
   if(useOverall){mapAsset=prefix+'-overall';options={...options,supplement:mapAsset};}
   const asset=assets[mapAsset],width=asset.width,height=asset.height;
   const heading=options.sourceHeading||name,head=active.indexOf('+ #guide-item['+heading),next=head<0?-1:active.indexOf('\n+ #guide-item[',head+1),fallback=category==='號誌'?active.indexOf('==== 號誌設置'):-1,raw=head<0?active.slice(Math.max(0,fallback)):active.slice(head,next<0?active.length:next);
   const paragraphs=raw.split(/\r?\n\s*\r?\n/).map(value=>value.trim()).filter(value=>/^[\u3400-\u9fff《「]/.test(value)&&/[。；]/.test(value)).map(value=>value.replace(/\r?\n/g,' ').replace(/~(?=[a-zA-Z])/g,' ').replace(/@[\w:.-]+(?:\[\])?/g,'（見相關圖例或模組）').replace(/\]\s*$/,''));
   const item={id:prefix+'-'+id,scenario:code.toLowerCase(),reg,name,category,mapAsset,asset:options.supplement||mapAsset,headline:name,locate:'對照圖例，檢視'+name+'的配置。',box:[width*.025,height*.025,width*.95,height*.95],crop:[0,0,width,height],noDefaultHighlight:true,metric:'檢核',unit:'',metricLabel:name,points,takeaway:options.takeaway||points[0],sourceRaw:raw,sourceParagraphs:paragraphs.length?paragraphs:points,...options};delete item.sourceHeading;delete item.supplement;if(item.regLabel)item.regLabel=item.regLabel.replace(/§\s*(?=\d)/g,'§ ');if(item.reference)item.reference=item.reference.replace(/§\s*(?=\d)/g,'§ ');articles.push(item);return item.id;
 };
 const config=definition({add,article,prefix,active}),catalog=require('../data/scenarios/catalog.json'),entry=catalog.scenarios.find(scene=>scene.id===code),overall=assets[config.overall],archive=conditions.scenarios[code];
 const diagram=archive.issue.images.find(image=>image.role==='diagram'),before=add('before',conditions.assets[diagram.key].file,diagram.rotation||0);
 const photos=archive.issue.images.filter(image=>image.role==='photo').map((image,index)=>{const key=add('photo-'+(index+1),conditions.assets[image.key].file,image.rotation||0),point=archive.issue.items[index%archive.issue.items.length];return {image:key,kind:'photo',title:point.title,alt:code+' 現況照片 '+(index+1),points:[point.text]};});
 const scenario={id:code.toLowerCase(),code,chapter:entry.group.toLowerCase(),name:entry.name,short:entry.short,setting:entry.name.includes('市區')?'市區':'鄉區',geometry:entry.name.includes('斜交')?'斜交':'正交',rotation:config.rotation||0,overall:config.overall,figure:code+' 圖例',contextId:prefix+'-context',overviewId:prefix+'-overview',reviewId:prefix+'-review',source:{typst,note:'依本情境章節整理；現況圖及照片沿用已歸檔的簡報素材。',sha256:hash(Buffer.from(source))},originalTypst:source,sourceLine:'資料：'+code+' 路口現況與設置建議',summary:config.summary,facts:config.facts,issues:config.issues,condition:config.condition,overviewIntro:config.overviewIntro,overviewRows:config.overviewRows,modules:config.modules,recapTitle:config.recapTitle,recapIntro:config.overviewIntro,recapRows:config.recapRows,articleIds:articles.map(item=>item.id),assets:Object.fromEntries(Object.entries(assets).map(([id,asset])=>[id,path.basename(asset.file)])),width:overall.width,height:overall.height,currentConditions:{pageId:prefix+'-conditions',before,after:config.overall,beforeOffsetY:0,textKey:prefix+'-conditions:content',photos,sourceNote:'現況圖及照片沿用本專案已歸檔的情境素材；解說依 '+typst+' 整理。',takeaway:config.condition},...(config.comparison||{})};
 const labels={'sig1.svg':'機會左轉號誌配置','sig2.svg':'保護左轉號誌配置','visibility template.svg':'上游號誌可視模板','G2-01_waiting_area1.svg':'機慢車停等區線：型式一','G2-01_waiting_area2.svg':'機慢車停等區線：型式二'};
 for(const asset of Object.values(assets))if(labels[path.basename(asset.file)])asset.label=labels[path.basename(asset.file)];
 const usedAssets=new Set([scenario.overall,before,...photos.map(photo=>photo.image),...(scenario.comparisonRows||[]).map(row=>row[0]),...articles.flatMap(item=>[item.mapAsset,item.asset])]);
 for(const key of Object.keys(assets))if(!usedAssets.has(key)){delete assets[key];delete scenario.assets[key];}
 const doc={schemaVersion:1,scenario,assets,articles};require('./general-scenario-focus.cjs').applyDefaults(doc);fs.writeFileSync(path.join(root,'data/scenarios/'+code+'.json'),JSON.stringify(doc,null,2)+'\n');return {code,articles:articles.length,images:Object.keys(assets).length};
}
const facts=(mainWidth,mainText,mainSpeed,sideWidth,sideText,sideSpeed)=>[{title:'主要道路 / 現況',width:mainWidth,description:mainText,speed:mainSpeed},{title:'次要道路 / 現況',width:sideWidth,description:sideText,speed:sideSpeed}];
const report=[];
report.push(build('G1-05','04-1-05-unsignalized-urban-skewed-t.typ',({add,article})=>{
 const overall=add('overall','G1-05_無號誌市區斜交三叉路口交通設施整體設置圖例.svg'),bay=add('bay','G1-05_臨時停車彎圖例.svg'),red=add('red','G1-05_禁止臨時停車線圖例.svg'),noParking=add('no-parking','G1-05_禁止停車.svg'),parking=add('parking','G1-05_停車處與禁止臨時停車.svg');
 const a=article('yellow-line','168','禁止停車線','標線',bay,['利用人行道退縮，安排短暫接送的臨時停車彎。','黃色禁止停車線與路面邊線一併配置，區分停車彎與行車空間。']);
 const b=article('red-line','169','禁止臨時停車線','標線',red,['路口轉彎處劃設禁止臨時停車線，保留轉彎與視距空間。','以緣石正面或頂面為原則；無緣石時，可距路面邊緣約 30 cm 標繪。','行穿線範圍內中斷紅線，避免標線重疊。']);
 const c=article('no-parking-sign','78','禁止停車標誌','標誌',noParking,['設於禁停路段起點、終點，必要時於中間增設。','以箭頭附牌說明禁停方向與範圍，並傳達禁停時段。','起終點牌面朝向來車約 45°，與禁止停車線配合。']);
 const d=article('no-stopping-sign','79','禁止臨時停車標誌','標誌',noParking,['起點、終點標誌搭配箭頭附牌，說明禁止臨時停車的路段。','牌面朝向來車約 45°；路段較長時，視需要於中間加設。','與紅線同步配置，讓限制範圍與時段更清楚。']);
 const e=article('parking-sign','118','停車處標誌','標誌',parking,['路邊停車格位旁設置停車處標誌，牌面平行行車方向。','以附牌說明收費時段、方式及金額。','起終點分別設置；格位區段較長時，可於中間增設。'],{moduleLinks:[{route:'m103-parking-diagram',label:'M1-03 路側停放與裝卸車位配置'}]});
 return {overall,summary:'住宅區斜交路口，以清楚的停讓、停車範圍與轉角人行空間，減少匯入時的辨識負擔。',facts:facts('15','雙向各 1 車道，兩側停車格及實體人行道','30','6.5','雙向共 1 車道，無人行設施','30'),issues:[['辨識主次道路','補強巷道來車提示與停讓關係。'],['分清停車與行車空間','界定路邊停放範圍，保留車道與轉角。'],['改善斜交視角與人行空間','整理路口交角、轉角與行人穿越位置。']],condition:'將停車進出、路口視距與行人穿越一起檢視。',overviewIntro:'以嵌入式停車、轉角人行道外擴及一致的禁停資訊，整理斜交路口。',overviewRows:[[a,'01　安排臨時停車空間','§168'],[b,'02　保留轉角與行穿線','§169'],[c,'03　明示禁停路段及時段','§78 / §79'],[e,'04　交代停車服務資訊','§118']],modules:['M1-01 路口動線導引','M1-03 路側停車','M2-01 停讓管制','M2-04 行向管制','M4-01 危險警示'],recapTitle:'停車有範圍，\n路口才清楚。',recapRows:[['停放與行車分開','停車彎與路面邊線共同界定空間。','§168'],['轉角保持清楚','紅線配合行穿線位置，保留轉彎及視距。','§169'],['標誌與標線同步','禁停範圍、時段及停車服務資訊一致呈現。','§78 / §79 / §118']]};
}));
report.push(build('G1-06','04-1-06-unsignalized-rural-skewed-t.typ',({add,article,prefix})=>{
 const overall=add('overall','G1-06_無號誌鄉區斜交三叉路口交通設施整體設置圖例.svg',90),lanes=add('lanes','G1-06_車道線示意圖.svg',90),slow=add('slow','G1-06_快慢車道分隔線圖例.svg',90),cross=add('crosswalk','G1-06_無號誌鄉區斜交三叉路口設置行穿線圖例.svg'),noCross=add('no-crosswalk','G1-06_無號誌鄉區斜交三叉路口不設置行穿線圖例.svg');
 const a=article('reflectors','162','反光導標及危險標記','標線',overall,['急彎與危險處配置反光導標及危險標記，補強夜間辨識。','導標類別依道路條件與單、雙向提示需求選擇。','一般設置高度距路面 1–1.3 m；利用既有護欄設置時，不低於 0.6 m。'],{table:{columns:['類別','適用方向','反光顏色'],rows:[['第一類','一般危險處順向','黃'],['第二類','一般危險處雙向','順向黃、逆向紅'],['第三類','單向匝道、山區急彎順向','黃'],['第四類','匝道、山區特殊危險急彎雙向','順向黃、逆向紅']]}});
 const b=article('lane-line','182','車道線','標線',lanes,['路口前約 30–60 m 中斷快慢車道分隔，改以混合車道銜接。','利用指向線區分直行及右轉，並以車道線交代各方向行車空間。']);
 const c=article('slow-line','183-1','快慢車道分隔線','標線',slow,['通過路口後，配合上下游車道數與寬度，逐步恢復慢車道。','以槽化線安排車道縮減，並一併檢核漸變長度。']);
 const d=article('crosswalk-line','185','枕木紋行人穿越道線','標線',cross,['次要道路有人行穿越需求時，將行穿線與路側人行空間銜接。','評估需求較低時，可採不設行穿線方案，以讓路線及分向限制線交代停讓與方向。']);
 const e=article('yield-sign','59','讓路標誌','標誌',noCross,['讓路線搭配讓路標誌，明示次要道路的讓路義務。','入口為曲線段時，將標誌移至上游容易辨識處，牌面朝向來車。']);
 const f=article('speed-sign','85','最高速限標誌','標誌',overall,['快、慢車道速限不同，且未設中央分隔島時，避免在右側堆疊複雜資訊，可用速度限制標字提示。','次要道路下游為曲線段時，速限標誌可再往下游調整至容易辨識的位置。']);
 return {overall,rotation:90,summary:'主線速限較高且設有快慢車道，透過交角調整、轉向空間與讓路提示，整理斜交匯入動線。',facts:facts('20','中央實體分隔，雙向各 1 快車道及 1 慢車道','60','6','雙向共 1 車道，無人行設施','30'),issues:[['提早辨識斜交路口','讓主線車輛察覺次要道路來車。'],['安排轉向與交織空間','避免右轉車臨時跨越慢車道，並保留左轉停等空間。'],['改善次要道路的觀察角度','將停等方向調整為接近垂直，減少斜交死角。']],condition:'交角、速差與轉向空間共同檢核，再依需求決定行穿線配置。',overviewIntro:'將次要道路交角調整至接近 90°，並在主線安排左轉與直右車道。',overviewRows:[[b,'01　整理路口前車道分工','§182'],[c,'02　銜接快慢車道與漸變','§183-1'],[d,'03　依需求安排人行穿越','§185'],[e,'04　讓路、速限與夜間導引','§59 / §85 / §162']],modules:['M1-01 路口動線導引','M2-01 停讓管制','M2-04 行向管制','M4-01 危險警示','M4-02 通行限制','M4-03 路段行為管制'],recapTitle:'先整理交角，\n再串接轉向動線。',recapRows:[['轉向車提前就位','路口前整理混合車道及轉向空間。','§182 / §183-1'],['讓路位置容易辨識','標誌配合彎道視角，並依人行需求安排穿越。','§59 / §185'],['速限及夜間提示連續','標誌位置、路面標字與導標共同檢核。','§85 / §162']],comparison:{comparisonId:prefix+'-comparison',comparisonRows:[[cross,'設置行穿線','有人行需求時，銜接兩側人行空間。','行穿線配置'],[noCross,'不設置行穿線','需求較低時，以讓路線及分向限制線說明停讓。','讓路配置']],comparisonHeadline:'依人行需求選擇，讓路關係仍須清楚。',comparisonNote:'兩種方案均保留斜交入口的觀察與讓路空間。'}};
}));
const signalLinks=topic=>[{route:'m203-signals-diagram/topic-'+topic,label:'M2-03.1 號誌化路口：'+({start:'起步可視範圍',clearance:'淨寬與淨高',visibility:'可視模板'}[topic]||'設置檢核')}];
const checkRows=[['[1] 上游可視兩燈面','通過','通過','通過'],['[2] 遠端燈面在左','通過','通過','通過'],['[2a] 遠端距停止線 ≥10 m','通過','通過','通過'],['[3] 近端提示停止線','通過','通過','通過'],['[3a] 高速時近端兩燈面','免（非高速）','免（非高速）','免（非高速）'],['[4] 12 m 視覺漏洞','通過','通過','通過'],['[5] 起步可視範圍','通過','通過','通過'],['[6] 淨寬','通過','通過','通過'],['[7] 淨高','通過','通過','通過'],['[8] 眩光與背景','通過','通過','現地檢查'],['[9] 斜交防窺','免（非斜交）','免（非斜交）','免（非斜交）']];
report.push(build('G2-01','04-2-01-signalized-urban-orthogonal-t.typ',({add,article})=>{
 const overall=add('overall','G2-01_號誌化市區正交三叉路口交通設施整體設置圖例.svg'),wait1=add('waiting-1','G2-01_waiting_area1.svg'),wait2=add('waiting-2','G2-01_waiting_area2.svg',180),sig1=add('signal-1','sig1.svg'),sig2=add('signal-2','sig2.svg'),visible=add('visibility','visibility template.svg',90),offset=add('left-offset','G2-01_遠端號誌燈桿立於車行道左方之向左錯距示意圖.png'),offsetCheck=add('left-check','G2-01_向左錯距佈設檢查圖例.png'),distance=add('distance','G2-01_縱向佈設檢查圖例.png');
 const a=article('waiting','174-2','機慢車停等區線','標線',wait1,['設於速限 60 km/h 以下的號誌化路口，位在停止線後方。','縱深 2.5–6 m；橫向線寬 20 cm，縱向線寬 10 或 15 cm。','區內繪設縮小型指向線，部分邊線可與相鄰實線共用。'],{supplement:wait2});
 const b=article('permissive','201','機會左轉配置','號誌',sig1,['依轉向交通型態選擇機會左轉，使用三燈式號誌。','與附加車道、行穿線及行人號誌位置一起配置。','近端及遠端燈面分工，兼顧停止線提示與通過路口的燈號確認。'],{sourceHeading:'檢查表第\\[1\\]項'});
 const c=article('protected','201','保護左轉配置','號誌',sig2,['採保護左轉時，使用含直行及左轉箭頭的四燈式號誌。','依左轉車流與時相需求選擇配置，並逐項檢核各方向。'],{sourceHeading:'檢查表第\\[1\\]項'});
 article('checklist','221','號誌設置檢核總表','號誌',sig1,['依行車方向分別檢核，避免只檢查單一燈面。','此表彙整本案例檢核結果；西向眩光仍需現地確認。'],{reference:'《設置規則》號誌條文 /《交工規範》§5.6',table:{columns:['檢核項目','南下2','北上8','西行5'],rows:checkRows}});
 const d=article('visible','201','上游兩燈面可視檢查','號誌',visible,['依接近速率選擇可視模板，檢查行進中的視域。','本例以 55 km/h 以下模板檢核南下方向，確認能辨認燈面 2.1、2.2。'],{regLabel:'[1] §201',sourceHeading:'檢查表第\\[1\\]項',moduleLinks:signalLinks('visibility')});
 article('left','221','遠端燈面在左','號誌',offset,['以近端與遠端綠燈鏡面邊緣量測向左錯距，而非只看立桿位置。','遠端立桿位於左側或採門架式時，至少一燈面不得偏到近端右方。','遠端立桿位於右側時，建議向左錯距大於 90 cm；柱立式則於兩側配置。'],{regLabel:'[2] §221',sourceHeading:'檢查表第\\[2\\]項',supplement:offsetCheck});
 article('far','221','遠端縱向距離','號誌',distance,['遠端燈面距近端停止線至少 10 m。','本例南下方向量得約 28 m，符合示例的距離檢核。'],{regLabel:'[2a] §221',sourceHeading:'檢查表第\\[2a\\]項'});
 article('near','221','近端提示停止線','號誌',sig1,['近端至少一組燈面，協助駕駛辨認停止位置。','近端與遠端共同提供接近、停等、起步及通過路口的燈號資訊。'],{regLabel:'[3] §221',sourceHeading:'檢查表第\\[3\\]項'});
 article('gap','5.6','12 m 視覺漏洞','號誌',visible,['沿行車方向檢查同向燈面的橫向間隔。','間距超過 12 m 時，應考慮增設燈面；本例未出現此寬度的空隙。'],{regLabel:'[4] 規範',reference:'《交工規範》§5.6',sourceHeading:'檢查表第\\[4\\]項'});
 article('start','221','起步可視範圍','號誌',sig1,['由停止線前第一輛車或兩段式待轉車輛的視點檢核。','配合罩簷型式使用起步可視模板，確認綠燈能被辨識。'],{regLabel:'[5] §221',sourceHeading:'檢查表第\\[5\\]項',moduleLinks:signalLinks('start')});
 article('clearance','220','淨寬與淨高','號誌',sig1,['燈箱、桿柱及附屬部件均納入淨寬檢查；示例以距車道邊緣至少 0.30 m 檢核。','車行道上方燈箱高出路面 4.6–5.6 m；人行道上方柱立式燈箱為 2.4–4.6 m。'],{regLabel:'[6–7] §220',sourceHeading:'檢查表第\\[6\\]項',moduleLinks:signalLinks('clearance')});
 const e=article('pedestrian','231','行人專用號誌','號誌',sig1,['配合行穿線及實際等候位置設置，使行人可以直視燈面。','與行車號誌位置相近時可共桿，仍需保留清楚的行人指示。'],{sourceHeading:'「行人專用號誌」之佈設',moduleLinks:[{route:'m301-crossing-diagram',label:'M3-01.2 路口穿越'}]});
 return {overall,summary:'商業區人車活動密集，將左轉空間、路側使用與號誌可視性一起安排。',facts:facts('20','標線分隔，兩側停車格及實體人行道','50','14','雙向各 1 車道，兩側停車格、無人行設施','50'),issues:[['轉向停等影響直行','接近路口時缺少清楚的左、右轉空間。'],['速限提示不連續','立桿空間及短街廓影響速限資訊。'],['行人不易直視號誌','行穿線位置與共桿號誌未妥善對應。']],condition:'車道平衡、行人通行與號誌可視性同步檢核。',overviewIntro:'主線配置左轉車道並禁止路邊停車；次要道路以 40 km/h 及嵌入式停車配合人行道外擴。號誌依轉向需求選擇佈設法。',overviewRows:[[a,'01　安排機慢車停等空間','§174-2'],[b,'02　比較機會及保護左轉','§201'],[d,'03　逐項檢核號誌可視性','§201 / §220 / §221'],[e,'04　對應行穿線與行人號誌','§231']],modules:['M1-01 路口動線導引','M1-03 路側停車','M2-03 號誌化管制','M3-01 行人','M3-03 機車'],recapTitle:'車道與號誌，\n一起說明動線。',recapRows:[['車道分工清楚','左轉與機慢車停等空間配合配置。','§174-2 / §201'],['號誌看得到也看得懂','由上游辨識、遠端位置到起步視角逐項檢查。','§201 / §220 / §221'],['行人指示對應穿越','依行穿線與等候位置安排燈面。','§231']]};
}));
report.push(build('G2-02','04-2-02-signalized-rural-orthogonal-t.typ',({add,article})=>{
 const overall=add('overall','G2-02_號誌化鄉區正交三叉路口交通設施整體設置圖例.svg'),center=add('centerline','G2-02_分向限制線設置圖例-無中央分隔島.svg'),street=add('street','G2-02_路名標誌設置圖例.svg'),signals=add('signals','G2-02_號誌化鄉區正交三叉路口號誌平面設置圖例.svg'),glare=add('glare','G2-02_柱立式與懸臂式號誌共存之設置圖例.png');
 const a=article('center','165','分向限制線','標線',center,['路段不允許迴轉及跨越超車，且車道寬度達 6 m 以上時，以雙黃線區分雙向車流。','本例雙黃線線寬及間隔均為 10 cm。']);
 const b=article('street-name','99','路名標誌','標誌',street,['有分向島時，可設於島上，並與路燈桿或號誌桿共桿。','以近端為原則，視需要在遠端補設；無分向島時，設於右側適當位置。']);
 const c=article('signal-plan','221','號誌平面配置','號誌',signals,['主線及次要道路各方向分別檢查近端、遠端與上游可視性。','共同檢核項目沿用市區案例；本例另著重東西向眩光與行人通行。'],{moduleLinks:[{page:'g201-checklist',label:'G2-01 號誌設置檢核總表'},{route:'m203-signals-diagram',label:'M2-03.1 號誌化路口'}]});
 const d=article('glare','221','眩光與背景干擾','號誌',glare,['東西向號誌可能受陽光直射或鏡面反光影響，需現地確認。','近端柱立式與懸臂式燈面可採不同角度配置，讓駕駛仍能清楚辨認燈號。'],{regLabel:'[8] §221',sourceHeading:'檢查表第\\[8\\]項'});
 const e=article('pedestrians','206','未設行人專用號誌時','號誌',signals,['行人稀少而免設行人專用號誌時，仍需提供合法的行人穿越燈號。','本例北上雖無機動車流，燈面 8.1 仍須保留；南北向採圓形綠燈，不只使用左右轉箭頭。','北側入口搭配左右轉通行標誌；遵行與禁制標誌緊鄰號誌燈面，需要時依第 228 條增設行人號誌。'],{sourceHeading:'不設行人專用號誌之考量',moduleLinks:[{route:'m301-crossing-diagram',label:'M3-01.2 路口穿越'}]});
 const rows=checkRows.map(row=>[...row]);rows[9]=['[8] 眩光與背景','通過','現地檢查','現地檢查'];
 article('checklist','221','各方向號誌檢核','號誌',signals,['南下、西行及東行分別確認各項配置。','西行與東行方向的陽光影響需現地檢查；其餘共同檢核可對照市區案例。'],{table:{columns:['檢核項目','南下2','西行5','東行11'],rows},moduleLinks:[{page:'g201-checklist',label:'G2-01 檢核操作說明'}]});
 return {overall,summary:'工廠與未開發地區仍有步行及路側活動，需整理人行預留空間、速限與號誌辨識。',facts:facts('14','雙向各 1 混合車道，無人行設施','30','10','雙向各 1 混合車道，無人行設施','30'),issues:[['速限提示不足','狹窄路幅與低交通量不應省略速度資訊。'],['號誌融入背景','樹叢與光線可能降低燈面辨識度。'],['行人需求與設施更新','檢視工廠周邊步行需求，並同步更新標誌標線。']],condition:'鄉區路口仍需兼顧人行需求、各方向燈號及眩光。',overviewIntro:'先界定車行道並保留路側人行空間，配合路口預告及逐方向號誌檢核。',overviewRows:[[a,'01　區分雙向車流','§165'],[b,'02　安排路名資訊','§99'],[c,'03　檢核號誌與眩光','§201 / §220 / §221'],[e,'04　確保行人穿越燈號','§206 / §228']],modules:['M1-01 路口動線導引','M2-03 號誌化管制','M3-01 行人'],recapTitle:'鄉區也要，\n清楚的人車指示。',recapRows:[['先界定車行空間','雙向標線與路側預留空間共同配置。','§165'],['各方向燈面分別檢查','東西向尤其留意陽光及背景干擾。','§201 / §220 / §221'],['免設行人號誌仍有條件','保留行人合法穿越所需的燈號與指示。','§206 / §228']]};
}));
report.push(...require('./general-scenario-remaining-content.cjs')({build,facts}));
console.log(JSON.stringify(report));
