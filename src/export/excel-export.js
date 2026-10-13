/*
 * export/excel-export.js — Xuất toàn bộ kết quả ra file Excel có tô màu:
 *   ô không đạt: nền đỏ, chữ đỏ đậm; ô cần xem lại: nền vàng.
 * Dùng export/xlsx-writer.js (không cần Internet).
 */
(function (P) {
  'use strict';
  const { toast, download } = P.util;
  const state = P.state;

  const NUM_STYLE = { good: 'numGood', warn: 'numWarn', bad: 'numBad', diag: 'numDiag' };
  const TXT_STYLE = { good: 'textGood', warn: 'textWarn', bad: 'textBad' };

  function cellOut(c) {
    if (!c || c.v === null || c.v === undefined || c.v === '') return { v: '', s: 'text' };
    if (typeof c.v === 'number') {
      if (!Number.isFinite(c.v)) return { v: c.v === Infinity ? '∞' : '', s: 'text' };
      if (c.p) return { v: Math.round(c.v * 1000) / 1000, s: c.cls === 'bad' ? 'pvalBad' : 'pval' };
      if (Number.isInteger(c.v) && !NUM_STYLE[c.cls]) return { v: c.v, s: 'int' };
      return { v: Math.round(c.v * 1000) / 1000, s: NUM_STYLE[c.cls] || 'num' };
    }
    return { v: String(c.v), s: TXT_STYLE[c.cls] || 'text' };
  }
  const plainNote = s => String(s).replace(/<[^>]+>/g, '');

  // Một sheet từ danh sách phần (bảng / đoạn văn)
  function sheetFrom(name, title, sections) {
    const rows = [], widths = [24];
    rows.push([{ v: title, s: 'title' }]);
    rows.push([{ v: 'Ô đỏ: không đạt ngưỡng', s: 'legendBad' }, { v: 'Ô vàng: cần xem lại', s: 'legendWarn' }]);
    rows.push([]);
    sections.forEach(sec => {
      if (sec.figure) return;
      if (sec.prose) {
        rows.push([{ v: sec.title, s: 'subtitle' }]);
        sec.prose.forEach(p => rows.push([{ v: p, s: 'note' }]));
        rows.push([]);
        return;
      }
      if (!sec.rows || !sec.rows.length) return;
      if (sec.title) rows.push([{ v: sec.title, s: 'subtitle' }]);
      rows.push(sec.head.map(h => ({ v: h, s: 'header' })));
      sec.head.forEach((h, i) => { widths[i] = Math.max(widths[i] || 12, Math.min(40, String(h).length + 2)); });
      sec.rows.forEach(r => {
        rows.push(r.map(cellOut));
        r.forEach((c, i) => { if (c && typeof c.v === 'string') widths[i] = Math.max(widths[i] || 12, Math.min(48, c.v.length + 2)); });
      });
      if (sec.note) rows.push([{ v: plainNote(sec.note), s: 'note' }]);
      rows.push([]);
    });
    return { name, cols: widths, rows };
  }

  P.exportExcel = function () {
    if (!state.result) return;
    const sheets = [];
    state.tables.forEach(t => {
      if (t.key === 'boot') {
        // Bootstrapping: mỗi nhóm kết quả một sheet
        const titles = { paths: 'Hệ số đường dẫn', ci: 'Khoảng tin cậy', indirect: 'Tác động gián tiếp', total: 'Tổng tác động',
          loadings: 'Outer loading', weights: 'Outer weight', r2: 'R²', htmt: 'HTMT' };
        Object.entries(t.views).forEach(([k, secs]) => {
          if (secs.some(s => s.rows && s.rows.length)) sheets.push(sheetFrom(`Bootstrap - ${titles[k]}`, `Bootstrapping: ${titles[k]}`, secs));
        });
      } else sheets.push(sheetFrom(t.title, t.title, t.sections));
    });
    if (state.excluded.size) {
      const byId = new Map(((state.scan && state.scan.rows) || []).map(r => [r.rowId, r]));
      const rows = [[{ v: 'Dòng đã loại khỏi phân tích', s: 'title' }], [],
        [{ v: 'Dòng Excel', s: 'header' }, { v: 'Mã', s: 'header' }, { v: 'Dấu hiệu (lần quét gần nhất)', s: 'header' }]];
      [...state.excluded].sort((a, b) => a - b).forEach(i => {
        const r = byId.get(i);
        rows.push([{ v: i + 2, s: 'int' }, { v: P.rowLabel(i), s: 'text' }, { v: r ? r.flags.map(f => f.text).join('; ') : '', s: 'text' }]);
      });
      sheets.push({ name: 'Dòng đã loại', cols: [12, 12, 70], rows });
    }
    const bytes = P.xlsx.build(sheets);
    download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'ket_qua_phan_tich.xlsx');
    toast('Đã xuất ket_qua_phan_tich.xlsx (ô không đạt được tô đỏ)');
  };
})(window.PTSL);
