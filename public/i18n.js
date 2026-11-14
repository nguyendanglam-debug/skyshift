"use strict";
/* Language support: English is the default, Vietnamese is the optional second language.
   - Static page text: the English text stays in index.html; elements that have a Vietnamese version carry
     data-i18n="key" (innerHTML), data-i18n-ph (placeholder), data-i18n-aria (aria-label) or data-i18n-title.
   - Text built by app.js goes through I18N.t(key, ...args). */
(function () {
  // ---- strings built at run time (both languages) ----
  const EN = {
    title: "SkyShift - SPHEREx time-lapse",
    msgs: ["Searching NASA IRSA for SPHEREx images…", "Downloading image cutouts (live requests take 30–60 s)…", "Aligning and stacking the images…"],
    err_server: (s) => "The server could not build this time-lapse (HTTP " + s + ").",
    status: "Status", nothing: "Nothing to show.",
    alt_img: (d) => "SPHEREx image for " + d, alt_diff: (d) => "SPHEREx difference image for " + d,
    reference: "(reference)",
    k_epoch: "Epoch", of: (i, N) => i + " of " + N, k_date: "Date", k_stack: "Images stacked", stack_v: (n) => n + " (median)",
    k_det: "Detector", det_v: (d, b, wl) => "D" + d + " (" + b + "), whole image " + wl,
    k_wave: "Wavelength at target", k_coll: "Collection", k_sat: "Saturated pixels near target", k_scale: "Brightness scale vs first",
    k_base: "Baseline", base_v: (days) => "first to last: " + days + " days",
    base_pred: (as, px) => "; predicted motion " + as + "″ (" + px + " SPHEREx pixels)",
    na: "n/a",
    sat_warn: "Bright star: the centre is saturated (painted white). Its position is usable, its brightness is not.",
    chip_title: (d, n) => d + " (" + n + " images)",
    um_at_target: (w) => w + " µm at target",
    src_count: (n) => "(" + n + " images)",
    src_text: (src, pre) => src + (pre ? ". Pre-computed " + pre + "." : ". Computed live from IRSA."),
    wing: (v, e, core) => "wing proxy " + v + " ± " + e + (core ? " (core " + core + " px)" : ""),
    nopos_sat: "no position", nopos_snr: "no position (S/N < 5)",
    note_sat: (pm) => "saturated: brightness is a proxy from the PSF wings" + (pm ? "; position from " + pm : ""),
    detected: "detected", notdet: "not detected (S/N < 3)",
    meas_pm: "Position is tested against the catalogue proper motion. ", meas_center: "Measured at the centre of the field. ",
    meas_det: (d, N) => d + " of " + N + " epochs show a signal above 3 sigma at this position.",
    meas_var: " This is a variable star: look at how its brightness changes.",
    meas_warn: (a, b) => " Careful: the epochs see the target at different wavelengths (" + a + "–" + b + " µm), so a brightness difference can be the spectrum of the object and not a real change in time.",
    ylab_off: "offset (arcsec)", empty_off: "no epoch with S/N ≥ 5", ylab_wing: "wing proxy (mJy)", ylab_flux: "flux (mJy)", empty_flux: "no flux measured",
    spec_text: (n, N, lo, hi, d0, d1) => n + " of " + N + " images give a usable point, from " + lo + " to " + hi + " µm, observed between " + d0 + " and " + d1 +
      ". If the target does not vary this is its spectrum; for a variable star the points also change with time. Fluxes are aperture sums without aperture correction: trust the shape, not the absolute level.",
    spec_y: "flux (mJy)",
    play: "&#9654; Play", pause: "&#10074;&#10074; Pause",
    copy: "Copy link", copied: "Copied",
    form_err: "Please type RA and Dec as numbers in decimal degrees (for example 269.452 and 4.693).",
    // ---- catalogue overlay (Gaia DR3, SIMBAD) ----
    k_gaia: "Gaia DR3 in view",
    gaia_v: (n, g, ep) => n + " stars brighter than G = " + g + ", moved from " + ep + " to this date with their proper motions",
    gaia_down: "the Gaia archive did not answer, so no stars are drawn",
    k_simbad: "SIMBAD",
    simbad_target: (id, ty) => id + (ty ? " (" + ty + ")" : ""),
    simbad_n: (n) => n + " known objects in view",
    simbad_down: "the SIMBAD service did not answer, so no objects are drawn",
    k_match: "Gaia star at the predicted position",
    match_v: (id, g, sep) => "Gaia DR3 " + id + ", G = " + g + ", " + sep + "″ from the prediction",
    match_none: "none within 3″: the target may be too faint at optical wavelengths for Gaia (normal for brown dwarfs)",
    tip_gaia: (id, g, pm) => "Gaia DR3 " + id + " · G = " + g + (pm ? " · moves " + pm + "″/yr" : ""),
    tip_simbad: (id, ty) => "SIMBAD: " + id + (ty ? " · " + ty : ""),
    k_wise: "AllWISE (2010) in view",
    wise_v: (n, w2) => n + " infrared sources brighter than W2 = " + w2 + " (4.6 µm), drawn where WISE saw them in 2010",
    wise_down: "the IRSA WISE catalogue did not answer, so no sources are drawn",
    k_wise_match: "Where WISE saw the target in 2010",
    wise_match: (id, w2, sep, moved, date) => "AllWISE " + id + ", W2 = " + w2 + " (" + sep + "″ from the 2010 prediction)" +
      (moved !== null && moved !== undefined ? "; moved " + moved + "″ by " + date : ""),
    wise_none: "no WISE source within 3″ of the 2010 position",
    tip_wise: (id, w1, w2) => "AllWISE " + id + " · W1 = " + (w1 === null ? "–" : w1) + " · W2 = " + w2 + " · seen in 2010",
    mv_v_moving: "Moving", mv_v_prob: "Probably moving", mv_v_static: "No motion detected", mv_v_need: "Not enough positions",
    mv_sum_moving: (mu, err) => "Across the SPHEREx images alone, the target shifts " + mu + " ± " + err + " arcsec per year on the sky. It is a mover.",
    mv_sum_prob: (mu, err, S) => "The images show a shift of " + mu + " ± " + err + " arcsec per year, about " + S + " times its uncertainty. A real candidate, but more epochs are needed to be sure.",
    mv_sum_static: (lim) => "No significant motion. With this few positions the fit can only rule out motion faster than about " + lim + " arcsec per year (3σ).",
    mv_note_blind: " No catalogue motion was given, so the measurement window stays at the centre of the field and does not follow the target: a fast mover can drift out of it and be missed. A test with Barnard's Star coordinates but without its motion gave only a weak, inconclusive result (about 6 ± 6 arcsec per year, where the catalogue says 10.4).",
    mv_sum_need: (n) => "Only " + n + " usable position" + (n === 1 ? "" : "s") + ". A motion fit needs at least 3, and a position needs signal-to-noise 5 or more on that date (or a saturated core).",
    mv_k_meas: "Measured (SPHEREx only)", mv_meas: (e, se, n, sn, mu) => "east " + e + " ± " + se + ", north " + n + " ± " + sn + " → total " + mu + " arcsec/yr",
    mv_k_cat: "Catalogue (Gaia / literature)", mv_cat: (e, n, mu) => "east " + e + ", north " + n + " → total " + mu + " arcsec/yr", mv_nocat: "none given: this is a blind measurement",
    mv_k_agree: "Agreement", mv_agree_ok: (s) => "consistent (" + s + " σ apart)", mv_agree_bad: (s) => "differs by " + s + " σ: check the target or the catalogue values",
    mv_k_data: "Based on", mv_data: (n, d) => n + " measured positions over " + d + " days",
    mv_note: "Positions are measured on one sky-fixed grid for all dates and fitted with a straight line. The catalogue motion is not used in the fit (it only says where to look), so the comparison is a real check. The uncertainty comes from the scatter of only a few positions, so it is rough. SPHEREx pixels are 6.2″ and the public data span about a year: only motions of a few arcsec per year or more can be confirmed.",
    mv_leg_meas: "SPHEREx", mv_leg_cat: "catalogue",
    otypes: { "BY*": "BY Draconis variable", "BD*": "brown dwarf", "TT*": "T Tauri star", "Mi*": "Mira variable", "*": "star", "V*": "variable star",
      "PM*": "high proper-motion star", "IR": "infrared source", "G": "galaxy", "Y*O": "young stellar object", "Em*": "emission-line star", "**": "double star", "Y*?": "young star candidate" },
  };

  const VI = {
    // ---- run-time strings ----
    title: "SkyShift - time-lapse SPHEREx",
    msgs: ["Đang tìm ảnh SPHEREx trong kho NASA IRSA…", "Đang tải các mảnh ảnh (tính trực tiếp mất 30–60 giây)…", "Đang căn chỉnh và chồng các ảnh…"],
    err_server: (s) => "Máy chủ không dựng được time-lapse này (HTTP " + s + ").",
    status: "Trạng thái", nothing: "Chưa có gì để hiển thị.",
    alt_img: (d) => "Ảnh SPHEREx ngày " + d, alt_diff: (d) => "Ảnh trừ SPHEREx ngày " + d,
    reference: "(mốc chuẩn)",
    k_epoch: "Mốc", of: (i, N) => i + " / " + N, k_date: "Ngày", k_stack: "Số ảnh chồng", stack_v: (n) => n + " (trung vị)",
    k_det: "Đầu thu", det_v: (d, b, wl) => "D" + d + " (" + b + "), cả ảnh " + wl,
    k_wave: "Bước sóng tại mục tiêu", k_coll: "Bộ dữ liệu", k_sat: "Pixel bão hòa gần mục tiêu", k_scale: "Hệ số độ sáng so với mốc đầu",
    k_base: "Khoảng thời gian", base_v: (days) => "từ mốc đầu đến mốc cuối: " + days + " ngày",
    base_pred: (as, px) => "; chuyển động dự đoán " + as + "″ (" + px + " pixel SPHEREx)",
    na: "không có",
    sat_warn: "Sao sáng: tâm bị bão hòa (tô trắng). Vị trí dùng được, độ sáng thì không.",
    chip_title: (d, n) => d + " (" + n + " ảnh)",
    um_at_target: (w) => w + " µm tại mục tiêu",
    src_count: (n) => "(" + n + " ảnh)",
    src_name: "NASA/IPAC IRSA - SPHEREx Data Release 1 (spherex_dr1) + Quick Release 3 (spherex_qr3)",
    src_text: (src, pre) => src + (pre ? ". Tính sẵn ngày " + pre + "." : ". Tính trực tiếp từ IRSA."),
    wing: (v, e, core) => "chỉ số cánh PSF " + v + " ± " + e + (core ? " (lõi " + core + " px)" : ""),
    nopos_sat: "không có vị trí", nopos_snr: "không có vị trí (S/N < 5)",
    note_sat: (pm) => "bão hòa: độ sáng là chỉ số thay thế lấy từ cánh PSF" + (pm ? "; vị trí lấy từ " + pm : ""),
    detected: "phát hiện được", notdet: "không phát hiện (S/N < 3)",
    reasons: { "too little valid data around the target": "quá ít dữ liệu hợp lệ quanh mục tiêu", "target near the edge of the data": "mục tiêu nằm gần mép dữ liệu" },
    methods: { "centre of the saturated core": "tâm của lõi bão hòa", "flux-weighted centroid": "tâm trọng số theo thông lượng" },
    meas_pm: "Vị trí được đối chiếu với chuyển động riêng trong danh mục. ", meas_center: "Đo tại tâm khung ảnh. ",
    meas_det: (d, N) => d + " trên " + N + " mốc cho tín hiệu trên 3 sigma tại vị trí này.",
    meas_var: " Đây là sao biến quang: hãy xem độ sáng của nó thay đổi thế nào.",
    meas_warn: (a, b) => " Lưu ý: các mốc thấy mục tiêu ở những bước sóng khác nhau (" + a + "–" + b + " µm), nên chênh lệch độ sáng có thể là phổ của vật thể chứ không phải thay đổi thật theo thời gian.",
    ylab_off: "độ lệch (giây cung)", empty_off: "không mốc nào có S/N ≥ 5", ylab_wing: "chỉ số cánh PSF (mJy)", ylab_flux: "thông lượng (mJy)", empty_flux: "chưa đo được thông lượng",
    spec_text: (n, N, lo, hi, d0, d1) => n + "/" + N + " ảnh cho điểm dùng được, từ " + lo + " đến " + hi + " µm, chụp từ " + d0 + " đến " + d1 +
      ". Nếu mục tiêu không biến quang thì đây là phổ của nó; với sao biến quang, các điểm còn thay đổi theo thời gian. Thông lượng là tổng trong khẩu độ, chưa hiệu chỉnh khẩu độ: hãy tin vào hình dạng, đừng tin mức tuyệt đối.",
    spec_y: "thông lượng (mJy)",
    play: "&#9654; Phát", pause: "&#10074;&#10074; Dừng",
    copy: "Sao chép liên kết", copied: "Đã chép",
    form_err: "Hãy nhập RA và Dec là số, đơn vị độ thập phân (ví dụ 269.452 và 4.693).",
    // ---- lớp phủ danh mục (Gaia DR3, SIMBAD) ----
    k_gaia: "Gaia DR3 trong khung",
    gaia_v: (n, g, ep) => n + " ngôi sao sáng hơn G = " + g + ", đã dịch từ năm " + ep + " đến ngày này theo chuyển động riêng của chúng",
    gaia_down: "kho Gaia không trả lời nên chưa vẽ được các sao",
    k_simbad: "SIMBAD",
    simbad_target: (id, ty) => id + (ty ? " (" + ty + ")" : ""),
    simbad_n: (n) => n + " thiên thể đã biết trong khung",
    simbad_down: "dịch vụ SIMBAD không trả lời nên chưa vẽ được các thiên thể",
    k_match: "Sao Gaia tại vị trí dự đoán",
    match_v: (id, g, sep) => "Gaia DR3 " + id + ", G = " + g + ", cách vị trí dự đoán " + sep + "″",
    match_none: "không có sao nào trong vòng 3″: mục tiêu có thể quá mờ ở bước sóng nhìn thấy để Gaia ghi nhận (bình thường với sao lùn nâu)",
    tip_gaia: (id, g, pm) => "Gaia DR3 " + id + " · G = " + g + (pm ? " · chuyển động " + pm + "″/năm" : ""),
    tip_simbad: (id, ty) => "SIMBAD: " + id + (ty ? " · " + ty : ""),
    k_wise: "AllWISE (2010) trong khung",
    wise_v: (n, w2) => n + " nguồn hồng ngoại sáng hơn W2 = " + w2 + " (4.6 µm), vẽ ở đúng chỗ kính WISE thấy chúng năm 2010",
    wise_down: "danh mục WISE của IRSA không trả lời nên chưa vẽ được các nguồn",
    k_wise_match: "Nơi WISE thấy mục tiêu năm 2010",
    wise_match: (id, w2, sep, moved, date) => "AllWISE " + id + ", W2 = " + w2 + " (cách vị trí dự đoán năm 2010 " + sep + "″)" +
      (moved !== null && moved !== undefined ? "; đến " + date + " đã dịch " + moved + "″" : ""),
    wise_none: "không có nguồn WISE nào trong vòng 3″ quanh vị trí năm 2010",
    tip_wise: (id, w1, w2) => "AllWISE " + id + " · W1 = " + (w1 === null ? "–" : w1) + " · W2 = " + w2 + " · thấy năm 2010",
    mv_v_moving: "Đang chuyển động", mv_v_prob: "Nhiều khả năng đang chuyển động", mv_v_static: "Không thấy chuyển động", mv_v_need: "Chưa đủ vị trí đo",
    mv_sum_moving: (mu, err) => "Chỉ từ ảnh SPHEREx, thiên thể dịch " + mu + " ± " + err + " giây cung mỗi năm trên bầu trời. Đây là vật thể chuyển động.",
    mv_sum_prob: (mu, err, S) => "Ảnh cho thấy độ dịch " + mu + " ± " + err + " giây cung mỗi năm, khoảng " + S + " lần độ bất định. Là ứng viên thật, nhưng cần thêm mốc quan sát để chắc chắn.",
    mv_sum_static: (lim) => "Không thấy chuyển động đáng kể. Với số vị trí ít như vậy, phép khớp chỉ loại trừ được chuyển động nhanh hơn khoảng " + lim + " giây cung mỗi năm (3σ).",
    mv_note_blind: " Không có chuyển động trong danh mục, nên cửa sổ đo đứng yên ở tâm khung ảnh và không đi theo thiên thể: vật chuyển động nhanh có thể trôi ra khỏi cửa sổ và bị bỏ sót. Một phép thử với tọa độ sao Barnard nhưng không cho chuyển động riêng chỉ cho kết quả yếu, chưa kết luận được (khoảng 6 ± 6 giây cung mỗi năm, trong khi danh mục ghi 10,4).",
    mv_sum_need: (n) => "Mới có " + n + " vị trí đo được. Cần ít nhất 3 vị trí để khớp chuyển động, và mỗi vị trí cần tín hiệu trên nhiễu từ 5 trở lên (hoặc lõi bão hòa).",
    mv_k_meas: "Đo được (chỉ từ SPHEREx)", mv_meas: (e, se, n, sn, mu) => "đông " + e + " ± " + se + ", bắc " + n + " ± " + sn + " → tổng " + mu + " giây cung/năm",
    mv_k_cat: "Danh mục (Gaia / tài liệu)", mv_cat: (e, n, mu) => "đông " + e + ", bắc " + n + " → tổng " + mu + " giây cung/năm", mv_nocat: "không có: đây là phép đo mù",
    mv_k_agree: "Mức khớp", mv_agree_ok: (s) => "khớp (lệch " + s + " σ)", mv_agree_bad: (s) => "lệch " + s + " σ: nên kiểm tra lại thiên thể hoặc số liệu danh mục",
    mv_k_data: "Dựa trên", mv_data: (n, d) => n + " vị trí đo trong " + d + " ngày",
    mv_note: "Vị trí được đo trên một lưới cố định theo bầu trời cho mọi ngày, rồi khớp bằng một đường thẳng. Chuyển động trong danh mục không dùng khi khớp (chỉ chỉ chỗ cần nhìn), nên so sánh là một phép kiểm tra thật. Độ bất định tính từ độ phân tán của vài vị trí nên chỉ mang tính ước lượng. Điểm ảnh SPHEREx rộng 6,2″ và dữ liệu công khai kéo dài khoảng một năm: chỉ xác nhận được chuyển động từ vài giây cung mỗi năm trở lên.",
    mv_leg_meas: "SPHEREx", mv_leg_cat: "danh mục",
    mv_h: "Có đang chuyển động không? Đo chỉ từ ảnh SPHEREx",
    mv_fig: "Chuyển động trên bầu trời, giây cung mỗi năm (bắc ở trên, đông ở bên trái). Mũi tên xanh chanh có thanh sai số: điều ảnh SPHEREx cho thấy. Mũi tên xanh lam nét đứt: chuyển động riêng trong danh mục. Các vòng ứng với 1, 2, 5… giây cung mỗi năm.",
    ov_track: "Quỹ đạo đã đo của thiên thể",
    otypes: { "BY*": "sao biến quang kiểu BY Draconis", "BD*": "sao lùn nâu", "TT*": "sao T Tauri", "Mi*": "sao biến quang kiểu Mira", "*": "ngôi sao", "V*": "sao biến quang",
      "PM*": "sao có chuyển động riêng lớn", "IR": "nguồn hồng ngoại", "G": "thiên hà", "Y*O": "thiên thể sao trẻ", "Em*": "sao có vạch phát xạ", "**": "sao đôi", "Y*?": "ứng viên sao trẻ" },
    ov_gaia: "Sao Gaia DR3", ov_simbad: "Thiên thể SIMBAD", ov_wise: "Nguồn AllWISE (2010)",
    ov_note: "Vòng xanh nhạt: sao trong danh mục Gaia DR3, dời theo chuyển động riêng về ngày chụp (to hơn = sáng hơn). Hình thoi hồng: nguồn hồng ngoại AllWISE ở đúng chỗ kính WISE thấy năm 2010, không dời: ngôi sao nào nằm cách xa hình thoi của nó là đã chuyển động trong 15 năm. Ô vuông cam: thiên thể SIMBAD. Chữ thập trắng: chỗ ta đo được thiên thể ở từng ngày đến khung hiện tại, đường nối chúng là quỹ đạo của nó. Rê chuột hoặc chạm vào để xem chi tiết. Một chấm chuyển động mà không khớp gì ở đây mới là ứng viên đáng xem.",
    why_barnard: "Ngôi sao có chuyển động riêng lớn nhất: khoảng 10.4 giây cung mỗi năm, rất dễ thấy.",
    why_epsindib: "Cặp sao lùn nâu cách ngôi sao sáng Epsilon Indi A khoảng 7 phút cung (không nằm trong khung này).",
    why_wise0855: "Sao lùn nâu lạnh nhất từng biết (~250 K): chỉ thấy ở trên 4 micron, nên dùng đầu thu 6.",
    why_rwaur: "Sao trẻ có những lần mờ đi bất thường. Đầu thu 1 (0.75–1.1 micron) là đầu thu không bị bão hòa.",
    why_rdra: "Sao biến quang kiểu Mira (chu kỳ ~245 ngày). Quá sáng: bão hòa ở mọi đầu thu của SPHEREx (ít nhất ở đầu thu 6), nên độ sáng chỉ cho thấy xu hướng.",

    // ---- static page text (keys used in data-i18n attributes) ----
    meta_desc: "Nhập một vị trí trên bầu trời và xem ảnh hồng ngoại thật của NASA SPHEREx tại đó thay đổi trong hơn một năm.",
    nav_how: "Cách đọc kết quả",
    hero_h: "Xem bầu trời hồng ngoại chuyển động.",
    hero_p: "Nhập một vị trí trên bầu trời, hoặc chọn một mục tiêu nổi tiếng. SkyShift hiển thị ảnh thật của kính viễn vọng SPHEREx (NASA) tại vị trí đó, mỗi mốc quan sát một khung hình, thành một đoạn time-lapse ngắn.",
    l_ra: "RA – xích kinh (độ)", l_dec: "Dec – xích vĩ (độ)", l_fov: "Trường nhìn", l_band: "Dải sóng", band_auto: "Tự động",
    go: "Xem &#9654;",
    adv: "Nâng cao: vật thể chuyển động và đầu thu",
    l_pmra: "Chuyển động riêng theo RA (mas/năm)", l_pmdec: "Chuyển động riêng theo Dec (mas/năm)", l_pos_epoch: "Năm của vị trí (epoch)", l_detector: "Đầu thu (1–6)",
    ph_eg: "vd. -801.5", ph_auto: "tự động",
    adv_note: "Khi nhập chuyển động riêng, khung ảnh đi theo ngôi sao đến đúng ngày SPHEREx chụp, và vòng tròn vàng chỉ nơi nó được dự đoán nằm vào mỗi ngày.",
    try_: "Thử:",
    placeholder: "Chọn một mục tiêu ở trên, hoặc nhập RA và Dec rồi bấm Xem.",
    loading: "Đang xử lý…",
    compass: "B &uarr; &nbsp; Đ &larr;",
    v_flip: "Lật ảnh", v_diff: "Ảnh trừ", speed: "Tốc độ",
    this_epoch: "Mốc quan sát này",
    legend_note: "Vòng vàng: vị trí mà chuyển động riêng trong danh mục dự đoán cho ngày này.",
    csv_epoch: "Tải bảng các mốc (CSV)",
    meas_h: "Những gì đo được tại vị trí mục tiêu",
    fig_pos: "Vị trí: tâm đo được cách vị trí danh mục dự đoán bao xa (giây cung). Chỉ hiện khi đo được vị trí: tỉ lệ tín hiệu/nhiễu ≥ 5, hoặc tâm của lõi bão hòa với sao rất sáng.",
    fig_flux: "Độ sáng: thông lượng trong khẩu độ bán kính 2 pixel (mJy, đã trừ nền) cùng sai số. Nếu có mốc bị bão hòa (mất tâm sao), mọi mốc dùng chỉ số thay thế lấy từ cánh PSF (điểm rỗng: chỉ xem xu hướng, chưa hiệu chuẩn).",
    th_epoch: "Mốc", th_snr: "Tín hiệu/nhiễu", th_flux: "Thông lượng (mJy)", th_off: "Lệch Đông / Bắc (giây cung)", th_note: "Ghi chú",
    csv_meas: "Tải số đo (CSV)",
    spec_h: "Phổ dựng từ ảnh SPHEREx",
    fig_spec: "Mỗi ảnh SPHEREx thấy mục tiêu ở một bước sóng riêng, nên mỗi ảnh đo một lần, vẽ theo bước sóng, sẽ thành một phổ. Vòng rỗng: ảnh bị bão hòa (không đáng tin). Các vạch xám dọc ngăn cách sáu đầu thu.",
    csv_spec: "Tải phổ (CSV)",
    src_title: "Dữ liệu NASA đã dùng",
    th_obs: "Mã quan sát", th_coll: "Bộ dữ liệu", th_utc: "Ngày (UTC)", th_wl: "Bước sóng", th_full: "Ảnh đầy đủ (IRSA)",
    lim_h: "Giới hạn (xin đọc kỹ)",
    lim1: "SPHEREx mới có khoảng một năm dữ liệu công khai: vật thể chuyển động chậm dịch chưa đến 2 pixel.",
    lim2: "Mỗi pixel rộng 6.2 giây cung; thị sai (< 0.6 giây cung) quá nhỏ để nhìn thấy.",
    lim3: "Sao rất sáng có thể bị bão hòa; số pixel bão hòa được đếm và độ sáng của chúng không đáng tin.",
    lim4: "Bước sóng SPHEREx thay đổi trên mỗi đầu thu, nên độ sáng giữa các mốc chỉ mang tính gần đúng.",
    lim5: "Đây là công cụ khám phá: một chấm di chuyển là ứng viên cần kiểm tra, chưa phải phát hiện.",
    lim6: "Vị trí mới (tọa độ bạn tự nhập) được tính trực tiếp và cần kho dữ liệu NASA IRSA đang hoạt động. Năm mục tiêu mẫu đã tính sẵn nên vẫn mở được kể cả khi IRSA ngừng.",
    about_h: "Cách đọc kết quả",
    about_flip: "<strong>Lật ảnh:</strong> mỗi khung là trung vị của vài ảnh SPHEREx chụp cách nhau vài ngày (cùng đầu thu), đã căn chỉnh theo tọa độ trên trời. Sao đứng yên thì nằm yên; vật nào chuyển động sẽ nhảy giữa các khung.",
    about_diff: "<strong>Ảnh trừ:</strong> mỗi mốc trừ đi mốc đầu. Xám = không đổi, trắng = nay sáng hơn, đen = nay mờ hơn. Một ngôi sao chuyển động hiện thành một cặp trắng và đen.",
    about_link: "<strong>Liên kết:</strong> mỗi chế độ xem có một URL như <code>?ra=269.45&amp;dec=4.69&amp;pmra=-801.6&amp;pmdec=10362&amp;fov=0.1</code> để bạn chia sẻ hoặc nhúng.",
    gl_h: "Tìm hiểu thêm: những ý tưởng phía sau",
    gl1_t: "SPHEREx là gì?", gl1_d: "Kính viễn vọng vũ trụ của NASA, phóng năm 2025. Nó quét toàn bộ bầu trời trong 102 “màu” hồng ngoại từ 0.75 đến 5 micron, và lặp lại nhiều lần.",
    gl2_t: "Vì sao mỗi ảnh một bước sóng?", gl2_d: "Mỗi đầu thu có một bộ lọc mà màu thay đổi liên tục dọc theo nó (bộ lọc biến thiên tuyến tính). Mỗi lần chụp, ngôi sao rơi vào một chỗ khác nhau trên bộ lọc, nên mỗi ảnh thấy nó ở một bước sóng khác. Ghép nhiều ảnh lại ta được phổ. Vì thế cùng một sao có thể sáng khác nhau giữa hai ảnh mà không hề biến quang.",
    gl3_t: "Chuyển động riêng", gl3_d: "Các sao trôi chậm trên bầu trời. Sao Barnard dịch 10.4 giây cung mỗi năm, nhanh nhất trong mọi ngôi sao, tức khoảng 1.7 pixel SPHEREx mỗi năm.",
    gl4_t: "Sao lùn nâu", gl4_d: "Vật thể nằm giữa hành tinh và ngôi sao: quá nhẹ để đốt cháy hydro. Epsilon Indi B là sao lùn nâu loại T; WISE 0855 chỉ khoảng 250 K (khoảng −23 °C) nên gần như chỉ sáng ở hồng ngoại, trên 4 micron.",
    gl5_t: "Sao biến quang", gl5_d: "RW Aurigae là sao trẻ thỉnh thoảng mờ đi bất thường; R Draconis là sao biến quang kiểu Mira, phồng lên rồi co lại theo chu kỳ khoảng 245 ngày.",
    gl6_t: "Bão hòa", gl6_d: "Sao rất sáng làm đầy pixel vượt quá mức đầu thu đếm được nên mất phần tâm. Ta vẫn dùng vị trí của nó nhưng không tin độ sáng.",
    gl7_t: "Tỉ lệ tín hiệu/nhiễu (S/N) và mJy", gl7_d: "S/N ≥ 5 nghĩa là tín hiệu gấp 5 lần độ nhiễu thông thường: thường là một phát hiện thật. 1 mJy (milijansky) là đơn vị đo độ sáng của một nguồn.",
    foot2: "Dữ liệu: NASA/IPAC Infrared Science Archive (IRSA), SPHEREx Data Release 1 và Quick Release 3. Chuyển động riêng: CDS SIMBAD / Gaia DR3.",
    foot3: "Làm cho NASA Space Apps Challenge 2026 (Hà Nội) bởi đội AEC. Không liên kết với và không được NASA bảo trợ. Mã nguồn mở, Apache-2.0.",
    aria_pos: "Vị trí trên bầu trời", aria_lang: "Ngôn ngữ",
  };

  const LANGS = { en: EN, vi: VI };
  let lang = "en";

  function t(key) {
    const args = Array.prototype.slice.call(arguments, 1);
    let v = (LANGS[lang] && LANGS[lang][key] !== undefined) ? LANGS[lang][key] : EN[key];
    return typeof v === "function" ? v.apply(null, args) : v;
  }
  // Server-supplied English strings with a known Vietnamese version (falls back to the original).
  function lookup(group, text) {
    const g = LANGS[lang] && LANGS[lang][group];
    return (g && g[text]) || text;
  }

  function apply() {
    document.documentElement.lang = lang;
    const vi = lang === "vi";
    document.querySelectorAll("[data-i18n]").forEach((e) => {
      if (e.dataset.en === undefined) e.dataset.en = e.innerHTML;
      const k = e.dataset.i18n;
      e.innerHTML = vi && VI[k] !== undefined ? VI[k] : e.dataset.en;
    });
    [["data-i18n-ph", "placeholder", "enPh"], ["data-i18n-aria", "aria-label", "enAria"], ["data-i18n-title", "title", "enTitle"]].forEach(([attr, target, store]) => {
      document.querySelectorAll("[" + attr + "]").forEach((e) => {
        if (e.dataset[store] === undefined) e.dataset[store] = e.getAttribute(target) || "";
        const k = e.getAttribute(attr);
        e.setAttribute(target, vi && VI[k] !== undefined ? VI[k] : e.dataset[store]);
      });
    });
    document.title = t("title");
    const md = document.querySelector('meta[name="description"]');
    if (md) { if (md.dataset.en === undefined) md.dataset.en = md.content; md.content = vi ? VI.meta_desc : md.dataset.en; }
    document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  }

  function setLang(l) {
    lang = LANGS[l] ? l : "en";
    try { localStorage.setItem("skyshift_lang", lang); } catch (e) { /* storage may be blocked */ }
    apply();
  }
  function init() {
    let l = new URLSearchParams(location.search).get("lang");
    if (!l) { try { l = localStorage.getItem("skyshift_lang"); } catch (e) { l = null; } }
    lang = l === "vi" ? "vi" : "en";          // English unless Vietnamese was asked for or chosen before
    apply();
  }

  window.I18N = { t, lookup, setLang, init, get lang() { return lang; } };
})();
