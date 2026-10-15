import { boot, el, per100, money, describe, feasibleTemplates, debounce, priceLabel, toast, changeLevel, signed, progress,
  stat, meaning, setContext, refreshInfo, goTo, infoBtn, designQuery } from './common.js';
import { lineChart, shareBars } from './charts.js';

const COL = { a: '#2a6bc4', b: '#18a078', none: '#6b7280', line: '#d1621f' };
const PRICES = Array.from({ length: 26 }, (_, i) => 2 * i);

boot((engine) => {
  const templates = feasibleTemplates(engine);
  const byId = (id) => templates.find((t) => t.id === id);
  const fill = (sel, def) => {
    for (const t of templates) sel.append(el('option', { value: t.id, selected: t.id === def }, t.name));
  };
  const progSel = document.getElementById('fee-programme');
  const altSel = document.getElementById('alt-programme');
  fill(progSel, 'S2'); fill(altSel, 'S3');
  const fee = document.getElementById('fee-input');
  const altFee = document.getElementById('alt-fee');
  const programme = () => ({ ...byId(progSel.value).design, price: +fee.value });
  const name = () => byId(progSel.value).name.toLowerCase();

  // ------------------------------------------------------------ fee curve
  let cache = { id: null };
  function curve() {
    if (cache.id !== progSel.value) cache = { id: progSel.value, ...engine.mxlCurve(byId(progSel.value).design, PRICES, 250) };
    return cache;
  }
  const nearest = (arr, p) => arr.reduce((b, x) => (Math.abs(x.price - p) < Math.abs(b.price - p) ? x : b));

  function updateFee() {
    const d = programme();
    document.getElementById('fee-out').textContent = priceLabel(d.price);
    document.getElementById('fee-programme-desc').textContent = describe(engine, d);
    const c = curve();
    lineChart(document.getElementById('fee-chart'), {
      title: 'Predicted take-up by fee per session',
      series: [{ name: 'Take-up', color: COL.line, band: true, points: c.uptake.map((p) => ({ x: p.price, y: p.point, lo: p.lo, hi: p.hi })) }],
      x: [0, 50], y: [Math.max(0, Math.floor(10 * Math.min(...c.uptake.map((p) => p.lo))) / 10 - 0.1), 1],
      xTicks: [0, 5, 10, 20, 30, 40, 50], xFormat: (v) => (v === 0 ? 'Free' : `$${v}`), yFormat: (v) => `${Math.round(100 * v)}%`,
      xLabel: 'Fee per session (A$)', yLabel: 'Take-up', marker: d.price,
    });
    lineChart(document.getElementById('elasticity-chart'), {
      title: 'Price sensitivity of take-up by fee',
      series: [{ name: 'Price sensitivity', color: COL.line, band: true, points: c.elasticity.map((p) => ({ x: p.price, y: p.point, lo: p.lo, hi: p.hi })) }],
      x: [0, 50], y: [Math.min(-0.5, Math.floor(10 * Math.min(...c.elasticity.map((p) => p.lo))) / 10), 0],
      xTicks: [0, 5, 10, 20, 30, 40, 50], xFormat: (v) => (v === 0 ? 'Free' : `$${v}`), yFormat: (v) => v.toFixed(1),
      xLabel: 'Fee per session (A$)', yLabel: 'Price sensitivity', marker: d.price,
    });

    const u0 = engine.uptakeMxl({ ...d, price: 0 }, 300);
    const mx = engine.uptakeMxl(d, 300);
    const e = d.price === 0 ? { point: 0 } : engine.elasticityMxl(d, 150);
    const at50 = c.uptake[c.uptake.length - 1];
    const drop = u0.point - mx.point;
    document.getElementById('fee-stats').replaceChildren(
      stat('Take-up at this fee', `${per100(mx.point)} in 100`, `95% interval ${per100(mx.ci[0])} to ${per100(mx.ci[1])}`, 'take-up'),
      stat('Fewer than if free', d.price === 0 ? 'None' : `${(100 * drop).toFixed(1)} in 100`, `free: ${per100(u0.point)} in 100`),
      stat('Price sensitivity', d.price === 0 ? 'None at zero' : e.point.toFixed(2), d.price === 0 ? 'set a fee to see it' : `10% higher fee: ${Math.abs(10 * e.point).toFixed(1)}% lower take-up`, 'elasticity'),
    );
    const level = drop < 0.02 ? 'green' : drop < 0.06 ? 'amber' : 'red';
    meaning(document.getElementById('fee-meaning'), d.price === 0 ? 'green' : level, [
      d.price === 0
        ? `When free, about ${per100(mx.point)} in 100 people would choose the ${name()} over no programme. Charging A$50 per session would lower that to about ${per100(at50.point)} in 100.`
        : `At ${money(d.price)} per session, about ${per100(mx.point)} in 100 people would choose the ${name()}, ${(100 * drop).toFixed(1)} in 100 fewer than if it were free.`,
      d.price === 0 ? 'People in the study were not very sensitive to price: take-up falls by proportionally less than the fee rises across the whole range tested.'
        : level === 'green' ? 'That is a small loss: the fee is unlikely to be the main barrier for this programme.'
          : level === 'amber' ? 'That is a moderate loss. If reaching as many people as possible matters, consider a fee waiver for people who would otherwise miss out.'
            : 'That is a large loss. A lower fee, a waiver or funded places would reach noticeably more people.',
      el('span', {}, 'The fee mostly affects people who are undecided. People who would not use any programme are not reached by lowering the fee; see ', el('a', { href: '#reach' }, 'who a programme will not reach'), '.'),
    ]);
    const firstElastic = c.elasticity.find((p) => p.point <= -1);
    meaning(document.getElementById('elasticity-text'), null, [
      firstElastic ? `Take-up becomes price sensitive (below -1) at about ${money(firstElastic.price)} per session.`
        : `Across the range tested, price sensitivity stays between 0 and -1. Take-up falls by proportionally less than the fee rises, so raising the fee raises fee income even though fewer people take part.`,
      d.price > 0 ? `At ${money(d.price)} it is ${nearest(c.elasticity, d.price).point.toFixed(2)}.` : null,
    ]);
    setContext('take-up', () => `${per100(mx.point)} in 100 at ${d.price === 0 ? 'no fee' : money(d.price) + ' per session'}, ${per100(u0.point)} in 100 if free.`);
    setContext('elasticity', () => (d.price === 0 ? 'the programme is free, so there is no fee to respond to.' : `${e.point.toFixed(2)} at ${money(d.price)}: a 10% higher fee would lower take-up by about ${Math.abs(10 * e.point).toFixed(1)}%.`));
    document.getElementById('to-value').href = `value.html${designQuery(d)}`;
    document.getElementById('to-plan').href = `plan.html${designQuery(d)}`;
    updateSwitch(); updateTravel(); updateReach();
    refreshInfo();
  }

  // ------------------------------------------------------------ switching between two programmes
  function updateSwitch() {
    const a = programme();
    const b = { ...byId(altSel.value).design, price: +altFee.value };
    document.getElementById('alt-fee-out').textContent = priceLabel(b.price);
    const nameA = byId(progSel.value).name, nameB = byId(altSel.value).name;
    if (progSel.value === altSel.value) {
      document.getElementById('share-chart').replaceChildren(el('p', { class: 'warning' }, 'Choose a second programme that is different from the first to see how people switch between them.'));
      document.getElementById('switch-text').replaceChildren();
      return null;
    }
    const s = engine.substitution(a, b).mxl;
    const f = engine.substitution({ ...a, price: 0 }, b).mxl;
    const parts = (x) => [{ name: nameA, value: x.A, color: COL.a }, { name: nameB, value: x.B, color: COL.b }, { name: 'No programme', value: x.none, color: COL.none }];
    const bars = [{ label: `${nameA} free`, parts: parts(f) }];
    if (a.price > 0) bars.push({ label: `${nameA} at ${money(a.price)}`, parts: parts(s) });
    shareBars(document.getElementById('share-chart'), bars, { title: 'How choices split between two programmes and no programme' });
    const lostA = f.A - s.A, toNone = s.none - f.none;
    meaning(document.getElementById('switch-text'), a.price === 0 ? null : s.diversionNone > 0.5 ? 'red' : s.diversionNone > 0.3 ? 'amber' : 'green', [
      `With both programmes on offer, ${per100(s.A)} in 100 people would choose the ${nameA.toLowerCase()}, ${per100(s.B)} the ${nameB.toLowerCase()} and ${per100(s.none)} neither.`,
      a.price === 0 ? 'Set a fee for the first programme above to see where people go when it rises.'
        : `Compared with making the ${nameA.toLowerCase()} free, its fee of ${money(a.price)} moves ${(100 * lostA).toFixed(1)} in 100 people away from it: ${(100 * (lostA - toNone)).toFixed(1)} to the ${nameB.toLowerCase()} and ${(100 * toNone).toFixed(1)} to no programme at all.`,
      a.price === 0 ? null : el('span', {}, `For a further small rise, about ${per100(s.diversionNone)} in 100 of the people it loses would leave support altogether. `, infoBtn('diversion', 'where people go'), ` ${s.diversionNone > 0.5 ? 'Most people lost would not be picked up by the other programme.' : 'Most people lost would move to the other programme rather than go without.'}`),
    ]);
    setContext('diversion', () => `${per100(s.diversionNone)} in 100 of the people the ${nameA.toLowerCase()} loses to a fee rise would choose no programme.`);
    return s;
  }

  // ------------------------------------------------------------ travel and mode
  function updateTravel() {
    const base = programme();
    const modes = engine.attribute('mode').levels;
    const dists = engine.attribute('distance').levels;
    const head = el('tr', {}, el('th', { scope: 'col' }, 'Travel'), ...modes.map((m) => el('th', { scope: 'col', class: 'num' }, m.label)));
    let best = { u: -1 };
    const rows = dists.map((dl) => el('tr', {}, el('th', { scope: 'row' }, dl.label), ...modes.map((m) => {
      const d = { ...base, mode: m.key, distance: dl.key };
      if (!engine.isFeasible(d)) return el('td', { class: 'num muted' }, 'Not offered');
      const u = engine.uptakeMxl(d, 0).point;
      if (u > best.u) best = { u, m: m.label, dl: dl.label };
      const cur = m.key === base.mode && dl.key === base.distance;
      return el('td', { class: 'num' }, cur ? el('strong', {}, `${per100(u)} in 100 (now)`) : `${per100(u)} in 100`);
    })));
    document.getElementById('travel-table').replaceChildren(el('table', {},
      el('caption', {}, `Take-up of the ${name()} (${base.price === 0 ? 'free' : money(base.price) + ' per session'}); the current design is in bold`),
      el('thead', {}, head), el('tbody', {}, ...rows)));
    const now = engine.uptakeMxl(base, 0).point;
    const local = { ...base, mode: 'inperson', distance: 'local' }, wider = { ...base, mode: 'inperson', distance: 'wider' };
    const hyw = { ...base, mode: 'hybrid', distance: 'wider' };
    const ok = engine.isFeasible(local) && engine.isFeasible(wider) && engine.isFeasible(hyw);
    meaning(document.getElementById('travel-text'), best.u - now < 0.01 ? 'green' : best.u - now < 0.05 ? 'amber' : 'red', [
      best.u - now < 0.01 ? `The current travel and delivery mode are already the best available for this programme (${per100(now)} in 100).`
        : `The best combination for this programme is ${best.m.toLowerCase()} with travel "${best.dl.toLowerCase()}", at ${per100(best.u)} in 100, compared with ${per100(now)} in 100 now.`,
      ok ? `Moving an in-person programme from the local area to 50 km or more away changes take-up from ${per100(engine.uptakeMxl(local, 0).point)} to ${per100(engine.uptakeMxl(wider, 0).point)} in 100. Offering it as hybrid at that distance gives ${per100(engine.uptakeMxl(hyw, 0).point)} in 100, so regional services may also need outreach or transport support.`
        : null,
    ]);
  }

  // ------------------------------------------------------------ who it will not reach
  function updateReach() {
    const d = programme();
    const r = engine.reach({ ...d, price: 0 });
    const sp = engine.spread(d);
    const seg = (cls, share) => el('span', { class: cls, style: `width:${(100 * share).toFixed(1)}%` }, share >= 0.08 ? String(per100(share)) : '');
    document.getElementById('reach-text').replaceChildren(
      el('p', { class: 'prose' }, `Out of 100 people offered the ${name()} at this fee, ${per100(sp.likely)} are likely users, ${per100(sp.unsure)} are undecided and ${per100(sp.unlikely)} are unlikely users. `, infoBtn('likely', 'likely, undecided and unlikely')),
      el('div', { class: 'spread', role: 'img', 'aria-label': `${per100(sp.likely)} likely, ${per100(sp.unsure)} undecided, ${per100(sp.unlikely)} unlikely, out of 100` },
        seg('s-likely', sp.likely), seg('s-unsure', sp.unsure), seg('s-unlikely', sp.unlikely)),
      el('ul', { class: 'spread-key' },
        el('li', {}, el('i', { style: 'background:#1f5da8' }), 'Likely: 80% chance or more'),
        el('li', {}, el('i', { style: 'background:#8fb0d9' }), 'Undecided'),
        el('li', {}, el('i', { style: 'background:repeating-linear-gradient(45deg,#f4f2f7 0 3px,#d9d5e0 3px 4px)' }), 'Unlikely: under 20% chance')),
    );
    const box = el('div');
    meaning(box, r.neverShare > 0.3 ? 'red' : r.neverShare > 0.2 ? 'amber' : 'green', [
      el('span', {}, `About ${per100(r.neverShare)} in 100 people would not take up the ${name()} even if it were free. `, infoBtn('never-free', 'would not take it even if free')),
      r.medianReservation > 50 ? 'For half the population it is worth more than A$50 per session, the highest fee tested.' : `For half the population it is worth at least ${money(Math.max(0, r.medianReservation))} per session.`,
      'Most of the differences between people in the study were about whether to use any programme at all, rather than which features they wanted. Programme design alone is unlikely to reach this group; a trusted referral, clear information and a trial session may matter more.',
    ]);
    document.getElementById('reach-text').append(box);
    setContext('never-free', () => `${per100(r.neverShare)} in 100 for the ${name()}.`);
    setContext('likely', () => `${per100(sp.likely)} likely, ${per100(sp.unsure)} undecided and ${per100(sp.unlikely)} unlikely, out of 100.`);
  }

  // ------------------------------------------------------------ progress, buttons and messages
  const steps = progress(document.getElementById('progress'), [
    { id: 'fee', label: 'Set a fee', href: '#fee' },
    { id: 'switching', label: 'See where people go', href: '#switching' },
    { id: 'travel', label: 'Check travel and mode', href: '#travel' },
    { id: 'reach', label: 'See who it will miss', href: '#reach' },
    { id: 'value', label: 'Check benefits and costs', href: 'value.html' },
  ]);
  const nextAction = () => {
    const n = steps.nextLabel();
    if (!n) return null;
    return n.href.startsWith('#') ? { label: `Next: ${n.label.toLowerCase()}`, onClick: () => goTo(n.href) }
      : { label: `Next: ${n.label.toLowerCase()}`, href: `value.html${designQuery(programme())}` };
  };
  for (const id of ['switching', 'travel', 'reach', 'elasticity']) {
    document.getElementById(id).addEventListener('toggle', (ev) => { if (ev.target.open && id !== 'elasticity') steps.mark(id); });
  }
  document.getElementById('to-value').addEventListener('click', () => steps.mark('value'));
  const takeup = () => engine.uptakeMxl(programme(), 0).point;
  let lastFeeTakeup = takeup();

  const quick = el('div', { class: 'quickbtns', role: 'group', 'aria-label': 'Quick fee choices' });
  for (const p of [0, 5, 20, 50]) {
    quick.append(el('button', { type: 'button', 'data-p': p, 'aria-pressed': 'false', onclick: () => { fee.value = p; fee.dispatchEvent(new Event('input')); fee.dispatchEvent(new Event('change')); } }, p === 0 ? 'Free' : `$${p}`));
  }
  fee.insertAdjacentElement('afterend', quick);
  const markQuick = () => { for (const b of quick.children) b.setAttribute('aria-pressed', String(+b.dataset.p === +fee.value)); };

  const onFee = debounce(updateFee, 120);
  fee.addEventListener('input', () => { document.getElementById('fee-out').textContent = priceLabel(+fee.value); markQuick(); onFee(); });
  fee.addEventListener('change', () => {
    updateFee(); markQuick(); steps.mark('fee');
    const u = takeup(), d = u - lastFeeTakeup; lastFeeTakeup = u;
    const free = engine.uptakeMxl({ ...programme(), price: 0 }, 0).point;
    toast({ level: +fee.value === 0 ? 'green' : changeLevel(d), title: `Fee set to ${+fee.value === 0 ? 'free' : money(+fee.value) + ' per session'}`,
      message: `Take-up ${per100(u)} in 100${Math.abs(d) >= 0.005 ? ` (${signed(100 * d, 1)} from the previous fee)` : ''}; ${+fee.value === 0 ? 'the highest possible for this programme.' : `${(100 * (free - u)).toFixed(1)} in 100 fewer than if it were free.`}`,
      action: nextAction() });
  });
  progSel.addEventListener('change', () => {
    updateFee(); lastFeeTakeup = takeup(); steps.mark('fee');
    toast({ level: 'info', title: `Programme: ${name()}`,
      message: `Every section now uses this programme. Take-up at the current fee: ${per100(lastFeeTakeup)} in 100.`, action: nextAction() });
  });
  altSel.addEventListener('change', () => {
    const s = updateSwitch(); steps.mark('switching');
    toast({ level: s ? 'info' : 'amber', title: `Second programme: ${byId(altSel.value).name.toLowerCase()}`,
      message: s ? `With both on offer, ${per100(s.none)} in 100 people would choose neither.` : 'Choose a programme that differs from the first.', action: s ? nextAction() : null });
  });
  altFee.addEventListener('input', debounce(updateSwitch, 100));
  altFee.addEventListener('change', () => {
    const s = updateSwitch(); steps.mark('switching');
    if (s) toast({ level: 'info', title: `Second programme fee: ${+altFee.value === 0 ? 'free' : money(+altFee.value)}`, message: `${per100(s.B)} in 100 would choose it; ${per100(s.none)} in 100 would choose neither.` });
  });

  updateFee();
  markQuick();
});
