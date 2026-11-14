"""Download small image cutouts from the IRSA cutout service (in parallel, with a disk cache)."""
import hashlib
import os
import tempfile
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = "skyshift-spaceapps/1.0 (NASA Space Apps Challenge project)"
CACHE_DIR = os.path.join(tempfile.gettempdir(), "skyshift_cache")   # /tmp on Vercel (the only writable place)


class CutoutError(Exception):
    pass


def cutout_url(url, ra, dec, size_deg):
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}center={ra:.6f},{dec:.6f}&size={size_deg:.4f}"


def fetch(url, ra, dec, size_deg, retries=3, timeout=120):
    full = cutout_url(url, ra, dec, size_deg)
    path = os.path.join(CACHE_DIR, hashlib.sha1(full.encode()).hexdigest() + ".fits")
    try:
        if os.path.getsize(path) > 2880:
            with open(path, "rb") as fh:
                return fh.read()
    except OSError:
        pass
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(full, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
            if raw[:6] != b"SIMPLE":
                raise CutoutError("reply was not a FITS file: " + raw[:120].decode("utf-8", "ignore"))
            try:
                os.makedirs(CACHE_DIR, exist_ok=True)
                with open(path, "wb") as fh:
                    fh.write(raw)
            except OSError:
                pass
            return raw
        except (urllib.error.URLError, CutoutError, TimeoutError, ConnectionError) as e:
            last = e
            time.sleep(2.0 * (attempt + 1))        # back off: IRSA answers 503 when it is busy
    raise CutoutError(str(last))


def fetch_many(urls, ra, dec, size_deg, workers=4):
    """-> {url: bytes or Exception}"""
    def one(u):
        try:
            return fetch(u, ra, dec, size_deg)
        except Exception as e:      # keep going: one bad image must not kill the whole animation
            return e
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return dict(zip(urls, ex.map(one, urls)))
