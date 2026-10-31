"""Copy a reviewed scenario's issue content, preserving ownership and provenance.

Usage: reuse-current-conditions.py C2-02 C4-04 --date YYYY-MM-DD
Reapply after rebuilding original sources and restoring the source case's photos.
Existing destination media must match exactly; original sources are never changed.
"""
import argparse, copy, hashlib, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(file):
    return json.loads(file.read_text(encoding='utf-8'))

def raw_json(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')

def write(file, value):
    file.write_bytes(raw_json(value))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('target')
    parser.add_argument('source')
    parser.add_argument('--date', required=True)
    args = parser.parse_args()
    if not all(re.fullmatch(r'[GC][1-4]-\d{2}', code) for code in [args.target, args.source]) or args.target == args.source:
        raise ValueError('Use different valid scenario IDs')
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', args.date):
        raise ValueError('Invalid request date')
    manifest_path = ROOT / 'data/results/current-conditions.json'
    manifest = read(manifest_path)
    source, target = manifest['scenarios'][args.source], manifest['scenarios'][args.target]
    if source['issue'].get('sourceMissing') or not source['issue']['images']:
        raise ValueError('Source scenario has no issue content')
    if target['issue']['images'] and target.get('reuseSource', {}).get('scenario') != args.source:
        raise ValueError('Destination already has independent content; review before replacing it')
    category = '04-一般道路情境' if args.target.startswith('G') else '05-複雜道路情境'
    folder = ROOT / 'materials' / category / 'current-conditions' / args.target
    if (ROOT / target['archive']).resolve() != folder.resolve() or not folder.is_dir():
        raise ValueError('Unexpected destination archive')
    issue, files, copies, counts = copy.deepcopy(source['issue']), [], [], {}
    issue.pop('sourceMissing', None)
    for image in issue['images']:
        original_key = image['key']
        original = manifest['assets'][original_key]
        raw = (ROOT / original['file']).read_bytes()
        if original['scenario'] != args.source or hashlib.sha256(raw).hexdigest() != original['sha256']:
            raise ValueError('Source image ownership or checksum changed')
        role = image['role']
        counts[role] = counts.get(role, 0) + 1
        key = 'results:' + args.target.lower() + '-' + role + '-' + str(counts[role])
        name = args.target + '_' + ('現況圖' if role == 'diagram' else '現況照片') + '_' + str(counts[role]).zfill(2) + Path(original['file']).suffix
        destination = folder / name
        if destination.exists() and destination.read_bytes() != raw:
            raise ValueError('Destination media differs; preserve it and review')
        if key in manifest['assets'] and manifest['assets'][key]['sha256'] != original['sha256']:
            raise ValueError('Destination image ID already belongs to different media')
        asset = copy.deepcopy(original)
        asset.update(file=destination.relative_to(ROOT).as_posix(), scenario=args.target, label=args.target + ' ' + image['label'])
        asset.pop('source', None)
        asset['reusedFrom'] = {'scenario':args.source, 'key':original_key, 'file':original['file'], 'source':original.get('source', manifest['source'])}
        image['key'] = key
        files.append({'key':key, **asset})
        copies.append((destination, raw))
    snapshot_path = folder / (args.target + '_reused-content.json')
    snapshot = {'schemaVersion':1, 'scenario':args.target, 'fromScenario':args.source, 'requestedDate':args.date, 'note':'依使用者指示複用現況圖、照片與議題；保留目標情境編號與名稱。', 'sourceSlides':source['sourceSlides'], 'issue':issue, 'files':files}
    snapshot_bytes = raw_json(snapshot)
    reference = {'file':snapshot_path.name, 'sha256':hashlib.sha256(snapshot_bytes).hexdigest(), 'type':'scenario-reuse', 'receivedDate':args.date}
    for item in files:
        manifest['assets'][item['key']] = {k:v for k,v in item.items() if k != 'key'}
        manifest['assets'][item['key']]['source'] = reference
    target.update(issue=issue, sourceSlides=source['sourceSlides'], reuseSource={'scenario':args.source, 'source':reference})
    target['photoSource'] = {'source':reference, 'files':[item['key'] for item in files if item['role'] == 'photo']}
    supplemental = {'source':reference, 'role':'issue', 'scenarios':[args.target]}
    manifest['supplementalSources'] = [item for item in manifest.get('supplementalSources', []) if (item['source'].get('type'),item['source']['file']) != ('scenario-reuse', snapshot_path.name)] + [supplemental]
    info_path = folder / 'source.json'
    info = read(info_path)
    previous = info.get('originalSourceStatus') or {k:v for k,v in info.items() if k in ['source','status','note']}
    info.update(status='scenario-reuse', source=reference, fromScenario=args.source, sourceSlides=source['sourceSlides'], files=files, originalSourceStatus=previous, note=snapshot['note'])
    index_path = folder.parent / 'overall-presentation-index.json'
    index = read(index_path)
    index['supplementalSources'] = manifest['supplementalSources']
    for item in index['scenarios']:
        if item['id'] == args.target:
            item.update(slides=source['sourceSlides'], sourceMissing=False, images=len(files), reusedFrom=args.source, photoSource=target['photoSource'])
    for destination, raw in copies:
        if not destination.exists():
            destination.write_bytes(raw)
    snapshot_path.write_bytes(snapshot_bytes)
    write(info_path, info)
    write(index_path, index)
    write(manifest_path, manifest)
    print(json.dumps({'scenario':args.target,'reusedFrom':args.source,'images':len(files),'points':len(issue['items'])}))

if __name__ == '__main__':
    main()
