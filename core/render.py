"""Turn stacked epochs into PNG frames (one shared stretch, so epochs are directly comparable)."""
import base64
import io

import numpy as np
from PIL import Image


def _b64(arr_u8):
    buf = io.BytesIO()
    Image.fromarray(arr_u8, "L").save(buf, "PNG", compress_level=6)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def stretch_limits(stacks):
    pooled = np.concatenate([s[np.isfinite(s)] for s in stacks if np.isfinite(s).any()] or [np.zeros(1)])
    lo, hi = np.percentile(pooled, [2.0, 99.7])
    if hi <= lo:
        hi = lo + 1.0
    return float(lo), float(hi)


def frame_png(img, lo, hi, core=None, soft=10.0):
    """core = pixels with no valid data around a very bright star: painted white (saturated)."""
    a = np.where(core, hi, img) if core is not None else img
    x = np.clip((np.nan_to_num(a, nan=lo) - lo) / (hi - lo), 0, 1)
    x = np.arcsinh(soft * x) / np.arcsinh(soft)            # asinh: faint stars and bright stars both visible
    return _b64((x * 255).astype(np.uint8))


def flux_scale(img, ref):
    """Robust ratio img/ref over the bright stars both frames share (epochs differ in wavelength, so a
    star can look uniformly a bit brighter or fainter). Returns 1.0 if it cannot be estimated."""
    ok = np.isfinite(img) & np.isfinite(ref)
    if ok.sum() < 20:
        return 1.0
    sg = 1.4826 * np.median(np.abs(ref[ok] - np.median(ref[ok]))) or 1.0
    bright = ok & (ref > 8 * sg)
    if bright.sum() < 10:
        return 1.0
    return float(np.clip(np.median(img[bright] / ref[bright]), 0.4, 2.5))


def diff_png(img, ref, k=1.0):
    """epoch - k*first epoch. Mid-grey = no change, white = brighter now, black = fainter now."""
    d = img - k * ref
    ok = np.isfinite(d)
    if not ok.any():
        return _b64(np.full(img.shape, 128, np.uint8))
    sg = 1.4826 * np.median(np.abs(d[ok] - np.median(d[ok]))) or 1.0
    v = np.clip(np.nan_to_num(d, nan=0.0) / (10 * sg), -1, 1)
    return _b64((128 + 127 * v).astype(np.uint8))
