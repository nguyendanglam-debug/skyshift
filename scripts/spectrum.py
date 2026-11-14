"""Build a SPHEREx spectrum of a target from the images of ALL six detectors (pre-computed, offline).

Every SPHEREx image sees the target at its own wavelength (linear variable filters), so one aperture
measurement per image, plotted against the wavelength at the target, is a spectrum.

    python scripts/spectrum.py epsindib            # writes public/precomputed/epsindib_spectrum.json
    python scripts/spectrum.py epsindib --limit 60 # quick test with a time-spread sample of 60 images

Photometry: aperture of 2 native pixels radius, background = median of a 4-7 pixel ring, noise from that ring.
No aperture correction (about 20% of the light of a point source falls outside; the same factor for all points of
similar PSF, so the SHAPE of the spectrum is what to trust, not the absolute level). Saturated images are kept
but flagged.
"""
import json
import os
import sys
import time

import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
from core import cutout, epochs as ep, pipeline, sia, stack, targets  # noqa: E402

NATIVE_PX = 6.15
ARCSEC2_SR = 2.3504e-11


def phot(co, ra, dec, r_ap=2.0):
    x, y = co.wcs.all_world2pix([ra], [dec], 0, quiet=True)
    x, y = float(x[0]), float(y[0])
    ny, nx = co.image.shape
    if not (r_ap + 2 < x < nx - r_ap - 2 and r_ap + 2 < y < ny - r_ap - 2):
        return None
    yy, xx = np.mgrid[:ny, :nx]
    d = np.hypot(xx - x, yy - y)
    ring = (d >= 4) & (d <= 7) & np.isfinite(co.image)
    if ring.sum() < 25:
        return None
    b = float(np.median(co.image[ring]))
    s = float(1.4826 * np.median(np.abs(co.image[ring] - b)))
    ap = d <= r_ap
    ok = ap & np.isfinite(co.image)
    if ok.sum() < 0.6 * ap.sum():
        return {"saturated": True, "flux_mJy": None, "err_mJy": None, "snr": None}
    flux = float((co.image[ok] - b).sum()) * (ap.sum() / ok.sum())
    err = s * np.sqrt(ap.sum())
    to_mjy = NATIVE_PX ** 2 * ARCSEC2_SR * 1e9
    sat = bool((co.sat & (d <= r_ap + 1)).any())
    return {"saturated": sat, "flux_mJy": round(flux * to_mjy, 4), "err_mJy": round(err * to_mjy, 4),
            "snr": round(flux / err, 1) if err > 0 else None}


def main():
    key = sys.argv[1]
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    t = targets.TARGETS[key]
    qra, qdec = pipeline.propagate(t["ra"], t["dec"], t["pmra"], t["pmdec"], t["pos_epoch"], 2026.0)
    obs = [o for o in sia.query(qra, qdec) if o.get("detector")]
    if limit and len(obs) > limit:
        obs = [obs[i] for i in np.linspace(0, len(obs) - 1, limit).astype(int)]
    print(f"[{key}] {len(obs)} images from detectors {sorted({o['detector'] for o in obs})}", flush=True)
    pts, t0, done = [], time.time(), 0
    for i in range(0, len(obs), 16):
        batch = obs[i:i + 16]
        # centre each cutout on the target at the time of the first image of the batch (a batch spans a few weeks)
        cra, cdec = pipeline.propagate(t["ra"], t["dec"], t["pmra"], t["pmdec"], t["pos_epoch"], ep.mjd_to_year(batch[0]["mjd"]))
        got = cutout.fetch_many([o["url"] for o in batch], cra, cdec, 0.06)
        for o in batch:
            raw = got[o["url"]]
            if isinstance(raw, Exception):
                continue
            try:
                co = stack.read_cutout(raw)
                yr = ep.mjd_to_year(o["mjd"])
                tra, tdec = pipeline.propagate(t["ra"], t["dec"], t["pmra"], t["pmdec"], t["pos_epoch"], yr)
                w, p = co.wavelength(tra, tdec), phot(co, tra, tdec)
                if w and p:
                    pts.append(dict(p, lam_um=round(w[0], 4), bw_um=round(w[1], 4), detector=co.detector, mjd=round(o["mjd"], 3),
                                    obs_id=o["obs_id"], collection=o["collection"]))
            except Exception as ex:
                print("  skip", o["obs_id"], ex, flush=True)
        done += len(batch)
        print(f"[{key}] {done}/{len(obs)} images, {len(pts)} points, {time.time() - t0:.0f}s", flush=True)
    pts.sort(key=lambda p: p["lam_um"])
    out = {"target": dict(id=key, name=t["name"], kind=t["kind"]), "n_images": len(obs), "points": pts,
           "method": "aperture photometry (2 native px radius, ring background), one point per SPHEREx image, no aperture correction",
           "computed_at": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())}
    path = os.path.join(ROOT, "public", "precomputed", f"{key}_spectrum.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    good = [p for p in pts if p["flux_mJy"] is not None and not p["saturated"]]
    print(f"[{key}] wrote {path}: {len(pts)} points, {len(good)} unsaturated; wavelength {pts[0]['lam_um']}-{pts[-1]['lam_um']} um" if pts else f"[{key}] no points")


main()
