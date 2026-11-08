"""Combine screen-sized chapter sheets without changing their aspect ratio."""
from pathlib import Path
import json
import fitz
import argparse

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path)
args = parser.parse_args()
output = args.output or root / "exports" / "PDF-M1-01-G1-01"
manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
checks = []
for chapter in manifest["documents"]:
    result = fitz.open()
    titles = []
    for index, sheet in enumerate(chapter["sheets"]):
        with fitz.open(output / sheet["file"]) as source:
            assert len(source) == 1, (sheet["file"], len(source))
            page = source[0]
            assert abs(page.rect.width - 1200) < 1 and abs(page.rect.height - 675) < 1
            # Chrome rounds CSS page sizes to fractional points. Trim the blank
            # edge to exact 16:9 without stretching any text or image.
            page.set_mediabox(fitz.Rect(0, 0, 1200, 675))
            text = page.get_text()
            assert "".join(sheet["titleInPresentation"].split()) in "".join(text.split()), sheet["file"]
            assert len(text.strip()) > (10 if sheet['id'].startswith('chapter-cover-') else 50), sheet["file"]
            result.insert_pdf(source)
            titles.append([1, sheet["title"], index + 1])
    result.set_metadata({"title": chapter["title"], "subject": "道路交通標誌標線號誌設置參考指引", "keywords": chapter["id"] + ", 簡報, 16:9"})
    result.set_toc(titles)
    destination = output / chapter.get('outputName', chapter["title"].replace(" ", "_", 1) + ".pdf")
    result.save(destination, garbage=4, deflate=True)
    result.close()
    with fitz.open(destination) as document:
        assert len(document) == len(chapter["sheets"])
        columns = 3
        rows = (len(document) + columns - 1) // columns
        preview = fitz.open()
        contact = preview.new_page(width=1200, height=rows * 250)
        contact.draw_rect(contact.rect, color=None, fill=(0.91, 0.93, 0.89))
        for index, page in enumerate(document):
            x, y = 10 + (index % columns) * 400, 10 + (index // columns) * 250
            contact.show_pdf_page(fitz.Rect(x, y, x + 380, y + 213.75), document, index)
            contact.insert_text((x + 5, y + 231), str(index + 1).zfill(2) + " " + chapter["sheets"][index]["title"], fontsize=9, fontname="china-t", color=(0.15, 0.29, 0.23))
        preview[0].get_pixmap(alpha=False).save(output / (chapter["id"] + "_頁面預覽.png"))
        preview.close()
        checks.append({"file": destination.name, "pages": len(document), "sizePoints": [1200, 675], "searchableCharacters": sum(len(page.get_text()) for page in document), "bookmarks": len(document.get_toc())})
    print(f"Created {len(chapter['sheets'])} pages: {destination}")
(output / "validation.json").write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding="utf-8")
