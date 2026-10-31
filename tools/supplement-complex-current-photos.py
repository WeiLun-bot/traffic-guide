"""Add reviewed PPTX photos without replacing existing diagrams or editor settings.

Use complex-photo-sources.json to verify the deck and each photo's case mapping.
Copies embedded media byte for byte and keeps original and supplemental sources
separate in the public manifest and each case's archive.
"""
import argparse, copy, hashlib, importlib.util, json, posixpath, re, sys, unicodedata, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('conditions',ROOT/'tools/extract-results-current-conditions.py')
conditions=importlib.util.module_from_spec(spec);spec.loader.exec_module(conditions)
NS=conditions.NS

def read(file):return json.loads(file.read_text(encoding='utf-8'))
def digest(raw):return hashlib.sha256(raw).hexdigest()
def normalize(text):return re.sub(r'\s+','',unicodedata.normalize('NFKC',text))
def upsert(items,value,identify):
    for index,item in enumerate(items):
        if identify(item)==identify(value):items[index]=value;return
    items.append(value)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('pptx',type=Path);args=parser.parse_args()
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    mapping=read(ROOT/'data/results/complex-photo-sources.json');source=mapping['source']
    sha=hashlib.sha256()
    with args.pptx.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):sha.update(chunk)
    if sha.hexdigest()!=source['sha256']:raise ValueError('The deck differs from the reviewed photo mapping')
    manifest_path=ROOT/'data/results/current-conditions.json';manifest=read(manifest_path)
    writes=[];summaries=[]
    with zipfile.ZipFile(args.pptx) as archive:
        presentation=ET.fromstring(archive.read('ppt/presentation.xml'))
        rels={r.get('Id'):r.get('Target') for r in ET.fromstring(archive.read('ppt/_rels/presentation.xml.rels'))}
        parts=[posixpath.normpath(posixpath.join('ppt',rels[node.get('{'+NS['r']+'}id')])) for node in presentation.findall('p:sldIdLst/p:sldId',NS)]
        if len(parts)!=source['slideCount']:raise ValueError('Unexpected slide count')
        def slide(number):
            part=parts[number-1];node=ET.fromstring(archive.read(part))
            relpart=posixpath.join(posixpath.dirname(part),'_rels',posixpath.basename(part)+'.rels')
            refs={r.get('Id'):posixpath.normpath(posixpath.join(posixpath.dirname(part),r.get('Target'))) for r in ET.fromstring(archive.read(relpart)) if r.get('TargetMode')!='External'}
            text=' '.join(t.text or '' for t in node.findall('.//a:t',NS))
            return part,node,refs,text
        for code,reviewed in mapping['scenarios'].items():
            if not re.fullmatch(r'C[1-4]-\d{2}',code) or code not in manifest['scenarios']:raise ValueError('Unknown complex scenario')
            entry=manifest['scenarios'][code];issue=entry['issue']
            if issue.get('sourceMissing'):raise ValueError('Missing diagram and issue content require separate review')
            context=[slide(number) for number in reviewed['contextSlides']]
            context_text=normalize(' '.join(item[3] for item in context))
            if not all(normalize(word) in context_text for word in reviewed['contextText']):raise ValueError('Scenario title does not match reviewed context')
            folder=ROOT/entry['archive']
            expected=ROOT/'materials/05-複雜道路情境/current-conditions'/code
            if folder.resolve()!=expected.resolve():raise ValueError('Unexpected archive folder')
            provenance={'source':source,'role':'photo','contextSlides':reviewed['contextSlides'],'slides':[],'files':[]}
            for number,photo in enumerate(reviewed['photos'],1):
                part,node,refs,text=slide(photo['slide']);picture=None
                for pic in node.findall('.//p:pic',NS):
                    blip=pic.find('.//a:blip',NS)
                    if blip is not None and refs.get(blip.get('{'+NS['r']+'}embed'))==photo['part']:picture=pic;break
                if picture is None:raise ValueError('Reviewed photo is not used on the specified slide')
                raw=archive.read(photo['part'])
                if digest(raw)!=photo['sha256']:raise ValueError('Reviewed photo bytes changed')
                w,h=conditions.dimensions(raw);rotation_node=picture.find('p:spPr/a:xfrm',NS)
                rotation=int(rotation_node.get('rot','0'))//60000%360 if rotation_node is not None else 0
                if rotation not in (0,90,180,270):raise ValueError('Photo rotation requires review')
                key='results:'+code.lower()+'-photo-'+str(number);extension=Path(photo['part']).suffix.lower()
                if extension not in ('.png','.jpg','.jpeg'):raise ValueError('Unsupported photo format')
                target=folder/(code+'_現況照片_'+str(number).zfill(2)+extension)
                if target.exists() and target.read_bytes()!=raw:raise ValueError('Existing photo differs; preserve it and review')
                label='現況照片'+(' '+str(number) if number>1 else '')
                asset={'file':target.relative_to(ROOT).as_posix(),'width':w,'height':h,'label':code+' '+label,'scenario':code,'role':'photo','rotation':rotation,'sourceSlide':photo['slide'],'sourcePart':photo['part'],'sha256':digest(raw),'source':source}
                if key in manifest['assets'] and manifest['assets'][key]['sha256']!=asset['sha256']:raise ValueError('Existing asset differs; review a replacement separately')
                image={'key':key,'label':label,'role':'photo','rotation':rotation}
                crop_node=picture.find('p:blipFill/a:srcRect',NS)
                crop={k:int(v)/100000 for k,v in crop_node.attrib.items()} if crop_node is not None else {}
                if crop and rotation==0:
                    x=max(0,crop.get('l',0))*w;y=max(0,crop.get('t',0))*h
                    cw=w-x-max(0,crop.get('r',0))*w;ch=h-y-max(0,crop.get('b',0))*h
                    if cw<=0 or ch<=0:raise ValueError('Invalid photo crop')
                    image['crop']=[round(value,3) for value in (x,y,cw,ch)]
                upsert(issue['images'],image,lambda item:item['key']);manifest['assets'][key]=asset
                if not target.exists():writes.append((target,raw))
                provenance['slides'].append({'number':photo['slide'],'part':part,'texts':[text],'pictures':[{'part':photo['part'],'shapeId':picture.find('p:nvPicPr/p:cNvPr',NS).get('id'),'crop':dict(crop_node.attrib) if crop_node is not None else {},'rotation':rotation}]})
                provenance['files'].append({'key':key,**asset})
            issue['photoStatus']='available';entry['photoSource']={'source':source,'slides':[p['slide'] for p in reviewed['photos']],'contextSlides':reviewed['contextSlides']}
            info=read(folder/'source.json');upsert(info.setdefault('supplementalSources',[]),provenance,lambda item:item['source']['sha256'])
            writes.append((folder/'source.json',info));summaries.append({'id':code,'photos':len(reviewed['photos'])})
    upsert(manifest.setdefault('supplementalSources',[]),{'source':source,'role':'photo','scenarios':list(mapping['scenarios'])},lambda item:item['source']['sha256'])
    index_path=ROOT/'materials/05-複雜道路情境/current-conditions/overall-presentation-index.json';index=read(index_path)
    index['supplementalSources']=copy.deepcopy(manifest['supplementalSources'])
    for case in index['scenarios']:
        if case['id'] in mapping['scenarios']:
            entry=manifest['scenarios'][case['id']];case['images']=len(entry['issue']['images']);case['photoSource']=entry['photoSource']
    # All source and destination checks finish before any write.
    for target,value in writes:
        if isinstance(value,bytes):target.write_bytes(value)
        else:conditions.dump(target,value)
    conditions.dump(index_path,index);conditions.dump(manifest_path,manifest)
    print(json.dumps({'added':summaries,'sourceSlides':source['slideCount'],'note':mapping['note']},ensure_ascii=False))

if __name__=='__main__':main()
