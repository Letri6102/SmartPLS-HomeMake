/*
 * model/image-ocr.js — Đọc chữ trong ảnh (OCR) bằng Tesseract.js.
 * Thư viện tải từ CDN khi cần (lần đầu cần Internet, khoảng 5–10 MB). Không có mạng thì trả lỗi để
 * giao diện chuyển sang chế độ chọn tên thủ công; phần nhận diện hình dạng vẫn chạy được.
 * Đọc từng vùng nhỏ (hộp biến, tên thang đo) thay vì cả ảnh: chữ trong ảnh chụp sơ đồ rất nhỏ,
 * phóng to từng vùng và chuyển sang đen trắng cho kết quả tốt hơn nhiều.
 */
(function (P) {
  'use strict';
  const CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  function loadScript(src) {
    return new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => ok(); s.onerror = () => { s.remove(); fail(new Error('Không tải được ' + src)); };
      document.head.appendChild(s);
    });
  }
  async function ensureLib() {
    if (window.Tesseract) return;
    await loadScript(CDN);
    if (!window.Tesseract) throw new Error('Không có thư viện Tesseract.js');
  }

  // Cắt vùng (x1, y1, x2, y2) của ảnh nguồn, phóng to cho chữ cao ~48 px, chuyển đen trắng, thêm lề trắng
  P.ocrCrop = function (src, x1, y1, x2, y2, invertDarkBg) {
    x1 = Math.max(0, Math.floor(x1)); y1 = Math.max(0, Math.floor(y1));
    x2 = Math.min(src.width, Math.ceil(x2)); y2 = Math.min(src.height, Math.ceil(y2));
    const w = x2 - x1, h = y2 - y1; if (w < 3 || h < 3) return null;
    const k = Math.max(1, Math.min(8, 48 / h)), pad = 24;
    const c = document.createElement('canvas');
    c.width = Math.round(w * k) + 2 * pad; c.height = Math.round(h * k) + 2 * pad;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(src, x1, y1, w, h, pad, pad, w * k, h * k);
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let p = 0; p < a.length; p += 4) {
      let lum = 0.299 * a[p] + 0.587 * a[p + 1] + 0.114 * a[p + 2];
      if (invertDarkBg) lum = 255 - lum;
      const v = lum < 170 ? 0 : 255;
      a[p] = a[p + 1] = a[p + 2] = v; a[p + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    return c;
  };

  /**
   * P.ocrRegions(src, regions, whitelist, onProgress) -> mảng chữ đọc được (cùng thứ tự regions)
   * regions: [{ x1, y1, x2, y2, invert }]
   * P.ocrEngine có thể được thay (dùng khi kiểm thử): async (canvas, whitelist) => text
   */
  P.ocrRegions = async function (src, regions, whitelist, onProgress) {
    let recog = P.ocrEngine, worker = null;
    if (!recog) {
      await ensureLib();
      worker = await window.Tesseract.createWorker('eng', 1);
      await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: whitelist || '' });
      recog = async c => (await worker.recognize(c)).data.text;
    }
    const out = [];
    try {
      for (let i = 0; i < regions.length; i++) {
        const r = regions[i];
        const c = P.ocrCrop(src, r.x1, r.y1, r.x2, r.y2, r.invert);
        out.push(c ? String(await recog(c, whitelist) || '').replace(/\s+/g, '').trim() : '');
        if (onProgress) onProgress(i + 1, regions.length);
      }
    } finally { if (worker) await worker.terminate(); }
    return out;
  };
})(window.PTSL);
