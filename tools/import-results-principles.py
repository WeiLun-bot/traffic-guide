"""Copy supplied PowerPoint titles and paragraphs into the first deck, without rewriting text."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
IDS = ['results-principles', 'results-principles-markings-requirements',
       'results-principles-signs', 'results-principles-signs-continued',
       'results-principles-signs-requirements', 'results-principles-signals',
       'results-principles-signals-requirements']
HEADINGS = {'基本要求', '設置與設計原則', '設置原則', '設計原則'}


def paragraphs(shape):
    result = []
    for paragraph in shape.findall('p:txBody/a:p', NS):
        text = ''.join((node.text or '') if node.tag == '{%s}t' % NS['a'] else '\n'
                       for node in paragraph.iter()
                       if node.tag in ('{%s}t' % NS['a'], '{%s}br' % NS['a'])).strip()
        if text:
            result.append(text)
    return result


def read(source):
    with zipfile.ZipFile(source) as archive:
        if any(name.startswith('ppt/media/') for name in archive.namelist()):
            raise ValueError('This text import requires review if the PowerPoint contains images.')
        relationships = ET.fromstring(archive.read('ppt/_rels/presentation.xml.rels'))
        targets = {item.get('Id'): item.get('Target') for item in relationships}
        presentation = ET.fromstring(archive.read('ppt/presentation.xml'))
        pages = []
        for number, slide_id in enumerate(presentation.findall('p:sldIdLst/p:sldId', NS), 1):
            target = targets[slide_id.get('{%s}id' % NS['r'])]
            part = target.lstrip('/') if target.startswith('/') else 'ppt/' + target
            slide = ET.fromstring(archive.read(part))
            title, body = [], []
            for shape in slide.findall('.//p:sp', NS):
                placeholder = shape.find('.//p:ph', NS)
                kind = placeholder.get('type') if placeholder is not None else None
                if kind in ('sldNum', 'dt', 'ftr', 'hdr'):
                    continue
                (title if kind in ('title', 'ctrTitle') else body).extend(paragraphs(shape))
            if len(title) != 1 or not body:
                raise ValueError('Each source page must have one title and nonempty body: %d' % number)
            pages.append({'slide': number, 'part': part, 'title': title[0], 'paragraphs': body})
    if len(pages) != len(IDS):
        raise ValueError('Review the slide mapping before importing a different number of pages.')
    return pages


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    raw = args.source.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    slides = read(io.BytesIO(raw))
    folder = ROOT / 'materials' / '01-佈設原則'
    archive = folder / args.source.name
    if archive.exists() and archive.read_bytes() != raw:
        raise ValueError('Existing source archive differs; preserve it for review: ' + str(archive))
    source = {'file': archive.relative_to(ROOT).as_posix(), 'sha256': digest, 'slideCount': len(slides)}
    pages = []
    for slide, page_id in zip(slides, IDS):
        sections = []
        for index, text in enumerate(slide['paragraphs'], 1):
            key = 'source-s%d-p%d' % (slide['slide'], index)
            heading = text in HEADINGS or slide['slide'] == 7 and index in (2, 4)
            if heading:
                sections.append({'id': key, 'title': text, 'paragraphs': []})
            else:
                if not sections:
                    sections.append({'id': 'source-s%d-body' % slide['slide'], 'paragraphs': []})
                sections[-1]['paragraphs'].append({'id': key, 'text': text,
                                                  'numbered': bool(re.match(r'^\d+\. ', text))})
        for section in sections:
            if len(section['paragraphs']) >= 8:
                section['columns'] = 2
        pages.append({'id': page_id, 'chapter': 'results-principles', 'type': 'principles',
                      'title': slide['title'], 'sections': sections,
                      'density': 'compact' if slide['slide'] == 4 else 'normal',
                      'source': dict(source, slide=slide['slide'], part=slide['part'])})
    outline_path = ROOT / 'data/results/outline.json'
    original = outline_path.read_text(encoding='utf-8')
    outline = json.loads(original)
    existing = [page for page in outline['pages'] if page['chapter'] == 'results-principles']
    first = outline['pages'].index(existing[0])
    following = outline['pages'][first + len(existing)]
    start = re.search(r'^    \{"id":"results-principles"', original, re.M)
    end = re.search(r'^    \{"id":"' + re.escape(following['id']) + '"', original, re.M)
    # Generated pages are deliberately kept in the same compact form as the outline.
    if not start or not end:
        raise ValueError('The outline formatting changed; review the import boundaries.')
    text = '\n'.join('    ' + json.dumps(page, ensure_ascii=False, separators=(',', ':')) + ','
                     for page in pages) + '\n'
    replacement = original[:start.start()] + text + original[end.start():]
    updated = json.loads(replacement)
    assert [page for page in updated['pages'] if page['chapter'] == 'results-principles'] == pages
    folder.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        archive.write_bytes(raw)
    assert archive.read_bytes() == raw
    (folder / 'source.json').write_text(json.dumps(dict(source, slides=slides), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if outline_path.read_text(encoding='utf-8') != original:
        raise ValueError('The outline changed during import; run again with the latest source.')
    outline_path.write_bytes(replacement.encode('utf-8'))
    print(json.dumps({'pages': len(pages), 'sourceSha256': digest,
                      'bodyParagraphs': sum(len(slide['paragraphs']) for slide in slides)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
