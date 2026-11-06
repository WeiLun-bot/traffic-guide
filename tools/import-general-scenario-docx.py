"""Update existing scenario TEXT from the local general-scenario DOCX.

Uses the Word body (not its cached TOC), embedded figures and real table cells.
Existing scenario/page identities are reused where the subject still exists.
The prepared import is merged as text only; images, tables, pages, navigation,
focus coordinates and layout remain unchanged. Run with
Python 3.9+ and Pillow; pass --apply after reviewing the local import report.
"""
import argparse
import copy
import hashlib
import io
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from urllib.parse import quote
from zipfile import ZipFile
import xml.etree.ElementTree as ET

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
NS = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'v': 'urn:schemas-microsoft-com:vml',
}


def read(file):
    return json.loads((ROOT / file).read_text(encoding='utf-8'))


def encoded(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def text(element):
    return ''.join(n.text or '' for n in element.findall('.//w:t', NS)).strip()


def clean_title(value):
    return re.sub(r'^\d+[.、．]\s*', '', value.strip())


def sentences(value):
    # Retain delimiters, conditions and numeric ranges; never truncate a rule.
    return [s.strip() for s in re.findall(r'.+?(?:[。！？](?:[）」])?|$)', value, flags=re.S) if s.strip()]


def page_points(paragraphs, budget=340):
    points = []
    for paragraph in paragraphs:
        parts = sentences(paragraph) or [paragraph]
        current = ''
        for part in parts:
            if current and len(current + part) > 145:
                points.append(current)
                current = ''
            current += part
        if current:
            points.append(current)
    pages, current = [], []
    for point in points:
        if current and (len(current) >= 3 or sum(map(len, current)) + len(point) > budget):
            pages.append(current)
            current = []
        current.append(point)
    if current:
        pages.append(current)
    return pages


def first_sentence(value):
    return (sentences(value) or [value])[0]


def blocks_from_docx(archive):
    relations = ET.fromstring(archive.read('word/_rels/document.xml.rels'))
    links = {n.get('Id'): n.get('Target') for n in relations if n.get('TargetMode') != 'External'}
    blocks = []
    for index, node in enumerate(ET.fromstring(archive.read('word/document.xml')).find('w:body', NS)):
        style = node.find('w:pPr/w:pStyle', NS)
        block = {'index': index, 'style': style.get('{%s}val' % NS['w']) if style is not None else '',
                 'text': text(node), 'pictures': [], 'tables': []}
        # a:blip is the browser-compatible PNG/JPEG fallback even when Word also
        # includes an SVG or EMF original in an extension element.
        for blip in node.findall('.//a:blip', NS) + node.findall('.//v:imagedata', NS):
            rid = blip.get('{%s}embed' % NS['r']) or blip.get('{%s}id' % NS['r'])
            target = links.get(rid, '')
            if not target.startswith('media/'):
                continue
            media = 'word/' + target
            if Path(media).suffix.lower() not in ('.png', '.jpg', '.jpeg'):
                continue
            if media not in [p['media'] for p in block['pictures']]:
                block['pictures'].append({'media': media})
        if node.tag == '{%s}tbl' % NS['w']:
            rows = [[ '\n'.join(text(p) for p in c.findall('w:p', NS)).strip()
                     for c in row.findall('w:tc', NS)] for row in node.findall('w:tr', NS)]
            if rows and max(map(len, rows)) > 1:
                block['tables'].append(rows)
            block['style'] = 'table'
            block['text'] = '\n'.join(' | '.join(row) for row in rows)
        blocks.append(block)
    return blocks


def paragraphs(blocks):
    return [b['text'] for b in blocks if b['text'] and not b['tables']
            and b['style'] not in ('af', 'affd', 'af5', 'ad', '1f')]


def parse_scenarios(blocks):
    starts = [i for i, b in enumerate(blocks) if b['style'] == '2'
              and re.match(r'^[2-5]\.\d+.*設置圖例與運用解說$', b['text'])]
    result = []
    for number, start in enumerate(starts):
        end = starts[number + 1] if number + 1 < len(starts) else next(
            (i for i in range(start + 1, len(blocks)) if blocks[i]['text'] == '參考文獻'
             or blocks[i]['style'] == '1' and blocks[i]['text']), len(blocks))
        chunk = blocks[start:end]
        section = re.match(r'^(\d+)\.(\d+)', chunk[0]['text'])
        code = 'G%s-%02d' % (int(section[1]) - 1, int(section[2]))
        heads = [i for i, b in enumerate(chunk) if b['style'] == '3' and re.match(r'^\d+\.\d+\.\d+', b['text'])]
        sections = []
        for j, h in enumerate(heads):
            sections.append({'heading': chunk[h]['text'], 'blocks': chunk[h + 1:heads[j + 1] if j + 1 < len(heads) else len(chunk)]})
        result.append({'code': code, 'section': section[0], 'title': chunk[0]['text'], 'sections': sections})
    if len(result) != 18:
        raise ValueError('Expected exactly 18 body scenarios; found %s' % len(result))
    return result


def split_topics(section):
    blocks = section['blocks']
    signal = '號誌設置' in section['heading']
    starts = []
    for i, b in enumerate(blocks):
        if b['style'] != '12' or not b['text']:
            continue
        if signal:
            if re.match(r'^\d+[.．、]\s*', b['text']):
                starts.append(i)
        elif ('設置規則' in b['text'] or '市區道路' in b['text']) and len(b['text']) < 130:
            starts.append(i)
    # Some one-topic sections put the heading and first paragraph in one run.
    if not starts:
        opening = next((b['text'] for b in blocks if b['text']), '')
        heading = re.match(r'^(.{1,80}?設置規則第?\s*\d+(?:-\d+)?\s*條)', opening)
        return [{'title': heading[1] if heading else '號誌配置與逐向檢核' if signal else clean_title(opening), 'blocks': blocks}]
    units = []
    if starts[0] > 0:
        prefix = blocks[:starts[0]]
        if paragraphs(prefix) or any(b['tables'] for b in prefix):
            units.append({'title': '號誌配置與逐向檢核' if signal else '設置說明', 'blocks': prefix})
    for n, start in enumerate(starts):
        units.append({'title': clean_title(blocks[start]['text']),
                      'blocks': blocks[start + 1:starts[n + 1] if n + 1 < len(starts) else len(blocks)]})
    return units


def normalize_name(value):
    return re.sub(r'[\s「」『』、，：:（）()0-9一二三四五六七八九十.／/\-]', '', value.split('，')[0]).replace('道路遵行', '遵行').replace('三叉', '三岔').replace('四叉', '四岔')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('docx', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    source = args.docx.resolve()
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    with ZipFile(source) as archive:
        blocks = blocks_from_docx(archive)
        cases = parse_scenarios(blocks)
        changes, report, image_writes = {}, [], {}
        base = read('data/scenarios/presentation.json')
        catalog = read('data/scenarios/catalog.json')
        old_ids, new_ids, changed_map_ids, changed_overall = set(), set(), set(), set()
        old_ids_by_code = {}
        for case in cases:
            code = case['code']
            file = 'data/scenarios/' + code + '.json'
            doc = read(file)
            scene = doc['scenario']
            old = doc['articles']
            old_ids_by_code[code] = {a['id'] for a in old}
            old_ids.update(a['id'] for a in old)
            prefix = code.lower().replace('-', '')
            assets = doc.setdefault('assets', {}) if 'embeddedAssets' not in doc else {}
            source_info = {'file': source.name, 'sha256': digest, 'section': case['section'],
                           'note': '解說、數值、適用條件、圖表以提供之一般道路情境 DOCX 草案為準。'}
            scene['source'] = source_info
            scene['sourceDocument'] = copy.deepcopy(source_info)
            scene.pop('originalTypst', None)
            scene['rotation'] = 0
            scene['assetRotations'] = {}
            changed_overall.add(scene['overall'])
            sections = case['sections']
            context, strategy = sections[:2]
            context_text = paragraphs(context['blocks'])
            # The first body paragraph describes both existing roads, rather
            # than the proposed conditions later in the strategy section.
            road = next(t for t in context_text if '路寬' in t)
            parts = re.split(r'(?=橫交之次要道路|橫交之道路|次要道路路寬|橫交之南北向|南北向之次要道路|原本的巷道路寬|而巷道路寬)', road, maxsplit=1)
            if len(parts) != 2:
                split = re.search(r'[。；](?=[^。；]{0,30}(?:次要道路|南北向))', road)
                parts = [road[:split.end()], road[split.end():]] if split else [road, '']
            existing_facts = scene.get('facts') or doc.get('view', {}).get('context', {}).get('facts')
            if not existing_facts:
                existing_facts = [{'title': '主要道路', 'width': '', 'description': '', 'speed': None}, {'title': '次要道路', 'width': '', 'description': '', 'speed': None}]
            facts = copy.deepcopy(existing_facts)
            for index, part in enumerate(parts):
                width = re.search(r'路寬(?:約|為|約為)?\s*(\d+(?:\.\d+)?)\s*公尺', part)
                speed = re.search(r'速限(?:為|則為|約為|設定為)?\s*(\d+)\s*公里', part)
                if width:
                    facts[index]['width'] = width[1]
                facts[index]['speed'] = int(speed[1]) if speed else None
                if part:
                    desc = re.sub(r'^.*?路寬(?:約|為|約為)?\s*\d+(?:\.\d+)?\s*公尺[，、]?', '', part)
                    desc = re.sub(r'[，。]?路段速限.*$', '', desc)
                    facts[index]['description'] = desc
            # Issue headings in Word are numbered paragraphs. Keep every issue
            # in the source record, and show a short, faithful context summary.
            issues = []
            cb = context['blocks']
            for i, b in enumerate(cb):
                if b['style'] == '12' and re.match(r'^\d+[.．、]?\s*', b['text']):
                    title = clean_title(b['text'])
                    detail = next((x['text'] for x in cb[i + 1:] if x['text']), '')
                    if len(title) > 55:
                        issues.append(['路口現況議題', title])
                    else:
                        issues.append([title, first_sentence(detail)])
            if not issues:
                raise ValueError('No context issues for ' + code)
            strategy_blocks = []
            for b in strategy['blocks']:
                if b['style'] == '1f':
                    break
                strategy_blocks.append(b)
            strategy_text = paragraphs(strategy_blocks)
            summary = '主要道路寬約 %s m，次要道路寬約 %s m；依現況議題檢核本例配置。' % (facts[0]['width'], facts[1]['width'])
            scene.update(facts=facts, issues=issues[:4], summary=summary,
                         condition='；'.join(issue[0] for issue in issues), overviewIntro=first_sentence(strategy_text[0]),
                         sourceParagraphs=context_text + strategy_text)
            source_line = source.name + ' / §' + case['section']
            # Base four scenarios use an explicit view object, so update that
            # along with the data (old defaults must not mask the import).
            view = doc.setdefault('view', {})
            view['context'] = {'facts': facts, 'issues': issues[:4], 'summary': scene['summary'],
                               'condition': scene['condition'], 'sourceLine': source_line}
            figure_map, figures = {}, []
            pending = []
            # Associate captions with preceding image runs, including images
            # inside one-cell Word tables and VML fallbacks.
            for section in sections:
                for b in section['blocks']:
                    pending.extend(b['pictures'])
                    caption = re.search(r'圖\s*(\d+\.\d+[-－]\d+)\s*([^\n]*)', b['text']) if b['style'] in ('af', 'table') else None
                    if caption and pending:
                        number = caption[1].replace('－', '-')
                        for pi, picture in enumerate(pending):
                            media = picture['media']
                            payload = archive.read(media)
                            with Image.open(io.BytesIO(payload)) as image:
                                width, height = image.size
                            key = prefix + '-docx-figure-' + number.replace('.', '-').replace('－', '-') + ('-' + str(pi + 1) if pi else '')
                            name = 'docx-' + number.replace('.', '-') + ('-' + str(pi + 1) if pi else '') + Path(media).suffix.lower()
                            relative = 'materials/04-一般道路情境/' + code + '/' + name
                            asset = {'file': relative, 'width': width, 'height': height, 'rotation': 0, 'scenario': code,
                                     'label': '圖' + number + ' ' + caption[2], 'sha256': hashlib.sha256(payload).hexdigest()}
                            assets[key] = asset
                            image_writes[relative] = payload
                            figure = {'key': key, 'label': asset['label'], 'number': number, 'block': b['index']}
                            figures.append(figure)
                            figure_map.setdefault(number, []).append(figure)
                        pending = []
                    elif b['style'] == '12' and pending:
                        # Never attach an unmatched drawing to a later topic.
                        pending = []
            overall_number = case['section'] + '-1'
            if overall_number not in figure_map:
                raise ValueError('Missing overall figure ' + code)
            overall_key = figure_map[overall_number][0]['key']
            overall_asset = assets[overall_key]
            scene.update(overall=overall_key, width=overall_asset['width'], height=overall_asset['height'], figure='圖' + overall_number)
            if scene.get('currentConditions'):
                scene['currentConditions']['after'] = overall_key
            generated, used = [], set()
            units = [{'title': '交通設施設置建議', 'blocks': strategy_blocks, 'category': '道路設施', 'section': strategy['heading']}]
            for section in sections[2:]:
                category = '號誌' if '號誌設置' in section['heading'] else '標誌' if '標誌設置' in section['heading'] else '標線'
                for unit in split_topics(section):
                    unit.update(category=category, section=section['heading'])
                    units.append(unit)
            for unit in units:
                paragraphs_ = paragraphs(unit['blocks'])
                tables = [(b, rows) for b in unit['blocks'] for rows in b['tables']]
                if not paragraphs_ and not tables:
                    continue
                reg = re.search(r'設置規則第?\s*(\d+(?:-\d+)?)\s*條', unit['title'])
                reg = reg[1] if reg else '221' if unit['category'] == '號誌' else '圖例'
                if unit['category'] == '號誌':
                    rule = re.search(r'設置規則第?\s*(\d+(?:-\d+)?)\s*條', '\n'.join(paragraphs_))
                    reg = rule[1] if rule else reg
                name = re.split(r'，(?:設置規則|市區道路)', unit['title'], maxsplit=1)[0]
                name = re.sub(r'「[^」]*(?:警|禁|遵|限|指)\s*\d+[^」]*」', '', name).strip()
                # A combined heading/body paragraph is retained verbatim below.
                if len(name) > 65:
                    name = '禁止臨時停車標誌' if '禁止臨時停車標誌' in name else unit['category'] + '設置解說'
                if name in ('分隔島', '槽化島', '公車停靠站', '實體人行道'):
                    unit['category'] = '道路設施'
                norm = normalize_name(name)
                matched = next((a for a in old if a['id'] not in used and a['category'] == unit['category'] and normalize_name(a['name']) == norm), None)
                if unit['category'] == '號誌' and not matched:
                    check = re.search(r'檢查表第\[([^]]+)\]', name)
                    suffix = {'1': 'visible' if code == 'G2-01' else 'visible-1' if code == 'G2-03' else 'recognition-distance' if code == 'G2-04' else 'visibility' if code == 'G4-01' else 'visibility-1',
                              '2': 'left', '2a': 'far', '3': 'near' if code == 'G2-01' else 'near-alternative',
                              '3a': 'near-highspeed', '4': 'gap', '5': 'start', '6': 'clearance', '8': 'glare', '9': 'privacy'}.get(check[1]) if check else None
                    if not suffix:
                        suffix = 'pedestrian' if name == '「行人專用號誌」之佈設' else 'pedestrians' if '不設行人專用號誌' in name else 'phase-two' if '時相規劃' in name else 'permissive' if code in ('G2-01', 'G4-04') and name == '號誌配置與逐向檢核' else 'signal-plan' if name == '號誌配置與逐向檢核' else None
                    matched = next((a for a in old if a['id'] == prefix + '-' + str(suffix) and a['id'] not in used), None)
                if not matched:
                    matched = next((a for a in old if a['id'] not in used and a['category'] == unit['category'] and str(a['reg']) == reg and reg not in ('221', '圖例')), None)
                anchor = matched['id'] if matched else prefix + '-docx-p' + str(unit['blocks'][0]['index'])
                if matched:
                    used.add(anchor)
                nums = []
                for b in unit['blocks']:
                    if b['style'] in ('af', 'table'):
                        nums += re.findall(r'圖\s*(\d+\.\d+[-－]\d+)', b['text'])
                unit_figures = [f for number in dict.fromkeys(nums) for f in figure_map.get(number.replace('－', '-'), [])]
                first_figure = [f for f in unit_figures if f['number'] == unit_figures[0]['number']] if unit_figures else []
                map_key = max(first_figure, key=lambda f: assets[f['key']]['width'] * assets[f['key']]['height'])['key'] if first_figure else overall_key
                image = assets[map_key]
                pages = page_points(paragraphs_)
                if not pages:
                    pages = [['逐方向檢核結果詳見本頁表格。']]
                for page_index, points in enumerate(pages):
                    article_id = anchor if page_index == 0 else anchor + '-part-' + str(page_index + 1)
                    article = {'id': article_id, 'scenario': scene['id'], 'name': name + ('（續 %s）' % (page_index + 1) if page_index else ''),
                               'reg': reg, 'category': unit['category'], 'reference': 'DOCX §' + re.match(r'^[\d.]+', unit['section'])[0] if unit['category'] == '號誌' or reg == '圖例' else '《設置規則》§ ' + reg,
                               'asset': map_key, 'mapAsset': map_key, 'box': [0, 0, image['width'], image['height']],
                               'crop': [0, 0, image['width'], image['height']], 'noDefaultHighlight': True,
                               'points': points, 'locate': '對照圖例閱讀本項設置解說。', 'takeaway': '',
                               'sourceHeading': unit['title'], 'sourceParagraphs': paragraphs_, 'sourceRaw': '\n\n'.join(paragraphs_),
                               'sourceDocument': {**source_info, 'section': re.match(r'^[\d.]+', unit['section'])[0]},
                               'sourceFigures': unit_figures, 'sourceTables': [{'rows': rows} for _, rows in tables],
                               'sourceBlocks': [b['index'] for b in unit['blocks']]}
                    if matched and matched.get('moduleLinks'):
                        article['moduleLinks'] = matched['moduleLinks']
                    generated.append(article)
                    changed_map_ids.add(article_id)
                # Tables receive their own readable page and retain cell text,
                # including merged-cell repeated labels and direction headers.
                for table_index, (b, rows) in enumerate(tables):
                    width = max(map(len, rows))
                    normalized = [row + [''] * (width - len(row)) for row in rows]
                    before = next((x['text'] for x in reversed(unit['blocks'][:unit['blocks'].index(b)]) if x['style'] == 'ad' and x['text']), name + '檢核表')
                    table_article = copy.deepcopy(generated[-1])
                    header = next((i for i, row in enumerate(normalized) if sum(bool(cell) for cell in row) > 1), 0)
                    direction = ' / '.join(row[0] for row in normalized[:header] if row[0])
                    table_article.update(id=anchor + '-table-' + str(table_index + 1), name=before,
                                         points=['表格依 DOCX 原表逐格轉錄；請按各方向檢核。'],
                                         table={'columns': normalized[header], 'rows': normalized[header + 1:]},
                                         sourceRaw='\n'.join(' | '.join(row) for row in normalized))
                    generated.append(table_article)
                    changed_map_ids.add(table_article['id'])
            if not generated:
                raise ValueError('No articles for ' + code)
            doc['articles'] = generated
            scene['sourceFigures'] = figures
            scene['articleIds'] = [a['id'] for a in generated]
            new_ids.update(scene['articleIds'])
            main_topics = [a for a in generated if '-part-' not in a['id'] and '-table-' not in a['id']]
            representatives = main_topics[:4]
            scene['overviewRows'] = [[a['id'], '%02d　%s' % (i + 1, a['name']), a['reference']] for i, a in enumerate(representatives)]
            view['overview'] = {'intro': scene['overviewIntro'], 'rows': scene['overviewRows']}
            review_rows = [[a['name'], first_sentence(a['points'][0]), a['reference']] for a in main_topics[1:4]]
            scene['recapRows'] = review_rows
            scene['recapTitle'] = code + ' 設置重點'
            scene['recapIntro'] = '依本例道路條件、交通設施設置建議及各項解說，逐項檢核配置。'
            view['review'] = {'title': scene['recapTitle'], 'intro': scene['recapIntro'], 'rows': review_rows, 'sourceLine': source_line}
            # Existing comparison pages remain, now using the DOCX alternatives.
            if scene.get('comparisonId'):
                options = [f for f in figures if re.search(r'(不設置|設置)行穿線', f['label'])]
                if len(options) >= 2:
                    scene['comparisonRows'] = [[f['key'], '不設置行穿線' if '不設置' in f['label'] else '設置行穿線', f['label'], '圖' + f['number']] for f in options[:2]]
                scene['comparisonSourceLine'] = source_line
                scene['comparisonHeadline'] = '依行人需求與道路條件選擇配置。'
                scene['comparisonNote'] = '兩個方案的適用條件與配套設施，請對照本例枕木紋行人穿越道線解說。'
            if 'embeddedAssets' in doc:
                for key, asset in assets.items():
                    doc['embeddedAssets'][key] = {'url': quote(asset['file'], safe='/'), 'width': asset['width'], 'height': asset['height']}
                    doc['assetNames'][key] = Path(asset['file']).name
                    doc['assetMeta'][key] = {'scenario': scene['id'], 'label': asset['label'], 'rotation': 0}
                # The historical scenario.assets is a filename lookup only.
                scene['assets'] = {key: Path(asset['file']).name for key, asset in assets.items()}
            changes[file] = doc
            report.append({'code': code, 'section': case['section'], 'articlesBefore': len(old), 'articlesAfter': len(generated),
                           'figures': len(figures), 'tables': sum(bool(a.get('table')) for a in generated),
                           'reusedIds': sorted(used), 'removedIds': [a['id'] for a in old if a['id'] not in used], 'facts': facts})
        # The legacy reconstruction order must also know new base-case pages.
        checklist = next(a['id'] for a in changes['data/scenarios/G2-01.json']['articles'] if a.get('table') and '符合法規情況' in a['name'])
        for case in cases:
            for article in changes['data/scenarios/' + case['code'] + '.json']['articles']:
                for link in article.get('moduleLinks', []):
                    if link.get('page') == 'g201-checklist':
                        link['page'] = checklist
                        link['label'] = 'G2-01 逐方向號誌檢核表'
        base_docs = [changes[file] for file in base['caseFiles']]
        base['articleOrder'] = [a['id'] for d in base_docs for a in d['articles']]
        for prop, field in [('nameOrder', 'assetNames'), ('assetOrder', 'embeddedAssets'), ('metaOrder', 'assetMeta')]:
            base[prop] = list(dict.fromkeys(key for d in base_docs for key in d[field]))
        changes['data/scenarios/presentation.json'] = base
        catalog['source']['generalDocument'] = {'file': source.name, 'sha256': digest, 'sections': [case['section'] for case in cases]}
        changes['data/scenarios/catalog.json'] = catalog
        # Imported text is authoritative over previous saved text/list overrides.
        # Keep photos and unrelated user-created pages; back up every changed file.
        content_catalog = read('data/content/catalog.json')
        for key in old_ids - new_ids:
            content_catalog['owners'].pop(key, None)
        for case in cases:
            for article in changes['data/scenarios/' + case['code'] + '.json']['articles']:
                content_catalog['owners'][article['id']] = 'scenarios/' + case['code']
        changes['data/content/catalog.json'] = content_catalog
        for file in content_catalog['files']:
            content = read(file)
            if not re.match(r'^scenarios/G[1-4]-', content['owner']):
                continue
            content['texts'] = {}
            for kind in ('articles', 'overviews'):
                content.get('content', {}).setdefault(kind, {}).clear()
            for key in list(content.get('blocks', {})):
                if key.split('|')[0] in old_ids:
                    del content['blocks'][key]
            changes[file] = content
        navigation = read('data/presentation-navigation.json')
        for case in cases:
            scene = changes['data/scenarios/' + case['code'] + '.json']['scenario']
            order = navigation['pageOrder']
            members = set(scene['articleIds']) | old_ids_by_code[case['code']]
            order = [p for p in order if p not in members and p != scene.get('comparisonId')]
            at = order.index(scene['overviewId']) + 1 if scene['overviewId'] in order else len(order)
            sequence = list(scene['articleIds'])
            if scene.get('comparisonId'):
                crosswalk = next((a['id'] for a in changes['data/scenarios/' + case['code'] + '.json']['articles'] if a['reg'] == '185'), None)
                if crosswalk:
                    sequence.insert(sequence.index(crosswalk) + 1, scene['comparisonId'])
            order[at:at] = sequence
            navigation['pageOrder'] = order
            navigation.get('navigationOrders', {}).pop('scenario:' + scene['id'], None)
        changes['data/presentation-navigation.json'] = navigation
        # Changed drawings need new camera defaults, otherwise an old saved
        # crop/highlight would point at unrelated source-image coordinates.
        layout = read('layout/presentation-layout.json')
        for key in list(layout['legacyState'].get('layouts', {})):
            if key in old_ids | changed_map_ids:
                del layout['legacyState']['layouts'][key]
        for field in ('highlights', 'disabledHighlights'):
            for key in list(layout['legacyState'].get(field, {})):
                if key.removeprefix('article:') in old_ids | changed_map_ids:
                    del layout['legacyState'][field][key]
        for key, value in list(layout.get('imageViews', {}).items()):
            if value.get('assetKey') in changed_overall or value.get('pageId') in old_ids | changed_map_ids:
                del layout['imageViews'][key]
        changes['layout/presentation-layout.json'] = layout
        # Text-only scope: merge source wording into existing pages. All earlier
        # figure/table preparation stays in memory and is never written.
        text_changes, text_report = {}, []
        generated = {case['code']: changes['data/scenarios/' + case['code'] + '.json'] for case in cases}
        updated_ids = set()
        for case in cases:
            code = case['code']
            relative = 'data/scenarios/' + code + '.json'
            original, prepared = read(relative), generated[code]
            lookup = {a['id']: a for a in prepared['articles']}
            revised = []
            for article in original['articles']:
                candidate = lookup.get(article['id'])
                # Some original slides divide a single Word topic into views.
                if not candidate and article['category'] == '號誌':
                    suffix = article['id'].split('-', 1)[1]
                    check = {'privacy': '9', 'glare': '8', 'visible-2': '1', 'visible-3': '1', 'visibility-2': '1', 'curve-option-1': '1', 'curve-option-2': '1', 'curve-option-3': '1', 'near-alternative': '3'}.get(suffix)
                    search = prepared['articles']
                    if check in ('8', '9'):
                        search = generated['G2-02' if check == '8' else 'G2-03']['articles']
                    if check:
                        candidate = next((a for a in search if '檢查表第[' + check + ']' in a.get('sourceHeading', '')), None)
                    elif suffix in ('protected', 'checklist', 'backboard', 'risk', 'far-post', 'left-signal'):
                        candidate = next((a for a in search if a.get('sourceHeading') == '號誌配置與逐向檢核'), None)
                if not candidate:
                    continue
                for key in ('sourceHeading', 'sourceParagraphs', 'sourceRaw', 'sourceDocument'):
                    article[key] = copy.deepcopy(candidate[key])
                # Keep original titles, images, tables and number of slides.
                # Select complete source sentences, with full wording in source.
                source_sentences = [s for paragraph in article['sourceParagraphs'] for s in sentences(paragraph) if len(s) > 20]
                if source_sentences and 'table' not in article:
                    count = max(1, len(article['points']))
                    article['points'] = source_sentences[:count]
                if article['id'] == 'pedestrian':
                    article['points'] = ['無號誌路口設有行穿線之處，建議設置當心行人標誌「警34」。', '建議設於行穿線臨近停止線端的邊緣處，距行穿線小於等於 5 m；可共桿並加設「減速慢行暫停讓行人」附牌。', '亦可於上游距行穿線約 30 m 增設一面，附「前方30公尺」，並依行車速限及最短安全視距增加。']
                elif article['id'] == 'arrows':
                    article['points'] = ['直右共用混合車道寬度為 3.5 m 以下時，採直線與弧形合併的分岔箭頭。', '車道寬度為 3.5 m 以上時，採直線與弧形分離並列的分流式指向線，提醒右轉車提早靠右。', '車道寬度為 4.5 m 以上時，以路面邊線及槽化線限縮至 4.5 m，避免車輛併行。']
                elif article['id'] == 'edge':
                    article['points'] = ['路面邊線為 15 cm 寬白實線，界定最右側行車道與路側服務空間；應與 10 cm 的快慢車道分隔線區分。', '建議車輛停放線與路面邊線保留約 30 cm 緩衝，路段邊線接續路口轉角的邊線。', '轉角未設人行道標線時，建議自停止線起至上游 10 m 的路肩劃設槽化線，實際長度以滿足視距三角淨空為主。']
                elif article['id'] == 'parking':
                    article['points'] = ['大型重型機車以外的機車停放線配置於較靠近路口處，小型車及大型重型機車格位配置於較遠離路口處；大型客車停放線置於路段。', '建議佈設於距橫交道路緣延伸處 10 至 30 m 以外，並與路面邊線保留約 30 cm 間隔。', '約 30 cm 間隔自路面邊線中心點，量至車輛停放線邊緣。']
                revised.append(article['id'])
                updated_ids.add(article['id'])
            original['scenario']['sourceDocument'] = copy.deepcopy(prepared['scenario']['sourceDocument'])
            original['scenario']['sourceParagraphs'] = list(dict.fromkeys(
                prepared['scenario']['sourceParagraphs'] + [p for a in prepared['articles'] if 'table' not in a for p in [a['sourceHeading'], *a['sourceParagraphs']]]))
            text_changes[relative] = original
            text_report.append({'code': code, 'updatedArticles': revised, 'retainedPages': len(original['articles'])})
        for relative in read('data/content/catalog.json')['files']:
            if not re.match(r'^data/content/scenarios/G', relative):
                continue
            content = read(relative)
            content['texts'] = {k: v for k, v in content.get('texts', {}).items() if k.split('|')[0] not in updated_ids}
            for key in updated_ids:
                content.get('content', {}).get('articles', {}).pop(key, None)
            text_changes[relative] = content
        changes, image_writes, report = text_changes, {}, text_report
        report_file = source.parent / 'docx-text-import-report.json'
        report_file.write_text(encoded({'source': source.name, 'sha256': digest, 'scenarios': report}), encoding='utf-8')
        if args.apply:
            backup = ROOT / 'exports/project-backups' / ('docx-import-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
            for file, value in changes.items():
                target = ROOT / file
                if target.exists():
                    saved = backup / file
                    saved.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(target, saved)
                target.write_text(encoded(value), encoding='utf-8')
            for file, payload in image_writes.items():
                target = ROOT / file
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(payload)
            print('Backup:', backup.relative_to(ROOT))
        print(encoded({'applied': args.apply, 'scenarios': len(report), 'articles': sum(r['retainedPages'] for r in report),
                       'updatedArticles': len(updated_ids), 'imagesAndTablesChanged': 0,
                       'report': str(report_file.relative_to(ROOT))}))


if __name__ == '__main__':
    main()
