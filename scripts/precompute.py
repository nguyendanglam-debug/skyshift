"""Pre-compute the 5 challenge targets into public/precomputed/<id>.json (the demo then never waits for IRSA).

    python scripts/precompute.py            # all five
    python scripts/precompute.py barnard    # just one
"""
import json
import os
import sys
import time

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
from core import pipeline, targets  # noqa: E402

OUT = os.path.join(ROOT, "public", "precomputed")
os.makedirs(OUT, exist_ok=True)

for key in (sys.argv[1:] or list(targets.TARGETS)):
    t = targets.TARGETS[key]
    t0 = time.time()
    print(f"[{key}] {t['name']} ...", flush=True)
    try:
        res = pipeline.build_frames(t["ra"], t["dec"], 0.1, t["band"], t["detector"], per_epoch=t.get("per_epoch", 4), max_epochs=8,
                                    pmra=t["pmra"], pmdec=t["pmdec"], pos_epoch=t["pos_epoch"], name=t["name"])
    except Exception as e:
        print(f"[{key}] FAILED: {e}", flush=True)
        continue
    res["target"] = dict(id=key, name=t["name"], kind=t["kind"], why=t["why"])
    res["precomputed_at"] = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())
    with open(os.path.join(OUT, f"{key}.json"), "w", encoding="utf-8") as fh:
        json.dump(res, fh, separators=(",", ":"))
    e = res["epochs"]
    print(f"[{key}] ok: {len(e)} epochs {[x['label'] for x in e]}, detector {res['query']['detector']}, "
          f"images/epoch {[x['n_images'] for x in e]}, sat near target {[x['sat_pixels_near_target'] for x in e]}, "
          f"{time.time() - t0:.0f}s, warnings={len(res['warnings'])}", flush=True)
