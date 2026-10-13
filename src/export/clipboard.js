/*
 * export/clipboard.js — Sao chép bảng / đoạn văn để dán vào Word hoặc Excel.
 */
(function (P) {
  'use strict';
  const { esc, toast, fmtNum } = P.util;

  function fallbackCopy(html, done) {
    const div = document.createElement('div');
    div.innerHTML = html; div.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(div);
    const range = document.createRange(); range.selectNodeContents(div);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges(); div.remove();
    ok ? done() : toast('Trình duyệt chặn sao chép. Hãy bôi đen bảng rồi nhấn Ctrl+C.', true);
  }

  P.copySection = function (si) {
    const sec = P.visibleSections()[si];
    if (!sec) return;
    let text, html;
    if (sec.prose) { text = sec.prose.join('\n\n'); html = sec.prose.map(p => `<p>${esc(p)}</p>`).join(''); }
    else {
      const cell = c => c.v === null || c.v === undefined ? '' : (typeof c.v === 'number' ? fmtNum(c.v) : String(c.v));
      text = [sec.head.join('\t'), ...sec.rows.map(r => r.map(cell).join('\t'))].join('\n');
      const td = 'style="border:1px solid #999;padding:3px 8px"';
      const bad = 'style="border:1px solid #999;padding:3px 8px;color:#B3261E;font-weight:bold;background:#FBD5D2"';
      html = `<table style="border-collapse:collapse;font-family:'Times New Roman';font-size:12pt"><tr>${sec.head.map(x => `<th ${td}>${esc(x)}</th>`).join('')}</tr>` +
        sec.rows.map(r => '<tr>' + r.map((c, i) => `<td ${c.cls === 'bad' ? bad : td} align="${i ? 'center' : 'left'}">${esc(cell(c))}</td>`).join('') + '</tr>').join('') + '</table>';
    }
    const done = () => toast(sec.prose ? 'Đã sao chép đoạn văn' : 'Đã sao chép bảng. Dán vào Word hoặc Excel bằng Ctrl+V');
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' })
        })]).then(done, () => fallbackCopy(html, done));
        return;
      }
    } catch (e) { /* dùng cách dự phòng */ }
    fallbackCopy(html, done);
  };
})(window.PTSL);
