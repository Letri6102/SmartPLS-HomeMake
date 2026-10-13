/* export/diagram.js — Sơ đồ mô hình dạng SVG (dự phòng) và xuất ảnh PNG */
(function (global) {
  'use strict';
  const COL = {
    lvFill: '#DCE6FB', lvLine: '#2350C2', lvText: '#14306F',
    indFill: '#FFF4D2', indLine: '#C99A2E', indText: '#4A3800',
    edge: '#6B7588', path: '#2350C2',
    good: '#1C7A4A', warn: '#9A5B00', bad: '#B3261E'
  };
  const FONT = '"Be Vietnam Pro","Segoe UI",Arial,sans-serif';
  const RW = 64, RH = 24, PITCH = 32, EX = 54, EY = 30, ARM = 86;

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const loadColor = v => v >= 0.708 ? COL.good : v >= 0.4 ? COL.warn : COL.bad;

  // Điểm trên biên ellipse theo hướng (dx, dy)
  function ellipseEdge(cx, cy, dx, dy) {
    const s = 1 / Math.sqrt((dx / EX) ** 2 + (dy / EY) ** 2);
    return [cx + dx * s, cy + dy * s];
  }

  function label(x, y, text, color, bold) {
    const w = text.length * 6.6 + 8;
    return `<rect x="${x - w / 2}" y="${y - 8}" width="${w}" height="16" rx="3" fill="#FFFFFF" opacity=".92"/>` +
      `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11.5" font-weight="${bold ? 700 : 500}" fill="${color}">${esc(text)}</text>`;
  }

  /** res: kết quả plsAlgorithm (+ res.paths), fmt: hàm định dạng số */
  function draw(res, fmt) {
    const B = res.blocks, J = B.length;
    const idx = Object.fromEntries(B.map((b, i) => [b.name, i]));
    const pred = B.map(() => []);
    res.paths.forEach(([f, t]) => pred[idx[t]].push(idx[f]));

    // Phân lớp (cột) theo độ sâu
    let layer = new Array(J).fill(0);
    if (res.paths.length) {
      const depth = j => pred[j].length ? 1 + Math.max(...pred[j].map(depth)) : 0;
      layer = B.map((_, j) => depth(j));
    } else {
      const perCol = J <= 3 ? J : Math.ceil(J / Math.ceil(J / 3));
      layer = B.map((_, j) => Math.floor(j / perCol));
    }
    const maxL = Math.max(...layer);

    // Vị trí đặt biến quan sát
    const side = B.map((_, j) => {
      if (!res.paths.length) return 'left';
      if (layer[j] === 0) return 'left';
      if (layer[j] === maxL) return 'right';
      return 'below';
    });
    const unit = B.map((b, j) => {
      const k = b.items.length;
      if (side[j] === 'below') return { w: Math.max(k * (RW + 8), 2 * EX + 30), h: 2 * EY + 60 + RH };
      return { w: RW + ARM + 2 * EX, h: Math.max(k * PITCH, 2 * EY + 16) };
    });

    // Cột
    const cols = [];
    for (let L = 0; L <= maxL; L++) cols.push(B.map((_, j) => j).filter(j => layer[j] === L));
    const GAPX = res.paths.length ? 120 : 70, GAPY = 34, M = 24;
    const colW = cols.map(c => Math.max(...c.map(j => unit[j].w)));
    const colH = cols.map(c => c.reduce((s, j) => s + unit[j].h, 0) + GAPY * (c.length - 1));
    const H = Math.max(...colH) + 2 * M;
    const W = colW.reduce((s, w) => s + w, 0) + GAPX * (cols.length - 1) + 2 * M;

    const pos = new Array(J);
    let x = M;
    cols.forEach((c, ci) => {
      let y = M + (H - 2 * M - colH[ci]) / 2;
      c.forEach(j => {
        const u = unit[j];
        let cx, cy;
        if (side[j] === 'left') { cx = x + colW[ci] - EX; cy = y + u.h / 2; }
        else if (side[j] === 'right') { cx = x + EX; cy = y + u.h / 2; }
        else { cx = x + colW[ci] / 2; cy = y + EY; }
        pos[j] = { cx, cy, y0: y };
        y += u.h + GAPY;
      });
      x += colW[ci] + GAPX;
    });

    let edges = '', nodes = '', labels = '';
    // Biến quan sát + hệ số tải
    B.forEach((b, j) => {
      const { cx, cy } = pos[j], k = b.items.length;
      b.items.forEach((it, q) => {
        let rx, ry, ax, ay;
        if (side[j] === 'below') {
          const total = k * (RW + 8) - 8;
          rx = cx - total / 2 + q * (RW + 8); ry = cy + EY + 60;
          ax = rx + RW / 2; ay = ry;
        } else {
          ry = cy - (k * PITCH) / 2 + q * PITCH + (PITCH - RH) / 2;
          rx = side[j] === 'left' ? cx - EX - ARM - RW : cx + EX + ARM;
          ax = side[j] === 'left' ? rx + RW : rx; ay = ry + RH / 2;
        }
        const [ex, ey] = ellipseEdge(cx, cy, ax - cx, ay - cy);
        edges += `<line x1="${ex}" y1="${ey}" x2="${ax}" y2="${ay}" stroke="${COL.edge}" stroke-width="1.1" marker-end="url(#ah)"/>`;
        nodes += `<rect x="${rx}" y="${ry}" width="${RW}" height="${RH}" rx="3" fill="${COL.indFill}" stroke="${COL.indLine}" stroke-width="1.2"/>` +
          `<text x="${rx + RW / 2}" y="${ry + RH / 2 + 4}" text-anchor="middle" font-size="12" font-weight="500" fill="${COL.indText}">${esc(it)}</text>`;
        const l = res.loadings[j][q], t = side[j] === 'below' ? 0.55 : 0.62;
        labels += label(ex + (ax - ex) * t, ey + (ay - ey) * t, fmt(l), loadColor(l), l < 0.708);
      });
    });
    // Mũi tên cấu trúc
    res.paths.forEach(([f, t]) => {
      const a = pos[idx[f]], b = pos[idx[t]];
      const [x1, y1] = ellipseEdge(a.cx, a.cy, b.cx - a.cx, b.cy - a.cy);
      const [x2, y2] = ellipseEdge(b.cx, b.cy, a.cx - b.cx, a.cy - b.cy);
      edges += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COL.path}" stroke-width="1.8" marker-end="url(#ahp)"/>`;
      const s = res.structural[idx[t]], k = s.predictors.indexOf(idx[f]);
      labels += label((x1 + x2) / 2, (y1 + y2) / 2, fmt(s.beta[k]), COL.path, true);
    });
    // Biến tiềm ẩn
    B.forEach((b, j) => {
      const { cx, cy } = pos[j], s = res.structural[j];
      const name = b.name.length > 12 ? b.name.slice(0, 11) + '…' : b.name;
      nodes += `<ellipse cx="${cx}" cy="${cy}" rx="${EX}" ry="${EY}" fill="${COL.lvFill}" stroke="${COL.lvLine}" stroke-width="1.6"/>`;
      if (s) {
        nodes += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="13.5" font-weight="700" fill="${COL.lvText}">${esc(name)}</text>` +
          `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="11" fill="${COL.lvText}">R² = ${fmt(s.r2)}</text>`;
      } else {
        nodes += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="13.5" font-weight="700" fill="${COL.lvText}">${esc(name)}</text>`;
      }
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family='${FONT}'>` +
      `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="${COL.edge}"/></marker>` +
      `<marker id="ahp" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${COL.path}"/></marker></defs>` +
      `<rect width="100%" height="100%" fill="#FFFFFF"/>${edges}${nodes}${labels}</svg>`;
  }

  // Tải sơ đồ dạng PNG (độ phân giải gấp 3 để chèn vào luận văn)
  function toPNG(svg, filename) {
    const m = svg.match(/width="([\d.]+)" height="([\d.]+)"/);
    const w = +m[1], h = +m[2], scale = 3;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * scale; c.height = h * scale;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b); a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  (global.PTSL = global.PTSL || {}).diagram = { draw, toPNG };
})(window);
