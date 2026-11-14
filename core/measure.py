"""Simple, honest measurements on the stacked frames: signal-to-noise, flux and position of the target.

Everything is measured at the position predicted from the catalogue proper motion, so a detection
here is a TEST of that prediction. Low signal-to-noise is reported as 'not detected', never as a position.

Saturated stars: the brightest pixels are masked, so the flux is only a LOWER LIMIT (marked unreliable)
and the position is taken from the centre of the saturated core instead of from the flux.
"""
import numpy as np

ARCSEC2_SR = 2.3504e-11          # 1 arcsec^2 in steradian
MIN_SNR_POSITION = 5.0           # do not report a centroid below this: it would just return the prediction


def _disk(shape, col, row, r_in, r_out=None):
    yy, xx = np.mgrid[:shape[0], :shape[1]]
    d = np.hypot(xx - col, yy - row)
    return (d <= r_in) if r_out is None else ((d >= r_in) & (d <= r_out)), xx, yy


def _offsets(out, cx, cy, col, row, scale):
    out["offset_east_arcsec"] = round(-(cx - col) * scale, 2)      # east is to the left
    out["offset_north_arcsec"] = round(-(cy - row) * scale, 2)     # north is up
    out["offset_arcsec"] = round(float(np.hypot(cx - col, cy - row) * scale), 2)
    out["centroid"] = {"col": round(float(cx), 2), "row": round(float(cy), 2)}


def measure_epoch(img, col, row, scale_arcsec, oversample, saturated=False, core=None):
    """img: stacked frame (MJy/sr, background-subtracted, NaN = no data); (col,row): predicted position;
    core: mask of pixels with no valid data next to a bright-star flag (the saturated core)."""
    r_ap = 2.0 * oversample                                    # 2 native SPHEREx pixels
    ann, _, _ = _disk(img.shape, col, row, 4.0 * oversample, 7.0 * oversample)
    vals = img[ann & np.isfinite(img)]
    out = {"detected": False, "flux_reliable": not saturated, "saturated": bool(saturated)}
    if vals.size < 30:
        out["reason"] = "too little valid data around the target"
        return out
    bkg = float(np.median(vals))
    sigma = float(1.4826 * np.median(np.abs(vals - bkg)))      # per-pixel noise from the surrounding annulus
    ap, xx, yy = _disk(img.shape, col, row, r_ap)
    ok = ap & np.isfinite(img)
    n = int(ok.sum())
    snr = 0.0
    if n >= 0.5 * ap.sum() and sigma > 0:
        flux_sb = float((img[ok] - bkg).sum())                 # MJy/sr summed over grid pixels
        noise_sb = sigma * np.sqrt(n) * oversample             # x oversample: bilinear resampling correlates neighbours
        snr = flux_sb / noise_sb
        to_mjy = scale_arcsec ** 2 * ARCSEC2_SR * 1e9          # MJy/sr * sr -> mJy
        out.update(snr=round(float(snr), 1), flux_mJy=round(flux_sb * to_mjy, 4), flux_err_mJy=round(noise_sb * to_mjy, 4),
                   detected=bool(snr >= 3.0))
        if saturated:
            out["note"] = "lower limit: the saturated centre is masked"
    elif not saturated:
        out["reason"] = "target near the edge of the data"
        return out

    if True:
        # Brightness PROXY: the flux in the PSF wings (ring 3-6 native px), which scales with the total flux and
        # survives saturation. Computed for EVERY epoch so a series always uses one consistent measure
        # (the page switches to it for all epochs when any epoch is saturated). Trend only: the PSF changes with wavelength.
        ring, _, _ = _disk(img.shape, col, row, 3.0 * oversample, 6.0 * oversample)
        outer, _, _ = _disk(img.shape, col, row, 9.0 * oversample, 13.0 * oversample)
        ov, rv = img[outer & np.isfinite(img)], img[ring & np.isfinite(img)]
        if ov.size >= 50 and rv.size >= 0.5 * ring.sum():
            b2 = float(np.median(ov))
            s2 = float(1.4826 * np.median(np.abs(ov - b2)))
            to_mjy = scale_arcsec ** 2 * ARCSEC2_SR * 1e9
            out["proxy_flux_mJy"] = round(float((rv - b2).sum() * (ring.sum() / rv.size)) * to_mjy, 4)
            out["proxy_err_mJy"] = round(s2 * np.sqrt(rv.size) * oversample * to_mjy, 4)
        if saturated and core is not None:
            reg, _, _ = _disk(img.shape, col, row, 8.0 * oversample)
            out["core_px"] = int((core & reg).sum())
    if saturated and core is not None:
        reg, _, _ = _disk(img.shape, col, row, 8.0 * oversample)
        pts = core & reg
        if pts.sum() >= 5:                                     # centre of the saturated blob = position of the star
            ys, xs = np.nonzero(pts)
            _offsets(out, xs.mean(), ys.mean(), col, row, scale_arcsec)
            out["position_method"] = "centre of the saturated core"
            out["detected"] = True
            return out
    if snr >= MIN_SNR_POSITION and not saturated:
        cx, cy = col, row
        for _ in range(4):                                     # re-centre on the flux-weighted centroid
            w_ap, _, _ = _disk(img.shape, cx, cy, r_ap)
            m = w_ap & np.isfinite(img)
            w = np.clip(np.where(m, img - bkg, 0.0), 0, None)
            if w.sum() <= 0:
                break
            cx, cy = float((w * xx).sum() / w.sum()), float((w * yy).sum() / w.sum())
        _offsets(out, cx, cy, col, row, scale_arcsec)
        out["position_method"] = "flux-weighted centroid"
    return out
