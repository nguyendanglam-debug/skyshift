"""SkyShift API (Flask). Stateless: every request returns everything the page needs, so it is safe on Vercel.

  GET /api/frames?ra=&dec=&fov=&band=&detector=&per_epoch=&max_epochs=&pmra=&pmdec=&pos_epoch=
  GET /api/frames?target=barnard|epsindib|wise0855|rwaur|rdra
  GET /api/targets
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from flask import Flask, jsonify, request, send_from_directory  # noqa: E402

from core import pipeline, sia, targets  # noqa: E402

PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")


def _num(name, default, lo=None, hi=None, cast=float):
    raw = request.args.get(name)
    if raw in (None, ""):
        return default
    try:
        v = cast(raw)
    except ValueError:
        raise ValueError(f"'{name}' must be a number")
    if lo is not None and v < lo or hi is not None and v > hi:
        raise ValueError(f"'{name}' must be between {lo} and {hi}")
    return v


def create_app(serve_static=False):
    app = Flask(__name__, static_folder=None)

    @app.after_request
    def headers(resp):
        resp.headers["Access-Control-Allow-Origin"] = "*"       # so other sites can embed / call it
        return resp

    @app.get("/api/targets")
    def api_targets():
        return jsonify(targets=targets.public_list())

    @app.get("/api/frames")
    def api_frames():
        try:
            t = targets.TARGETS.get(request.args.get("target", ""))
            if t:
                ra, dec, name = t["ra"], t["dec"], t["name"]
                d = dict(pmra=t["pmra"], pmdec=t["pmdec"], pos_epoch=t["pos_epoch"], band=t["band"], detector=t["detector"])
            else:
                ra, dec, name = _num("ra", None, 0, 360), _num("dec", None, -90, 90), request.args.get("name", "")
                if ra is None or dec is None:
                    raise ValueError("Give ra and dec in decimal degrees (or target=barnard ...).")
                d = dict(pmra=None, pmdec=None, pos_epoch=2000.0, band="SWIR", detector=None)
            pmra = _num("pmra", d["pmra"])
            pmdec = _num("pmdec", d["pmdec"])
            if (pmra is None) != (pmdec is None):
                raise ValueError("Give both pmra and pmdec (mas/yr), or neither.")
            band = request.args.get("band", d["band"]).upper()
            if band not in ("SWIR", "MWIR", "AUTO"):
                raise ValueError("band must be SWIR, MWIR or AUTO")
            res = pipeline.build_frames(
                ra, dec, fov=_num("fov", 0.1, 0.03, 0.3), band=band,
                detector=_num("detector", d["detector"], 1, 6, int),
                per_epoch=_num("per_epoch", 3, 1, 6, int), max_epochs=_num("max_epochs", 6, 2, 10, int),
                pmra=pmra, pmdec=pmdec, pos_epoch=_num("pos_epoch", d["pos_epoch"], 1900, 2100), name=name)
            resp = jsonify(res)
            resp.headers["Cache-Control"] = "public, s-maxage=86400, stale-while-revalidate=604800"
            return resp
        except ValueError as e:
            return jsonify(error=str(e)), 400
        except pipeline.NoDataError as e:
            return jsonify(error=str(e)), 404
        except sia.SiaError as e:
            return jsonify(error=f"NASA IRSA is not answering right now ({e}). Please try again in a minute."), 502
        except Exception as e:                                   # last resort: never return an HTML stack trace
            return jsonify(error=f"Unexpected error: {e}"), 500

    if serve_static:                                              # local development only
        @app.get("/")
        def index():
            return send_from_directory(PUBLIC, "index.html")

        @app.get("/<path:p>")
        def static_files(p):
            return send_from_directory(PUBLIC, p)

    return app


app = create_app()
