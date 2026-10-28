"""Inventory and copy embedded assets from the supplied current-conditions deck."""
from __future__ import print_function
import hashlib
import json
from pathlib import Path
import posixpath
import struct
import sys
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r'C:\Users\cz200\Downloads\G1-01現況圖、現況問題.pptx')
DEST = ROOT / 'materials' / '04-一般道路情境' / 'current-conditions'
OUT = ROOT / 'content' / '04-general-scenarios' / 'current-conditions-inventory.json'
NS = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}

def attrs(el):
    return dict(el.attrib) if el is not None else None

def xfrm(el):
    if el is None:
        return None
    return dict(attributes=attrs(el), children=[dict(tag=c.tag.split('}')[-1], **c.attrib) for c in el])

def dimensions(raw):
    if raw.startswith(b'\x89PNG\r\n\x1a\n'):
        w, h = struct.unpack('>II', raw[16:24])
        return {'width': w, 'height': h}
    if raw.startswith(b'\xff\xd8'):
        i = 2
        while i + 9 < len(raw):
            if raw[i] != 255:
                i += 1
                continue
            code = raw[i+1]
            if code in (0xc0, 0xc1, 0xc2, 0xc3):
                h, w = struct.unpack('>HH', raw[i+5:i+9])
                return {'width': w, 'height': h}
            if code in (0xd8, 0xd9):
                i += 2
            else:
                i += 2 + struct.unpack('>H', raw[i+2:i+4])[0]
    return None

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    result = {'source': str(SOURCE), 'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(), 'slideSize': None, 'slides': [], 'media': []}
    with zipfile.ZipFile(str(SOURCE)) as z:
        pres = ET.fromstring(z.read('ppt/presentation.xml'))
        result['slideSize'] = attrs(pres.find('p:sldSz', NS))
        media = [n for n in z.namelist() if n.startswith('ppt/media/') and not n.endswith('/')]
        for name in media:
            raw = z.read(name)
            target = DEST / posixpath.basename(name)
            target.write_bytes(raw)
            result['media'].append({'zipPath': name, 'path': target.relative_to(ROOT).as_posix(), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'dimensions': dimensions(raw)})
        slides = sorted([n for n in z.namelist() if n.startswith('ppt/slides/slide') and n.endswith('.xml')], key=lambda x: int(posixpath.basename(x)[5:-4]))
        for name in slides:
            xml = ET.fromstring(z.read(name))
            relpath = posixpath.join(posixpath.dirname(name), '_rels', posixpath.basename(name) + '.rels')
            rels = {}
            if relpath in z.namelist():
                for rel in ET.fromstring(z.read(relpath)):
                    rels[rel.attrib['Id']] = rel.attrib
            slide = {'number': int(posixpath.basename(name)[5:-4]), 'texts': [], 'pictures': [], 'groups': []}
            for shape in xml.findall('.//p:sp', NS):
                paragraphs = [''.join(t.text or '' for t in p.findall('.//a:t', NS)) for p in shape.findall('.//a:p', NS)]
                paragraphs = [p for p in paragraphs if p.strip()]
                if paragraphs:
                    slide['texts'].append({'paragraphs': paragraphs, 'shape': attrs(shape.find('p:nvSpPr/p:cNvPr', NS)), 'transform': xfrm(shape.find('p:spPr/a:xfrm', NS))})
            for group in xml.findall('.//p:grpSp', NS):
                slide['groups'].append(xfrm(group.find('p:grpSpPr/a:xfrm', NS)))
            for pic in xml.findall('.//p:pic', NS):
                blip = pic.find('.//a:blip', NS)
                rid = blip.attrib.get('{%s}embed' % NS['r']) if blip is not None else None
                rel = rels.get(rid, {})
                target = posixpath.normpath(posixpath.join(posixpath.dirname(name), rel.get('Target', '')))
                slide['pictures'].append({'shape': attrs(pic.find('p:nvPicPr/p:cNvPr', NS)), 'relationship': rid, 'zipPath': target, 'path': 'materials/04-一般道路情境/current-conditions/' + posixpath.basename(target), 'crop': attrs(pic.find('p:blipFill/a:srcRect', NS)), 'transform': xfrm(pic.find('p:spPr/a:xfrm', NS))})
            result['slides'].append(slide)
    result['interpretation'] = {
        'g1-01': {'diagram': 'image1.png', 'diagramSlide': 1, 'photos': ['image2.jpeg', 'image3.jpeg'], 'problemsSlide': 2, 'recommendedClockwiseRotation': 90,
                  'note': '原始 PPTX 旋轉 270 度；目前簡報改善圖採順時針 90 度，為保持道路朝向建議將現況圖也採順時針 90 度。'},
        'g1-02': {'diagram': 'image4.png', 'diagramSlide': 3, 'photos': ['image5.png', 'image6.png'], 'problemsSlide': 4, 'recommendedClockwiseRotation': 0,
                  'note': '投影片 3 標題為 G1-02 現況圖；投影片 4 原始標題為「1-2 無號誌市區斜交三叉路口標誌現況問題分析」。其市區問題照片與河岸圖面不同，分類與現地對應需保留來源註記供操作者核對。'},
        'comparison': '兩組圖面呈現範圍與道路繪製尺度不同。左右滑動可作現況與設置示意的視覺比較，不宜聲稱為同一量測底圖的精確像素對位。'
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'slides': len(result['slides']), 'media': len(result['media']), 'inventory': str(OUT)}, ensure_ascii=True))

if __name__ == '__main__':
    main()
