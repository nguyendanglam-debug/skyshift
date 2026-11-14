"""Read SPHEREx FITS cutouts, mask bad pixels, align them on a common sky grid and stack them.

Per image: IMAGE (MJy/sr) -> bad pixels (FLAGS) set to NaN -> local median background removed.
Alignment: the image WCS (TAN + SIP distortion, via astropy) maps every pixel of our own sky grid
back to the image, and the value is read with bilinear interpolation.
Per epoch: median of the aligned images (robust against cosmic rays and bad pixels).
"""
import io
import logging
import warnings

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

# SPHEREx FLAGS bits (from the FITS header): TRANSIENT 0, SUR_ERROR 2, PHANTOM 4, REFERENCE 5, NONFUNC 6,
# MISSING_DATA 9, HOT 10, COLD 11, PERSIST 17, OUTLIER 19, BLOOM 26, SNOWBALL 27, HALO 28.
BAD_BITS = (0, 2, 4, 5, 6, 9, 10, 11, 17, 19, 26, 27, 28)
# OVERFLOW 1 and NONLINEAR 15 = saturated/unreliable flux. Pixels are KEPT (so a bright star is not a hole)
# but counted and reported, and flux measured from them must not be trusted.
SAT_BITS = (1, 15)


# Pixels around a very bright star carry TRANSIENT/SUR_ERROR/BLOOM flags too. They stay masked (NaN) for any
# measurement, but when a whole epoch has no valid value there we paint them white in the picture (= saturated core).
CORE_BITS = (0, 1, 2, 15, 26)


def _mask(bits):
    m = 0
    for b in bits:
        m |= 1 << b
    return m


BAD_MASK, SAT_MASK, CORE_MASK = _mask(BAD_BITS), _mask(SAT_BITS), _mask(CORE_BITS)


logging.getLogger("astropy").setLevel(logging.ERROR)      # astropy prints an INFO note about SIP on the wavelength WCS


class Cutout:
    __slots__ = ("image", "sat", "core", "wcs", "wwcs", "mjd", "detector", "obsid", "n_bad_frac")

    def wavelength(self, ra, dec):
        """Wavelength (micron) and bandwidth (micron) at the sky position, from the WCS-WAVE lookup table.
        SPHEREx uses linear variable filters, so every pixel sees a slightly different wavelength."""
        if self.wwcs is None:
            return None
        try:
            x, y = self.wcs.all_world2pix([ra], [dec], 0, quiet=True)
            lam, bw = self.wwcs.all_pix2world([[float(x[0]), float(y[0])]], 0)[0][:2]
            return (float(lam), float(bw)) if np.isfinite(lam) and 0.3 < lam < 6 else None
        except Exception:
            return None


def read_cutout(raw):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with fits.open(io.BytesIO(raw), memmap=False) as h:
            hdr = h["IMAGE"].header
            img = np.array(h["IMAGE"].data, dtype=np.float64)
            flg = np.array(h["FLAGS"].data, dtype=np.int64)
            c = Cutout()
            c.wcs = WCS(hdr)                       # primary (celestial) WCS only
            try:
                c.wwcs = WCS(hdr, fobj=h, key="W")   # wavelength lookup table (alternate WCS 'W')
            except Exception:
                c.wwcs = None
            c.mjd = float(hdr.get("MJD-AVG", hdr.get("MJD-OBS")))
            c.detector = int(hdr.get("DETECTOR", 0))
            c.obsid = str(hdr.get("OBSID", ""))
    bad = (flg & BAD_MASK) != 0
    img[bad | ~np.isfinite(img)] = np.nan
    good = img[np.isfinite(img)]
    if good.size:
        img -= np.median(good)                      # local background (median of the cutout)
    c.image = img
    c.sat = (flg & SAT_MASK) != 0
    c.core = (flg & CORE_MASK) != 0
    c.n_bad_frac = float(bad.mean())
    return c


class Grid:
    """Square tangent-plane grid on the sky: north up, east to the LEFT (the usual sky orientation)."""

    def __init__(self, ra0, dec0, fov_deg, scale_arcsec):
        self.ra0, self.dec0 = float(ra0), float(dec0)
        self.scale = float(scale_arcsec)
        self.n = max(8, int(round(fov_deg * 3600.0 / self.scale)))
        self.c = (self.n - 1) / 2.0
        self.fov = fov_deg

    def sky(self):
        s = np.radians(self.scale / 3600.0)
        col, row = np.meshgrid(np.arange(self.n), np.arange(self.n))
        xi, eta = (self.c - col) * s, (self.c - row) * s            # east, north (radians on the tangent plane)
        rho = np.hypot(xi, eta)
        cc = np.arctan(rho)
        d0, a0 = np.radians(self.dec0), np.radians(self.ra0)
        with np.errstate(invalid="ignore", divide="ignore"):
            ratio = np.where(rho > 0, eta * np.sin(cc) * np.cos(d0) / rho, 0.0)
        dec = np.arcsin(np.cos(cc) * np.sin(d0) + ratio)
        ra = a0 + np.arctan2(xi * np.sin(cc), rho * np.cos(d0) * np.cos(cc) - eta * np.sin(d0) * np.sin(cc))
        return np.degrees(ra) % 360.0, np.degrees(dec)

    def to_pixel(self, ra, dec):
        """(ra, dec) degrees -> (col, row) on this grid (floats; may be outside)."""
        a, d = np.radians(ra), np.radians(dec)
        a0, d0 = np.radians(self.ra0), np.radians(self.dec0)
        cosc = np.sin(d0) * np.sin(d) + np.cos(d0) * np.cos(d) * np.cos(a - a0)
        xi = np.cos(d) * np.sin(a - a0) / cosc
        eta = (np.cos(d0) * np.sin(d) - np.sin(d0) * np.cos(d) * np.cos(a - a0)) / cosc
        s = np.radians(self.scale / 3600.0)
        return self.c - xi / s, self.c - eta / s


def _bilinear(img, x, y):
    h, w = img.shape
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    ok = np.isfinite(x) & np.isfinite(y) & (x0 >= 0) & (y0 >= 0) & (x0 < w - 1) & (y0 < h - 1)
    out = np.full(x.shape, np.nan)
    xi, yi, fxx, fyy = x0[ok], y0[ok], fx[ok], fy[ok]
    out[ok] = (img[yi, xi] * (1 - fxx) * (1 - fyy) + img[yi, xi + 1] * fxx * (1 - fyy)
               + img[yi + 1, xi] * (1 - fxx) * fyy + img[yi + 1, xi + 1] * fxx * fyy)   # NaN propagates
    return out


def regrid(co, grid, ra, dec):
    """Resample one cutout onto the grid. -> (flux grid, saturated grid, bright-core grid)."""
    x, y = co.wcs.all_world2pix(ra.ravel(), dec.ravel(), 0, quiet=True)
    x, y = x.reshape(ra.shape), y.reshape(ra.shape)
    flux = _bilinear(co.image, x, y)
    sat = _bilinear(co.sat.astype(float), x, y) > 0
    core = _bilinear(co.core.astype(float), x, y) > 0
    return flux, sat, core


def stack_epoch(cutouts, grid):
    """Median-stack the aligned cutouts of one epoch.
    -> (image, saturated mask, n_valid per pixel, core mask: no valid data AND bright-star flags)."""
    ra, dec = grid.sky()
    frames, sats, cores = [], [], []
    for co in cutouts:
        f, s, k = regrid(co, grid, ra, dec)
        frames.append(f)
        sats.append(s)
        cores.append(k)
    cube = np.stack(frames)
    n_valid = np.isfinite(cube).sum(axis=0)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        med = np.nanmedian(cube, axis=0)
    return med, np.any(sats, axis=0), n_valid, np.isnan(med) & np.any(cores, axis=0)
