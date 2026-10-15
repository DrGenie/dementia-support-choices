import { boot, el, iconArray, per100, pct, money, describe, fillSelect, feasibleTemplates, debounce, priceLabel,
  toast, changeLevel, signed, progress, designFromQuery, designQuery, writeQuery, copyLink,
  stat, meaning, setContext, refreshInfo, goTo, infoBtn } from './common.js';
import { Engine } from './engine.js';

const DEFAULT = { type: 'peer', carer: 'yes', mode: 'hybrid', frequency: 'weekly', duration: '2h', distance: 'local', price: 5 };
const MAX_COMPARE = 3;
const RATING_TEXT = {
  green: 'Top third of designs in the study',
  amber: 'Middle third of designs in the study',
  red: 'Bottom third of designs in the study',
};
// Traffic light for the gain available from changing one feature
const gainLight = (it) => {
  if (it.best === it.current) return { level: 'green', word: 'Best option' };
  if (it.gain < 0.01) return { level: 'green', word: 'Close to best' };
  if (it.gain < 0.05) return { level: 'amber', word: 'Could improve' };
  return { level: 'red', word: 'Holding it back' };
};

const KEYS = ['type', 'carer', 'mode', 'frequency', 'duration', 'distance', 'price'];
const same = (a, b) => KEYS.every((k) => a[k] === b[k]);

boot((engine) => {
  const fromUrl = designFromQuery(engine, DEFAULT);
  let design = fromUrl || { ...DEFAULT };
  let current = null;
  const compare = [];
  const fields = document.getElementById('feature-fields');
  const selects = {};

  const steps = progress(document.getElementById('progress'), [
    { id: 'choose', label: 'Choose the features', href: '#builder' },
    { id: 'improve', label: 'Act on a suggested improvement', href: '#improve' },
    { id: 'compare', label: 'Compare programmes', href: '#compare-fold' },
    { id: 'value', label: 'Check benefits and costs', href: 'value.html' },
  ]);
  if (fromUrl) steps.mark('choose');

  // ------------------------------------------------------------ controls
  const templates = feasibleTemplates(engine);
  const tsel = document.getElementById('template');
  tsel.append(el('option', { value: '' }, 'Choose an example'));
  for (const s of templates) tsel.append(el('option', { value: s.id }, s.name));
  tsel.addEventListener('change', () => {
    const s = templates.find((t) => t.id === tsel.value);
    if (s) apply({ ...s.design }, `Example applied: ${s.name}`, 'choose', true);
  });

  for (const a of engine.attributes) {
    const id = `f-${a.key}`;
    const s = el('select', { id });
    fields.append(el('div', { class: 'field' }, el('label', { for: id }, a.label), s));
    selects[a.key] = s;
    s.addEventListener('change', () => apply({ ...design, [a.key]: s.value }, `${a.label}: ${engine.label(a.key, s.value).toLowerCase()}`, 'choose'));
  }
  const price = document.getElementById('price');
  const priceOut = document.getElementById('price-out');
  const slowUpdate = debounce(() => update(), 150);
  price.addEventListener('input', () => { design.price = +price.value; priceOut.textContent = priceLabel(design.price); tsel.value = ''; slowUpdate(); });
  price.addEventListener('change', () => {
    const before = current;
    design.price = +price.value; update(); steps.mark('choose');
    tell(before, `Fee set to ${design.price === 0 ? 'free' : money(design.price) + ' per session'}`);
  });

  // Apply a new design, update everything and report the change
  function apply(d, title, step, keepTemplate) {
    const before = current;
    design = { ...d };
    if (!keepTemplate) tsel.value = '';
    sync(); update();
    if (step) steps.mark(step);
    tell(before, title);
  }

  function nextAction() {
    const n = steps.nextLabel();
    if (!n) return null;
    return n.href.startsWith('#') ? { label: `Next: ${n.label.toLowerCase()}`, onClick: () => goTo(n.href) }
      : { label: `Next: ${n.label.toLowerCase()}`, href: `value.html${designQuery(design)}` };
  }

  function tell(before, title) {
    if (!before) return;
    const delta = current.mx - before.mx;
    const msg = Math.abs(delta) < 0.005
      ? `Take-up stays at about ${per100(current.mx)} in 100.`
      : `Take-up ${delta > 0 ? 'rises' : 'falls'} from ${per100(before.mx)} to ${per100(current.mx)} in 100 (${signed(100 * delta, 1)}). Value to families is now ${money(current.cs)} per person offered per session.`;
    toast({ level: changeLevel(delta), title, message: msg, action: nextAction() });
  }

  function sync() {
    for (const a of engine.attributes) fillSelect(selects[a.key], engine, design, a.key);
    price.value = design.price;
    priceOut.textContent = priceLabel(design.price);
  }

  // Best design at the current fee: every combination the study allows, ranked by take-up
  function bestAtFee() {
    let best = null, bu = -1;
    for (const d of engine.allFeasibleDesigns(design.price)) {
      const u = engine.uptakeMxl(d, 0).point;
      if (u > bu) { bu = u; best = d; }
    }
    return { design: { ...best, price: design.price }, uptake: bu };
  }

  // ------------------------------------------------------------ results
  function update() {
    const mx = engine.uptakeMxl(design, 400);
    const val = engine.valueDraws('mxlr', design, 120);
    const bca = Engine.bca(val, design, engine.sessionsPerYear(design), { offered: 1, providerCost: null });
    const el1 = engine.elasticityMxl(design, 120);
    const never = engine.reach({ ...design, price: 0 }).neverShare;
    const r = engine.rating(design);
    const items = engine.improvements(design);
    const k = per100(mx.point);

    document.getElementById('uptake-number').textContent = `${k} in 100`;
    document.getElementById('uptake-label').textContent = 'people offered this programme would be expected to choose it rather than no programme.';
    document.getElementById('uptake-range').textContent = `95% interval: ${per100(mx.ci[0])} to ${per100(mx.ci[1])} in 100.`;
    iconArray(document.getElementById('uptake-array'), mx.point, `${k} of 100 people would take up this programme`);
    document.getElementById('print-design').textContent = `Programme: ${describe(engine, design)}.`;
    document.getElementById('rating').replaceChildren(el('span', { class: `light light-${r.level}` }, RATING_TEXT[r.level]));

    // What this means
    const featureItems = items.filter((it) => it.key !== 'price').sort((a, b) => b.gain - a.gain);
    const top = featureItems[0];
    const priceItem = items.find((it) => it.key === 'price');
    meaning(document.getElementById('meaning'), r.level, [
      `Of every 100 people offered this programme, about ${k} would choose it over having no programme. Allowing for uncertainty, the figure could be between ${per100(mx.ci[0])} and ${per100(mx.ci[1])}. That is higher than ${pct(r.percentile)} of the 1,536 designs and fees the study allowed.`,
      top && top.gain >= 0.01
        ? `The feature holding it back most is ${top.label.toLowerCase()}: changing "${top.current}" to "${top.best}" would add about ${(100 * top.gain).toFixed(1)} in 100.${design.price > 0 ? ` Making it free would add ${(100 * priceItem.gain).toFixed(1)} in 100.` : ''}`
        : `No single change to the features would add 1 in 100 or more, so the design is close to the best the study allows${design.price > 0 ? ` at this fee. Making it free would add ${(100 * priceItem.gain).toFixed(1)} in 100` : ''}.`,
      `About ${per100(never)} in 100 people would not use it even if it were free. Reaching them depends more on referral and information than on the design.`,
      `Each person offered the programme gains about ${money(val.point.CS)} per session in value, after the fee. It passes a benefit-cost test if it costs less than ${money(bca.breakEven)} per participant per session to run.`,
    ]);

    // Key figures
    document.getElementById('stats').replaceChildren(
      stat('Value to families', money(val.point.CS), `per person offered per session (${money(bca.ci.surplusPerOfferedSession[0])} to ${money(bca.ci.surplusPerOfferedSession[1])})`, 'value'),
      stat('Break-even running cost', money(bca.breakEven), 'per participant per session', 'break-even'),
      stat('Price sensitivity', design.price === 0 ? 'None at a zero fee' : el1.point.toFixed(2), design.price === 0 ? 'set a fee to see it' : `a 10% fee rise lowers take-up by ${Math.abs(10 * el1.point).toFixed(1)}%`, 'elasticity'),
      stat('Would not take it even if free', `${per100(never)} in 100`, 'whatever the fee', 'never-free'),
    );
    setContext('take-up', () => `${k} in 100 people would choose this programme over no programme.`);
    setContext('interval', () => `take-up is between ${per100(mx.ci[0])} and ${per100(mx.ci[1])} in 100, a ${mx.ci[1] - mx.ci[0] < 0.1 ? 'fairly narrow' : 'wide'} range.`);
    setContext('rating', () => `higher take-up than ${pct(r.percentile)} of designs; the best design in the study reaches ${per100(r.best)} in 100 and the median ${per100(r.median)} in 100.`);
    setContext('value', () => `each person offered it is better off by about ${money(val.point.CS)} per session after paying ${design.price === 0 ? 'nothing' : money(design.price)}.`);
    setContext('break-even', () => `if one participant-session costs less than ${money(bca.breakEven)} to deliver, the programme returns more value than it costs.`);
    setContext('elasticity', () => (design.price === 0 ? 'the programme is free, so there is no fee to respond to.' : `${el1.point.toFixed(2)}: raising the fee from ${money(design.price)} to ${money(design.price * 1.1, 2)} would lower take-up by about ${Math.abs(10 * el1.point).toFixed(1)}%, a small response.`));
    setContext('never-free', () => `${per100(never)} in 100 people would still prefer no programme if this one were free.`);
    setContext('improve', () => (top && top.gain >= 0.01 ? `the largest gain comes from ${top.label.toLowerCase()} (+${(100 * top.gain).toFixed(1)} in 100).` : 'no feature change would add 1 in 100 or more.'));

    // Where it could improve
    document.getElementById('improve-list').replaceChildren(...items.map((it) => {
      const g = gainLight(it);
      const same = it.best === it.current;
      const isPrice = it.key === 'price';
      return el('li', {},
        el('span', { class: `light light-${g.level}` }, g.word),
        el('span', { class: 'text' }, el('span', { class: 'what' }, it.label),
          el('span', { class: 'now' }, same ? `"${it.current}" is the best option allowed${isPrice ? '' : ' with the other features'}.`
            : el('span', {}, 'Now ', el('b', {}, it.current), ', best ', el('b', {}, it.best), isPrice ? ' (a funding decision)' : ''))),
        el('span', { class: 'gain' }, same ? '' : `+${(100 * it.gain).toFixed(1)} in 100`),
        same ? el('span', { class: 'placeholder' }, 'No change')
          : el('button', { type: 'button', class: 'btn secondary', 'aria-label': `Apply: ${it.label} to ${it.best}`,
            onclick: () => apply(it.design, `${it.label}: ${it.best.toLowerCase()}`, 'improve') }, 'Apply'));
    }));

    // Who it reaches
    const sp = engine.spread(design);
    const seg = (cls, share, label) => el('span', { class: cls, style: `width:${(100 * share).toFixed(1)}%`, title: `${label}: ${per100(share)} in 100` }, share >= 0.08 ? String(per100(share)) : '');
    document.getElementById('reach').replaceChildren(
      el('p', { class: 'prose' }, `Out of 100 people offered this programme, the model expects ${per100(sp.likely)} to be likely users, ${per100(sp.unsure)} to be undecided and ${per100(sp.unlikely)} to be unlikely users. `, infoBtn('likely', 'likely, undecided and unlikely')),
      el('div', { class: 'spread', role: 'img', 'aria-label': `${per100(sp.likely)} likely, ${per100(sp.unsure)} undecided, ${per100(sp.unlikely)} unlikely, out of 100` },
        seg('s-likely', sp.likely, 'Likely'), seg('s-unsure', sp.unsure, 'Undecided'), seg('s-unlikely', sp.unlikely, 'Unlikely')),
      el('ul', { class: 'spread-key' },
        el('li', {}, el('i', { style: 'background:#1f5da8' }), 'Likely: 80% chance or more'),
        el('li', {}, el('i', { style: 'background:#8fb0d9' }), 'Undecided'),
        el('li', {}, el('i', { style: 'background:repeating-linear-gradient(45deg,#f4f2f7 0 3px,#d9d5e0 3px 4px)' }), 'Unlikely: under 20% chance')),
      el('p', { class: 'prose' }, sp.unsure >= 0.35
        ? `A large undecided group means design, fees and how the programme is promoted can still move take-up a good deal.`
        : `The undecided group is fairly small, so further design changes will move take-up only a little.`),
      el('p', { class: 'prose' }, `Most of the differences between people in the study were about whether to use any programme at all, rather than which features they wanted. About ${per100(never)} in 100 would not use this programme even if it were free. A trusted referral, clear information and a trial session are more likely to reach them than changes to the programme. Differences by lived experience of dementia are described on `, el('a', { href: 'research.html#methods' }, 'the research page'), '.'),
    );
    setContext('likely', () => `${per100(sp.likely)} likely, ${per100(sp.unsure)} undecided and ${per100(sp.unlikely)} unlikely, out of 100.`);

    // What it asks of a participant
    const sessions = engine.sessionsPerYear(design);
    document.getElementById('participant-stats').replaceChildren(
      stat('Sessions over a year', String(sessions), engine.label('frequency', design.frequency).toLowerCase()),
      stat('Cost to the participant over a year', money(engine.annualCost(design)), design.price === 0 ? 'free' : `${money(design.price)} per session`),
      stat('Time over a year', `${Math.round(engine.annualHours(design)).toLocaleString('en-AU')} hours`, `${engine.label('duration', design.duration).toLowerCase()} each session`),
    );

    document.getElementById('to-value').href = `value.html${designQuery(design)}`;
    writeQuery(design);
    current = { mx: mx.point, cs: val.point.CS, be: bca.breakEven };
    refreshInfo();
  }

  // ------------------------------------------------------------ comparison
  function renderCompare() {
    const box = document.getElementById('compare');
    if (!compare.length) {
      box.replaceChildren(el('p', { class: 'muted' }, 'Use "Add to comparison" to compare up to three programmes side by side.'));
      return;
    }
    const ups = compare.map((d) => engine.uptakeMxl(d, 300));
    const best = Math.max(...ups.map((u) => u.point));
    const vals = compare.map((d) => engine.valueDraws('mxlr', d, 1).point);
    const rows = [
      ['Programme', (d) => describe(engine, d)],
      ['Take-up (95% interval)', (d, i) => `${per100(ups[i].point)} in 100 (${per100(ups[i].ci[0])} to ${per100(ups[i].ci[1])})`],
      ['Rating', (d) => { const r = engine.rating(d); return el('span', { class: `light light-${r.level}` }, { green: 'Top third', amber: 'Middle third', red: 'Bottom third' }[r.level]); }],
      ['Value to families per person offered per session', (d, i) => money(vals[i].CS)],
      ['Break-even running cost', (d, i) => money(vals[i].CS / vals[i].P + d.price)],
      ['Cost to participant per year', (d) => money(engine.annualCost(d))],
      ['Hours per year', (d) => Math.round(engine.annualHours(d)).toLocaleString('en-AU')],
    ];
    const head = el('tr', {}, el('th', { scope: 'col' }, ''), ...compare.map((d, i) => el('th', { scope: 'col' },
      `Programme ${i + 1}`, ups[i].point === best && compare.length > 1 ? el('span', { class: 'small muted' }, ' (highest take-up)') : null)));
    const body = rows.map(([lab, f]) => el('tr', {}, el('th', { scope: 'row' }, lab), ...compare.map((d, i) => el('td', {}, f(d, i)))));
    const actions = el('tr', { class: 'no-print' }, el('td', {}), ...compare.map((d, i) => el('td', {},
      el('div', { class: 'btnrow', style: 'margin:0' },
        el('button', { type: 'button', class: 'btn secondary', onclick: () => { apply(d, `Programme ${i + 1} loaded`); goTo('#results'); } }, 'Load'),
        el('button', { type: 'button', class: 'btn secondary', onclick: () => {
          compare.splice(i, 1); renderCompare();
          toast({ level: 'info', title: `Programme ${i + 1} removed from the comparison`, message: compare.length ? `${compare.length} programme${compare.length > 1 ? 's' : ''} left to compare.` : 'The comparison is now empty.' });
        } }, 'Remove')))));
    const parts = [el('div', { class: 'table-scroll' }, el('table', {}, el('thead', {}, head), el('tbody', {}, ...body, actions)))];
    if (compare.length > 1) {
      const order = ups.map((u, i) => ({ u: u.point, i })).sort((a, b) => b.u - a.u);
      const gap = order[0].u - order[order.length - 1].u;
      const overlap = ups[order[0].i].ci[0] <= ups[order[order.length - 1].i].ci[1];
      parts.push(el('div', { class: `meaning meaning-${gap < 0.01 ? 'amber' : 'green'}` }, el('h3', {}, 'What this means'),
        el('p', {}, gap < 0.01 ? 'These programmes would attract about the same number of people, so other factors such as running cost and local need should decide.'
          : `Programme ${order[0].i + 1} would attract about ${(100 * gap).toFixed(1)} more people in 100 than programme ${order[order.length - 1].i + 1}.${overlap ? ' Their 95% intervals overlap, so treat the difference with some caution.' : ''}`)));
    }
    box.replaceChildren(...parts);
  }

  document.getElementById('add-compare').addEventListener('click', () => {
    if (compare.some((d) => same(d, design))) {
      toast({ level: 'amber', title: 'This programme is already in the comparison', message: 'Change a feature first, then add it again.' });
      return;
    }
    let dropped = false;
    if (compare.length >= MAX_COMPARE) { compare.shift(); dropped = true; }
    compare.push({ ...design });
    renderCompare();
    steps.mark('compare');
    document.getElementById('compare-fold').open = true;
    toast({ level: 'green', title: `Added to the comparison (${compare.length} of ${MAX_COMPARE})`,
      message: dropped ? 'The oldest programme was removed to make room.' : compare.length < 2 ? 'Change some features and add another programme to compare them.' : 'The table is under "Compare programmes".',
      action: { label: 'Show the comparison', onClick: () => goTo('#compare-fold') } });
  });
  document.getElementById('apply-all').addEventListener('click', () => {
    const b = bestAtFee();
    if (same(b.design, design)) {
      toast({ level: 'green', title: 'This is already the best design at this fee', message: 'Only a lower fee would raise take-up further.' });
      return;
    }
    apply(b.design, 'Best design at this fee applied', 'improve');
  });
  document.getElementById('copy').addEventListener('click', copyLink);
  document.getElementById('print').addEventListener('click', () => {
    toast({ level: 'info', title: 'Opening the print window', message: 'Choose "Save as PDF" as the printer to keep a copy.' });
    setTimeout(() => window.print(), 300);
  });
  document.getElementById('reset').addEventListener('click', () => apply({ ...DEFAULT }, 'Started again with the default programme'));
  document.getElementById('to-value').addEventListener('click', () => steps.mark('value'));

  sync();
  update();
  renderCompare();
  if (fromUrl) toast({ level: 'info', title: 'Programme loaded from your link', message: describe(engine, design) });
});
