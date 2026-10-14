/*
 * analysis/bootstrap.js — Bootstrapping cho PLS-SEM (giống SmartPLS)
 * Lấy mẫu lặp có hoàn lại B lần, chạy lại PLS trên mỗi mẫu và tính:
 *   Original sample (O), Sample mean (M), STDEV, T = |O / STDEV|, p-value,
 *   khoảng tin cậy percentile và khoảng tin cậy BCa (bias-corrected and accelerated,
 *   hệ số gia tốc ước lượng bằng jackknife như Efron & Tibshirani, 1993).
 * Áp dụng cho: hệ số đường dẫn, tác động gián tiếp cụ thể, tổng tác động gián tiếp,
 *   tổng tác động, outer loading, outer weight, R², HTMT.
 * Mẫu bootstrap mà thuật toán PLS chưa hội tụ bị loại (đếm riêng), không đưa vào thống kê.
 * Kiểm định một phía có hướng: opts.dirs = { "A → B": +1 | -1 } (mặc định +1, giả thuyết dương).
 */
(function (global) {
  'use strict';
  const NS = global.PTSL || {};
  const S = NS.stats || (typeof require !== 'undefined' ? require('../core/stats.js') : null);
  const D = NS.dist || (typeof require !== 'undefined' ? require('../core/distributions.js') : null);

  // Bộ sinh số ngẫu nhiên có seed (mulberry32) để kết quả lặp lại được
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- PLS tính trên ma trận tương quan (nhanh, dùng cho từng mẫu bootstrap) ----------
  // Với dữ liệu chuẩn hóa, mọi kết quả PLS (Mode A) chỉ phụ thuộc vào ma trận tương quan R của biến quan sát.
  function plsCorr(R, blocks, paths, opts) {
    const J = blocks.length, maxIter = opts.maxIter || 3000, tol = opts.tol || 1e-7;
    let p = 0; const pos = blocks.map(b => b.items.map(() => p++));
    const idx = Object.fromEntries(blocks.map((b, i) => [b.name, i]));
    const pred = blocks.map(() => []), succ = blocks.map(() => []);
    paths.forEach(([f, t]) => { pred[idx[t]].push(idx[f]); succ[idx[f]].push(idx[t]); });
    if (J < 2) throw new Error('Cần ít nhất 2 thang đo');
    let scheme = opts.scheme === 'factor' ? 'factor' : 'path';
    const adj = blocks.map((_, j) => new Set([...pred[j], ...succ[j]]));
    // Giống stats.js: chưa có quan hệ => mọi thang đo kề nhau, Factor; có quan hệ mà còn thang đo cô lập => lỗi
    if (!paths.length) {
      scheme = 'factor';
      for (let j = 0; j < J; j++) for (let i = 0; i < J; i++) if (i !== j) adj[j].add(i);
    } else if (adj.some(a => a.size === 0)) throw new Error('Có thang đo chưa nối với mô hình cấu trúc');
    // R_ab * w_b (vector theo biến của khối a)
    const Rw = (a, b, w) => pos[a].map(ia => { let s = 0; pos[b].forEach((ib, k) => { s += R[ia][ib] * w[k]; }); return s; });
    const norm = (j, w) => { const v = Rw(j, j, w).reduce((s, x, k) => s + x * w[k], 0); if (!(v > 0)) throw new Error('Điểm thang đo không có phương sai'); const d = Math.sqrt(v); return w.map(x => x / d); };
    let W = blocks.map((b, j) => norm(j, b.items.map(() => 1)));
    const lvCor = () => { const C = []; for (let i = 0; i < J; i++) { C.push([]); for (let j = 0; j < J; j++) C[i].push(i === j ? 1 : Rw(i, j, W[j]).reduce((s, x, k) => s + x * W[i][k], 0)); } return C; };
    const regress = (C, y, xs) => {
      if (!xs.length) return { beta: [], r2: 0 };
      const Rxx = xs.map(a => xs.map(b => C[a][b])), rxy = xs.map(a => C[a][y]);
      const beta = S.inverse(Rxx).map(row => row.reduce((s, v, k) => s + v * rxy[k], 0));
      return { beta, r2: beta.reduce((s, b, k) => s + b * rxy[k], 0) };
    };
    let converged = false, it = 0;
    for (; it < maxIter; it++) {
      const C = lvCor();
      const E = blocks.map(() => new Array(J).fill(0));
      for (let j = 0; j < J; j++) {
        if (scheme === 'path' && paths.length) {
          if (pred[j].length) { const { beta } = regress(C, j, pred[j]); pred[j].forEach((i, k) => { E[j][i] = beta[k]; }); }
          adj[j].forEach(i => { if (!pred[j].includes(i)) E[j][i] = C[j][i]; });
        } else adj[j].forEach(i => { E[j][i] = C[j][i]; });
      }
      const Wold = W;
      W = blocks.map((b, j) => {
        if (b.items.length === 1) return [1];
        const w = b.items.map(() => 0);
        for (let i = 0; i < J; i++) if (E[j][i]) { const r = Rw(j, i, Wold[i]); r.forEach((v, k) => { w[k] += E[j][i] * v; }); }
        return norm(j, w);
      });
      let diff = 0;
      W.forEach((w, j) => w.forEach((v, k) => { diff = Math.max(diff, Math.abs(v - Wold[j][k])); }));
      if (diff < tol) { converged = true; it++; break; }
    }
    const C = lvCor();
    const loadings = blocks.map((b, j) => Rw(j, j, W[j]));
    const structural = blocks.map((b, j) => {
      if (!pred[j].length) return null;
      const { beta, r2 } = regress(C, j, pred[j]);
      return { predictors: pred[j], beta, r2 };
    });
    // HTMT trên trị tuyệt đối của từng tương quan; thang đo một biến không có HTMT (NaN) — giống stats.js
    const mono = pos.map(ids => { if (ids.length < 2) return NaN; let s = 0, m = 0; for (let a = 0; a < ids.length; a++) for (let c = a + 1; c < ids.length; c++) { s += Math.abs(R[ids[a]][ids[c]]); m++; } return s / m; });
    const htmt = blocks.map((_, i) => blocks.map((_, j) => {
      if (i === j || !(mono[i] > 0) || !(mono[j] > 0)) return NaN;
      let s = 0, m = 0; pos[i].forEach(a => pos[j].forEach(c => { s += Math.abs(R[a][c]); m++; }));
      return (s / m) / Math.sqrt(mono[i] * mono[j]);
    }));
    return { blocks, weights: W, loadings, structural, htmt, converged, iterations: it };
  }

  // Ma trận tương quan của mẫu bootstrap (cột đã chọn theo chỉ số pick)
  function corOfSample(cols, pick) {
    const k = cols.length, n = pick.length, Z = [];
    for (let a = 0; a < k; a++) {
      const src = cols[a], v = new Float64Array(n); let m = 0;
      for (let i = 0; i < n; i++) { v[i] = src[pick[i]]; m += v[i]; }
      m /= n; let ss = 0;
      for (let i = 0; i < n; i++) { v[i] -= m; ss += v[i] * v[i]; }
      if (ss === 0) return null;
      const d = Math.sqrt(ss); for (let i = 0; i < n; i++) v[i] /= d;
      Z.push(v);
    }
    const R = []; for (let a = 0; a < k; a++) R.push(new Array(k).fill(1));
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
      const x = Z[a], y = Z[b]; let s = 0; for (let i = 0; i < n; i++) s += x[i] * y[i];
      R[a][b] = s; R[b][a] = s;
    }
    return R;
  }

  // Ma trận tương quan khi bỏ dòng i (jackknife), tính nhanh từ tổng và tổng tích của toàn bộ dữ liệu
  function looPrep(cols) {
    const k = cols.length, n = cols[0].length;
    const S1 = new Float64Array(k), S2 = [];
    for (let a = 0; a < k; a++) { let s = 0; for (let i = 0; i < n; i++) s += cols[a][i]; S1[a] = s; }
    for (let a = 0; a < k; a++) {
      S2.push(new Float64Array(k));
      for (let b = 0; b <= a; b++) { let s = 0; for (let i = 0; i < n; i++) s += cols[a][i] * cols[b][i]; S2[a][b] = s; }
    }
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) S2[a][b] = S2[b][a];
    return { k, n, S1, S2 };
  }
  function corLeaveOut(cols, pre, r) {
    const { k, n, S1, S2 } = pre, m = n - 1;
    const x = new Float64Array(k); for (let a = 0; a < k; a++) x[a] = cols[a][r];
    const mean = new Float64Array(k); for (let a = 0; a < k; a++) mean[a] = (S1[a] - x[a]) / m;
    const cv = (a, b) => (S2[a][b] - x[a] * x[b]) - m * mean[a] * mean[b];
    const v = new Float64Array(k);
    for (let a = 0; a < k; a++) { v[a] = cv(a, a); if (!(v[a] > 1e-12)) return null; }
    const R = []; for (let a = 0; a < k; a++) R.push(new Array(k).fill(1));
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) { const c = cv(a, b) / Math.sqrt(v[a] * v[b]); R[a][b] = c; R[b][a] = c; }
    return R;
  }

  // Liệt kê mọi đường gián tiếp (độ dài ≥ 2) trong mô hình cấu trúc
  function indirectRoutes(names, paths) {
    const out = {}; names.forEach(n => { out[n] = []; });
    paths.forEach(([f, t]) => out[f].push(t));
    const routes = [];
    const walk = (route) => {
      const last = route[route.length - 1];
      for (const nx of out[last]) {
        if (route.includes(nx)) continue;
        const r = route.concat(nx);
        if (r.length >= 3) routes.push(r);
        walk(r);
      }
    };
    names.forEach(n => walk([n]));
    return routes;
  }

  // Trích các thống kê cần bootstrap từ một kết quả PLS
  function extract(res, routes) {
    const B = res.blocks;
    const beta = {};                       // "A → B" -> β
    res.structural.forEach((s, j) => {
      if (!s) return;
      s.predictors.forEach((p, k) => { beta[`${B[p].name} → ${B[j].name}`] = s.beta[k]; });
    });
    const out = {
      paths: beta, indirect: {}, totalIndirect: {}, total: {},
      loadings: {}, weights: {}, r2: {}, htmt: {}
    };
    routes.forEach(r => {
      let v = 1;
      for (let i = 0; i < r.length - 1; i++) v *= beta[`${r[i]} → ${r[i + 1]}`];
      const key = r.join(' → ');
      out.indirect[key] = v;
      const pair = `${r[0]} → ${r[r.length - 1]}`;
      out.totalIndirect[pair] = (out.totalIndirect[pair] || 0) + v;
    });
    const pairs = new Set([...Object.keys(beta), ...Object.keys(out.totalIndirect)]);
    pairs.forEach(k => { out.total[k] = (beta[k] || 0) + (out.totalIndirect[k] || 0); });
    B.forEach((b, j) => b.items.forEach((it, k) => {
      out.loadings[`${it} ← ${b.name}`] = res.loadings[j][k];
      out.weights[`${it} → ${b.name}`] = res.weights[j][k];
    }));
    res.structural.forEach((s, j) => { if (s) out.r2[B[j].name] = s.r2; });
    // HTMT: bỏ các cặp có thang đo một biến (không tính được HTMT)
    for (let i = 0; i < B.length; i++) for (let j = 0; j < i; j++)
      if (Number.isFinite(res.htmt[i][j])) out.htmt[`${B[i].name} ↔ ${B[j].name}`] = res.htmt[i][j];
    return out;
  }

  // Đổi dấu biến tiềm ẩn nếu mẫu bootstrap bị lật chiều (tổng loading âm)
  function fixSigns(res, reference) {
    // Align each resample with the original construct orientation, including
    // constructs whose original loading sum is negative.
    const sign = res.loadings.map((L, j) =>
      (L.reduce((a, v, k) => a + v * (reference ? reference.loadings[j][k] : 1), 0) < 0 ? -1 : 1));
    if (sign.every(s => s === 1)) return res;
    res.loadings = res.loadings.map((L, j) => L.map(v => v * sign[j]));
    res.weights = res.weights.map((W, j) => W.map(v => v * sign[j]));
    res.structural.forEach((s, j) => { if (s) s.beta = s.beta.map((b, k) => b * sign[j] * sign[s.predictors[k]]); });
    return res;
  }

  const quantile = (sorted, q) => {
    if (!sorted.length || !Number.isFinite(q)) return NaN;
    q = Math.min(1, Math.max(0, q));
    const h = (sorted.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
  };

  // Hướng giả thuyết của từng thống kê (dùng cho kiểm định một phía)
  //  - quan hệ trực tiếp: theo dirs (mặc định +1)
  //  - tác động gián tiếp cụ thể: tích hướng các quan hệ trên đường đi
  //  - tổng tác động gián tiếp: hướng của đường gián tiếp đầu tiên giữa hai thang đo
  //  - tổng tác động: hướng của quan hệ trực tiếp nếu có, nếu không thì như tổng gián tiếp
  //  - loading, weight, R²: +1
  function directions(routes, dirs) {
    const d = k => (dirs && dirs[k] === -1 ? -1 : 1);
    const out = { indirect: {}, totalIndirect: {} };
    routes.forEach(r => {
      let s = 1; for (let i = 0; i < r.length - 1; i++) s *= d(`${r[i]} → ${r[i + 1]}`);
      out.indirect[r.join(' → ')] = s;
      const pair = `${r[0]} → ${r[r.length - 1]}`;
      if (!(pair in out.totalIndirect)) out.totalIndirect[pair] = s;
    });
    return (group, key) => {
      if (group === 'paths') return d(key);
      if (group === 'indirect') return out.indirect[key] || 1;
      if (group === 'totalIndirect') return out.totalIndirect[key] || 1;
      if (group === 'total') return dirs && key in dirs ? d(key) : (out.totalIndirect[key] || d(key));
      return 1;
    };
  }

  /**
   * summarize(orig, samples, opts, jack)
   * jack: mảng kết quả extract của các mẫu jackknife (bỏ từng dòng) để tính hệ số gia tốc BCa.
   */
  function summarize(orig, samples, opts, jack, routes) {
    const n = samples.length, df = Math.max(1, n - 1);
    const tails = opts.tails === 1 ? 1 : 2, alpha = opts.alpha;
    const qLo = tails === 2 ? alpha / 2 : alpha, qHi = 1 - qLo;
    const zLo = D.normInv(qLo), zHi = D.normInv(qHi);
    const dirOf = directions(routes || [], opts.dirs);
    const out = {};
    for (const group of Object.keys(orig)) {
      out[group] = Object.keys(orig[group]).map(key => {
        const O = orig[group][key];
        const v = samples.map(s => s[group][key]).filter(Number.isFinite);
        const M = S.mean(v), sd = v.length > 1 ? S.sd(v) : NaN;
        const dir = dirOf(group, key);
        const t = sd > 0 ? Math.abs(O / sd) : NaN;
        // Hai phía: p = 2·P(T > |t|). Một phía có hướng: p = P(T > dir·O/STDEV),
        // nên hệ số ngược dấu giả thuyết cho p > 0,5 (không có ý nghĩa).
        const p = !(sd > 0) ? NaN : tails === 2 ? D.tPValue(t, df, 2) : D.tSf(dir * O / sd, df);
        const sorted = v.slice().sort((a, b) => a - b);
        // BCa: z0 = Φ⁻¹(tỷ lệ mẫu < O); a = Σ(θ̄−θi)³ / (6·[Σ(θ̄−θi)²]^1,5) từ jackknife
        const below = v.length ? v.filter(x => x < O).length / v.length : NaN;
        const z0 = D.normInv(Math.min(1 - 1e-6, Math.max(1e-6, below)));
        let acc = NaN;
        if (jack && jack.length > 2) {
          const th = jack.map(j => j[group][key]).filter(Number.isFinite);
          if (th.length > 2) {
            const m = S.mean(th); let s2 = 0, s3 = 0;
            th.forEach(x => { const d = m - x; s2 += d * d; s3 += d * d * d; });
            acc = s2 > 0 ? s3 / (6 * Math.pow(s2, 1.5)) : 0;
          }
        }
        const bca = z => { const w = z0 + z; return D.normCdf(z0 + w / (1 - acc * w)); };
        const okBca = Number.isFinite(acc) && Number.isFinite(z0);
        const row = {
          key, O, M, sd, t, p, n: v.length, dir, tails,
          lo: quantile(sorted, qLo), hi: quantile(sorted, qHi),
          bias: M - O, z0, acc,
          bcaLo: okBca ? quantile(sorted, bca(zLo)) : NaN, bcaHi: okBca ? quantile(sorted, bca(zHi)) : NaN,
          qLo, qHi
        };
        // HTMT luôn được kiểm định một phía, α = 0,05 (cận trên 95%), không phụ thuộc tùy chọn chung
        if (group === 'htmt') {
          row.h95 = quantile(sorted, 0.95);
          row.hBca95 = okBca ? quantile(sorted, bca(D.normInv(0.95))) : NaN;
        }
        // Kết luận theo khoảng tin cậy: hai phía => khoảng không chứa 0; một phía => cận phía giả thuyết vượt 0
        row.ciSig = tails === 2 ? (row.lo > 0 || row.hi < 0) : (dir > 0 ? row.lo > 0 : row.hi < 0);
        row.bcaSig = tails === 2 ? (row.bcaLo > 0 || row.bcaHi < 0) : (dir > 0 ? row.bcaLo > 0 : row.bcaHi < 0);
        return row;
      });
    }
    return out;
  }

  const tick = () => new Promise(r => setTimeout(r, 0));

  /**
   * run({ data, blocks, paths, plsOpts, original }, { samples, seed, tails, alpha, dirs }, onProgress, isCancelled)
   * data: { item: number[] } đã xử lý ô trống
   * onProgress(done, total, ms, phase) với phase = 'boot' | 'jack'
   */
  async function run(ctx, opts, onProgress, isCancelled) {
    if (!ctx.original.converged) throw new Error('Mô hình gốc chưa hội tụ; không thể thực hiện bootstrap.');
    const items = ctx.blocks.flatMap(b => b.items);
    const n = ctx.data[items[0]].length;
    const routes = indirectRoutes(ctx.blocks.map(b => b.name), ctx.paths);
    const orig = extract(ctx.original, routes);
    const rand = rng(opts.seed ?? 1);
    const cols = items.map(it => ctx.data[it]);
    const samples = [];
    let failed = 0, notConverged = 0;
    const B = opts.samples, chunk = 25;
    const t0 = Date.now();
    for (let s = 0; s < B; s += chunk) {
      for (let b = s; b < Math.min(B, s + chunk); b++) {
        const pick = new Array(n);
        for (let i = 0; i < n; i++) pick[i] = Math.floor(rand() * n);
        try {
          const R = corOfSample(cols, pick);
          if (!R) { failed++; continue; }          // mẫu có biến hằng (phương sai 0)
          const res = plsCorr(R, ctx.blocks, ctx.paths, ctx.plsOpts);
          if (!res.converged) { notConverged++; continue; }
          samples.push(extract(fixSigns(res, ctx.original), routes));
        } catch (e) { failed++; }
      }
      if (onProgress) onProgress(Math.min(B, s + chunk), B, Date.now() - t0, 'boot');
      if (isCancelled && isCancelled()) throw new Error('Đã hủy bootstrapping.');
      await tick();
    }
    // Jackknife (bỏ từng dòng) để ước lượng hệ số gia tốc của khoảng tin cậy BCa
    const jack = [];
    const pre = looPrep(cols);
    for (let r = 0; r < n; r += 50) {
      for (let i = r; i < Math.min(n, r + 50); i++) {
        try {
          const R = corLeaveOut(cols, pre, i);
          if (!R) continue;
          const res = plsCorr(R, ctx.blocks, ctx.paths, ctx.plsOpts);
          if (res.converged) jack.push(extract(fixSigns(res, ctx.original), routes));
        } catch (e) { /* bỏ qua dòng này */ }
      }
      if (onProgress) onProgress(Math.min(n, r + 50), n, Date.now() - t0, 'jack');
      if (isCancelled && isCancelled()) throw new Error('Đã hủy bootstrapping.');
      await tick();
    }
    return {
      // BCa acceleration requires the complete leave-one-out jackknife.
      stats: summarize(orig, samples, opts, jack.length === n ? jack : [], routes), done: samples.length, failed, notConverged,
      jackknife: jack.length, requested: B, routes, opts, ms: Date.now() - t0
    };
  }

  const api = { run, indirectRoutes, summarize, rng, plsCorr, corOfSample, corLeaveOut, looPrep, extract, fixSigns };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.PTSL = global.PTSL || {}).bootstrap = api;
})(typeof window !== 'undefined' ? window : globalThis);
