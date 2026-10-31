"""Extract only current-condition media from the supplied overall PPTX.

Original media are copied byte for byte. Each case receives its own source.json;
the generated web manifest contains relative paths and no local machine paths.
"""
import argparse, hashlib, io, json, posixpath, struct, sys, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
NS={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
GENERAL=['G1-01','G1-02','G1-03','G1-04','G2-01','G2-02','G3-01','G3-02','G4-01','G4-02','G1-05','G1-06','G2-03','G2-04','G3-03','G3-04','G4-03','G4-04']
COMPLEX=[('C1-01',93,94),('C1-02',96,97),('C1-03',99,100),('C1-04',102,104),('C1-05',106,108),('C1-06',110,111),('C1-07',113,114),('C1-08',116,117),('C1-09',119,120),('C2-01',122,123),('C3-01',125,126),('C4-01',128,129),('legacy-living-side-road',131,132),('C4-02',134,135),('C4-03',137,138),('C4-04',140,141),('C4-05',143,144),('C4-06',146,147)]

def dimensions(raw):
    if raw.startswith(b'\x89PNG\r\n\x1a\n'):return struct.unpack('>II',raw[16:24])
    if raw.startswith(b'\xff\xd8'):
        offset=2
        while offset+9<len(raw):
            if raw[offset]!=255:offset+=1;continue
            marker=raw[offset+1]
            if marker in (0xc0,0xc1,0xc2,0xc3):
                h,w=struct.unpack('>HH',raw[offset+5:offset+9]);return w,h
            offset+=2 if marker in (0xd8,0xd9) else 2+struct.unpack('>H',raw[offset+2:offset+4])[0]
    raise ValueError('Unsupported current-condition image')

def dump(file,value):
    file.parent.mkdir(parents=True,exist_ok=True)
    file.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def slide(archive,number):
    part=f'ppt/slides/slide{number}.xml';xml=ET.fromstring(archive.read(part))
    relpart=f'ppt/slides/_rels/slide{number}.xml.rels'
    rels={r.get('Id'):r.get('Target') for r in ET.fromstring(archive.read(relpart)) if r.get('TargetMode')!='External'}
    texts=[''.join(t.text or '' for t in paragraph.findall('.//a:t',NS)) for paragraph in xml.findall('.//a:p',NS)]
    pictures=[]
    for pic in xml.findall('.//p:pic',NS):
        blip=pic.find('.//a:blip',NS)
        rid=blip.get('{'+NS['r']+'}embed') if blip is not None else None
        if rid not in rels:continue
        target=posixpath.normpath(posixpath.join('ppt/slides',rels[rid]))
        if not target.startswith('ppt/media/'):raise ValueError('Unexpected picture relationship')
        transform=pic.find('p:spPr/a:xfrm',NS);off=transform.find('a:off',NS) if transform is not None else None
        crop=pic.find('p:blipFill/a:srcRect',NS)
        pictures.append({'part':target,'slide':number,'shapeId':pic.find('p:nvPicPr/p:cNvPr',NS).get('id'),'crop':dict(crop.attrib) if crop is not None else {},'rotation':int(transform.get('rot','0'))/60000 if transform is not None else 0,'position':(int(off.get('y','0')),int(off.get('x','0'))) if off is not None else (0,0)})
    return {'number':number,'texts':texts,'pictures':sorted(pictures,key=lambda pic:pic['position'])}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('pptx',type=Path);args=parser.parse_args()
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    source=args.pptx.resolve();source_hash=hashlib.sha256()
    with source.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):source_hash.update(chunk)
    texts=json.loads((ROOT/'data/results/current-conditions-text.json').read_text(encoding='utf-8'))
    catalog=json.loads((ROOT/'data/scenarios/catalog.json').read_text(encoding='utf-8'))
    names={item['id']:item['name'] for item in catalog['scenarios']};names['legacy-living-side-road']='生活副道（原 PowerPoint 案例）'
    output={'schemaVersion':1,'source':{'file':source.name,'sha256':source_hash.hexdigest()},'assets':{},'scenarios':{},'unmatched':[]}
    entries=[(code,'general',38+i*3,39+i*3) for i,code in enumerate(GENERAL)]+[(code,'complex',a,b) for code,a,b in COMPLEX]
    with zipfile.ZipFile(source) as archive:
        for code,deck,analysis,issues in entries:
            folder=ROOT/'materials'/('04-一般道路情境' if deck=='general' else '05-複雜道路情境')/'current-conditions'/code
            folder.mkdir(parents=True,exist_ok=True)
            source_slides=[slide(archive,analysis),slide(archive,issues)]
            info={'scenario':code,'name':names[code],'source':output['source'],'slides':source_slides,'files':[],'ignoredSymbols':[]}
            seen={};images=[];counts={'diagram':0,'photo':0}
            for index,s in enumerate(source_slides):
                role='photo' if deck=='general' and index==1 else 'diagram'
                for picture in s['pictures']:
                    part=picture['part'];raw=archive.read(part);w,h=dimensions(raw)
                    if min(w,h)<180:
                        info['ignoredSymbols'].append({**picture,'reason':'設施符號，非現況圖或照片'});continue
                    if part in seen:continue
                    counts[role]+=1;number=counts[role]
                    extension=Path(part).suffix.lower()
                    filename=f'{code}_'+('現況圖' if role=='diagram' else '現況照片')+f'_{number:02d}'+extension
                    target=folder/filename
                    if target.exists() and target.read_bytes()!=raw:raise ValueError('Existing archive differs; preserve it and review: '+str(target))
                    if not target.exists():target.write_bytes(raw)
                    image_key='results:'+code.lower()+'-'+role+'-'+str(number)
                    # Keep the existing G1-01 initial camera key; its source bytes match.
                    if code=='G1-01' and role=='diagram' and number==1:image_key='g101-before'
                    label=('現況圖' if role=='diagram' else '現況照片')+(f' {number}' if number>1 else '')
                    rotation=90 if code=='G1-01' and role=='diagram' else int(picture['rotation'])%360
                    asset={'file':target.relative_to(ROOT).as_posix(),'width':w,'height':h,'label':code+' '+label,'scenario':code,'role':role,'rotation':rotation,'sourceSlide':s['number'],'sourcePart':part,'sha256':hashlib.sha256(raw).hexdigest()}
                    image={'key':image_key,'label':label,'role':role,'rotation':rotation}
                    crop={k:int(v)/100000 for k,v in picture['crop'].items()}
                    if crop and rotation==0:
                        x=max(0,crop.get('l',0))*w;y=max(0,crop.get('t',0))*h
                        cw=w-x-max(0,crop.get('r',0))*w;ch=h-y-max(0,crop.get('b',0))*h
                        if cw>0 and ch>0:image['crop']=[round(v,3) for v in (x,y,cw,ch)]
                    output['assets'][image_key]=asset;images.append(image);seen[part]=image_key
                    info['files'].append({'key':image_key,**asset})
            description=texts[code]
            issue={'title':description['title'],'intro':description['intro'],'images':images,'items':[{'id':p[0],'title':p[1],'text':p[2]} for p in description['items']],'photoStatus':'available' if counts['photo'] else 'not-in-source'}
            entry={'name':names[code],'sourceSlides':[analysis,issues],'archive':folder.relative_to(ROOT).as_posix(),'issue':issue}
            if code.startswith('legacy-'):output['unmatched'].append({'id':code,**entry})
            else:output['scenarios'][code]=entry
            dump(folder/'source.json',info)
        # Never substitute the source deck's living-side-road case for an interchange.
        code='C2-02';folder=ROOT/'materials/05-複雜道路情境/current-conditions'/code
        folder.mkdir(parents=True,exist_ok=True)
        missing={'name':names[code],'sourceSlides':[],'archive':folder.relative_to(ROOT).as_posix(),'issue':{'title':'平行匝道型交流道｜現況素材待補','intro':'目前提供的 PowerPoint 未包含此情境的現況圖與照片。','images':[],'items':[],'photoStatus':'not-in-source','sourceMissing':True}}
        output['scenarios'][code]=missing
        dump(folder/'source.json',{'scenario':code,'name':names[code],'source':output['source'],'status':'missing','note':'原簡報的生活副道與本情境不同，不互相替代。'})
    dump(ROOT/'data/results/current-conditions.json',output)
    for deck,label in [('general','04-一般道路情境'),('complex','05-複雜道路情境')]:
        archive_root=ROOT/'materials'/label/'current-conditions'
        entries=[{'id':code,'name':entry['name'],'slides':entry['sourceSlides'],'sourceMissing':bool(entry['issue'].get('sourceMissing')),'folder':code,'images':len(entry['issue']['images'])} for code,entry in output['scenarios'].items() if code.startswith('G' if deck=='general' else 'C')]
        if deck=='complex':entries.extend({'id':entry['id'],'name':entry['name'],'slides':entry['sourceSlides'],'folder':entry['id'],'unmatched':True,'images':len(entry['issue']['images'])} for entry in output['unmatched'])
        dump(archive_root/'overall-presentation-index.json',{'source':output['source'],'scenarios':entries})
        note='# 現況圖與照片\n\n取自提供的整體簡報 PowerPoint，依情境編號歸檔。每個情境的 `source.json` 記錄原投影片頁次、媒體檔名稱、裁切、旋轉與校驗碼；圖檔保留原始位元組。\n\n多張照片均保留，簡報中可在照片框內切換；沒有照片的情境不以其他案例替代。`overall-presentation-index.json` 為本次來源索引。\n'
        if deck=='general':note+='\n本次新增 G1–G4 情境子資料夾；先前其他簡報擷取的根層檔案與 `G1` 資料夾保留。\n'
        else:note+='\nC2-02 平行匝道型交流道在提供的 PowerPoint 中沒有對應素材，保留來源待補紀錄。生活副道另存於 `legacy-living-side-road`，不改配到交流道。\n'
        (archive_root/'README-current-conditions.md').write_text(note,encoding='utf-8')
    print(json.dumps({'scenarios':len(output['scenarios']),'withSource':sum(bool(x['sourceSlides']) for x in output['scenarios'].values()),'assets':len(output['assets']),'unmatched':[x['id'] for x in output['unmatched']],'archiveBytes':sum((ROOT/a['file']).stat().st_size for a in output['assets'].values())},ensure_ascii=False))

if __name__=='__main__':main()
