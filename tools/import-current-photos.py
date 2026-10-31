"""Archive user-provided current photos and attach them to their confirmed case.

Usage: import-current-photos.py C1-02 photo1.png photo2.png --date YYYY-MM-DD
Run with just the case ID to reapply its archived user photos after regenerating
the original PowerPoint manifest. Existing files and stable image IDs are kept.
"""
import argparse,hashlib,importlib.util,json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('conditions',ROOT/'tools/extract-results-current-conditions.py')
conditions=importlib.util.module_from_spec(spec);spec.loader.exec_module(conditions)

def read(file):return json.loads(file.read_text(encoding='utf-8'))
def raw_json(value):return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
def upsert(items,value,identify):
    for index,item in enumerate(items):
        if identify(item)==identify(value):items[index]=value;return
    items.append(value)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('scenario');parser.add_argument('photos',nargs='*',type=Path);parser.add_argument('--date');args=parser.parse_args()
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    code=args.scenario
    if not re.fullmatch(r'[GC][1-4]-\d{2}',code):raise ValueError('Invalid scenario ID')
    path=ROOT/'data/results/current-conditions.json';manifest=read(path);entry=manifest['scenarios'][code]
    if entry['issue'].get('sourceMissing'):raise ValueError('The missing scenario requires a diagram and issue content first')
    category='04-一般道路情境' if code.startswith('G') else '05-複雜道路情境'
    folder=ROOT/'materials'/category/'current-conditions'/code
    if (ROOT/entry['archive']).resolve()!=folder.resolve():raise ValueError('Unexpected archive destination')
    archive_path=folder/(code+'_user-photos.json')
    archive=read(archive_path) if archive_path.exists() else {'schemaVersion':1,'scenario':code,'sourceType':'user-attachments','receivedDate':args.date,'note':'使用者確認對應情境；照片依提供順序保存，不拆分組合圖。','files':[]}
    if archive['scenario']!=code:raise ValueError('Photo archive belongs to another case')
    if not archive['receivedDate'] or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',archive['receivedDate']):raise ValueError('Supply the attachment date')
    copies=[]
    for photo in args.photos:
        raw=photo.read_bytes();sha=hashlib.sha256(raw).hexdigest()
        if any(item['sha256']==sha for item in archive['files']):continue
        width,height=conditions.dimensions(raw);extension='.png' if raw.startswith(b'\x89PNG') else '.jpg'
        used=set(manifest['assets'])|{item['key'] for item in archive['files']};number=1
        while 'results:'+code.lower()+'-photo-'+str(number) in used or any(folder.glob(code+'_現況照片_'+str(number).zfill(2)+'.*')):number+=1
        key='results:'+code.lower()+'-photo-'+str(number);target=folder/(code+'_現況照片_'+str(number).zfill(2)+extension)
        asset={'key':key,'file':target.relative_to(ROOT).as_posix(),'width':width,'height':height,'label':code+' 現況照片'+(' '+str(number) if number>1 else ''),'scenario':code,'role':'photo','rotation':0,'sha256':sha}
        archive['files'].append(asset);copies.append((target,raw))
    if not archive['files']:raise ValueError('No user photos to import')
    for item in archive['files']:
        original=ROOT/item['file']
        expected=folder/original.name
        if original.resolve()!=expected.resolve() or not original.name.startswith(code+'_現況照片_'):raise ValueError('Invalid archived photo path')
        raw=next((raw for target,raw in copies if target==original),None)
        if raw is None:raw=original.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=item['sha256']:raise ValueError('Archived photo changed; review separately')
    archive_bytes=raw_json(archive);source={'file':archive_path.name,'sha256':hashlib.sha256(archive_bytes).hexdigest(),'type':'user-attachments','receivedDate':archive['receivedDate']}
    issue=entry['issue']
    for item in archive['files']:
        key=item['key'];asset={k:v for k,v in item.items() if k!='key'};asset['source']=source
        if key in manifest['assets'] and manifest['assets'][key]['sha256']!=item['sha256']:raise ValueError('Photo identity collision')
        manifest['assets'][key]=asset
        upsert(issue['images'],{'key':key,'label':item['label'][len(code)+1:],'role':'photo','rotation':0},lambda value:value['key'])
    issue['photoStatus']='available';entry['photoSource']={'source':source,'files':[item['key'] for item in archive['files']]}
    identify=lambda value:(value['source'].get('type'),value['source']['file'])
    info=read(folder/'source.json')
    upsert(info.setdefault('supplementalSources',[]),{'source':source,'role':'photo','files':archive['files']},identify)
    upsert(manifest.setdefault('supplementalSources',[]),{'source':source,'role':'photo','scenarios':[code]},identify)
    index_path=folder.parent/'overall-presentation-index.json';index=read(index_path)
    index['supplementalSources']=manifest['supplementalSources']
    for case in index['scenarios']:
        if case['id']==code:case['images']=len(issue['images']);case['photoSource']=entry['photoSource']
    for target,raw in copies:target.write_bytes(raw)
    archive_path.write_bytes(archive_bytes);conditions.dump(folder/'source.json',info);conditions.dump(index_path,index);conditions.dump(path,manifest)
    print(json.dumps({'scenario':code,'imported':len(copies),'userPhotos':len(archive['files']),'keys':entry['photoSource']['files']},ensure_ascii=False))

if __name__=='__main__':main()
