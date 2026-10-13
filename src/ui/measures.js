/*
 * ui/measures.js — Bước 3: thanh nút độ đo (mỗi nút chạy một độ đo), trạng thái từng nút,
 * hiển thị bảng kết quả của độ đo đang chọn.
 */
(function (P) {
  'use strict';
  const { $, esc, toast, fmtNum } = P.util;
  const state = P.state;

  P.MEASURES = [
    { key: 'overview', group: 'Tổng hợp', title: 'Tổng quan', desc: 'Bảng kiểm, sơ đồ mô hình, đoạn văn mô tả' },
    { key: 'loading', group: 'Mô hình đo lường', title: 'Outer loading', desc: 'Hệ số tải ngoài, ngưỡng ≥ 0,708' },
    { key: 'reliab', group: 'Mô hình đo lường', title: 'Độ tin cậy & AVE', desc: "Cronbach's α, rho_A, CR, AVE" },
    { key: 'alpha', group: 'Mô hình đo lường', title: "Cronbach's α chi tiết", desc: 'Tương quan biến-tổng, α nếu loại biến' },
    { key: 'disc', group: 'Mô hình đo lường', title: 'Giá trị phân biệt', desc: 'HTMT và Fornell-Larcker' },
    { key: 'cross', group: 'Mô hình đo lường', title: 'Cross loadings', desc: 'Hệ số tải chéo giữa các thang đo' },
    { key: 'ovif', group: 'Mô hình đo lường', title: 'VIF (outer)', desc: 'Tham khảo; dùng cho thang đo cấu tạo' },
    { key: 'struct', group: 'Mô hình cấu trúc', title: 'Hệ số β, R², f²', desc: 'Kèm VIF inner', needsPaths: true },
    { key: 'boot', group: 'Mô hình cấu trúc', title: 'Bootstrapping', desc: 'T, p-value, khoảng tin cậy, tác động gián tiếp' },
    { key: 'desc', group: 'Dữ liệu', title: 'Thống kê mô tả', desc: 'N, trung bình, độ lệch chuẩn, skewness' },
    { key: 'rows', group: 'Dữ liệu', title: 'Dòng đáng ngờ', desc: 'Tìm, loại và tính lại' }
  ];
  const LONG = ['rows', 'boot'];           // độ đo chạy lâu: không nằm trong "Chạy tất cả"

  P.runMeasure = function (key) {
    const def = P.MEASURES.find(x => x.key === key);
    if (P.isStale() && !P.compute()) return;
    if (def.needsPaths && !state.result.paths.length) {
      toast('Chưa khai báo quan hệ giữa các thang đo ở bước 2, nên không có hệ số β, R², f².', true);
      return;
    }
    state.ran.add(key);
    P.showTab(key);
    if (key === 'rows' && (!state.scan || state.scan.sig !== state.sig) && !state.scanning) P.startScan();
    if (key === 'boot' && !P.bootFresh() && !state.booting) P.startBoot();
  };

  P.runAll = function () {
    if (!P.compute()) return;
    P.MEASURES.forEach(x => { if (!LONG.includes(x.key) && (!x.needsPaths || state.result.paths.length)) state.ran.add(x.key); });
    P.showTab(state.activeTab && !LONG.includes(state.activeTab) ? state.activeTab : 'overview');
    $('step3').scrollIntoView({ block: 'start' });
    toast('Đã chạy tất cả độ đo (Bootstrapping và Dòng đáng ngờ chạy riêng)');
  };

  function statusOf(x, stale) {
    const noPaths = x.needsPaths && !$('paths').value.trim();
    if (noPaths) return '<span class="mst idle">Cần khai báo quan hệ</span>';
    if (x.key === 'boot' && state.booting) return '<span class="mst idle">Đang chạy…</span>';
    if (x.key === 'rows' && state.scanning) return '<span class="mst idle">Đang quét…</span>';
    if (!state.ran.has(x.key)) return '<span class="mst idle">Chưa chạy</span>';
    if (stale) return '<span class="mst warn">Cần chạy lại</span>';
    if (x.key === 'rows') {
      if (!state.scan || state.scan.sig !== state.sig) return '<span class="mst idle">Chưa quét</span>';
      const nh = state.scan.rows.filter(r => r.hard).length;
      return nh ? `<span class="mst bad">${nh} dòng vi phạm tiêu chí</span>` : '<span class="mst good">Không có dòng vi phạm</span>';
    }
    if (x.key === 'boot') {
      if (!P.bootFresh()) return '<span class="mst idle">Chưa chạy</span>';
      const res = state.boot.result, ns = res.stats.paths.filter(p => !(p.p < res.opts.alpha)).length;
      return ns ? `<span class="mst warn">${ns} quan hệ không có ý nghĩa</span>` : `<span class="mst good">${res.done} mẫu</span>`;
    }
    const t = state.tables.find(y => y.key === x.key);
    const rows = t ? t.sections.flatMap(s => s.rows || []) : [];
    const skip = ['overview', 'desc', 'ovif'].includes(x.key);
    const nb = skip ? 0 : P.assess.countCls(rows, 'bad'), nw = skip || x.key === 'alpha' ? 0 : P.assess.countCls(rows, 'warn');
    return nb ? `<span class="mst bad">${nb} chưa đạt</span>` : nw ? `<span class="mst warn">${nw} cần xem lại</span>` : '<span class="mst good">Đã chạy</span>';
  }

  P.renderMeasureBar = function () {
    const stale = !!state.result && state.sig !== P.currentSig();
    const groups = [...new Set(P.MEASURES.map(x => x.group))];
    $('measures').innerHTML = groups.map(g => `<div class="mgroup"><div class="mgroup-t">${esc(g)}</div><div class="mgrid">` +
      P.MEASURES.filter(x => x.group === g).map(x => {
        const noPaths = x.needsPaths && !$('paths').value.trim();
        return `<button type="button" class="mbtn ${state.activeTab === x.key ? 'on' : ''} ${noPaths ? 'dim' : ''}" data-m="${x.key}">` +
          `<span class="mt">${esc(x.title)}</span><span class="md">${esc(x.desc)}</span>${statusOf(x, stale)}</button>`;
      }).join('') + `</div></div>`).join('');
    // Thanh thông báo dòng bị loại
    const ex = [...state.excluded].sort((a, b) => a - b);
    $('exclBanner').classList.toggle('hidden', !ex.length);
    if (!ex.length) $('exclBanner').innerHTML = '';
    else {
      const list = ex.slice(0, 8).map(i => i + 2).join(', ') + (ex.length > 8 ? '…' : '');
      $('exclBanner').innerHTML = `<span>Đang loại <b>${ex.length} dòng</b> khỏi phân tích (dòng Excel ${list}). Mọi độ đo tính trên ${state.rows.length - ex.length} dòng còn lại.</span>` +
        `<span class="row gap"><button class="btn sm" data-m="rows">Xem danh sách</button><button class="btn sm" data-act="restoreAll">Khôi phục tất cả</button></span>`;
    }
    P.markSteps();
  };

  // Vẽ một phần (bảng / hình / đoạn văn) của kết quả
  P.renderSection = function (sec, si) {
    let h = `<div class="sec"><div class="sec-head"><h3>${esc(sec.title || '')}</h3><div class="row gap">`;
    if (sec.figure) h += `<button class="btn sm" data-png="1">Tải ảnh PNG</button>`;
    else if (sec.prose) h += `<button class="btn sm" data-copy="${si}">Sao chép đoạn văn</button>`;
    else h += `<button class="btn sm" data-copy="${si}" title="Dán được vào Word hoặc Excel">Sao chép bảng</button>`;
    h += `</div></div>`;
    if (sec.figure) {
      h += `<div class="figure">${sec.figure}</div><div class="legend-line">` +
        `<span><i style="background:#DCE6FB;border:1px solid #2350C2;border-radius:50%"></i>Thang đo (biến tiềm ẩn)</span>` +
        `<span><i style="background:#FFF4D2;border:1px solid #C99A2E"></i>Biến quan sát</span>` +
        `<span><i style="background:var(--good)"></i>Loading ≥ 0,708</span><span><i style="background:var(--warn)"></i>0,4–0,708</span>` +
        `<span><i style="background:var(--bad)"></i>&lt; 0,4</span>` +
        (state.result.paths.length ? `<span><i style="background:#2350C2"></i>Hệ số β${P.bootFresh() ? ' (p-value)' : ''}</span>` : '') + `</div>`;
    } else if (sec.prose) {
      h += `<div class="prose">${sec.prose.map(p => `<p>${esc(p)}</p>`).join('')}</div>`;
    } else if (!sec.rows.length) {
      h += `<div class="empty">${esc(sec.empty || 'Không có dữ liệu.')}</div>`;
    } else {
      h += '<div class="tablebox"><table class="res"><thead><tr>' + sec.head.map(x => `<th>${esc(x)}</th>`).join('') + '</tr></thead><tbody>';
      for (const row of sec.rows) {
        h += '<tr>' + row.map((c, i) => {
          let content = c.v === null || c.v === undefined ? '' : (typeof c.v === 'number' ? (c.p ? P.fmtP(c.v) : fmtNum(c.v)) : esc(c.v));
          if (i === 0 && row.removable) content += `<button class="x" title="Loại ${esc(row.removable)} khỏi mô hình và tính lại" aria-label="Loại ${esc(row.removable)}" data-rm="${esc(row.removable)}">×</button>`;
          return `<td class="${c.cls || ''}">${content}</td>`;
        }).join('') + '</tr>';
      }
      h += '</tbody></table></div>';
    }
    if (sec.note) h += `<p class="note">${sec.note}</p>`;
    return h + '</div>';
  };

  P.showTab = function (key) {
    state.activeTab = key;
    P.renderMeasureBar();
    const def = P.MEASURES.find(x => x.key === key);
    let html = `<div class="res-head"><h3>${esc(def.title)}</h3></div>`;
    if (state.result && !state.result.converged) html += '<div class="banner">Thuật toán chưa hội tụ. Hãy tăng số vòng lặp tối đa trong “Tùy chọn thuật toán” hoặc xem lại mô hình.</div>';
    if (key === 'rows') { $('results').innerHTML = html + P.renderRows(); return; }
    if (key === 'boot') { $('results').innerHTML = html + P.renderBoot(); return; }
    const t = state.tables.find(x => x.key === key);
    if (!t) { $('results').innerHTML = html + '<p class="note">Độ đo này không áp dụng cho mô hình hiện tại.</p>'; return; }
    html += (t.html || '') + t.sections.map(P.renderSection).join('');
    $('results').innerHTML = html;
  };

  // Bảng đang hiển thị (để sao chép)
  P.visibleSections = function () {
    if (state.activeTab === 'boot') return P.bootVisibleSections();
    if (state.activeTab === 'rows') return state.sensitivity ? [state.sensitivity] : [];
    const t = state.tables.find(x => x.key === state.activeTab);
    return t ? t.sections : [];
  };
})(window.PTSL);
