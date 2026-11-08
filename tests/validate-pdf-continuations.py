"""Check actual PDF continuations against their captured browser images.

Run after export: .venv-pdf/Scripts/python.exe tests/validate-pdf-continuations.py <output>
Requires the same PyMuPDF environment used to assemble the PDF.
"""
import argparse
import json
from pathlib import Path

import fitz

parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
args = parser.parse_args()
manifest = json.loads((args.output / "manifest.json").read_text(encoding="utf-8"))
checks = []


def browser_image(sheet):
    pixmap = fitz.Pixmap(str(args.output / sheet["image"]))
    pixmap.shrink(2)
    return pixmap


for document in manifest["documents"]:
    sheets = document["sheets"]
    for index, sheet in enumerate(sheets):
        if sheet.get("continuation", 1) <= 1:
            continue
        previous = sheets[index - 1]
        assert previous["id"] == sheet["id"]
        expected = browser_image(sheet)
        old = browser_image(previous)
        with fitz.open(args.output / sheet["file"]) as pdf:
            actual = pdf[0].get_pixmap(matrix=fitz.Matrix(1 / 3, 1 / 3), alpha=False)
            if (actual.width, actual.height) != (expected.width, expected.height):
                actual = fitz.Pixmap(actual, expected.width, expected.height, None)
            assert (old.width, old.height) == (expected.width, expected.height)
            current_error = previous_error = changed = 0
            # Compare only pixels whose content moved. Repeated diagrams and
            # backgrounds must not hide a table resetting to its previous rows.
            for rendered, wanted, before in zip(actual.samples, expected.samples, old.samples):
                if abs(wanted - before) > 8:
                    changed += 1
                    current_error += abs(rendered - wanted)
                    previous_error += abs(rendered - before)
            assert changed > 100, (sheet["file"], "Continuation repeats its previous image")
            assert current_error < previous_error, (sheet["file"], "Printed content reverted to previous rows")
            checks.append({"file": sheet["file"], "changedChannels": changed,
                           "currentImageError": round(current_error / changed, 3),
                           "previousImageError": round(previous_error / changed, 3)})

assert checks, "No continuation pages were exercised"
(args.output / "continuation-validation.json").write_text(json.dumps(checks, indent=2), encoding="utf-8")
print(f"PASS: {len(checks)} PDF continuations preserve their browser content positions")
