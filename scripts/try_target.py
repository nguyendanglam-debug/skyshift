"""Run the pipeline for one preset target and save the frames as PNG files (for checking by eye).

    python scripts/try_target.py barnard [out_dir]
"""
import base64
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from core import pipeline, targets  # noqa: E402

key = sys.argv[1] if len(sys.argv) > 1 else "barnard"
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join("out", key)
os.makedirs(out, exist_ok=True)
t = targets.TARGETS[key]
res = pipeline.build_frames(t["ra"], t["dec"], 0.1, t["band"], t["detector"], pmra=t["pmra"], pmdec=t["pmdec"],
                            pos_epoch=t["pos_epoch"], name=t["name"])
for i, e in enumerate(res["epochs"]):
    for kind in ("png", "diff_png"):
        with open(os.path.join(out, f"{i}_{kind}_{e['date']}.png"), "wb") as fh:
            fh.write(base64.b64decode(e[kind].split(",", 1)[1]))
summary = {k: v for k, v in res.items() if k != "epochs"}
summary["epochs"] = [{k: v for k, v in e.items() if k not in ("png", "diff_png", "images")} | {"n_img_ids": [im["obs_id"] for im in e["images"]]} for e in res["epochs"]]
print(json.dumps(summary, indent=1))
