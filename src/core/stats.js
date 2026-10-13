/*
 * stats.js — Các hàm tính toán cho mô hình đo lường PLS-SEM
 * Outer loadings, Cronbach's Alpha, rho_A, Composite Reliability (rho_c), AVE,
 * VIF (outer & inner), Fornell-Larcker, HTMT, Cross loadings, Path coefficients, R².
 *
 * Thuật toán PLS: Lohmöller / Wold, Mode A (reflective), lược đồ trọng số
 * "path" (nếu có mô hình cấu trúc) hoặc "factor" / "centroid".
 */
(function (global) {
  'use strict';

  // ---------- Đại số tuyến tính cơ bản ----------
  function mean(a) { let s = 0; for (const v of a) s += v; return s / a.length; }
  function variance(a, ddof = 1) {
    const m = mean(a); let s = 0;
    for (const v of a) s += (v - m) * (v - m);
    return s / (a.length - ddof);
  }
  function sd(a, ddof = 1) { return Math.sqrt(variance(a, ddof)); }
  function standardize(a) {
    const m = mean(a), s = sd(a);
    return a.map(v => (s > 0 ? (v - m) / s : 0));
  }
  function cor(a, b) {
    const n = a.length, ma = mean(a), mb = mean(b);
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) {
      const da = a[i] - ma, db = b[i] - mb;
      sab += da * db; saa += da * da; sbb += db * db;
    }
    return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
  }
  function corMatrix(cols) {
    const k = cols.length, R = [];
    for (let i = 0; i < k; i++) { R.push(new Array(k).fill(0)); R[i][i] = 1; }
    for (let i = 0; i < k; i++)
      for (let j = i + 1; j < k; j++) { const r = cor(cols[i], cols[j]); R[i][j] = r; R[j][i] = r; }
    return R;
  }
  // Nghịch đảo ma trận (Gauss-Jordan, pivot từng phần)
  function inverse(M) {
    const n = M.length;
    const A = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) throw new Error('Ma trận suy biến (đa cộng tuyến hoàn hảo)');
      [A[c], A[p]] = [A[p], A[c]];
      const piv = A[c][c];
      for (let j = 0; j < 2 * n; j++) A[c][j] /= piv;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = A[r][c];
        if (f !== 0) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j];
      }
    }
    return A.map(row => row.slice(n));
  }
  function matVec(M, v) { return M.map(row => row.reduce((s, x, j) => s + x * v[j], 0)); }
  function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

  // VIF = phần tử đường chéo của nghịch đảo ma trận tương quan
  function vifFromCols(cols) {
    if (cols.length < 2) return cols.map(() => 1);
    try { const inv = inverse(corMatrix(cols)); return inv.map((row, i) => row[i]); }
    catch (e) { return cols.map(() => Infinity); }
  }

  // Hồi quy chuẩn hóa: hệ số beta và R² của y theo các cột X
  function stdRegression(y, Xcols) {
    if (Xcols.length === 0) return { beta: [], r2: 0 };
    const Rxx = corMatrix(Xcols);
    const rxy = Xcols.map(x => cor(x, y));
    const beta = matVec(inverse(Rxx), rxy);
    return { beta, r2: dot(beta, rxy) };
  }

  // ---------- Cronbach's Alpha ----------
  // Bản gốc (như SPSS) – dựa trên phương sai của dữ liệu thô
  function cronbachAlpha(cols) {
    const k = cols.length;
    if (k < 2) return NaN;
    const n = cols[0].length;
    const total = new Array(n).fill(0);
    let sumVar = 0;
    for (const c of cols) { sumVar += variance(c); for (let i = 0; i < n; i++) total[i] += c[i]; }
    const vt = variance(total);
    return vt > 0 ? (k / (k - 1)) * (1 - sumVar / vt) : NaN;
  }
  // Bản chuẩn hóa (như SmartPLS) – dựa trên tương quan trung bình
  function cronbachAlphaStd(cols) {
    const k = cols.length;
    if (k < 2) return NaN;
    const R = corMatrix(cols);
    let s = 0, m = 0;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { s += R[i][j]; m++; }
    const rbar = s / m;
    return (k * rbar) / (1 + (k - 1) * rbar);
  }
  // Tương quan biến - tổng hiệu chỉnh & Alpha nếu loại biến (như SPSS)
  function itemTotalStats(cols) {
    const k = cols.length, n = cols[0].length;
    return cols.map((c, idx) => {
      const rest = new Array(n).fill(0);
      cols.forEach((o, j) => { if (j !== idx) for (let i = 0; i < n; i++) rest[i] += o[i]; });
      const others = cols.filter((_, j) => j !== idx);
      return {
        citc: k > 1 ? cor(c, rest) : NaN,
        alphaIfDeleted: others.length >= 2 ? cronbachAlpha(others) : NaN
      };
    });
  }

  // ---------- Thuật toán PLS ----------
  /**
   * data: { colName: number[] }   (đã xử lý missing)
   * blocks: [{ name, items: [colName...] }]
   * paths: [[from, to], ...] (tên construct)
   * opts: { scheme: 'path'|'factor', maxIter, tol }  (SmartPLS 4 không còn lược đồ Centroid)
   */
  function plsAlgorithm(data, blocks, paths, opts = {}) {
    const maxIter = opts.maxIter || 3000;   // mặc định SmartPLS 4
    const tol = opts.tol || 1e-7;
    let scheme = opts.scheme === 'factor' ? 'factor' : 'path';

    const J = blocks.length;
    // PLS cần ít nhất 2 thang đo: proxy bên trong của một thang đo được dựng từ các thang đo kề nó
    if (J < 2) throw new Error('Cần ít nhất 2 thang đo để ước lượng PLS-SEM (thuật toán PLS dựng proxy của mỗi thang đo từ các thang đo khác). Hãy khai báo thêm thang đo.');
    const idx = Object.fromEntries(blocks.map((b, i) => [b.name, i]));
    const X = blocks.map(b => b.items.map(it => standardize(data[it])));
    const n = X[0][0].length;

    // Ma trận kề
    const pred = blocks.map(() => []); // pred[j] = các construct dự báo j
    const succ = blocks.map(() => []);
    for (const [f, t] of paths) { pred[idx[t]].push(idx[f]); succ[idx[f]].push(idx[t]); }
    const adj = blocks.map((_, j) => {
      const s = new Set([...pred[j], ...succ[j]]);
      return s;
    });
    // Chưa có mô hình cấu trúc => đánh giá mô hình đo lường: mọi thang đo kề nhau, lược đồ Factor.
    // Có mô hình cấu trúc mà còn thang đo cô lập => báo lỗi, không tự thêm liên kết (sẽ làm đổi mô hình).
    if (!paths.length) {
      if (scheme === 'path') scheme = 'factor';
      for (let j = 0; j < J; j++) for (let i = 0; i < J; i++) if (i !== j) adj[j].add(i);
    } else {
      const iso = blocks.filter((b, j) => adj[j].size === 0).map(b => b.name);
      if (iso.length) throw new Error(`Thang đo ${iso.join(', ')} chưa nối với thang đo nào trong mô hình cấu trúc. Hãy vẽ quan hệ cho thang đo này, hoặc xóa hết quan hệ để chỉ đánh giá mô hình đo lường.`);
    }

    // Trọng số khởi tạo = 1
    let W = X.map(b => b.map(() => 1));
    const scores = () => X.map((b, j) => {
      const y = new Array(n).fill(0);
      b.forEach((x, k) => { for (let i = 0; i < n; i++) y[i] += W[j][k] * x[i]; });
      return y;
    });
    const normalizeW = () => {
      const Y = scores();
      W = W.map((w, j) => {
        const s = sd(Y[j]);
        if (!(s > 0)) throw new Error(`Không ước lượng được trọng số của thang đo ${blocks[j].name} (điểm thang đo không có phương sai).`);
        return w.map(v => v / s);
      });
    };
    normalizeW();

    let iter = 0, converged = false;
    for (; iter < maxIter; iter++) {
      const Y = scores().map(standardize);
      const C = corMatrix(Y);
      // Trọng số bên trong
      const E = blocks.map(() => new Array(J).fill(0));
      for (let j = 0; j < J; j++) {
        if (scheme === 'path' && paths.length) {
          // Tiền tố (predecessor): hệ số hồi quy; hậu tố (successor): tương quan
          if (pred[j].length) {
            const { beta } = stdRegression(Y[j], pred[j].map(i => Y[i]));
            pred[j].forEach((i, k) => { E[j][i] = beta[k]; });
          }
          for (const i of succ[j]) E[j][i] = C[j][i];
          for (const i of adj[j]) if (!pred[j].includes(i) && !succ[j].includes(i)) E[j][i] = C[j][i];
        } else {
          for (const i of adj[j]) E[j][i] = C[j][i];
        }
      }
      // Proxy bên trong
      const Z = blocks.map((_, j) => {
        const z = new Array(n).fill(0);
        for (let i = 0; i < J; i++) if (E[j][i] !== 0) for (let r = 0; r < n; r++) z[r] += E[j][i] * Y[i][r];
        return standardize(z);
      });
      // Mode A: trọng số ngoài = tương quan chỉ báo với proxy
      const Wold = W;
      W = X.map((b, j) => b.length === 1 ? [1] : b.map(x => cor(x, Z[j])));
      normalizeW();
      let diff = 0;
      for (let j = 0; j < J; j++) for (let k = 0; k < W[j].length; k++)
        diff = Math.max(diff, Math.abs(W[j][k] - Wold[j][k]));
      if (diff < tol) { converged = true; iter++; break; }
    }

    const Y = scores().map(standardize);
    const LVcor = corMatrix(Y);

    // Outer loadings & cross loadings
    const loadings = blocks.map((b, j) => X[j].map(x => cor(x, Y[j])));
    const allItems = blocks.flatMap((b, j) => b.items.map((it, k) => ({ item: it, block: j, x: X[j][k] })));
    const cross = opts.lite ? [] : allItems.map(o => ({ item: o.item, block: o.block, values: Y.map(y => cor(o.x, y)) }));

    // Độ tin cậy & giá trị hội tụ
    const quality = blocks.map((b, j) => {
      const L = loadings[j], k = L.length;
      const sumL = L.reduce((s, v) => s + v, 0);
      const sumErr = L.reduce((s, v) => s + (1 - v * v), 0);
      const rhoC = k > 1 ? (sumL * sumL) / (sumL * sumL + sumErr) : NaN;
      const ave = L.reduce((s, v) => s + v * v, 0) / k;
      // rho_A (Dijkstra & Henseler, 2015)
      let rhoA = NaN;
      if (k > 1) {
        const S = corMatrix(X[j]);
        const w = W[j];
        let num = 0, den = 0;
        for (let a = 0; a < k; a++) for (let c = 0; c < k; c++) if (a !== c) {
          num += w[a] * S[a][c] * w[c];
          den += w[a] * w[a] * w[c] * w[c];
        }
        const ww = dot(w, w);
        rhoA = ww * ww * num / den;
      }
      const raw = b.items.map(it => data[it]);
      return {
        alpha: cronbachAlpha(raw),
        alphaStd: cronbachAlphaStd(raw),
        rhoA, rhoC, ave,
        itemStats: opts.lite ? [] : (k > 1 ? itemTotalStats(raw) : raw.map(() => ({ citc: NaN, alphaIfDeleted: NaN })))
      };
    });

    // Outer VIF
    const outerVIF = opts.lite ? [] : blocks.map((b, j) => vifFromCols(X[j]));

    // Fornell-Larcker
    const fornell = LVcor.map((row, i) => row.map((v, j) => (i === j ? Math.sqrt(quality[i].ave) : v)));

    // HTMT
    const R = corMatrix(allItems.map(o => o.x));
    const pos = []; let p = 0;
    blocks.forEach(b => { pos.push(b.items.map(() => p++)); });
    // HTMT tính trên trị tuyệt đối của từng tương quan (như SmartPLS);
    // thang đo một biến không có tương quan nội bộ nên không tính HTMT (NaN)
    const mono = pos.map(ids => {
      if (ids.length < 2) return NaN;
      let s = 0, m = 0;
      for (let a = 0; a < ids.length; a++) for (let c = a + 1; c < ids.length; c++) { s += Math.abs(R[ids[a]][ids[c]]); m++; }
      return s / m;
    });
    const htmt = blocks.map((_, i) => blocks.map((_, j) => {
      if (i === j || !(mono[i] > 0) || !(mono[j] > 0)) return NaN;
      let s = 0, m = 0;
      for (const a of pos[i]) for (const c of pos[j]) { s += Math.abs(R[a][c]); m++; }
      return (s / m) / Math.sqrt(mono[i] * mono[j]);
    }));

    // Mô hình cấu trúc
    const structural = blocks.map((b, j) => {
      if (!pred[j].length) return null;
      const P = pred[j].map(i => Y[i]);
      const { beta, r2 } = stdRegression(Y[j], P);
      const vif = vifFromCols(P);
      const k = P.length;
      const r2adj = 1 - (1 - r2) * (n - 1) / (n - k - 1);
      return { predictors: pred[j], beta, r2, r2adj, vif };
    });
    // f²
    if (!opts.lite) structural.forEach((s, j) => {
      if (!s) return;
      s.f2 = s.predictors.map((_, k) => {
        const rest = s.predictors.filter((__, q) => q !== k).map(i => Y[i]);
        const r2ex = rest.length ? stdRegression(Y[j], rest).r2 : 0;
        return (s.r2 - r2ex) / (1 - s.r2);
      });
    });

    return {
      n, iterations: iter, converged, scheme,
      blocks, weights: W, loadings, cross, quality, outerVIF,
      lvCor: LVcor, fornell, htmt, structural, scores: Y
    };
  }

  // ---------- Thống kê mô tả ----------
  function describe(arr) {
    const v = arr.filter(x => Number.isFinite(x));
    const n = v.length;
    if (!n) return { n: 0, missing: arr.length, mean: NaN, sd: NaN, min: NaN, max: NaN, skew: NaN, kurt: NaN };
    const m = mean(v), s = n > 1 ? sd(v) : NaN;
    let m3 = 0, m4 = 0;
    for (const x of v) { const d = x - m; m3 += d ** 3; m4 += d ** 4; }
    const sp = Math.sqrt(variance(v, 0));
    return {
      n, missing: arr.length - n, mean: m, sd: s,
      min: Math.min(...v), max: Math.max(...v),
      skew: sp > 0 ? (m3 / n) / sp ** 3 : NaN,
      kurt: sp > 0 ? (m4 / n) / sp ** 4 - 3 : NaN
    };
  }

  const api = {
    mean, variance, sd, standardize, cor, corMatrix, inverse,
    vifFromCols, stdRegression, cronbachAlpha, cronbachAlphaStd,
    itemTotalStats, plsAlgorithm, describe
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { global.Stats = api; (global.PTSL = global.PTSL || {}).stats = api; }
})(typeof window !== 'undefined' ? window : globalThis);
