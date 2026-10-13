/*
 * core/namespace.js — Không gian tên chung PTSL, trạng thái ứng dụng và các tiện ích dùng chung.
 * Nạp đầu tiên. Các module khác gắn hàm của mình vào window.PTSL.
 */
(function (global) {
  'use strict';
  const P = global.PTSL = global.PTSL || {};

  // ---------- Trạng thái ứng dụng ----------
  P.state = {
    workbook: null, fileName: '',
    headers: [], rows: [], numeric: {},
    result: null, tables: [], activeTab: null,
    dec: '.',
    sig: '',                    // chữ ký lần tính gần nhất (mô hình + tùy chọn + dòng bị loại)
    ran: new Set(),             // độ đo đã bấm chạy
    excluded: new Set(),        // chỉ số dòng (trong state.rows) đang bị loại
    baseline: null,             // tóm tắt kết quả khi chưa loại dòng nào
    sensitivity: null,          // bảng so sánh trước/sau khi loại dòng
    scan: null, scanning: false, scanFilter: 'any', selected: new Set(), scanOptsUsed: null,
    boot: null, booting: false, bootCancel: false, bootView: 'paths'
  };

  // ---------- Tiện ích ----------
  const U = P.util = {};
  U.$ = id => document.getElementById(id);
  U.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let toastTimer;
  U.toast = (msg, isErr) => {
    const t = U.$('toast');
    t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast' + (isErr ? ' err' : ''); }, isErr ? 4500 : 2200);
  };

  U.store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } }
  };

  // Định dạng số theo dấu thập phân người dùng chọn
  U.f3 = v => {
    if (v === null || v === undefined || Number.isNaN(v)) return '';
    if (v === Infinity) return '∞';
    const s = v.toFixed(3);
    return P.state.dec === ',' ? s.replace('.', ',') : s;
  };
  U.normDec = s => P.state.dec === '.' ? s.replace(/(\d),(\d)/g, '$1.$2') : s.replace(/(\d)\.(\d)/g, '$1,$2');
  U.fmtNum = v => (typeof v === 'number' && Number.isInteger(v)) ? String(v) : U.f3(v);

  U.toNumber = v => {
    if (v === null || v === undefined) return NaN;
    if (typeof v === 'number') return v;
    let s = String(v).trim();
    if (s === '') return NaN;
    if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    const x = Number(s);
    return Number.isFinite(x) ? x : NaN;
  };

  U.download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };

  // Ô bảng kết quả: giá trị + lớp đánh giá (good / warn / bad / diag / dim)
  U.C = (v, cls) => ({ v, cls });
})(window);
