"""Derive decorative vector linework from the original C1-01 road layout."""
import copy
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
outline = json.loads((ROOT / "data/results/outline.json").read_text(encoding="utf-8"))
source = outline["assets"]["results:c1-01-layout"]
original = (ROOT / source["file"]).read_bytes()
tree = ET.fromstring(original)
markings = next(node for node in tree.iter() if node.get("id") == "標線")

art = ET.Element(f"{{{SVG}}}svg", {
    "width": "3100", "height": "1700", "viewBox": "0 0 3100 1700",
    "fill-rule": "evenodd", "stroke-linecap": "round", "stroke-linejoin": "round",
})
ET.SubElement(art, f"{{{SVG}}}title").text = "C1-01 錯位 T 字路口封面線稿"
ET.SubElement(art, f"{{{SVG}}}desc").text = (
    "Derived from " + source["file"] + "; source SHA-256: "
    + hashlib.sha256(original).hexdigest()
    + ". Original road and marking geometry retained; annotations omitted."
)
projection = ET.SubElement(art, f"{{{SVG}}}g", {
    "transform": "matrix(0.95 -0.35 0.55 0.46 -500 820)"
})
linework = copy.deepcopy(markings)

def simplify(node, clipping=False):
    clipping = clipping or node.tag.rsplit("}", 1)[-1] in ("clipPath", "mask", "defs")
    if not clipping:
        props = dict(part.split(":", 1) for part in node.get("style", "").split(";") if ":" in part)
        if node.tag.rsplit("}", 1)[-1] in ("path", "rect", "polygon", "circle", "ellipse") and "fill" not in props:
            props["fill"] = node.get("fill", "none")
            props.setdefault("stroke", "#91aa88")
            props.setdefault("stroke-width", "1.7px")
        if props.get("fill", "none") != "none":
            props["fill"] = "none"
            props.setdefault("stroke", "#91aa88")
            props.setdefault("stroke-width", "1.7px")
        if "stroke" in props and props["stroke"] != "none":
            props["stroke"] = "#91aa88"
        if props:
            node.set("style", ";".join(key + ":" + value for key, value in props.items()))
    for child in list(node):
        # Outlined X annotations become solid patches when their tiny glyphs
        # receive the decorative stroke. Omit these annotation groups.
        if child.get("id") == "機車logo" or child.get("transform", "").startswith(
            "matrix(7.07022,0,0,7.07022,1226.855299,"
        ):
            node.remove(child)
        else:
            simplify(child, clipping)

simplify(linework)
projection.append(linework)
destination = ROOT / "materials/00-計畫緣起/封面_C1-01_道路線稿.svg"
destination.write_bytes(ET.tostring(art, encoding="utf-8", xml_declaration=True))
print("Created cover vector:", destination.name)
