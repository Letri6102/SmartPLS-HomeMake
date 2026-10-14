/*
 * model/canvas.js — Khung vẽ mô hình kiểu SmartPLS
 * - Kéo biến từ danh sách vào sơ đồ: thả lên thang đo để gán, thả vào chỗ trống để tạo thang đo mới
 * - Kéo thang đo để di chuyển; công cụ "Nối" để vẽ quan hệ (mũi tên)
 * - Đổi tên, đổi phía đặt biến quan sát, xóa thang đo / biến / mũi tên
 * - Đồng bộ hai chiều với ô nhập dạng chữ; hiện loading, β, R² sau khi chạy
 */
(function (global) {
  'use strict';
  const COL = {
    lvFill: '#3184BD', lvLine: '#21638F', lvText: '#FFFFFF', sel: '#E8590C',
    indFill: '#FFDF72', indLine: '#C99A2E', indText: '#4A3800',
    edge: '#6B7588', path: '#2350C2', good: '#1C7A4A', warn: '#9A5B00', bad: '#B3261E', ghost: '#9AA3B2'
  };
  const FONT = '"Be Vietnam Pro","Segoe UI",Arial,sans-serif';
  const EX = 48, EY = 48, RW = 76, RH = 26, PITCH = 36, GAP = 74, GAPV = 58;
  const SIDES = ['left', 'right', 'top', 'bottom'];
  const SIDE_NAME = { left: 'bên trái', right: 'bên phải', top: 'phía trên', bottom: 'phía dưới' };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const loadColor = v => v >= 0.708 ? COL.good : v >= 0.4 ? COL.warn : COL.bad;

  let H = null;                    // hooks từ app.js
  const st = {
    layout: {},                    // tên thang đo -> { x, y, side }
    manual: false,                 // người dùng đã tự sắp vị trí chưa (chưa thì tự sắp theo mũi tên)
    tool: 'select', sel: null,     // sel: { t: 'c'|'i'|'p', id, c }
    zoom: 1, userZoom: false, showRes: true, palSel: new Set(), palLast: null,
    drag: null
  };

  // ---------- Đọc / ghi mô hình dạng chữ ----------
  function readPaths(blocks) {
    const names = new Set(blocks.map(b => b.name)), out = [], seen = new Set();
    H.getPaths().split(/\r?\n/).forEach(line => {
      line = line.replace(/#.*$/, '').trim(); if (!line) return;
      const parts = line.split(/\s*(?:->|=>|→)\s*/);
      for (let p = 0; p < parts.length - 1; p++) {
        const from = parts[p].split(/[,;\s]+/).filter(Boolean), to = parts[p + 1].split(/[,;\s]+/).filter(Boolean);
        for (const f of from) for (const t of to) {
          if (!names.has(f) || !names.has(t) || f === t || seen.has(f + '>' + t)) continue;
          seen.add(f + '>' + t); out.push([f, t]);
        }
      }
    });
    return out;
  }
  function read() {
    const blocks = H.parseModel();
    return { blocks, paths: readPaths(blocks) };
  }
  function write(blocks, paths) {
    H.setModel(blocks.map(b => `${b.name}: ${b.items.join(', ')}`).join('\n'));
    H.setPaths(paths.map(([f, t]) => `${f} -> ${t}`).join('\n'));
    H.onChange();
  }
  function hasCycle(paths) {
    const visiting = new Set(), done = new Set();
    const visit = n => {
      if (visiting.has(n)) return true;
      if (done.has(n)) return false;
      visiting.add(n);
      if (paths.some(([f, t]) => f === n && visit(t))) return true;
      visiting.delete(n); done.add(n); return false;
    };
    return paths.some(([f]) => visit(f));
  }

  // ---------- Bố cục ----------
  function depthOf(blocks, paths) {
    const pred = {}; blocks.forEach(b => { pred[b.name] = []; });
    paths.forEach(([f, t]) => pred[t] && pred[t].push(f));
    const memo = {}, seen = new Set();
    const d = n => {
      if (memo[n] !== undefined) return memo[n];
      if (seen.has(n)) return 0; seen.add(n);
      memo[n] = pred[n].length ? 1 + Math.max(...pred[n].map(d)) : 0;
      return memo[n];
    };
    blocks.forEach(b => d(b.name));
    return memo;
  }
  function unitH(k, side) { return side === 'left' || side === 'right' ? Math.max(k * PITCH, 2 * EY + 24) : 2 * EY + GAPV + RH + 30; }

  function autoLayout(blocks, paths, all) {
    const todo = blocks.filter(b => all || !st.layout[b.name]);
    if (!todo.length) return;
    const noPaths = !paths.length;
    // Thêm vài thang đo vào bố cục có sẵn: đặt phía dưới
    if (!all && todo.length < blocks.length) {
      const bb = bounds(blocks.filter(b => st.layout[b.name]));
      let y = bb ? bb.y2 + 50 : 40;
      todo.forEach(b => { const h = unitH(b.items.length, 'left'); st.layout[b.name] = { x: 60 + RW + GAP + EX, y: y + h / 2, side: 'left' }; y += h + 40; });
      normalize(); return;
    }
    if (noPaths) {
      // Chưa có quan hệ: xếp lưới, mỗi cột 3 thang đo
      const ys = Array(Math.ceil(blocks.length / 3)).fill(40);
      blocks.forEach((b, i) => {
        const c = Math.floor(i / 3), h = unitH(b.items.length, 'left');
        st.layout[b.name] = { x: 60 + RW + GAP + EX + c * 420, y: ys[c] + h / 2, side: 'left' };
        ys[c] += h + 40;
      });
      normalize(); return;
    }
    // Có quan hệ: cột theo độ sâu; cột đầu xếp chồng, các cột sau đặt theo trọng tâm của thang đo tác động
    const dep = depthOf(blocks, paths), maxD = Math.max(0, ...Object.values(dep));
    const pred = {}; blocks.forEach(b => { pred[b.name] = []; }); paths.forEach(([f, t]) => pred[t].push(f));
    const colX = d => 60 + RW + GAP + EX + d * 360;
    for (let d = 0; d <= maxD; d++) {
      const col = blocks.filter(b => dep[b.name] === d);
      const side = d === 0 ? 'left' : d === maxD ? 'right' : 'top';
      const items = col.map(b => {
        const h = unitH(b.items.length, side);
        let y;
        if (d === 0) y = 0;
        else {
          const ps = pred[b.name].map(n => st.layout[n].y);
          y = ps.reduce((a, v) => a + v, 0) / ps.length;
          if (side === 'top') y -= 110;           // nâng thang đo trung gian lên để mũi tên đi bên dưới
        }
        return { b, h, y };
      });
      if (d === 0) { let y = 40; items.forEach(o => { o.y = y + o.h / 2; y += o.h + 40; }); }
      items.sort((a, c) => a.y - c.y);
      for (let i = 1; i < items.length; i++) {
        const min = items[i - 1].y + items[i - 1].h / 2 + items[i].h / 2 + 40;
        if (items[i].y < min) items[i].y = min;
      }
      items.forEach(o => { st.layout[o.b.name] = { x: colX(d), y: o.y, side }; });
    }
    normalize();
  }

  // Vị trí các ô biến quan sát của một thang đo
  function itemBoxes(b) {
    const L = st.layout[b.name], k = b.items.length;
    return b.items.map((it, q) => {
      let x, y, ax, ay;
      if (L.side === 'left' || L.side === 'right') {
        y = L.y - (k * PITCH) / 2 + q * PITCH + (PITCH - RH) / 2;
        x = L.side === 'left' ? L.x - EX - GAP - RW : L.x + EX + GAP;
        ax = L.side === 'left' ? x + RW : x; ay = y + RH / 2;
      } else {
        const total = k * (RW + 8) - 8;
        x = L.x - total / 2 + q * (RW + 8);
        y = L.side === 'top' ? L.y - EY - GAPV - RH : L.y + EY + GAPV;
        ax = x + RW / 2; ay = L.side === 'top' ? y + RH : y;
      }
      return { it, x, y, ax, ay };
    });
  }
  function bounds(blocks) {
    if (!blocks.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    blocks.forEach(b => {
      const L = st.layout[b.name]; if (!L) return;
      x1 = Math.min(x1, L.x - EX); x2 = Math.max(x2, L.x + EX); y1 = Math.min(y1, L.y - EY); y2 = Math.max(y2, L.y + EY);
      itemBoxes(b).forEach(r => { x1 = Math.min(x1, r.x); x2 = Math.max(x2, r.x + RW); y1 = Math.min(y1, r.y); y2 = Math.max(y2, r.y + RH); });
    });
    return Number.isFinite(x1) ? { x1, y1, x2, y2 } : null;
  }
  // Dời toàn bộ để không có phần nào nằm ngoài mép trái / trên
  function normalize() {
    const { blocks } = read();
    const bb = bounds(blocks.filter(b => st.layout[b.name])); if (!bb) return;
    const dx = bb.x1 < 30 ? 30 - bb.x1 : 0, dy = bb.y1 < 30 ? 30 - bb.y1 : 0;
    if (dx || dy) Object.values(st.layout).forEach(L => { L.x += dx; L.y += dy; });
  }
  function ellipseEdge(cx, cy, dx, dy) {
    const s = 1 / Math.sqrt((dx / EX) ** 2 + (dy / EY) ** 2 || 1);
    return [cx + dx * s, cy + dy * s];
  }
  function label(x, y, text, color, bold) {
    const w = text.length * 6.7 + 8;
    return `<rect x="${x - w / 2}" y="${y - 8}" width="${w}" height="16" rx="3" fill="#FFFFFF" opacity=".92"/>` +
      `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11.5" font-weight="${bold ? 700 : 500}" fill="${color}">${esc(text)}</text>`;
  }

  // ---------- Vẽ SVG (dùng chung cho khung vẽ và hình xuất) ----------
  function svgString(opt) {
    const { blocks, paths } = opt.model;
    const res = opt.res, fmt = opt.fmt || (v => v.toFixed(3));
    const resOf = {};
    if (res) res.blocks.forEach((b, j) => {
      resOf[b.name] = { load: Object.fromEntries(b.items.map((it, k) => [it, res.loadings[j][k]])), r2: res.structural[j] && res.structural[j].r2, j };
    });
    const beta = (f, t) => {
      if (!res || !resOf[t] || !resOf[f]) return null;
      const s = res.structural[resOf[t].j]; if (!s) return null;
      const k = s.predictors.indexOf(resOf[f].j); return k >= 0 ? s.beta[k] : null;
    };
    const isSel = (t, id) => opt.interactive && st.sel && st.sel.t === t && st.sel.id === id;
    let edges = '', nodes = '', labels = '', hits = '';

    blocks.forEach(b => {
      const L = st.layout[b.name];
      itemBoxes(b).forEach(r => {
        const [ex, ey] = ellipseEdge(L.x, L.y, r.ax - L.x, r.ay - L.y);
        edges += `<line x1="${ex}" y1="${ey}" x2="${r.ax}" y2="${r.ay}" stroke="${COL.edge}" stroke-width="1.1" marker-end="url(#ah)"/>`;
        const s = isSel('i', r.it);
        nodes += `<g data-i="${esc(r.it)}" data-c="${esc(b.name)}" class="cv-item"><rect x="${r.x}" y="${r.y}" width="${RW}" height="${RH}" rx="3" fill="${COL.indFill}" stroke="${s ? COL.sel : COL.indLine}" stroke-width="${s ? 2.2 : 1.2}"/>` +
          `<text x="${r.x + RW / 2}" y="${r.y + RH / 2 + 4}" text-anchor="middle" font-size="12" font-weight="500" fill="${COL.indText}">${esc(r.it)}</text></g>`;
        const l = resOf[b.name] && resOf[b.name].load[r.it];
        if (l !== undefined && l !== null) {
          const t = L.side === 'left' || L.side === 'right' ? 0.62 : 0.55;
          labels += label(ex + (r.ax - ex) * t, ey + (r.ay - ey) * t, fmt(l), loadColor(l), l < 0.708);
        }
      });
    });
    paths.forEach(([f, t], pi) => {
      const a = st.layout[f], b = st.layout[t]; if (!a || !b) return;
      const [x1, y1] = ellipseEdge(a.x, a.y, b.x - a.x, b.y - a.y);
      const [x2, y2] = ellipseEdge(b.x, b.y, a.x - b.x, a.y - b.y);
      const s = isSel('p', pi);
      edges += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${s ? COL.sel : COL.path}" stroke-width="${s ? 2.6 : 1.8}" marker-end="url(#${s ? 'ahs' : 'ahp'})"/>`;
      if (opt.interactive) hits += `<line data-p="${pi}" class="cv-hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="14"/>`;
      const v = beta(f, t);
      if (v !== null) {
        const pv = opt.pvals ? opt.pvals[`${f} → ${t}`] : undefined;
        labels += label((x1 + x2) / 2, (y1 + y2) / 2, fmt(v) + (pv !== undefined ? ` (${fmt(pv)})` : ''), COL.path, true);
      }
    });
    blocks.forEach(b => {
      const L = st.layout[b.name], s = isSel('c', b.name);
      const name = b.name.length > 12 ? b.name.slice(0, 11) + '…' : b.name;
      const r2 = resOf[b.name] && resOf[b.name].r2;
      const empty = !b.items.length;
      nodes += `<g data-c="${esc(b.name)}" class="cv-lv"><ellipse cx="${L.x}" cy="${L.y}" rx="${EX}" ry="${EY}" fill="${COL.lvFill}" stroke="${s ? COL.sel : COL.lvLine}" stroke-width="${s ? 2.6 : 1.6}" ${empty ? 'stroke-dasharray="5 4"' : ''}/>` +
        (r2 !== undefined && r2 !== null
          ? `<text x="${L.x}" y="${L.y - 2}" text-anchor="middle" font-size="13.5" font-weight="700" fill="${COL.lvText}">${esc(name)}</text><text x="${L.x}" y="${L.y + 14}" text-anchor="middle" font-size="11" fill="${COL.lvText}">R² = ${fmt(r2)}</text>`
          : `<text x="${L.x}" y="${L.y + 5}" text-anchor="middle" font-size="13.5" font-weight="700" fill="${COL.lvText}">${esc(name)}</text>`) + `</g>`;
    });
    let ghost = '';
    if (opt.interactive && st.drag && st.drag.kind === 'link' && st.drag.to) {
      const a = st.layout[st.drag.from];
      ghost = `<line x1="${a.x}" y1="${a.y}" x2="${st.drag.to.x}" y2="${st.drag.to.y}" stroke="${COL.sel}" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#ahs)"/>`;
    }

    const bb = bounds(blocks) || { x1: 0, y1: 0, x2: 400, y2: 200 };
    let X, Y, W, Hh;
    if (opt.interactive) { X = 0; Y = 0; W = Math.max(bb.x2 + 40, opt.minW || 1); Hh = Math.max(bb.y2 + 40, opt.minH || 1); }
    else { X = bb.x1 - 24; Y = bb.y1 - 24; W = bb.x2 - bb.x1 + 48; Hh = bb.y2 - bb.y1 + 48; }
    const z = opt.interactive ? st.zoom : 1;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * z}" height="${Hh * z}" viewBox="${X} ${Y} ${W} ${Hh}" font-family='${FONT}'>` +
      `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="${COL.edge}"/></marker>` +
      `<marker id="ahp" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${COL.path}"/></marker>` +
      `<marker id="ahs" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${COL.sel}"/></marker></defs>` +
      `<rect x="${X}" y="${Y}" width="${W}" height="${Hh}" fill="#FFFFFF" class="cv-bg"/>${edges}${hits}${nodes}${labels}${ghost}</svg>`;
  }

  // ---------- Khung vẽ tương tác ----------
  const $ = id => document.getElementById(id);

  function render() {
    if (!H || !$('canvas')) return;
    const model = read();
    autoLayout(model.blocks, model.paths, !st.manual && !st.drag);
    // Bỏ bố cục của thang đo đã bị xóa
    Object.keys(st.layout).forEach(n => { if (!model.blocks.some(b => b.name === n)) delete st.layout[n]; });
    if (st.sel && st.sel.t === 'c' && !st.layout[st.sel.id]) st.sel = null;
    if (st.sel && st.sel.t === 'p' && !model.paths[st.sel.id]) st.sel = null;
    if (st.sel && st.sel.t === 'i' && !model.blocks.some(b => b.items.includes(st.sel.id))) st.sel = null;
    const res = st.showRes ? H.getResult() : null;
    const wrap = $('canvas');
    // Tự co vừa chiều ngang khung (khi người dùng chưa tự phóng to / thu nhỏ)
    if (!st.userZoom && !st.drag) {
      const bb = bounds(model.blocks);
      st.zoom = bb ? Math.max(0.1, Math.min(1, (wrap.clientWidth - 24) / (bb.x2 + 40), (wrap.clientHeight - 24) / (bb.y2 + 40))) : 1;
    }
    wrap.querySelector('.cv-svg').innerHTML = svgString({ model, res, fmt: H.fmt, pvals: res && H.getPvals ? H.getPvals() : null, interactive: true, minW: (wrap.clientWidth - 2) / st.zoom, minH: (wrap.clientHeight - 2) / st.zoom });
    wrap.dataset.tool = st.tool;
    wrap.classList.toggle('empty', !model.blocks.length);
    renderTools(model);
    renderPalette(model);
    store();
    if (!st.drag && H.onRender) H.onRender();       // ghi lịch sử hoàn tác (không ghi giữa lúc đang kéo)
  }

  function renderTools(model) {
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === st.tool));
    const s = st.sel;
    const ctx = $('cvCtx');
    let h = '';
    if (s && s.t === 'c') {
      const L = st.layout[s.id];
      h = `<span class="cv-selname">Thang đo <b>${esc(s.id)}</b></span>` +
        `<button class="btn sm" data-cv="rename">Đổi tên</button>` +
        `<button class="btn sm" data-cv="side" title="Đổi phía đặt biến quan sát">Biến quan sát: ${SIDE_NAME[L.side]}</button>` +
        `<button class="btn sm danger" data-cv="del">Xóa thang đo</button>`;
    } else if (s && s.t === 'i') {
      h = `<span class="cv-selname">Biến <b>${esc(s.id)}</b> thuộc ${esc(s.c)}</span><button class="btn sm danger" data-cv="del">Bỏ khỏi thang đo</button>`;
    } else if (s && s.t === 'p') {
      const p = model.paths[s.id];
      h = `<span class="cv-selname">Quan hệ <b>${esc(p[0])} → ${esc(p[1])}</b></span><button class="btn sm" data-cv="flip">Đảo chiều</button><button class="btn sm danger" data-cv="del">Xóa mũi tên</button>`;
    }
    ctx.innerHTML = h;
    ctx.classList.toggle('hidden', !h);
    $('cvZoom').textContent = Math.round(st.zoom * 100) + '%';
    $('cvRes').checked = st.showRes;
    const hint = {
      select: model.blocks.length ? 'Kéo thang đo để di chuyển. Bấm vào thang đo, biến hoặc mũi tên để chọn; phím Delete để xóa; bấm đúp vào thang đo để đổi tên.'
        : 'Kéo biến từ danh sách bên trái thả vào đây để tạo thang đo đầu tiên, hoặc bấm “Tự nhận diện”.',
      pan: 'Kéo để di chuyển khung nhìn. Ctrl + lăn chuột để thu phóng; bấm Vừa khung để xem toàn bộ mô hình.',
      link: 'Kéo từ thang đo nguyên nhân sang thang đo kết quả để vẽ mũi tên quan hệ.',
      add: 'Bấm vào chỗ trống trên sơ đồ để đặt một thang đo mới.'
    };
    $('cvHint').textContent = hint[st.tool];
    const pb = $('palAssign');
    if (pb) {
      pb.disabled = !(st.palSel.size && s && s.t === 'c');
      pb.textContent = s && s.t === 'c' ? `Gán ${st.palSel.size || ''} biến đã chọn vào ${s.id}` : 'Chọn một thang đo trên sơ đồ để gán biến';
    }
  }

  function renderPalette(model) {
    const used = {};
    model.blocks.forEach(b => b.items.forEach(i => { used[i] = b.name; }));
    const q = ($('palSearch').value || '').trim().toLowerCase();
    const vars = H.headers().filter(h => H.isNumeric(h) && (!q || h.toLowerCase().includes(q)));
    st.palVisible = vars;
    $('palList').innerHTML = vars.length ? vars.map(v =>
      `<div class="pal-item ${used[v] ? 'used' : ''} ${st.palSel.has(v) ? 'sel' : ''}" draggable="true" data-v="${esc(v)}" title="${used[v] ? 'Đang thuộc ' + esc(used[v]) : 'Kéo vào sơ đồ'}">` +
      `<span>${esc(v)}</span>${used[v] ? `<i>${esc(used[v])}</i>` : ''}</div>`).join('')
      : '<p class="help">Không có biến dạng số.</p>';
    $('palCount').textContent = `${Object.keys(used).length}/${H.headers().filter(H.isNumeric).length} biến đã dùng`;
  }

  function svgPoint(evt) {
    const svg = $('canvas').querySelector('svg');
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function hitConstruct(p, blocks) {
    let best = null;
    blocks.forEach(b => {
      const L = st.layout[b.name];
      const inE = ((p.x - L.x) / (EX + 6)) ** 2 + ((p.y - L.y) / (EY + 6)) ** 2 <= 1;
      if (inE) { best = b.name; return; }
      if (!best) {
        const bb = bounds([b]);
        if (bb && p.x >= bb.x1 - 8 && p.x <= bb.x2 + 8 && p.y >= bb.y1 - 8 && p.y <= bb.y2 + 8) best = b.name;
      }
    });
    return best;
  }
  function uniqueName(base, blocks) {
    base = (base || 'TD').replace(/[\s,;:#>-]+/g, '_') || 'TD';
    const names = new Set([...blocks.map(b => b.name), ...H.headers()]);
    if (!names.has(base)) return base;
    let i = 2; while (names.has(base + '_' + i)) i++;
    return base + '_' + i;
  }
  function addConstruct(at, items) {
    const { blocks, paths } = read();
    const pre = items && items.length ? H.prefixOf(items[0]) : null;
    const name = uniqueName(pre || ('TD' + (blocks.length + 1)), blocks);
    const moved = new Set(items || []);
    blocks.forEach(b => { b.items = b.items.filter(i => !moved.has(i)); });
    blocks.push({ name, items: items || [] });
    st.layout[name] = { x: at.x, y: at.y, side: 'left' };
    st.manual = true;
    st.sel = { t: 'c', id: name };
    write(blocks, paths);
    return name;
  }
  function assign(name, items) {
    const { blocks, paths } = read();
    const moved = new Set(items);
    blocks.forEach(b => { b.items = b.items.filter(i => !moved.has(i)); });
    const tgt = blocks.find(b => b.name === name);
    tgt.items.push(...items);
    st.palSel = new Set();
    st.sel = { t: 'c', id: name };
    write(blocks, paths);
    H.toast(`Đã gán ${items.length} biến vào ${name}`);
  }

  function deleteSel() {
    const s = st.sel; if (!s) return;
    let { blocks, paths } = read();
    if (s.t === 'c') {
      blocks = blocks.filter(b => b.name !== s.id);
      paths = paths.filter(([f, t]) => f !== s.id && t !== s.id);
      delete st.layout[s.id];
    } else if (s.t === 'i') {
      blocks.forEach(b => { b.items = b.items.filter(i => i !== s.id); });
    } else if (s.t === 'p') {
      paths = paths.filter((_, i) => i !== s.id);
    }
    st.sel = null;
    write(blocks, paths);
  }

  function startRename(name) {
    const L = st.layout[name]; if (!L) return;
    const inp = $('cvRename'), svg = $('canvas').querySelector('svg');
    const m = svg.getScreenCTM(), box = $('canvas').getBoundingClientRect();
    const pt = svg.createSVGPoint(); pt.x = L.x; pt.y = L.y;
    const sp = pt.matrixTransform(m);
    inp.style.left = (sp.x - box.left + $('canvas').scrollLeft - 60) + 'px';
    inp.style.top = (sp.y - box.top + $('canvas').scrollTop - 15) + 'px';
    inp.value = name; inp.dataset.old = name;
    inp.classList.remove('hidden'); inp.focus(); inp.select();
  }
  function commitRename() {
    const inp = $('cvRename');
    if (inp.classList.contains('hidden')) return;
    inp.classList.add('hidden');
    const old = inp.dataset.old;
    let nn = inp.value.trim().replace(/[\s,;:#>-]+/g, '_');
    if (!nn || nn === old) return;
    let { blocks, paths } = read();
    if (blocks.some(b => b.name === nn)) { H.toast(`Đã có thang đo tên ${nn}`, true); return; }
    if (H.headers().includes(nn)) { H.toast(`${nn} đang là tên một biến trong file, hãy chọn tên khác`, true); return; }
    blocks.forEach(b => { if (b.name === old) b.name = nn; });
    paths = paths.map(([f, t]) => [f === old ? nn : f, t === old ? nn : t]);
    st.layout[nn] = st.layout[old]; delete st.layout[old];
    st.sel = { t: 'c', id: nn };
    write(blocks, paths);
  }

  // Lưu bố cục theo file (để mở lại vẫn giữ)
  function storeKey() { return 'ptsl-layout:' + (H.fileKey() || ''); }
  function store() { try { localStorage.setItem(storeKey(), JSON.stringify({ layout: st.layout, manual: st.manual })); } catch (e) { /* bỏ qua */ } }
  function restore() {
    st.layout = {}; st.manual = false;
    try {
      const v = JSON.parse(localStorage.getItem(storeKey()) || 'null');
      if (v && v.layout) { st.layout = v.layout; st.manual = !!v.manual; }
    } catch (e) { /* bỏ qua */ }
  }

  function bind() {
    const wrap = $('canvas');
    function zoomAt(next, x = wrap.clientWidth / 2, y = wrap.clientHeight / 2) {
      const old = st.zoom, left = wrap.scrollLeft, top = wrap.scrollTop;
      st.zoom = Math.max(0.1, Math.min(3, next)); st.userZoom = true;
      render();
      wrap.scrollLeft = (left + x) * st.zoom / old - x;
      wrap.scrollTop = (top + y) * st.zoom / old - y;
    }
    wrap.addEventListener('wheel', e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const box = wrap.getBoundingClientRect();
      zoomAt(st.zoom * Math.exp(-e.deltaY * 0.002), e.clientX - box.left, e.clientY - box.top);
    }, { passive: false });
    wrap.addEventListener('pointerdown', e => {
      if (e.target.closest('input')) return;
      if (e.button === 1 || (e.button === 0 && st.tool === 'pan')) {
        e.preventDefault();
        st.drag = { kind: 'pan', x: e.clientX, y: e.clientY, left: wrap.scrollLeft, top: wrap.scrollTop };
        wrap.setPointerCapture(e.pointerId); return;
      }
      if (e.button !== 0) return;
      commitRename();
      const svg = wrap.querySelector('svg'); if (!svg) return;
      const p = svgPoint(e);
      const { blocks } = read();
      const cg = e.target.closest('.cv-lv'), ig = e.target.closest('.cv-item'), ph = e.target.closest('[data-p]');
      // Bấm đúp (tự nhận diện vì sơ đồ được vẽ lại sau mỗi lần bấm)
      const now = Date.now(), key = cg ? 'c:' + cg.dataset.c : (!ig && !ph ? 'bg' : 'x');
      const dbl = st.lastDown && st.lastDown.key === key && now - st.lastDown.t < 400 && Math.hypot(e.clientX - st.lastDown.x, e.clientY - st.lastDown.y) < 6;
      st.lastDown = { key, t: now, x: e.clientX, y: e.clientY };
      if (dbl && st.tool === 'select') {
        st.lastDown = null; st.drag = null;
        if (cg) { e.preventDefault(); startRename(cg.dataset.c); return; }
        if (key === 'bg') { addConstruct(p, []); render(); setTimeout(() => startRename(st.sel.id), 30); return; }
      }
      if (st.tool === 'add') {
        if (!cg && !ig) { addConstruct(p, []); st.tool = 'select'; render(); setTimeout(() => startRename(st.sel.id), 30); }
        return;
      }
      if (cg) {
        const name = cg.dataset.c;
        st.sel = { t: 'c', id: name };
        if (st.tool === 'link') st.drag = { kind: 'link', from: name, to: p };
        else st.drag = { kind: 'move', name, dx: p.x - st.layout[name].x, dy: p.y - st.layout[name].y, moved: false };
        e.preventDefault(); render();
        return;
      }
      if (ig) { st.sel = { t: 'i', id: ig.dataset.i, c: ig.dataset.c }; render(); return; }
      if (ph) { st.sel = { t: 'p', id: +ph.dataset.p }; render(); return; }
      st.sel = null; render();
      void blocks;
    });
    window.addEventListener('pointermove', e => {
      if (!st.drag) return;
      if (st.drag.kind === 'pan') {
        wrap.scrollLeft = st.drag.left + st.drag.x - e.clientX;
        wrap.scrollTop = st.drag.top + st.drag.y - e.clientY; return;
      }
      const p = svgPoint(e);
      if (st.drag.kind === 'move') {
        const L = st.layout[st.drag.name];
        L.x = Math.round(p.x - st.drag.dx); L.y = Math.round(p.y - st.drag.dy);
        st.drag.moved = true; st.manual = true;
      } else st.drag.to = p;
      render();
    });
    window.addEventListener('pointerup', e => {
      if (!st.drag) return;
      const d = st.drag; st.drag = null;
      if (d.kind === 'link') {
        const p = svgPoint(e);
        const { blocks, paths } = read();
        const to = hitConstruct(p, blocks);
        if (to && to !== d.from) {
          if (paths.some(([f, t]) => f === d.from && t === to)) H.toast('Quan hệ này đã có');
          else if (paths.some(([f, t]) => f === to && t === d.from)) H.toast('Đã có quan hệ ngược chiều; chọn mũi tên đó rồi bấm “Đảo chiều” nếu cần', true);
          else if (hasCycle([...paths, [d.from, to]])) H.toast('Quan hệ này tạo vòng lặp. Mô hình PLS cần đi một chiều.', true);
          else {
            paths.push([d.from, to]);
            st.sel = { t: 'p', id: paths.length - 1 };
            write(blocks, paths);
            H.toast(`Đã nối ${d.from} → ${to}`);
          }
        }
      } else if (d.moved) normalize();
      render();
    });
    window.addEventListener('pointercancel', () => { st.drag = null; render(); });
    $('cvRename').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
      if (e.key === 'Escape') { $('cvRename').classList.add('hidden'); }
    });
    $('cvRename').addEventListener('blur', commitRename);

    // Kéo thả biến từ danh sách
    $('palList').addEventListener('dragstart', e => {
      const it = e.target.closest('.pal-item'); if (!it) return;
      const v = it.dataset.v;
      const list = st.palSel.has(v) ? [...st.palSel] : [v];
      e.dataTransfer.setData('text/plain', JSON.stringify(list));
      e.dataTransfer.effectAllowed = 'move';
    });
    wrap.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); wrap.classList.add('dropping'); });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('dropping'));
    wrap.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation(); wrap.classList.remove('dropping');
      let items; try { items = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
      if (!Array.isArray(items) || !items.length) return;
      const p = svgPoint(e);
      const { blocks } = read();
      const tgt = hitConstruct(p, blocks);
      if (tgt) assign(tgt, items);
      else { const n = addConstruct(p, items); st.palSel = new Set(); H.toast(`Đã tạo thang đo ${n} với ${items.length} biến`); }
      render();
    });
    $('palList').addEventListener('click', e => {
      const it = e.target.closest('.pal-item'); if (!it) return;
      const v = it.dataset.v;
      if (e.shiftKey && st.palLast) {
        const vis = st.palVisible, a = vis.indexOf(st.palLast), b = vis.indexOf(v);
        vis.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => st.palSel.add(x));
      } else st.palSel.has(v) ? st.palSel.delete(v) : st.palSel.add(v);
      st.palLast = v;
      render();
    });
    $('palSearch').addEventListener('input', render);
    $('palAssign').addEventListener('click', () => {
      if (st.sel && st.sel.t === 'c' && st.palSel.size) { assign(st.sel.id, [...st.palSel]); render(); }
    });

    // Thanh công cụ
    $('cvTools').addEventListener('click', e => {
      const t = e.target.closest('[data-tool]'); if (t) { st.tool = t.dataset.tool; render(); return; }
      const b = e.target.closest('[data-cv]'); if (!b) return;
      const a = b.dataset.cv;
      if (a === 'zin') { zoomAt(st.zoom * 1.2); return; }
      if (a === 'zout') { zoomAt(st.zoom / 1.2); return; }
      if (a === 'zfit') { st.userZoom = false; wrap.scrollLeft = 0; wrap.scrollTop = 0; }
      if (a === 'focus') {
        $('drawMode').classList.toggle('focused');
        b.textContent = $('drawMode').classList.contains('focused') ? 'Thu gọn' : 'Mở rộng';
        st.userZoom = false;
      }
      if (a === 'auto') { st.manual = false; const m = read(); autoLayout(m.blocks, m.paths, true); }
      if (a === 'detect') { H.autoModel(); }
      if (a === 'img') { if (H.importImage) H.importImage(); return; }
      if (a === 'undo') { if (H.undo) H.undo(); return; }
      if (a === 'redo') { if (H.redo) H.redo(); return; }
      if (a === 'png') { const m = read(); if (!m.blocks.length) return; const rr = st.showRes ? H.getResult() : null; global.PTSL.diagram.toPNG(svgString({ model: m, res: rr, fmt: H.fmt, pvals: rr && H.getPvals ? H.getPvals() : null }), 'so_do_mo_hinh.png'); return; }
      render();
    });
    $('cvRes').addEventListener('change', e => { st.showRes = e.target.checked; render(); });
    $('cvCtx').addEventListener('click', e => {
      const b = e.target.closest('[data-cv]'); if (!b) return;
      const a = b.dataset.cv, s = st.sel; if (!s) return;
      if (a === 'del') deleteSel();
      if (a === 'rename') startRename(s.id);
      if (a === 'side') { const L = st.layout[s.id]; L.side = SIDES[(SIDES.indexOf(L.side) + 1) % 4]; st.manual = true; normalize(); }
      if (a === 'flip') {
        const { blocks, paths } = read(); const p = paths[s.id]; paths[s.id] = [p[1], p[0]];
        if (hasCycle(paths)) H.toast('Đảo chiều sẽ tạo vòng lặp trong mô hình.', true);
        else write(blocks, paths);
      }
      render();
    });
    document.addEventListener('keydown', e => {
      if (!$('drawMode') || $('drawMode').classList.contains('hidden')) return;
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel) { e.preventDefault(); deleteSel(); render(); }
      if (e.key === 'Escape') { st.sel = null; st.drag = null; st.tool = 'select'; $('drawMode').classList.remove('focused'); const b = document.querySelector('[data-cv="focus"]'); if (b) b.textContent = 'Mở rộng'; render(); }
      const map = { v: 'select', c: 'link', n: 'add', h: 'pan' };
      if (!e.ctrlKey && !e.metaKey && map[e.key.toLowerCase()]) { st.tool = map[e.key.toLowerCase()]; render(); }
    });
    window.addEventListener('resize', () => render());
  }

  // Hình tĩnh (cho Tổng quan và xuất PNG) theo đúng bố cục người dùng đã sắp
  function staticSVG(res, fmt, pvals) {
    const model = { blocks: res.blocks.map(b => ({ name: b.name, items: b.items.slice() })), paths: res.paths };
    autoLayout(model.blocks, model.paths, false);
    return svgString({ model, res, fmt, pvals });
  }

  global.PTSL.canvas = {
    init(hooks) { H = hooks; bind(); },
    reset() { restore(); st.sel = null; st.palSel = new Set(); st.zoom = 1; st.userZoom = false; render(); },
    render, staticSVG,
    dims: { EX, EY, RW, RH },
    // Trạng thái bố cục cho hoàn tác / làm lại
    getSnapshot() { return { layout: JSON.parse(JSON.stringify(st.layout)), manual: st.manual }; },
    setSnapshot(s) { st.layout = JSON.parse(JSON.stringify(s.layout || {})); st.manual = !!s.manual; st.sel = null; st.drag = null; },
    // Đặt bố cục có sẵn (vd. dựng từ ảnh). layout = null: tự sắp xếp theo mũi tên
    applyLayout(layout) {
      st.sel = null; st.userZoom = false;
      if (layout && Object.keys(layout).length) {
        st.layout = JSON.parse(JSON.stringify(layout)); st.manual = true;
        const m = read(); autoLayout(m.blocks, m.paths, false); normalize();
      } else { st.layout = {}; st.manual = false; }
      render();
    }
  };
})(window);
