/*
 * data/csv-parser.js — Đọc file CSV (tự nhận dấu phân cách , ; tab |, hỗ trợ ngoặc kép)
 */
(function (P) {
  'use strict';
  P.parseCSV = function (text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const counts = [',', ';', '\t', '|'].map(d => [d, first.split(d).length - 1]).sort((a, b) => b[1] - a[1]);
    const delim = counts[0][1] > 0 ? counts[0][0] : ',';
    const rows = []; let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = ''; rows.push(row); row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(v => String(v).trim() !== ''));
  };
})(window.PTSL);
