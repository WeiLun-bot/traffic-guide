"""Assemble the browser's sample sheets into a searchable A4 landscape handout."""
from pathlib import Path
import json
import fitz

root = Path(__file__).resolve().parents[1]
output = root / "exports" / "G1-01-PDF-sample"
manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
result = fitz.open()
paper = fitz.paper_rect("a4-l")
preview = fitz.open()
preview_page = preview.new_page(width=1200, height=3 * 465)
preview_page.draw_rect(preview_page.rect, color=None, fill=(0.91, 0.93, 0.89))
checks = []
for index, sheet in enumerate(manifest["sheets"]):
    with fitz.open(output / sheet["file"]) as source:
        if len(source) != 1:
            raise RuntimeError(f"Expected one sheet for {sheet['id']}, got {len(source)}")
        text = source[0].get_text()
        if sheet["titleInPresentation"].strip() not in "".join(text.split()):
            if "".join(sheet["titleInPresentation"].split()) not in "".join(text.split()):
                raise RuntimeError(f"Missing searchable title: {sheet['id']}")
        page = result.new_page(width=paper.width, height=paper.height)
        page.show_pdf_page(paper, source, 0)
        checks.append({"page": index + 1, "id": sheet["id"], "textCharacters": len(text), "sizePoints": [page.rect.width, page.rect.height]})
        pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        pix.save(output / (sheet["id"] + "-A4.png"))

result.set_metadata({"title": "G1-01 無號誌市區正交三岔路口｜教材 PDF 試作", "author": "", "subject": "道路交通標誌標線號誌設置參考指引", "keywords": "G1-01, 一般道路情境, 教材試作"})
result.set_toc([[1, sheet["title"], index + 1] for index, sheet in enumerate(manifest["sheets"])])
destination = output / "G1-01_教材試作_6頁.pdf"
result.save(destination, garbage=4, deflate=True)
result.close()
with fitz.open(destination) as document:
    assert len(document) == 6
    for page in document:
        assert abs(page.rect.width - paper.width) < 0.1 and abs(page.rect.height - paper.height) < 0.1
        assert len(page.get_text().strip()) > 100
    assert len(document.get_toc()) == 6
    for index, sheet in enumerate(manifest["sheets"]):
        x, y = 15 + (index % 2) * 600, 15 + (index // 2) * 465
        preview_page.show_pdf_page(fitz.Rect(x, y, x + 570, y + 403), document, index)
        preview_page.insert_text((x + 8, y + 435), f"{index + 1:02d}  {sheet['title']}", fontsize=18, fontname="china-t", color=(0.15, 0.29, 0.23))
preview_page.get_pixmap(alpha=False).save(output / "G1-01_六頁預覽.png")
preview.close()
(output / "validation.json").write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Created {len(checks)} A4 landscape pages: {destination}")
print(f"Searchable text: {sum(check['textCharacters'] for check in checks)} characters")
