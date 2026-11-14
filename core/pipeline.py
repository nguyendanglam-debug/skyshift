"""End-to-end: sky position -> list of epochs with PNG frames. Stateless (safe for serverless hosting)."""
import math
import time

from concurrent.futures import ThreadPoolExecutor

import numpy as np

from . import catalog, cutout, epochs as ep, measure, render, sia, stack

PIXEL_ARCSEC = 6.15          # native SPHEREx pixel
LIMITATIONS = [
    "SPHEREx has only about one year of public data so far: slow objects move less than 2 pixels.",
    "Pixels are 6.2 arcsec; parallax (< 0.6 arcsec) is far too small to see.",
    "Very bright stars can saturate; saturated pixels are counted and their brightness is not reliable.",
    "SPHEREx wavelength changes across each detector, so brightness between epochs is only approximate.",
    "This is an exploration tool: a moving dot is a candidate to check, not a discovery.",
]


class NoDataError(Exception):
    pass


def propagate(ra, dec, pmra, pmdec, from_year, to_year):
    """Move a position by its proper motion (mas/yr; pmra already includes cos(dec))."""
    dt = to_year - from_year
    dec2 = dec + pmdec * dt / 3.6e6
    ra2 = ra + pmra * dt / 3.6e6 / math.cos(math.radians(0.5 * (dec + dec2)))
    return ra2 % 360.0, dec2


def _catalog_block(grid, metas, gaia_rows, simbad_rows, wanted):
    """Keep only catalogue rows that are drawn in some epoch, renumber them, and report which services answered."""
    def pack(rows, key, fields):
        if rows is None:
            return None
        used = sorted({p[2] for m in metas for p in m[key]})
        remap = {old: new for new, old in enumerate(used)}
        for m in metas:
            m[key] = [[p[0], p[1], remap[p[2]]] for p in m[key]]
        return [{f: rows[i].get(f) for f in fields} for i in used]
    if not wanted:
        return None
    g = pack(gaia_rows, "gaia_px", ("id", "g", "pmra", "pmdec", "plx"))
    s = pack(simbad_rows, "simbad_px", ("id", "otype"))
    # Gaia star nearest the predicted position (or the field centre), within 3 arcsec
    match = None
    if g:
        for m in metas:
            mc, mr = (m["marker"]["col"], m["marker"]["row"]) if m["marker"] else (grid.c, grid.c)
            best = min(m["gaia_px"], key=lambda p: math.hypot(p[0] - mc, p[1] - mr), default=None)
            if best is not None:
                sep = math.hypot(best[0] - mc, best[1] - mr) * grid.scale
                if sep <= 3.0:
                    m["gaia_match"] = {"i": best[2], "sep_arcsec": round(sep, 1)}
                    match = True
    return {"gaia": {"ok": g is not None, "epoch": catalog.GAIA_EPOCH, "g_limit": catalog.GAIA_G_LIMIT, "stars": g or []},
            "simbad": {"ok": s is not None, "objects": s or []}, "target_in_gaia": bool(match)}


def _wise_block(grid, rows, ra, dec, pmra, pmdec, pos_epoch, metas):
    """AllWISE sources on the grid at their 2010 position, and the WISE source where the target was in 2010."""
    out = {"ok": rows is not None, "epoch": catalog.WISE_EPOCH, "w2_limit": catalog.WISE_W2_LIMIT, "stars": [], "target": None}
    if not rows:
        return out
    for s in rows:
        col, row = grid.to_pixel(s["ra"], s["dec"])
        if 0 <= col < grid.n and 0 <= row < grid.n:
            out["stars"].append({"id": s["id"], "w1": s["w1"], "w2": s["w2"], "q": s["q"], "cc": s["cc"],
                                 "col": round(float(col), 1), "row": round(float(row), 1)})
        if len(out["stars"]) >= 200:
            break
    # Where the target should have been when WISE looked (2010), from its proper motion; else the field centre.
    has_pm = pmra is not None and pmdec is not None
    if has_pm:
        tra, tdec = propagate(ra, dec, pmra, pmdec, pos_epoch, catalog.WISE_EPOCH)
        tc, tr = grid.to_pixel(tra, tdec)
    else:
        tc, tr = grid.c, grid.c
    best, bsep = None, 3.0
    for i, s in enumerate(out["stars"]):
        sep = math.hypot(s["col"] - tc, s["row"] - tr) * grid.scale
        if sep <= bsep:
            best, bsep = i, sep
    if best is not None:
        s, last = out["stars"][best], metas[-1]["marker"]
        moved = math.hypot(s["col"] - last["col"], s["row"] - last["row"]) * grid.scale if (has_pm and last) else None
        out["target"] = {"i": best, "sep_arcsec": round(bsep, 1), "moved_arcsec": round(moved, 1) if moved is not None else None,
                         "to_date": metas[-1]["date"]}
    return out


def build_frames(ra, dec, fov=0.1, band="SWIR", detector=None, per_epoch=3, max_epochs=6,
                 pmra=None, pmdec=None, pos_epoch=2000.0, oversample=2, name="", catalogs=True):
    t0 = time.time()
    has_pm = pmra is not None and pmdec is not None
    qra, qdec = propagate(ra, dec, pmra, pmdec, pos_epoch, 2026.0) if has_pm else (ra, dec)

    obs = sia.query(qra, qdec)
    if not obs:
        raise NoDataError("No SPHEREx images cover this position (the survey has not reached it yet, or it is outside the sky covered).")
    chosen = ep.select(obs, band=band, detector=detector, per_epoch=per_epoch, max_epochs=max_epochs)
    if len(chosen) < 1:
        raise NoDataError("No images in this band/detector here. Try band AUTO or another detector.")
    t_search = time.time() - t0

    mean_year = float(np.mean([e["year"] for e in chosen]))
    cra, cdec = propagate(ra, dec, pmra, pmdec, pos_epoch, mean_year) if has_pm else (ra, dec)
    grid = stack.Grid(cra, cdec, fov, PIXEL_ARCSEC / oversample)

    # Gaia / SIMBAD run while the cutouts download; they never block or break the images (None = service did not answer)
    cat_radius = fov * 0.72 + 0.04
    ex = ThreadPoolExecutor(max_workers=3)
    f_gaia = ex.submit(catalog.gaia, cra, cdec, cat_radius) if catalogs else None
    f_simbad = ex.submit(catalog.simbad, cra, cdec, cat_radius) if catalogs else None
    f_wise = ex.submit(catalog.wise, cra, cdec, cat_radius) if catalogs else None

    urls = [im["url"] for e in chosen for im in e["images"]]
    t1 = time.time()
    got = cutout.fetch_many(urls, cra, cdec, fov * 1.5)         # a bit larger: SPHEREx pixels are rotated vs north
    t_download = time.time() - t1
    gaia_rows = f_gaia.result() if f_gaia else None
    simbad_rows = f_simbad.result() if f_simbad else None
    wise_rows = f_wise.result() if f_wise else None
    ex.shutdown(wait=False)

    t2 = time.time()
    warnings, stacks, metas, cores = [], [], [], []
    for e in chosen:
        cos, used = [], []
        tra, tdec = propagate(ra, dec, pmra, pmdec, pos_epoch, e["year"]) if has_pm else (cra, cdec)
        for im in e["images"]:
            raw = got.get(im["url"])
            if isinstance(raw, Exception) or raw is None:
                warnings.append(f"{im['obs_id']}: download failed ({raw})")
                continue
            try:
                co = stack.read_cutout(raw)
                w = co.wavelength(tra, tdec)                     # wavelength actually seen at the target
                im = dict(im, wave_target_um=round(w[0], 3) if w else None)
                cos.append(co)
                used.append(im)
            except Exception as ex:                              # damaged file: skip it, keep going
                warnings.append(f"{im['obs_id']}: could not read ({ex})")
        if not cos:
            continue
        lams = [im["wave_target_um"] for im in used if im.get("wave_target_um")]
        img, sat, nvalid, core = stack.stack_epoch(cos, grid)
        marker = None
        if has_pm:
            mra, mdec = propagate(ra, dec, pmra, pmdec, pos_epoch, e["year"])
            col, row = grid.to_pixel(mra, mdec)
            marker = {"col": float(col), "row": float(row)}
        mc, mr = (marker["col"], marker["row"]) if marker else (grid.c, grid.c)
        cc, rr = np.meshgrid(np.arange(grid.n), np.arange(grid.n))
        near = np.hypot(cc - mc, rr - mr) <= 3.0 * oversample
        n_sat = int((sat & near).sum())
        stacks.append(img)
        cores.append(core)
        metas.append({
            "measure": measure.measure_epoch(img, mc, mr, grid.scale, oversample, saturated=n_sat > 0, core=core),
            "label": e["label"], "date": e["date"], "mjd": round(e["mjd"], 4), "detector": e["detector"],
            "n_images": len(used), "marker": marker,
            "sat_pixels_near_target": n_sat,
            "gaia_px": catalog.project(grid, gaia_rows, e["year"], catalog.GAIA_EPOCH) if gaia_rows else [],
            "simbad_px": catalog.project(grid, simbad_rows, e["year"], 2000.0, limit=60) if simbad_rows else [],
            "valid_fraction": round(float((nvalid > 0).mean()), 3),
            "wave_target_um": [min(lams), max(lams)] if lams else None,
            "images": [{"obs_id": im["obs_id"], "collection": im["collection"], "mjd": round(im["mjd"], 4),
                        "wave_um": im["wave_um"], "wave_target_um": im.get("wave_target_um"),
                        "irsa_url": im["url"]} for im in used],
        })
    if len(stacks) < 1:
        raise NoDataError("Images were found but none could be downloaded. Try again in a minute.")

    lo, hi = render.stretch_limits(stacks)
    for m, img, core in zip(metas, stacks, cores):
        k = render.flux_scale(img, stacks[0])
        m["flux_scale_vs_first"] = round(k, 3)
        m["png"] = render.frame_png(img, lo, hi, core)
        m["diff_png"] = render.diff_png(img, stacks[0], k)

    cat = _catalog_block(grid, metas, gaia_rows, simbad_rows, catalogs)
    if cat is not None:
        cat["wise"] = _wise_block(grid, wise_rows, ra, dec, pmra, pmdec, pos_epoch, metas)

    return {
        "catalog": cat,
        "query": {"name": name, "ra": ra, "dec": dec, "pmra": pmra, "pmdec": pmdec, "pos_epoch": pos_epoch,
                  "fov_deg": fov, "band": band.upper(), "detector": metas[0]["detector"]},
        "center": {"ra": cra, "dec": cdec, "year": round(mean_year, 2)},
        "grid": {"size_px": grid.n, "arcsec_per_px": round(grid.scale, 3), "native_pixel_arcsec": PIXEL_ARCSEC,
                 "orientation": "north up, east left"},
        "epochs": metas,
        "n_images_found": len(obs),
        "source": "NASA/IPAC IRSA - SPHEREx Data Release 1 (spherex_dr1) + Quick Release 3 (spherex_qr3)",
        "limitations": LIMITATIONS,
        "warnings": warnings,
        "timings_s": {"search": round(t_search, 1), "download": round(t_download, 1),
                      "process": round(time.time() - t2, 1), "total": round(time.time() - t0, 1)},
    }
