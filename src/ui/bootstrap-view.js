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
  const DEFAULTS = { samples: 10000, tails: 2, alpha: 0.05, seed: 1 };   // 10.000 mẫu: mặc định SmartPLS 4

  const VIEWS = [
    { key: 'paths', label: 'Hệ số đường dẫn' },
    { key: 'ci', label: 'Khoảng tin cậy' },
    { key: 'indirect', label: 'Tác động gián tiếp' },
    { key: 'total', label: 'Tổng tác động' },
    { key: 'loadings', label: 'Outer loading' },
    { key: 'weights', label: 'Outer weight' },
    { key: 'r2', label: 'R²' },
    { key: 'htmt', label: 'HTMT' }
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
      htmt: [{
        title: 'HTMT: khoảng tin cậy một phía 95%', empty: 'Không có cặp thang đo nào tính được HTMT (cần mỗi thang đo có ít nhất 2 biến).',
        head: ['Cặp thang đo', 'Original sample (O)', 'Sample mean (M)', 'Cận trên 95% (percentile)', 'Cận trên 95% (BCa)', 'Kết luận'],
        rows: s.htmt.map(x => {
          const cls = x.h95 < 0.85 ? 'good' : x.h95 < 0.9 ? 'warn' : 'bad';
          return [C(x.key), C(x.O), C(x.M), C(x.h95, cls), C(x.hBca95),
            C(x.h95 < 0.85 ? 'Đạt: cận trên < 0,85' : x.h95 < 0.9 ? 'Chấp nhận: cận trên < 0,90' : 'Không đạt: cận trên ≥ 0,90', cls)];
        }),
        note: 'Kiểm định HTMT luôn là một phía, α = 0,05 (cận trên = phân vị 95% của phân phối bootstrap), không phụ thuộc tùy chọn kiểm định ở trên, giống hướng dẫn SmartPLS. ' +
          'Giá trị phân biệt đạt khi cận trên nhỏ hơn 0,85 (hoặc 0,90 với hai khái niệm gần nhau) (Henseler và cộng sự, 2015). Kết luận dựa trên cận trên percentile; cột BCa để tham khảo. ' +
          'Thang đo một biến không có HTMT nên không xuất hiện ở đây.'
      }]
    };
    const all = VIEWS.flatMap(v => views[v.key].map(sec => Object.assign(sec, { view: v.key })));
    return { key: 'boot', title: 'Bootstrapping', sections: all, views };
  };

  // ---------- Giao diện ----------
  // Danh sách quan hệ trong mô hình hiện tại (để chọn hướng giả thuyết khi kiểm định một phía)
  function currentPathKeys() {
    try { const m = P.readModel(); return m.paths.map(([f, t]) => `${f} → ${t}`); } catch (e) { return []; }
  }

  function opts() {
    const o = Object.assign({}, DEFAULTS, state.bootOpts || {});
    if ($('btSamples')) {
      o.samples = +$('btSamples').value; o.tails = +$('btTails').value; o.alpha = +$('btAlpha').value;
      o.seed = Math.max(1, Math.floor(+$('btSeed').value || 1));
    }
    state.bootDirs = state.bootDirs || {};
    o.dirs = {};
    currentPathKeys().forEach(k => { o.dirs[k] = state.bootDirs[k] === -1 ? -1 : 1; });
    return o;
  }

  function settingsHtml(o) {
    const sel = (id, val, list) => `<select id="${id}">${list.map(([v, t]) => `<option value="${v}" ${+v === +val ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    let h = `<div class="bt-set">
      <label>Số mẫu bootstrap ${sel('btSamples', o.samples, [[500, '500 (thử nhanh)'], [1000, '1.000'], [5000, '5.000'], [10000, '10.000 (mặc định SmartPLS 4)']])}</label>
      <label>Kiểm định ${sel('btTails', o.tails, [[2, 'Hai phía'], [1, 'Một phía (có hướng)']])}</label>
      <label>Mức ý nghĩa ${sel('btAlpha', o.alpha, [[0.1, '0,10'], [0.05, '0,05'], [0.01, '0,01']])}</label>
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
    if (el.id === 'btTails' || el.id === 'btSamples' || el.id === 'btAlpha' || el.id === 'btSeed') {
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
    h += `<p class="bt-info">${res.done.toLocaleString('vi-VN')} mẫu hợp lệ${res.failed ? `, ${res.failed} mẫu lỗi bị bỏ qua` : ''}${res.notConverged ? `, ${res.notConverged} mẫu chưa hội tụ bị loại` : ''}${res.done + skipped < res.requested ? ` (dừng sớm, yêu cầu ${res.requested.toLocaleString('vi-VN')})` : ''} · ${(res.ms / 1000).toFixed(1)} giây · seed ${res.opts.seed}</p>`;
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
        { data: r.prepared.data, blocks: r.blocks, paths: r.paths, plsOpts: r.plsOpts, original: r }, o,
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
