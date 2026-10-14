/*
 * analysis/tables.js — Dựng các bảng kết quả cho từng độ đo
 * (Tổng quan, Outer loading, Độ tin cậy & AVE, Cronbach's α chi tiết, VIF, Giá trị phân biệt,
 *  Cross loading, Mô hình cấu trúc, Thống kê mô tả, So sánh độ nhạy khi loại dòng).
 * Mỗi bảng: { key, title, html?, sections: [{ title, head, rows: [[{v, cls}]], note }] }
 */
(function (P) {
  'use strict';
  const { esc, f3, toNumber, C } = P.util;
  const A = P.assess;
  const state = P.state;

  P.buildTables = function (r) {
    const B = r.blocks, names = B.map(b => b.name);
    const a = A.summary(r);
    const T = [];

    // Tổng quan
    {
      const rows = B.map((b, j) => {
        const q = r.quality[j], [lo, hi] = A.range(r.loadings[j]);
        return [C(b.name), C(b.items.length), C(lo, A.loading(lo)), C(hi, A.loading(hi)),
          C(q.alphaStd, A.rel(q.alphaStd)), C(q.rhoA, A.rhoA(q.rhoA)), C(q.rhoC, A.rel(q.rhoC)), C(q.ave, A.ave(q.ave))];
      });
      const svg = P.canvas ? P.canvas.staticSVG(r, f3, P.bootPvals ? P.bootPvals() : null) : P.diagram.draw(r, f3);
      T.push({ key: 'overview', title: 'Tổng quan', html: A.verdictCards(r, a), sections: [
        { title: 'Sơ đồ mô hình', figure: svg },
        { title: 'Tóm tắt theo thang đo', head: ['Thang đo', 'Số biến', 'Loading nhỏ nhất', 'Loading lớn nhất', "Cronbach's α", 'rho_A', 'CR', 'AVE'], rows,
          note: "Cronbach's α ở đây là α chuẩn hóa, giống SmartPLS. α tính trên dữ liệu gốc (giống SPSS) có ở mục Độ tin cậy & AVE." },
        { title: 'Đoạn văn mô tả kết quả', prose: A.writeUp(r, a),
          note: 'Đoạn văn được tạo tự động theo số liệu. Hãy đọc lại và chỉnh câu chữ trước khi đưa vào luận văn.' }
      ] });
    }

    // Outer loading
    {
      const rows = [];
      B.forEach((b, j) => b.items.forEach((it, k) => {
        const row = [C(it)];
        B.forEach((_, q) => row.push(q === j ? C(r.loadings[j][k], A.loading(r.loadings[j][k])) : C(null, 'dim')));
        row.removable = it;
        rows.push(row);
      }));
      T.push({ key: 'loading', title: 'Outer loadings', sections: [{
        title: 'Hệ số tải ngoài', head: ['Biến quan sát', ...names], rows,
        note: a.lowLoad.length ? `Biến có loading < 0,708: <b>${a.lowLoad.map(o => `${esc(o.it)} (${f3(o.l)})`).join(', ')}</b>. Bấm × cạnh tên biến để loại khỏi mô hình và tính lại.`
          : 'Mọi outer loading đều ≥ 0,708. Bấm × cạnh tên biến nếu muốn thử loại biến đó.'
      }] });
    }

    // Độ tin cậy & AVE
    {
      const rows = B.map((b, j) => {
        const q = r.quality[j];
        return [C(b.name), C(b.items.length), C(q.alphaStd, A.rel(q.alphaStd)), C(q.alpha, A.rel(q.alpha)),
          C(q.rhoA, A.rhoA(q.rhoA)), C(q.rhoC, A.rel(q.rhoC)), C(q.ave, A.ave(q.ave))];
      });
      T.push({ key: 'reliab', title: 'Độ tin cậy & AVE', sections: [{
        title: 'Độ tin cậy và giá trị hội tụ', head: ['Thang đo', 'Số biến', "Cronbach's α (chuẩn hóa, như SmartPLS)", 'α dữ liệu gốc (như SPSS)', 'rho_A', 'CR (rho_c)', 'AVE'], rows,
        note: "<b>Cronbach's α (chuẩn hóa)</b> tính trên dữ liệu chuẩn hóa, giống SmartPLS; trang dùng giá trị này để đánh giá, cùng với rho_A và CR. <b>α dữ liệu gốc</b> trùng với SPSS, để đối chiếu. " +
          "Ngưỡng α, rho_A, CR: 0,7–0,95 (0,6–0,7 chấp nhận trong nghiên cứu khám phá); > 0,95 (ô vàng) là dấu hiệu các câu hỏi trùng ý. rho_A > 1 là bất thường (ô đỏ). AVE ≥ 0,5 (Hair và cộng sự, 2019)."
      }] });
    }

    // Cronbach's α chi tiết
    {
      const secs = B.filter(b => b.items.length >= 2).map(b => {
        const j = B.indexOf(b), q = r.quality[j];
        return {
          title: `${b.name}: Cronbach's α = ${f3(q.alpha)}, ${b.items.length} biến`,
          head: ['Biến quan sát', 'Trung bình', 'Độ lệch chuẩn', 'Tương quan biến-tổng', 'α nếu loại biến'],
          rows: b.items.map((it, k) => {
            const d = r.prepared.data[it], st = q.itemStats[k];
            return [C(it), C(P.stats.mean(d)), C(P.stats.sd(d)), C(st.citc, st.citc >= 0.3 ? 'good' : 'bad'),
              C(st.alphaIfDeleted, st.alphaIfDeleted > q.alpha ? 'warn' : '')];
          })
        };
      });
      if (secs.length) {
        secs[secs.length - 1].note = 'Tương quan biến-tổng hiệu chỉnh nên ≥ 0,3. Ô vàng ở cột “α nếu loại biến”: loại biến đó thì α tăng.';
        T.push({ key: 'alpha', title: "Cronbach's α chi tiết", sections: secs });
      }
    }

    // VIF outer (tham khảo)
    {
      const rows = [];
      B.forEach((b, j) => b.items.forEach((it, k) => rows.push([C(it), C(b.name), C(r.outerVIF[j][k], A.vif(r.outerVIF[j][k]))])));
      T.push({ key: 'ovif', title: 'VIF (outer)', sections: [{
        title: 'VIF của biến quan sát (outer)', head: ['Biến quan sát', 'Thang đo', 'VIF'], rows,
        note: 'Với thang đo phản ánh (reflective), các câu cùng thang đo được kỳ vọng tương quan cao nên VIF outer chỉ để tham khảo; VIF dùng cho thang đo cấu tạo (formative) và mô hình cấu trúc (inner).'
      }] });
    }

    // Giá trị phân biệt
    if (B.length > 1) {
      const fl = names.map((nm, i) => [C(nm), ...names.map((_, j) => {
        if (j > i) return C(null, 'dim');
        if (i === j) return C(r.fornell[i][i], 'diag');
        const bad = Math.abs(r.fornell[i][j]) >= Math.min(r.fornell[i][i], r.fornell[j][j]);
        return C(r.fornell[i][j], bad ? 'bad' : '');
      })]);
      const ht = names.map((nm, i) => [C(nm), ...names.map((_, j) =>
        j >= i ? C(null, 'dim') : Number.isFinite(r.htmt[i][j]) ? C(r.htmt[i][j], A.htmt(r.htmt[i][j])) : C('—', 'dim'))]);
      const singles = B.filter(b => b.items.length === 1).map(b => b.name);
      T.push({ key: 'disc', title: 'Giá trị phân biệt', sections: [
        { title: 'HTMT', head: ['', ...names], rows: ht,
          note: 'HTMT tính trên trị tuyệt đối của các hệ số tương quan, giống SmartPLS. Xanh: < 0,85. Vàng: 0,85–0,90, chấp nhận khi hai khái niệm gần nhau. Đỏ: ≥ 0,90, không đạt. Khoảng tin cậy của HTMT có ở mục Bootstrapping.' +
            (singles.length ? ` “—”: thang đo một biến (${esc(singles.join(', '))}) không có tương quan nội bộ nên không tính HTMT.` : '') },
        { title: 'Fornell-Larcker', head: ['', ...names], rows: fl,
          note: 'Đường chéo là √AVE. Ô đỏ: tương quan ≥ √AVE, vi phạm giá trị phân biệt.' }
      ] });
    }

    // Cross loading
    {
      const rows = r.cross.map(c => {
        const own = c.values[c.block];
        return [C(c.item), ...c.values.map((v, q) => q === c.block ? C(v, 'diag') : C(v, Math.abs(v) >= Math.abs(own) ? 'bad' : ''))];
      });
      T.push({ key: 'cross', title: 'Cross loadings', sections: [{ title: 'Hệ số tải chéo', head: ['Biến quan sát', ...names], rows,
        note: 'Hệ số tải lên thang đo của chính nó (tô xanh) phải lớn hơn hệ số tải lên các thang đo khác.' }] });
    }

    // Mô hình cấu trúc
    if (r.paths.length) {
      const pathRows = [], r2Rows = [], vifRows = [];
      r.structural.forEach((s, j) => {
        if (!s) return;
        r2Rows.push([C(names[j]), C(s.r2), C(s.r2adj)]);
        s.predictors.forEach((p, k) => {
          const f = s.f2[k];
          pathRows.push([C(`${names[p]} → ${names[j]}`), C(s.beta[k]), C(f, f >= 0.02 ? 'good' : 'warn'),
            C(f >= 0.35 ? 'Lớn' : f >= 0.15 ? 'Trung bình' : f >= 0.02 ? 'Nhỏ' : 'Không đáng kể')]);
          vifRows.push([C(`${names[p]} → ${names[j]}`), C(s.vif[k], A.vif(s.vif[k]))]);
        });
      });
      T.push({ key: 'struct', title: 'Mô hình cấu trúc', sections: [
        { title: 'Hệ số đường dẫn và f²', head: ['Quan hệ', 'Hệ số β', 'f²', 'Mức tác động'], rows: pathRows },
        { title: 'R²', head: ['Biến phụ thuộc', 'R²', 'R² hiệu chỉnh'], rows: r2Rows },
        { title: 'VIF giữa các thang đo (inner)', head: ['Quan hệ', 'VIF'], rows: vifRows,
          note: 'Giá trị t, p-value và khoảng tin cậy của β: bấm nút “Bootstrapping”.' }
      ] });
    }

    // Path coefficients (giống báo cáo PLS-SEM algorithm của SmartPLS): ma trận, danh sách,
    // tác động gián tiếp cụ thể, tổng tác động gián tiếp, tổng tác động (ước lượng điểm, chưa có p-value)
    if (r.paths.length && P.bootstrap) {
      const routes = P.bootstrap.indirectRoutes(names, r.paths);
      const ex = P.bootstrap.extract(r, routes);
      const matrix = obj => names.map(row => [C(row), ...names.map(col => {
        const v = obj[`${row} → ${col}`];
        return v === undefined ? C(null, 'dim') : C(v);
      })]);
      const list = obj => Object.entries(obj).map(([k, v]) => [C(k), C(v)]);
      const pNote = 'Giá trị t, p-value và khoảng tin cậy: bấm nút “Bootstrapping”.';
      T.push({ key: 'pathc', title: 'Path coefficients', sections: [
        { title: 'Path coefficients: ma trận', head: ['', ...names], rows: matrix(ex.paths),
          note: 'Đọc theo hàng → cột: hàng là thang đo nguyên nhân, cột là thang đo kết quả (giống SmartPLS).' },
        { title: 'Path coefficients: danh sách', head: ['Quan hệ', 'Path coefficient (β)'], rows: list(ex.paths), note: pNote },
        { title: 'Tác động gián tiếp cụ thể (specific indirect effects)', head: ['Đường gián tiếp', 'Hệ số'], rows: list(ex.indirect),
          empty: 'Mô hình không có đường gián tiếp (cần ít nhất một thang đo trung gian).',
          note: 'Tác động gián tiếp = tích các hệ số β trên đường đi.' },
        { title: 'Tổng tác động gián tiếp (total indirect effects)', head: ['', ...names], rows: matrix(ex.totalIndirect),
          empty: 'Mô hình không có đường gián tiếp.' },
        { title: 'Tổng tác động (total effects)', head: ['', ...names], rows: matrix(ex.total),
          note: 'Tổng tác động = tác động trực tiếp + tổng tác động gián tiếp. ' + pNote }
      ] });
      // Ma trận gián tiếp rỗng thì để trống bảng
      const ti = T[T.length - 1].sections[3];
      if (!Object.keys(ex.totalIndirect).length) ti.rows = [];
    }

    // Thống kê mô tả
    {
      const rows = B.flatMap(b => b.items.map(it => {
        const ci = state.headers.indexOf(it);
        const d = P.stats.describe(P.includedIdx().map(i => toNumber(state.rows[i][ci])));
        return [C(it), C(b.name), C(d.n), C(d.missing, d.missing ? 'warn' : ''), C(d.min), C(d.max), C(d.mean), C(d.sd), C(d.skew), C(d.kurt)];
      }));
      T.push({ key: 'desc', title: 'Thống kê mô tả', sections: [{
        title: 'Thống kê mô tả biến quan sát', head: ['Biến', 'Thang đo', 'N', 'Thiếu', 'Min', 'Max', 'Trung bình', 'Độ lệch chuẩn', 'Skewness', 'Kurtosis'], rows,
        note: `Tổng số dòng: ${r.prepared.n0}. Số ô trống trong các biến được dùng: ${r.prepared.nMissing}.`
      }] });
    }

    // So sánh trước/sau khi loại dòng (phân tích độ nhạy)
    if (state.excluded.size && state.baseline) {
      const cur = P.rowcheck.summarize(r), base = state.baseline, rows = [];
      const diff = (x, y) => { const d = y - x; return C((d >= 0 ? '+' : '') + f3(d), Math.abs(d) >= 0.01 ? 'warn' : ''); };
      for (const [nm, m] of Object.entries(base.blocks)) {
        const c = cur.blocks[nm];
        if (Number.isFinite(m.alpha)) rows.push([C(`α ${nm}`), C(m.alpha), C(c.alpha), diff(m.alpha, c.alpha)]);
        if (Number.isFinite(m.rhoC)) rows.push([C(`CR ${nm}`), C(m.rhoC), C(c.rhoC), diff(m.rhoC, c.rhoC)]);
        rows.push([C(`AVE ${nm}`), C(m.ave), C(c.ave), diff(m.ave, c.ave)]);
        if (m.r2 !== undefined && c.r2 !== undefined) rows.push([C(`R² ${nm}`), C(m.r2), C(c.r2), diff(m.r2, c.r2)]);
      }
      for (const [pk, b] of Object.entries(base.paths)) if (cur.paths[pk] !== undefined) rows.push([C(`β ${pk}`), C(b), C(cur.paths[pk]), diff(b, cur.paths[pk])]);
      state.sensitivity = { title: 'So sánh trước và sau khi loại dòng (phân tích độ nhạy)',
        head: ['Chỉ số', `Tất cả ${base.n} dòng`, `Còn ${cur.n} dòng`, 'Thay đổi'], rows,
        note: 'Nên báo cáo cả hai cột trong luận văn, kèm tiêu chí đã dùng để loại dòng. Ô vàng: thay đổi từ 0,01 trở lên.' };
      T.find(t => t.key === 'overview').sections.splice(2, 0, state.sensitivity);
    } else state.sensitivity = null;

    // Bootstrapping (nếu đã chạy và còn khớp mô hình)
    if (P.bootTables && state.boot && state.boot.sig === P.currentSig()) T.push(P.bootTables(state.boot.result));

    state.tables = T;
  };
})(window.PTSL);
