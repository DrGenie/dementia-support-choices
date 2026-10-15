// Shared page behaviour: text size, model loading, formatting and small helpers.
import { loadEngine } from './engine.js';

// ------------------------------------------------------------ text size
const TEXT_KEY = 'dsc-text-size';
function applyTextSize(size) {
  if (size === 'standard') document.documentElement.removeAttribute('data-text');
  else document.documentElement.setAttribute('data-text', size);
  document.querySelectorAll('.textsize button').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.size === size)));
}
function initTextSize() {
  let saved = 'standard';
  try { saved = localStorage.getItem(TEXT_KEY) || 'standard'; } catch (e) { /* storage unavailable */ }
  applyTextSize(saved);
  document.querySelectorAll('.textsize button').forEach((b) => b.addEventListener('click', () => {
    applyTextSize(b.dataset.size);
    try { localStorage.setItem(TEXT_KEY, b.dataset.size); } catch (e) { /* storage unavailable */ }
  }));
}

// ------------------------------------------------------------ formatting
export const pct = (x, d = 0) => `${(100 * x).toFixed(d)}%`;
export const per100 = (x) => Math.round(100 * x);
export const money = (x, d = 0) => {
  const s = Math.abs(x).toLocaleString('en-AU', { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${x < 0 ? '-' : ''}A$${s}`;
};
export const num = (x, d = 2) => x.toLocaleString('en-AU', { minimumFractionDigits: d, maximumFractionDigits: d });
export const range = (ci, f) => `${f(ci[0])} to ${f(ci[1])}`;
export const priceLabel = (p) => (p === 0 ? 'Free' : `${money(p)} per session`);

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}

// Plain-language description of a programme design
export function describe(engine, d) {
  const L = (k) => engine.label(k, d[k]);
  const carer = d.carer === 'yes' ? 'carer included' : 'person with dementia only';
  const mode = { inperson: 'in person', virtual: 'online', hybrid: 'hybrid (online and in person)' }[d.mode];
  const dist = { home: 'at home', local: 'local, up to 12 km away', wider: '50 km or more away' }[d.distance];
  const dur = { '30min': '30-minute', '2h': '2-hour', '4h': '4-hour' }[d.duration];
  return `${L('type')}, ${carer}, ${mode}, ${L('frequency').toLowerCase()}, ${dur} sessions, ${dist}, ${d.price === 0 ? 'free' : money(d.price) + ' per session'}`;
}

// 10 x 10 array of people; the first `k` are filled
export function iconArray(container, share, label) {
  const k = Math.round(100 * share);
  const size = 24, gap = 4;
  const W = 10 * (size + gap) - gap;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
  svg.setAttribute('class', 'icon-array');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label || `${k} in every 100 people`);
  for (let i = 0; i < 100; i++) {
    const r = Math.floor(i / 10), c = i % 10;
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${c * (size + gap)} ${r * (size + gap)})`);
    const on = i < k;
    const head = document.createElementNS(ns, 'circle');
    head.setAttribute('cx', size / 2); head.setAttribute('cy', 6); head.setAttribute('r', 4.6);
    const body = document.createElementNS(ns, 'path');
    body.setAttribute('d', `M${size / 2 - 8} ${size - 1} v-4 a8 7 0 0 1 16 0 v4 z`);
    for (const s of [head, body]) {
      s.setAttribute('fill', on ? '#1f5da8' : '#ffffff');
      s.setAttribute('stroke', on ? '#1f5da8' : '#9aa1ad');
      s.setAttribute('stroke-width', '1.5');
      g.append(s);
    }
    svg.append(g);
  }
  container.replaceChildren(svg);
}

export function showError(where, err) {
  const box = el('div', { class: 'error', role: 'alert' },
    el('p', {}, el('strong', {}, 'The results could not be loaded.')),
    el('p', {}, 'This page needs the file data/model.json. If you opened the page directly from your computer, start a local web server in the site folder (for example: python3 -m http.server) and open http://localhost:8000.'),
    el('p', { class: 'small muted' }, String(err && err.message ? err.message : err)));
  where.prepend(box);
}

// Load the model once and run the page code
export async function boot(run) {
  initTextSize();
  document.querySelectorAll('[data-year]').forEach((n) => { n.textContent = String(new Date().getFullYear()); });
  if (!run) return;
  const main = document.querySelector('main');
  try {
    const engine = await loadEngine(document.body.dataset.model || 'data/model.json');
    await run(engine);
  } catch (err) {
    console.error(err);
    showError(main, err);
  }
}

// Debounce for sliders
export function debounce(fn, ms = 120) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Populate a <select> from engine levels, disabling options that break the design rules
export function fillSelect(select, engine, design, key) {
  const ok = new Set(engine.feasibleLevels(design, key));
  select.replaceChildren(...engine.attribute(key).levels.map((l) => {
    const o = el('option', { value: l.key }, ok.has(l.key) ? l.label : `${l.label} (not offered with the other choices)`);
    if (!ok.has(l.key)) o.disabled = true;
    if (l.key === design[key]) o.selected = true;
    return o;
  }));
}

export function feasibleTemplates(engine) {
  return engine.scenarios.filter((s) => engine.isFeasible(s.design));
}
