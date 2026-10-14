/*
 * model/image-analysis.js — Phân tích ảnh sơ đồ mô hình (ảnh chụp SmartPLS) bằng điểm ảnh:
 *   - thang đo: hình tròn / elip màu xanh
 *   - biến quan sát: hộp chữ nhật màu vàng
 *   - quan hệ: đường thẳng nét liền màu tối nối hai thang đo; chiều theo đầu mũi tên
 * Không cần Internet. Phần đọc chữ (OCR) nằm ở model/image-import.js.
 * Dùng được cả trong trình duyệt (PTSL.imageAnalysis) và Node (module.exports) để kiểm thử.
 */
(function (global) {
  'use strict';

  // ---------- Phân loại điểm ảnh ----------
  function masks(data, W, H) {
    const n = W * H, blue = new Uint8Array(n), yellow = new Uint8Array(n), dark = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
      if (a < 128) continue;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (b - r >= 30 && b >= g && b > 140) blue[i] = 1;
      else if (r > 170 && g > 160 && r - b > 40 && g - b > 30) yellow[i] = 1;
      if (lum < 100 || (lum < 165 && mx - mn < 50)) dark[i] = 1;
    }
    return { blue, yellow, dark };
  }

  // Thành phần liên thông (4 hướng) của một mặt nạ
  function components(mask, W, H, minCount) {
    const seen = new Uint8Array(W * H), out = [], stack = new Int32Array(W * H);
    for (let s = 0; s < W * H; s++) {
      if (!mask[s] || seen[s]) continue;
      let top = 0, count = 0, x1 = W, y1 = H, x2 = 0, y2 = 0;
      stack[top++] = s; seen[s] = 1;
      while (top) {
        const i = stack[--top], x = i % W, y = (i - x) / W;
        count++;
        if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
        if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1; }
        if (x < W - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1; }
        if (y > 0 && mask[i - W] && !seen[i - W]) { seen[i - W] = 1; stack[top++] = i - W; }
        if (y < H - 1 && mask[i + W] && !seen[i + W]) { seen[i + W] = 1; stack[top++] = i + W; }
      }
      if (count >= minCount) out.push({ x1, y1, x2, y2, w: x2 - x1 + 1, h: y2 - y1 + 1, count });
    }
    return out;
  }

  // ---------- Hình học ----------
  // Điểm trên biên elip (tâm cx, cy; bán trục rx, ry) theo hướng (dx, dy)
  function edge(c, dx, dy) {
    const s = 1 / Math.sqrt((dx / c.rx) ** 2 + (dy / c.ry) ** 2 || 1);
    return [c.x + dx * s, c.y + dy * s];
  }
  const inside = (c, x, y, pad) => ((x - c.x) / (c.rx + pad)) ** 2 + ((y - c.y) / (c.ry + pad)) ** 2 <= 1;
  const inBox = (b, x, y, pad) => x >= b.x1 - pad && x <= b.x2 + pad && y >= b.y1 - pad && y <= b.y2 + pad;

  function makeDarkAt(dark, W, H) {
    return (x, y) => {
      x = Math.round(x); y = Math.round(y);
      return x >= 0 && y >= 0 && x < W && y < H && dark[y * W + x] === 1;
    };
  }

  // Tỷ lệ điểm trên đoạn thẳng P→Q có nét tối (cho phép lệch ±tol điểm ảnh theo phương vuông góc).
  // Điểm nằm trong thang đo khác bị tính là "không có nét" (để không nối xuyên qua thang đo ở giữa).
  function coverage(at, P, Q, tol, blockers, strict) {
    const dx = Q[0] - P[0], dy = Q[1] - P[1], L = Math.hypot(dx, dy);
    if (L < 4) return { cov: 0, L };
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    let hit = 0, tot = 0;
    for (let t = 0; t <= L; t += 1) {
      const x = P[0] + ux * t, y = P[1] + uy * t;
      tot++;
      if (blockers && blockers.some(f => f(x, y))) { if (strict) return { cov: 0, L }; continue; }
      for (let o = -tol; o <= tol; o++) if (at(x + nx * o, y + ny * o)) { hit++; break; }
    }
    return { cov: hit / tot, L };
  }

  // Độ rộng lớn nhất của vệt tối liền mạch cắt ngang đường thẳng, trong đoạn [d1, d2] điểm ảnh tính từ mút E đi vào trong
  function headWidth(at, E, ux, uy, d1, d2) {
    const nx = -uy, ny = ux;
    let best = 0;
    for (let d = d1; d <= d2; d++) {
      const x = E[0] - ux * d, y = E[1] - uy * d;
      if (!at(x, y) && !at(x + nx, y + ny) && !at(x - nx, y - ny)) continue;
      let w = 1;
      for (let o = 1; o <= 12 && at(x + nx * o, y + ny * o); o++) w++;
      for (let o = 1; o <= 12 && at(x - nx * o, y - ny * o); o++) w++;
      if (w > best) best = w;
    }
    return best;
  }

  /**
   * analyze(imageData) -> { W, H, circles, boxes, paths, links }
   *  circles: [{ id, x, y, rx, ry }]
   *  boxes:   [{ id, x1, y1, x2, y2, cx, cy, circle }]  (circle: chỉ số thang đo nối với hộp)
   *  paths:   [{ a, b, from, to, cov, sure }]           (from/to: chỉ số thang đo)
   */
  function analyze(img) {
    const W = img.width, H = img.height;
    const { blue, yellow, dark } = masks(img.data, W, H);
    const at = makeDarkAt(dark, W, H);

    // Thang đo: thành phần xanh có dạng tròn / elip
    const circles = components(blue, W, H, 120).filter(c => {
      const ar = c.w / c.h, fill = c.count / (c.w * c.h);
      return c.w >= 14 && c.h >= 14 && ar > 0.45 && ar < 2.6 && fill > 0.42 && fill < 0.94;
    }).map((c, id) => ({ id, x: (c.x1 + c.x2) / 2, y: (c.y1 + c.y2) / 2, rx: c.w / 2, ry: c.h / 2, area: c.count }));

    // Biến quan sát: hộp vàng
    const boxes = components(yellow, W, H, 30).filter(c => {
      const ar = c.w / c.h, fill = c.count / (c.w * c.h);
      return c.w >= 12 && c.h >= 7 && ar > 1.1 && ar < 9 && fill > 0.5;
    }).map((c, id) => ({ id, x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, cx: (c.x1 + c.x2) / 2, cy: (c.y1 + c.y2) / 2, w: c.w, h: c.h }));

    // Tên thang đo đặt ngay dưới hình tròn (kiểu SmartPLS 4): tìm dải chữ đầu tiên bên dưới và cụm cột chứa chữ
    circles.forEach(c => {
      const xa = Math.max(0, Math.round(c.x - 2.5 * c.rx)), xb = Math.min(W - 1, Math.round(c.x + 2.5 * c.rx));
      const xn1 = Math.round(c.x - 1.5 * c.rx), xn2 = Math.round(c.x + 1.5 * c.rx);
      const ya = Math.round(c.y + c.ry + 1), yb = Math.min(H - 1, Math.round(c.y + 2.2 * c.ry + 6));
      let band = null, run = null;
      for (let y = ya; y <= yb + 1; y++) {
        let n = 0;
        if (y <= yb) for (let x = Math.max(0, xn1); x <= Math.min(W - 1, xn2); x++) n += dark[y * W + x];
        if (y <= yb && n >= 4) { if (!run) run = [y, y]; else run[1] = y; }
        else if (run) { if (run[1] - run[0] + 1 >= 3) { band = run; break; } run = null; }
      }
      c.label = null;
      if (!band || band[1] - band[0] + 1 > 1.2 * c.ry) return;
      const bh = band[1] - band[0] + 1, gap = Math.max(2, Math.round(0.45 * bh));
      const cols = [];
      for (let x = xa; x <= xb; x++) { let n = 0; for (let y = band[0]; y <= band[1]; y++) n += dark[y * W + x]; cols.push(n > 0); }
      const clusters = []; let cur = null, miss = 0;
      cols.forEach((on, k) => {
        const x = xa + k;
        if (on) { if (cur && miss <= gap) cur[1] = x; else { cur = [x, x]; clusters.push(cur); } miss = 0; }
        else miss++;
      });
      const cx = Math.round(c.x);
      let best = null;
      clusters.forEach(cl => { const d = cx < cl[0] ? cl[0] - cx : cx > cl[1] ? cx - cl[1] : 0; if (!best || d < best.d) best = { cl, d }; });
      if (!best || best.d > c.rx) return;
      c.label = { x1: best.cl[0], y1: band[0], x2: best.cl[1], y2: band[1], inkW: best.cl[1] - best.cl[0] + 1, inkH: bh };
    });

    // Vùng mực (chữ) trong mỗi hộp: dùng để ước lượng độ dài tên biến khi OCR đọc sai
    boxes.forEach(b => {
      let x1 = Infinity, y1 = Infinity, x2 = -1, y2 = -1;
      for (let y = b.y1 + 1; y < b.y2; y++) for (let x = b.x1 + 1; x < b.x2; x++) {
        const p = (y * W + x) * 4, d = img.data;
        if (0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2] < 150) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
      }
      b.inkW = x2 >= 0 ? x2 - x1 + 1 : 0; b.inkH = y2 >= 0 ? y2 - y1 + 1 : 0;
    });

    const otherCircle = (skip) => circles.filter(c => !skip.includes(c.id)).map(c => (x, y) => inside(c, x, y, 1));
    const boxBlock = boxes.map(b => (x, y) => inBox(b, x, y, 0));

    // Hộp vàng thuộc thang đo nào: thang đo có đường nối tới hộp rõ nhất (dự phòng: gần nhất)
    boxes.forEach(b => {
      let best = null;
      const dmin = Math.min(...circles.map(c => Math.hypot(b.cx - c.x, b.cy - c.y)));
      circles.forEach(c => {
        const dx = b.cx - c.x, dy = b.cy - c.y;
        const P = edge(c, dx, dy), Pp = [P[0] + dx / Math.hypot(dx, dy) * 2, P[1] + dy / Math.hypot(dx, dy) * 2];
        // điểm vào hộp: giao của đoạn tâm→tâm với viền hộp
        let t = 1;
        for (let k = 0; k <= 200; k++) { const tt = k / 200; if (inBox(b, c.x + dx * tt, c.y + dy * tt, 1)) { t = tt; break; } }
        const Q = [c.x + dx * t - dx / Math.hypot(dx, dy) * 2, c.y + dy * t - dy / Math.hypot(dx, dy) * 2];
        // đường nối biến không bao giờ xuyên qua thang đo khác (strict); ưu tiên thang đo gần
        const { cov } = coverage(at, Pp, Q, 3, otherCircle([c.id]), true);
        const dist = Math.hypot(dx, dy);
        const score = cov - 0.35 * (dist / dmin - 1);
        if (!best || score > best.score) best = { c: c.id, score, cov, dist };
      });
      b.circle = best ? best.c : -1;
      b.linkCov = best ? best.cov : 0;
    });

    // Quan hệ giữa hai thang đo
    const paths = [];
    for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) {
      const A = circles[i], B = circles[j];
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
      const EA = edge(A, dx, dy), EB = edge(B, -dx, -dy);
      const P = [EA[0] + ux * 2, EA[1] + uy * 2], Q = [EB[0] - ux * 2, EB[1] - uy * 2];
      const blockers = otherCircle([i, j]).concat(boxBlock);
      const { cov, L } = coverage(at, P, Q, 2, blockers);
      if (L < 12 || cov < 0.82) continue;
      // Chiều: đầu mũi tên là vệt tối rộng ngay sát biên thang đo đích.
      // Chỉ xét trong khoảng ~0,42 bán kính tính từ biên để không lẫn với tên thang đo đặt dưới hình tròn.
      const dA = Math.max(6, Math.round(0.42 * Math.min(A.rx, A.ry))), dB = Math.max(6, Math.round(0.42 * Math.min(B.rx, B.ry)));
      const wA = headWidth(at, EA, -ux, -uy, 1, dA), wB = headWidth(at, EB, ux, uy, 1, dB);
      let from = i, to = j, sure = true;
      if (wA >= 4 && wA > wB + 1) { from = j; to = i; }
      else if (!(wB >= 4 && wB > wA + 1)) { sure = false; if (B.x < A.x - 5) { from = j; to = i; } }
      paths.push({ a: i, b: j, from, to, cov: +cov.toFixed(3), wA, wB, sure });
    }
    return { W, H, circles, boxes, paths };
  }

  const api = { analyze, masks, components, coverage, edge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.PTSL = global.PTSL || {}).imageAnalysis = api;
})(typeof window !== 'undefined' ? window : globalThis);
