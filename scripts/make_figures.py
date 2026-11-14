"""Make slide-ready figures (PNG, 1600x900) from the pre-computed data, in the SkyShift colours.

    python scripts/make_figures.py        # writes figures/*.png
"""
import base64
import io
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PRE = os.path.join(ROOT, "public", "precomputed")
OUT = os.path.join(ROOT, "figures")
os.makedirs(OUT, exist_ok=True)

BG, BRAND, BLUE, ACC, TXT, MUTED, WARN = "#041B41", "#063E99", "#2E8CF0", "#E6FF10", "#FFFFFF", "#B8C7E6", "#FFB020"
plt.rcParams.update({"figure.facecolor": BG, "axes.facecolor": BG, "savefig.facecolor": BG, "text.color": TXT,
                     "axes.labelcolor": MUTED, "xtick.color": MUTED, "ytick.color": MUTED, "axes.edgecolor": MUTED,
                     "font.size": 16, "font.family": "DejaVu Sans"})


def load(key):
    p = os.path.join(PRE, key + ".json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None


def png(uri):
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(uri.split(",", 1)[1]))).convert("L"))


def strip(key, kind, title, fname, subtitle=None, skip_first=False):
    r = load(key)
    if not r:
        return
    n = r["grid"]["size_px"]
    E = r["epochs"][1:] if skip_first else r["epochs"]
    fig, axs = plt.subplots(1, len(E), figsize=(16, 5.6))
    axs = np.atleast_1d(axs)
    for ax, e in zip(axs, E):
        ax.imshow(png(e[kind]), cmap="gray", vmin=0, vmax=255, interpolation="bilinear")
        m = e.get("marker")
        if m:
            ax.add_patch(plt.Circle((m["col"], m["row"]), n * 0.065, fill=False, ec=ACC, lw=2.2))
        ms = e.get("measure", {})
        extra = f"  S/N {ms['snr']}" if key == "wise0855" and "snr" in ms else ""
        ax.set_title(e["date"] + extra, color=TXT, fontsize=17)
        ax.set_xticks([]); ax.set_yticks([])
        for s in ax.spines.values():
            s.set_color(BRAND)
    fig.suptitle(title, color=TXT, fontsize=22, fontweight="bold", y=0.975)
    if subtitle:
        fig.text(0.5, 0.02, subtitle, ha="center", color=MUTED, fontsize=14)
    fig.tight_layout(rect=(0, 0.06, 1, 0.9))
    fig.savefig(os.path.join(OUT, fname), dpi=120)
    plt.close(fig)


def spectrum(key, title, fname, notes=()):
    p = os.path.join(PRE, key + "_spectrum.json")
    if not os.path.exists(p):
        return
    s = json.load(open(p, encoding="utf-8"))
    pts = [q for q in s["points"] if q["flux_mJy"] is not None]
    good = [q for q in pts if not q["saturated"]]
    if len(good) < 30:                      # mostly saturated: not a spectrum
        return
    fig, ax = plt.subplots(figsize=(16, 7.2))
    for lo, hi, name in [(0.75, 1.09, "D1"), (1.09, 1.62, "D2"), (1.62, 2.42, "D3"), (2.42, 3.82, "D4"), (3.82, 4.42, "D5"), (4.42, 5.0, "D6")]:
        ax.axvspan(lo, hi, color=BRAND, alpha=0.18 if name in ("D1", "D3", "D5") else 0.06, lw=0)
        ax.text((lo + hi) / 2, 0.02, name, transform=ax.get_xaxis_transform(), ha="center", va="bottom", color=MUTED, fontsize=13)
    ax.errorbar([q["lam_um"] for q in good], [q["flux_mJy"] for q in good], yerr=[q["err_mJy"] for q in good],
                fmt="o", ms=4.5, color=ACC, ecolor=ACC, elinewidth=1, alpha=0.9, label=f"{len(good)} SPHEREx images")
    sat = [q for q in pts if q["saturated"]]
    if sat:
        ax.plot([q["lam_um"] for q in sat], [q["flux_mJy"] for q in sat], "o", mfc="none", mec=WARN, ms=6, label="saturated")
    top = max(q["flux_mJy"] for q in good)
    for x, y, t in notes:
        ax.annotate(t, xy=(x, y * top), xytext=(x, (y + 0.12) * top), color=TXT, fontsize=15, ha="center",
                    arrowprops=dict(arrowstyle="-", color=MUTED, lw=1))
    ax.set_xlim(0.7, 5.1); ax.set_ylim(-0.03 * top, top * 1.25)
    ax.set_xlabel("wavelength (µm)"); ax.set_ylabel("flux (mJy, aperture sum)")
    ax.set_title(title, color=TXT, fontsize=24, fontweight="bold", pad=14)
    ax.grid(color=MUTED, alpha=0.18)
    ax.legend(loc="upper left", facecolor=BG, edgecolor=MUTED, labelcolor=TXT, fontsize=14)
    fig.text(0.5, 0.01, "Each point = one SPHEREx image (2025-2026). Data: NASA/IPAC IRSA, SPHEREx DR1 + QR3.", ha="center", color=MUTED, fontsize=13)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    fig.savefig(os.path.join(OUT, fname), dpi=120)
    plt.close(fig)


def offsets(fname):
    rows = []
    for key, name in [("barnard", "Barnard's Star"), ("epsindib", "Epsilon Indi B"), ("wise0855", "WISE 0855")]:
        r = load(key)
        if not r:
            continue
        for e in r["epochs"]:
            m = e.get("measure", {})
            if "offset_arcsec" in m:
                rows.append((name, m["offset_arcsec"], e["date"]))
    if not rows:
        return
    names = list(dict.fromkeys(r[0] for r in rows))
    fig, ax = plt.subplots(figsize=(16, 7.2))
    for i, nme in enumerate(names):
        ys = [r[1] for r in rows if r[0] == nme]
        ax.plot(np.full(len(ys), i) + np.linspace(-0.12, 0.12, len(ys)), ys, "o", ms=13, color=ACC, mec=BG)
    ax.axhline(6.15, color=BLUE, ls="--", lw=2)
    ax.text(len(names) - 0.55, 6.3, "1 SPHEREx pixel (6.15″)", color=BLUE, ha="right", fontsize=15)
    ax.set_xticks(range(len(names))); ax.set_xticklabels(names, fontsize=18)
    ax.set_ylim(0, 7.5); ax.set_xlim(-0.6, len(names) - 0.4)
    ax.set_ylabel("measured position minus catalogue prediction (arcsec)")
    ax.set_title("The catalogue prediction matches the measured position to within a fraction of a pixel", color=TXT, fontsize=22, fontweight="bold", pad=14)
    ax.grid(axis="y", color=MUTED, alpha=0.18)
    fig.text(0.5, 0.01, "One dot per observing epoch where the position could be measured (S/N ≥ 5, or the centre of the saturated core).", ha="center", color=MUTED, fontsize=13)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    fig.savefig(os.path.join(OUT, fname), dpi=120)
    plt.close(fig)


strip("barnard", "png", "Barnard's Star moves 10.3″ in 363 days (yellow ring = catalogue prediction)", "fig1_barnard_flipbook.png",
      "SPHEREx epochs, median of 4 images each. The centre of the star is saturated and painted white.")
strip("barnard", "diff_png", "Difference view: each epoch minus the first (white = brighter now, black = fainter now)", "fig2_barnard_difference.png",
      "A moving star leaves a white and black pair; unchanged stars cancel to grey.", skip_first=True)
strip("wise0855", "png", "WISE 0855, the coldest known brown dwarf, detected in SPHEREx detector 6 (4.4-5 µm)", "fig3_wise0855.png",
      "Faint source inside the yellow ring; more images stacked in later epochs gives a higher signal-to-noise.")
spectrum("epsindib", "Epsilon Indi B: a brown dwarf spectrum from 459 SPHEREx images", "fig4_spectrum_epsindib.png",
         notes=[(1.2, 0.55, "J"), (1.62, 0.7, "H"), (2.1, 0.45, "K"), (4.0, 1.0, "4 µm window")])
spectrum("rwaur", "RW Aurigae: spectrum from SPHEREx images", "fig5_spectrum_rwaur.png")
spectrum("wise0855", "WISE 0855: invisible below 4 µm, detected beyond", "fig6_spectrum_wise0855.png")
offsets("fig7_position_check.png")
print("figures:", sorted(os.listdir(OUT)))
