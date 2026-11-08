const test=require('node:test'),assert=require('node:assert/strict'),{format}=require('../assets/presentation-text.js');
test('display quantities use standard unit symbols without changing values',()=>{
 assert.equal(format('至少三公尺、50公分、100毫米、每小時50公里、行人綠燈10秒'),'至少3 m、50 cm、100 mm、50 km/h、行人綠燈10 s');
 assert.equal(format('30km/h；30 kph；1.5公尺／秒；25平方公尺'),'30 km/h；30 km/h；1.5 m/s；25 m²');
 assert.equal(format('至少一百二十五公尺'),'至少125 m');
 assert.equal(format('零點五公尺、半公尺、數十公尺'),'0.5 m、0.5 m、數十 m');
 assert.equal(format('長度(公尺)、單位：公分、60度以內、25℃、30m2'),'長度（m）、單位：cm、60°以內、25 °C、30 m²');
 assert.equal(format('公尺'),'m');
});
test('references, Chinese punctuation and visible chapter numbers normalize without changing case IDs',()=>{
 assert.equal(format('《設置規則》第201條 / §5.4.3'),'《設置規則》§ 201 / § 5.4.3');
 assert.equal(format('第八十五條、第201條之1'),'§ 85、§ 201-1');
 assert.equal(format('第183-1條、第189-1條'),'§ 183-1、§ 189-1');
 assert.equal(format('罩簷(民間俗稱「砲筒」)，設計速率 (km/h)'),'罩簷（民間俗稱「砲筒」），設計速率 （km/h）');
 assert.equal(format('00 緒論 / 01 章節 / G4-04 / M1-01'),'0 緒論 / 1 章節 / G4-04 / M1-01');
 assert.equal(format('情境回顧 / 標誌條文'),'情境小結 / 標誌條文');
 assert.equal(format('情境小節／條文與小節'),'情境小結／條文與小結');
 assert.equal(format('號誌條文'),'號誌條文運用解說');
});
test('general-road lengths convert cm to m and retain meaningful precision',()=>{
 const general=text=>format(text,{general:true});
 assert.equal(general('1至3 m、2至3 m'),'1–3 m、2–3 m');
 assert.equal(general('2.1 m、2.5 至 6公尺、250–600 cm'),'2.10 m、2.50–6.00 m、2.50–6.00 m');
 assert.equal(general('線寬10或15公分、緩衝30 cm、間隔50公分'),'線寬0.10 或 0.15 m、緩衝0.30 m、間隔0.50 m');
 assert.equal(general('0.5 cm、0.125–0.15 m'),'0.005 m、0.125–0.150 m');
 assert.equal(general('1 m至3 m'),'1–3 m');
 assert.equal(general('一至三公尺、十或十五公分'),'1–3 m、0.10 或 0.15 m');
 assert.equal(format('15 cm'), '15 cm','Other presentations retain their chosen SI unit');
 assert.equal(general('25 cm²'),'25 cm²','Area units must not use the length conversion factor');
 for(const text of ['2.1 m','250–600 cm','線寬10或15公分'])assert.equal(general(general(text)),general(text));
});
test('general-road configuration wording and specification citations are consistent',()=>{
 const general=text=>format(text,{general:true});
 assert.equal(general('整理車道及動線；路側空間需要整理。'),'調整車道及動線；路側空間需要調整。');
 assert.equal(general('整理銳角右轉與車道縮減'),'調整銳角右轉與車道縮減');
 assert.equal(general('依本情境章節整理；解說依 example.typ 整理。'),'依本情境章節彙整；解說依 example.typ 彙整。');
 assert.equal(general('依「市區道路及附屬工程設計規範」第 10.1 節之規定辦理；屬省道公路範疇者，依「公路路線設計規範」第 2.14.2 節之規定辦理。'),'依《市區道路及附屬工程設計規範》§ 10.1 辦理；屬省道公路範疇者，依《公路路線設計規範》§ 2.14.2 辦理。');
});
test('normalization is idempotent and preserves mathematical parentheses',()=>{
 for(const text of ['§ 201、50 km/h','G4-04 情境小結','座標 (x, y)','《規則》第85條、30公里/小時'])assert.equal(format(format(text)),format(text));
 assert.equal(format('座標 (x, y)'),'座標 (x, y)');
});
