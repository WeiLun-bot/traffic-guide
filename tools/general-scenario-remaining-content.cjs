'use strict';
// Presentation copy for the remaining supplied chapters. Facility articles use
// the whole layout; only signal checks and genuine alternatives need other art.
const moduleCatalog=require('../data/modules/catalog.json');
const checkLabels=['[1] 上游可視兩燈面','[2] 遠端燈面在左','[2a] 遠端距停止線 ≥10 m','[3] 近端提示停止線','[3a] 高速近端兩燈面','[4] 12 m 視覺漏洞','[5] 起步可視範圍','[6] 淨寬','[7] 淨高','[8] 眩光與背景','[9] 斜交防誤認'];
function cells(text){
  const result=[];let depth=0,start=0;
  for(let i=0;i<text.length;i++){
    if(text[i]==='\\'){i++;continue;}
    if(text[i]==='['){if(!depth)start=i+1;depth++;}
    else if(text[i]===']'&&depth&&!--depth)result.push(text.slice(start,i));
  }
  return result;
}
function checklist(active){
  const tables=[];
  for(const match of active.matchAll(/\btable\([\s\S]*?kind:\s*table/g)){
    const direction=match[0].match(/行車方向\s*[:：]([^\]\n]+)/)?.[1];if(!direction)continue;
    const parts=cells(match[0]),rows=[];
    for(let i=0;i<parts.length;i++)if(/^\\\[\d+a?\\\]/.test(parts[i].trim()))rows.push({status:parts[i+1].replace(/\s+/g,''),explanation:parts[i+2].replace(/\s+/g,' ').trim()});
    if(rows.length!==11)throw new Error('Expected eleven signal checks: '+direction);
    tables.push({direction:direction.replace(/（[^）]*）/g,'').replace(/\s+/g,'').replace(/\/編號[:：]/,''),rows});
  }
  if(!tables.length)throw new Error('Signal checklist is missing');
  return {columns:['檢核項目',...tables.map(table=>table.direction)],rows:checkLabels.map((label,i)=>[label,...tables.map(table=>table.rows[i].status)]),sourceDirections:tables};
}
const commonChecks=[{page:'g201-checklist',label:'共同號誌檢核'},{page:'g202-glare',label:'眩光與背景干擾'},{route:'m203-signals-diagram',label:'M2-03.1 號誌化路口'}];
module.exports=function({build,facts}){
 const reports=[];
 function make(code,typst,recipe){reports.push(build(code,typst,ctx=>{
   const file=ctx.active.match(/image\(\s*"[^"\n]+\/([^"\n]+交通設施整體設置圖例\.svg)"/)?.[1];if(!file)throw new Error('Missing full layout: '+code);
   const rotation=['G3-02','G4-02','G4-04'].includes(code)?90:0,overall=ctx.add('overall',file,rotation),topics=[];
   const topic=(id,reg,name,category,points,options={})=>{const {map=overall,...rest}=options,ref=rest.regLabel||'§ '+reg,key=ctx.article(id,reg,name,category,map,points,rest);topics.push({key,name,points,ref});return key;};
   const row=(id,label,ref)=>[id,label,ref||topics.find(topic=>topic.key===id).ref];
   const diagram=(id,name,rotation=0)=>ctx.add(id,name.startsWith(code)||/^[a-z]/i.test(name)?name:code+'_'+name,rotation);
   const signalChecks=(map,points)=>topic('checklist','221','各方向號誌檢核','號誌',points,{map,reference:'《設置規則》號誌條文 /《交工規範》§ 5.6',table:checklist(ctx.active),moduleLinks:commonChecks});
   const result=recipe({...ctx,overall,topic,row,diagram,signalChecks});
   const modules=[...new Set(ctx.active.match(/M[1-4]-\d{2}/g)||[])].map(id=>{const entry=moduleCatalog.modules.find(module=>module.id===id);return id+(entry?' '+entry.name:'');});
   return {overall,rotation,condition:result.overviewIntro,modules,recapIntro:result.overviewIntro,recapTitle:result.recapTitle||'把道路動線，\n連成清楚的配置。',recapRows:result.overviewRows.slice(0,3).map(([key,title,ref])=>[title.replace(/^\d+\s*/,''),topics.find(topic=>topic.key===key).points[0],ref]),...result};
 }));}

 make('G2-03','04-2-03-signalized-urban-skewed-t.typ',({overall,topic,row,diagram,signalChecks})=>{
   const channel=topic('channel','171','槽化線','標線',['路口前以交通島提供行人庇護，其餘寬度不足的路段以槽化線銜接。','斜紋方向應能引導誤入車輛回到正確車道。']);
   const bike=topic('bicycle-crossing','186-1','自行車穿越道線','標線',['自行車穿越道銜接自行車道，並與行人穿越道並列。','有左轉需求時，經自行車專用道續行，再於停等區待轉。']);
   topic('lane-warning','28','車道、路寬縮減標誌','標誌',['在車道縮減處上游預告，建議距路口至少 30 m，並依速限及視距增加。','可搭配距離及左道終止附牌，讓駕駛提早選道。']);
   const speed=topic('speed','85','最高速限標誌','標誌',['由 60 km/h 降至 50 km/h 的路段，在速限改變地點前 70–100 m 提前預告。','讓車輛在進入路口前完成降速，並使標誌與路面標字一致。']);
   const plan=diagram('signals','號誌化市區斜交三叉路口號誌平面設置圖例.svg');
   topic('signal-plan','201','斜交路口號誌配置','號誌',['寬闊斜交路口各方向增設近端柱立式號誌，補足上游兩燈面辨識。','西行左轉待轉區另設左轉專用號誌，並清楚標示適用對象。'],{map:plan});
   const left=diagram('left-signal','左轉專用號誌加設附牌範例.svg');
   topic('left-signal','214','左轉專用號誌與附牌','號誌',['停等於左轉待轉區時，需能看見對應的左轉專用號誌。','附牌用來說明號誌適用對象，黃燈及紅燈階段也要清楚。'],{map:left,sourceHeading:'燈面6：'});
   for(const [n,direction,rotation]of [[1,'南下',90],[2,'西行',0],[3,'東行',0]])topic('visible-'+n,'201',direction+'方向可視檢核','號誌',['由上游接近路口，確認能同時辨認兩個顯示相同燈號的燈面。',direction==='東行'?'東行方向以高速可視模板檢核。':'依接近速率選用相應可視模板，必要時加設近端燈面。'],{map:diagram('visible-'+n,'號誌化市區斜交三叉路口之可視模板（'+n+'）.svg',rotation),regLabel:'[1] § 201',sourceHeading:'檢查表第\\[1\\]項'});
   const privacy=topic('privacy','201','斜交號誌防誤認','號誌',['燈面 2.3、5.3 可能被其他方向誤認，須處理燈面可見範圍。','可採特長筒式罩簷、垂直百葉窗或偏光方式，讓各方向只辨認自己的燈號。'],{map:diagram('privacy','新竹市特長筒式罩簷（民間俗稱砲筒）.png'),regLabel:'[9] § 201',sourceHeading:'檢查表第\\[9\\]項'});
   signalChecks(plan,['南下、西行、東行逐方向檢查，避免只看單一燈面。','南下與西行需防誤認；三個方向均需現地確認眩光及背景。']);
   return {summary:'商業區寬闊斜交路口，同時整理車道平衡、行人庇護與號誌辨識。',facts:facts('24','中央實體分隔，雙向各 3 車道，無人行設施','60','22','中央實體分隔，南側停車格，無人行設施','50'),issues:[['車道進出不平衡','調整槽化及轉向空間，讓上下游車道銜接。'],['行人穿越距離長','以庇護島提供分段穿越的停等空間。'],['速限與號誌容易混淆','統一降速位置，並避免斜交方向誤看燈號。']],overviewIntro:'以槽化整理各方向動線，配置行人庇護島，再逐方向檢核號誌。',overviewRows:[row(channel,'01　整理槽化與車道平衡'),row(bike,'02　銜接行人與自行車穿越'),row(speed,'03　提前完成速限轉換'),row(privacy,'04　補足可視並防止誤看燈號')],recapTitle:'斜交路口，\n先把各方向說清楚。'};
 });

 make('G2-04','04-2-04-signalized-rural-skewed-t.typ',({topic,row,diagram,signalChecks})=>{
   const sidewalk=topic('sidewalk','174-3','人行道標線','標線',['保留行人通行及等候穿越的空間，並配合將示例速限調整為 30 km/h。','轉角線形須檢核設計車種的最小轉彎軌跡。']);
   const bend=topic('bend','24','彎路標誌','標誌',['依設計速率檢查曲線半徑及安全停車視距。','建議於彎道起點前約 30 m 預告，再依速限及視距增加。'],{table:{columns:['設計速率（km/h）','平曲線半徑（m）','安全停車視距（m）'],rows:[[25,20,30],[30,30,35],[40,50,50],[50,80,65],[60,120,85],[70,170,105],[80,230,130],[90,300,160],[100,390,185],[110,500,220],[120,620,250]].map(row=>row.map(String))}});
   const warning=topic('signal-warning','33','注意號誌標誌','標誌',['彎道或遮蔽使號誌不易辨認時，在彎道前提早預告。','示例建議距路口約 30 m，並配合實際速率及可視距離調整。']);
   const trajectory=topic('trajectory','1.5','轉彎軌跡與停止位置','道路設施',['先檢查各方向轉彎軌跡，再決定停止線及立桿位置。','狹窄路口仍要保留行人等候空間。'],{map:diagram('trajectory','G2-04軌跡圖.svg'),reference:'《公路路線設計規範》§ 1.5',regLabel:'軌跡檢核'});
   const plan=diagram('signals','號誌化鄉區斜交三叉路口號誌平面設置圖例.svg');
   topic('signal-plan','221','狹窄斜交路口號誌配置','號誌',['檢查彎道中的車輛能否辨認號誌，必要時增設或調整燈面。','丁字頂端有車輛進出需求時，仍須提供對應號誌。'],{map:plan});
   topic('recognition-distance','201','彎道號誌辨認距離','號誌',['彎道中的視線朝向彎道末端，不能直接套用直線路段的可視模板。','先設法滿足辨認距離，再評估注意號誌標誌；預告位置另考量約 2 秒反應距離。'],{map:plan,regLabel:'[1] § 201',sourceHeading:'檢查表第\\[1\\]項',table:{columns:['行車速限（km/h）','辨認距離（m）'],rows:[[30,30],[40,50],[50,80],[60,110],[70,140],[80,170],[90,200],[100,220]].map(row=>row.map(String))}});
   for(const [n,name,text]of [[1,'近端號誌同在右側','比較彎道中第一次可見兩燈面的位置，並檢查預告距離。'],[2,'近端號誌改設左側','比較移至左側後的辨認距離與立桿條件。'],[3,'右側號誌加左側柱立式','示例建議採用，以左側燈面提供較遠的辨認距離。']])topic('curve-option-'+n,'201','彎道方案 '+n+'：'+name,'號誌',[text,'三個方案均需同時檢查停止線、視距及注意號誌預告位置。'],{map:diagram('curve-option-'+n,'option'+n+'.svg'),regLabel:'[1] § 201',sourceHeading:'檢查表第\\[1\\]項'});
   topic('near-alternative','221','近端立桿受限的替選方案','號誌',['避免橫向大車通過時遮住唯一的號誌。','可與公共設施共桿，或從合適位置斜向延伸橫桿，保留近端提示。'],{map:diagram('near-alternative','號誌化鄉區斜交三叉路口號誌平面設置圖例替選方案2.svg'),supplement:diagram('near-simulation','替選方案2近端懸臂式號誌模擬示意圖.png'),sourceHeading:'檢查表第\\[3\\]項'});
   topic('far-post','221','遠端採柱立式時','號誌',['無法設置懸臂式號誌時，檢查遠端兩側配置。','柱立式應有兩燈面分設於遠端兩側，並仍須確認起步與接近可視性。'],{map:diagram('far-post','遠端號誌若採用柱立式號誌示意.png'),sourceHeading:'檢查表第\\[3\\]項'});
   signalChecks(plan,['西行以彎道停車視距檢核並設注意號誌標誌。','北上、東行另確認近端、遠端與起步視角；眩光均需現地檢查。']);
   return {summary:'聚落旁的彎道斜交路口，優先保留行人停等空間，並讓號誌提早被看見。',facts:facts('10','雙向各 1 混合車道，無停車管制及人行設施','40','10','雙向各 1 混合車道，無停車管制及人行設施','30'),issues:[['行人缺少等候位置','道路兩側需保留通行與等候穿越空間。'],['彎道不易看見號誌','連同停止線、立桿位置及預告標誌一起檢查。'],['速限與道路資訊不足','配合路側活動補強速限及路名提示。']],overviewIntro:'留設標線型人行道並降速，配合彎道預告與號誌立桿替選方案。',overviewRows:[row(sidewalk,'01　保留行人通行與停等空間'),row(warning,'02　彎道前提前預告號誌'),row(trajectory,'03　依轉彎軌跡決定停止位置'),row(bend,'04　以速率與視距檢核彎道')],recapTitle:'彎道號誌，\n提早辨識才來得及。'};
 });

 make('G3-01','04-3-01-unsignalized-urban-orthogonal-cross.typ',({topic,row})=>{
   const guide=topic('guide','189','路口行車導引線','標線',['以略為橫移的路口車道配置，提醒車輛減速至 30 km/h 以下。','繪設導引線銜接主要道路直行車道，清楚宣示主要車流方向。']);
   const layout=topic('staggered-layout','配置','交錯車道與路側停車','道路設施',['將路側停車格單邊交錯配置，並明確區分停車及行車空間。','車道橫移配合行穿線及路側活動，提高路口與行人的可見度。'],{reference:'本情境整體佈設原則',regLabel:'佈設原則',sourceHeading:'路型議題分析'});
   return {summary:'住宅區的無號誌四岔路口，以交錯車道、停車配置與導引線建立低速環境。',facts:facts('15','雙向各 1 混合車道，兩側停車格及實體人行道','30','8','雙向共 1 混合車道，北側路段有停車格，無人行設施','30'),issues:[['主次道路不易辨識','缺少路口與先行權提示。'],['停車與行車空間混用','路側停車需求與車道邊界需共同整理。'],['行人與速限提示不足','短街廓中仍需清楚表達低速及穿越需求。']],overviewIntro:'以 30 km/h 低速區概念，交錯配置車道及停車格，再以導引線串接路口。',overviewRows:[row(layout,'01　交錯配置車道與停車空間'),row(guide,'02　引導主要道路車流'),row(layout,'03　讓行穿線與行人被看見','行人安全')],recapTitle:'住宅區路口，\n用配置帶出低速。'};
 });

 make('G3-02','04-3-02-unsignalized-rural-orthogonal-cross.typ',({overall,topic,row,diagram,prefix})=>{
   const channel=topic('channel','171','槽化線','標線',['在主要道路接近路口處配置類滴狀島的槽化區，提醒前方交岔。','槽化斜紋方向需能把誤入車輛引回原行駛動線。']);
   topic('center','181','行車分向線','標線',['劃分雙向車道，提示靠右行駛。','同時檢查路口兩側自行車道及混合車道的銜接。']);
   const edge=topic('edge','183','路面邊線','標線',['依中心線、車道數及車道寬決定路肩，最後以路面邊線界定。','路肩寬度配合道路類型，依相應設計規範檢核。']);
   const crossing=topic('crosswalk','185','枕木紋行人穿越道線','標線',['次要道路有穿越需求時，配置行穿線並銜接路側人行空間。','需求較低時，可採不設行穿線方案，保留讓路線及路口行車導引線。']);
   const warning=topic('junction-warning','30','岔路標誌','標誌',['主要道路未設慢行或當心行人標誌時，可設岔路標誌預告。','建議距路口約 30 m，並依速限與視距增加；必要時於路口附近再次提示。']);
   const cross=diagram('crosswalk-option','無號誌鄉區正交四叉路口設置行穿線圖例.png'),noCross=diagram('no-crosswalk-option','無號誌鄉區正交四叉路口不設置行穿線圖例.png');
   return {rotation:90,summary:'農田與聚落旁的無號誌四岔路口，以槽化、邊線與預告提高路口辨識。',facts:facts('10','雙向各 1 混合車道，路肩小於 1 m，無人行設施','50','5','東側混合車道，西側另有自行車道，無人行設施','30'),issues:[['路口管制提示不足','缺少橫交車流與主次道路提示。'],['車道及自行車空間不連續','路口兩側的寬度與車道配置需銜接。'],['速限資訊不足','補強主次道路速度提示。']],overviewIntro:'主要道路以類滴狀島槽化提高辨識，並依行人需求選擇穿越配置。',overviewRows:[row(channel,'01　槽化提示前方路口'),row(edge,'02　界定車道與路肩'),row(crossing,'03　依需求安排穿越'),row(warning,'04　提前預告橫交道路')],comparison:{comparisonId:prefix+'-comparison',comparisonRows:[[cross,'設置行穿線','有人行需求時，銜接次要道路兩側空間。','行穿線方案'],[noCross,'不設置行穿線','需求較低時，以讓路線及導引線交代停讓。','讓路方案']],comparisonHeadline:'依穿越需求選擇，停讓關係都要清楚。',comparisonNote:'兩方案皆需檢核路側環境及通過路口的行車路徑。',comparisonSourceLine:'資料：G3-02 枕木紋行人穿越道線運用解說。'}};
 });

 make('G3-03','04-3-03-unsignalized-urban-skewed-cross.typ',({topic,row})=>{
   const cross=topic('crosswalk','185','枕木紋行人穿越道線','標線',['主要道路配置行穿線，並於上游設停止線，提醒停讓行人。','本例槽化線僅作車流分隔，不能當作行人庇護空間。']);
   const sidewalk=topic('sidewalk','16','連續實體人行道','道路設施',['人行道連續穿越次要道路，以高差形成減速平台。','以不同鋪面凸顯人行空間，並依減速平台規範檢核設計。'],{reference:'《市區道路及附屬工程設計標準》§ 16',regLabel:'標準 § 16',sourceHeading:'實體人行道'});
   const hump=topic('hump-warning','38','路面高突標誌','標誌',['減速平台前以路面高突標誌提醒減速。','建議於高突地點前約 30 m 預告，並依速限及視距增加。']);
   return {summary:'住宅區斜交四岔路口，以連續人行道及減速平台，強化主要道路與行人空間。',facts:facts('15','雙向各 1 混合車道，兩側停車格及實體人行道','30','8','雙向共 1 混合車道，無停車管制及人行設施','30'),issues:[['主次道路關係不清楚','以人行道連續性及停車再開配置加強辨識。'],['停車與行車界線不清楚','明確劃分路側停車與車流空間。'],['行人與速限提示不足','低速配置配合穿越警示。']],overviewIntro:'延續主要道路人行道，形成次要道路減速平台，並以標誌及停止線提示。',overviewRows:[row(sidewalk,'01　延續人行道與減速平台'),row(cross,'02　明示行人穿越與停讓'),row(hump,'03　提前預告路面高差')],recapTitle:'人行道連續，\n主次關係更清楚。'};
 });

 make('G3-04','04-3-04-unsignalized-rural-skewed-cross.typ',({topic,row,diagram,prefix})=>{
   const stop=topic('stopline','170','停止線','標線',['停止線原則與橫交道路平行，配合觀察及轉彎軌跡決定位置。','斜交多車道路口可採鋸齒狀；需配合號誌位置時，也可設於同一斷面。']);
   const edge=topic('edge','183','路面邊線','標線',['路口最外側導引線銜接路面邊線，指引主線直行與支線停讓觀察。','轉角未設人行道標線時，以槽化整理路肩，並滿足視距三角淨空與轉彎軌跡。']);
   const cross=topic('crosswalk','185','枕木紋行人穿越道線','標線',['主、次要道路有人行需求時，配置行穿線及人行道標線。','需求較低時，仍保留停止線、停標字及雙向槽化。']);
   const weight=topic('weight','81','車輛總重限制標誌','標誌',['橋梁限重前提早告知，讓超重車輛有機會繞道或迴車。','本例於路口上游配置標誌，搭配前方橋梁限重附牌。']);
   const withCross=diagram('crosswalk-option','無號誌鄉區斜交四叉路口設置行穿線圖例.jpg'),without=diagram('no-crosswalk-option','無號誌鄉區斜交四叉路口不設置行穿線圖例.png');
   return {summary:'零散聚落旁的斜交四岔路口，整理停讓觀察位置、路側空間及橋梁限重預告。',facts:facts('8','雙向各 1 混合車道，無人行設施及停車管制','50','6','東側共 1 混合車道，西側雙向各 1 車道，無人行設施','30'),issues:[['主次道路管制不清楚','以停讓及槽化提示路口優先關係。'],['速限資訊不足','配合路口減速需求補強提示。'],['斜交與路側空間影響觀察','一起檢查停止位置、轉角及淨空。']],overviewIntro:'以次要道路槽化提高辨識，配置適當停止位置，並於路口前預告橋梁限重。',overviewRows:[row(stop,'01　確定停讓觀察位置'),row(edge,'02　整理轉角與行車邊界'),row(cross,'03　依人行需求選擇穿越方案'),row(weight,'04　讓限重車輛提早繞道')],comparison:{comparisonId:prefix+'-comparison',comparisonRows:[[withCross,'設置行穿線','有人行需求時，配合人行道標線安排穿越。','行穿線方案'],[without,'不設置行穿線','需求較低時，保留停止線、停標字及槽化。','停讓方案']],comparisonHeadline:'是否設行穿線，都要保留清楚的停讓配置。',comparisonNote:'停止位置仍須配合斜交觀察與轉彎軌跡。',comparisonSourceLine:'資料：G3-04 枕木紋行人穿越道線運用解說。'}};
 });

 make('G4-01','04-4-01-signalized-urban-orthogonal-cross.typ',({topic,row,diagram,signalChecks})=>{
   const left=topic('left-waiting','184','左彎待轉區線','標線',['待轉區距中心不得少於 3 m，並確認不影響對向直行及左轉路徑。','配置左彎待轉區線的車行道，不再疊設機慢車停等區。']);
   const cross=topic('crosswalk','185','錯開型行人穿越道','標線',['以錯開型行穿線及中央庇護空間，保留轉彎車停讓行人的位置。','停止線與行穿線法定距離為 1–3 m，示例建議優先採 2–3 m，再依軌跡及能見度調整。']);
   const dotted=topic('dotted','189-1','穿越虛線','標線',['路段兩車道銜接路口四車道時，導引轉向車流匯出至附加車道。','讓直行路徑延續，轉彎車輛提前分流。']);
   topic('bus-bay','10.1','公車停靠站','道路設施',['公車彎入口以穿越虛線引導公車進站，其餘車流維持前行。','停靠站與路邊停車帶配合道路類型，依相應設計規範檢核。'],{reference:'《市區道路及附屬工程設計規範》§ 10.1',regLabel:'規範 § 10.1'});
   topic('parking','118','停車處標誌','標誌',['路外停車場入口附近設置標誌，面向來車方向。','必要時以附牌告知收費、車種等資訊。']);
   topic('lane-advance','133-1','車道預告標誌','標誌',['建議設於車道配置漸變起點，讓駕駛提早選道。','符合機車直接左轉條件時，可搭配告示牌，並確認各轉向接收車道。']);
   const plan=diagram('signals','號誌化市區正交四叉路口號誌平面設置圖例.svg');
   topic('signal-plan','201','五燈式號誌配置','號誌',['主、次要道路採五燈式配置，配合行人與轉向車流的時相安排。','次要道路因橫跨寬闊主線，近端補設柱立式號誌。'],{map:plan});
   topic('visibility','201','次要道路可視檢核','號誌',['以 55 km/h 以下可視模板檢查上游辨識。','南下 2.2、北上 8.2 增設近端柱立式燈面，補足同時看見兩燈面的需求。'],{map:diagram('visibility','號誌化市區正交四叉路口之可視模板.svg'),supplement:diagram('signal-position','號誌設置位置檢視圖1.png'),sourceHeading:'檢查表第\\[1\\]項',regLabel:'[1] § 201'});
   const phase=topic('phase-two','時相','兩車道輪放配置','號誌',['中央分隔提供兩段行人穿越，再搭配次要道路輪放，可設計人車無衝突時相。','各轉向接收端有足夠車道時，可增加共用車道，提高車道利用效率。'],{map:diagram('phase-two','兩車道之輪放時制應用原則.png'),reference:'人車無衝突時相與建議車道配置',regLabel:'時相規劃',sourceHeading:'時相規劃與建議車道配置'});
   topic('phase-three','時相','三車道輪放配置','號誌',['三個相鄰車道採輪放時，同樣先確保人車無衝突。','各轉向接收端車道足夠，且不互相阻擋時，再配置共用車道。'],{map:diagram('phase-three','三車道之輪放時制應用原則.png'),reference:'人車無衝突時相與建議車道配置',regLabel:'時相規劃',sourceHeading:'時相規劃與建議車道配置'});
   signalChecks(plan,['南下、北上需近端柱立式號誌，東西向另檢查眩光。','檢核結論配合各方向實際配置，不能只按近、遠端數量判斷。']);
   return {summary:'商業區寬闊四岔路口，以附加轉彎車道、行人庇護與時相設計整理人車動線。',facts:facts('40','中央實體分隔，共 7 車道，兩側實體人行道及汽機車停車格','50','24','標線分隔，共 3 車道，兩側實體人行道及停車格','50'),issues:[['左轉與直行互相干擾','以附加車道及漸變延續直行路徑。'],['行人穿越距離長','提供中央庇護與分段穿越。'],['預告與號誌配置不足','車道變化提前告知，並逐方向確認可視性。']],overviewIntro:'路段保留直行車道，路口以附加車道分流轉向，再搭配庇護島與無衝突時相。',overviewRows:[row(dotted,'01　以附加車道分流轉向'),row(left,'02　整理左轉停等位置'),row(cross,'03　配置錯開型行穿線與庇護'),row(phase,'04　整合輪放時相與車道用途')],recapTitle:'車道、庇護與時相，\n一起解決人車衝突。'};
 });

 make('G4-02','04-4-02-signalized-rural-orthogonal-cross.typ',({topic,row,diagram,signalChecks})=>{
   const waiting=topic('waiting','174-2','機慢車停等區線','標線',['設於速限 60 km/h 以下的號誌化路口停止線後方。','縱深 2.5–6 m，橫向線寬 20 cm、縱向 10 或 15 cm，區內繪設縮小型指向線。']);
   const turn=topic('two-stage-area','191','機慢車左（右）轉待轉區線','標線',['配置於停止線前端；與行穿線邊緣保留至少 50 cm 間隔。','不得侵入交叉口實體範圍，並需檢核等待時可見燈號。']);
   topic('two-stage-sign','65','機慢車兩段左轉標誌','標誌',['配合幾何條件與事故情形選擇兩段左轉，於近端明示管制。','示例建議可在上游約 80 m 預告，必要時於遠端右側補設。']);
   topic('no-uturn','75','禁止迴車標誌','標誌',['視距不足或迴轉易造成事故、壅塞時，明示禁止迴車。','可設於分向島島頭或近端，必要時以附牌說明時段與車種。']);
   const direction=topic('direction','96','地名方向指示標誌','標誌',['依預告、行動、確認三階段安排資訊，行動點原則設於路口前 20 m 內。','僅設行動點時，示例建議不超過路口前 60 m；可依路況採圖形式標誌。']);
   const plan=diagram('signals','號誌化鄉區正交四叉路口號誌平面設置圖例.svg');
   topic('signal-plan','221','高速幹道號誌配置','號誌',['主要道路 60 km/h，以高速可視模板檢核。','東西向次要道路橫跨寬闊主線，近端增設柱立式燈面。'],{map:plan});
   const backboard=topic('backboard','220','號誌背板與淨空','號誌',['鄉區幹道以背板提升號誌辨識與警示。','淨空以背板外緣計算：示例車道上方至少 4.2 m、人行道上方至少 2.4 m，橫向至少 0.3 m。'],{map:diagram('elevation','號誌化鄉區正交四叉路口號誌立面設置圖例.svg'),sourceHeading:'號誌背板之設置'});
   for(const n of [1,2])topic('visibility-'+n,'201','次要道路可視檢核 '+n,'號誌',['遠端燈面距離過遠或路口略有錯位，可能使上游只看見一面燈號。','東行增設 11.2、西行增設 5.2 近端柱立式號誌。'],{map:diagram('visibility-'+n,'號誌化鄉區正交四叉路口之可視模板'+n+'.svg'),regLabel:'[1] § 201',sourceHeading:'檢查表第\\[1\\]項'});
   signalChecks(plan,['主線高速方向建議近端提供兩燈面。','次要道路補足上游辨識，東西向眩光仍需現地確認。']);
   return {rotation:90,summary:'寬闊鄉區幹道與較窄支線交會，兼顧高速接近、機車待轉及行人分段穿越。',facts:facts('35','共 6 快車道、2 慢車道，兩側實體人行道','60／慢車道 40','14','東側共 2 車道、西側共 3 車道，無人行設施',null),issues:[['行人穿越距離長','以庇護島及錯開型行穿線安排分段穿越。'],['上下游車道不一致','附加左轉車道與導引線共同銜接。'],['快慢車與速限提示不足','機車採兩段式左轉，並檢查高速號誌辨識。']],overviewIntro:'維持主線直行車道連續，配置附加左轉車道、兩段待轉及行人庇護。',overviewRows:[row(waiting,'01　清楚配置機慢車停等空間'),row(turn,'02　安排兩段左轉動線'),row(direction,'03　分階段提供方向資訊'),row(backboard,'04　提升號誌辨識並檢核淨空')],recapTitle:'高速接近路口，\n先看得見，再完成轉向。'};
 });

 make('G4-03','04-4-03-signalized-urban-skewed-cross.typ',({topic,row,diagram,signalChecks})=>{
   const guide=topic('guide','189','路口行車導引線','標線',['直行車道明顯偏移時，以導引線串接上下游。','左右轉車道寬度明顯變化或需明確宣示直行路徑時，一併檢查導引。']);
   topic('two-stage-area','191','機慢車左（右）轉待轉區線','標線',['待轉區配置於停止線前端，與行穿線保留至少 50 cm。','不得侵入交叉口實體範圍，並配合轉向軌跡及號誌可視性。']);
   const island=topic('island','規範','槽化島與行人庇護','道路設施',['無法整段設交通島時，可於接近路口處提供庇護島。','本例以路口前約 20 m 的島體銜接，其餘路段以槽化或分向標線整理。'],{reference:'《市區道路及附屬工程設計規範》緣石及交通島',regLabel:'設計規範',sourceHeading:'槽化島'});
   const tactile=topic('accessible-crosswalk','185','視覺功能障礙引導標線','標線',['穿越距離較長或斜交路口，可依需求增設引導標線。','引導線銜接人行道，並對準定位磚，避免穿越方向中斷。']);
   topic('left-waiting','184','左彎待轉區線','標線',['先以車行軌跡確認不影響對向直行、左轉，再配置待轉區。','距中心不得少於 3 m，該車行道不再疊設機慢車停等區。']);
   topic('hospital','127','醫院標誌','標誌',['鄰近醫療院所且不易辨識時，以醫院標誌提醒噤聲慢行。','牌面垂直行車方向，可依需求增加英文附牌。']);
   const plan=diagram('signals','號誌市區斜交四叉路口號誌平面設置圖例.svg');
   const signal=topic('signal-plan','201','斜交四岔路口號誌配置','號誌',['逐方向確認上游能同時看見兩組相同燈號。','南北向近端補設柱立式燈面，再檢查待轉區的起步視角。'],{map:plan});
   signalChecks(plan,['南下及北上需增設近端柱立式號誌。','東西向眩光需現地檢查，其餘共同檢核可連回前例操作。']);
   topic('phase','時相','行人穿越與時相銜接','號誌',['庇護島及錯開行穿線配合行人等候與分段穿越。','輪放與共用車道的安排，可對照市區正交案例，仍須檢查接收車道。'],{map:plan,regLabel:'時相規劃',reference:'行人穿越與建議車道配置',moduleLinks:[{page:'g401-phase-two',label:'兩車道輪放配置'},{page:'g401-phase-three',label:'三車道輪放配置'}]});
   return {summary:'商業與醫療活動密集的斜交四岔路口，整理偏移車道、人行庇護及公車停靠。',facts:facts('20','雙向各 2 車道，兩側實體人行道及停車格','50','15','北側共 2 車道、南側共 4 車道，人行空間型式不同','50'),issues:[['人行穿越距離長','提供庇護與清楚的無障礙導引。'],['車道進出不平衡','銜接偏移的上下游直行車道。'],['路側使用不清楚','整理停車、公車彎及速限資訊。']],overviewIntro:'平衡上下游車道，以導引線銜接偏移；同時安排錯開型行穿線、庇護及公車停靠。',overviewRows:[row(guide,'01　銜接偏移直行車道'),row(island,'02　保留行人庇護空間'),row(tactile,'03　銜接無障礙穿越引導'),row(signal,'04　逐方向檢查號誌與待轉視角')],recapTitle:'斜交與偏移，\n仍要保持清楚連續。'};
 });

 make('G4-04','04-4-04-signalized-rural-skewed-cross.typ',({topic,row,diagram,signalChecks})=>{
   const reduction=topic('lane-reduction','188-1','車道縮減標線','標線',['銳角右轉且路緣空間不足時，在上游先整理車道。','本例縮減至近路口一個直行右轉車道，讓車輛靠正確位置轉彎。']);
   topic('lane-warning','28','車道、路寬縮減標誌','標誌',['建議距路口至少 30 m 預告，並依速限及視距增加。','可加設距離及右道終止附牌，提前說明車道變化。']);
   const speed=topic('speed','85','最高速限標誌','標誌',['快慢車道速限不同且無中央分隔島時，避免複雜標誌資訊造成誤讀。','可用速度限制標字提示各車道速限，仍需保持速限範圍一致。']);
   const option1=diagram('permissive','號誌化鄉區斜交四叉路口號誌平面設置圖例（佈設法1）.svg'),option2=diagram('protected','號誌化鄉區斜交四叉路口號誌平面設置圖例（佈設法2）.svg');
   const permissive=topic('permissive','201','佈設法 1：機會左轉','號誌',['機會左轉採三燈式圓形綠燈配置。','應先評估接近速率、側撞風險及可接受風險水準，再決定是否採用。'],{map:option1});
   topic('protected','201','佈設法 2：保護左轉','號誌',['保護左轉採五燈式箭頭配置，將左轉與衝突車流分開。','依實際風險評估與時相條件選擇，不能只以路型決定。'],{map:option2});
   topic('risk','評估','左轉風險與方案選擇','號誌',['以可接受的重傷及死亡風險，討論是否允許機會左轉。','下表是示例中的風險假設與臨界衝擊速率，作為方案比較依據。'],{map:option2,reference:'本情境左轉側撞風險評估示例',regLabel:'方案評估',table:{columns:['示例可接受風險','臨界衝擊速率','超過時的示例選擇'],rows:[['1%','51 km/h','純保護左轉'],['5%','65 km/h','純保護左轉']]}});
   const near=topic('near-highspeed','201','高速接近的近端兩燈面','號誌',['接近路口時看不見遠端燈號，需在近端補設柱立式燈面。','確認能辨認兩個以上顯示相同燈號的燈面，再檢查停止線提示。'],{map:option1,regLabel:'[3a] § 201',sourceHeading:'檢查表第\\[3a\\]項'});
   topic('privacy','201','避免斜交方向誤看燈號','號誌',['南下、西行、東行方向依本例檢核結果處理防誤認。','調整燈面可見範圍，避免其他路段把燈號當成自己的指示。'],{map:option1,regLabel:'[9] § 201',moduleLinks:[{page:'g203-privacy',label:'斜交號誌防誤認做法'}]});
   signalChecks(option1,['南北向近端補足兩燈面提示，並檢查各方向上游辨識。','南下及東西向需防誤認，東西向另需現地檢查眩光。']);
   return {rotation:90,summary:'鄉區斜交四岔路口，以車道縮減、附加左轉與庇護空間，整理高速接近的路口動線。',facts:facts('20','中央實體分隔，雙向各 2 車道，北側為橋梁，無人行設施','50','6','雙向共 1 混合車道，無停車管制及人行設施','30'),issues:[['車道進出不平衡','槽化與附加左轉車道共同調整。'],['行人缺少庇護','寬闊主要道路需提供分段穿越停等空間。'],['速度與號誌提示不足','銳角轉彎、速限與近端燈面一起檢查。']],overviewIntro:'以槽化平衡車道並保留左轉空間，安排庇護島，再依左轉風險比較兩種號誌配置。',overviewRows:[row(reduction,'01　整理銳角右轉與車道縮減'),row(speed,'02　統一速度資訊'),row(permissive,'03　比較機會與保護左轉'),row(near,'04　補足近端號誌辨識')],recapTitle:'車道先整理，\n左轉再依風險選擇。'};
 });
 return reports;
};
module.exports.checklist=checklist;
