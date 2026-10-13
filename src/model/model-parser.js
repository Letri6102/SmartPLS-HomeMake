/*
 * model/model-parser.js — Đọc khai báo mô hình dạng chữ
 *   Thang đo:  "TC: TC1, TC2, TC3"  hoặc dải "CL1-CL5"
 *   Quan hệ:   "TC, CL -> HL"
 * và đọc các tùy chọn thuật toán đang chọn.
 */
(function (P) {
  'use strict';
  const { $ } = P.util;
  const state = P.state;

  // Tiền tố của tên biến: "CL1" -> "CL"
  P.prefixOf = function (name) {
    const m = String(name).match(/^(.*?[A-Za-zÀ-ỹ])[\s_.\-]*\d+[a-zA-Z]?$/);
    return m ? m[1] : null;
  };

  function expandToken(tok) {
    if (state.headers.includes(tok)) return [tok];
    const m = tok.match(/^(.+?)(\d+)\s*-\s*(?:\1)?(\d+)$/);
    if (m) {
      const [, pre, a, b] = m, out = [];
      for (let i = Math.min(+a, +b); i <= Math.max(+a, +b); i++) out.push(pre + i);
      return out;
    }
    return [tok];
  }

  // lenient = true: không báo lỗi (dùng khi đang gõ / vẽ)
  P.parseModel = function (text, lenient) {
    const blocks = [], used = new Set(), names = new Set();
    text.split(/\r?\n/).forEach((line, ln) => {
      line = line.replace(/#.*$/, '').trim();
      if (!line) return;
      const ci = line.search(/[:=]/);
      if (ci < 0) { if (!lenient) throw new Error(`Dòng ${ln + 1} thiếu dấu ":". Viết theo dạng TC: TC1, TC2`); return; }
      const name = line.slice(0, ci).trim();
      const items = line.slice(ci + 1).split(/[,;\s]+/).filter(Boolean).flatMap(expandToken);
      if (!lenient) {
        if (!name) throw new Error(`Dòng ${ln + 1} chưa có tên thang đo`);
        if (names.has(name)) throw new Error(`Tên thang đo "${name}" bị trùng`);
        for (const it of items) {
          if (!state.headers.includes(it)) throw new Error(`Không có biến "${it}" trong file`);
          if (!state.numeric[it]) throw new Error(`Biến "${it}" không phải dạng số`);
          if (used.has(it)) throw new Error(`Biến "${it}" đang nằm trong nhiều thang đo`);
          used.add(it);
        }
        if (!items.length) throw new Error(`Thang đo "${name}" chưa có biến quan sát`);
      }
      names.add(name);
      blocks.push({ name, items });
    });
    if (!lenient && !blocks.length) throw new Error('Chưa khai báo thang đo nào');
    return blocks;
  };

  P.parsePaths = function (text, blocks) {
    const names = new Set(blocks.map(b => b.name));
    const paths = [], key = new Set();
    text.split(/\r?\n/).forEach((line, ln) => {
      line = line.replace(/#.*$/, '').trim();
      if (!line) return;
      const parts = line.split(/\s*(?:->|=>|→)\s*/);
      if (parts.length < 2) throw new Error(`Quan hệ dòng ${ln + 1}: viết theo dạng A -> B`);
      for (let p = 0; p < parts.length - 1; p++) {
        const from = parts[p].split(/[,;\s]+/).filter(Boolean);
        const to = parts[p + 1].split(/[,;\s]+/).filter(Boolean);
        for (const f of from) for (const t of to) {
          for (const x of [f, t]) if (!names.has(x)) throw new Error(`Quan hệ nhắc đến thang đo "${x}" nhưng chưa khai báo`);
          if (f === t) throw new Error(`Quan hệ "${f} -> ${t}" trỏ vào chính nó`);
          const k = f + '>' + t;
          if (!key.has(k)) { key.add(k); paths.push([f, t]); }
        }
      }
    });
    const adj = {}; paths.forEach(([f, t]) => (adj[f] = adj[f] || []).push(t));
    const visiting = new Set(), done = new Set();
    const dfs = v => {
      if (visiting.has(v)) throw new Error('Mô hình cấu trúc có vòng lặp. Hãy bỏ một quan hệ để mô hình đi một chiều');
      if (done.has(v)) return;
      visiting.add(v); (adj[v] || []).forEach(dfs); visiting.delete(v); done.add(v);
    };
    Object.keys(adj).forEach(dfs);
    return paths;
  };

  // Mô hình + tùy chọn thuật toán đang khai báo (báo lỗi nếu sai)
  P.readModel = function () {
    const blocks = P.parseModel($('model').value, false);
    const paths = P.parsePaths($('paths').value, blocks);
    const scheme = $('scheme').value || 'path';  // không có quan hệ thì stats.js tự chuyển sang Factor
    return { blocks, paths, plsOpts: { scheme, maxIter: +$('maxIter').value || 3000, tol: 1e-7 } };
  };

  // Chữ ký của mô hình hiện tại; đổi chữ ký nghĩa là kết quả cũ không còn đúng
  P.currentSig = function () {
    return JSON.stringify([$('model').value, $('paths').value, $('scheme').value, $('missing').value, $('maxIter').value,
      [...state.excluded].sort((a, b) => a - b)]);
  };
  P.isStale = () => !state.result || state.sig !== P.currentSig();
})(window.PTSL);
