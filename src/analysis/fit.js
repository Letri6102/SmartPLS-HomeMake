/*
 * analysis/fit.js — Chạy thuật toán PLS cho mô hình đang khai báo
 * và lưu kết quả vào state (kèm kết quả gốc khi có dòng bị loại, để so sánh độ nhạy).
 */
(function (P) {
  'use strict';
  const { $, toast } = P.util;
  const state = P.state;

  P.fitModel = function (m, excl) {
    const prepared = P.buildData(m.blocks, $('missing').value, excl);
    if (prepared.n < 10) throw new Error(`Chỉ còn ${prepared.n} phiếu hợp lệ, không đủ để phân tích`);
    for (const b of m.blocks) for (const it of b.items)
      if (P.stats.sd(prepared.data[it]) === 0) throw new Error(`Biến "${it}" có mọi câu trả lời giống nhau (phương sai bằng 0)`);
    const res = P.stats.plsAlgorithm(prepared.data, m.blocks, m.paths, m.plsOpts);
    res.paths = m.paths; res.prepared = prepared; res.plsOpts = m.plsOpts;
    return res;
  };

  // Tính lại toàn bộ mô hình khi mô hình, tùy chọn hoặc danh sách dòng bị loại thay đổi
  P.compute = function () {
    $('modelMsg').textContent = '';
    let m, res;
    try { m = P.readModel(); res = P.fitModel(m, state.excluded); }
    catch (e) { $('modelMsg').textContent = e.message; toast(e.message, true); $('step2').scrollIntoView({ block: 'start' }); return false; }
    state.result = res;
    state.sig = P.currentSig();
    state.baseline = null;
    if (state.excluded.size) { try { state.baseline = P.rowcheck.summarize(P.fitModel(m, new Set())); } catch (e) { /* bỏ qua */ } }
    const schemeName = { path: 'Path', factor: 'Factor' }[res.scheme] + ' weighting' +
      (m.plsOpts.scheme === 'path' && res.scheme !== 'path' ? ' (chưa có quan hệ nên chưa dùng được Path)' : '');
    $('runInfo').textContent = `n = ${res.n}${state.excluded.size ? ` (đã loại ${state.excluded.size} dòng)` : ''} · ${schemeName} · ` +
      (res.converged ? `hội tụ sau ${res.iterations} vòng lặp` : `chưa hội tụ sau ${res.iterations} vòng lặp`);
    $('btnExport').disabled = false;
    P.unlock(3);
    P.buildTables(res);
    if (P.canvas) P.canvas.render();
    return true;
  };

  // Kết quả bootstrap còn khớp với mô hình hiện tại không
  P.bootFresh = () => !!(state.boot && state.boot.sig === state.sig && state.result && state.sig === P.currentSig());
})(window.PTSL);
