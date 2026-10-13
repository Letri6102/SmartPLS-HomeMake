/*
 * ui/rows-view.js — Độ đo "Dòng đáng ngờ": quét, hiển thị danh sách, chọn, loại và khôi phục dòng.
 * Phần tính toán nằm ở analysis/rowcheck.js.
 */
(function (P) {
  'use strict';
  const { $, esc, toast, f3, toNumber } = P.util;
  const state = P.state;

  const FLAG_NAME = { straight: 'Trả lời một kiểu', range: 'Không nhất quán trong thang đo', maha: 'Ngoại lai đa biến', miss: 'Thiếu nhiều câu', influence: 'Ảnh hưởng lớn' };

  // Ngưỡng mặc định; ngưỡng không nhất quán = 1/4 độ rộng thang đo (VD thang 1–5: 1,0)
  function scanDefaults() {
    let lo = Infinity, hi = -Infinity;
    try {
      const items = P.parseModel($('model').value, true).flatMap(b => b.items);
      items.forEach(it => { const c = state.headers.indexOf(it); state.rows.forEach(r => { const v = toNumber(r[c]); if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
    } catch (e) { /* bỏ qua */ }
    const range = Number.isFinite(hi - lo) && hi > lo ? hi - lo : 4;
    return { sdMax: 0.3, incMin: +(0.25 * range).toFixed(2), pMaha: 0.001, missMax: 0.15 };
  }

  function scanOpts() {
    const g = id => { const el = $(id); return el ? el.value : null; };
    const d = scanDefaults();
    return {
      sdMax: +(g('rcSd') ?? d.sdMax), incMin: +(g('rcInc') ?? d.incMin),
      pMaha: +(g('rcP') ?? d.pMaha), missMax: g('rcMiss') !== null ? +g('rcMiss') / 100 : d.missMax,
      loo: $('rcLoo') ? $('rcLoo').checked : true
    };
  }

  function scanSettings(o) {
    return `<details class="adv rc-set"><summary>Tiêu chí phát hiện (đặt trước khi xem kết quả)</summary><div class="rc-grid">
      <label>Trả lời một kiểu: độ lệch chuẩn của dòng ≤ <input type="number" id="rcSd" step="0.05" min="0" value="${o.sdMax}"></label>
      <label>Không nhất quán trong thang đo: độ lệch chuẩn trung bình giữa các câu cùng thang đo ≥ <input type="number" id="rcInc" step="0.1" min="0" value="${o.incMin}"></label>
      <label>Ngoại lai đa biến: p của D² &lt; <input type="number" id="rcP" step="0.001" min="0" value="${o.pMaha}"></label>
      <label>Thiếu câu trả lời: &gt; <input type="number" id="rcMiss" step="5" min="0" max="100" value="${Math.round(o.missMax * 100)}"> %</label>
      <label class="ck"><input type="checkbox" id="rcLoo" ${o.loo ? 'checked' : ''}> Thử bỏ từng dòng để đo mức ảnh hưởng (chậm hơn với dữ liệu lớn)</label>
      <div><button class="btn sm" data-act="rescan">Quét lại với tiêu chí này</button></div></div></details>`;
  }

  P.startScan = async function () {
    let m;
    try { m = P.readModel(); } catch (e) { toast(e.message, true); return; }
    const opts = scanOpts();
    const idx = P.includedIdx();
    const raw = {};
    m.blocks.flatMap(b => b.items).forEach(it => { const c = state.headers.indexOf(it); raw[it] = idx.map(i => toNumber(state.rows[i][c])); });
    state.scanning = true; state.scanOptsUsed = opts;
    P.renderMeasureBar();
    if (state.activeTab === 'rows') $('results').innerHTML = `<div class="res-head"><h3>Dòng đáng ngờ</h3></div>${scanSettings(opts)}<div class="progress"><div class="bar" id="scanBar"></div><span id="scanTxt">Đang quét ${idx.length} dòng…</span></div>`;
    const sig = state.sig;
    try {
      const r = await P.rowcheck.scan({ blocks: m.blocks, paths: m.paths, plsOpts: m.plsOpts, raw, rowIds: idx }, opts, (d, n) => {
        const b = $('scanBar'), t = $('scanTxt');
        if (b) b.style.width = (100 * d / n) + '%';
        if (t) t.textContent = `Đang thử bỏ từng dòng: ${d}/${n}`;
      });
      r.sig = sig; r.blocks = m.blocks;
      state.scan = r;
      state.selected = new Set();
    } catch (e) { toast('Lỗi khi quét: ' + e.message, true); }
    state.scanning = false;
    if (state.activeTab === 'rows') P.showTab('rows'); else P.renderMeasureBar();
  };

  P.renderRows = function () {
    const sc = state.scan;
    if (state.scanning || !sc || sc.sig !== state.sig) {
      return scanSettings(scanOpts()) + `<div class="progress"><div class="bar" id="scanBar"></div><span id="scanTxt">Đang chuẩn bị quét…</span></div>`;
    }
    const o = state.scanOptsUsed;
    let h = scanSettings(o);
    h += `<div class="rc-note"><b>Cách dùng đúng:</b> bốn tiêu chí đầu (trả lời một kiểu, không nhất quán trong thang đo, ngoại lai đa biến, thiếu câu) độc lập với kết quả và có thể dùng làm căn cứ loại phiếu nếu bạn đặt tiêu chí trước khi phân tích. ` +
      `“Ảnh hưởng lớn” chỉ cho biết bỏ dòng đó thì α, CR, AVE thay đổi nhiều; <b>không nên loại dòng chỉ vì lý do này</b>, vì như vậy là chọn dữ liệu theo kết quả. Sau khi loại, hãy báo cáo cả kết quả trước và sau (bảng so sánh bên dưới).</div>`;

    const counts = {}; sc.rows.forEach(r => r.flags.forEach(f => { counts[f.type] = (counts[f.type] || 0) + 1; }));
    const flagged = sc.rows.filter(r => r.flags.length);
    const hard = flagged.filter(r => r.hard);
    h += `<div class="rc-sum">` + ['straight', 'range', 'maha', 'miss', 'influence'].map(k =>
      `<div class="rc-stat ${k === 'influence' ? 'soft' : ''}"><b>${counts[k] || 0}</b><span>${FLAG_NAME[k]}</span></div>`).join('') +
      `<div class="rc-stat total"><b>${hard.length}</b><span>Dòng vi phạm ít nhất 1 tiêu chí</span></div></div>`;
    if (!sc.mahaOk) h += `<p class="note">Không tính được khoảng cách Mahalanobis vì các biến đa cộng tuyến hoàn hảo.</p>`;

    const list = (state.scanFilter === 'hard' ? hard : flagged).slice().sort((a, b) => b.score - a.score);
    h += `<div class="rc-bar"><div class="seg" role="group" aria-label="Lọc">` +
      `<button data-act="filter" data-v="any" class="${state.scanFilter === 'any' ? 'on' : ''}">Mọi dấu hiệu (${flagged.length})</button>` +
      `<button data-act="filter" data-v="hard" class="${state.scanFilter === 'hard' ? 'on' : ''}">Vi phạm tiêu chí (${hard.length})</button></div>` +
      `<span class="row gap"><button class="btn sm" data-act="selHard">Chọn các dòng vi phạm tiêu chí</button>` +
      `<button class="btn sm" data-act="selNone">Bỏ chọn</button>` +
      `<button class="btn sm danger" data-act="exclude" ${state.selected.size ? '' : 'disabled'}>Loại ${state.selected.size || ''} dòng đã chọn và tính lại</button></span></div>`;

    if (!list.length) h += '<div class="empty">Không có dòng nào có dấu hiệu theo các tiêu chí hiện tại.</div>';
    else {
      const showId = state.headers.some(x => P.ID_RE.test(x.trim()));
      h += `<div class="tablebox"><table class="res rc-table"><thead><tr><th><span class="sr">Chọn</span></th><th>Dòng Excel</th>${showId ? '<th>Mã</th>' : ''}<th>Câu trả lời</th><th>Dấu hiệu</th><th>Nếu bỏ dòng này</th></tr></thead><tbody>`;
      for (const r of list) {
        let p = 0;
        const ans = sc.blocks.map(b => {
          const v = b.items.map(() => r.vals[p++]);
          const ok = v.filter(Number.isFinite), lo = Math.min(...ok), hi = Math.max(...ok);
          const wide = ok.length > 1 && P.stats.sd(ok) >= o.incMin;
          return `<span class="ans"><i>${esc(b.name)}</i>${v.map(x => !Number.isFinite(x) ? '<u>·</u>' : `<u class="${wide && (x === lo || x === hi) ? 'ext' : ''}">${x}</u>`).join('')}</span>`;
        }).join('');
        const flags = r.flags.map(f => `<span class="flag ${f.soft ? 'soft' : ''}" title="${esc(f.text)}">${esc(f.text)}</span>`).join('');
        const eff = r.effects.slice(0, 2).map(e => `${esc(e.label)} ${e.d >= 0 ? '+' : ''}${f3(e.d)}`).join('<br>') || '<span class="muted">—</span>';
        h += `<tr class="${state.selected.has(r.rowId) ? 'sel' : ''}"><td><input type="checkbox" data-act="pick" data-i="${r.rowId}" ${state.selected.has(r.rowId) ? 'checked' : ''} aria-label="Chọn dòng ${r.rowId + 2}"></td>` +
          `<td>${r.rowId + 2}</td>${showId ? `<td>${esc(P.rowLabel(r.rowId))}</td>` : ''}<td class="ans-cell">${ans}</td><td class="flags">${flags}</td><td class="eff">${eff}</td></tr>`;
      }
      h += '</tbody></table></div>';
      h += `<p class="note">“Dòng Excel” là số dòng trong file gốc (dòng 1 là tiêu đề). Số in đỏ là giá trị cao nhất và thấp nhất trong những thang đo mà phiếu trả lời không nhất quán. Cột cuối cho biết chỉ số thay đổi thế nào nếu bỏ riêng dòng đó.</p>`;
    }

    const ex = [...state.excluded].sort((a, b) => a - b);
    if (ex.length) {
      h += `<div class="sec"><div class="sec-head"><h3>Dòng đang bị loại (${ex.length})</h3><button class="btn sm" data-act="restoreAll">Khôi phục tất cả</button></div><div class="chips">` +
        ex.map(i => `<span class="xchip">Dòng ${i + 2}${P.rowLabel(i) ? ` (${esc(P.rowLabel(i))})` : ''}<button data-act="restore" data-i="${i}" title="Khôi phục dòng này" aria-label="Khôi phục dòng ${i + 2}">×</button></span>`).join('') + `</div></div>`;
      if (state.sensitivity) h += P.renderSection(state.sensitivity, 0);
    }
    return h;
  };

  function setExcluded(next, msg) {
    state.excluded = next;
    if (!P.compute()) return;
    P.showTab('rows');
    if (!state.scanning) P.startScan();
    toast(msg);
  }

  P.rowsAction = function (el) {
    const act = el.dataset.act;
    if (act === 'pick') {
      const i = +el.dataset.i;
      el.checked ? state.selected.add(i) : state.selected.delete(i);
      el.closest('tr').classList.toggle('sel', el.checked);
      const b = document.querySelector('[data-act="exclude"]');
      if (b) { b.disabled = !state.selected.size; b.textContent = `Loại ${state.selected.size || ''} dòng đã chọn và tính lại`; }
      return;
    }
    if (act === 'filter') { state.scanFilter = el.dataset.v; P.showTab('rows'); return; }
    if (act === 'selHard') { state.scan.rows.filter(r => r.hard).forEach(r => state.selected.add(r.rowId)); P.showTab('rows'); return; }
    if (act === 'selNone') { state.selected = new Set(); P.showTab('rows'); return; }
    if (act === 'rescan') { state.scan = null; P.startScan(); return; }
    if (act === 'exclude') {
      const next = new Set([...state.excluded, ...state.selected]);
      const k = state.selected.size;
      state.selected = new Set();
      setExcluded(next, `Đã loại ${k} dòng và tính lại các độ đo`);
      return;
    }
    if (act === 'restore') { const next = new Set(state.excluded); next.delete(+el.dataset.i); setExcluded(next, `Đã khôi phục dòng ${+el.dataset.i + 2}`); return; }
    if (act === 'restoreAll') { setExcluded(new Set(), 'Đã khôi phục tất cả các dòng'); return; }
  };
})(window.PTSL);
