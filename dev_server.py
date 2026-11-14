"""Run SkyShift locally:  python dev_server.py   ->  http://127.0.0.1:5000"""
from api.index import create_app

if __name__ == "__main__":
    create_app(serve_static=True).run(host="127.0.0.1", port=5000, debug=False, threaded=True)
