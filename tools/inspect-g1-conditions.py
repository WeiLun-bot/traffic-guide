"""Extract G1.pptx into a separate folder, preserving earlier source materials."""
from pathlib import Path
import hashlib
import importlib.util
import json
import posixpath
import sys
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('condition_inventory', str(Path(__file__).with_name('inspect-current-conditions.py')))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
NS = helper.NS
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r'C:\Users\cz200\Downloads\G1.pptx')
DEST = ROOT / 'materials' / '04-一般道路情境' / 'current-conditions' / 'G1'
OUT = ROOT / 'content' / '04-general-scenarios' / 'g1-conditions-inventory.json'

def relationships(archive, part):
    relpath = posixpath.join(posixpath.dirname(part), '_rels', posixpath.basename(part) + '.rels')
    if relpath not in archive.namelist():
        return {}
    return {rel.get('Id'): dict(rel.attrib) for rel in ET.fromstring(archive.read(relpath))}

def resolve(part, target):
    return posixpath.normpath(posixpath.join(posixpath.dirname(part), target))

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    result = {'source': SOURCE.name, 'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(), 'slides': [], 'media': []}
    with zipfile.ZipFile(str(SOURCE)) as archive:
        presentation = ET.fromstring(archive.read('ppt/presentation.xml'))
        result['slideSize'] = helper.attrs(presentation.find('p:sldSz', NS))
        presrels = relationships(archive, 'ppt/presentation.xml')
        for name in archive.namelist():
            if not name.startswith('ppt/media/') or name.endswith('/'):
                continue
            raw = archive.read(name)
            target = DEST / posixpath.basename(name)
            target.write_bytes(raw)
            result['media'].append({'zipPath': name, 'path': target.relative_to(ROOT).as_posix(), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'dimensions': helper.dimensions(raw)})
        for index, slide_id in enumerate(presentation.findall('p:sldIdLst/p:sldId', NS), 1):
            part = resolve('ppt/presentation.xml', presrels[slide_id.get('{%s}id' % NS['r'])]['Target'])
            xml = ET.fromstring(archive.read(part))
            rels = relationships(archive, part)
            slide = {'number': index, 'part': part, 'texts': [], 'pictures': [], 'groups': []}
            for shape in xml.findall('.//p:sp', NS):
                paragraphs = [''.join(t.text or '' for t in paragraph.findall('.//a:t', NS)) for paragraph in shape.findall('.//a:p', NS)]
                paragraphs = [p for p in paragraphs if p.strip()]
                if paragraphs:
                    slide['texts'].append({'paragraphs': paragraphs, 'shape': helper.attrs(shape.find('p:nvSpPr/p:cNvPr', NS)), 'transform': helper.xfrm(shape.find('p:spPr/a:xfrm', NS))})
            for group in xml.findall('.//p:grpSp', NS):
                slide['groups'].append(helper.xfrm(group.find('p:grpSpPr/a:xfrm', NS)))
            for picture in xml.findall('.//p:pic', NS):
                blip = picture.find('.//a:blip', NS)
                rel = rels.get(blip.get('{%s}embed' % NS['r']), {}) if blip is not None else {}
                part_name = resolve(part, rel.get('Target', ''))
                slide['pictures'].append({'shape': helper.attrs(picture.find('p:nvPicPr/p:cNvPr', NS)), 'zipPath': part_name, 'crop': helper.attrs(picture.find('p:blipFill/a:srcRect', NS)), 'transform': helper.xfrm(picture.find('p:spPr/a:xfrm', NS))})
            result['slides'].append(slide)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for slide in result['slides']:
        print('SLIDE', slide['number'], json.dumps([item['paragraphs'] for item in slide['texts']], ensure_ascii=False))
        for picture in slide['pictures']:
            asset = next((item for item in result['media'] if item['zipPath'] == picture['zipPath']), {})
            print('IMAGE', posixpath.basename(picture['zipPath']), asset.get('dimensions'), 'transform', picture['transform'], 'crop', picture['crop'])
    print('Inventory:', OUT.relative_to(ROOT).as_posix())

if __name__ == '__main__':
    main()
