import { boot, el, money, pct } from './common.js';
import { intervalChart, barChart } from './charts.js';

boot((engine) => {
  // Willingness to pay
  const w = engine.wtp('mnl').sort((a, b) => b.point - a.point);
  const rowLabel = (r) => `${r.label} (vs ${r.reference.toLowerCase()})`;
  intervalChart(document.getElementById('wtp-chart'),
    w.map((r) => ({ label: rowLabel(r), point: r.point, lo: r.ci[0], hi: r.ci[1], color: r.point >= 0 ? '#2a6bc4' : '#6b7280' })),
    { format: (v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(0)}`, xLabel: 'Willingness to pay, A$ per session (95% interval)', title: 'Willingness to pay for each programme feature' });
  const tbody = el('tbody', {}, ...w.map((r) => el('tr', {},
    el('th', { scope: 'row' }, r.attributeLabel), el('td', {}, r.label), el('td', {}, r.reference),
    el('td', { class: 'num' }, money(r.point, 1)), el('td', { class: 'num' }, `${money(r.ci[0], 1)} to ${money(r.ci[1], 1)}`))));
  document.getElementById('wtp-table').replaceChildren(el('table', {},
    el('caption', {}, 'Willingness to pay per session, multinomial logit, with 95% Krinsky-Robb intervals'),
    el('thead', {}, el('tr', {}, ...['Feature', 'Level', 'Compared with', 'A$ per session', '95% interval'].map((h, i) => el('th', { scope: 'col', class: i > 2 ? 'num' : '' }, h)))),
    tbody));

  // Relative importance
  const names = { type: 'Type of programme', carer: 'Support for carers', mode: 'Method of interaction', frequency: 'Frequency', duration: 'Length of each session', distance: 'Travel', cost: 'Cost per session' };
  const ri = engine.relativeImportance('mnl');
  barChart(document.getElementById('ri-chart'), ri.map((r) => ({ label: names[r.key], point: r.point, lo: r.ci[0], hi: r.ci[1], color: '#2a6bc4' })),
    { format: (v) => pct(v), title: 'Relative importance of programme features' });

  const pwTheta = engine.m.models.piecewise.theta, ixp = engine.idx.piecewise;
  const slopes = ['cost: slope A$0-5', 'cost: slope A$5-20', 'cost: slope A$20-50'].map((n) => -pwTheta[ixp.get(n)]);
  const carerNone = engine.carerValueByProfile({});
  const carerFreq = engine.carerValueByProfile({ frequentContact: true });
  const asc = engine.m.models.mxlr;
  document.getElementById('results-text').replaceChildren(
    el('p', {}, `Relative importance shows each feature's share of the total range of utility across the levels tested. Cost had the largest share (${pct(ri.find((r) => r.key === 'cost').point)}), which reflects the wide range of fees tested (free to A$50).`),
    el('h3', {}, 'Price'),
    el('p', {}, `The effect of cost was not a straight line. Each extra dollar reduced utility by ${slopes[0].toFixed(3)} between free and A$5, by ${slopes[1].toFixed(3)} between A$5 and A$20, and by ${slopes[2].toFixed(3)} between A$20 and A$50. The first dollars of a fee therefore matter most, and a single willingness-to-pay value is an average over the range tested.`),
    el('h3', {}, 'Differences between people'),
    el('p', {}, `Most of the variation between people concerned whether to choose any programme at all: in the mixed logit, the standard deviation of the constant for choosing no programme was ${asc.sd[0].toFixed(2)}, much larger than for any feature. Lived experience mattered for one feature: carer inclusion was worth about ${money(carerFreq.point)} per session to people in daily or weekly contact with someone living with dementia (95% interval ${money(carerFreq.ci[0])} to ${money(carerFreq.ci[1])}), compared with ${money(carerNone.point)} (${money(carerNone.ci[0])} to ${money(carerNone.ci[1])}) for people without lived experience. Income, age, physical health and knowing someone with dementia did not change the trade-offs.`),
    el('h3', {}, 'The follow-up question'),
    el('p', {}, `The second answer in each task depended on how attractive the chosen programme was, and allowing it separate preferences did not improve fit. People gave up a chosen programme only when it was unattractive; combining the two answers into one choice gave willingness-to-pay values within A$5 of the sequential model.`),
  );

  // Validation against MATLAB
  const v = engine.validate();
  const ok = (b) => el('span', { class: b ? 'status-ok' : 'status-no' }, b ? 'Matches' : 'Differs');
  document.getElementById('check-table').replaceChildren(el('table', {},
    el('caption', {}, 'Example programmes recalculated in this browser and compared with the MATLAB results'),
    el('thead', {}, el('tr', {}, ...['Programme', 'Take-up, logit (website / MATLAB)', '', 'Take-up, mixed logit (website / MATLAB)', '', 'Keep once chosen (website / MATLAB)', ''].map((h) => el('th', { scope: 'col' }, h)))),
    el('tbody', {}, ...v.map((r) => el('tr', {},
      el('th', { scope: 'row' }, r.feasible ? r.name : `${r.name} (outside the study design)`),
      el('td', { class: 'num' }, `${r.mnl.toFixed(4)} / ${r.mnlMatlab.toFixed(4)}`), el('td', {}, ok(r.mnlOk)),
      el('td', { class: 'num' }, `${r.mxl.toFixed(3)} / ${r.mxlMatlab.toFixed(3)}`), el('td', {}, ok(r.mxlOk)),
      el('td', { class: 'num' }, `${r.keep.toFixed(4)} / ${r.keepMatlab.toFixed(4)}`), el('td', {}, ok(r.keepOk)))))));

  const meta = engine.m.meta;
  document.getElementById('model-meta').textContent =
    `Model file exported ${meta.created || ''}${meta.matlab_version ? ` from MATLAB ${meta.matlab_version.split(' ')[1] || meta.matlab_version}` : ''}; ${meta.R} parameter draws and ${meta.n_individuals} simulated people.`;
});
