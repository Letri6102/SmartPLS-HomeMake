/*
 * analysis/assessment.js — Đánh giá kết quả theo ngưỡng (Hair và cộng sự, 2019; Henseler và cộng sự, 2015)
 * gồm: phân loại ô (đạt / cần xem lại / không đạt), bảng kiểm 4 nhóm tiêu chí,
 * và đoạn văn mô tả kết quả viết sẵn.
 */
(function (P) {
  'use strict';
  const { esc, f3, normDec } = P.util;
  const state = P.state;

  // ---------- Phân loại ô ----------
  const A = P.assess = {};
  A.loading = v => v >= 0.708 ? 'good' : v >= 0.4 ? 'warn' : 'bad';
  A.rel = v => Number.isNaN(v) ? '' : v > 0.95 ? 'warn' : v >= 0.7 ? 'good' : v >= 0.6 ? 'warn' : 'bad';
  // rho_A: như α/CR, nhưng > 1 là bất thường (trọng số không hợp lệ) nên không đạt
  A.rhoA = v => Number.isNaN(v) ? '' : v > 1 ? 'bad' : A.rel(v);
  A.ave = v => Number.isNaN(v) ? '' : v >= 0.5 ? 'good' : 'bad';
  A.vif = v => v < 3 ? 'good' : v < 5 ? 'warn' : 'bad';
  A.htmt = v => !Number.isFinite(v) ? '' : v < 0.85 ? 'good' : v < 0.9 ? 'warn' : 'bad';
  A.pval = (p, alpha) => Number.isFinite(p) ? (p < alpha ? 'good' : 'bad') : '';
  A.range = arr => { const v = arr.filter(Number.isFinite); return v.length ? [Math.min(...v), Math.max(...v)] : [NaN, NaN]; };
  A.countCls = (rows, cls) => rows.reduce((s, r) => s + r.filter(c => c && c.cls === cls).length, 0);

  // Cặp HTMT có cận trên khoảng tin cậy (bootstrap) lớn nhất, nếu đã chạy Bootstrapping cho mô hình hiện tại
  A.htmtUpper = function () {
    if (!P.bootFresh || !P.bootFresh()) return null;
    const list = state.boot.result.stats.htmt.filter(x => Number.isFinite(x.h95));
    return list.length ? list.reduce((m, x) => (x.h95 > m.h95 ? x : m)) : null;
  };

  // ---------- Tổng hợp các chỉ số cần đánh giá ----------
  A.summary = function (r) {
    const B = r.blocks, names = B.map(b => b.name);
    const multi = B.map((b, j) => j).filter(j => B[j].items.length > 1);
    const items = B.flatMap((b, j) => b.items.map((it, k) => ({ it, j, l: r.loadings[j][k], vif: r.outerVIF[j][k] })));
    // Dùng α chuẩn hóa (như SmartPLS) cho nhất quán với rho_A và CR, vốn tính trên dữ liệu chuẩn hóa
    const Q = j => r.quality[j];
    // Cùng ngưỡng với màu ô: < 0,6 (hoặc rho_A > 1) không đạt; 0,6–0,7 hoặc > 0,95 cần xem lại
    const vals = j => [Q(j).alphaStd, Q(j).rhoA, Q(j).rhoC].filter(Number.isFinite);
    const relFail = multi.filter(j => vals(j).some(v => v < 0.6) || Q(j).rhoA > 1).map(j => names[j]);
    const relLow = multi.filter(j => !relFail.includes(names[j]) && vals(j).some(v => v < 0.7)).map(j => names[j]);
    const relHigh = multi.filter(j => !relFail.includes(names[j]) && vals(j).some(v => v > 0.95)).map(j => names[j]);
    const relWeak = [...new Set([...relLow, ...relHigh])];
    const rhoAOdd = multi.filter(j => Q(j).rhoA > 1).map(j => names[j]);
    const aveFail = B.map((b, j) => j).filter(j => r.quality[j].ave < 0.5).map(j => names[j]);
    const lowLoad = items.filter(o => o.l < 0.708), veryLow = items.filter(o => o.l < 0.4);
    let htmtMax = NaN, htmtPair = '';
    const flFail = [], htmtVals = [];
    for (let i = 0; i < B.length; i++) for (let j = 0; j < i; j++) {
      const v = r.htmt[i][j];
      // thang đo một biến không có HTMT (NaN): bỏ qua
      if (Number.isFinite(v)) { htmtVals.push(v); if (!(htmtMax >= v)) { htmtMax = v; htmtPair = `${names[i]}–${names[j]}`; } }
      if (Math.abs(r.fornell[i][j]) >= Math.min(r.fornell[i][i], r.fornell[j][j])) flFail.push(`${names[i]}–${names[j]}`);
    }
    let innerVifMax = NaN, innerVifPair = '';
    r.structural.forEach((s, j) => s && s.vif.forEach((v, k) => { if (!(innerVifMax >= v)) { innerVifMax = v; innerVifPair = `${names[s.predictors[k]]} → ${names[j]}`; } }));
    const single = B.filter(b => b.items.length === 1).map(b => b.name);
    return { names, multi, items, relFail, relWeak, relLow, relHigh, rhoAOdd, aveFail, lowLoad, veryLow, htmtMax, htmtPair, htmtVals, flFail, single, innerVifMax, innerVifPair };
  };

  const ICON = {
    good: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="currentColor" opacity=".18"/><path d="M4.5 8.2l2.3 2.3 4.7-4.9" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
    warn: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="currentColor" opacity=".18"/><path d="M8 4.2v4.6M8 11.2v.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    bad: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="currentColor" opacity=".18"/><path d="M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    idle: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="currentColor" opacity=".18"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>'
  };

  // ---------- Bảng kiểm ----------
  A.verdictCards = function (r, a) {
    const cards = [];
    {
      const st = a.relFail.length ? 'bad' : a.relWeak.length ? 'warn' : 'good';
      const [lo, hi] = A.range(a.multi.map(j => r.quality[j].alphaStd));
      cards.push({ st, title: 'Độ tin cậy',
        text: st === 'good' ? `Cả ${a.multi.length} thang đo đạt. α từ ${f3(lo)} đến ${f3(hi)}.`
          : a.relFail.length ? `Chưa đạt: ${a.relFail.join(', ')}.` + (a.rhoAOdd.length ? ` rho_A > 1 (bất thường) ở ${a.rhoAOdd.join(', ')}.` : '')
          : (a.relLow.length ? `Từ 0,6 đến 0,7 (chỉ chấp nhận trong nghiên cứu khám phá): ${a.relLow.join(', ')}. ` : '') +
            (a.relHigh.length ? `Trên 0,95 (câu hỏi có thể trùng ý): ${a.relHigh.join(', ')}.` : ''),
        crit: "Cronbach's α, rho_A và CR từ 0,7 đến 0,95" });
    }
    {
      const st = a.aveFail.length || a.veryLow.length ? 'bad' : a.lowLoad.length ? 'warn' : 'good';
      cards.push({ st, title: 'Giá trị hội tụ',
        text: a.aveFail.length ? `AVE chưa đạt: ${a.aveFail.join(', ')}.` + (a.lowLoad.length ? ` ${a.lowLoad.length} biến có loading < 0,708.` : '')
          : a.lowLoad.length ? `AVE đều đạt. ${a.lowLoad.length} biến có loading < 0,708: ${a.lowLoad.map(o => o.it).join(', ')}.`
          : 'AVE và mọi outer loading đều đạt.',
        crit: 'AVE ≥ 0,5; loading ≥ 0,708' });
    }
    if (r.blocks.length > 1) {
      const has = Number.isFinite(a.htmtMax), up = A.htmtUpper();
      const st = a.htmtMax >= 0.9 || (up && up.h95 >= 0.9) ? 'bad' : (a.htmtMax >= 0.85 || (up && up.h95 >= 0.85) || a.flFail.length) ? 'warn' : 'good';
      cards.push({ st, title: 'Giá trị phân biệt',
        text: (has ? `HTMT lớn nhất ${f3(a.htmtMax)} (${a.htmtPair}).` : 'Không tính được HTMT.') +
          (up ? ` Cận trên CI 95% lớn nhất ${f3(up.h95)} (${up.key}).` : '') +
          (a.flFail.length ? ` Fornell-Larcker chưa đạt ở ${a.flFail.join(', ')}.` : ' Fornell-Larcker đạt.') +
          (a.single.length ? ` Thang đo một biến (${a.single.join(', ')}) không có HTMT.` : ''),
        crit: 'HTMT < 0,85 (hoặc < 0,90) và Fornell-Larcker đạt' });
    }
    if (r.paths.length) {
      // Đa cộng tuyến xét giữa các biến dự báo trong mô hình cấu trúc (VIF inner)
      const st = A.vif(a.innerVifMax);
      cards.push({ st, title: 'Đa cộng tuyến (inner)',
        text: `VIF inner lớn nhất ${f3(a.innerVifMax)} (${a.innerVifPair}).`, crit: 'VIF < 3 (chấp nhận < 5)' });
      // Ý nghĩa thống kê (Bootstrapping)
      if (P.bootFresh()) {
        const ps = state.boot.result.stats.paths, al = state.boot.result.opts.alpha;
        const ns = ps.filter(x => !(x.p < al));
        cards.push({ st: ns.length ? 'warn' : 'good', title: 'Ý nghĩa hệ số β',
          text: ns.length ? `${ps.length - ns.length}/${ps.length} quan hệ có ý nghĩa. Không có ý nghĩa: ${ns.map(x => x.key).join(', ')}.`
            : `Cả ${ps.length} quan hệ đều có ý nghĩa thống kê.`,
          crit: `Bootstrapping ${state.boot.result.done} mẫu, p < ${al}` });
      } else {
        cards.push({ st: 'idle', title: 'Ý nghĩa hệ số β', text: 'Chưa chạy Bootstrapping nên chưa có p-value.', crit: 'Bấm nút “Bootstrapping”' });
      }
    }
    return `<div class="verdicts">` + cards.map(c =>
      `<div class="verdict ${c.st}"><h4>${ICON[c.st]}${c.title}</h4><p>${esc(normDec(c.text))}</p><div class="crit">Tiêu chí: ${normDec(c.crit)}</div></div>`).join('') + `</div>`;
  };

  // ---------- Đoạn văn mô tả kết quả ----------
  A.writeUp = function (r, a) {
    const B = r.blocks, out = [];
    const lmin = a.items.reduce((m, o) => o.l < m.l ? o : m), lmax = a.items.reduce((m, o) => o.l > m.l ? o : m);
    let p1 = `Kết quả đánh giá mô hình đo lường với ${r.n} quan sát cho thấy hệ số tải ngoài (outer loading) của các biến quan sát dao động từ ${f3(lmin.l)} (${lmin.it}) đến ${f3(lmax.l)} (${lmax.it}).`;
    p1 += a.lowLoad.length
      ? ` Có ${a.lowLoad.length} biến có hệ số tải nhỏ hơn 0,708 (${a.lowLoad.map(o => `${o.it} = ${f3(o.l)}`).join('; ')}), cần cân nhắc loại bỏ nếu việc loại giúp cải thiện CR và AVE (Hair và cộng sự, 2019).`
      : ' Tất cả đều lớn hơn ngưỡng 0,708 (Hair và cộng sự, 2019).';
    out.push(p1);
    if (a.multi.length) {
      const [alo, ahi] = A.range(a.multi.map(j => r.quality[j].alphaStd));
      const [rlo, rhi] = A.range(a.multi.map(j => r.quality[j].rhoA));
      const [clo, chi] = A.range(a.multi.map(j => r.quality[j].rhoC));
      let p2 = `Hệ số Cronbach's Alpha của các thang đo nằm trong khoảng ${f3(alo)} đến ${f3(ahi)}, hệ số rho_A từ ${f3(rlo)} đến ${f3(rhi)}, độ tin cậy tổng hợp (CR) từ ${f3(clo)} đến ${f3(chi)}`;
      if (a.relFail.length) p2 += `; thang đo ${a.relFail.join(', ')} chưa đạt độ tin cậy (dưới 0,6${a.rhoAOdd.length ? `; rho_A > 1 ở ${a.rhoAOdd.join(', ')} là bất thường` : ''}).`;
      else if (a.relWeak.length) {
        p2 += a.relLow.length ? `; thang đo ${a.relLow.join(', ')} có hệ số từ 0,6 đến 0,7, chỉ chấp nhận được trong nghiên cứu khám phá` : ', đều lớn hơn 0,7';
        p2 += a.relHigh.length ? `; thang đo ${a.relHigh.join(', ')} có giá trị trên 0,95, cần xem lại các câu hỏi có trùng lặp ý hay không (Hair và cộng sự, 2019).` : ' (Hair và cộng sự, 2019).';
      } else p2 += ', đều từ 0,7 đến 0,95, cho thấy các thang đo đạt độ tin cậy (Hair và cộng sự, 2019).';
      const [vlo, vhi] = A.range(B.map((b, j) => r.quality[j].ave));
      p2 += ` Phương sai trung bình được trích (AVE) đạt từ ${f3(vlo)} đến ${f3(vhi)}`;
      p2 += a.aveFail.length ? `; thang đo ${a.aveFail.join(', ')} có AVE nhỏ hơn 0,5 nên chưa đạt giá trị hội tụ.` : ', đều lớn hơn 0,5, nên các thang đo đạt giá trị hội tụ (Fornell & Larcker, 1981).';
      out.push(p2);
    }
    if (B.length > 1) {
      // Kết luận chỉ "được đảm bảo" khi HTMT đạt VÀ Fornell-Larcker đạt
      const [hlo, hhi] = A.range(a.htmtVals);
      const has = a.htmtVals.length > 0;
      const up = A.htmtUpper();
      const htmtOk = has && hhi < 0.9 && !(up && up.h95 >= 0.9), fl = !a.flFail.length;
      let p3 = 'Về giá trị phân biệt, ';
      if (has) {
        p3 += `các giá trị HTMT nằm trong khoảng ${f3(hlo)} đến ${f3(hhi)}`;
        p3 += hhi < 0.85 ? ', đều nhỏ hơn 0,85 (Henseler và cộng sự, 2015)'
          : hhi < 0.9 ? `, đều nhỏ hơn 0,9; riêng cặp ${a.htmtPair} vượt 0,85, chỉ chấp nhận được nếu hai khái niệm này gần nhau về nội dung (Henseler và cộng sự, 2015)`
          : `; cặp ${a.htmtPair} vượt ngưỡng 0,9 (Henseler và cộng sự, 2015)`;
        if (a.single.length) p3 += ` (thang đo một biến ${a.single.join(', ')} không tính HTMT)`;
      } else p3 += 'không tính được HTMT vì các thang đo chỉ có một biến';
      p3 += fl ? '. Theo tiêu chí Fornell-Larcker, căn bậc hai AVE của mỗi thang đo lớn hơn tương quan với các thang đo khác'
        : `. Theo tiêu chí Fornell-Larcker, cặp ${a.flFail.join(', ')} chưa đạt`;
      if (up) {
        p3 += `. Cận trên khoảng tin cậy 95% (một phía) của HTMT lớn nhất là ${f3(up.h95)} (${up.key})` +
          (up.h95 < 0.85 ? ', nhỏ hơn 0,85' : up.h95 < 0.9 ? ', nhỏ hơn 0,9' : ', vượt 0,9');
      }
      p3 += htmtOk && fl ? '. Vì vậy giá trị phân biệt được đảm bảo.'
        : htmtOk ? '. Vì vậy giá trị phân biệt chưa được đảm bảo đầy đủ; cần xem lại các cặp chưa đạt Fornell-Larcker.'
        : has ? '. Vì vậy giá trị phân biệt chưa được đảm bảo.' : '.';
      out.push(p3);
    }
    if (r.paths.length) {
      out.push(`Hệ số phóng đại phương sai (VIF) giữa các biến dự báo trong mô hình cấu trúc lớn nhất là ${f3(a.innerVifMax)}` +
        (a.innerVifMax < 3 ? ', nhỏ hơn 3, nên không có hiện tượng đa cộng tuyến (Hair và cộng sự, 2019).' : a.innerVifMax < 5 ? ', nhỏ hơn 5, nên đa cộng tuyến không nghiêm trọng.' : ', vượt 5, cần xem lại đa cộng tuyến.'));
      const parts = [];
      r.structural.forEach((s, j) => { if (s) parts.push(`${B[j].name} có R² = ${f3(s.r2)}`); });
      let p5 = `Trong mô hình cấu trúc, ${parts.join('; ')}.`;
      if (P.bootFresh()) {
        const res = state.boot.result, al = res.opts.alpha;
        const sig = res.stats.paths.filter(x => x.p < al), ns = res.stats.paths.filter(x => !(x.p < al));
        p5 += ` Kết quả Bootstrapping với ${res.done} mẫu (kiểm định ${res.opts.tails === 1 ? 'một phía có hướng' : 'hai phía'}) cho thấy ` +
          (sig.length ? `các quan hệ ${sig.map(x => `${x.key} (β = ${f3(x.O)}, t = ${f3(x.t)}, ${x.p < 0.001 ? 'p < 0,001' : 'p = ' + f3(x.p)})`).join('; ')} có ý nghĩa thống kê ở mức ${al}` : 'không quan hệ nào có ý nghĩa thống kê') +
          (ns.length ? `; quan hệ ${ns.map(x => `${x.key} (β = ${f3(x.O)}, p = ${f3(x.p)})`).join('; ')} không có ý nghĩa thống kê.` : '.');
      } else p5 += ' Để kết luận ý nghĩa thống kê của các hệ số β cần chạy Bootstrapping.';
      out.push(p5);
    }
    return out.map(normDec);
  };
})(window.PTSL);
