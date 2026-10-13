/*
 * model/text-editor.js — Chế độ "Nhập dạng chữ": danh sách biến, xem trước thang đo,
 * tự nhận diện thang đo theo tiền tố, chèn biến vào ô khai báo.
 */
(function (P) {
  'use strict';
  const { $, esc, toast } = P.util;
  const state = P.state;

  P.renderVars = function () {
    const q = $('varSearch').value.trim().toLowerCase();
    $('vars').innerHTML = state.headers.filter(h => !q || h.toLowerCase().includes(q)).map(h =>
      `<button type="button" class="chip ${state.numeric[h] ? '' : 'nonnum'}" data-v="${esc(h)}" title="${state.numeric[h] ? 'Chèn vào ô thang đo' : 'Không phải biến dạng số'}">${esc(h)}</button>`
    ).join('');
    P.updateModelPreview();
  };

  P.autoModel = function () {
    const groups = {};
    state.headers.forEach(h => {
      if (!state.numeric[h]) return;
      const p = P.prefixOf(h);
      if (p) (groups[p] = groups[p] || []).push(h);
    });
    const lines = Object.entries(groups).filter(([, v]) => v.length >= 2).map(([k, v]) => `${k}: ${v.join(', ')}`);
    $('model').value = lines.join('\n');
    if (!lines.length) toast('Không nhận diện được thang đo từ tên biến. Hãy khai báo thủ công.', true);
    P.updateModelPreview();
  };

  P.updateModelPreview = function () {
    const blocks = P.parseModel($('model').value, true);
    const used = new Set(), dup = new Set();
    blocks.forEach(b => b.items.forEach(i => { if (used.has(i)) dup.add(i); used.add(i); }));
    $('consCount').textContent = blocks.length ? `${blocks.length} thang đo · ${used.size} biến` : '';
    $('consPreview').innerHTML = blocks.length ? blocks.map(b => {
      const bad = b.items.filter(i => !state.headers.includes(i) || !state.numeric[i]);
      const notes = [];
      if (bad.length) notes.push(`Không tìm thấy hoặc không phải biến số: ${bad.join(', ')}`);
      const d = b.items.filter(i => dup.has(i));
      if (d.length) notes.push(`Biến nằm ở nhiều thang đo: ${d.join(', ')}`);
      if (b.items.length === 1 && !bad.length) notes.push('Thang đo một biến: không tính được α, CR');
      return `<div class="con ${bad.length || d.length ? 'err' : ''}"><span class="con-lv">${esc(b.name)}</span>` +
        `<div class="con-items">${b.items.map(i => `<span class="${bad.includes(i) ? 'missing' : ''}">${esc(i)}</span>`).join('')}` +
        (notes.length ? `<div class="con-note" style="${b.items.length === 1 && !bad.length && !d.length ? 'color:var(--ink-2)' : ''}">${esc(notes.join('. '))}</div>` : '') +
        `</div></div>`;
    }).join('') : '<div class="empty">Chưa có thang đo nào. Gõ vào ô bên cạnh hoặc bấm “Tự nhận diện theo tên biến”.</div>';
    document.querySelectorAll('#vars .chip').forEach(c => c.classList.toggle('used', used.has(c.dataset.v)));
    if (P.canvas) P.canvas.render();
  };

  // Chèn tên biến tại con trỏ trong ô khai báo
  P.insertVar = function (v) {
    const ta = $('model');
    const before = ta.value.slice(0, ta.selectionStart), after = ta.value.slice(ta.selectionEnd);
    const sep = before === '' || /\n$/.test(before) ? '' : /[:,]$/.test(before) ? ' ' : /[:,]\s+$/.test(before) ? '' : ', ';
    ta.value = before + sep + v + after;
    ta.focus(); ta.selectionStart = ta.selectionEnd = (before + sep + v).length;
    P.updateModelPreview();
  };

  // Bỏ một biến khỏi mô hình (nút × trong bảng Outer loading)
  P.removeItem = function (item) {
    const blocks = P.parseModel($('model').value, true)
      .map(b => ({ name: b.name, items: b.items.filter(i => i !== item) }))
      .filter(b => b.items.length);
    $('model').value = blocks.map(b => `${b.name}: ${b.items.join(', ')}`).join('\n');
    P.updateModelPreview();
    if (!P.compute()) return;
    P.showTab(state.activeTab || 'loading');
    toast(`Đã loại ${item} và tính lại`);
  };
})(window.PTSL);
