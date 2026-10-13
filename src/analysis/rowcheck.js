/*
 * analysis/rowcheck.js — Phát hiện dòng dữ liệu đáng ngờ
 *  1. Trả lời một kiểu (straight-lining): độ lệch chuẩn của dòng rất nhỏ
 *  2. Không nhất quán trong thang đo: độ lệch chuẩn trung bình giữa các câu cùng thang đo quá lớn (trả lời ngẫu nhiên)
 *  3. Ngoại lai đa biến: khoảng cách Mahalanobis D², p < 0,001 (χ², df = số biến)
 *  4. Thiếu nhiều câu trả lời
 *  5. Ảnh hưởng lớn (leave-one-out): bỏ dòng này thì α, CR, AVE, β thay đổi bất thường
 * Tiêu chí 1–4 độc lập với kết quả; tiêu chí 5 chỉ để tham khảo.
 */
(function (global) {
  'use strict';
  const NS = global.PTSL || {};
  const S = NS.stats || global.Stats || (typeof require !== 'undefined' ? require('../core/stats.js') : null);
  const D = NS.dist || (typeof require !== 'undefined' ? require('../core/distributions.js') : null);
  const chi2p = D.chi2p, chi2crit = D.chi2crit;

  // Các chỉ số tóm tắt để so sánh
  function summarize(res) {
    const out = { n: res.n, blocks: {}, paths: {} };
    res.blocks.forEach((b, j) => {
      const q = res.quality[j];
      out.blocks[b.name] = { alpha: q.alphaStd, rhoC: q.rhoC, ave: q.ave, minLoad: Math.min(...res.loadings[j]) };
    });
    res.structural.forEach((s, j) => {
      if (!s) return;
      out.blocks[res.blocks[j].name].r2 = s.r2;
      s.predictors.forEach((p, k) => { out.paths[`${res.blocks[p].name} → ${res.blocks[j].name}`] = s.beta[k]; });
    });
    return out;
  }

  /**
   * Quét dữ liệu.
   * ctx: { blocks, paths, plsOpts, raw: {item: number[] (NaN = trống)}, rowIds: number[] }
   * opts: { sdMax, incMin, pMaha, missMax, loo }
   * onProgress(done, total)
   */
  async function scan(ctx, opts, onProgress) {
    const items = ctx.blocks.flatMap(b => b.items);
    const n = ctx.rowIds.length, k = items.length;
    // Điền trung bình cho ô trống (chỉ dùng cho D² và LOO)
    const filled = {};
    items.forEach(it => {
      const v = ctx.raw[it].filter(Number.isFinite), m = v.length ? S.mean(v) : 0;
      filled[it] = ctx.raw[it].map(x => (Number.isFinite(x) ? x : m));
    });

    // Mahalanobis D²
    let d2 = new Array(n).fill(NaN), mahaOk = true, crit = NaN;
    try {
      const Z = items.map(it => S.standardize(filled[it]));
      const inv = S.inverse(S.corMatrix(items.map(it => filled[it])));
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let a = 0; a < k; a++) { const za = Z[a][i]; if (!za) continue; for (let b = 0; b < k; b++) s += za * inv[a][b] * Z[b][i]; }
        d2[i] = s;
      }
      crit = chi2crit(opts.pMaha, k);
    } catch (e) { mahaOk = false; }

    const rows = [];
    for (let i = 0; i < n; i++) {
      const vals = items.map(it => ctx.raw[it][i]);
      const ok = vals.filter(Number.isFinite);
      const flags = [];
      const miss = 1 - ok.length / k;
      if (miss > opts.missMax) flags.push({ type: 'miss', text: `Thiếu ${Math.round(miss * 100)}% câu trả lời` });
      const sd = ok.length > 1 ? S.sd(ok) : NaN;
      if (ok.length >= 5 && sd <= opts.sdMax) flags.push({ type: 'straight', text: `Trả lời gần như một kiểu (độ lệch chuẩn ${sd.toFixed(2)})` });
      // Không nhất quán trong thang đo: độ lệch chuẩn giữa các câu của cùng thang đo, lấy trung bình qua các thang đo.
      // Người trả lời thật chấm các câu cùng khái niệm gần nhau; người trả lời ngẫu nhiên thì không.
      const within = [];
      ctx.blocks.forEach(b => {
        if (b.items.length < 2) return;
        const v = b.items.map(it => ctx.raw[it][i]).filter(Number.isFinite);
        if (v.length >= 2) within.push({ name: b.name, sd: S.sd(v) });
      });
      const inc = within.length ? S.mean(within.map(w => w.sd)) : NaN;
      if (within.length && inc >= opts.incMin) {
        const worst = within.reduce((a, b) => (b.sd > a.sd ? b : a));
        flags.push({ type: 'range', text: `Không nhất quán trong thang đo (độ lệch chuẩn TB ${inc.toFixed(2)}, cao nhất ở ${worst.name})` });
      }
      let p = NaN;
      if (mahaOk) {
        p = chi2p(d2[i], k);
        if (p < opts.pMaha) flags.push({ type: 'maha', text: `Ngoại lai đa biến (D² = ${d2[i].toFixed(1)})` });
      }
      rows.push({ i, rowId: ctx.rowIds[i], vals, sd, inc, d2: d2[i], p, flags, impact: 0, effects: [] });
    }

    // Leave-one-out
    let base = null;
    if (opts.loo) {
      const full = S.plsAlgorithm(filled, ctx.blocks, ctx.paths, ctx.plsOpts);
      base = summarize(full);
      const chunk = 8;
      for (let s = 0; s < n; s += chunk) {
        for (let i = s; i < Math.min(n, s + chunk); i++) {
          const d = {};
          items.forEach(it => { const a = filled[it]; d[it] = a.slice(0, i).concat(a.slice(i + 1)); });
          let res;
          try { res = summarize(S.plsAlgorithm(d, ctx.blocks, ctx.paths, ctx.plsOpts)); } catch (e) { continue; }
          const eff = [];
          for (const [nm, m] of Object.entries(base.blocks)) {
            const w = res.blocks[nm];
            if (Number.isFinite(m.alpha)) eff.push({ label: `α ${nm}`, d: w.alpha - m.alpha });
            if (Number.isFinite(m.rhoC)) eff.push({ label: `CR ${nm}`, d: w.rhoC - m.rhoC });
            eff.push({ label: `AVE ${nm}`, d: w.ave - m.ave });
            if (m.r2 !== undefined) eff.push({ label: `R² ${nm}`, d: w.r2 - m.r2, struct: true });
          }
          for (const [pk, b] of Object.entries(base.paths)) eff.push({ label: `β ${pk}`, d: res.paths[pk] - b, struct: true });
          const row = rows[i];
          row.effects = eff.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
          // "Kết quả xấu đi vì dòng này" = bỏ đi thì chỉ số đo lường tăng
          row.impact = Math.max(0, ...eff.filter(e => !e.struct).map(e => e.d));
        }
        if (onProgress) onProgress(Math.min(n, s + chunk), n);
        await new Promise(r => setTimeout(r, 0));
      }
      const imp = rows.map(r => r.impact);
      const m = S.mean(imp), sd = S.sd(imp);
      const cut = Math.max(m + 3 * sd, 0.003);
      rows.forEach(r => { if (r.impact >= cut) r.flags.push({ type: 'influence', text: 'Ảnh hưởng lớn đến kết quả', soft: true }); });
    }

    rows.forEach(r => {
      r.hard = r.flags.filter(f => !f.soft).length;
      r.score = r.hard * 10 + r.impact * 100;
    });
    return { rows, items, n, k, mahaOk, crit, base };
  }

  const api = { scan, summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { global.RowCheck = api; (global.PTSL = global.PTSL || {}).rowcheck = api; }
})(typeof window !== 'undefined' ? window : globalThis);
