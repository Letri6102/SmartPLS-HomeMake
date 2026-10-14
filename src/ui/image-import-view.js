/*
 * ui/image-import-view.js — Hộp thoại "Vẽ lại mô hình từ ảnh":
 *   tải ảnh (nút, kéo thả, dán Ctrl+V) → nhận diện hình dạng → OCR → bảng kiểm tra / sửa → áp dụng vào khung vẽ.
 * Tính toán nằm ở model/image-analysis.js, model/image-ocr.js, model/image-import.js.
 */
(function (P) {
  'use strict';
  const { $, esc, toast } = P.util;
  const state = P.state;
  const SIDES = [['left', 'Trái'], ['right', 'Phải'], ['top', 'Trên'], ['bottom', 'Dưới']];
  const MAXW = 4000;
  let imp = null;            // { src, url, an, prop, ocrDone, ocrFailed, status }

  const numericHeaders = () => state.headers.filter(h => state.numeric[h]);
  const ctxOf = () => ({ headers: numericHeaders(), prefixOf: P.prefixOf, blocks: P.parseModel($('model').value, true) });

  function loadImage(file) {
    return new Promise((ok, fail) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => ok({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('Không đọc được ảnh')); };
      img.src = url;
    });
  }

  P.openImageImport = async function (file) {
    if (!state.headers.length) { toast('Hãy nhập file dữ liệu ở bước 1 trước, để trang ghép tên biến trong ảnh với cột dữ liệu.', true); return; }
    if (!file || !/^image\//.test(file.type)) { toast('Hãy chọn file ảnh (PNG, JPG…)', true); return; }
    let loaded;
    try { loaded = await loadImage(file); } catch (e) { toast(e.message, true); return; }
    const { img, url } = loaded;
    const k = Math.min(1, MAXW / Math.max(img.naturalWidth, img.naturalHeight));
    const src = document.createElement('canvas');
    src.width = Math.round(img.naturalWidth * k); src.height = Math.round(img.naturalHeight * k);
    const g = src.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, src.width, src.height);
    g.drawImage(img, 0, 0, src.width, src.height);
    if (imp && imp.url) URL.revokeObjectURL(imp.url);
    const an = P.imageAnalysis.analyze(g.getImageData(0, 0, src.width, src.height));
    imp = { src, url, an, prop: null, ocrDone: false, ocrFailed: false, keepLayout: true, token: Date.now() };
    $('impModal').classList.remove('hidden');
    document.body.classList.add('modal-open');
    if (!an.circles.length) {
      imp.status = 'Không tìm thấy thang đo nào (hình tròn / elip màu xanh) trong ảnh. Trang nhận diện tốt nhất với ảnh chụp sơ đồ của SmartPLS: thang đo màu xanh, biến quan sát trong hộp vàng.';
      imp.prop = { cons: [], paths: [], warnings: [], candidates: [] };
      imp.ocrDone = true;
      render(); return;
    }
    imp.status = `Tìm thấy ${an.circles.length} thang đo, ${an.boxes.length} hộp biến, ${an.paths.length} mũi tên. Đang đọc chữ trong ảnh (OCR)…`;
    render();
    runOcr(imp.token);
  };

  async function runOcr(token) {
    const { an, src } = imp;
    const regions = [];
    an.boxes.forEach(b => regions.push({ x1: b.x1, y1: b.y1, x2: b.x2 + 1, y2: b.y2 + 1 }));
    an.circles.forEach(c => regions.push(c.label ? { x1: c.label.x1 - 2, y1: c.label.y1 - 2, x2: c.label.x2 + 3, y2: c.label.y2 + 3 }
      : { x1: c.x - 2.6 * c.rx, y1: c.y + c.ry + 1, x2: c.x + 2.6 * c.rx, y2: c.y + c.ry + 0.9 * c.ry + 5 }));
    an.circles.forEach(c => regions.push({ x1: c.x - 0.85 * c.rx, y1: c.y - 0.5 * c.ry, x2: c.x + 0.85 * c.rx, y2: c.y + 0.5 * c.ry }));
    const ctx = ctxOf();
    const chars = new Set('0123456789');
    ctx.headers.forEach(h => h.split('').forEach(ch => chars.add(ch)));
    ctx.blocks.forEach(b => b.name.split('').forEach(ch => chars.add(ch)));
    let txt = null;
    try {
      txt = await P.ocrRegions(src, regions, [...chars].join(''), (d, n) => {
        if (!imp || imp.token !== token) return;
        setStatus(`Đang đọc chữ trong ảnh (OCR) ${d}/${n}…`);
      });
    } catch (e) {
      if (!imp || imp.token !== token) return;
      imp.ocrFailed = true;
      imp.status = 'Không chạy được bộ đọc chữ (OCR cần Internet để tải thư viện lần đầu). Hình dạng và mũi tên vẫn được nhận diện: hãy chọn tên thang đo cho từng hình tròn trong bảng.';
    }
    if (!imp || imp.token !== token) return;
    const nb = an.boxes.length, nc = an.circles.length;
    const ocr = txt ? { box: txt.slice(0, nb), below: txt.slice(nb, nb + nc), inner: txt.slice(nb + nc) } : null;
    imp.prop = P.imageImport.build(an, ocr || {}, ctx);
    if (!ocr) imp.prop.cons.forEach(c => { c.name = ''; c.items = []; });
    else imp.status = `Đã nhận diện ${imp.prop.cons.filter(c => c.name).length}/${nc} thang đo và ${an.paths.length} quan hệ. Hãy kiểm tra, sửa nếu cần, rồi bấm “Áp dụng”.`;
    imp.ocrDone = true;
    render();
  }

  function setStatus(t) { const el = $('impStatus'); if (el) el.textContent = t; }

  // ---------- Vẽ ----------
  function overlay() {
    const { an, prop } = imp, W = an.W, H = an.H;
    const lw = Math.max(1.5, W / 500);
    const cons = prop ? prop.cons : an.circles.map(c => ({ cid: c.id, name: '' }));
    const named = cid => (cons.find(c => c.cid === cid) || {}).name;
    let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs>
      <marker id="impAh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#E8590C"/></marker></defs>`;
    an.boxes.forEach(b => {
      const ok = b.circle >= 0 && named(b.circle);
      s += `<rect x="${b.x1 - 1}" y="${b.y1 - 1}" width="${b.w + 2}" height="${b.h + 2}" fill="none" stroke="${ok ? '#1C7A4A' : '#B3261E'}" stroke-width="${lw * 0.8}"/>`;
    });
    const paths = prop ? prop.paths : an.paths.map(p => ({ from: p.from, to: p.to, on: true, sure: p.sure }));
    paths.forEach(p => {
      if (!p.on) return;
      const A = an.circles[p.from], B = an.circles[p.to]; if (!A || !B) return;
      const [x1, y1] = P.imageAnalysis.edge(A, B.x - A.x, B.y - A.y), [x2, y2] = P.imageAnalysis.edge(B, A.x - B.x, A.y - B.y);
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#E8590C" stroke-width="${lw * 1.6}" ${p.sure ? '' : `stroke-dasharray="${lw * 4} ${lw * 3}"`} marker-end="url(#impAh)" opacity=".9"/>`;
    });
    an.circles.forEach((c, i) => {
      const nm = named(c.id);
      const fs = Math.max(11, Math.min(W, H) / 32);
      s += `<ellipse cx="${c.x}" cy="${c.y}" rx="${c.rx + lw * 1.5}" ry="${c.ry + lw * 1.5}" fill="none" stroke="#E8590C" stroke-width="${lw * 1.4}"/>`;
      const t = `#${i + 1}${nm ? ' ' + nm : ''}`, tw = t.length * fs * 0.62 + fs * 0.6;
      s += `<g><rect x="${c.x + c.rx * 0.6}" y="${c.y - c.ry - fs * 1.2}" width="${tw}" height="${fs * 1.3}" rx="${fs * 0.3}" fill="#E8590C"/>` +
        `<text x="${c.x + c.rx * 0.6 + fs * 0.3}" y="${c.y - c.ry - fs * 0.2}" font-size="${fs}" font-weight="700" fill="#fff" font-family="Arial,sans-serif">${esc(t)}</text></g>`;
    });
    return s + '</svg>';
  }

  function form() {
    const { prop, an } = imp;
    if (!imp.ocrDone) return `<div class="imp-wait"><div class="spinner"></div><p>Đang đọc chữ trong ảnh…</p><p class="note">Lần đầu cần Internet để tải bộ đọc chữ (khoảng vài MB).</p></div>`;
    if (!an.circles.length) return '<p class="note">Hãy thử ảnh khác, hoặc vẽ mô hình trực tiếp trên khung vẽ.</p>';
    const label = c => `#${an.circles.findIndex(x => x.id === c.cid) + 1}${c.name ? ' ' + c.name : ''}`;
    let h = `<datalist id="impNames">${prop.candidates.map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
    h += `<h4>Thang đo <span class="count">${prop.cons.length}</span></h4><div class="imp-table"><table><thead><tr><th>#</th><th>Tên</th><th>Biến quan sát</th><th>Phía biến</th></tr></thead><tbody>`;
    prop.cons.forEach((c, i) => {
      h += `<tr class="${c.name ? '' : 'unnamed'}"><td><span class="imp-no">${i + 1}</span></td>
        <td><input list="impNames" data-k="name" data-i="${i}" value="${esc(c.name)}" placeholder="Tên" aria-label="Tên thang đo ${i + 1}"></td>
        <td><input data-k="items" data-i="${i}" value="${esc(c.items.join(', '))}" placeholder="VD: BA4, BA5" aria-label="Biến của thang đo ${i + 1}">
          <div class="imp-hint">Ảnh có ${c.nBoxes} hộp biến${c.items.length && c.items.length !== c.nBoxes ? ` · đang chọn ${c.items.length} biến` : ''}</div></td>
        <td><select data-k="side" data-i="${i}" aria-label="Phía đặt biến">${SIDES.map(([v, t]) => `<option value="${v}" ${c.side === v ? 'selected' : ''}>${t}</option>`).join('')}</select></td></tr>`;
    });
    h += `</tbody></table></div>`;
    h += `<h4>Quan hệ <span class="count">${prop.paths.filter(p => p.on).length}</span></h4><div class="imp-paths">`;
    const opts = sel => prop.cons.map((c, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(label(c))}</option>`).join('');
    prop.paths.forEach((p, i) => {
      const fi = prop.cons.findIndex(c => c.cid === p.from), ti = prop.cons.findIndex(c => c.cid === p.to);
      h += `<div class="imp-path ${p.on ? '' : 'off'}"><input type="checkbox" data-k="on" data-i="${i}" ${p.on ? 'checked' : ''} aria-label="Dùng quan hệ này">
        <select data-k="from" data-i="${i}" aria-label="Thang đo nguyên nhân">${opts(fi)}</select><span class="arr">→</span>
        <select data-k="to" data-i="${i}" aria-label="Thang đo kết quả">${opts(ti)}</select>
        <button class="btn sm" data-imp="flip" data-i="${i}" title="Đảo chiều">⇄</button>
        ${p.sure ? '' : '<span class="imp-warn" title="Chưa chắc chiều mũi tên">⚠ kiểm tra chiều</span>'}</div>`;
    });
    h += `<button class="btn sm" data-imp="addpath">+ Thêm quan hệ</button></div>`;
    if (prop.warnings.length) h += `<ul class="imp-notes">${prop.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>`;
    h += `<label class="imp-keep"><input type="checkbox" id="impKeep" ${imp.keepLayout ? 'checked' : ''}> Giữ bố cục giống ảnh</label>`;
    h += `<p class="note">Đường nét đứt (biến điều tiết) không được nhận diện vì trang chưa hỗ trợ. Thang đo bị cắt ngoài mép ảnh cần thêm tay. “Áp dụng” sẽ thay mô hình đang khai báo.</p>`;
    return h;
  }

  function render() {
    if (!imp) return;
    $('impStage').innerHTML = `<img src="${imp.url}" alt="Ảnh sơ đồ đã tải lên">` + overlay();
    $('impForm').innerHTML = form();
    setStatus(imp.status || '');
    $('impApply').disabled = !imp.ocrDone || !imp.an.circles.length;
    $('impMsg').textContent = '';
  }
  const redrawOverlay = () => { const s = $('impStage').querySelector('svg'); if (s) s.outerHTML = overlay(); };

  // ---------- Sửa trong bảng ----------
  function onInput(e) {
    const el = e.target, k = el.dataset.k; if (!k || !imp || !imp.prop) return;
    const i = +el.dataset.i, prop = imp.prop;
    if (k === 'name') {
      const c = prop.cons[i]; c.name = el.value.trim();
      // Chọn tên mà chưa có biến: điền sẵn các biến cùng tiền tố
      if (c.name && !c.items.length && prop.cand && prop.cand.get(c.name)) {
        c.items = prop.cand.get(c.name).slice();
        const inp = $('impForm').querySelector(`[data-k="items"][data-i="${i}"]`); if (inp) inp.value = c.items.join(', ');
      }
      el.closest('tr').classList.toggle('unnamed', !c.name);
      redrawOverlay();
    }
    if (k === 'items') prop.cons[i].items = el.value.split(/[,;\s]+/).filter(Boolean);
    if (k === 'side') prop.cons[i].side = el.value;
    if (k === 'on') { prop.paths[i].on = el.checked; el.closest('.imp-path').classList.toggle('off', !el.checked); redrawOverlay(); }
    if (k === 'from' || k === 'to') { prop.paths[i][k] = prop.cons[+el.value].cid; prop.paths[i].sure = true; redrawOverlay(); }
    if (el.id === 'impKeep') imp.keepLayout = el.checked;
  }

  function apply() {
    const prop = imp.prop, headers = numericHeaders(), msg = $('impMsg');
    const fail = t => { msg.textContent = t; return false; };
    const blocks = [], seenName = new Set(), seenItem = new Set();
    for (let i = 0; i < prop.cons.length; i++) {
      const c = prop.cons[i];
      if (!c.name) continue;
      if (!/^[^\s:,;#>=-]+$/.test(c.name)) return fail(`Tên thang đo #${i + 1} "${c.name}" không được chứa dấu cách hoặc ký tự : , ; # - > =`);
      if (seenName.has(c.name)) return fail(`Tên thang đo "${c.name}" bị trùng`);
      if (headers.includes(c.name)) return fail(`Tên thang đo "${c.name}" trùng tên một biến trong file`);
      seenName.add(c.name);
      if (!c.items.length) return fail(`Thang đo ${c.name} (#${i + 1}) chưa có biến quan sát`);
      for (const it of c.items) {
        if (!headers.includes(it)) return fail(`Không có biến dạng số "${it}" trong file (thang đo ${c.name})`);
        if (seenItem.has(it)) return fail(`Biến "${it}" nằm ở nhiều thang đo`);
        seenItem.add(it);
      }
      blocks.push({ name: c.name, items: c.items });
    }
    if (!blocks.length) return fail('Chưa có thang đo nào được đặt tên.');
    const nameOfCid = cid => (prop.cons.find(c => c.cid === cid) || {}).name;
    const paths = [], keys = new Set();
    for (const p of prop.paths) {
      if (!p.on) continue;
      const f = nameOfCid(p.from), t = nameOfCid(p.to);
      if (!f || !t) return fail('Có quan hệ nối với thang đo chưa đặt tên. Hãy đặt tên hoặc bỏ chọn quan hệ đó.');
      if (f === t) continue;
      if (!keys.has(f + '>' + t)) { keys.add(f + '>' + t); paths.push([f, t]); }
    }
    $('model').value = blocks.map(b => `${b.name}: ${b.items.join(', ')}`).join('\n');
    $('paths').value = paths.map(([f, t]) => `${f} -> ${t}`).join('\n');
    const lay = imp.keepLayout ? P.imageImport.layout(prop.cons.filter(c => blocks.some(b => b.name === c.name)), imp.an, P.canvas.dims) : null;
    P.setMode('draw');
    P.canvas.applyLayout(lay);
    P.updateModelPreview();
    if (state.rows.length) P.renderMeasureBar();
    close();
    toast(`Đã dựng mô hình từ ảnh: ${blocks.length} thang đo, ${paths.length} quan hệ. Kiểm tra lại rồi bấm “Chạy tất cả độ đo”.`);
    $('step2').scrollIntoView({ block: 'start' });
    return true;
  }

  function close() {
    $('impModal').classList.add('hidden');
    document.body.classList.remove('modal-open');
    if (imp) { imp.token = 0; if (imp.url) URL.revokeObjectURL(imp.url); }
    imp = null;
  }

  // ---------- Sự kiện ----------
  P.initImageImport = function () {
    $('impForm').addEventListener('input', onInput);
    $('impForm').addEventListener('change', onInput);
    $('impModal').addEventListener('click', e => {
      if (e.target === $('impModal')) return close();
      const b = e.target.closest('[data-imp]'); if (!b) return;
      const a = b.dataset.imp;
      if (a === 'close') close();
      if (a === 'apply') apply();
      if (a === 'pick') $('imgFile').click();
      if (a === 'flip') { const p = imp.prop.paths[+b.dataset.i]; [p.from, p.to] = [p.to, p.from]; p.sure = true; render(); }
      if (a === 'addpath' && imp.prop.cons.length >= 2) { imp.prop.paths.push({ from: imp.prop.cons[0].cid, to: imp.prop.cons[1].cid, on: true, sure: true }); render(); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && imp) close(); });
    $('imgFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) P.openImageImport(f); });
    // Dán ảnh chụp màn hình (Ctrl+V) khi đã có dữ liệu
    document.addEventListener('paste', e => {
      if (!state.headers.length || /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '')) return;
      const f = [...(e.clipboardData ? e.clipboardData.files : [])].find(x => /^image\//.test(x.type));
      if (f) { e.preventDefault(); P.openImageImport(f); }
    });
  };
})(window.PTSL);
