/*
 * model/image-import.js — Dựng mô hình từ kết quả phân tích ảnh + chữ đọc được (OCR):
 *   - đặt tên thang đo (theo chữ dưới / trong hình tròn và theo tiền tố của các biến nối với nó)
 *   - ghép hộp biến với tên biến trong file dữ liệu (so khớp gần đúng, chịu được lỗi OCR như 5/S, 1/I, 0/O)
 *   - phía đặt biến quan sát và vị trí thang đo trên khung vẽ (giữ bố cục như ảnh)
 * Hàm thuần, không đụng tới giao diện: dùng được trong trình duyệt (PTSL.imageImport) và Node (kiểm thử).
 */
(function (global) {
  'use strict';

  // ---------- So khớp chữ gần đúng ----------
  const GROUPS = ['S5', 'O0DQ', 'I1LT|J!', 'B8', 'Z2', 'G6', 'A4', 'E3', 'T7', 'UV', 'MN', 'CG'];
  const confusable = (a, b) => GROUPS.some(g => g.includes(a) && g.includes(b));
  // Khoảng cách Levenshtein có trọng số (không phân biệt hoa thường; nhầm lẫn OCR quen thuộc chỉ tốn 0,35)
  function wlev(s, t) {
    s = String(s).toUpperCase(); t = String(t).toUpperCase();
    const m = s.length, n = t.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        const a = s[i - 1], b = t[j - 1];
        const sub = a === b ? 0 : confusable(a, b) ? 0.35 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub);
      }
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }
  // Chi phí chuẩn hóa 0..1 (0 = khớp hoàn toàn)
  const cost = (txt, cand) => {
    txt = String(txt || '').replace(/[^0-9A-Za-zÀ-ỹ_]/g, '');
    if (!txt) return 1;
    return Math.min(1, wlev(txt, cand) / Math.max(txt.length, cand.length));
  };

  // Độ rộng chữ ước lượng theo font Arial (đơn vị: chiều cao chữ in hoa = 1).
  // Dùng để phân biệt "BA5" (3 ký tự) với "BAtt2" (5 ký tự) khi chữ trong ảnh quá nhỏ để OCR đọc đúng.
  const AW = {};
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => { AW[c] = [667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611][i]; });
  'abcdefghijklmnopqrstuvwxyz'.split('').forEach((c, i) => { AW[c] = [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500][i]; });
  const textW = t => String(t).split('').reduce((s, c) => s + (AW[c] || (/\d/.test(c) ? 556 : 556)), 0) / 716;

  // Gán tối ưu (thuật toán Hungary) cho ma trận chi phí n×m (n ≤ m): trả về cột cho từng hàng
  function hungarian(C) {
    const n = C.length, m = C[0] ? C[0].length : 0;
    if (!n || !m) return [];
    const N = Math.max(n, m), INF = 1e18;
    const a = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i < n && j < m ? C[i][j] : 0)));
    const u = new Array(N + 1).fill(0), v = new Array(N + 1).fill(0), p = new Array(N + 1).fill(0), way = new Array(N + 1).fill(0);
    for (let i = 1; i <= N; i++) {
      p[0] = i; let j0 = 0;
      const minv = new Array(N + 1).fill(INF), used = new Array(N + 1).fill(false);
      do {
        used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
        for (let j = 1; j <= N; j++) if (!used[j]) {
          const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= N; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const res = new Array(n).fill(-1);
    for (let j = 1; j <= N; j++) if (p[j] && p[j] <= n && j <= m) res[p[j] - 1] = j - 1;
    return res;
  }

  /**
   * build(an, ocr, ctx) -> proposal
   *  an:  kết quả imageAnalysis.analyze
   *  ocr: { box: [chữ trong từng hộp], below: [chữ dưới từng hình tròn], inner: [chữ trong hình tròn] } (có thể rỗng)
   *  ctx: { headers: [biến số], prefixOf(name), blocks: [{name, items}] (mô hình đang có) }
   * proposal: { cons: [{ cid, name, items, side, x, y, conf }], paths: [{ from, to, on, sure }], warnings: [] }
   */
  function build(an, ocr, ctx) {
    ocr = ocr || {};
    const boxText = ocr.box || [], below = ocr.below || [], inner = ocr.inner || [];
    const headers = ctx.headers || [];
    // Tên thang đo ứng viên -> danh sách biến: theo mô hình đang khai báo, rồi theo tiền tố tên biến
    const cand = new Map();
    (ctx.blocks || []).forEach(b => { if (b.name && b.items.length) cand.set(b.name, b.items.filter(i => headers.includes(i))); });
    headers.forEach(h => {
      const p = ctx.prefixOf(h); if (!p) return;
      if (!cand.has(p)) cand.set(p, []);
      const L = cand.get(p); if (!(ctx.blocks || []).some(b => b.name === p) && !L.includes(h)) L.push(h);
    });
    const names = [...cand.keys()].filter(k => cand.get(k).length);

    const boxesOf = an.circles.map(c => an.boxes.filter(b => b.circle === c.id));
    // Hệ số quy đổi độ rộng chữ: trung vị (độ rộng mực / độ rộng dự đoán) theo biến khớp OCR tốt nhất
    const ratios = [];
    an.boxes.forEach(b => {
      const t = boxText[b.id]; if (!t || !b.inkW || !b.inkH) return;
      let best = null; headers.forEach(h => { const c = cost(t, h); if (!best || c < best.c) best = { h, c }; });
      if (best && best.c <= 0.34) ratios.push(b.inkW / (textW(best.h) * b.inkH));
    });
    ratios.sort((a, b) => a - b);
    const kW = ratios.length >= 3 ? ratios[Math.floor(ratios.length / 2)] : 0.85;
    // Độ giống giữa một hộp và một tên biến: theo chữ OCR và theo độ dài chữ
    const sim = (b, it) => {
      const t = boxText[b.id];
      const sw = b.inkW && b.inkH ? Math.max(0, 1 - 4 * Math.abs(Math.log(b.inkW / (kW * textW(it) * b.inkH)))) : 0;
      if (!t) return 0.5 * sw;
      return 0.6 * Math.max(0, 1 - 1.6 * cost(t, it)) + 0.4 * sw;
    };
    // Điểm cho từng (hình tròn, tên)
    const scores = an.circles.map((c, ci) => {
      const sc = {};
      names.forEach(nm => {
        let v = 0;
        const items = cand.get(nm);
        boxesOf[ci].forEach(b => { v += Math.max(...items.map(it => sim(b, it))); });
        if (boxesOf[ci].length > items.length) v -= 0.5 * (boxesOf[ci].length - items.length);   // nhiều hộp hơn số biến: khó là thang đo này
        // Nhãn tên dưới hình tròn: theo chữ OCR và theo độ rộng nhãn (phân biệt "BA" với "BAtt")
        const lb = c.label;
        const lw = lb && lb.inkW && lb.inkH ? Math.max(0, 1 - 4 * Math.abs(Math.log(lb.inkW / (kW * textW(nm) * lb.inkH)))) : null;
        const lt = below[ci] ? Math.max(0, 1 - 1.8 * cost(below[ci], nm)) : null;
        if (lt !== null && lw !== null) v += 2 * (0.5 * lt + 0.5 * lw);
        else if (lt !== null) v += 1.5 * lt;
        else if (lw !== null) v += 1 * lw;
        if (inner[ci]) v += 1.5 * Math.max(0, 1 - 1.8 * cost(inner[ci], nm));
        sc[nm] = v;
      });
      return sc;
    });
    // Gán tên tối ưu toàn cục (mỗi tên một thang đo), bỏ cặp quá yếu
    const nameOf = an.circles.map(() => ''), conf = an.circles.map(() => 0);
    if (names.length && an.circles.length) {
      const C = an.circles.map((c, ci) => names.map(nm => -scores[ci][nm]));
      const pick = an.circles.length <= names.length ? hungarian(C)
        : (() => { const T = names.map((nm, j) => an.circles.map((c, ci) => C[ci][j])); const r = hungarian(T); const out = an.circles.map(() => -1); r.forEach((ci, j) => { if (ci >= 0) out[ci] = j; }); return out; })();
      pick.forEach((j, ci) => { if (j >= 0 && scores[ci][names[j]] >= 0.35) { nameOf[ci] = names[j]; conf[ci] = scores[ci][names[j]]; } });
    }

    // Gán biến cho từng thang đo
    const usedItem = new Set(), warnings = [];
    const itemsOf = an.circles.map((c, ci) => {
      const bx = boxesOf[ci];
      if (!bx.length) return [];
      if (nameOf[ci]) {
        const pool = cand.get(nameOf[ci]).filter(i => !usedItem.has(i));
        let chosen;
        if (bx.length >= pool.length) chosen = pool.slice();                // ảnh có đủ (hoặc nhiều hơn) số biến
        else {
          // ghép hộp ↔ biến theo chi phí nhỏ nhất (tham lam), mỗi biến một lần
          const cs = [];
          bx.forEach(b => pool.forEach(it => cs.push({ b: b.id, it, c: -sim(b, it) + 1e-6 * pool.indexOf(it) })));
          cs.sort((a, b) => a.c - b.c);
          const doneB = new Set(), doneI = new Set(); chosen = [];
          cs.forEach(x => { if (!doneB.has(x.b) && !doneI.has(x.it)) { doneB.add(x.b); doneI.add(x.it); chosen.push(x.it); } });
          if (bx.some(b => !boxText[b.id])) warnings.push(`Thang đo ${nameOf[ci]}: chưa đọc được chữ của một số hộp biến; hãy kiểm tra danh sách biến.`);
        }
        if (bx.length > pool.length) warnings.push(`Thang đo ${nameOf[ci]}: ảnh có ${bx.length} hộp biến nhưng dữ liệu chỉ có ${pool.length} biến.`);
        chosen.forEach(i => usedItem.add(i));
        return headers.filter(h => chosen.includes(h));                     // giữ thứ tự cột trong file
      }
      // Chưa biết tên: lấy biến khớp tốt nhất cho từng hộp (nếu đủ chắc)
      const out = [];
      bx.forEach(b => {
        const t = boxText[b.id]; if (!t) return;
        let best = null;
        headers.forEach(h => { if (usedItem.has(h)) return; const c = cost(t, h); if (!best || c < best.c) best = { h, c }; });
        if (best && best.c <= 0.34) { out.push(best.h); usedItem.add(best.h); }
      });
      return headers.filter(h => out.includes(h));
    });

    // Phía đặt biến: theo vị trí trung bình của các hộp so với hình tròn
    const sideOf = an.circles.map((c, ci) => {
      const bx = boxesOf[ci]; if (!bx.length) return 'left';
      const dx = bx.reduce((s, b) => s + b.cx - c.x, 0) / bx.length, dy = bx.reduce((s, b) => s + b.cy - c.y, 0) / bx.length;
      return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'top' : 'bottom');
    });

    const cons = an.circles.map((c, ci) => ({ cid: c.id, name: nameOf[ci], items: itemsOf[ci], side: sideOf[ci], x: c.x, y: c.y, nBoxes: boxesOf[ci].length, conf: conf[ci] }));
    const paths = an.paths.map(p => ({ from: p.from, to: p.to, on: true, sure: p.sure }));
    if (an.paths.some(p => !p.sure)) warnings.push('Có quan hệ chưa xác định chắc chiều mũi tên (đánh dấu ⚠); hãy kiểm tra.');
    return { cons, paths, warnings, candidates: names, cand };
  }

  /**
   * layout(cons, an, dims) -> { tên: { x, y, side } } theo tọa độ trên khung vẽ
   * Phóng ảnh sao cho hộp biến trong ảnh ≈ hộp biến trên khung vẽ, rồi nới ra nếu hai thang đo chồng nhau.
   */
  function layout(cons, an, dims) {
    const named = cons.filter(c => c.name);
    if (!named.length) return {};
    const bw = an.boxes.map(b => b.w).sort((a, b) => a - b);
    let s = bw.length ? dims.RW / bw[Math.floor(bw.length / 2)] : 2 * dims.EX / (2 * (an.circles[0].rx || 20) * 1.6);
    s = Math.max(1, Math.min(4, s));
    // Nới khoảng cách: hai thang đo phải cách nhau đủ theo ít nhất một trục
    for (let it = 0; it < 20; it++) {
      let need = 1;
      for (let i = 0; i < named.length; i++) for (let j = i + 1; j < named.length; j++) {
        const dx = Math.abs(named[i].x - named[j].x) * s, dy = Math.abs(named[i].y - named[j].y) * s;
        const okX = dx >= 2 * dims.EX + 24, okY = dy >= 2 * dims.EY + 24;
        if (!okX && !okY) need = Math.max(need, Math.min(dx > 0 ? (2 * dims.EX + 24) / dx : 9, dy > 0 ? (2 * dims.EY + 24) / dy : 9));
      }
      if (need <= 1.0001) break;
      s *= Math.min(need, 1.5);
    }
    const out = {};
    named.forEach(c => { out[c.name] = { x: Math.round(c.x * s), y: Math.round(c.y * s), side: c.side }; });
    return out;
  }

  const api = { build, layout, wlev, cost };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.PTSL = global.PTSL || {}).imageImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
