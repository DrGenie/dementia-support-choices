import { boot, el, per100, pct, money, describe, feasibleTemplates, debounce, priceLabel } from './common.js';
import { lineChart, shareBars } from './charts.js';

const COL = { mnl: '#2a6bc4', mxl: '#d1621f', pw: '#18a078', none: '#6b7280' };
const PRICES = Array.from({ length: 26 }, (_, i) => 2 * i);

boot((engine) => {
  const templates = feasibleTemplates(engine);
  const byId = (id) => templates.find((t) => t.id === id);
  const fill = (sel, def) => {
    for (const t of templates) sel.append(el('option', { value: t.id, selected: t.id === def }, t.name));
  };
  const progSel = document.getElementById('fee-programme');
  const altSel = document.getElementById('alt-programme');
  const curSel = document.getElementById('cost-current');
  const newSel = document.getElementById('cost-alt');
  fill(progSel, 'S2'); fill(altSel, 'S3'); fill(curSel, 'S8'); fill(newSel, 'S1');
  const fee = document.getElementById('fee-input');
  const altFee = document.getElementById('alt-fee');

  const programme = () => ({ ...byId(progSel.value).design, price: +fee.value });

  // ------------------------------------------------------------ 1. fee curve
  let curveCache = { id: null };
  function curves() {
    const id = progSel.value;
    if (curveCache.id !== id) {
      const d = byId(id).design;
      curveCache = {
        id,
        mnl: engine.fixedCurve('mnl', d, PRICES),
        pw: engine.fixedCurve('piecewise', d, PRICES),
        mxl: engine.mxlCurve(d, PRICES, 250),
      };
    }
    return curveCache;
  }

  function stat(label, value, note) {
    return el('div', { class: 'stat' }, el('dt', {}, label), el('dd', {}, value, note ? el('small', {}, note) : null));
  }

  function updateFee() {
    const d = programme();
    document.getElementById('fee-out').textContent = priceLabel(d.price);
    document.getElementById('fee-programme-desc').textContent = describe(engine, d);
    const c = curves();
    const ser = (obj, name, color, dash, band) => ({ name, color, dash, band,
      points: obj.uptake.map((p) => ({ x: p.price, y: p.point, lo: p.lo, hi: p.hi })) });
    lineChart(document.getElementById('fee-chart'), {
      title: 'Predicted take-up by fee per session',
      series: [ser(c.mxl, 'Mixed logit', COL.mxl, '', true), ser(c.mnl, 'Multinomial logit', COL.mnl, '7 4', true), ser(c.pw, 'Piecewise cost', COL.pw, '2 4', false)],
      x: [0, 50], y: [Math.max(0, Math.floor(10 * Math.min(...c.mnl.uptake.map((p) => p.lo), ...c.mxl.uptake.map((p) => p.lo))) / 10), 1],
      xTicks: [0, 5, 10, 20, 30, 40, 50], xFormat: (v) => (v === 0 ? 'Free' : `$${v}`), yFormat: (v) => `${Math.round(100 * v)}%`,
      xLabel: 'Fee per session (A$)', yLabel: 'Take-up', marker: d.price,
    });
    const els = (obj, name, color, dash) => ({ name, color, dash, band: true,
      points: obj.elasticity.map((p) => ({ x: p.price, y: p.point, lo: p.lo, hi: p.hi })) });
    lineChart(document.getElementById('elasticity-chart'), {
      title: 'Price elasticity of take-up by fee',
      series: [els(c.mxl, 'Mixed logit', COL.mxl, ''), els(c.mnl, 'Multinomial logit', COL.mnl, '7 4')],
      x: [0, 50], y: [Math.floor(10 * Math.min(...c.mnl.elasticity.map((p) => p.lo))) / 10, 0],
      xTicks: [0, 5, 10, 20, 30, 40, 50], xFormat: (v) => (v === 0 ? 'Free' : `$${v}`), yFormat: (v) => v.toFixed(1),
      xLabel: 'Fee per session (A$)', yLabel: 'Elasticity', marker: d.price,
    });

    const u0 = engine.uptakeMxl({ ...d, price: 0 }, 0).point;
    const mx = engine.uptakeMxl(d, 400);
    const mnl = engine.uptakeFixed('mnl', d);
    const pw = engine.uptakeFixed('piecewise', d);
    const elM = d.price === 0 ? 0 : engine.elasticityFixed('mnl', d).point;
    const elX = c.mxl.elasticity.reduce((b, p) => (Math.abs(p.price - d.price) < Math.abs(b.price - d.price) ? p : b)).point;
    document.getElementById('fee-stats').replaceChildren(
      stat('Take-up, mixed logit', `${per100(mx.point)} in 100`, `95% interval ${per100(mx.ci[0])} to ${per100(mx.ci[1])}`),
      stat('Take-up, multinomial logit', `${per100(mnl.point)} in 100`, `piecewise cost: ${per100(pw.point)} in 100`),
      stat('Change from free', `${((mx.point - u0) * 100).toFixed(1)} in 100`, `price elasticity ${elM.toFixed(2)} (logit), ${elX.toFixed(2)} (mixed)`),
    );
    const unit = c.mnl.elasticity.find((p) => p.point <= -1);
    document.getElementById('fee-text').replaceChildren(
      el('p', {}, d.price === 0
        ? `When free, ${per100(mx.point)} in 100 people would be expected to take up this programme rather than no programme.`
        : `At ${money(d.price)} per session, take-up is ${per100(mx.point)} in 100, compared with ${per100(u0)} in 100 if the programme were free. Demand responds only modestly to price: a 1% rise in the fee reduces take-up by about ${Math.abs(elM).toFixed(2)}% under the multinomial logit.`),
      el('p', {}, unit ? `Take-up becomes price elastic (elasticity below -1) at about ${money(unit.price)} per session.`
        : 'Across the range tested, demand stays price inelastic: take-up falls by proportionally less than the fee rises. Even so, the piecewise model shows that moving from free to a small fee costs proportionally more take-up than later increases.'),
    );
    updateSwitch(); updateTravel(); updateReach(); updateCost();
  }

  // ------------------------------------------------------------ 2. substitution
  function updateSwitch() {
    const a = programme();
    const b = { ...byId(altSel.value).design, price: +altFee.value };
    document.getElementById('alt-fee-out').textContent = priceLabel(b.price);
    const s = engine.substitution(a, b);
    const nameA = byId(progSel.value).name, nameB = byId(altSel.value).name;
    if (progSel.value === altSel.value) {
      document.getElementById('share-chart').replaceChildren(el('p', { class: 'warning' }, 'Choose a second programme that is different from the first to see how people switch between them.'));
      document.getElementById('switch-text').replaceChildren();
      return;
    }
    shareBars(document.getElementById('share-chart'), [
      { label: 'Mixed logit', parts: [{ name: nameA, value: s.mxl.A, color: COL.mnl }, { name: nameB, value: s.mxl.B, color: COL.pw }, { name: 'No programme', value: s.mxl.none, color: COL.none }] },
      { label: 'Multinomial logit', parts: [{ name: nameA, value: s.mnl.A, color: COL.mnl }, { name: nameB, value: s.mnl.B, color: COL.pw }, { name: 'No programme', value: s.mnl.none, color: COL.none }] },
    ], { title: 'How choices split between two programmes and no programme' });
    document.getElementById('switch-text').replaceChildren(
      el('p', {}, `With both programmes on offer, ${per100(s.mxl.A)} in 100 people choose the ${nameA.toLowerCase()}, ${per100(s.mxl.B)} the ${nameB.toLowerCase()} and ${per100(s.mxl.none)} neither (mixed logit).`),
      el('p', {}, a.price === 0
        ? 'Move the fee for the first programme above zero to see where people go when it rises.'
        : `If the fee for the ${nameA.toLowerCase()} rises, about ${per100(s.mxl.diversionNone)} in 100 of the people it loses would choose no programme, and the rest would move to the ${nameB.toLowerCase()} (mixed logit; ${per100(s.mnl.diversionNone)} in 100 under the multinomial logit, which assumes people switch in proportion to current shares).`),
    );
  }

  // ------------------------------------------------------------ 3. travel and mode
  function updateTravel() {
    const base = programme();
    const modes = engine.attribute('mode').levels;
    const dists = engine.attribute('distance').levels;
    const head = el('tr', {}, el('th', { scope: 'col' }, 'Travel'), ...modes.map((m) => el('th', { scope: 'col', class: 'num' }, m.label)));
    const rows = dists.map((dl) => el('tr', {}, el('th', { scope: 'row' }, dl.label), ...modes.map((m) => {
      const d = { ...base, mode: m.key, distance: dl.key };
      if (!engine.isFeasible(d)) return el('td', { class: 'num muted' }, 'Not offered');
      const u = engine.uptakeMxl(d, 0).point;
      const cur = m.key === base.mode && dl.key === base.distance;
      return el('td', { class: 'num' }, cur ? el('strong', {}, `${per100(u)} in 100`) : `${per100(u)} in 100`);
    })));
    document.getElementById('travel-table').replaceChildren(el('table', {},
      el('caption', {}, `Take-up of the ${byId(progSel.value).name.toLowerCase()} (${base.price === 0 ? 'free' : money(base.price) + ' per session'}), mixed logit; current design in bold`),
      el('thead', {}, head), el('tbody', {}, ...rows)));
    const local = { ...base, mode: 'inperson', distance: 'local' }, wider = { ...base, mode: 'inperson', distance: 'wider' };
    const hyw = { ...base, mode: 'hybrid', distance: 'wider' };
    const ok = engine.isFeasible(local) && engine.isFeasible(wider);
    document.getElementById('travel-text').replaceChildren(el('p', {}, ok
      ? `Moving an in-person programme from the local area to 50 km or more away changes take-up from ${per100(engine.uptakeMxl(local, 0).point)} to ${per100(engine.uptakeMxl(wider, 0).point)} in 100. Offering it as hybrid at the same distance gives ${per100(engine.uptakeMxl(hyw, 0).point)} in 100. In the study, hybrid delivery did not offset the disutility of long travel, so regional services may also need outreach or transport support.`
      : 'For this type of programme, some combinations of travel and mode were not offered in the study.'));
  }

  // ------------------------------------------------------------ 4. reach
  function updateReach() {
    const d = programme();
    const r = engine.reach({ ...d, price: 0 });
    const cls = engine.latentClasses(d);
    document.getElementById('reach-text').replaceChildren(
      el('p', {}, `For the ${byId(progSel.value).name.toLowerCase()}, about ${per100(r.neverShare)} in 100 people would not take it up even if it were free. ${r.medianReservation > 50 ? 'For half the population it is worth more than A$50 per session, the highest fee tested.' : `For half the population it is worth at least ${money(Math.max(0, r.medianReservation))} per session.`}`),
      el('p', {}, 'Most of the differences between people in our study were about whether to use any programme at all, rather than which features they wanted. Programme design alone is unlikely to reach this group; information, referral from trusted health professionals and trial sessions may matter more.'),
    );
    document.getElementById('class-table').replaceChildren(el('table', {},
      el('caption', {}, `Two groups in the study population, take-up ${d.price === 0 ? 'when free' : 'at ' + money(d.price) + ' per session'}`),
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Group'), el('th', { scope: 'col', class: 'num' }, 'Share of people'), el('th', { scope: 'col', class: 'num' }, 'Take-up'))),
      el('tbody', {},
        el('tr', {}, el('th', { scope: 'row' }, 'Rarely chose no programme; less sensitive to price'), el('td', { class: 'num' }, pct(cls[0].share)), el('td', { class: 'num' }, `${per100(cls[0].uptake)} in 100`)),
        el('tr', {}, el('th', { scope: 'row' }, 'Often chose no programme; more sensitive to price'), el('td', { class: 'num' }, pct(cls[1].share)), el('td', { class: 'num' }, `${per100(cls[1].uptake)} in 100`)))));
  }

  // ------------------------------------------------------------ 5. cost per extra participant
  function updateCost() {
    const box = document.getElementById('cost-result');
    const N = Math.max(0, Math.floor(+document.getElementById('cost-n').value || 0));
    const cps = document.getElementById('cost-session').value;
    const cur = byId(curSel.value), alt = byId(newSel.value);
    if (!N) { box.replaceChildren(el('p', { class: 'warning' }, 'Enter the number of people offered the programme.')); return; }
    const calc = (s) => {
      const d = s.design;
      const u = engine.uptakeMxl(d, 0).point;
      const people = N * u;
      const sessions = engine.sessionsPerYear(d);
      const provider = cps === '' ? null : people * sessions * (+cps);
      const fees = people * sessions * d.price;
      return { u, people, sessions, provider, fees, net: provider == null ? null : provider - fees };
    };
    const a = calc(cur), b = calc(alt);
    const fmt = (x) => (x == null ? 'Enter a cost per session' : money(x));
    const rows = [
      ['Programme', describe(engine, cur.design), describe(engine, alt.design)],
      ['Take-up (mixed logit)', `${per100(a.u)} in 100`, `${per100(b.u)} in 100`],
      ['Expected participants', Math.round(a.people).toLocaleString('en-AU'), Math.round(b.people).toLocaleString('en-AU')],
      ['Sessions per participant per year', a.sessions, b.sessions],
      ['Provider cost per year', fmt(a.provider), fmt(b.provider)],
      ['Fees paid by participants per year', money(a.fees), money(b.fees)],
      ['Net cost to the funder per year', fmt(a.net), fmt(b.net)],
    ];
    const extra = b.people - a.people;
    const parts = [el('div', { class: 'table-scroll' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, ''), el('th', { scope: 'col' }, `Current: ${cur.name}`), el('th', { scope: 'col' }, `Alternative: ${alt.name}`))),
      el('tbody', {}, ...rows.map((r) => el('tr', {}, el('th', { scope: 'row' }, r[0]), el('td', {}, String(r[1])), el('td', {}, String(r[2]))))))),
    ];
    if (cur.id === alt.id) parts.push(el('p', { class: 'warning' }, 'Choose two different programmes to compare.'));
    else if (a.net == null) parts.push(el('p', {}, `The alternative would reach about ${Math.round(extra).toLocaleString('en-AU')} ${extra >= 0 ? 'more' : 'fewer'} people. Enter a provider cost per session to see the cost of each extra participant.`));
    else if (extra > 0.5) parts.push(el('p', {}, `The alternative would reach about ${Math.round(extra).toLocaleString('en-AU')} more people at an extra net cost of ${money(b.net - a.net)} per year, or ${money((b.net - a.net) / extra)} per extra participant per year.`));
    else parts.push(el('p', {}, `The alternative would not reach more people than the current programme (difference ${Math.round(extra).toLocaleString('en-AU')}).`));
    parts.push(el('p', { class: 'small muted' }, 'These figures combine predicted take-up from the study with the costs you enter. They assume everyone offered the programme makes one decision about it, that participants attend every session, and that the same provider cost per session applies to both programmes.'));
    box.replaceChildren(...parts);
  }

  const onFee = debounce(updateFee, 120);
  fee.addEventListener('input', () => { document.getElementById('fee-out').textContent = priceLabel(+fee.value); onFee(); });
  progSel.addEventListener('change', updateFee);
  altSel.addEventListener('change', updateSwitch);
  altFee.addEventListener('input', debounce(updateSwitch, 100));
  for (const id of ['cost-current', 'cost-alt', 'cost-n', 'cost-session']) document.getElementById(id).addEventListener('input', debounce(updateCost, 150));
  document.getElementById('cost-form').addEventListener('submit', (e) => e.preventDefault());
  updateFee();
});
