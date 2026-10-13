/*
 * ui/prefs.js — Tùy chọn giao diện: dấu thập phân, sáng/tối, chế độ khai báo mô hình (vẽ / chữ).
 */
(function (P) {
  'use strict';
  const { $, store } = P.util;
  const state = P.state;

  P.setDec = function (d) {
    state.dec = d; store.set('ptsl-dec', d);
    document.querySelectorAll('[data-dec]').forEach(b => b.classList.toggle('on', b.dataset.dec === d));
    if (state.result) { P.buildTables(state.result); if (state.activeTab) P.showTab(state.activeTab); }
    if (P.canvas) P.canvas.render();
  };

  P.toggleTheme = function () {
    const root = document.documentElement;
    const isDark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = isDark ? 'light' : 'dark';
    store.set('ptsl-theme', root.dataset.theme);
  };

  P.setMode = function (m) {
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    $('drawMode').classList.toggle('hidden', m !== 'draw');
    $('textMode').classList.toggle('hidden', m !== 'text');
    store.set('ptsl-mode', m);
    if (m === 'draw' && P.canvas) P.canvas.render();
  };
})(window.PTSL);
