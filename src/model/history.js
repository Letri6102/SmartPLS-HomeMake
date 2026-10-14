/*
 * model/history.js — Hoàn tác / làm lại (Ctrl+Z, Ctrl+Y hoặc Ctrl+Shift+Z) cho phần khai báo mô hình:
 * thang đo, biến, quan hệ và bố cục trên khung vẽ.
 * Mỗi lần khung vẽ vẽ lại, trạng thái được so với bản ghi gần nhất; khác thì lưu thành một bước mới.
 * Ghi có trễ ngắn để một lần kéo thả hoặc một chuỗi gõ phím liên tục chỉ thành một bước.
 * Khi con trỏ đang ở trong ô nhập chữ, Ctrl+Z là hoàn tác của chính ô đó (của trình duyệt).
 */
(function (P) {
  'use strict';
  const { $, toast } = P.util;
  const state = P.state;
  const LIMIT = 100, DELAY = 400;
  let stack = [], idx = -1, key = null, timer = null;

  const fileKey = () => state.fileName + ':' + state.headers.join('|');
  function snap() {
    const cv = P.canvas.getSnapshot();
    return { model: $('model').value, paths: $('paths').value, layout: cv.layout, manual: cv.manual };
  }
  const same = (a, b) => !!a && !!b && a.model === b.model && a.paths === b.paths && a.manual === b.manual &&
    JSON.stringify(a.layout) === JSON.stringify(b.layout);

  function commit() {
    clearTimeout(timer); timer = null;
    if (!state.headers.length) return;
    if (key !== fileKey()) { key = fileKey(); stack = []; idx = -1; }     // file dữ liệu mới: bắt đầu lại
    const s = snap();
    if (same(s, stack[idx])) return;
    stack = stack.slice(0, idx + 1);
    stack.push(s);
    if (stack.length > LIMIT) stack.shift();
    idx = stack.length - 1;
    updateButtons();
  }

  // Khung vẽ gọi sau mỗi lần vẽ lại
  P.historyTouch = function () {
    clearTimeout(timer);
    timer = setTimeout(commit, DELAY);
  };

  function restore(s) {
    $('model').value = s.model;
    $('paths').value = s.paths;
    P.canvas.setSnapshot({ layout: s.layout, manual: s.manual });
    P.updateModelPreview();                       // vẽ lại khung + xem trước thang đo
    if (state.rows.length) P.renderMeasureBar();
    clearTimeout(timer); timer = null;            // trạng thái này đã có trong lịch sử
    updateButtons();
  }

  P.undo = function () {
    if (timer) commit();                          // lưu nốt thao tác vừa làm trước khi hoàn tác
    if (idx <= 0) { toast('Không còn thao tác nào để hoàn tác'); return; }
    idx--; restore(stack[idx]);
    toast('Đã hoàn tác');
  };
  P.redo = function () {
    if (timer) commit();
    if (idx >= stack.length - 1) { toast('Không còn thao tác nào để làm lại'); return; }
    idx++; restore(stack[idx]);
    toast('Đã làm lại');
  };

  function updateButtons() {
    const u = $('cvUndo'), r = $('cvRedo');
    if (u) u.disabled = idx <= 0;
    if (r) r.disabled = idx >= stack.length - 1;
  }

  P.initHistory = function () {
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      const el = document.activeElement;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;   // để ô nhập tự hoàn tác
      if ($('impModal') && !$('impModal').classList.contains('hidden')) return;
      if (!state.headers.length) return;
      e.preventDefault();
      if (k === 'y' || (k === 'z' && e.shiftKey)) P.redo(); else P.undo();
    });
    updateButtons();
  };
})(window.PTSL);
