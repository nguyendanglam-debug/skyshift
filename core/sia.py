"""Search NASA/IPAC IRSA for SPHEREx Level-2 images (IVOA SIA2 service).

Both the Data Release 1 (spherex_dr1: 2025 -> mid 2026) and Quick Release 3 (spherex_qr3: mid 2026 ->)
collections are queried and merged, so the time baseline is as long as possible.
To add a future release, append its collection name to COLLECTIONS.
"""
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

SIA_URL = "https://irsa.ipac.caltech.edu/SIA"
COLLECTIONS = ("spherex_dr1", "spherex_qr3")
UA = "skyshift-spaceapps/1.0 (NASA Space Apps Challenge project)"


class SiaError(Exception):
    pass


def _get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise SiaError(f"IRSA returned HTTP {e.code}") from e
    except Exception as e:
        raise SiaError(f"Could not reach IRSA: {e}") from e


def parse_votable(raw):
    """VOTable (TABLEDATA) -> list of dicts keyed by lower-case column name."""
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        raise SiaError("IRSA reply was not a valid VOTable") from e
    local = lambda t: t.split("}")[-1]
    for el in root.iter():
        if local(el.tag) == "INFO" and el.get("name", "").upper() == "ERROR":
            raise SiaError("IRSA error: " + (el.text or el.get("value", "")))
    table = next((el for el in root.iter() if local(el.tag) == "TABLE"), None)
    if table is None:
        return []
    fields = [(f.get("name") or f.get("ID") or "").lower() for f in table if local(f.tag) == "FIELD"]
    rows = []
    for tr in table.iter():
        if local(tr.tag) != "TR":
            continue
        vals = ["".join(td.itertext()).strip() for td in tr if local(td.tag) == "TD"]
        rows.append(dict(zip(fields, vals)))
    return rows


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def query_collection(ra, dec, collection, radius=0.02):
    q = urllib.parse.urlencode({"COLLECTION": collection, "POS": f"circle {ra:.6f} {dec:.6f} {radius}"})
    out = []
    for r in parse_votable(_get(f"{SIA_URL}?{q}")):
        url = r.get("access_url", "")
        if not url or "fits" not in (r.get("access_format", "") + url).lower():
            continue
        t0, t1 = _f(r.get("t_min")), _f(r.get("t_max"))
        mjd = (t0 + t1) / 2 if t0 is not None and t1 is not None else (t0 if t0 is not None else t1)
        m = re.search(r"D(\d)", r.get("energy_bandpassname", ""))
        e0, e1 = _f(r.get("em_min")), _f(r.get("em_max"))
        out.append({
            "obs_id": r.get("obs_id", ""), "collection": collection, "url": url, "mjd": mjd,
            "detector": int(m.group(1)) if m else None,
            "wave_um": [round(e0 * 1e6, 3), round(e1 * 1e6, 3)] if e0 and e1 else None,
        })
    return out


def query(ra, dec, radius=0.02, collections=COLLECTIONS):
    """All SPHEREx images covering (ra, dec) in degrees, newest collections merged, sorted by time."""
    with ThreadPoolExecutor(max_workers=len(collections)) as ex:
        parts = list(ex.map(lambda c: query_collection(ra, dec, c, radius), collections))
    seen, merged = set(), []
    for part in parts:
        for o in part:
            if o["url"] not in seen and o["mjd"] is not None:
                seen.add(o["url"])
                merged.append(o)
    return sorted(merged, key=lambda o: o["mjd"])
