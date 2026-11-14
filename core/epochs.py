"""Group SPHEREx images into observing epochs and pick the images to stack in each one."""
import datetime as dt

import numpy as np

BANDS = {"SWIR": (1, 2, 3), "MWIR": (4, 5, 6), "AUTO": (1, 2, 3, 4, 5, 6)}


def mjd_to_date(mjd):
    return (dt.datetime(1858, 11, 17) + dt.timedelta(days=float(mjd))).strftime("%Y-%m-%d")


def mjd_to_year(mjd):
    return 2000.0 + (float(mjd) - 51544.5) / 365.25


def group(obs, gap_days=30.0, max_span_days=45.0):
    """Split a time-sorted list into epochs: a new epoch after a gap > gap_days,
    and long continuous runs are cut into chunks of at most max_span_days."""
    obs = sorted(obs, key=lambda o: o["mjd"])
    if not obs:
        return []
    runs = [[obs[0]]]
    for o in obs[1:]:
        if o["mjd"] - runs[-1][-1]["mjd"] > gap_days:
            runs.append([o])
        else:
            runs[-1].append(o)
    out = []
    for g in runs:
        span = g[-1]["mjd"] - g[0]["mjd"]
        if span <= max_span_days:
            out.append(g)
            continue
        k = int(np.ceil(span / max_span_days))
        edges = np.linspace(g[0]["mjd"], g[-1]["mjd"] + 1e-6, k + 1)
        for i in range(k):
            sub = [o for o in g if edges[i] <= o["mjd"] < edges[i + 1]]
            if sub:
                out.append(sub)
    return out


def tightest(images, n):
    """The n images closest together in time (smallest time span)."""
    images = sorted(images, key=lambda o: o["mjd"])
    if len(images) <= n:
        return images
    spans = [images[i + n - 1]["mjd"] - images[i]["mjd"] for i in range(len(images) - n + 1)]
    i = int(np.argmin(spans))
    return images[i:i + n]


def select(obs, band="SWIR", detector=None, per_epoch=3, max_epochs=6, gap_days=30.0, max_span_days=45.0):
    """-> list of epochs [{label, date, mjd, year, detector, images:[...]}] in time order.

    All images of one detector are used (same detector = same wavelength coverage), so the
    frames of different epochs are comparable. The detector present in the most epochs wins."""
    allowed = (int(detector),) if detector else BANDS.get(band.upper(), BANDS["SWIR"])
    cands = [o for o in obs if o.get("detector") in allowed and o.get("mjd") is not None]
    if not cands:
        return []
    groups = group(cands, gap_days, max_span_days)
    best = None
    for d in sorted({o["detector"] for o in cands}):
        key = (sum(any(o["detector"] == d for o in g) for g in groups), sum(o["detector"] == d for o in cands))
        if best is None or key > best[0]:
            best = (key, d)
    d = best[1]
    epochs = []
    for g in groups:
        imgs = [o for o in g if o["detector"] == d]
        if not imgs:
            continue
        imgs = tightest(imgs, per_epoch)
        mjd = float(np.mean([o["mjd"] for o in imgs]))
        epochs.append({"date": mjd_to_date(mjd), "label": mjd_to_date(mjd)[:7], "mjd": mjd,
                       "year": mjd_to_year(mjd), "detector": d, "images": imgs})
    if len(epochs) > max_epochs:
        idx = sorted({int(round(i)) for i in np.linspace(0, len(epochs) - 1, max_epochs)})
        epochs = [epochs[i] for i in idx]
    return epochs
