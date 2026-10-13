/*
 * app.js — Điểm khởi động: nối sự kiện giao diện với các module. Nạp cuối cùng.
 */
(function (P) {
  'use strict';
  const { $, store } = P.util;
  const state = P.state;

  // ---------- Bước 1: nhập dữ liệu ----------
  $('file').addEventListener('change', e => { P.handleFile(e.target.files[0]); e.target.value = ''; });
  $('file2').addEventListener('change', e => { P.handleFile(e.target.files[0]); e.target.value = ''; });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { if (ev === 'drop' || !e.relatedTarget) drop.classList.remove('over'); }));
  document.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) P.handleFile(e.dataTransfer.files[0]); });
  $('sheet').addEventListener('change', e => { $('model').value = ''; P.loadSheet(e.target.value); });
  $('btnPreview').addEventListener('click', () => {
    const box = $('preview'), show = box.classList.contains('hidden');
    if (show) P.renderPreview();
    box.classList.toggle('hidden', !show);
    $('btnPreview').textContent = show ? 'Ẩn dữ liệu' : 'Xem dữ liệu';
  });
  $('btnSample').addEventListener('click', () => {
    state.fileName = 'du_lieu_mau.csv';
    $('model').value = '';
    $('paths').value = 'TC, CL -> HL\nHL -> TT';
    $('sheetWrap').classList.add('hidden');
    P.setTable(P.parseCSV(window.SAMPLE_CSV), 'du_lieu_mau.csv (dữ liệu mẫu)');
  });

  // ---------- Bước 2: khai báo mô hình ----------
  $('btnAuto').addEventListener('click', P.autoModel);
  $('model').addEventListener('input', P.updateModelPreview);
  $('varSearch').addEventListener('input', P.renderVars);
  $('vars').addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (c && !c.classList.contains('nonnum')) P.insertVar(c.dataset.v);
  });
  $('paths').addEventListener('input', () => P.canvas.render());
  ['model', 'paths', 'scheme', 'missing', 'maxIter'].forEach(id => $(id).addEventListener('input', () => { if (state.rows.length) P.renderMeasureBar(); }));
  $('btnRun').addEventListener('click', P.runAll);
  ['model', 'paths'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) P.runAll(); }));
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => P.setMode(b.dataset.mode)));

  // Khung vẽ mô hình
  P.canvas.init({
    parseModel: () => P.parseModel($('model').value, true),
    getPaths: () => $('paths').value,
    setModel: v => { $('model').value = v; },
    setPaths: v => { $('paths').value = v; },
    onChange: () => { P.updateModelPreview(); if (state.rows.length) P.renderMeasureBar(); },
    getResult: () => (state.result && !P.isStale() ? state.result : null),
    getPvals: () => P.bootPvals(),
    fmt: v => P.util.f3(v), headers: () => state.headers, isNumeric: h => !!state.numeric[h],
    prefixOf: P.prefixOf, toast: P.util.toast, autoModel: P.autoModel,
    fileKey: () => state.fileName + ':' + state.headers.join('|')
  });

  // ---------- Bước 3: độ đo ----------
  $('btnRunAll').addEventListener('click', P.runAll);
  $('btnExport').addEventListener('click', P.exportExcel);
  $('measures').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) P.runMeasure(b.dataset.m); });
  $('exclBanner').addEventListener('click', e => {
    const m = e.target.closest('[data-m]'); if (m) return P.runMeasure(m.dataset.m);
    const a = e.target.closest('[data-act]'); if (a) P.rowsAction(a);
  });
  $('results').addEventListener('change', e => {
    const a = e.target.closest('[data-act="pick"]'); if (a) return P.rowsAction(a);
    if (e.target.closest('.bt-set, .bt-dirs')) P.bootChange(e.target);
  });
  $('results').addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (a && a.dataset.act !== 'pick') return P.rowsAction(a);
    const bt = e.target.closest('[data-bt]'); if (bt) return P.bootAction(bt);
    const rm = e.target.closest('[data-rm]'); if (rm) return P.removeItem(rm.dataset.rm);
    const cp = e.target.closest('[data-copy]'); if (cp) return P.copySection(+cp.dataset.copy);
    if (e.target.closest('[data-png]')) {
      const fig = P.visibleSections().find(s => s.figure);
      if (fig) P.diagram.toPNG(fig.figure, 'so_do_mo_hinh.png');
    }
  });

  // ---------- Chung ----------
  document.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => P.setDec(b.dataset.dec)));
  $('btnTheme').addEventListener('click', P.toggleTheme);
  window.addEventListener('scroll', P.spy, { passive: true });

  // Khởi động
  P.setMode(store.get('ptsl-mode') || 'draw');
  const savedDec = store.get('ptsl-dec');
  if (savedDec) P.setDec(savedDec);
  P.updateModelPreview();
  P.renderMeasureBar();
})(window.PTSL);
