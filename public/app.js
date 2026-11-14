"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const t = (...a) => I18N.t(...a);
  I18N.init();
  const PRESETS = [
    { id: "barnard", name: "Barnard's Star" },
    { id: "epsindib", name: "Epsilon Indi B" },
    { id: "wise0855", name: "WISE 0855" },
    { id: "rwaur", name: "RW Aurigae" },
    { id: "rdra", name: "R Draconis" },
  ];
  const SPECTRUM_TARGETS = ["epsindib"];
  const FIELDS = ["ra", "dec", "fov", "band", "pmra", "pmdec", "pos_epoch", "detector"];

  let data = null, idx = 0, view = "flip", playing = true, timer = null, busy = false;

  // ---------- helpers ----------
  const mjdDate = (m) => new Date((m - 40587) * 86400000).toISOString().slice(0, 10);
  const fmt = (v, d = 4) => (v === null || v === undefined || Number.isNaN(+v) ? "" : (+v).toFixed(d));
  function el(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function kv(dl, rows) {
    dl.replaceChildren();
    rows.forEach(([k, v, warn]) => { const dt = el("dt", k), dd = el("dd", v); if (warn) dd.style.color = "var(--warn)"; dl.append(dt, dd); });
  }

  // ---------- presets ----------
  function buildPresets() {
    const box = $("presets");
    PRESETS.forEach((p) => {
      const b = el("button", p.name, "preset");
      b.type = "button"; b.dataset.id = p.id; b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => { go(new URLSearchParams({ target: p.id })); });
      box.append(b);
    });
  }
  function markPreset(id) {
    document.querySelectorAll(".preset").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
  }

  // ---------- data ----------
  async function fetchData(p) {
    const target = p.get("target");
    if (target && !p.get("live")) {
      try {
        const r = await fetch("precomputed/" + encodeURIComponent(target) + ".json");
        if (r.ok) return await r.json();
      } catch (e) { /* fall through to the live API */ }
    }
    const q = new URLSearchParams();
    ["target", "ra", "dec", "fov", "band", "detector", "pmra", "pmdec", "pos_epoch", "per_epoch", "max_epochs", "name"].forEach((k) => { if (p.get(k)) q.set(k, p.get(k)); });
    const r = await fetch("api/frames?" + q.toString());
    let j = null;
    try { j = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok) throw new Error((j && j.error) || t("err_server", r.status));
    return j;
  }

  function readForm() {
    const p = new URLSearchParams();
    FIELDS.forEach((k) => { const v = $(k).value.trim(); if (v && !(k === "pos_epoch" && v === "2000")) p.set(k, v); });
    return p;
  }
  function fillForm(d, p) {
    const q = d.query;
    $("ra").value = fmt(q.ra, 5); $("dec").value = fmt(q.dec, 5);
    $("fov").value = String(q.fov_deg); $("band").value = q.band;
    $("pmra").value = q.pmra == null ? "" : q.pmra; $("pmdec").value = q.pmdec == null ? "" : q.pmdec;
    $("pos_epoch").value = q.pos_epoch || 2000; $("detector").value = (p && !p.get("target") && p.get("detector")) || "";
  }

  // ---------- main flow ----------
  async function go(p) {
    if (busy) return;
    busy = true; stop();
    if (document.body.classList.contains("embed")) p.set("embed", "1");
    const target = p.get("target") || "";
    markPreset(target);
    if (I18N.lang === "vi") p.set("lang", "vi"); else p.delete("lang");
    history.replaceState(null, "", "?" + p.toString());
    $("shareurl").value = location.href;
    $("go").disabled = true;
    const msgs = t("msgs");
    let m = 0; $("loadmsg").textContent = msgs[0]; $("loading").classList.add("show");
    const mt = setInterval(() => { m = Math.min(m + 1, msgs.length - 1); $("loadmsg").textContent = msgs[m]; }, 12000);
    $("msgs").replaceChildren();
    try {
      data = await fetchData(p);
      fillForm(data, p);
      idx = 0; view = "flip"; setView("flip", true);
      render(); renderMeasure();
      loadSpectrum(data.target ? data.target.id : null);
      playing = data.epochs.length > 1; syncPlay();
      if (playing) start();
    } catch (err) {
      data = null; spec = null; clearView(); $("speccard").hidden = true;
      const b = el("div", err.message || String(err), "warnbox"); $("msgs").append(b);
    } finally {
      clearInterval(mt); $("loading").classList.remove("show"); $("go").disabled = false; busy = false;
    }
  }

  function clearView() {
    ["frame", "datebadge", "compass", "controls", "chips", "legendnote", "csv", "sourcescard", "meascard", "ovctl", "ovnote", "tip"].forEach((i) => { $(i).hidden = true; });
    hits = []; { const cv = $("overlay"); cv.getContext("2d").clearRect(0, 0, cv.width, cv.height); }
    $("marker").style.display = "none"; $("placeholder").hidden = false; $("motioncard").hidden = true;
    kv($("info"), [[t("status"), t("nothing")]]);
  }

  // ---------- rendering ----------
  function render() {
    const N = data.epochs.length, e = data.epochs[idx], n = data.grid.size_px;
    const showDiff = view === "diff";
    const img = $("frame");
    img.src = showDiff ? e.diff_png : e.png; img.hidden = false; $("placeholder").hidden = true;
    img.alt = t(showDiff ? "alt_diff" : "alt_img", e.date);
    $("datebadge").textContent = e.date + (showDiff && idx === 0 ? "  " + t("reference") : ""); $("datebadge").hidden = false;
    $("compass").hidden = false; $("controls").hidden = false; $("csv").hidden = false;

    const mk = $("marker");
    if (e.marker) {
      const x = (e.marker.col + 0.5) / n * 100, y = (e.marker.row + 0.5) / n * 100;
      const inside = x > 0 && x < 100 && y > 0 && y < 100;
      mk.style.display = inside ? "block" : "none"; mk.style.left = x + "%"; mk.style.top = y + "%";
      $("legendnote").hidden = false;
    } else { mk.style.display = "none"; $("legendnote").hidden = true; }

    const chips = $("chips");
    if (chips.dataset.built !== String(N) + data.query.ra + data.query.dec) {
      chips.replaceChildren();
      data.epochs.forEach((ep, i) => {
        const b = el("button", ep.label, "chip"); b.type = "button";
        b.title = t("chip_title", ep.date, ep.n_images);
        b.addEventListener("click", () => { stop(); playing = false; syncPlay(); idx = i; render(); });
        chips.append(b);
      });
      chips.dataset.built = String(N) + data.query.ra + data.query.dec;
    }
    chips.hidden = false;
    [...chips.children].forEach((b, i) => b.setAttribute("aria-pressed", String(i === idx)));

    const waves = e.images.map((x) => x.wave_um).filter(Boolean);
    const wl = waves.length ? Math.min(...waves.map((w) => w[0])).toFixed(2) + "–" + Math.max(...waves.map((w) => w[1])).toFixed(2) + " µm" : t("na");
    const cols = [...new Set(e.images.map((x) => x.collection))].join(", ");
    const rows = [
      [t("k_epoch"), t("of", idx + 1, N)],
      [t("k_date"), e.date],
      [t("k_stack"), t("stack_v", e.n_images)],
      [t("k_det"), t("det_v", e.detector, e.detector <= 3 ? "SWIR" : "MWIR", wl)],
      [t("k_wave"), e.wave_target_um ? e.wave_target_um[0].toFixed(2) + "–" + e.wave_target_um[1].toFixed(2) + " µm" : t("na")],
      [t("k_coll"), cols],
    ];
    if (e.marker) rows.push([t("k_sat"), String(e.sat_pixels_near_target), e.sat_pixels_near_target > 0]);
    if (showDiff && idx > 0) rows.push([t("k_scale"), "×" + e.flux_scale_vs_first]);
    if (N > 1) {
      const days = Math.round(data.epochs[N - 1].mjd - data.epochs[0].mjd);
      let s = t("base_v", days);
      const a = data.epochs[0].marker, b = data.epochs[N - 1].marker;
      if (a && b) {
        const px = Math.hypot(b.col - a.col, b.row - a.row), as = px * data.grid.arcsec_per_px;
        s += t("base_pred", as.toFixed(1), (as / data.grid.native_pixel_arcsec).toFixed(1));
      }
      rows.push([t("k_base"), s]);
    }
    const cat = data.catalog;
    if (cat) {
      rows.push([t("k_gaia"), cat.gaia.ok ? t("gaia_v", e.gaia_px.length, cat.gaia.g_limit, Math.round(cat.gaia.epoch)) : t("gaia_down"), !cat.gaia.ok]);
      const ts = data.target && data.target.simbad;
      const parts = [];
      if (ts) parts.push(t("simbad_target", ts.id, ts.otype ? I18N.lookup("otypes", ts.otype) : ""));
      if (cat.simbad.ok) parts.push(t("simbad_n", cat.simbad.objects.length));
      if (parts.length) rows.push([t("k_simbad"), parts.join("; ")]);
      else rows.push([t("k_simbad"), t("simbad_down"), true]);
      if (cat.gaia.ok && e.marker) {
        const gm = e.gaia_match;
        if (gm) { const s = cat.gaia.stars[gm.i]; rows.push([t("k_match"), t("match_v", s.id, s.g, gm.sep_arcsec)]); }
        else rows.push([t("k_match"), t("match_none")]);
      }
      const wi = cat.wise;
      if (wi) {
        rows.push([t("k_wise"), wi.ok ? t("wise_v", wi.stars.length, wi.w2_limit) : t("wise_down"), !wi.ok]);
        if (wi.ok && data.query.pmra != null) {
          const tw = wi.target;
          if (tw) { const s = wi.stars[tw.i]; rows.push([t("k_wise_match"), t("wise_match", s.id, s.w2, tw.sep_arcsec, tw.moved_arcsec, tw.to_date)]); }
          else rows.push([t("k_wise_match"), t("wise_none")]);
        }
      }
    }
    kv($("info"), rows);
    $("ovctl").hidden = false; $("ovnote").hidden = false;
    $("ov_track").parentElement.hidden = !data.epochs.some((x) => x.measure && x.measure.centroid);
    $("ov_gaia").parentElement.hidden = !(cat && cat.gaia.stars.length);
    $("ov_simbad").parentElement.hidden = !(cat && cat.simbad.objects.length);
    $("ov_wise").parentElement.hidden = !(cat && cat.wise && cat.wise.stars.length);
    drawOverlay();
    if (e.sat_pixels_near_target > 0) {
      const w = el("div", t("sat_warn"), "warnbox");
      $("msgs").replaceChildren(w);
    } else { $("msgs").replaceChildren(); }
    (data.warnings || []).slice(0, 3).forEach((t) => $("msgs").append(el("div", t, "warnbox")));

    // sources table
    const body = $("srcbody"); body.replaceChildren();
    let count = 0;
    data.epochs.forEach((ep) => ep.images.forEach((im) => {
      count++;
      const tr = el("tr");
      [ep.label, im.obs_id, im.collection, mjdDate(im.mjd), im.wave_target_um ? t("um_at_target", im.wave_target_um) : (im.wave_um ? im.wave_um[0] + "–" + im.wave_um[1] + " µm" : t("na"))].forEach((t) => tr.append(el("td", t)));
      const td = el("td"), a = el("a", "FITS"); a.href = im.irsa_url; a.target = "_blank"; a.rel = "noopener"; td.append(a); tr.append(td);
      body.append(tr);
    }));
    $("srccount").textContent = t("src_count", count);
    const srcName = /IRSA/.test(data.source || "") && I18N.lang === "vi" ? t("src_name") : data.source;
    $("srctext").textContent = t("src_text", srcName, data.precomputed_at);
    $("sourcescard").hidden = false;
    $("foot-pre").textContent = data.target ? data.target.name + ": " + (I18N.lang === "vi" ? t("why_" + data.target.id) || data.target.why : data.target.why) : "";
    $("shareurl").value = location.href;
  }

  // ---------- catalogue overlay (Gaia DR3 rings, SIMBAD squares) ----------
  let hits = [];
  function drawOverlay() {
    const cv = $("overlay"), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
    hits = []; $("tip").hidden = true;
    if (!data) return;
    const e = data.epochs[idx], n = data.grid.size_px, k = W / 620, cat = data.catalog;
    g.lineWidth = 1.5;
    if (cat && $("ov_gaia").checked) {
      g.strokeStyle = "#6FD3FF";
      e.gaia_px.forEach(([c, r, i]) => {
        const s = cat.gaia.stars[i], x = (c + 0.5) / n * W, y = (r + 0.5) / n * H, rad = Math.max(3, Math.min(10, 10 - (s.g - 8) * 0.6)) * k;
        g.beginPath(); g.arc(x, y, rad, 0, 7); g.stroke(); hits.push({ x, y, kind: "gaia", s });
      });
    }
    if (cat && $("ov_wise").checked && cat.wise && cat.wise.stars.length) {
      g.strokeStyle = "#FF6BD6";                       // AllWISE: fixed at the 2010 position (same on every frame)
      cat.wise.stars.forEach((s) => {
        const x = (s.col + 0.5) / n * W, y = (s.row + 0.5) / n * H, h = Math.max(3, Math.min(9, 9 - (s.w2 - 6) * 0.5)) * k;
        g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + h, y); g.lineTo(x, y + h); g.lineTo(x - h, y); g.closePath(); g.stroke();
        hits.push({ x, y, kind: "wise", s });
      });
    }
    if (cat && $("ov_simbad").checked) {
      g.strokeStyle = "#FF8A5B";
      (e.simbad_px || []).forEach(([c, r, i]) => {
        const s = cat.simbad.objects[i], x = (c + 0.5) / n * W, y = (r + 0.5) / n * H, h = 7 * k;
        g.strokeRect(x - h, y - h, 2 * h, 2 * h); hits.push({ x, y, kind: "simbad", s });
      });
    }
    if ($("ov_track").checked) {                       // where we MEASURED the target on each date up to this frame
      const pts = [];
      data.epochs.forEach((ep, i) => { const c = ep.measure && ep.measure.centroid; if (i <= idx && c) pts.push([(c.col + 0.5) / n * W, (c.row + 0.5) / n * H]); });
      const both = () => { g.strokeStyle = "#000"; g.lineWidth = 4; g.stroke(); g.strokeStyle = "#FFF"; g.lineWidth = 1.6; g.stroke(); };   // black under white: visible on the white saturated core too
      if (pts.length > 1) { g.setLineDash([4, 3]); g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); both(); g.setLineDash([]); }
      pts.forEach(([x, y]) => { const h = 4.5 * k; g.beginPath(); g.moveTo(x - h, y); g.lineTo(x + h, y); g.moveTo(x, y - h); g.lineTo(x, y + h); both(); });
    }
  }
  function showTip(ev) {
    if (!hits.length) return;
    const rc = $("overlay").getBoundingClientRect(), x = ev.clientX - rc.left, y = ev.clientY - rc.top;
    let best = null, bd = 16;
    hits.forEach((h) => { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } });
    const tip = $("tip");
    if (!best) { tip.hidden = true; return; }
    if (best.kind === "gaia") {
      const pm = best.s.pmra != null && best.s.pmdec != null ? Math.hypot(best.s.pmra, best.s.pmdec) / 1000 : null;
      tip.textContent = t("tip_gaia", best.s.id, best.s.g, pm !== null && pm >= 0.01 ? pm.toFixed(2) : "");
    } else if (best.kind === "wise") tip.textContent = t("tip_wise", best.s.id, best.s.w1, best.s.w2);
    else tip.textContent = t("tip_simbad", best.s.id, best.s.otype ? I18N.lookup("otypes", best.s.otype) : "");
    tip.hidden = false;
  }

  // ---------- measurements + charts ----------
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function chart(cv, pts, o) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
    const L = 52, R = 26, T = 12, B = 34, w = W - L - R, h = H - T - B;
    const xs = pts.map((p) => p.x), t0 = Math.min(...xs), t1 = Math.max(...xs), span = Math.max(t1 - t0, 1);
    let lo = o.min !== undefined ? o.min : Infinity, hi = -Infinity;
    pts.forEach((p) => { lo = Math.min(lo, p.y - (p.err || 0)); hi = Math.max(hi, p.y + (p.err || 0)); });
    if (o.min !== undefined) lo = o.min;
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    const pad = (hi - lo) * 0.15 || 1; if (o.min === undefined) lo -= pad; hi += pad;
    const X = (x) => L + (pts.length > 1 ? (x - t0) / span : 0.5) * w, Y = (y) => T + h - (y - lo) / (hi - lo) * h;
    const muted = css("--muted"), accent = css("--accent"), warn = css("--warn"), line = "rgba(184,199,230,.25)";
    g.font = "12px system-ui, sans-serif"; g.fillStyle = muted; g.strokeStyle = line; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4, y = Y(v); g.beginPath(); g.moveTo(L, y); g.lineTo(L + w, y); g.stroke(); g.textAlign = "right"; g.fillText(v.toFixed(Math.abs(hi - lo) < 5 ? 2 : 1), L - 6, y + 4); }
    g.textAlign = "center";
    let lastX = -1e9;
    pts.forEach((p) => { if (X(p.x) - lastX >= 56) { g.fillText(p.label, X(p.x), H - 12); lastX = X(p.x); } });   // skip labels that would overlap
    g.save(); g.translate(12, T + h / 2); g.rotate(-Math.PI / 2); g.fillText(o.ylabel, 0, 0); g.restore();
    if (o.ref !== undefined) { g.setLineDash([5, 4]); g.strokeStyle = muted; g.beginPath(); g.moveTo(L, Y(o.ref)); g.lineTo(L + w, Y(o.ref)); g.stroke(); g.setLineDash([]); }
    if (o.band) { g.fillStyle = "rgba(46,140,240,.14)"; g.fillRect(L, Y(o.band), w, Y(0) - Y(o.band)); }
    if (pts.length > 1 && o.connect) { g.strokeStyle = "rgba(230,255,16,.45)"; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y)))); g.stroke(); }
    pts.forEach((p) => {
      const col = p.hollow ? warn : accent; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2;
      if (p.err) { g.beginPath(); g.moveTo(X(p.x), Y(p.y - p.err)); g.lineTo(X(p.x), Y(p.y + p.err)); g.stroke(); }
      g.beginPath(); g.arc(X(p.x), Y(p.y), 5, 0, 7); p.hollow ? g.stroke() : g.fill();
    });
    if (!pts.length) { g.fillStyle = muted; g.textAlign = "center"; g.fillText(o.empty, L + w / 2, T + h / 2); }
  }
  function renderMeasure() {
    const E = data.epochs, body = $("measbody"); body.replaceChildren();
    const posPts = [], fluxPts = [];
    // One consistent brightness measure for the whole series: if any epoch is saturated, use the PSF-wing proxy for all.
    const useProxy = E.some((e) => e.measure && e.measure.saturated);
    E.forEach((e) => {
      const m = e.measure || {}, tr = el("tr");
      const flux = useProxy ? (m.proxy_flux_mJy === undefined ? t("na") : t("wing", m.proxy_flux_mJy, m.proxy_err_mJy, m.core_px))
        : (m.flux_mJy === undefined ? t("na") : m.flux_mJy + " ± " + m.flux_err_mJy);
      const off = m.offset_arcsec === undefined ? (m.saturated ? t("nopos_sat") : t("nopos_snr")) : m.offset_east_arcsec + " / " + m.offset_north_arcsec;
      const note = m.reason ? I18N.lookup("reasons", m.reason) : (m.saturated ? t("note_sat", m.position_method ? I18N.lookup("methods", m.position_method) : "") : (m.detected ? t("detected") : t("notdet")));
      const lam = e.wave_target_um ? ((e.wave_target_um[0] + e.wave_target_um[1]) / 2).toFixed(2) + " µm" : t("na");
      [e.label + " (" + lam + ")", m.snr === undefined ? t("na") : m.snr, flux, off, note].forEach((t) => tr.append(el("td", String(t))));
      body.append(tr);
      if (m.offset_arcsec !== undefined) posPts.push({ x: e.mjd, y: m.offset_arcsec, label: e.label });
      if (useProxy) { if (m.proxy_flux_mJy !== undefined) fluxPts.push({ x: e.mjd, y: m.proxy_flux_mJy, err: m.proxy_err_mJy, label: e.label, hollow: true }); }
      else if (m.flux_mJy !== undefined) fluxPts.push({ x: e.mjd, y: m.flux_mJy, err: m.flux_err_mJy, label: e.label, hollow: false });
    });
    const kind = data.target ? data.target.kind : "";
    const det = E.filter((e) => e.measure && e.measure.detected).length;
    $("meastext").textContent = t(data.query.pmra != null ? "meas_pm" : "meas_center") + t("meas_det", det, E.length) +
      (kind === "variable" ? t("meas_var") : "");
    const lm = E.filter((e) => e.wave_target_um).map((e) => (e.wave_target_um[0] + e.wave_target_um[1]) / 2);
    if (lm.length > 1 && Math.max(...lm) / Math.min(...lm) > 1.1) {
      $("meastext").textContent += t("meas_warn", Math.min(...lm).toFixed(2), Math.max(...lm).toFixed(2));
    }
    $("meascard").hidden = false;
    renderMotion();
    requestAnimationFrame(() => {
      chart($("chA"), posPts, { min: 0, ylabel: t("ylab_off"), band: 6.15, ref: 0, connect: true, empty: t("empty_off") });
      chart($("chB"), fluxPts, { min: 0, ylabel: t(useProxy ? "ylab_wing" : "ylab_flux"), connect: true, empty: t("empty_flux") });
    });
  }
  // ---------- is it moving? proper motion measured from the SPHEREx images alone ----------
  // All frames share one sky-fixed grid, so the measured centre (col,row) of the target on each date is a sky position.
  // A straight-line fit of position against time gives the proper motion; the catalogue value is NOT used in the fit.
  const POS_FLOOR = 0.3;                                   // arcsec: no centroid is trusted better than this
  function motionFit() {
    const sc = data.grid.arcsec_per_px, yr = (m) => 2000 + (m - 51544.5) / 365.25, q = data.query;
    const P = data.epochs.filter((e) => e.measure && e.measure.centroid)
      .map((e) => ({ t: yr(e.mjd), e: -e.measure.centroid.col * sc, n: -e.measure.centroid.row * sc }));
    const mo = { count: P.length, ok: false, cat: null, key: "need" };
    if (q.pmra != null && q.pmdec != null) { const ce = q.pmra / 1000, cn = q.pmdec / 1000; mo.cat = { e: ce, n: cn, mu: Math.hypot(ce, cn) }; }
    if (P.length < 3) return mo;
    const tm = P.reduce((a, p) => a + p.t, 0) / P.length, Sxx = P.reduce((a, p) => a + (p.t - tm) ** 2, 0);
    if (!(Sxx > 1e-4)) return mo;
    mo.days = Math.round((Math.max(...P.map((p) => p.t)) - Math.min(...P.map((p) => p.t))) * 365.25);
    const fit = (k) => {
      const ym = P.reduce((a, p) => a + p[k], 0) / P.length, b = P.reduce((a, p) => a + (p.t - tm) * (p[k] - ym), 0) / Sxx;
      const ssr = P.reduce((a, p) => a + (p[k] - ym - b * (p.t - tm)) ** 2, 0);
      return [b, Math.max(Math.sqrt(ssr / (P.length - 2)), POS_FLOOR) / Math.sqrt(Sxx)];
    };
    [mo.vE, mo.sE] = fit("e"); [mo.vN, mo.sN] = fit("n");
    mo.mu = Math.hypot(mo.vE, mo.vN); mo.S = Math.hypot(mo.vE / mo.sE, mo.vN / mo.sN); mo.lim = 3 * Math.hypot(mo.sE, mo.sN);
    mo.err = Math.hypot(mo.vE * mo.sE, mo.vN * mo.sN) / (mo.mu || 1);       // error on the total, along the motion
    if (mo.cat) mo.diff = Math.hypot((mo.vE - mo.cat.e) / mo.sE, (mo.vN - mo.cat.n) / mo.sN);
    mo.ok = true; mo.key = mo.S >= 5 ? "moving" : (mo.S >= 3 ? "prob" : "static");
    return mo;
  }
  function renderMotion() {
    const mo = motionFit(), d = (v, ref) => v.toFixed(Math.abs(ref === undefined ? v : ref) >= 1 ? 1 : 2);   // a value and its error share decimals
    $("motioncard").hidden = false;
    const v = $("mvverdict"); v.textContent = t("mv_v_" + mo.key); v.className = "verdict v-" + mo.key;
    const sum = { moving: () => t("mv_sum_moving", d(mo.mu, mo.err), d(mo.err)), prob: () => t("mv_sum_prob", d(mo.mu, mo.err), d(mo.err), mo.S.toFixed(1)),
      static: () => t("mv_sum_static", mo.lim.toFixed(1)), need: () => t("mv_sum_need", mo.count) }[mo.key];
    $("mvsum").textContent = sum();
    const rows = [];
    if (mo.ok) {
      rows.push([t("mv_k_meas"), t("mv_meas", d(mo.vE, mo.sE), d(mo.sE), d(mo.vN, mo.sN), d(mo.sN), d(mo.mu, mo.err))]);
      rows.push([t("mv_k_data"), t("mv_data", mo.count, mo.days)]);
    }
    rows.push([t("mv_k_cat"), mo.cat ? t("mv_cat", d(mo.cat.e), d(mo.cat.n), d(mo.cat.mu)) : t("mv_nocat")]);
    if (mo.ok && mo.cat) rows.push([t("mv_k_agree"), mo.diff < 3 ? t("mv_agree_ok", mo.diff.toFixed(1)) : t("mv_agree_bad", mo.diff.toFixed(1)), mo.diff >= 3]);
    kv($("mvkv"), rows);
    $("mvnote").textContent = t("mv_note") + (mo.cat ? "" : t("mv_note_blind"));
    requestAnimationFrame(() => drawMotion($("chM"), mo));
  }
  function drawMotion(cv, mo) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
    const muted = css("--muted"), accent = css("--accent"), blue = css("--blue");
    let R = 1;
    if (mo.cat) R = Math.max(R, mo.cat.mu);
    if (mo.ok) R = Math.max(R, Math.hypot(Math.abs(mo.vE) + mo.sE, Math.abs(mo.vN) + mo.sN));
    R *= 1.2;
    const step = [0.5, 1, 2, 5, 10, 20, 50].find((s) => R / s <= 4) || 100, cx = W / 2, cy = H / 2, sc = (Math.min(W, H) / 2 - 22) / R;
    const X = (e) => cx - e * sc, Y = (n) => cy - n * sc;                       // east to the left, as in the images
    g.font = "12px system-ui, sans-serif"; g.strokeStyle = "rgba(184,199,230,.25)"; g.fillStyle = muted; g.lineWidth = 1; g.textAlign = "left";
    for (let r = step; r <= R; r += step) { g.beginPath(); g.arc(cx, cy, r * sc, 0, 7); g.stroke(); g.fillText(r + "″/yr", cx + 4, cy - r * sc - 3); }
    g.beginPath(); g.moveTo(8, cy); g.lineTo(W - 8, cy); g.moveTo(cx, 8); g.lineTo(cx, H - 8); g.stroke();
    g.fillText("N", cx + 6, 16); g.fillText("E", 10, cy - 6); g.textAlign = "right"; g.fillText("W", W - 10, cy - 6);
    const arrow = (e, n, col, dash) => {
      const x = X(e), y = Y(n), a = Math.atan2(y - cy, x - cx), h = 9;
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.5; g.setLineDash(dash);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - h * Math.cos(a - 0.4), y - h * Math.sin(a - 0.4)); g.lineTo(x - h * Math.cos(a + 0.4), y - h * Math.sin(a + 0.4)); g.closePath(); g.fill();
    };
    if (mo.cat) arrow(mo.cat.e, mo.cat.n, blue, [6, 4]);
    if (mo.ok) {
      arrow(mo.vE, mo.vN, accent, []);
      g.strokeStyle = accent; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(X(mo.vE - mo.sE), Y(mo.vN)); g.lineTo(X(mo.vE + mo.sE), Y(mo.vN)); g.moveTo(X(mo.vE), Y(mo.vN - mo.sN)); g.lineTo(X(mo.vE), Y(mo.vN + mo.sN)); g.stroke();
    } else { g.fillStyle = muted; g.textAlign = "center"; g.fillText("—", cx, cy + 20); }
    g.textAlign = "left"; g.lineWidth = 2.5;
    let ly = H - 12;
    if (mo.cat) { g.strokeStyle = blue; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(10, ly - 4); g.lineTo(34, ly - 4); g.stroke(); g.setLineDash([]); g.fillStyle = muted; g.fillText(t("mv_leg_cat"), 40, ly); ly -= 18; }
    if (mo.ok) { g.strokeStyle = accent; g.beginPath(); g.moveTo(10, ly - 4); g.lineTo(34, ly - 4); g.stroke(); g.fillStyle = muted; g.fillText(t("mv_leg_meas"), 40, ly); }
  }
  function csv2() {
    const rows = [["epoch", "date", "mjd", "snr", "flux_mJy", "flux_err_mJy", "flux_reliable", "offset_east_arcsec", "offset_north_arcsec", "offset_arcsec", "saturated_px_near_target"]];
    data.epochs.forEach((e) => { const m = e.measure || {}; rows.push([e.label, e.date, e.mjd, m.snr ?? "", m.flux_mJy ?? "", m.flux_err_mJy ?? "", m.flux_reliable ?? "", m.offset_east_arcsec ?? "", m.offset_north_arcsec ?? "", m.offset_arcsec ?? "", e.sat_pixels_near_target]); });
    const text = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = "skyshift_measurements.csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  // ---------- spectrum (pre-computed for the challenge targets) ----------
  let spec = null;
  async function loadSpectrum(id) {
    spec = null; $("speccard").hidden = true;
    if (!id || !SPECTRUM_TARGETS.includes(id)) return;       // spectra are pre-computed only for targets that are not saturated
    try {
      const r = await fetch("precomputed/" + encodeURIComponent(id) + "_spectrum.json");
      if (!r.ok) return;
      spec = await r.json();
    } catch (e) { return; }
    const good = spec.points.filter((p) => p.flux_mJy !== null && !p.saturated);
    if (good.length < 30) { spec = null; return; }          // mostly saturated (bright star): a handful of points is not a spectrum
    $("speccard").hidden = false;
    setSpecText();
    requestAnimationFrame(drawSpectrum);
  }
  function setSpecText() {
    if (!spec) return;
    const good = spec.points.filter((p) => p.flux_mJy !== null && !p.saturated), lams = good.map((p) => p.lam_um);
    $("spectext").textContent = t("spec_text", good.length, spec.points.length, Math.min(...lams).toFixed(2), Math.max(...lams).toFixed(2),
      mjdDate(Math.min(...spec.points.map((p) => p.mjd))), mjdDate(Math.max(...spec.points.map((p) => p.mjd))));
  }
  function drawSpectrum() {
    if (!spec) return;
    const cv = $("chS"), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
    const L = 56, R = 16, T = 12, B = 40, w = W - L - R, h = H - T - B;
    const P = spec.points.filter((p) => p.flux_mJy !== null);
    const xmin = 0.7, xmax = 5.1;
    const ys = P.filter((p) => !p.saturated).map((p) => p.flux_mJy);
    const ymax = Math.max(...ys) * 1.08, ymin = Math.min(0, ...ys);
    const X = (x) => L + (x - xmin) / (xmax - xmin) * w, Y = (y) => T + h - (y - ymin) / (ymax - ymin) * h;
    const muted = css("--muted"), accent = css("--accent"), warn = css("--warn"), line = "rgba(184,199,230,.22)";
    g.font = "12px system-ui, sans-serif"; g.lineWidth = 1; g.strokeStyle = line; g.fillStyle = muted;
    for (let i = 0; i <= 4; i++) { const v = ymin + (ymax - ymin) * i / 4, y = Y(v); g.beginPath(); g.moveTo(L, y); g.lineTo(L + w, y); g.stroke(); g.textAlign = "right"; g.fillText(v.toFixed(v < 10 ? 1 : 0), L - 6, y + 4); }
    g.textAlign = "center";
    [1, 2, 3, 4, 5].forEach((v) => { g.fillText(v + " µm", X(v), H - 18); g.beginPath(); g.moveTo(X(v), T); g.lineTo(X(v), T + h); g.stroke(); });
    g.save(); g.translate(13, T + h / 2); g.rotate(-Math.PI / 2); g.fillText(t("spec_y"), 0, 0); g.restore();
    g.strokeStyle = "rgba(184,199,230,.5)"; g.setLineDash([2, 4]);
    [1.1, 1.62, 2.42, 3.82, 4.42].forEach((v) => { g.beginPath(); g.moveTo(X(v), T); g.lineTo(X(v), T + h); g.stroke(); });
    g.setLineDash([]);
    P.forEach((p) => {
      if (p.flux_mJy > ymax * 1.5) return;
      const col = p.saturated ? warn : accent; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.5;
      if (p.err_mJy) { g.beginPath(); g.moveTo(X(p.lam_um), Y(p.flux_mJy - p.err_mJy)); g.lineTo(X(p.lam_um), Y(p.flux_mJy + p.err_mJy)); g.stroke(); }
      g.beginPath(); g.arc(X(p.lam_um), Y(p.flux_mJy), 3, 0, 7); p.saturated ? g.stroke() : g.fill();
    });
  }
  function csv3() {
    const rows = [["lambda_um", "bandwidth_um", "flux_mJy", "err_mJy", "snr", "saturated", "detector", "mjd", "obs_id", "collection"]];
    spec.points.forEach((p) => rows.push([p.lam_um, p.bw_um, p.flux_mJy ?? "", p.err_mJy ?? "", p.snr ?? "", p.saturated, p.detector, p.mjd, p.obs_id, p.collection]));
    const text = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = "skyshift_spectrum_" + spec.target.id + ".csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  // ---------- playback ----------
  const delay = () => 2600 / +$("speed").value;
  function start() { stop(); if (data && data.epochs.length > 1) timer = setInterval(() => { idx = (idx + 1) % data.epochs.length; render(); }, delay()); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function syncPlay() { $("play").innerHTML = t(playing ? "pause" : "play"); }
  function setView(v, silent) {
    view = v;
    $("vflip").setAttribute("aria-pressed", String(v === "flip")); $("vdiff").setAttribute("aria-pressed", String(v === "diff"));
    if (!silent && data) render();
  }

  // ---------- CSV ----------
  function csv() {
    const rows = [["epoch", "epoch_date", "obs_id", "collection", "obs_date", "mjd", "wave_min_um", "wave_max_um", "detector", "predicted_col", "predicted_row", "saturated_px_near_target", "irsa_fits_url"]];
    data.epochs.forEach((ep) => ep.images.forEach((im) => rows.push([
      ep.label, ep.date, im.obs_id, im.collection, mjdDate(im.mjd), im.mjd, im.wave_um ? im.wave_um[0] : "", im.wave_um ? im.wave_um[1] : "",
      ep.detector, ep.marker ? ep.marker.col.toFixed(2) : "", ep.marker ? ep.marker.row.toFixed(2) : "", ep.sat_pixels_near_target, im.irsa_url])));
    const text = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = "skyshift_epochs.csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  // ---------- wiring ----------
  $("form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const p = readForm();
    if (!p.get("ra") || !p.get("dec") || isNaN(+p.get("ra")) || isNaN(+p.get("dec"))) {
      $("msgs").replaceChildren(el("div", t("form_err"), "warnbox")); return;
    }
    go(p);
  });
  $("play").addEventListener("click", () => { playing = !playing; syncPlay(); playing ? start() : stop(); });
  $("speed").addEventListener("input", () => { if (playing) start(); });
  $("vflip").addEventListener("click", () => setView("flip"));
  $("vdiff").addEventListener("click", () => setView("diff"));
  $("csv").addEventListener("click", () => data && csv());
  $("csv2").addEventListener("click", () => data && csv2());
  $("csv3").addEventListener("click", () => spec && csv3());
  window.addEventListener("resize", () => { if (data) renderMeasure(); drawSpectrum(); drawOverlay(); });
  ["ov_track", "ov_gaia", "ov_wise", "ov_simbad"].forEach((id) => $(id).addEventListener("change", drawOverlay));
  $("stage").addEventListener("pointermove", showTip);
  $("stage").addEventListener("pointerdown", showTip);
  $("stage").addEventListener("pointerleave", () => { $("tip").hidden = true; });
  $("copy").addEventListener("click", async () => {
    const t = $("shareurl").value; $("shareurl").select();
    try { await navigator.clipboard.writeText(t); $("copy").textContent = I18N.t("copied"); setTimeout(() => { $("copy").textContent = I18N.t("copy"); }, 1500); } catch (e) { document.execCommand && document.execCommand("copy"); }
  });
  // ---------- language switch ----------
  function refreshLanguage() {
    syncPlay();
    const p = new URLSearchParams(location.search);
    if (I18N.lang === "vi") p.set("lang", "vi"); else p.delete("lang");
    history.replaceState(null, "", p.toString() ? "?" + p.toString() : location.pathname);
    $("shareurl").value = location.href;
    if (data) { $("chips").dataset.built = ""; $("msgs").replaceChildren(); render(); renderMeasure(); setSpecText(); drawSpectrum(); }
    else clearView();
  }
  document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => { I18N.setLang(b.dataset.lang); refreshLanguage(); }));
  document.addEventListener("keydown", (ev) => {
    if (!data || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (ev.key === " ") { ev.preventDefault(); $("play").click(); }
    if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") { stop(); playing = false; syncPlay(); idx = (idx + (ev.key === "ArrowRight" ? 1 : -1) + data.epochs.length) % data.epochs.length; render(); }
  });

  buildPresets(); clearView();
  const p0 = new URLSearchParams(location.search);
  if (p0.get("embed") === "1") document.body.classList.add("embed");
  if (p0.get("view") === "diff") view = "diff";
  if (!p0.get("target") && !p0.get("ra")) p0.set("target", "barnard");          // open on a working example
  go(p0).then(() => { if (new URLSearchParams(location.search).get("view") === "diff") setView("diff"); });
})();
