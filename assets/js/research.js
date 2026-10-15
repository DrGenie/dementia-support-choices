import { boot, el, money, pct, per100, describe } from './common.js';
import { Engine } from './engine.js';
import { intervalChart, barChart } from './charts.js';

boot((engine) => {
  // Willingness to pay (mixed logit)
  const w = engine.wtp('mxlr').sort((a, b) => b.point - a.point);
  const rowLabel = (r) => `${r.label} (vs ${r.reference.toLowerCase()})`;
  intervalChart(document.getElementById('wtp-chart'),
    w.map((r) => ({ label: rowLabel(r), point: r.point, lo: r.ci[0], hi: r.ci[1], color: r.point >= 0 ? '#2a6bc4' : '#6b7280' })),
    { format: (v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(0)}`, xLabel: 'Willingness to pay, A$ per session (95% interval)', title: 'Willingness to pay for each programme feature' });
  const tbody = el('tbody', {}, ...w.map((r) => el('tr', {},
    el('th', { scope: 'row' }, r.attributeLabel), el('td', {}, r.label), el('td', {}, r.reference),
    el('td', { class: 'num' }, money(r.point, 1)), el('td', { class: 'num' }, `${money(r.ci[0], 1)} to ${money(r.ci[1], 1)}`))));
  document.getElementById('wtp-table').replaceChildren(el('table', {},
    el('caption', {}, 'Willingness to pay per session, mixed logit, with 95% intervals'),
    el('thead', {}, el('tr', {}, ...['Feature', 'Level', 'Compared with', 'A$ per session', '95% interval'].map((h, i) => el('th', { scope: 'col', class: i > 2 ? 'num' : '' }, h)))),
    tbody));

  // Relative importance (mixed logit)
  const names = { type: 'Type of programme', carer: 'Support for carers', mode: 'Method of interaction', frequency: 'Frequency', duration: 'Length of each session', distance: 'Travel', cost: 'Cost per session' };
  const ri = engine.relativeImportance('mxlr');
  barChart(document.getElementById('ri-chart'), ri.map((r) => ({ label: names[r.key], point: r.point, lo: r.ci[0], hi: r.ci[1], color: '#2a6bc4' })),
    { format: (v) => pct(v), title: 'Relative importance of programme features' });

  const mx = engine.m.models.mxlr;
  const sdOf = (p) => mx.sd[mx.params.indexOf(p)];
  const positive = w.filter((r) => r.point > 0 && r.ci[0] > 0);
  document.getElementById('results-text').replaceChildren(
    el('p', {}, `Relative importance shows each feature's share of the total difference in appeal across the levels tested. Cost had the largest share (${pct(ri.find((r) => r.key === 'cost').point)}), which reflects the wide range of fees tested (free to A$50).`),
    el('p', {}, `Features people would clearly pay for (95% interval above zero) were ${positive.map((r) => `${r.label.toLowerCase()} (${money(r.point)})`).join(', ')}. Travel to the wider community was the strongest dislike, at ${money(w.find((r) => r.level === 'wider').point)} per session compared with a programme at home.`),
    el('h3', {}, 'Differences between people'),
    el('p', {}, `Most of the variation between people concerned whether to choose any programme at all: the standard deviation of the preference for choosing no programme was ${Math.abs(sdOf('ASC opt-out')).toFixed(2)}, much larger than for any feature. This is why about one in five people would not use even a well-designed free programme.`),
  );

  // Supporting analyses
  const pwTheta = engine.m.models.piecewise.theta, ixp = engine.idx.piecewise;
  const slopes = ['cost: slope A$0-5', 'cost: slope A$5-20', 'cost: slope A$20-50'].map((n) => -pwTheta[ixp.get(n)]);
  const carerNone = engine.carerValueByProfile({});
  const carerFreq = engine.carerValueByProfile({ frequentContact: true });
  const lc = engine.m.models.lc2;
  const keepRows = engine.scenarios.filter((s) => engine.isFeasible(s.design)).map((s) => {
    const k = engine.retention(s.design);
    return el('tr', {}, el('th', { scope: 'row' }, s.name), el('td', { class: 'num' }, `${per100(k.point)} in 100`), el('td', { class: 'num' }, `${per100(k.ci[0])} to ${per100(k.ci[1])}`));
  });
  document.getElementById('supporting').replaceChildren(
    el('h4', {}, 'Keeping a programme once chosen (sequential model)'),
    el('p', {}, 'People gave up a chosen programme at the second question mainly when it was unattractive, and allowing the second answer its own preferences did not improve the fit. Combining the two answers into one choice gave willingness-to-pay values within about A$5 of the sequential model.'),
    el('div', { class: 'table-scroll' }, el('table', {}, el('caption', {}, 'Share who would keep the example programmes once chosen'),
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Programme'), el('th', { scope: 'col', class: 'num' }, 'Keep it'), el('th', { scope: 'col', class: 'num' }, '95% interval'))),
      el('tbody', {}, ...keepRows))),
    el('h4', {}, 'Lived experience'),
    el('p', {}, `Carer inclusion was worth about ${money(carerFreq.point)} per session to people in daily or weekly contact with someone living with dementia (95% interval ${money(carerFreq.ci[0])} to ${money(carerFreq.ci[1])}), compared with ${money(carerNone.point)} (${money(carerNone.ci[0])} to ${money(carerNone.ci[1])}) for people without lived experience. Income, age, physical health and knowing someone with dementia did not change the trade-offs.`),
    el('h4', {}, 'Two groups of people (latent class model)'),
    el('p', {}, `A larger group (${pct(lc.share[0])} of people) rarely chose no programme and was less sensitive to price. A smaller group (${pct(lc.share[1])}) often chose no programme and was more sensitive to price. The mixed logit captures the same pattern as a continuous spread rather than two groups, and fitted better.`),
    el('h4', {}, 'The shape of the price effect (piecewise cost model)'),
    el('p', {}, `Each extra dollar reduced appeal by ${slopes[0].toFixed(3)} between free and A$5, by ${slopes[1].toFixed(3)} between A$5 and A$20, and by ${slopes[2].toFixed(3)} between A$20 and A$50. The first dollars of a fee therefore matter most, and a single willingness-to-pay value is an average over the range tested.`),
  );

  // Benefits of the example programmes (mixed logit)
  const ben = document.getElementById('benefits');
  const rowsB = engine.scenarios.filter((s) => engine.isFeasible(s.design)).map((s) => {
    const v = engine.valueDraws('mxlr', s.design, 200);
    const b = Engine.bca(v, s.design, engine.sessionsPerYear(s.design), { offered: 1, providerCost: null });
    return el('tr', {}, el('th', { scope: 'row' }, s.name), el('td', {}, describe(engine, s.design)),
      el('td', { class: 'num' }, `${per100(v.point.P)} in 100`),
      el('td', { class: 'num' }, `${money(v.point.CS, 2)} (${money(b.ci.surplusPerOfferedSession[0], 0)} to ${money(b.ci.surplusPerOfferedSession[1], 0)})`),
      el('td', { class: 'num' }, money(b.breakEven)));
  });
  ben.append(el('div', { class: 'table-scroll' }, el('table', {},
    el('caption', {}, 'Value of the example programmes per person offered per session, net of the fee (mixed logit)'),
    el('thead', {}, el('tr', {}, ...['Programme', 'Features', 'Take-up', 'Value (95% interval)', 'Break-even running cost'].map((h, i) => el('th', { scope: 'col', class: i > 1 ? 'num' : '' }, h)))),
    el('tbody', {}, ...rowsB))));

  // Validation against MATLAB
  const v = engine.validate();
  const ok = (b) => el('span', { class: b ? 'status-ok' : 'status-no' }, b ? 'Matches' : 'Differs');
  document.getElementById('check-table').replaceChildren(el('table', {},
    el('caption', {}, 'Example programmes recalculated in this browser and compared with the MATLAB results'),
    el('thead', {}, el('tr', {}, ...['Programme', 'Take-up, mixed logit (website / MATLAB)', '', 'Take-up, multinomial logit (website / MATLAB)', '', 'Keep once chosen (website / MATLAB)', ''].map((h) => el('th', { scope: 'col' }, h)))),
    el('tbody', {}, ...v.map((r) => el('tr', {},
      el('th', { scope: 'row' }, r.feasible ? r.name : `${r.name} (outside the study design)`),
      el('td', { class: 'num' }, `${r.mxl.toFixed(3)} / ${r.mxlMatlab.toFixed(3)}`), el('td', {}, ok(r.mxlOk)),
      el('td', { class: 'num' }, `${r.mnl.toFixed(4)} / ${r.mnlMatlab.toFixed(4)}`), el('td', {}, ok(r.mnlOk)),
      el('td', { class: 'num' }, `${r.keep.toFixed(4)} / ${r.keepMatlab.toFixed(4)}`), el('td', {}, ok(r.keepOk)))))));

  const meta = engine.m.meta;
  document.getElementById('model-meta').textContent =
    `Model file exported ${meta.created || ''}${meta.matlab_version ? ` from MATLAB ${meta.matlab_version.split(' ')[1] || meta.matlab_version}` : ''}; ${meta.R} parameter draws and ${meta.n_individuals} simulated people.`;
});
