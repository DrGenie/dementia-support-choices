import { boot, el, per100, pct, money, describe, fillSelect, feasibleTemplates, debounce, priceLabel,
  toast, progress, designFromQuery, designQuery, copyLink, stat, setContext, refreshInfo, goTo } from './common.js';
import { Engine, interval } from './engine.js';
import { lineChart } from './charts.js';

const DEFAULT = { type: 'peer', carer: 'yes', mode: 'hybrid', frequency: 'weekly', duration: '2h', distance: 'local', price: 5 };
const COST_CHOICES = [25, 50, 75, 100, 150];
const OFFERED_CHOICES = [100, 1000, 10000];
const SHARE_WORD = { 1: 'all of the stated value', 0.75: 'three quarters of the stated value', 0.5: 'half of the stated value' };

const lightOf = (r) => {
  if (r.bcr == null) return null;
  if (r.ci.bcr[0] >= 1) return 'green';
  if (r.ci.bcr[1] < 1) return 'red';
  return 'amber';
};
const LIGHT_WORD = { green: 'Benefits exceed costs', amber: 'Uncertain', red: 'Costs exceed benefits' };
const whole = (x) => Math.round(x).toLocaleString('en-AU');

boot((engine) => {
  const fromUrl = designFromQuery(engine, DEFAULT);
  let design = fromUrl || { ...DEFAULT };
  const q = new URLSearchParams(location.search);
  const state = {
    offered: Math.max(1, Math.round(+q.get('n') || 1000)),
    cost: q.get('c') != null && q.get('c') !== '' && !Number.isNaN(+q.get('c')) ? Math.max(0, +q.get('c')) : null,
    share: 1,
  };
  let last = null;

  const steps = progress(document.getElementById('progress'), [
    { id: 'programme', label: 'Choose a programme', href: '#builder' },
    { id: 'cost', label: 'Enter a running cost', href: '#cost-field' },
    { id: 'verdict', label: 'Read the verdict', href: '#result' },
    { id: 'sensitivity', label: 'Test a lower value', href: '#share-field' },
    { id: 'compare', label: 'Compare with another programme', href: '#compare' },
    { id: 'share', label: 'Print or share', href: '#result' },
  ]);
  if (fromUrl) steps.mark('programme');

  // ------------------------------------------------------------ controls
  const templates = feasibleTemplates(engine);
  const tsel = document.getElementById('template');
  tsel.append(el('option', { value: '' }, fromUrl ? 'Programme from your link' : 'Choose an example'));
  for (const s of templates) tsel.append(el('option', { value: s.id }, s.name));
  const selects = {};
  const fields = document.getElementById('feature-fields');
  for (const a of engine.attributes) {
    const s = el('select', { id: `f-${a.key}` });
    fields.append(el('div', { class: 'field' }, el('label', { for: `f-${a.key}` }, a.label), s));
    selects[a.key] = s;
    s.addEventListener('change', () => {
      const before = last;
      design[a.key] = s.value; tsel.value = '';
      const now = update();
      steps.mark('programme');
      tellChange(before, now, `${a.label}: ${engine.label(a.key, s.value).toLowerCase()}`);
    });
  }
  const price = document.getElementById('price');
  const priceOut = document.getElementById('price-out');
  price.addEventListener('input', () => { design.price = +price.value; priceOut.textContent = priceLabel(design.price); tsel.value = ''; slow(); });
  price.addEventListener('change', () => { const before = last; design.price = +price.value; const now = update(); steps.mark('programme'); tellChange(before, now, `Fee set to ${design.price === 0 ? 'free' : money(design.price) + ' per session'}`); });
  tsel.addEventListener('change', () => {
    const t = templates.find((x) => x.id === tsel.value);
    if (!t) return;
    const before = last;
    design = { ...t.design }; const now = update(); steps.mark('programme');
    tellChange(before, now, `Example applied: ${t.name}`);
  });

  const offered = document.getElementById('offered');
  offered.value = state.offered;
  const offeredQuick = document.getElementById('offered-quick');
  for (const n of OFFERED_CHOICES) {
    offeredQuick.append(el('button', { type: 'button', 'data-n': n, 'aria-pressed': 'false', onclick: () => {
      state.offered = n; offered.value = n; update();
      toast({ level: 'info', title: `People offered: ${n.toLocaleString('en-AU')}`, message: 'Yearly totals now refer to this many people. The ratio and the break-even cost do not change with the number of people.' });
    } }, n.toLocaleString('en-AU')));
  }
  offered.addEventListener('input', () => { const v = Math.floor(+offered.value); if (v >= 1) { state.offered = v; slow(); } });
  offered.addEventListener('change', () => {
    if (!(Math.floor(+offered.value) >= 1)) {
      toast({ level: 'red', title: 'The number of people needs to be 1 or more', message: 'The previous number has been kept.' });
      offered.value = state.offered; return;
    }
    update();
    toast({ level: 'info', title: `People offered: ${state.offered.toLocaleString('en-AU')}` });
  });

  const cost = document.getElementById('cost');
  if (state.cost != null) { cost.value = state.cost; steps.mark('cost'); }
  const costQuick = document.getElementById('cost-quick');
  for (const c of COST_CHOICES) {
    costQuick.append(el('button', { type: 'button', 'data-c': c, 'aria-pressed': 'false', onclick: () => {
      state.cost = c; cost.value = c; const r = update(); steps.mark('cost'); steps.mark('verdict');
      tellVerdict(r, `Running cost: ${money(c)} per participant per session`);
    } }, money(c)));
  }
  cost.addEventListener('input', () => { state.cost = cost.value === '' ? null : Math.max(0, +cost.value); slow(); });
  cost.addEventListener('change', () => {
    state.cost = cost.value === '' ? null : Math.max(0, +cost.value);
    const r = update();
    if (state.cost == null) { toast({ level: 'amber', title: 'Running cost cleared', message: 'Enter a cost per participant per session to see the verdict.' }); return; }
    steps.mark('cost'); steps.mark('verdict');
    tellVerdict(r, `Running cost: ${money(state.cost)} per participant per session`);
  });

  document.querySelectorAll('input[name="share"]').forEach((r) => r.addEventListener('change', () => {
    const before = last;
    state.share = +r.value; const now = update(); steps.mark('sensitivity');
    const label = SHARE_WORD[r.value];
    if (now.bca.bcr == null) toast({ level: 'info', title: `Counting ${label}`, message: `The break-even running cost is now ${money(now.bca.breakEven)} per participant per session.` });
    else {
      const changed = before && lightOf(before.bca) !== lightOf(now.bca);
      tellVerdict(now, `Counting ${label}`, changed ? 'The verdict changed, so the conclusion depends on how much of the stated value is real.' : 'The verdict did not change, so the conclusion holds under this assumption.');
    }
  }));

  const alt = document.getElementById('alt');
  for (const s of templates) alt.append(el('option', { value: s.id, selected: s.id === 'S1' }, s.name));
  alt.addEventListener('change', () => { const r = renderCompare(); steps.mark('compare'); tellCompare(r); });
  document.getElementById('compare').addEventListener('toggle', (ev) => { if (ev.target.open) steps.mark('compare'); });

  document.getElementById('copy').addEventListener('click', () => { copyLink(); steps.mark('share'); });
  document.getElementById('print').addEventListener('click', () => {
    steps.mark('share');
    toast({ level: 'info', title: 'Opening the print window', message: 'Choose "Save as PDF" as the printer to keep a copy.' });
    setTimeout(() => window.print(), 300);
  });

  // ------------------------------------------------------------ calculation
  const sessions = () => engine.sessionsPerYear(design);
  const opts = (extra = {}) => ({ offered: state.offered, providerCost: state.cost, benefitShare: state.share, ...extra });
  function analyse(d) {
    const v = engine.valueDraws('mxlr', d, 200);
    return { value: v, bca: Engine.bca(v, d, engine.sessionsPerYear(d), opts()) };
  }

  function sync() {
    for (const a of engine.attributes) fillSelect(selects[a.key], engine, design, a.key);
    price.value = design.price; priceOut.textContent = priceLabel(design.price);
    for (const b of costQuick.children) b.setAttribute('aria-pressed', String(+b.dataset.c === state.cost));
    for (const b of offeredQuick.children) b.setAttribute('aria-pressed', String(+b.dataset.n === state.offered));
  }

  const rng = (ci, f) => `95% interval ${f(ci[0])} to ${f(ci[1])}`;

  function update() {
    sync();
    const { value, bca } = analyse(design);
    const s = sessions();
    const light = lightOf(bca);
    const P = value.point.P;

    // Verdict and what it means
    const v = document.getElementById('verdict');
    const lines = [];
    if (light) {
      const half = state.share > 0.5 ? Engine.bca(value, design, s, opts({ benefitShare: 0.5 })) : null;
      const gap = bca.breakEven - state.cost;
      v.className = `verdict verdict-${light}`;
      lines.push(el('span', { class: `light light-${light}` }, LIGHT_WORD[light]));
      lines.push(el('h3', {}, light === 'amber'
        ? `Each dollar spent returns about ${money(bca.bcr, 2)}, but the result is uncertain`
        : `Each dollar spent returns about ${money(bca.bcr, 2)} in value to participants`));
      lines.push(el('p', {}, `Of ${state.offered.toLocaleString('en-AU')} people offered this programme, about ${whole(bca.participants)} would take part. Over a year, the value to them is ${money(bca.benefit)} and the running cost is ${money(bca.cost)}, a net benefit of ${money(bca.net)}. Allowing for uncertainty in the estimates, there is a ${pct(bca.pPositive)} chance that benefits exceed costs.`));
      lines.push(el('p', {}, gap >= 0
        ? `Your running cost of ${money(state.cost)} is ${money(gap)} below the break-even cost of ${money(bca.breakEven)} per participant per session, so there is ${gap / bca.breakEven > 0.3 ? 'a comfortable' : 'only a small'} margin.`
        : `Your running cost of ${money(state.cost)} is ${money(-gap)} above the break-even cost of ${money(bca.breakEven)} per participant per session. Lowering the cost or raising take-up through design would be needed.`));
      if (half) {
        const hl = lightOf(half);
        lines.push(el('p', {}, hl === light
          ? `If people valued the programme at only half what they said, the ratio would be ${half.bcr.toFixed(2)} and the verdict would not change.`
          : `If people valued the programme at only half what they said, the ratio would fall to ${half.bcr.toFixed(2)} and the verdict would become "${LIGHT_WORD[hl].toLowerCase()}". Treat the result with some caution.`));
      }
      lines.push(el('p', { class: 'small' }, el('strong', {}, 'Next: '), light === 'green' ? 'compare with another programme, or print the analysis to share.'
        : light === 'amber' ? `check your running cost; the programme breaks even at ${money(bca.breakEven)} per participant per session.`
          : 'try a design with higher take-up in the planner, or a lower running cost.'));
    } else {
      v.className = 'verdict';
      lines.push(el('h3', {}, `It breaks even at ${money(bca.breakEven)} per participant per session`));
      lines.push(el('p', {}, `If this programme costs less than ${money(bca.breakEven)} per participant per session to run (${rng(bca.ci.breakEven, money)}), it returns more value to participants than it costs. This needs no cost information, so it is a useful first check.`));
      lines.push(el('p', { class: 'small' }, el('strong', {}, 'Next: '), 'enter your running cost, or choose one of the amounts above, to get the full verdict.'));
    }
    v.replaceChildren(...lines);

    // Key figures
    const key = [
      stat('Expected participants', whole(bca.participants), `${per100(P)} in 100 of those offered`, 'take-up'),
      stat('Break-even running cost', money(bca.breakEven), 'per participant per session', 'break-even'),
    ];
    if (bca.cost != null) {
      key.push(stat('Benefit-cost ratio', bca.bcr.toFixed(2), rng(bca.ci.bcr, (x) => x.toFixed(2)), 'bcr'),
        stat('Net benefit per year', money(bca.net), rng(bca.ci.net, money), 'net-benefit'));
    } else {
      key.push(stat('Value to participants per year', money(bca.benefit), rng(bca.ci.benefit, money), 'value'));
    }
    document.getElementById('bca-stats').replaceChildren(...key);

    const more = [
      stat('Value per participant per session', money(bca.benefitPerParticipantSession), rng(bca.ci.benefitPerParticipantSession, money)),
      stat('Value to participants per year', money(bca.benefit), rng(bca.ci.benefit, money), 'value'),
    ];
    if (bca.cost != null) {
      more.push(stat('Running cost per year', money(bca.cost), `${s} sessions at ${money(state.cost)}`, 'running-cost'),
        stat('Chance benefits exceed costs', pct(bca.pPositive), 'across the uncertainty in the estimates', 'interval'));
    }
    document.getElementById('more-stats').replaceChildren(...more);
    const rows = [
      ['Programme', describe(engine, design), ''],
      ['Sessions per participant per year', String(s), ''],
      ['Fees paid by participants per year', money(bca.fees), rng(bca.ci.fees, money)],
      ['Value net of fees per person offered per session', money(bca.surplusPerOfferedSession, 2), rng(bca.ci.surplusPerOfferedSession, (x) => money(x, 2))],
      ['Share of stated value counted', pct(state.share), ''],
      ['Model', 'Mixed logit, 1,000 simulated people', ''],
    ];
    document.getElementById('bca-table').replaceChildren(el('table', {},
      el('caption', {}, 'Details of the calculation'),
      el('tbody', {}, ...rows.map((r) => el('tr', {}, el('th', { scope: 'row' }, r[0]), el('td', {}, r[1]), el('td', { class: 'small muted' }, r[2]))))));

    // Explanations that follow the inputs
    setContext('take-up', () => `${per100(P)} in 100 people offered it would take part, so ${whole(bca.participants)} of ${state.offered.toLocaleString('en-AU')}.`);
    setContext('break-even', () => `${money(bca.breakEven)} per participant per session (${rng(bca.ci.breakEven, money)}).`);
    setContext('bcr', () => (bca.bcr == null ? 'enter a running cost to see the ratio.' : `${bca.bcr.toFixed(2)}: every A$1 of running cost returns ${money(bca.bcr, 2)} of value to participants.`));
    setContext('net-benefit', () => (bca.net == null ? 'enter a running cost to see it.' : `${money(bca.net)} per year for ${state.offered.toLocaleString('en-AU')} people offered.`));
    setContext('value', () => `${money(bca.benefit)} per year in total, or ${money(bca.surplusPerOfferedSession, 2)} per person offered per session after the fee.`);
    setContext('running-cost', () => (state.cost == null ? 'no running cost entered yet.' : `${money(state.cost)} per participant per session, or ${money(bca.cost)} per year in total.`));
    setContext('benefit-share', () => `counting ${SHARE_WORD[state.share]}.`);

    // Links
    const qstr = designQuery(design) + `&n=${state.offered}${state.cost != null ? `&c=${state.cost}` : ''}`;
    try { history.replaceState(null, '', qstr + location.hash); } catch (e) { /* ignore */ }
    document.getElementById('to-plan').href = `plan.html${designQuery(design)}`;
    charts(value, bca);
    renderCompare();
    refreshInfo();
    last = { bca, P };
    return last;
  }
  const slow = debounce(update, 200);

  function charts(value, now) {
    const s = sessions();
    const costs = Array.from({ length: 37 }, (_, i) => 20 + i * 5);
    const pts = costs.map((c) => {
      const r = Engine.bca(value, design, s, opts({ providerCost: c }));
      return { x: c, y: Math.min(r.bcr, 20), lo: Math.min(r.ci.bcr[0], 20), hi: Math.min(r.ci.bcr[1], 20) };
    });
    const ymax = Math.min(20, Math.ceil(Math.max(...pts.map((p) => p.hi)) + 0.5));
    lineChart(document.getElementById('cost-chart'), {
      title: 'Benefit-cost ratio by running cost', series: [{ name: 'Benefit-cost ratio', color: '#2a6bc4', band: true, points: pts }],
      x: [20, 200], y: [0, ymax], xTicks: [20, 50, 75, 100, 150, 200], xFormat: (v) => `$${v}`, yFormat: (v) => v.toFixed(1),
      xLabel: 'Provider cost per participant per session (A$)', yLabel: 'Benefit-cost ratio', marker: state.cost, refY: 1, refLabel: 'Break-even',
    });
    const firmUpTo = pts.filter((p) => p.lo >= 1).map((p) => p.x);
    const failFrom = pts.find((p) => p.hi < 1);
    document.getElementById('cost-text').replaceChildren(el('div', { class: 'meaning' }, el('h3', {}, 'What this means'),
      el('p', {}, `The ratio falls as the running cost rises and reaches 1 at about ${money(now.breakEven)} per participant per session (95% interval ${money(now.ci.breakEven[0])} to ${money(now.ci.breakEven[1])}).`),
      el('p', {}, `${firmUpTo.length ? `Up to about ${money(Math.max(...firmUpTo))}, benefits clearly exceed costs (green). ` : 'At none of the running costs shown do benefits clearly exceed costs. '}${failFrom ? `From about ${money(failFrom.x)}, costs clearly exceed benefits (red).` : 'Within the range shown, costs never clearly exceed benefits.'} In between, the result is uncertain (amber).`)));

    const fees = Array.from({ length: 26 }, (_, i) => 2 * i);
    const fc = document.getElementById('fee-chart');
    const ft = document.getElementById('fee-text');
    if (state.cost == null) {
      fc.replaceChildren(el('p', { class: 'note' }, 'Enter a running cost to see how net benefit changes with the fee.'));
      ft.replaceChildren();
      return;
    }
    const curve = engine.valueCurve('mxlr', design, fees, 120);
    const fp = fees.map((f, i) => {
      const r = Engine.bca(curve[i], { ...design, price: f }, s, opts());
      return { x: f, y: r.net, lo: r.ci.net[0], hi: r.ci.net[1] };
    });
    const lo = Math.min(...fp.map((p) => p.lo)), hi = Math.max(...fp.map((p) => p.hi));
    const pad = (hi - lo) * 0.08 || 1;
    lineChart(fc, {
      title: 'Net benefit per year by fee', series: [{ name: 'Net benefit per year', color: '#18a078', band: true, points: fp }],
      x: [0, 50], y: [lo - pad, hi + pad], xTicks: [0, 5, 10, 20, 30, 40, 50], xFormat: (v) => (v === 0 ? 'Free' : `$${v}`),
      yFormat: (v) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}m` : Math.abs(v) >= 1e3 ? `$${(v / 1e3).toFixed(0)}k` : `$${v.toFixed(0)}`),
      xLabel: 'Fee per session (A$)', yLabel: 'Net benefit per year', marker: design.price, refY: 0, refLabel: 'Zero',
    });
    const best = fp.reduce((a, b) => (b.y > a.y ? b : a));
    const free = fp[0], at50 = fp[fp.length - 1];
    ft.replaceChildren(el('div', { class: 'meaning' }, el('h3', {}, 'What this means'), el('p', {}, best.x === 0
      ? `Net benefit is highest when the programme is free (${money(free.y)} per year), because a fee reduces the number of people who benefit while only moving money between participants and the provider. At A$50 per session it would be ${money(at50.y)}.`
      : lightOf(now) !== 'green'
        ? `Net benefit rises with the fee here only because each participant costs more to serve than the value they place on the programme, so fewer participants means a smaller loss. That points to a running cost that is too high for this design, not to a reason to charge more. Net benefit is ${money(free.y)} per year when free and ${money(at50.y)} at A$50.`
        : `Net benefit is highest at a fee of about ${money(best.x)} per session (${money(best.y)} per year).`)));
  }

  // ------------------------------------------------------------ comparison
  function renderCompare() {
    const box = document.getElementById('compare-result');
    const t = templates.find((x) => x.id === alt.value);
    const a = analyse(design), b = analyse(t.design);
    const n = Math.min(a.bca.draws.length, b.bca.draws.length);
    const diff = (k) => interval(Array.from({ length: n }, (_, i) => b.bca.draws[i][k] - a.bca.draws[i][k]));
    const extra = b.bca.participants - a.bca.participants;
    const rows = [
      ['Programme', describe(engine, design), describe(engine, t.design)],
      ['Take-up', `${per100(a.value.point.P)} in 100`, `${per100(b.value.point.P)} in 100`],
      ['Participants', whole(a.bca.participants), whole(b.bca.participants)],
      ['Value to participants per year', money(a.bca.benefit), money(b.bca.benefit)],
      ['Break-even running cost', money(a.bca.breakEven), money(b.bca.breakEven)],
    ];
    if (state.cost != null) {
      rows.push(['Running cost per year', money(a.bca.cost), money(b.bca.cost)],
        ['Net benefit per year', money(a.bca.net), money(b.bca.net)],
        ['Benefit-cost ratio', a.bca.bcr.toFixed(2), b.bca.bcr.toFixed(2)],
        ['Verdict', el('span', { class: `light light-${lightOf(a.bca)}` }, LIGHT_WORD[lightOf(a.bca)]), el('span', { class: `light light-${lightOf(b.bca)}` }, LIGHT_WORD[lightOf(b.bca)])]);
    }
    const parts = [el('div', { class: 'table-scroll' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, ''), el('th', { scope: 'col' }, 'Your programme'), el('th', { scope: 'col' }, `Alternative: ${t.name}`))),
      el('tbody', {}, ...rows.map((r) => el('tr', {}, el('th', { scope: 'row' }, r[0]), el('td', {}, r[1]), el('td', {}, r[2]))))))];
    let result;
    if (state.cost == null) {
      result = { level: extra > 0 ? 'green' : 'amber', text: `The alternative would reach about ${whole(Math.abs(extra))} ${extra >= 0 ? 'more' : 'fewer'} people. Enter a running cost to compare net benefits.` };
    } else {
      const dNet = b.bca.net - a.bca.net;
      const ci = diff('net');
      const level = ci[0] > 0 ? 'green' : ci[1] < 0 ? 'red' : 'amber';
      const perExtra = extra > 0.5 ? (b.bca.cost - a.bca.cost) / extra : null;
      result = { level, text: `Switching to the ${t.name.toLowerCase()} would change participants by ${extra >= 0 ? '+' : ''}${whole(extra)} and net benefit by ${dNet >= 0 ? '+' : ''}${money(dNet)} per year (95% interval ${money(ci[0])} to ${money(ci[1])}).${perExtra != null ? ` Each extra participant would cost ${money(perExtra)} more per year to serve.` : ''}${level === 'amber' ? ' The interval includes zero, so neither is clearly better.' : ''}` };
    }
    parts.push(el('div', { class: `meaning meaning-${result.level}` }, el('h3', {}, 'What this means'),
      el('p', {}, el('span', { class: `light light-${result.level}` }, result.level === 'green' ? 'Alternative is better' : result.level === 'red' ? 'Your programme is better' : 'No clear difference')),
      el('p', {}, result.text)));
    box.replaceChildren(...parts);
    return result;
  }

  // ------------------------------------------------------------ messages
  function tellChange(before, now, title) {
    if (!before) return;
    if (now.bca.bcr != null && before.bca.bcr != null) {
      const d = now.bca.net - before.bca.net;
      const level = Math.abs(d) < 1 ? 'amber' : d > 0 ? 'green' : 'red';
      toast({ level, title, message: `Net benefit ${d >= 0 ? 'rose' : 'fell'} by ${money(Math.abs(d))} per year. The benefit-cost ratio is now ${now.bca.bcr.toFixed(2)} (${LIGHT_WORD[lightOf(now.bca)].toLowerCase()}).` });
    } else {
      const d = now.bca.breakEven - before.bca.breakEven;
      const level = Math.abs(d) < 0.5 ? 'amber' : d > 0 ? 'green' : 'red';
      toast({ level, title, message: `The break-even running cost ${Math.abs(d) < 0.5 ? 'stays at' : d > 0 ? 'rose to' : 'fell to'} ${money(now.bca.breakEven)} per participant per session. Take-up is ${per100(now.P)} in 100.`,
        action: state.cost == null ? { label: 'Next: enter a running cost', onClick: () => { goTo('#cost-field'); cost.focus({ preventScroll: true }); } } : null });
    }
  }
  function tellVerdict(now, title, extra) {
    const light = lightOf(now.bca);
    if (!light) return;
    const next = light === 'green' ? { label: 'Next: test a lower value', onClick: () => goTo('#share-field') }
      : { label: 'Next: see the break-even chart', onClick: () => goTo('#sensitivity') };
    toast({ level: light, title, message: `${LIGHT_WORD[light]}: benefit-cost ratio ${now.bca.bcr.toFixed(2)} (95% interval ${now.bca.ci.bcr[0].toFixed(2)} to ${now.bca.ci.bcr[1].toFixed(2)}).${extra ? ' ' + extra : ''}`, action: next });
  }
  function tellCompare(r) {
    toast({ level: r.level, title: `Compared with the ${alt.options[alt.selectedIndex].text.toLowerCase()}`, message: r.text });
  }

  update();
  if (fromUrl) toast({ level: 'info', title: 'Programme loaded from your link', message: state.cost == null ? 'Enter a running cost to see whether it passes a benefit-cost test.' : 'The verdict uses the running cost from your link.' });
});
