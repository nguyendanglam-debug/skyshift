"""Reference catalogues for the overlay: Gaia DR3 (ESA archive, TAP) and SIMBAD (CDS).

Both are best effort: a short timeout, and any failure returns None so the images still show without the overlay.
The five challenge targets get the catalogue data pre-computed (scripts/precompute.py), so the demo never waits for them.
"""
import csv
import io
import math
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

GAIA_TAP = "https://gea.esac.esa.int/tap-server/tap/sync"
SIMBAD_TAP = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"
SESAME = "https://cds.unistra.fr/cgi-bin/nph-sesame/-ox/SNV?"
GAIA_EPOCH = 2016.0
GAIA_G_LIMIT = 18.0           # brighter than this; SPHEREx pixels are 6 arcsec, fainter stars only add clutter
GAIA_MAX = 300


def _tap(url, query, timeout):
    data = urllib.parse.urlencode({"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": query}).encode()
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "SkyShift/1.0 (NASA Space Apps)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        text = r.read().decode("utf-8", "replace")
    return list(csv.DictReader(io.StringIO(text)))


def _f(v):
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def gaia(ra, dec, radius_deg, timeout=10):
    """Gaia DR3 stars (epoch 2016.0) around a position, brightest first. None if the service does not answer."""
    q = ("SELECT TOP %d source_id, ra, dec, pmra, pmdec, parallax, phot_g_mean_mag FROM gaiadr3.gaia_source "
         "WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',%.6f,%.6f,%.5f)) AND phot_g_mean_mag < %.1f "
         "ORDER BY phot_g_mean_mag" % (GAIA_MAX, ra, dec, radius_deg, GAIA_G_LIMIT))
    try:
        rows = _tap(GAIA_TAP, q, timeout)
    except Exception:
        return None
    out = []
    for r in rows:
        a, d, g = _f(r.get("ra")), _f(r.get("dec")), _f(r.get("phot_g_mean_mag"))
        if a is None or d is None or g is None:
            continue
        out.append({"id": r["source_id"], "ra": a, "dec": d, "g": round(g, 2),
                    "pmra": _f(r.get("pmra")), "pmdec": _f(r.get("pmdec")), "plx": _f(r.get("parallax"))})
    return out


def simbad(ra, dec, radius_deg, timeout=8):
    """SIMBAD objects (J2000, with proper motion) around a position. None if the service does not answer."""
    q = ("SELECT TOP 80 main_id, ra, dec, otype, pmra, pmdec FROM basic "
         "WHERE CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',%.6f,%.6f,%.5f))=1" % (ra, dec, radius_deg))
    try:
        rows = _tap(SIMBAD_TAP, q, timeout)
    except Exception:
        return None
    out = []
    for r in rows:
        a, d = _f(r.get("ra")), _f(r.get("dec"))
        if a is None or d is None:
            continue
        out.append({"id": (r.get("main_id") or "").strip(), "ra": a, "dec": d, "otype": (r.get("otype") or "").strip(),
                    "pmra": _f(r.get("pmra")), "pmdec": _f(r.get("pmdec"))})
    return out


def sesame_target(name, timeout=10):
    """What SIMBAD calls a named object (through the CDS Sesame name resolver): main name and object type."""
    try:
        req = urllib.request.Request(SESAME + urllib.parse.quote(name), headers={"User-Agent": "SkyShift/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            xml = r.read().decode("utf-8", "replace")
    except Exception:
        return None
    m_name = re.search(r"<oname>([^<]+)</oname>", xml)
    m_type = re.search(r"<otype>([^<]+)</otype>", xml)
    if not m_name:
        return None
    return {"id": m_name.group(1).replace("NAME ", "").strip(), "otype": m_type.group(1).strip() if m_type else ""}


GATOR = "https://irsa.ipac.caltech.edu/cgi-bin/Gator/nph-query"
WISE_EPOCH = 2010.5           # AllWISE: WISE observed the sky in 2010 (mean epoch about 2010.5)
WISE_W2_LIMIT = 16.0           # W2 (4.6 micron) brighter than this; SPHEREx sees these in its long-wavelength detectors
WISE_MAX = 300


def wise(ra, dec, radius_deg, timeout=12):
    """AllWISE sources (IRSA Gator) around a position, brightest in W2 first, at the position WISE saw them in 2010.

    They are deliberately NOT moved with a proper motion: AllWISE motions come from a few months of data and are
    unreliable, and the 2010 position is the point. A star that moved since then (Barnard's Star, WISE 0855) sits
    away from its WISE diamond in the SPHEREx frames: a 15-year baseline for free. None if the service does not answer."""
    q = urllib.parse.urlencode({
        "catalog": "allwise_p3as_psd", "spatial": "Cone", "objstr": "%.6f %.6f" % (ra, dec), "radius": "%.5f" % radius_deg,
        "radunits": "deg", "outfmt": "3",
        "selcols": "designation,ra,dec,w1mpro,w2mpro,ph_qual,cc_flags",
        "constraints": "w2mpro < %.1f" % WISE_W2_LIMIT})
    try:
        req = urllib.request.Request(GATOR + "?" + q, headers={"User-Agent": "SkyShift/1.0 (NASA Space Apps)"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            xml = r.read()
        root = ET.fromstring(xml)
    except Exception:
        return None
    local = lambda e: e.tag.rsplit("}", 1)[-1]
    names = [f.get("name") for f in root.iter() if local(f) == "FIELD"]
    out = []
    for tr in (e for e in root.iter() if local(e) == "TR"):
        row = dict(zip(names, [(td.text or "").strip() for td in tr if local(td) == "TD"]))
        a, d, w2 = _f(row.get("ra")), _f(row.get("dec")), _f(row.get("w2mpro"))
        if a is None or d is None or w2 is None:
            continue
        w1 = _f(row.get("w1mpro"))
        out.append({"id": "J" + row.get("designation", "").lstrip("J"), "ra": a, "dec": d,
                    "w1": round(w1, 2) if w1 is not None else None, "w2": round(w2, 2),
                    "q": row.get("ph_qual", ""), "cc": row.get("cc_flags", "")})
    out.sort(key=lambda s: s["w2"])
    return out[:WISE_MAX]


def move(ra, dec, pmra, pmdec, from_year, to_year):
    if pmra is None or pmdec is None:
        return ra, dec
    dt = to_year - from_year
    dec2 = dec + pmdec * dt / 3.6e6
    ra2 = ra + pmra * dt / 3.6e6 / max(math.cos(math.radians(0.5 * (dec + dec2))), 1e-6)
    return ra2 % 360.0, dec2


def project(grid, stars, year, epoch, limit=200):
    """Pixel positions [col, row, index] of catalogue stars on a grid, moved to `year`. Only those inside the grid."""
    out = []
    for i, s in enumerate(stars):
        a, d = move(s["ra"], s["dec"], s.get("pmra"), s.get("pmdec"), epoch, year)
        col, row = grid.to_pixel(a, d)
        if 0 <= col < grid.n and 0 <= row < grid.n:
            out.append([round(float(col), 1), round(float(row), 1), i])
        if len(out) >= limit:
            break
    return out
