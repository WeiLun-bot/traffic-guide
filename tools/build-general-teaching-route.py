"""Produce a presenter route and repetition index without changing the deck."""
from collections import defaultdict
import csv
import importlib.util
import json
from pathlib import Path
import re
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/teaching-route'

FOCUS = {
 'G1-01': '市區無號誌路口的車行邊界、行人穿越、轉向動線及路側空間配置。',
 'G1-02': '鄉區路口的停車再開管制、行人需求與大型車轉向空間。',
 'G1-03': '巷道右進右出的通行限制，以及中央分隔、指向線與標誌的配合。',
 'G1-04': '讓路線、讓路標誌與分隔設施的配套，以及快慢車道速限資訊的配置。',
 'G1-05': '區分禁止停車與禁止臨時停車，結合接送、停車彎及路側服務需求。',
 'G1-06': '斜交及曲線路段的快慢車道銜接、讓路管制與速限資訊配置。',
 'G2-01': '號誌配置與逐方向檢核，包括上游可視性、停止位置、起步視域及淨空。',
 'G2-02': '東西向號誌眩光檢核，以及未設行人專用號誌時的配套。',
 'G2-03': '寬闊斜交路口的號誌可視性、左轉專用號誌及防誤認措施。',
 'G2-04': '彎道三種號誌配置方案的辨認距離、立桿空間及車輛轉彎軌跡比較。',
 'G3-01': '交錯車道、路口減速與路側停車空間的整體配置。',
 'G3-02': '鄉區四岔路口的行車分向線、槽化、路面邊線及行穿線配套。',
 'G3-03': '行穿線、連續人行道、減速平台及路面高突預告的配置。',
 'G3-04': '斜交路口的停止線方向、橋梁承載限制及迴轉、繞道空間。',
 'G4-01': '錯開型行穿線、左彎待轉區及輪放時相的配置與人車衝突處理。',
 'G4-02': '機慢車停等區與兩段左轉配套，以及高速、寬路口的號誌可視性。',
 'G4-03': '斜交偏移車道、行人庇護、無障礙引導與號誌時相的整合配置。',
 'G4-04': '銳角右轉、機會與保護左轉方案，以及高速可視性與防誤認措施。',
}

# These are teaching recommendations, inferred from the scenario's documented
# geometry and subject. They are not a determination of legal compliance.
DIFFERENCES = {
 'rural-crosswalk': '與 G1-01 比較有、無行穿線的選擇；本例還要保留大型車轉彎所需的停止線退縮。',
 'urban-merge-arrows': '寬度與指向線型式已在 G1-01 建立，本例只指出巷道匯入與直右共用的對應。',
 'rural-merge-crosswalk': '重點是路肩、人行空間及讓路配置的銜接；有、無行穿線原理可回指 G1-02。',
 'rural-merge-speed-sign': '比較快、慢車道速限不同時，標誌與路面標字如何避免混淆。',
 'g106-slow-line': '本例通過路口後有車道寬度縮減與漸變銜接，不只重複分隔線定義。',
 'g106-crosswalk-line': '有、無需求的原理已見 G1-02、G1-04；若時間有限，只點出本例與讓路配置的配合。',
 'g106-yield-sign': '與 G1-04 比較：讓路線位於曲線段，標誌要考慮來車辨識方向。',
 'g106-speed-sign': '與 G1-04 比較有無中央分隔島，以及彎道影響下的速限資訊位置。',
 'g201-protected': '同屬號誌配置，但「保護左轉」是本段新比較對象；應與前頁機會左轉成對講。',
 'g202-center': 'G1-04 已講分向限制線；此例改比較無中央分隔島時的雙黃線配置。',
 'g202-signal-plan': '近遠端原理回指 G2-01；本例只定位東西向及行人通行條件。',
 'g203-speed': '速限標誌原理可略，保留本例速限變更前的提前預告議題。',
 'g203-signal-plan': '寬闊斜交使遠端號誌不易被辨認；重點是補足近端燈面與各方向判讀。',
 'g203-visible-1': '方法回指 G2-01；本例比較斜交幾何條件下南下方向的實際可視結果。',
 'g203-visible-2': '同一案例的第二方向，不必再教模板操作；比較西行的燈面位置與檢核結果。',
 'g203-visible-3': '第三方向可直接比較；特別保留東行使用高速可視模板的條件。',
 'g204-signal-plan': '本例新增彎道及狹窄立桿空間，不能照搬直線接近路口的配置。',
 'g204-curve-option-1': '與後兩頁成組比較：燈面都在右側時，何處才第一次看得到兩燈面？',
 'g204-curve-option-2': '接續比較移到左側後的辨認距離；不再重講模板定義。',
 'g204-curve-option-3': '比較右側加左側柱立式的效果與空間條件，讓聽眾說明方案取捨。',
 'g204-near-alternative': '回指 G2-01 近端功能；只補立桿受限、大車遮蔽及共桿／延伸橫桿的替選。',
 'g204-far-post': '回指 G2-01 遠端燈面配置；保留柱立式兩側配置及起步可視性的差異。',
 'g301-guide': '從三岔導引推進到四岔及些微斜向交錯的減速設計，重點是整體路型。',
 'g302-channel': 'G2-03 已介紹槽化線；本例只比較鄉區四岔與車道、路肩的銜接。',
 'g302-edge': 'G1-01 已講邊線線形；本例聚焦道路中心、車道與路肩寬度如何共同決定邊界。',
 'g302-crosswalk': '有、無需求已在前例講過；本例可快速指認，除非要討論四岔的步行動線。',
 'g302-junction-warning': '預告原理可回指 G1-02；本例只定位四岔與鄉區接近條件。',
 'g303-crosswalk': '本例穿越兩車行道，槽化線不等於行人庇護；銜接下一頁連續人行道一起講。',
 'g304-stopline': '與 G1-02 比較斜交方向及平行橫交道路的佈設方式。',
 'g304-edge': '不再重講線寬；指出斜交路口內導引線與邊線如何連接。',
 'g304-crosswalk': '有、無需求原理可略；只補主、次道路與人行道標線的配套判斷。',
 'g401-crosswalk': '同屬行穿線，首次推進到錯開型配置；內容包括停讓空間與行人穿越的關係。',
 'g401-dotted': 'G1-01 是左轉附加車道，本例擴展為多車道與左、右轉附加車道的分流。',
 'g401-parking': 'G1-05 是路邊停車，本例是路外停車場入口，標誌朝向與告知對象不同。',
 'g401-signal-plan': '配置原理已建立，本例保留五燈式、寬路口及近端補燈面的理由。',
 'g401-visibility': '操作可略；讓聽眾判讀寬闊主線造成次要道路遠端燈面不可視的問題。',
 'g401-phase-three': '與前頁兩車道輪放成組比較：接收車道與共用車道是否互相阻擋？',
 'g402-waiting': '尺寸原理回指 G2-01；本例著重與兩段左轉待轉區及高速接近條件一起檢查。',
 'g402-signal-plan': '保留高速可視模板與較窄視域的差異，不能只複製市區低速檢核。',
 'g402-backboard': '淨空原理已在 G2-01 講過；背板為本例新增的辨識議題，部件也要納入淨空。',
 'g402-visibility-1': '回指既有方法，只比較遠端過遠、略有錯位時為何要補近端柱立式燈面。',
 'g402-visibility-2': '與前頁成對核對另一方向；可以省略操作步驟，保留結果差異。',
 'g403-guide': '本例直行車道有橫向偏移；圖面差異比重新定義導引線更值得講。',
 'g403-two-stage-area': '回指 G4-02 的待轉區原理，本例只比較斜交邊界、行穿線與不侵入交叉口的限制。',
 'g403-island': 'G1-04 的分隔島重在分向；本例新增行人庇護功能，兩者不能當成完全相同用途。',
 'g403-accessible-crosswalk': '行穿線已熟悉，但視障引導、斜交／長距離穿越及定位磚銜接是新應用，建議保留。',
 'g403-left-waiting': '回指 G4-01；本例保留斜交車行軌跡及與機慢車停等區不能互相衝突的比較。',
 'g403-signal-plan': '不重講燈面數量的通則，比較斜交四岔各來向的燈面辨識條件。',
 'g403-phase': '回指 G4-01 的人車衝突分離；只補庇護、分段穿越與接收車道的整合。',
 'g404-lane-warning': 'G2-03 已講縮減預告，本例改比較銳角右轉與車道縮減的先後關係。',
 'g404-speed': '快慢車道與無中央分隔島的資訊問題已見 G1-06；可直接回顧圖面差異。',
 'g404-permissive': '回指 G2-01 的機會左轉；本例要帶入斜交、遠端不可視與後續風險選擇。',
 'g404-protected': '不再重講保護左轉定義，與機會左轉及下一頁風險評估成組比較。',
 'g404-privacy': '方法回指 G2-03；本例只指出哪些來向可能誤認、哪些燈面需要限制可見範圍。',
}

SIGNALS = {
 'permissive': ('signal-layout', '號誌整體配置與左轉控制'),
 'protected': ('signal-layout', '號誌整體配置與左轉控制'),
 'signal-plan': ('signal-layout', '號誌整體配置與左轉控制'),
 'checklist': ('signal-checklist', '逐方向號誌檢核流程'),
 'visible': ('signal-visible', '上游兩燈面可視檢核'),
 'visible-1': ('signal-visible', '上游兩燈面可視檢核'),
 'visible-2': ('signal-visible', '上游兩燈面可視檢核'),
 'visible-3': ('signal-visible', '上游兩燈面可視檢核'),
 'visibility': ('signal-visible', '上游兩燈面可視檢核'),
 'visibility-1': ('signal-visible', '上游兩燈面可視檢核'),
 'visibility-2': ('signal-visible', '上游兩燈面可視檢核'),
 'left': ('signal-far-left', '遠端燈面在左'),
 'far-post': ('signal-far-left', '遠端燈面在左'),
 'far': ('signal-distance', '遠端縱向距離'),
 'near': ('signal-near', '近端提示停止線'),
 'near-alternative': ('signal-near', '近端提示停止線'),
 'gap': ('signal-gap', '12 m 視覺漏洞'),
 'start': ('signal-start', '起步可視範圍'),
 'clearance': ('signal-clearance', '號誌淨寬、淨高及部件淨空'),
 'backboard': ('signal-clearance', '號誌淨寬、淨高及部件淨空'),
 'pedestrian': ('signal-pedestrian', '行人專用號誌'),
 'pedestrians': ('signal-no-pedestrian', '未設行人專用號誌的配套'),
 'glare': ('signal-glare', '眩光與背景干擾'),
 'left-signal': ('signal-left-only', '左轉專用號誌與適用對象'),
 'privacy': ('signal-privacy', '斜交號誌防誤認'),
 'recognition-distance': ('signal-curve', '彎道號誌辨認與方案比較'),
 'curve-option-1': ('signal-curve', '彎道號誌辨認與方案比較'),
 'curve-option-2': ('signal-curve', '彎道號誌辨認與方案比較'),
 'curve-option-3': ('signal-curve', '彎道號誌辨認與方案比較'),
 'phase-two': ('signal-phase', '時相與行人、車流衝突分離'),
 'phase-three': ('signal-phase', '時相與行人、車流衝突分離'),
 'phase': ('signal-phase', '時相與行人、車流衝突分離'),
 'risk': ('signal-risk', '左轉控制方案風險評估'),
 'near-highspeed': ('signal-highspeed-near', '高速接近的近端兩燈面'),
}

# These pages mainly reuse an already established principle. The difference
# note remains available even when the presenter chooses a brief mention.
BRIEF = {
 'urban-merge-arrows', 'g106-crosswalk-line', 'g302-channel',
 'g302-crosswalk', 'g302-junction-warning', 'g304-edge',
 'g304-crosswalk', 'g402-waiting', 'g402-visibility-2', 'g404-speed',
}


def read(file):
    return json.loads((ROOT / file).read_text(encoding='utf-8'))


def topic(article):
    category, reg = article['category'], str(article['reg'])
    if category == '號誌':
        return SIGNALS[article['id'].split('-', 1)[1]]
    if category == '道路設施':
        if '島' in article['name']:
            return 'road-island', '交通島：分隔、槽化與庇護'
        return 'road-' + reg, article['name']
    return category + '-' + reg, '枕木紋行人穿越道線及延伸應用' if category == '標線' and reg == '185' else article['name']


def csv_file(name, columns, rows):
    with (OUT / name).open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(columns)
        writer.writerows(rows)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    nav = read('data/presentation-navigation.json')
    order = nav['pageOrder']
    position = {key: i for i, key in enumerate(order)}
    docs = [read('data/scenarios/' + e['id'] + '.json') for e in read('data/scenarios/catalog.json')['scenarios'] if e['id'].startswith('G')]
    docs.sort(key=lambda d: position.get(d['scenario']['contextId'], 99999))
    groups, rows, cards = defaultdict(list), [], []
    for doc in docs:
        scene = doc['scenario']
        canonical = {key: i for i, key in enumerate(scene['articleIds'])}
        articles = sorted(doc['articles'], key=lambda a: position.get(a['id'], len(order) + canonical[a['id']]))
        custom = nav.get('navigationOrders', {}).get('scenario:' + scene['id'])
        if custom:
            indices = {key: i for i, key in enumerate(custom)}
            articles.sort(key=lambda a: indices.get(a['id'], len(custom) + canonical[a['id']]))
        card = {'code': scene['code'], 'name': scene['name'], 'focus': FOCUS[scene['code']], 'items': []}
        for at, article in enumerate(articles, 1):
            key, label = topic(article)
            previous = groups[key]
            earlier = list(dict.fromkeys(r['scenario'] for r in previous))
            delta = DIFFERENCES.get(article['id'], '')
            if article['id'].endswith('-checklist'):
                delta = '檢核方法可回指 G2-01；本例各方向的可視性、眩光及防誤認檢核結果仍須保留，不能整頁視為相同內容。'
            first = not previous
            status = '首講' if first else '重複・可略原理' if article['id'] in BRIEF else '重複・講差異' if delta else '重複・可略原理'
            if not delta:
                delta = '本場首次介紹此主題，內容包括設置條件及本例配置。' if first else '與首講頁比較後，無新增條件者可簡述，或由講者決定略講。'
            row = {'order': len(rows) + 1, 'scenario': scene['code'], 'scenarioName': scene['name'], 'withinScenario': at,
                   'pageId': article['id'], 'category': article['category'], 'name': article['name'], 'reference': article.get('reference') or str(article['reg']),
                   'topicKey': key, 'topic': label, 'status': status, 'firstScenario': scene['code'] if first else previous[0]['scenario'],
                   'firstPage': article['id'] if first else previous[0]['pageId'], 'previousScenarios': earlier,
                   'specialty': delta, 'recommendedAction': '完整講' if first else '只講差異' if status == '重複・講差異' else '可略原理',
                   'presenterDecision': '', 'url': 'http://127.0.0.1:4173/presentation-demo/#' + article['id'] + '/zoom'}
            groups[key].append(row)
            rows.append(row)
            card['items'].append(row)
        cards.append(card)
    for values in groups.values():
        scenes = list(dict.fromkeys(r['scenario'] for r in values))
        for row in values:
            row['allScenarios'] = scenes
            row['otherScenarios'] = [code for code in scenes if code != row['scenario']]

    # Keep Word-only topics distinct from actual slide positions. They are not
    # silently inserted into the speaker's running order.
    supplements = defaultdict(list)
    first_word = {}
    expected_docx = ROOT / 'materials/references-local/一般道路情境設置圖例及運用解說(草案).docx'
    local_docs = [expected_docx] if expected_docx.exists() else []
    if local_docs:
        spec = importlib.util.spec_from_file_location('docx_reader', ROOT / 'tools/import-general-scenario-docx.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with ZipFile(local_docs[0]) as archive:
            cases = module.parse_scenarios(module.blocks_from_docx(archive))
        by_code = {d['scenario']['code']: d for d in docs}
        for case in cases:
            for section in case['sections'][2:]:
                category = '標誌' if '標誌設置' in section['heading'] else '標線' if '標線設置' in section['heading'] else '號誌'
                for unit in module.split_topics(section):
                    match = re.search(r'設置規則第?\s*(\d+(?:-\d+)?)\s*條', unit['title'])
                    if not match or category == '號誌':
                        continue
                    key = category + '-' + match[1]
                    first_word.setdefault(key, case['code'])
                    if not any(a['category'] == category and str(a['reg']) == match[1] for a in by_code[case['code']]['articles']):
                        supplements[case['code']].append(unit['title'])
        # A separate new signal subject in Word, absent as an individual slide.
        if not any('語音' in a['name'] for a in by_code['G2-01']['articles']):
            supplements['G2-01'].append('視覺功能障礙語音號誌之佈設（DOCX §3.1.5）')
    scene_index = {c['code']: i for i, c in enumerate(cards)}
    for row in rows:
        before = first_word.get(row['topicKey'])
        row['earlierWordScenario'] = before if before and scene_index[before] < scene_index[row['firstScenario']] else ''

    intro = [
      '# 一般道路情境：講者路線與重複主題索引', '',
      '依目前簡報實際頁序整理 18 個一般情境、131 個獨立解說頁。本索引供備課參考；「可略」不會刪除或跳過任何正式簡報頁。', '',
      '**判讀**：首講＝本場首次完整介紹這個教學主題；重複・講差異＝原理可回指，保留本例新條件；重複・可略原理＝講者比對後可一句帶過或跳過。', '',
      '同一條號不能直接當作同一教學內容：號誌拆成配置、檢核流程、上游可視、遠端在左、距離、近端、起步、淨空、眩光、防誤認與時相等主題。道路設施配套也一併標出。', '',
      '「首講」不表示圖上之前完全沒有出現，也不表示是新法規；例如停止線、停車再開標誌在 DOCX G1-01 已有解說，目前簡報到 G1-02 才各有獨立頁。DOCX 補充項目另列，不混入現有頁序。未逐一清點圖上每個符號，因此這不是圖面全部設施的完整清冊。', '',
      '情境特殊性與講述取捨為備課建議，參照頁面主題、DOCX 設置解說與情境條件。點選原頁主題可回到本機簡報；需先啟動 start-editor.cmd，預設連接埠為 4173。', '',
      '各情境的「本例講述卡」列出首次介紹、沿用原理及配置差異，供圖面解說及備課參考。主題矩陣可作為備課索引。', '',
      '## 情境順序總覽', '', '| 順序 | 情境 | 獨立解說頁 | 首講主題頁 | 再次出現頁 | 本例主軸 |', '|---|---|---:|---:|---:|---|']
    for i, card in enumerate(cards, 1):
        new = sum(r['status'] == '首講' for r in card['items'])
        intro.append(f"| {i:02d} | [{card['code']} {card['name']}](#{card['code'].lower()}) | {len(card['items'])} | {new} | {len(card['items'])-new} | {card['focus']} |")
    body = intro + ['', '## 逐情境講述卡', '']
    for card in cards:
        body += [f"<a id=\"{card['code'].lower()}\"></a>", f"### {card['code']} {card['name']}", '', card['focus'], '',
                 '**講述順序**：' + ' → '.join(f"{r['withinScenario']:02d} {r['name']}【{'首' if r['status']=='首講' else '重'}】" for r in card['items']), '',
                 '<details>', '<summary>展開：前面在哪裡講過、本例講什麼、可否略講</summary>', '',
                 '| 頁序 | 原頁主題 | 標記 | 前面情境／首講頁 | 本例講述建議 |', '|---|---|---|---|---|']
        for r in card['items']:
            earlier = '、'.join(r['previousScenarios']) or '本頁為首次完整介紹'
            if r['previousScenarios']:
                earlier += '；首講 ' + r['firstPage']
            if r['earlierWordScenario']:
                earlier += '；DOCX ' + r['earlierWordScenario'] + ' 已有相關條目'
            body.append(f"| {r['withinScenario']:02d} | [{r['name']}]({r['url']})（{r['category']}） | {r['status']} | {earlier} | {r['specialty']} |")
        body += ['', '</details>', '']
        if supplements[card['code']]:
            body += ['**DOCX 有、但目前本情境沒有獨立解說頁**：' + '；'.join(supplements[card['code']]) + '。可決定口頭補充，或日後另排頁；不算作現有播放頁。', '']
    body += ['## 反向索引：同一主題在哪些情境再次出現', '', '| 教學主題 | 首講情境／頁面 | 依講述順序出現的情境 |', '|---|---|---|']
    for values in groups.values():
        first = values[0]
        body.append(f"| {first['topic']} | [{first['scenario']} / {first['name']}]({first['url']}) | {' → '.join(first['allScenarios'])} |")
    body += ['', '## 使用方式建議', '',
             '1. 備課時依講述卡逐例走；只針對「重複」項目決定完整講、只講差異或跳過。',
             '2. 同情境有多方向或多方案時，可併列共同方法與配置差異；例如 G2-03 三個方向、G2-04 三個彎道方案。',
             '3. 號誌檢核表可以略過已熟悉的檢核方法，但每個情境的結果與待確認項目仍須保留。',
             '4. 教師版頁角建議標示「已講：G1-01｜本例新增：…」；聽眾版只保留本例差異，不用顯示所有備課標籤。',
             '5. CSV 的「講者決定」留白，可填完整講／差異／跳過；目前沒有自動套用任何選擇。', '']
    (OUT / 'general-teaching-route.md').write_text('\n'.join(body), encoding='utf-8')
    (OUT / 'general-teaching-route.json').write_text(json.dumps({'basis': 'current saved page order; individual explanation pages', 'scenarios': cards, 'rows': rows, 'wordSupplements': supplements}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    csv_file('general-teaching-route.csv', ['全程順序','情境','情境名稱','情境內頁序','類別','頁面主題','教學主題分組','標記','首次完整講述情境','首次頁面','前面已講情境','其他重複情境','本例差異／講述建議','建議講法','講者決定','簡報頁面ID'],
             [[r['order'],r['scenario'],r['scenarioName'],r['withinScenario'],r['category'],r['name'],r['topic'],r['status'],r['firstScenario'],r['firstPage'],'、'.join(r['previousScenarios']),'、'.join(r['otherScenarios']),r['specialty'],r['recommendedAction'],'',r['pageId']] for r in rows])
    csv_file('general-topic-matrix.csv', ['教學主題']+[c['code'] for c in cards],
             [[values[0]['topic']]+[('首' if any(r['status']=='首講' for r in values if r['scenario']==c['code']) else '重')+f"({sum(r['scenario']==c['code'] for r in values)})" if any(r['scenario']==c['code'] for r in values) else '' for c in cards] for values in groups.values()])
    assert len(rows) == 131 and len(cards) == 18 and len({r['pageId'] for r in rows}) == 131
    print(json.dumps({'scenarios':len(cards),'pages':len(rows),'teachingTopics':len(groups),'repeatPages':sum(r['status']!='首講' for r in rows),'output':str(OUT.relative_to(ROOT))},ensure_ascii=False))


if __name__ == '__main__':
    main()
