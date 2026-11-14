"""Print what was measured for the five targets (from public/precomputed). Use it for the results slide.

    python scripts/verify_targets.py
"""
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
D = os.path.join(ROOT, "public", "precomputed")

for key in ("barnard", "epsindib", "wise0855", "rwaur", "rdra"):
    path = os.path.join(D, key + ".json")
    if not os.path.exists(path):
        print(f"## {key}: missing"); continue
    r = json.load(open(path, encoding="utf-8"))
    E = r["epochs"]
    span = E[-1]["mjd"] - E[0]["mjd"]
    a, b = E[0].get("marker"), E[-1].get("marker")
    pred = ""
    if a and b:
        import math
        px = math.hypot(b["col"] - a["col"], b["row"] - a["row"]) * r["grid"]["arcsec_per_px"]
        pred = f", predicted motion {px:.1f} arcsec"
    print(f"## {r['target']['name']}  (D{r['query']['detector']}, {len(E)} epochs, {span:.0f} days{pred})")
    print("epoch      S/N    flux_mJy         offset_arcsec (E,N)    sat_px  note")
    for e in E:
        m = e.get("measure", {})
        off = f"{m['offset_arcsec']:.2f} ({m['offset_east_arcsec']:+.1f},{m['offset_north_arcsec']:+.1f})" if "offset_arcsec" in m else "-"
        fl = f"{m['flux_mJy']:.3f}+-{m['flux_err_mJy']:.3f}" if "flux_mJy" in m else "-"
        note = "saturated" if e["sat_pixels_near_target"] else ("detected" if m.get("detected") else "NOT detected")
        print(f"{e['label']:9} {m.get('snr', '-'):>6}  {fl:16} {off:22} {e['sat_pixels_near_target']:>6}  {note}")
    print()
