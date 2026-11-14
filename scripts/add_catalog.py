"""Add the Gaia DR3 / SIMBAD overlay data to the pre-computed targets in public/precomputed/*.json
without downloading the SPHEREx images again (uses the grid and dates already stored in each file).

    python scripts/add_catalog.py            # all five
    python scripts/add_catalog.py barnard    # one
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
from core import catalog, epochs, pipeline, stack, targets  # noqa: E402

OUT = os.path.join(ROOT, "public", "precomputed")
SESAME_NAMES = {"barnard": "Barnard's star", "epsindib": "eps Ind B", "wise0855": "WISE J085510.83-071442.5",
                "rwaur": "RW Aur", "rdra": "R Dra"}

for key in (sys.argv[1:] or list(targets.TARGETS)):
    path = os.path.join(OUT, f"{key}.json")
    with open(path, encoding="utf-8") as fh:
        d = json.load(fh)
    q, c = d["query"], d["center"]
    grid = stack.Grid(c["ra"], c["dec"], q["fov_deg"], d["grid"]["arcsec_per_px"])
    radius = q["fov_deg"] * 0.72 + 0.04
    g = catalog.gaia(c["ra"], c["dec"], radius, timeout=30)
    s = catalog.simbad(c["ra"], c["dec"], radius, timeout=30)
    for e in d["epochs"]:
        yr = epochs.mjd_to_year(e["mjd"])
        e.pop("gaia_match", None)
        e["gaia_px"] = catalog.project(grid, g, yr, catalog.GAIA_EPOCH) if g else []
        e["simbad_px"] = catalog.project(grid, s, yr, 2000.0, limit=60) if s else []
    d["catalog"] = pipeline._catalog_block(grid, d["epochs"], g, s, True)
    d["target"]["simbad"] = catalog.sesame_target(SESAME_NAMES[key])
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(d, fh, separators=(",", ":"))
    cat = d["catalog"]
    print(f"[{key}] gaia ok={cat['gaia']['ok']} stars={len(cat['gaia']['stars'])} | simbad TAP ok={cat['simbad']['ok']} "
          f"objects={len(cat['simbad']['objects'])} | target in Gaia: {cat['target_in_gaia']} | sesame: {d['target']['simbad']}", flush=True)
