// Shared page behaviour: text size, model loading, formatting and small helpers.
import { loadEngine } from './engine.js';
import { GLOSSARY } from './glossary.js';

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
    toast({ level: 'info', title: `Text size: ${{ standard: 'standard', large: 'larger', largest: 'largest' }[b.dataset.size]}`, message: 'This setting is remembered on this device for every page.', duration: 5000 });
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
  initInfo();
  initFolds();
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

// ------------------------------------------------------------ notifications
// Messages appear at the bottom right. Levels follow a traffic light:
// green = good result or action done, amber = check this, red = problem or worse result,
// info = neutral confirmation. Each carries a word label so colour is never the only cue.
const LEVELS = {
  green: { label: 'Good', icon: '<circle cx="10" cy="10" r="9"/><path d="M5.5 10.3l3 3 6-6.6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' },
  amber: { label: 'Check', icon: '<path d="M10 1.5l9 16.5H1z"/><path d="M10 7v5" stroke="#1f2329" stroke-width="2.2" stroke-linecap="round"/><circle cx="10" cy="15" r="1.3" fill="#1f2329"/>' },
  red: { label: 'Caution', icon: '<circle cx="10" cy="10" r="9"/><path d="M6.5 6.5l7 7M13.5 6.5l-7 7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>' },
  info: { label: 'Done', icon: '<circle cx="10" cy="10" r="9"/><path d="M10 8.6v5.6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="10" cy="5.6" r="1.3" fill="#fff"/>' },
};
let toastRegion;
function region() {
  if (toastRegion) return toastRegion;
  toastRegion = el('div', { class: 'toasts', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  document.body.append(toastRegion);
  return toastRegion;
}

/**
 * toast({ level, title, message, action: { label, href | onClick }, duration })
 */
export function toast({ level = 'info', title, message, action, duration = 9000 }) {
  const box = region();
  const L = LEVELS[level] || LEVELS.info;
  const t = el('div', { class: `toast toast-${level}`, role: level === 'red' ? 'alert' : 'status' });
  const icon = el('span', { class: 'toast-icon', 'aria-hidden': 'true', html: `<svg viewBox="0 0 20 20">${L.icon}</svg>` });
  const body = el('div', { class: 'toast-body' },
    el('p', { class: 'toast-title' }, el('span', { class: 'toast-level' }, `${L.label}: `), title),
    message ? el('p', { class: 'toast-msg' }, message) : null);
  if (action) {
    const a = action.href
      ? el('a', { class: 'toast-action', href: action.href }, action.label)
      : el('button', { type: 'button', class: 'toast-action', onclick: () => { action.onClick(); close(); } }, action.label);
    body.append(a);
  }
  const x = el('button', { type: 'button', class: 'toast-close', 'aria-label': 'Close message', html: '&times;' });
  t.append(icon, body, x);
  let timer;
  const close = () => { clearTimeout(timer); t.classList.add('leaving'); setTimeout(() => t.remove(), 200); };
  const arm = () => { clearTimeout(timer); if (duration) timer = setTimeout(close, duration); };
  x.addEventListener('click', close);
  t.addEventListener('mouseenter', () => clearTimeout(timer));
  t.addEventListener('mouseleave', arm);
  t.addEventListener('focusin', () => clearTimeout(timer));
  t.addEventListener('focusout', arm);
  box.append(t);
  while (box.children.length > 3) box.firstElementChild.remove();
  arm();
  return t;
}

// Traffic light for a change in take-up (difference in probability)
export function changeLevel(delta, small = 0.005) {
  if (delta > small) return 'green';
  if (delta < -small) return 'red';
  return 'amber';
}
export const signed = (x, d = 0) => `${x > 0 ? '+' : x < 0 ? '-' : ''}${Math.abs(x).toFixed(d)}`;

// ------------------------------------------------------------ progress steps
// steps: [{ id, label, href }]; mark(id) ticks a step and updates the "next" hint
export function progress(container, steps) {
  const done = new Set();
  const list = el('ol', { class: 'steps' });
  const items = steps.map((s, i) => {
    const li = el('li', { 'data-step': s.id }, el('span', { class: 'step-n', 'aria-hidden': 'true' }, String(i + 1)),
      s.href ? el('a', { href: s.href }, s.label) : el('span', {}, s.label),
      el('span', { class: 'visually-hidden step-state' }, ' (not done yet)'));
    list.append(li);
    return li;
  });
  const next = el('p', { class: 'step-next' });
  container.replaceChildren(el('h2', { class: 'steps-title' }, 'Your progress'), list, next);
  const refresh = () => {
    let first = null;
    steps.forEach((s, i) => {
      const isDone = done.has(s.id);
      items[i].classList.toggle('done', isDone);
      items[i].querySelector('.step-state').textContent = isDone ? ' (done)' : ' (not done yet)';
      if (!isDone && !first) first = s;
      items[i].classList.toggle('current', !isDone && first === s);
    });
    next.replaceChildren(first ? el('span', {}, 'Next: ', first.href ? el('a', { href: first.href }, first.label) : first.label)
      : el('span', {}, 'All steps done. You can print or share your results.'));
  };
  refresh();
  return {
    mark(id) { const was = done.has(id); done.add(id); refresh(); return !was; },
    nextLabel() { const s = steps.find((x) => !done.has(x.id)); return s ? s : null; },
  };
}

// ------------------------------------------------------------ sharing a design in the address
const KEYS = ['type', 'carer', 'mode', 'frequency', 'duration', 'distance'];
export function designFromQuery(engine, fallback) {
  const q = new URLSearchParams(location.search);
  const d = { ...fallback };
  let any = false;
  for (const k of KEYS) {
    const v = q.get(k);
    if (v && engine.attribute(k).levels.some((l) => l.key === v)) { d[k] = v; any = true; }
  }
  const p = q.get('price');
  if (p != null && !Number.isNaN(+p)) { d.price = Math.max(0, Math.min(50, Math.round(+p))); any = true; }
  return any && engine.isFeasible(d) ? d : null;
}
export function designQuery(d) {
  const q = new URLSearchParams();
  for (const k of KEYS) q.set(k, d[k]);
  q.set('price', String(d.price));
  return `?${q.toString()}`;
}
export function writeQuery(d) {
  try { history.replaceState(null, '', designQuery(d) + location.hash); } catch (e) { /* ignore */ }
}
export async function copyLink() {
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    toast({ level: 'green', title: 'Link copied', message: 'Paste it into an email or document. It opens this page with the same programme.' });
  } catch (e) {
    toast({ level: 'amber', title: 'Copy the link from the address bar', message: 'Your browser did not allow automatic copying. The address bar already contains this programme.' });
  }
}

// ------------------------------------------------------------ (i) explanations
// Any <button class="info" data-term="key"> opens a short explanation from the glossary.
// Pages can add a sentence about the current programme with setContext(key, () => text);
// an open explanation is refreshed when the page calls refreshInfo().
const contexts = {};
let pop = null, popFor = null;
export function setContext(key, fn) { contexts[key] = fn; }

export function infoBtn(key, label) {
  const g = GLOSSARY[key];
  return el('button', { type: 'button', class: 'info', 'data-term': key, 'aria-expanded': 'false',
    'aria-label': `What ${label || (g ? g.term.toLowerCase() : key)} means` }, el('span', { 'aria-hidden': 'true' }, 'i'));
}

function fillPop(btn) {
  const key = btn.dataset.term;
  const g = GLOSSARY[key];
  if (!g) return;
  const ctx = contexts[key] ? contexts[key]() : null;
  pop.replaceChildren(
    el('p', { class: 'pop-term', id: 'pop-title' }, g.term),
    el('p', {}, g.text),
    ctx ? el('p', { class: 'pop-now' }, el('strong', {}, 'For the programme on this page: '), ctx) : null,
    el('p', { class: 'pop-links' }, el('a', { href: `glossary.html#${key}` }, 'All terms in the glossary')),
    el('button', { type: 'button', class: 'pop-close', 'aria-label': 'Close explanation', onclick: () => closeInfo(true) }, '×'));
}

function placePop(btn) {
  const r = btn.getBoundingClientRect();
  const narrow = window.innerWidth < 560;
  pop.classList.toggle('pop-sheet', narrow);
  if (narrow) { pop.style.left = ''; pop.style.top = ''; return; }
  const w = Math.min(380, window.innerWidth - 32);
  let left = r.left + window.scrollX - 12;
  left = Math.max(16 + window.scrollX, Math.min(left, window.scrollX + window.innerWidth - w - 16));
  pop.style.width = `${w}px`;
  pop.style.left = `${left}px`;
  pop.style.top = `${r.bottom + window.scrollY + 8}px`;
}

function openInfo(btn) {
  if (!pop) {
    pop = el('div', { class: 'pop', role: 'dialog', 'aria-labelledby': 'pop-title', hidden: true });
    document.body.append(pop);
  }
  if (popFor === btn) { closeInfo(true); return; }
  closeInfo(false);
  popFor = btn;
  fillPop(btn);
  pop.hidden = false;
  placePop(btn);
  btn.setAttribute('aria-expanded', 'true');
  pop.querySelector('.pop-close').focus({ preventScroll: true });
}

export function closeInfo(returnFocus) {
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  if (popFor) {
    popFor.setAttribute('aria-expanded', 'false');
    if (returnFocus && document.contains(popFor)) popFor.focus({ preventScroll: true });
  }
  popFor = null;
}

export function refreshInfo() {
  if (pop && !pop.hidden && popFor && document.contains(popFor)) fillPop(popFor);
  else if (pop && !pop.hidden) closeInfo(false);
}

function initInfo() {
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('button.info');
    if (b) { ev.preventDefault(); openInfo(b); return; }
    if (pop && !pop.hidden && !pop.contains(ev.target)) closeInfo(false);
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeInfo(true); });
  window.addEventListener('resize', debounce(() => { if (popFor) placePop(popFor); }, 100));
}

// ------------------------------------------------------------ folding sections
// <details class="fold"> sections open when a link points at them or at something inside them.
export function reveal(target) {
  let n = typeof target === 'string' ? document.querySelector(target) : target;
  if (!n) return null;
  for (let p = n; p; p = p.parentElement) if (p.tagName === 'DETAILS' && !p.open) p.open = true;
  return n;
}
export function goTo(selector) {
  const n = reveal(selector);
  if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function initFolds() {
  window.addEventListener('beforeprint', () => document.querySelectorAll('details.fold:not([open])').forEach((d) => { d.open = true; d.dataset.printOpened = '1'; }));
  window.addEventListener('afterprint', () => document.querySelectorAll('details.fold[data-print-opened]').forEach((d) => { d.open = false; delete d.dataset.printOpened; }));
  const fromHash = () => { if (location.hash.length > 1) { try { reveal(decodeURIComponent(location.hash)); } catch (e) { /* bad selector */ } } };
  fromHash();
  window.addEventListener('hashchange', fromHash);
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[href^="#"]');
    if (a && a.getAttribute('href').length > 1) { try { reveal(a.getAttribute('href')); } catch (e) { /* ignore */ } }
  });
}

// ------------------------------------------------------------ small building blocks
// A figure with a label and an (i) button
export function stat(label, value, note, term) {
  return el('div', { class: 'stat' },
    el('dt', {}, label, term ? infoBtn(term, label.toLowerCase()) : null),
    el('dd', {}, value, note ? el('small', {}, note) : null));
}

// "What this means" box: a short heading and plain sentences that change with the inputs
export function meaning(container, level, paragraphs) {
  container.className = `meaning${level ? ` meaning-${level}` : ''}`;
  container.replaceChildren(el('h3', {}, 'What this means'), ...paragraphs.filter(Boolean).map((p) => (typeof p === 'string' ? el('p', {}, p) : p)));
}
