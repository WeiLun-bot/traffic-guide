"""Refresh source metadata for the curated general-scenario strategy slides.

Reads original SVG files in the project and the supplied Typst chapter folder;
does not rewrite artwork, embedded presentation data or saved editor settings.
"""
import argparse,hashlib,json,re,sys,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser();parser.add_argument('chapters',type=Path);args=parser.parse_args()
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    file=ROOT/'data/results/general-strategies.json';data=json.loads(file.read_text(encoding='utf-8'));assets={}
    for code,entry in data['scenarios'].items():
        if not re.fullmatch(r'G[1-4]-\d{2}',code):raise ValueError('Unexpected scenario')
        folder=ROOT/'materials/04-一般道路情境'/code
        candidates=list(folder.glob(code+'_*交通設施整體設置圖例.svg'))
        if code=='G1-02':
            candidates=[folder/'G1-02_無號誌鄉區正交三叉路口設施設置圖例.svg']
        chapters=list(args.chapters.glob('04-'+code[1]+'-'+code[3:]+'-*.typ'))
        if len(chapters)!=1:raise ValueError('Missing or ambiguous source chapter: '+code)
        typst=chapters[0];raw=typst.read_text(encoding='utf-8');active=re.sub(r'/\*[\s\S]*?\*/','',raw);active=re.sub(r'(?m)^\s*//.*$','',active)
        section=active.split('==== 交通設施設置建議',1)[1].split('====',1)[0]
        if not candidates:
            references=re.findall(r'image\(\s*"([^"]+\.svg)"',section)
            candidates=[folder/Path(ref).name for ref in references if (folder/Path(ref).name).is_file()]
        if len(candidates)!=1:raise ValueError('Missing or ambiguous full-layout SVG: '+code)
        svg=candidates[0];svg_bytes=svg.read_bytes();node=ET.fromstring(svg_bytes)
        view=[float(value) for value in re.split(r'[ ,]+',node.get('viewBox','').strip())]
        if len(view)!=4 or view[2]<=0 or view[3]<=0:raise ValueError('Invalid SVG viewBox: '+code)
        for child in node.iter():
            if child.tag.rsplit('}',1)[-1] in ['script','foreignObject']:raise ValueError('Unexpected interactive SVG content')
            for name,value in child.attrib.items():
                if name.rsplit('}',1)[-1]=='href' and value and not value.startswith(('#','data:')):raise ValueError('SVG has an external dependency: '+code)
        key='results:'+code.lower()+'-strategy'
        assets[key]={'file':svg.relative_to(ROOT).as_posix(),'width':view[2],'height':view[3],'label':code+' 整體佈設圖','scenario':code,'role':'strategy','sha256':hashlib.sha256(svg_bytes).hexdigest()}
        entry['strategy']['images']=[{'key':key,'label':'整體佈設圖','rotation':0}]
        entry['source']={'file':'chapters/04-general-scenarios/'+typst.name,'sha256':hashlib.sha256(typst.read_bytes()).hexdigest(),'section':'交通設施設置建議與整體設置圖例'}
        if code=='G1-02':entry['source']['figureNote']='使用G1-02_無號誌鄉區正交三叉路口設施設置圖例.svg。'
    data['assets']=assets;file.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'strategyPages':len(data['scenarios']),'svgFiles':len(assets),'preserved':'G1-01 uses the original page and asset identities'},ensure_ascii=False))

if __name__=='__main__':main()
