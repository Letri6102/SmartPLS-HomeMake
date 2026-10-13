/*
 * data/file-loader.js — Nhập file Excel/CSV, lưu bảng dữ liệu, xem trước,
 * và chuẩn bị dữ liệu số (xử lý ô trống, bỏ dòng bị loại) cho phân tích.
 */
(function (P) {
  'use strict';
  const { $, esc, toast, toNumber } = P.util;
  const state = P.state;

  P.setTable = function (aoa, label, sheetLabel) {
    if (aoa.length < 2) { toast('File không có dữ liệu (cần ít nhất 1 dòng tiêu đề và 1 dòng số liệu).', true); return; }
    let headers = aoa[0].map((h, i) => String(h ?? '').trim() || `Cot${i + 1}`);
    const seen = {};
    headers = headers.map(h => { if (seen[h]) { seen[h]++; return `${h}_${seen[h]}`; } seen[h] = 1; return h; });
    const width = headers.length;
    const rows = aoa.slice(1).map(r => Array.from({ length: width }, (_, j) => r[j]))
      .filter(r => r.some(v => v !== undefined && v !== null && String(v).trim() !== ''));
    Object.assign(state, {
      headers, rows, numeric: {}, result: null, sig: '', ran: new Set(), excluded: new Set(),
      baseline: null, scan: null, selected: new Set(), activeTab: null, boot: null
    });
    $('results').innerHTML = '';
    headers.forEach((h, j) => {
      let num = 0, filled = 0;
      for (const r of rows) {
        const v = r[j];
        if (v === undefined || v === null || String(v).trim() === '') continue;
        filled++; if (Number.isFinite(toNumber(v))) num++;
      }
      state.numeric[h] = filled > 0 && num / filled >= 0.95;
    });
    const nNum = headers.filter(h => state.numeric[h]).length;
    $('drop').classList.add('hidden');
    $('fileCard').classList.remove('hidden');
    $('fcName').textContent = label;
    $('fcMeta').textContent = `${rows.length} phiếu trả lời · ${headers.length} biến (${nNum} biến số)` + (sheetLabel ? ` · sheet ${sheetLabel}` : '');
    $('preview').classList.add('hidden');
    $('btnPreview').textContent = 'Xem dữ liệu';
    P.renderVars();
    P.unlock(3);
    P.renderMeasureBar();
    if (P.canvas) P.canvas.reset();
    if (!$('model').value.trim()) P.autoModel(); else P.updateModelPreview();
    toast(`Đã nhập ${rows.length} phiếu từ ${label}`);
  };

  P.loadSheet = function (name) {
    const aoa = XLSX.utils.sheet_to_json(state.workbook.Sheets[name], { header: 1, raw: true, defval: '' });
    P.setTable(aoa, state.fileName, name);
  };

  P.handleFile = function (file) {
    if (!file) return;
    state.fileName = file.name;
    $('model').value = '';
    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    if (ext === 'csv' || ext === 'txt') {
      reader.onload = e => { $('sheetWrap').classList.add('hidden'); P.setTable(P.parseCSV(e.target.result), file.name); };
      reader.readAsText(file, 'utf-8');
    } else {
      if (!window.XLSX) {
        toast('Không tải được thư viện đọc Excel vì máy đang offline. Hãy lưu file dạng CSV rồi nhập lại.', true);
        return;
      }
      reader.onload = e => {
        try { state.workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' }); }
        catch (err) { toast('Không đọc được file: ' + err.message, true); return; }
        const names = state.workbook.SheetNames;
        $('sheet').innerHTML = names.map(n => `<option>${esc(n)}</option>`).join('');
        $('sheetWrap').classList.toggle('hidden', names.length < 2);
        P.loadSheet(names[0]);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  P.renderPreview = function () {
    const max = 20;
    const head = '<tr>' + state.headers.map(h => `<th>${esc(h)}</th>`).join('') + '</tr>';
    const body = state.rows.slice(0, max).map(r => '<tr>' + r.map(v => `<td>${esc(v ?? '')}</td>`).join('') + '</tr>').join('');
    $('preview').innerHTML = `<table>${head}${body}</table>` +
      (state.rows.length > max ? `<p class="note" style="padding:6px 12px">Đang hiện ${max} trên ${state.rows.length} dòng</p>` : '');
  };

  // Chỉ số các dòng đang được dùng (chưa bị loại)
  P.includedIdx = (excl = state.excluded) => state.rows.map((_, i) => i).filter(i => !excl.has(i));

  // Dữ liệu số cho các biến quan sát, đã xử lý ô trống
  P.buildData = function (blocks, missing, excl = state.excluded) {
    const items = blocks.flatMap(b => b.items);
    const colIdx = Object.fromEntries(state.headers.map((h, i) => [h, i]));
    const idx = P.includedIdx(excl);
    let raw = items.map(it => idx.map(i => toNumber(state.rows[i][colIdx[it]])));
    const n0 = idx.length;
    let nMissing = 0; raw.forEach(c => c.forEach(v => { if (!Number.isFinite(v)) nMissing++; }));
    if (missing === 'listwise') {
      const keep = [];
      for (let i = 0; i < n0; i++) if (raw.every(c => Number.isFinite(c[i]))) keep.push(i);
      raw = raw.map(c => keep.map(i => c[i]));
    } else {
      raw = raw.map(c => {
        const v = c.filter(Number.isFinite), m = v.length ? P.stats.mean(v) : 0;
        return c.map(x => (Number.isFinite(x) ? x : m));
      });
    }
    const data = {};
    items.forEach((it, k) => { data[it] = raw[k]; });
    return { data, n: raw[0].length, n0, nMissing };
  };

  // Cột mã phiếu (STT / ID…) nếu có
  P.ID_RE = /^(stt|id|ma|mã|maphieu|ma_phieu|mã phiếu|ma phieu|code|respondent)$/i;
  P.rowLabel = function (i) {
    const ic = state.headers.findIndex(h => P.ID_RE.test(h.trim()));
    return ic >= 0 ? String(state.rows[i][ic] ?? '') : '';
  };
})(window.PTSL);
