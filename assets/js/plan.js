import { boot, el, iconArray, per100, pct, money, describe, fillSelect, feasibleTemplates, debounce, priceLabel } from './common.js';

const DEFAULT = { type: 'peer', carer: 'yes', mode: 'hybrid', frequency: 'weekly', duration: '2h', distance: 'local', price: 5 };
const MAX_COMPARE = 3;

boot((engine) => {
  let design = { ...DEFAULT };
  const compare = [];
  const fields = document.getElementById('feature-fields');
  const selects = {};

  // template list (only examples allowed by the study design)
  const templates = feasibleTemplates(engine);
  const tsel = document.getElementById('template');
  tsel.append(el('option', { value: '' }, 'Choose an example'));
  for (const s of templates) tsel.append(el('option', { value: s.id }, s.name));
  tsel.addEventListener('change', () => {
    const s = templates.find((t) => t.id === tsel.value);
    if (s) { design = { ...s.design }; sync(); update(); }
  });

  for (const a of engine.attributes) {
    const id = `f-${a.key}`;
    const wrap = el('div', { class: 'field' }, el('label', { for: id }, a.label));
    const s = el('select', { id });
    s.addEventListener('change', () => { design[a.key] = s.value; tsel.value = ''; sync(); update(); });
    wrap.append(s);
    fields.append(wrap);
    selects[a.key] = s;
  }
  const price = document.getElementById('price');
  const priceOut = document.getElementById('price-out');
  const slowUpdate = debounce(update, 150);
  price.addEventListener('input', () => { design.price = +price.value; priceOut.textContent = priceLabel(design.price); tsel.value = ''; slowUpdate(); });

  function sync() {
    for (const a of engine.attributes) fillSelect(selects[a.key], engine, design, a.key);
    price.value = design.price;
    priceOut.textContent = priceLabel(design.price);
  }

  function stat(label, value, note) {
    return el('div', { class: 'stat' }, el('dt', {}, label), el('dd', {}, value, note ? el('small', {}, note) : null));
  }

  function update() {
    const mx = engine.uptakeMxl(design, 400);
    const mnl = engine.uptakeFixed('mnl', design);
    const keep = engine.retention(design);
    const k = per100(mx.point);
    document.getElementById('uptake-number').textContent = `${k} in 100`;
    document.getElementById('uptake-label').textContent = 'people would be expected to choose this programme rather than no programme.';
    document.getElementById('uptake-range').textContent = `95% interval: ${per100(mx.ci[0])} to ${per100(mx.ci[1])} in 100.`;
    iconArray(document.getElementById('uptake-array'), mx.point, `${k} of 100 people would take up this programme`);
    document.getElementById('print-design').textContent = `Programme: ${describe(engine, design)}.`;

    const sessions = engine.sessionsPerYear(design);
    document.getElementById('stats').replaceChildren(
      stat('Keep it once chosen', `${per100(keep.point)} in 100`, `95% interval ${per100(keep.ci[0])} to ${per100(keep.ci[1])}`),
      stat('Simpler model (same preferences for all)', `${per100(mnl.point)} in 100`, `95% interval ${per100(mnl.ci[0])} to ${per100(mnl.ci[1])}`),
      stat('Cost to the participant over a year', money(engine.annualCost(design)), `${sessions} sessions`),
      stat('Time over a year', `${Math.round(engine.annualHours(design)).toLocaleString('en-AU')} hours`, `${sessions} sessions of ${engine.label('duration', design.duration).toLowerCase()}`),
      stat('Price elasticity at this fee', design.price === 0 ? '0' : engine.elasticityFixed('mnl', design).point.toFixed(2), '% change in take-up for a 1% fee rise'),
      stat('Would not take it even if free', pct(engine.reach({ ...design, price: 0 }).neverShare), 'Mixed logit'),
    );

    // Reach: lived experience and latent classes
    const none = engine.uptakeFixed('h1', design, { profile: {} });
    const freq = engine.uptakeFixed('h1', design, { profile: { frequentContact: true } });
    const classes = engine.latentClasses(design);
    const reach = document.getElementById('reach');
    const parts = [];
    if (design.carer === 'yes') {
      parts.push(el('p', {}, `Because this programme includes the carer, it appeals more to people in daily or weekly contact with someone living with dementia: ${per100(freq.point)} in 100 of them would take it up (95% interval ${per100(freq.ci[0])} to ${per100(freq.ci[1])}), compared with ${per100(none.point)} in 100 people without lived experience.`));
    } else {
      parts.push(el('p', {}, `This programme does not include the carer. People in daily or weekly contact with someone living with dementia valued carer inclusion most, so adding it would raise their take-up from ${per100(freq.point)} to ${per100(engine.uptakeFixed('h1', { ...design, carer: 'yes' }, { point: true, profile: { frequentContact: true } }).point)} in 100.`));
    }
    parts.push(el('p', {}, `The study population falls into two broad groups. The larger group (${pct(classes[0].share)} of people) rarely chose no programme; ${per100(classes[0].uptake)} in 100 of them would take this one up. The smaller group (${pct(classes[1].share)}) often chose no programme and was more sensitive to price; ${per100(classes[1].uptake)} in 100 of them would take it up.`));
    reach.replaceChildren(...parts);

    // Best single changes
    const list = document.getElementById('changes');
    const changes = engine.bestChanges(design).filter((c) => c.change > 0.0005).slice(0, 6);
    list.replaceChildren(...(changes.length ? changes.map((c) => el('li', {},
      el('span', {}, el('strong', {}, c.attribute), `: ${c.from} to ${c.to}`),
      el('span', { class: 'gain' }, `+${(100 * c.change).toFixed(1)} in 100`),
      el('button', { type: 'button', class: 'btn secondary', onclick: () => { design = { ...c.design }; tsel.value = ''; sync(); update(); } }, 'Apply'),
    )) : [el('li', {}, 'No single change allowed by the study design would raise take-up further.')]));
  }

  function renderCompare() {
    const box = document.getElementById('compare');
    if (!compare.length) {
      box.replaceChildren(el('p', { class: 'muted' }, 'Use "Add to comparison" to compare up to three programmes side by side.'));
      return;
    }
    const rows = [
      ['Programme', (d) => describe(engine, d)],
      ['Take-up (mixed logit)', (d) => { const u = engine.uptakeMxl(d, 400); return `${per100(u.point)} in 100 (${per100(u.ci[0])} to ${per100(u.ci[1])})`; }],
      ['Take-up (simpler model)', (d) => `${per100(engine.uptakeFixed('mnl', d, { point: true }).point)} in 100`],
      ['Keep it once chosen', (d) => `${per100(engine.retention(d).point)} in 100`],
      ['Would not take it even if free', (d) => pct(engine.reach({ ...d, price: 0 }).neverShare)],
      ['Cost to participant per year', (d) => money(engine.annualCost(d))],
      ['Hours per year', (d) => Math.round(engine.annualHours(d)).toLocaleString('en-AU')],
    ];
    const head = el('tr', {}, el('th', { scope: 'col' }, ''), ...compare.map((_, i) => el('th', { scope: 'col' }, `Programme ${i + 1}`)));
    const body = rows.map(([lab, f]) => el('tr', {}, el('th', { scope: 'row' }, lab), ...compare.map((d) => el('td', {}, f(d)))));
    const remove = el('tr', { class: 'no-print' }, el('td', {}), ...compare.map((_, i) => el('td', {},
      el('button', { type: 'button', class: 'btn secondary', onclick: () => { compare.splice(i, 1); renderCompare(); } }, 'Remove'))));
    box.replaceChildren(el('div', { class: 'table-scroll' }, el('table', {}, el('thead', {}, head), el('tbody', {}, ...body, remove))));
  }

  document.getElementById('add-compare').addEventListener('click', () => {
    if (compare.length >= MAX_COMPARE) compare.shift();
    compare.push({ ...design });
    renderCompare();
    document.getElementById('compare-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('print').addEventListener('click', () => window.print());

  sync();
  update();
});
