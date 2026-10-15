// Small SVG chart helpers with hover tooltips. No external libraries.
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
const niceTicks = (lo, hi, n = 5) => {
  const span = hi - lo, raw = span / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => span / s <= n) || 10 * p;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
};

function legend(container, series) {
  const ul = document.createElement('ul');
  ul.className = 'legend';
  for (const s of series) {
    const li = document.createElement('li');
    const sw = svgEl('svg', { viewBox: '0 0 30 12', 'aria-hidden': 'true' });
    if (s.band) sw.append(svgEl('rect', { x: 0, y: 1, width: 30, height: 10, fill: s.color, opacity: 0.16 }));
    sw.append(svgEl('line', { x1: 1, y1: 6, x2: 29, y2: 6, stroke: s.color, 'stroke-width': 2.5, 'stroke-dasharray': s.dash || '' }));
    li.append(sw, document.createTextNode(s.name));
    ul.append(li);
  }
  container.append(ul);
}

function tooltip(container) {
  const t = document.createElement('div');
  t.className = 'tooltip';
  t.hidden = true;
  container.append(t);
  return t;
}

function placeTooltip(t, container, x, y) {
  const cw = container.clientWidth;
  t.hidden = false;
  const tw = t.offsetWidth;
  let left = x + 14;
  if (left + tw > cw) left = x - tw - 14;
  t.style.left = `${Math.max(0, left)}px`;
  t.style.top = `${Math.max(0, y - 10)}px`;
}

/**
 * Line chart with optional uncertainty bands.
 * opts: { series: [{name, color, dash, band, points:[{x,y,lo,hi}]}], xLabel, yLabel,
 *         x: [min,max], y: [min,max], xFormat, yFormat, marker, title }
 */
export function lineChart(container, opts) {
  container.replaceChildren();
  container.classList.add('chart');
  legend(container, opts.series);
  const W = 720, H = 340, m = { l: 62, r: 18, t: 14, b: 50 };
  const X = scale(opts.x[0], opts.x[1], m.l, W - m.r);
  const Y = scale(opts.y[0], opts.y[1], H - m.b, m.t);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.title || '' });
  const grid = svgEl('g', { class: 'grid' });
  const axis = svgEl('g', { class: 'axis' });
  const yt = niceTicks(opts.y[0], opts.y[1], 5), xt = opts.xTicks || niceTicks(opts.x[0], opts.x[1], 6);
  for (const v of yt) {
    grid.append(svgEl('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }));
    const t = svgEl('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }); t.textContent = opts.yFormat(v); axis.append(t);
  }
  for (const v of xt) {
    const t = svgEl('text', { x: X(v), y: H - m.b + 20, 'text-anchor': 'middle' }); t.textContent = opts.xFormat(v); axis.append(t);
  }
  axis.append(svgEl('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }));
  const xl = svgEl('text', { class: 'axis-title', x: (m.l + W - m.r) / 2, y: H - 8, 'text-anchor': 'middle' }); xl.textContent = opts.xLabel;
  const yl = svgEl('text', { class: 'axis-title', x: -(m.t + H - m.b) / 2, y: 15, transform: 'rotate(-90)', 'text-anchor': 'middle' }); yl.textContent = opts.yLabel;
  axis.append(xl, yl);
  svg.append(grid, axis);
  for (const s of opts.series) {
    if (s.band) {
      const top = s.points.map((p) => `${X(p.x)},${Y(p.hi)}`);
      const bot = s.points.slice().reverse().map((p) => `${X(p.x)},${Y(p.lo)}`);
      svg.append(svgEl('polygon', { points: [...top, ...bot].join(' '), fill: s.color, opacity: 0.13 }));
    }
  }
  for (const s of opts.series) {
    svg.append(svgEl('polyline', {
      points: s.points.map((p) => `${X(p.x)},${Y(p.y)}`).join(' '), fill: 'none', stroke: s.color,
      'stroke-width': 2.5, 'stroke-dasharray': s.dash || '', 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
  }
  if (opts.refY != null && opts.refY >= opts.y[0] && opts.refY <= opts.y[1]) {
    svg.append(svgEl('line', { x1: m.l, x2: W - m.r, y1: Y(opts.refY), y2: Y(opts.refY), stroke: '#1f2329', 'stroke-width': 1.4, 'stroke-dasharray': '6 4' }));
    if (opts.refLabel) { const t = svgEl('text', { x: W - m.r - 4, y: Y(opts.refY) - 6, 'text-anchor': 'end', fill: '#1f2329', 'font-size': 13 }); t.textContent = opts.refLabel; svg.append(t); }
  }
  if (opts.marker != null) {
    svg.append(svgEl('line', { class: 'marker-line', x1: X(opts.marker), x2: X(opts.marker), y1: m.t, y2: H - m.b }));
  }
  // hover layer
  const cross = svgEl('line', { x1: 0, x2: 0, y1: m.t, y2: H - m.b, stroke: '#4b5261', 'stroke-width': 1, visibility: 'hidden' });
  const dots = opts.series.map((s) => svgEl('circle', { r: 5, fill: s.color, stroke: '#fff', 'stroke-width': 2, visibility: 'hidden' }));
  svg.append(cross, ...dots);
  const hit = svgEl('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' });
  svg.append(hit);
  container.append(svg);
  const tip = tooltip(container);
  const xs = opts.series[0].points.map((p) => p.x);
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const xv = opts.x[0] + ((px - m.l) / (W - m.l - m.r)) * (opts.x[1] - opts.x[0]);
    let i = 0; let best = Infinity;
    xs.forEach((x, j) => { const d = Math.abs(x - xv); if (d < best) { best = d; i = j; } });
    const xx = X(xs[i]);
    cross.setAttribute('x1', xx); cross.setAttribute('x2', xx); cross.setAttribute('visibility', 'visible');
    const rows = [`<b>${opts.xFormat(xs[i])}</b>`];
    opts.series.forEach((s, k) => {
      const p = s.points[i];
      dots[k].setAttribute('cx', xx); dots[k].setAttribute('cy', Y(p.y)); dots[k].setAttribute('visibility', 'visible');
      const band = s.band ? ` <span class="muted">(${opts.yFormat(p.lo)} to ${opts.yFormat(p.hi)})</span>` : '';
      rows.push(`<span class="swatch" style="background:${s.color}"></span>${s.name}: <b>${opts.yFormat(p.y)}</b>${band}`);
    });
    tip.innerHTML = rows.join('<br>');
    placeTooltip(tip, container, (xx / W) * r.width, ((ev.clientY - r.top)));
  };
  const leave = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', leave);
}

/**
 * Horizontal interval chart (point and 95% interval per row).
 * rows: [{label, point, lo, hi, color}]; opts: {format, xLabel, zero}
 */
export function intervalChart(container, rows, opts) {
  container.replaceChildren();
  container.classList.add('chart');
  const rowH = 34, m = { l: 300, r: 70, t: 10, b: 46 };
  const W = 760, H = m.t + m.b + rows.length * rowH;
  const lo = Math.min(opts.min ?? 0, ...rows.map((r) => r.lo)), hi = Math.max(opts.max ?? 0, ...rows.map((r) => r.hi));
  const pad = (hi - lo) * 0.05;
  const X = scale(lo - pad, hi + pad, m.l, W - m.r);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.title || '' });
  const axis = svgEl('g', { class: 'axis' });
  const grid = svgEl('g', { class: 'grid' });
  for (const v of niceTicks(lo - pad, hi + pad, 6)) {
    grid.append(svgEl('line', { x1: X(v), x2: X(v), y1: m.t, y2: H - m.b }));
    const t = svgEl('text', { x: X(v), y: H - m.b + 20, 'text-anchor': 'middle' }); t.textContent = opts.format(v); axis.append(t);
  }
  const xl = svgEl('text', { class: 'axis-title', x: (m.l + W - m.r) / 2, y: H - 6, 'text-anchor': 'middle' }); xl.textContent = opts.xLabel; axis.append(xl);
  svg.append(grid, axis);
  if (lo < 0 && hi > 0) svg.append(svgEl('line', { x1: X(0), x2: X(0), y1: m.t, y2: H - m.b, stroke: '#1f2329', 'stroke-width': 1.2 }));
  const tip = tooltip(container);
  rows.forEach((r, i) => {
    const y = m.t + i * rowH + rowH / 2;
    const g = svgEl('g');
    const lab = svgEl('text', { x: m.l - 12, y: y + 5, 'text-anchor': 'end', fill: '#1f2329', 'font-size': 15 }); lab.textContent = r.label;
    g.append(lab);
    g.append(svgEl('line', { x1: X(r.lo), x2: X(r.hi), y1: y, y2: y, stroke: r.color, 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    g.append(svgEl('circle', { cx: X(r.point), cy: y, r: 6.5, fill: r.color, stroke: '#fff', 'stroke-width': 2 }));
    const val = svgEl('text', { x: X(r.hi) + 8, y: y + 5, fill: '#4b5261', 'font-size': 13 }); val.textContent = opts.format(r.point);
    g.append(val);
    const hit = svgEl('rect', { x: 0, y: y - rowH / 2, width: W, height: rowH, fill: 'transparent' });
    hit.addEventListener('pointermove', (ev) => {
      const b = svg.getBoundingClientRect();
      tip.innerHTML = `<b>${r.label}</b><br>${opts.format(r.point)} <span class="muted">(95% interval ${opts.format(r.lo)} to ${opts.format(r.hi)})</span>`;
      placeTooltip(tip, container, ev.clientX - b.left, ev.clientY - b.top);
    });
    hit.addEventListener('pointerleave', () => { tip.hidden = true; });
    g.append(hit);
    svg.append(g);
  });
  container.append(svg);
}

/**
 * 100% horizontal bars showing how choices split. rows: [{label, parts:[{name,value,color}]}]
 */
export function shareBars(container, rows, opts = {}) {
  container.replaceChildren();
  container.classList.add('chart');
  legend(container, rows[0].parts.map((p) => ({ name: p.name, color: p.color })));
  const W = 760, rowH = 54, m = { l: 150, r: 10, t: 8, b: 8 };
  const H = m.t + m.b + rows.length * rowH;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.title || '' });
  const X = scale(0, 1, m.l, W - m.r);
  const tip = tooltip(container);
  rows.forEach((r, i) => {
    const y = m.t + i * rowH + 8, h = rowH - 18;
    const lab = svgEl('text', { x: m.l - 12, y: y + h / 2 + 5, 'text-anchor': 'end', fill: '#1f2329', 'font-size': 15 }); lab.textContent = r.label;
    svg.append(lab);
    let acc = 0;
    r.parts.forEach((p) => {
      const x0 = X(acc), x1 = X(acc + p.value);
      const rect = svgEl('rect', { x: x0 + (acc > 0 ? 1 : 0), y, width: Math.max(0, x1 - x0 - (acc > 0 ? 1 : 0)), height: h, fill: p.color });
      rect.addEventListener('pointermove', (ev) => {
        const b = svg.getBoundingClientRect();
        tip.innerHTML = `<b>${r.label}</b><br>${p.name}: <b>${(100 * p.value).toFixed(0)}%</b>`;
        placeTooltip(tip, container, ev.clientX - b.left, ev.clientY - b.top);
      });
      rect.addEventListener('pointerleave', () => { tip.hidden = true; });
      svg.append(rect);
      if (p.value > 0.08) {
        const t = svgEl('text', { x: (x0 + x1) / 2, y: y + h / 2 + 5, 'text-anchor': 'middle', fill: '#fff', 'font-size': 14, 'font-weight': 700, 'pointer-events': 'none' });
        t.textContent = `${(100 * p.value).toFixed(0)}%`;
        svg.append(t);
      }
      acc += p.value;
    });
  });
  container.append(svg);
}

/** Horizontal bars with intervals (for relative importance). rows: [{label, point, lo, hi}] */
export function barChart(container, rows, opts) {
  container.replaceChildren();
  container.classList.add('chart');
  const rowH = 36, m = { l: 230, r: 80, t: 6, b: 40 };
  const W = 760, H = m.t + m.b + rows.length * rowH;
  const hi = Math.max(...rows.map((r) => r.hi));
  const X = scale(0, hi * 1.05, m.l, W - m.r);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.title || '' });
  const axis = svgEl('g', { class: 'axis' });
  for (const v of niceTicks(0, hi * 1.05, 5)) {
    axis.append(svgEl('line', { x1: X(v), x2: X(v), y1: m.t, y2: H - m.b, stroke: '#ebedf0' }));
    const t = svgEl('text', { x: X(v), y: H - m.b + 20, 'text-anchor': 'middle' }); t.textContent = opts.format(v); axis.append(t);
  }
  svg.append(axis);
  const tip = tooltip(container);
  rows.forEach((r, i) => {
    const y = m.t + i * rowH + 7, h = rowH - 14;
    const lab = svgEl('text', { x: m.l - 12, y: y + h / 2 + 5, 'text-anchor': 'end', fill: '#1f2329', 'font-size': 15 }); lab.textContent = r.label;
    const bar = svgEl('rect', { x: m.l, y, width: X(r.point) - m.l, height: h, fill: r.color || '#2a6bc4', rx: 3 });
    const wl = svgEl('line', { x1: X(r.lo), x2: X(r.hi), y1: y + h / 2, y2: y + h / 2, stroke: '#1f2329', 'stroke-width': 1.5 });
    const val = svgEl('text', { x: X(r.hi) + 8, y: y + h / 2 + 5, fill: '#4b5261', 'font-size': 13 }); val.textContent = opts.format(r.point);
    bar.addEventListener('pointermove', (ev) => {
      const b = svg.getBoundingClientRect();
      tip.innerHTML = `<b>${r.label}</b><br>${opts.format(r.point)} <span class="muted">(95% interval ${opts.format(r.lo)} to ${opts.format(r.hi)})</span>`;
      placeTooltip(tip, container, ev.clientX - b.left, ev.clientY - b.top);
    });
    bar.addEventListener('pointerleave', () => { tip.hidden = true; });
    svg.append(lab, bar, wl, val);
  });
  container.append(svg);
}
