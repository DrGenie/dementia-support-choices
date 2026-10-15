import { boot, el, iconArray, per100, pct, money, describe, fillSelect, feasibleTemplates, debounce, priceLabel,
  toast, changeLevel, signed, progress, designFromQuery, designQuery, writeQuery, copyLink } from './common.js';
import { Engine } from './engine.js';

const DEFAULT = { type: 'peer', carer: 'yes', mode: 'hybrid', frequency: 'weekly', duration: '2h', distance: 'local', price: 5 };
const MAX_COMPARE = 3;
const RATING_TEXT = {
  green: 'Among the most attractive third of designs in the study',
  amber: 'In the middle third of designs in the study',
  red: 'Among the least attractive third of designs in the study',
};

boot((engine) => {
  const fromUrl = designFromQuery(engine, DEFAULT);
  let design = fromUrl || { ...DEFAULT };
  let current = null;
  const compare = [];
  const fields = document.getElementById('feature-fields');
  const selects = {};

  const steps = progress(document.getElementById('progress'), [
    { id: 'choose', label: 'Choose the features', href: '#builder' },
    { id: 'improve', label: 'Try a quick change', href: '#quick' },
    { id: 'compare', label: 'Compare programmes', href: '#compare-title' },
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
    if (s) apply({ ...s.design }, `Example applied: ${s.name}`, 'choose');
  });

  for (const a of engine.attributes) {
    const id = `f-${a.key}`;
    const s = el('select', { id });
    fields.append(el('div', { class: 'field' }, el('label', { for: id }, a.label), s));
    selects[a.key] = s;
    s.addEventListener('change', () => apply({ ...design, [a.key]: s.value }, `${a.label} changed to ${engine.label(a.key, s.value).toLowerCase()}`, 'choose'));
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
  function apply(d, title, step) {
    const before = current;
    design = { ...d };
    if (!title.startsWith('Example')) tsel.value = '';
    sync(); update();
    if (step) steps.mark(step);
    tell(before, title);
  }

  function tell(before, title) {
    if (!before) return;
    const delta = current.mx - before.mx;
    const level = changeLevel(delta);
    const msg = Math.abs(delta) < 0.005
      ? `Take-up stays at about ${per100(current.mx)} in 100.`
      : `Take-up ${delta > 0 ? 'rises' : 'falls'} from ${per100(before.mx)} to ${per100(current.mx)} in 100 (${signed(100 * delta, 1)}). Value to families: ${money(current.cs)} per person offered per session.`;
    const nextStep = steps.nextLabel();
    toast({ level, title, message: msg,
      action: nextStep ? (nextStep.href.startsWith('#') ? { label: `Next: ${nextStep.label.toLowerCase()}`, onClick: () => document.querySelector(nextStep.href).scrollIntoView({ behavior: 'smooth', block: 'start' }) }
        : { label: `Next: ${nextStep.label.toLowerCase()}`, href: `value.html${designQuery(design)}` }) : null });
  }

  function sync() {
    for (const a of engine.attributes) fillSelect(selects[a.key], engine, design, a.key);
    price.value = design.price;
    priceOut.textContent = priceLabel(design.price);
  }

  const stat = (label, value, note) => el('div', { class: 'stat' }, el('dt', {}, label), el('dd', {}, value, note ? el('small', {}, note) : null));

  // ------------------------------------------------------------ quick changes
  const QUICK = [
    { label: 'Include the carer', make: (d) => ({ ...d, carer: 'yes' }), on: (d) => d.carer === 'yes' },
    { label: 'Make it free', make: (d) => ({ ...d, price: 0 }), on: (d) => d.price === 0 },
    { label: 'Hold it locally', make: (d) => ({ ...d, distance: 'local' }), on: (d) => d.distance === 'local' },
    { label: 'Meet weekly', make: (d) => ({ ...d, frequency: 'weekly' }), on: (d) => d.frequency === 'weekly' },
    { label: 'Offer counselling', make: (d) => ({ ...d, type: 'counselling' }), on: (d) => d.type === 'counselling' },
    { label: 'Offer a hybrid option', make: (d) => ({ ...d, mode: 'hybrid' }), on: (d) => d.mode === 'hybrid' },
  ];
  function renderQuick() {
    const box = document.getElementById('quick');
    const buttons = QUICK.map((q) => {
      const d = q.make(design);
      const already = q.on(design);
      const ok = engine.isFeasible(d);
      const b = el('button', { type: 'button', disabled: already || !ok,
        title: already ? 'Already part of this programme' : ok ? '' : 'Not possible with the other features chosen' }, q.label);
      b.addEventListener('click', () => apply(d, `${q.label}: applied`, 'improve'));
      return b;
    });
    const best = engine.bestChanges(design).find((c) => c.change > 0.0005);
    const bb = el('button', { type: 'button', disabled: !best }, best ? `Apply the best change (${best.to.toLowerCase()})` : 'Already the best design');
    if (best) bb.addEventListener('click', () => apply(best.design, `Best change applied: ${best.attribute.toLowerCase()} to ${best.to.toLowerCase()}`, 'improve'));
    box.replaceChildren(...buttons, bb);
  }

  // ------------------------------------------------------------ results
  function update() {
    const mx = engine.uptakeMxl(design, 400);
    const mnl = engine.uptakeFixed('mnl', design);
    const keep = engine.retention(design);
    const val = engine.valueDraws('mxlr', design, 120);
    const bca = Engine.bca(val, design, engine.sessionsPerYear(design), { offered: 1, providerCost: null });
    const k = per100(mx.point);
    document.getElementById('uptake-number').textContent = `${k} in 100`;
    document.getElementById('uptake-label').textContent = 'people would be expected to choose this programme rather than no programme.';
    document.getElementById('uptake-range').textContent = `95% interval: ${per100(mx.ci[0])} to ${per100(mx.ci[1])} in 100.`;
    iconArray(document.getElementById('uptake-array'), mx.point, `${k} of 100 people would take up this programme`);
    document.getElementById('print-design').textContent = `Programme: ${describe(engine, design)}.`;
    const r = engine.rating(design);
    document.getElementById('rating').replaceChildren(el('span', { class: `light light-${r.level}` }, RATING_TEXT[r.level]),
      el('span', { class: 'small muted' }, ` Better than ${pct(r.percentile)} of the ${'1,536'} designs allowed by the study.`));

    const sessions = engine.sessionsPerYear(design);
    document.getElementById('stats').replaceChildren(
      stat('Keep it once chosen', `${per100(keep.point)} in 100`, `95% interval ${per100(keep.ci[0])} to ${per100(keep.ci[1])}`),
      stat('Simpler model (same preferences for all)', `${per100(mnl.point)} in 100`, `95% interval ${per100(mnl.ci[0])} to ${per100(mnl.ci[1])}`),
      stat('Value to families', money(val.point.CS), 'per person offered per session, net of the fee'),
      stat('Break-even running cost', money(bca.breakEven), 'per participant per session'),
      stat('Cost to the participant over a year', money(engine.annualCost(design)), `${sessions} sessions`),
      stat('Time over a year', `${Math.round(engine.annualHours(design)).toLocaleString('en-AU')} hours`, `${sessions} sessions`),
      stat('Price elasticity at this fee', design.price === 0 ? '0' : engine.elasticityFixed('mnl', design).point.toFixed(2), '% change in take-up for a 1% fee rise'),
      stat('Would not take it even if free', pct(engine.reach({ ...design, price: 0 }).neverShare), 'mixed logit'),
    );
    document.getElementById('to-value').href = `value.html${designQuery(design)}`;
    writeQuery(design);

    // Reach
    const none = engine.uptakeFixed('h1', design, { profile: {} });
    const freq = engine.uptakeFixed('h1', design, { profile: { frequentContact: true } });
    const classes = engine.latentClasses(design);
    const parts = [];
    if (design.carer === 'yes') {
      parts.push(el('p', {}, `Because this programme includes the carer, it appeals more to people in daily or weekly contact with someone living with dementia: ${per100(freq.point)} in 100 of them would take it up (95% interval ${per100(freq.ci[0])} to ${per100(freq.ci[1])}), compared with ${per100(none.point)} in 100 people without lived experience.`));
    } else {
      parts.push(el('p', {}, `This programme does not include the carer. People in daily or weekly contact with someone living with dementia valued carer inclusion most, so adding it would raise their take-up from ${per100(freq.point)} to ${per100(engine.uptakeFixed('h1', { ...design, carer: 'yes' }, { point: true, profile: { frequentContact: true } }).point)} in 100.`));
    }
    parts.push(el('p', {}, `The study population falls into two broad groups. The larger group (${pct(classes[0].share)} of people) rarely chose no programme; ${per100(classes[0].uptake)} in 100 of them would take this one up. The smaller group (${pct(classes[1].share)}) often chose no programme and was more sensitive to price; ${per100(classes[1].uptake)} in 100 of them would take it up.`));
    document.getElementById('reach').replaceChildren(...parts);

    // Best single changes
    const list = document.getElementById('changes');
    const changes = engine.bestChanges(design).filter((c) => c.change > 0.0005).slice(0, 6);
    list.replaceChildren(...(changes.length ? changes.map((c) => el('li', {},
      el('span', {}, el('strong', {}, c.attribute), `: ${c.from} to ${c.to}`),
      el('span', { class: 'gain' }, `+${(100 * c.change).toFixed(1)} in 100`),
      el('button', { type: 'button', class: 'btn secondary', onclick: () => apply(c.design, `${c.attribute} changed to ${c.to.toLowerCase()}`, 'improve') }, 'Apply'),
    )) : [el('li', {}, 'No single change allowed by the study design would raise take-up further.')]));

    renderQuick();
    current = { mx: mx.point, cs: val.point.CS, be: bca.breakEven };
  }

  function renderCompare() {
    const box = document.getElementById('compare');
    if (!compare.length) {
      box.replaceChildren(el('p', { class: 'muted' }, 'Use "Add to comparison" to compare up to three programmes side by side.'));
      return;
    }
    const best = Math.max(...compare.map((d) => engine.uptakeMxl(d, 0).point));
    const rows = [
      ['Programme', (d) => describe(engine, d)],
      ['Take-up (mixed logit)', (d) => { const u = engine.uptakeMxl(d, 300); return `${per100(u.point)} in 100 (${per100(u.ci[0])} to ${per100(u.ci[1])})`; }],
      ['Rating', (d) => { const r = engine.rating(d); return el('span', { class: `light light-${r.level}` }, { green: 'Top third', amber: 'Middle third', red: 'Bottom third' }[r.level]); }],
      ['Keep it once chosen', (d) => `${per100(engine.retention(d).point)} in 100`],
      ['Value to families per person offered per session', (d) => money(engine.valueDraws('mxlr', d, 1).point.CS)],
      ['Break-even running cost', (d) => { const v = engine.valueDraws('mxlr', d, 1); return money(v.point.CS / v.point.P + d.price); }],
      ['Cost to participant per year', (d) => money(engine.annualCost(d))],
      ['Hours per year', (d) => Math.round(engine.annualHours(d)).toLocaleString('en-AU')],
    ];
    const head = el('tr', {}, el('th', { scope: 'col' }, ''), ...compare.map((d, i) => el('th', { scope: 'col' },
      `Programme ${i + 1}`, engine.uptakeMxl(d, 0).point === best && compare.length > 1 ? el('span', { class: 'small muted' }, ' (highest take-up)') : null)));
    const body = rows.map(([lab, f]) => el('tr', {}, el('th', { scope: 'row' }, lab), ...compare.map((d) => el('td', {}, f(d)))));
    const actions = el('tr', { class: 'no-print' }, el('td', {}), ...compare.map((d, i) => el('td', {},
      el('div', { class: 'btnrow', style: 'margin:0' },
        el('button', { type: 'button', class: 'btn secondary', onclick: () => apply(d, `Programme ${i + 1} loaded into the planner`) }, 'Load'),
        el('button', { type: 'button', class: 'btn secondary', onclick: () => {
          compare.splice(i, 1); renderCompare();
          toast({ level: 'info', title: `Programme ${i + 1} removed from the comparison`, message: compare.length ? `${compare.length} programme${compare.length > 1 ? 's' : ''} left to compare.` : 'The comparison is now empty.' });
        } }, 'Remove')))));
    box.replaceChildren(el('div', { class: 'table-scroll' }, el('table', {}, el('thead', {}, head), el('tbody', {}, ...body, actions))));
  }

  document.getElementById('add-compare').addEventListener('click', () => {
    if (compare.some((d) => JSON.stringify(d) === JSON.stringify(design))) {
      toast({ level: 'amber', title: 'This programme is already in the comparison', message: 'Change a feature first, then add it again to compare.' });
      return;
    }
    let dropped = false;
    if (compare.length >= MAX_COMPARE) { compare.shift(); dropped = true; }
    compare.push({ ...design });
    renderCompare();
    steps.mark('compare');
    toast({ level: 'green', title: `Added to the comparison (${compare.length} of ${MAX_COMPARE})`,
      message: dropped ? 'The oldest programme was removed to make room.' : compare.length < 2 ? 'Change some features and add another programme to compare them side by side.' : 'See the table under "Compare programmes".',
      action: { label: 'Show the comparison', onClick: () => document.getElementById('compare-title').scrollIntoView({ behavior: 'smooth', block: 'start' }) } });
  });
  document.getElementById('copy').addEventListener('click', copyLink);
  document.getElementById('print').addEventListener('click', () => {
    toast({ level: 'info', title: 'Opening the print window', message: 'Choose "Save as PDF" as the printer to keep a copy.' });
    setTimeout(() => window.print(), 300);
  });
  document.getElementById('reset').addEventListener('click', () => {
    apply({ ...DEFAULT }, 'Started again with the default programme');
    tsel.value = '';
  });
  document.getElementById('to-value').addEventListener('click', () => steps.mark('value'));

  sync();
  update();
  renderCompare();
  if (fromUrl) toast({ level: 'info', title: 'Programme loaded from your link', message: describe(engine, design) });
});
