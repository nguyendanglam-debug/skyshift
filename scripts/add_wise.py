"""Add the AllWISE overlay to the pre-computed targets in public/precomputed/*.json
without downloading the SPHEREx images again (uses the grid and dates already stored in each file).

    python scripts/add_wise.py            # all five
    python scripts/add_wise.py wise0855   # one
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
from core import catalog, pipeline, stack, targets  # noqa: E402

OUT = os.path.join(ROOT, "public", "precomputed")

for key in (sys.argv[1:] or list(targets.TARGETS)):
    path = os.path.join(OUT, f"{key}.json")
    with open(path, encoding="utf-8") as fh:
        d = json.load(fh)
    q, c = d["query"], d["center"]
    grid = stack.Grid(c["ra"], c["dec"], q["fov_deg"], d["grid"]["arcsec_per_px"])
    rows = catalog.wise(c["ra"], c["dec"], q["fov_deg"] * 0.72 + 0.04, timeout=60)
    w = pipeline._wise_block(grid, rows, q["ra"], q["dec"], q["pmra"], q["pmdec"], q["pos_epoch"] or 2000.0, d["epochs"])
    d.setdefault("catalog", {})["wise"] = w
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(d, fh, separators=(",", ":"))
    tgt = w["target"]
    print(f"[{key}] wise ok={w['ok']} sources in view={len(w['stars'])} target in 2010: "
          + (f"{w['stars'][tgt['i']]['id']} W2={w['stars'][tgt['i']]['w2']} sep={tgt['sep_arcsec']}\" moved since={tgt['moved_arcsec']}\""
             if tgt else "none within 3\""), flush=True)
