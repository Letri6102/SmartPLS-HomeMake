/*
 * ui/bootstrap-view.js — Độ đo "Bootstrapping": tùy chọn, tiến trình, và các bảng kết quả
 * giống SmartPLS (Mean, STDEV, T values, p values; Confidence intervals percentile và BCa;
 * Specific / Total indirect effects; Total effects; Outer loadings; Outer weights; R²; HTMT).
 * Phần tính toán nằm ở analysis/bootstrap.js.
 */
(function (P) {
  'use strict';
  const { $, esc, toast, f3, C } = P.util;
  const state = P.state;

  P.fmtP = v => f3(v);
  const pct = q => (q * 100).toFixed(1).replace(/\.0$/, '') + '%';
  // Mặc định như SmartPLS: 10.000 mẫu, hai phía, 0,05, seed cố định, không đổi dấu
  const DEFAULTS = { samples: 10000, tails: 2, alpha: 0.05, seed: 1, signChange: 'none' };

  const VIEWS = [
    { key: 'paths', label: 'Hệ số đường dẫn' },
    { key: 'ci', label: 'Khoảng tin cậy' },
    { key: 'indirect', label: 'Tác động gián tiếp' },
    { key: 'total', label: 'Tổng tác động' },
    { key: 'loadings', label: 'Outer loading' },
    { key: 'weights', label: 'Outer weight' },
    { key: 'r2', label: 'R²' },
    { key: 'htmt', label: 'HTMT' },
    { key: 'rows', label: 'Ảnh hưởng theo dòng' }
  ];

  // Giá trị p của từng quan hệ (để hiện trên sơ đồ)
  P.bootPvals = function () {
    if (!P.bootFresh()) return null;
    return Object.fromEntries(state.boot.result.stats.paths.map(x => [x.key, x.p]));
  };

  // ---------- Dựng bảng ----------
  function meanTable(list, title, head0, al, extra, showDir) {
    const hd = showDir && dirCol(list);
    return {
      title, empty: 'Mô hình không có thành phần này.',
      head: [head0, ...(hd ? ['Giả thuyết'] : []), 'Original sample (O)', 'Sample mean (M)', 'Standard deviation (STDEV)', 'T statistics (|O/STDEV|)', 'P values', 'Kết luận'],
      rows: list.map(x => {
        const sig = x.p < al;
        const wrongSign = x.tails === 1 && x.O * x.dir < 0;
        return [C(x.key), ...(hd ? [C(dirTxt(x))] : []), C(x.O), C(x.M), C(x.sd), C(x.t), { v: x.p, cls: P.assess.pval(x.p, al), p: true },
          C(sig ? 'Có ý nghĩa' : wrongSign ? 'Không có ý nghĩa (ngược dấu giả thuyết)' : 'Không có ý nghĩa', sig ? 'good' : 'bad')];
      }),
      note: extra
    };
  }
  // Câu kết luận theo khoảng tin cậy (hai phía: không chứa 0; một phía: cận phía giả thuyết vượt 0)
  function ciVerdict(x, sig) {
    if (x.tails !== 1) return sig ? 'Không chứa 0: có ý nghĩa' : 'Chứa 0: không có ý nghĩa';
    if (x.dir > 0) return sig ? 'Cận dưới > 0: có ý nghĩa (dương)' : 'Cận dưới ≤ 0: không có ý nghĩa';
    return sig ? 'Cận trên < 0: có ý nghĩa (âm)' : 'Cận trên ≥ 0: không có ý nghĩa';
  }
  const dirCol = list => list.some(x => x.tails === 1);
  const dirTxt = x => (x.dir < 0 ? 'Âm (−)' : 'Dương (+)');
  function ciTable(list, title, head0) {
    const q = list[0] || { qLo: 0.025, qHi: 0.975 }, hd = dirCol(list);
    return {
      title, empty: 'Mô hình không có thành phần này.',
      head: [head0, ...(hd ? ['Giả thuyết'] : []), 'Original sample (O)', 'Sample mean (M)', pct(q.qLo), pct(q.qHi), 'Kết luận'],
      rows: list.map(x => [C(x.key), ...(hd ? [C(dirTxt(x))] : []), C(x.O), C(x.M), C(x.lo), C(x.hi), C(ciVerdict(x, x.ciSig), x.ciSig ? 'good' : 'bad')])
    };
  }
  function bcaTable(list, title, head0) {
    const q = list[0] || { qLo: 0.025, qHi: 0.975 }, hd = dirCol(list);
    return {
      title, empty: 'Mô hình không có thành phần này.',
      head: [head0, ...(hd ? ['Giả thuyết'] : []), 'Original sample (O)', 'Sample mean (M)', 'Bias', pct(q.qLo), pct(q.qHi), 'Kết luận'],
      rows: list.map(x => [C(x.key), ...(hd ? [C(dirTxt(x))] : []), C(x.O), C(x.M), C(x.bias), C(x.bcaLo), C(x.bcaHi), C(ciVerdict(x, x.bcaSig), x.bcaSig ? 'good' : 'bad')])
    };
  }

  // Dòng Excel (dòng 1 là tiêu đề) của quan sát thứ i trong dữ liệu đã chạy bootstrap
  const excelRow = (res, i) => (res.rowIds ? res.rowIds[i] + 2 : i + 1);
  const keyName = id => id.slice(id.indexOf('|') + 1);
  const pctTxt = x => (Number.isFinite(x) ? (x * 100).toFixed(1).replace('.', ',') + '%' : '');

  // Ảnh hưởng của từng dòng dữ liệu lên kiểm định (jackknife + các mẫu bootstrap không chứa dòng đó)
  function influenceSections(res) {
    const inf = res.influence;
    if (!inf) return [{ title: 'Ảnh hưởng theo dòng', empty: 'Chưa có dữ liệu ảnh hưởng theo dòng. Hãy chạy lại Bootstrapping.', head: [], rows: [] }];
    const showId = res.rowIds && state.headers.some(x => P.ID_RE.test(x.trim()));
    const id = i => (showId ? [C(P.rowLabel(res.rowIds[i]))] : []);
    const verdict = e => (e.sig ? 'Có ý nghĩa' : 'Không có ý nghĩa');
    const robust = {
      title: 'Độ vững của từng quan hệ khi bỏ riêng một dòng', empty: 'Mô hình không có quan hệ nào.',
      head: ['Quan hệ', 'Original sample (O)', 'T statistics', 'P values', 'Kết luận', 'Số dòng làm đổi kết luận', 'Dòng ảnh hưởng nhất (dòng Excel)', 'Phần phương sai do dòng đó'],
      rows: inf.keys.map(k => [C(k.key), C(k.O), C(k.t), { v: k.p, p: true }, C(k.sig ? 'Có ý nghĩa' : 'Không có ý nghĩa', k.sig ? 'good' : 'bad'),
        C(k.flips, k.flips ? 'warn' : 'good'), C(k.top === null ? '' : String(excelRow(res, k.top))), C(pctTxt(k.topShare))]),
      note: `“Số dòng làm đổi kết luận” đếm những dòng mà chỉ cần bỏ riêng dòng đó thì p vượt qua mức ${res.opts.alpha}. Bằng 0 nghĩa là kết luận không phụ thuộc vào bất kỳ một phiếu đơn lẻ nào. ` +
        `Với ${inf.n} dòng, mỗi dòng trung bình chỉ tạo ra ${pctTxt(1 / inf.n)} phương sai của hệ số.`
    };
    const pairs = [];
    inf.rows.forEach(r => Object.entries(r.effects).forEach(([k, e]) => { if (e.flip || e.share >= inf.cut) pairs.push({ i: r.i, k, e }); }));
    pairs.sort((a, b) => (b.e.flip - a.e.flip) || (b.e.share - a.e.share));
    const shown = pairs.slice(0, 60);
    const detail = {
      title: 'Các dòng ảnh hưởng nhiều nhất đến kiểm định', empty: 'Không có dòng nào ảnh hưởng vượt ngưỡng.',
      head: ['Dòng Excel', ...(showId ? ['Mã'] : []), 'Quan hệ', 'Hệ số nếu bỏ dòng', 'Thay đổi hệ số', 'T nếu bỏ dòng', 'P nếu bỏ dòng', 'Phần phương sai do dòng này', 'Chiều kéo hệ số', 'Có mặt ở đuôi bất lợi (kỳ vọng 1)', 'Kết luận nếu bỏ dòng'],
      rows: shown.map(({ i, k, e }) => [C(String(excelRow(res, i))), ...id(i), C(keyName(k)), C(e.est), C(e.d), C(e.t), { v: e.p, p: true },
        C(pctTxt(e.share)), C(!Number.isFinite(e.corr) ? '' : e.corr > 0 ? 'Kéo lên' : 'Kéo xuống'), C(e.tail),
        C(verdict(e) + (e.flip ? ' (đổi kết luận)' : ''), e.flip ? 'warn' : '')]),
      note: `Liệt kê cặp (dòng, quan hệ) mà bỏ dòng thì đổi kết luận, hoặc dòng tạo ra từ ${pctTxt(inf.cut)} phương sai trở lên (tương đương thay đổi hệ số vượt 3/√n sai số chuẩn)` +
        `${pairs.length > shown.length ? `; hiển thị ${shown.length}/${pairs.length} cặp mạnh nhất` : ''}. ` +
        `“Hệ số nếu bỏ dòng” lấy từ jackknife. “T” và “P nếu bỏ dòng” dùng độ lệch chuẩn của những mẫu bootstrap không chứa dòng đó (khoảng 36,8% số mẫu, nên dao động nhiều hơn kết quả chính; với dưới 5.000 mẫu chỉ nên coi là gợi ý). ` +
        `“Đuôi bất lợi” là ${pct(inf.keys[0] ? (res.opts.tails === 1 ? res.opts.alpha : res.opts.alpha / 2) : 0.025)} số mẫu có hệ số gần hoặc vượt qua 0 nhất; dòng có mặt ở đó nhiều hơn 1 là dòng kéo khoảng tin cậy về phía 0. ` +
        `<b>Bảng này chỉ để biết cần xem lại phiếu nào.</b> Không loại phiếu chỉ vì nó làm đổi kết luận: khi đó p-value không còn đúng nghĩa. Chỉ loại khi phiếu vi phạm tiêu chí chất lượng ở mục “Dòng đáng ngờ”, và báo cáo kết quả trước và sau.`
    };
    return [robust, detail];
  }

  P.bootTables = function (res) {
    const s = res.stats, al = res.opts.alpha, one = res.opts.tails === 1;
    const test = `${one ? 'Kiểm định một phía có hướng (theo cột Giả thuyết)' : 'Kiểm định hai phía'}, mức ý nghĩa ${al}, ${res.done} mẫu bootstrap.`;
    const dirNote = one ? ' Một phía: p = P(T > hướng × O/STDEV); hệ số ngược dấu giả thuyết luôn không có ý nghĩa.' : '';
    const views = {
      paths: [meanTable(s.paths, 'Hệ số đường dẫn: Mean, STDEV, T values, p values', 'Quan hệ', al,
        `${test} Quan hệ có ý nghĩa thống kê khi p < ${al}; ô đỏ là quan hệ không có ý nghĩa.${dirNote}`, true)],
      ci: [
        Object.assign(ciTable(s.paths, 'Khoảng tin cậy (percentile)', 'Quan hệ'),
          { note: one ? 'Một phía: giả thuyết dương có ý nghĩa khi cận dưới > 0; giả thuyết âm có ý nghĩa khi cận trên < 0.' : 'Quan hệ có ý nghĩa khi khoảng tin cậy không chứa 0.' }),
        Object.assign(bcaTable(s.paths, 'Khoảng tin cậy BCa (bias-corrected and accelerated)', 'Quan hệ'),
          { note: `Bias = Sample mean − Original sample. BCa hiệu chỉnh độ lệch (z0) và độ bất đối xứng (hệ số gia tốc a, ước lượng bằng jackknife trên ${res.jackknife || 0} mẫu bỏ từng dòng) (Efron & Tibshirani, 1993). Trang chưa có khoảng studentized.` })
      ],
      indirect: [
        meanTable(s.indirect, 'Tác động gián tiếp cụ thể (specific indirect effects)', 'Đường gián tiếp', al,
          'Tác động gián tiếp = tích các hệ số β trên đường đi. Có ý nghĩa thì biến ở giữa đóng vai trò trung gian.' + (one ? ' Hướng giả thuyết = tích hướng các quan hệ trên đường đi.' : ''), true),
        ciTable(s.indirect, 'Khoảng tin cậy percentile của tác động gián tiếp cụ thể', 'Đường gián tiếp'),
        bcaTable(s.indirect, 'Khoảng tin cậy BCa của tác động gián tiếp cụ thể', 'Đường gián tiếp'),
        meanTable(s.totalIndirect, 'Tổng tác động gián tiếp (total indirect effects)', 'Quan hệ', al, undefined, true)
      ],
      total: [meanTable(s.total, 'Tổng tác động (total effects)', 'Quan hệ', al, 'Tổng tác động = tác động trực tiếp + tổng tác động gián tiếp.', true)],
      loadings: [meanTable(s.loadings, 'Outer loading: Mean, STDEV, T values, p values', 'Biến ← Thang đo', al)],
      weights: [meanTable(s.weights, 'Outer weight: Mean, STDEV, T values, p values', 'Biến → Thang đo', al)],
      r2: [meanTable(s.r2, 'R²: Mean, STDEV, T values, p values', 'Biến phụ thuộc', al)],
      htmt: [(() => {
        const q = s.htmt[0] || { qLo: one ? al : al / 2, qHi: one ? 1 - al : 1 - al / 2 };
        const rec = Math.abs(q.qHi - 0.95) < 1e-9;
        return {
          title: `HTMT: khoảng tin cậy (cận trên ${pct(q.qHi)})`, empty: 'Không có cặp thang đo nào tính được HTMT.',
          head: ['Cặp thang đo', 'Original sample (O)', 'Sample mean (M)', `${pct(q.qLo)} (percentile)`, `${pct(q.qHi)} (percentile)`, 'Bias', `${pct(q.qLo)} (BCa)`, `${pct(q.qHi)} (BCa)`, 'Kết luận'],
          rows: s.htmt.map(x => {
            const cls = x.hi < 0.85 ? 'good' : x.hi < 0.9 ? 'warn' : 'bad';
            return [C(x.key), C(x.O), C(x.M), C(x.lo), C(x.hi, cls), C(x.bias), C(x.bcaLo), C(x.bcaHi),
              C(x.hi < 0.85 ? 'Đạt: cận trên < 0,85' : x.hi < 0.9 ? 'Chấp nhận: cận trên < 0,90' : 'Không đạt: cận trên ≥ 0,90', cls)];
          }),
          note: `Khoảng tin cậy của HTMT theo đúng tùy chọn kiểm định ở trên, như SmartPLS (${one ? 'một phía' : 'hai phía'}, mức ý nghĩa ${al}). ` +
            'Giá trị phân biệt đạt khi cận trên nhỏ hơn 0,85 (hoặc 0,90 với hai khái niệm gần nhau) (Henseler và cộng sự, 2015). Kết luận dựa trên cận trên percentile; cột BCa để tham khảo. ' +
            (rec ? 'Cận trên đang là phân vị 95%, đúng khuyến nghị kiểm định HTMT một phía ở mức 0,05 (Franke & Sarstedt, 2019). '
              : `Khuyến nghị cho HTMT là cận trên một phía 95%: chọn “Một phía” với mức ý nghĩa 0,05 (hoặc “Hai phía” với 0,10) rồi chạy lại. Cận trên hiện tại (${pct(q.qHi)}) ${q.qHi > 0.95 ? 'chặt hơn' : 'lỏng hơn'} mức đó. `) +
            'Với thang đo một biến, tương quan nội bộ trung bình lấy bằng 1, như SmartPLS.'
        };
      })()],
      rows: influenceSections(res)
    };
    const all = VIEWS.flatMap(v => views[v.key].map(sec => Object.assign(sec, { view: v.key })));
    return { key: 'boot', title: 'Bootstrapping', sections: all, views };
  };

  // ---------- Giao diện ----------
  // Danh sách quan hệ trong mô hình hiện tại (để chọn hướng giả thuyết khi kiểm định một phía)
  function currentPathKeys() {
    try { const m = P.readModel(); return m.paths.map(([f, t]) => `${f} → ${t}`).concat(m.mods.map(m3 => P.stats.modKey(...m3))); } catch (e) { return []; }
  }

  function opts() {
    const o = Object.assign({}, DEFAULTS, state.bootOpts || {});
    if ($('btSamples')) {
      o.samples = +$('btSamples').value; o.tails = +$('btTails').value; o.alpha = +$('btAlpha').value;
      o.seed = Math.max(1, Math.floor(+$('btSeed').value || 1));
      o.signChange = $('btSign').value === 'construct' ? 'construct' : 'none';
    }
    state.bootDirs = state.bootDirs || {};
    o.dirs = {};
    currentPathKeys().forEach(k => { o.dirs[k] = state.bootDirs[k] === -1 ? -1 : 1; });
    return o;
  }

  function settingsHtml(o) {
    const sel = (id, val, list) => `<select id="${id}">${list.map(([v, t]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    let h = `<div class="bt-set">
      <label>Số mẫu bootstrap ${sel('btSamples', o.samples, [[500, '500 (thử nhanh)'], [1000, '1.000'], [5000, '5.000'], [10000, '10.000 (mặc định SmartPLS 4)']])}</label>
      <label>Kiểm định ${sel('btTails', o.tails, [[2, 'Hai phía'], [1, 'Một phía (có hướng)']])}</label>
      <label>Mức ý nghĩa ${sel('btAlpha', o.alpha, [[0.1, '0,10'], [0.05, '0,05'], [0.01, '0,01']])}</label>
      <label>Đổi dấu ${sel('btSign', o.signChange, [['none', 'Không đổi dấu (mặc định SmartPLS)'], ['construct', 'Theo thang đo']])}</label>
      <label>Seed <input type="number" id="btSeed" min="1" step="1" value="${o.seed}" title="Cùng seed thì kết quả lặp lại y hệt"></label>
      ${state.booting ? '<button class="btn sm danger" data-bt="stop">Dừng</button>' : `<button class="btn primary sm" data-bt="run">${P.bootFresh() ? 'Chạy lại' : 'Chạy Bootstrapping'}</button>`}
    </div>`;
    if (o.tails === 1) {
      const keys = Object.keys(o.dirs);
      h += `<div class="bt-dirs"><p class="note">Kiểm định một phía cần biết hướng giả thuyết của từng quan hệ. Chọn “Âm” cho giả thuyết tác động ngược chiều.</p>` +
        (keys.length ? `<div class="bt-dir-list">${keys.map(k => `<label>${esc(k)} <select data-bt-dir="${esc(k)}" ${state.booting ? 'disabled' : ''}>
          <option value="1" ${o.dirs[k] === 1 ? 'selected' : ''}>Dương (+)</option><option value="-1" ${o.dirs[k] === -1 ? 'selected' : ''}>Âm (−)</option></select></label>`).join('')}</div>`
          : '<p class="note">Chưa có quan hệ nào trong mô hình cấu trúc.</p>') + `</div>`;
    }
    return h;
  }

  // Đổi kiểm định / hướng giả thuyết: nhớ lựa chọn và vẽ lại phần tùy chọn
  P.bootChange = function (el) {
    if (el.dataset.btDir) { state.bootDirs = state.bootDirs || {}; state.bootDirs[el.dataset.btDir] = +el.value; return; }
    if (['btTails', 'btSamples', 'btAlpha', 'btSeed', 'btSign'].includes(el.id)) {
      state.bootOpts = opts();
      if (el.id === 'btTails') P.showTab('boot');
    }
  };

  P.bootVisibleSections = function () {
    if (!P.bootFresh()) return [];
    const t = P.bootTables(state.boot.result);
    return t.views[state.bootView] || [];
  };

  P.renderBoot = function () {
    const o = opts();
    let h = settingsHtml(o);
    if (state.booting) {
      return h + `<div class="progress"><div class="bar" id="bootBar"></div><span id="bootTxt">Đang chuẩn bị…</span></div>`;
    }
    if (!P.bootFresh()) {
      h += state.boot ? '<div class="banner">Mô hình hoặc dữ liệu đã thay đổi sau lần chạy trước. Bấm “Chạy lại”.</div>'
        : '<p class="note">Bootstrapping lấy mẫu lặp có hoàn lại từ dữ liệu, chạy lại PLS trên mỗi mẫu để ước lượng sai số chuẩn, giá trị t, p-value và khoảng tin cậy.</p>';
      return h;
    }
    const res = state.boot.result;
    const skipped = (res.failed || 0) + (res.notConverged || 0);
    h += `<p class="bt-info">${res.done.toLocaleString('vi-VN')} mẫu hợp lệ${res.failed ? `, ${res.failed} mẫu lỗi bị bỏ qua` : ''}${res.notConverged ? `, ${res.notConverged} mẫu chưa hội tụ bị loại` : ''}${res.done + skipped < res.requested ? ` (dừng sớm, yêu cầu ${res.requested.toLocaleString('vi-VN')})` : ''} · ${(res.ms / 1000).toFixed(1)} giây · seed ${res.opts.seed} · ${res.opts.signChange === 'construct' ? 'đổi dấu theo thang đo' : 'không đổi dấu'}</p>`;
    h += `<nav class="bt-nav" aria-label="Kết quả Bootstrapping">` + VIEWS.map(v =>
      `<button data-bt="view" data-v="${v.key}" class="${state.bootView === v.key ? 'on' : ''}">${v.label}</button>`).join('') + `</nav>`;
    h += P.bootVisibleSections().map(P.renderSection).join('');
    return h;
  };

  P.startBoot = async function () {
    if (P.isStale() && !P.compute()) return;
    const o = opts();
    state.bootOpts = o;
    const r = state.result, sig = state.sig;
    state.booting = true; state.bootCancel = false;
    if (state.activeTab === 'boot') P.showTab('boot'); else P.renderMeasureBar();
    try {
      const result = await P.bootstrap.run(
        { data: r.prepared.data, blocks: r.blocks, paths: r.paths, plsOpts: r.plsOpts, original: r, rowIds: r.prepared.rowIds }, o,
        (d, n, ms, phase) => {
          const b = $('bootBar'), t = $('bootTxt');
          if (b) b.style.width = (100 * d / n) + '%';
          if (!t) return;
          if (phase === 'jack') { t.textContent = `Đang tính hệ số gia tốc cho khoảng tin cậy BCa (jackknife ${d}/${n} dòng)`; return; }
          const left = d ? Math.max(0, ms / d * (n - d) / 1000) : 0;
          t.textContent = `Đang chạy mẫu ${d.toLocaleString('vi-VN')}/${n.toLocaleString('vi-VN')} · còn khoảng ${left.toFixed(0)} giây`;
        },
        () => state.bootCancel);
      state.boot = { sig, result };
      state.bootView = state.bootView || 'paths';
      toast(state.bootCancel ? `Đã dừng sau ${result.done} mẫu` : `Đã chạy Bootstrapping ${result.done} mẫu`);
    } catch (e) { toast('Lỗi khi chạy Bootstrapping: ' + e.message, true); }
    state.booting = false;
    if (state.result && state.sig === sig) P.buildTables(state.result);
    if (P.canvas) P.canvas.render();
    if (state.activeTab === 'boot') P.showTab('boot'); else P.renderMeasureBar();
  };

  P.bootAction = function (el) {
    const a = el.dataset.bt;
    if (a === 'run') P.startBoot();
    if (a === 'stop') state.bootCancel = true;
    if (a === 'view') { state.bootView = el.dataset.v; P.showTab('boot'); }
  };
})(window.PTSL);
