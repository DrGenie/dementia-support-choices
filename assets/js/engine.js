// Calculation engine for Dementia Support Choices.
// Pure functions on the exported model (data/model.json). No DOM access, so
// the same code runs in the browser and in the Node validation test.

export const SESSIONS_PER_YEAR = { daily: 365, weekly: 52, monthly: 12 };
export const HOURS_PER_SESSION = { '30min': 0.5, '2h': 2, '4h': 4 };
const ASC = 'ASC opt-out';
const COST = 'cost (A$ per session)';
const LOGSCALE = 'scale: stage 2 (retain vs opt-out) log-scale';
const PW = ['cost: slope A$0-5', 'cost: slope A$5-20', 'cost: slope A$20-50'];
const H1 = {
  caring: 'caregiver x caring responsibilities',
  closeFamily: 'caregiver x close family with dementia',
  frequentContact: 'caregiver x frequent contact',
};

const logistic = (x) => 1 / (1 + Math.exp(-x));
const softplus = (x) => (x > 30 ? x : Math.log1p(Math.exp(x)));

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function interval(values) {
  const s = Float64Array.from(values).sort();
  return [quantile(s, 0.025), quantile(s, 0.975)];
}

export class Engine {
  constructor(model) {
    this.m = model;
    this.attributes = model.attributes;
    this.forbidden = model.forbidden;
    this.scenarios = model.scenarios;
    this.idx = {};
    for (const [name, block] of Object.entries(model.models)) {
      const map = new Map();
      block.params.forEach((p, i) => map.set(p, i));
      this.idx[name] = map;
    }
    this._mxl = null;
  }

  // ------------------------------------------------------------ design helpers
  attribute(key) { return this.attributes.find((a) => a.key === key); }
  level(key, levelKey) { return this.attribute(key).levels.find((l) => l.key === levelKey); }
  label(key, levelKey) { return this.level(key, levelKey).label; }

  violations(design) {
    return this.forbidden.filter((rule) =>
      Object.entries(rule).every(([k, v]) => k === 'rule' || v.includes(design[k])));
  }
  isFeasible(design) { return this.violations(design).length === 0; }

  // Level keys of attribute `key` that keep the rest of `design` feasible
  feasibleLevels(design, key) {
    return this.attribute(key).levels
      .filter((l) => this.isFeasible({ ...design, [key]: l.key }))
      .map((l) => l.key);
  }

  sessionsPerYear(design) { return SESSIONS_PER_YEAR[design.frequency]; }
  annualCost(design) { return design.price * this.sessionsPerYear(design); }
  annualHours(design) { return HOURS_PER_SESSION[design.duration] * this.sessionsPerYear(design); }

  // Names of the dummy parameters switched on by a design
  activeParams(design) {
    const out = [];
    for (const a of this.attributes) {
      const lev = a.levels.find((l) => l.key === design[a.key]);
      if (!lev) throw new Error(`Unknown level ${design[a.key]} for ${a.key}`);
      if (lev.param) out.push(lev.param);
    }
    return out;
  }

  // ------------------------------------------------------------ fixed-coefficient models
  // Utility of a programme (excluding the constant for neither) for one parameter vector
  utility(modelName, theta, design, opts = {}) {
    const ix = this.idx[modelName];
    let v = 0;
    for (const p of this.activeParams(design)) v += theta[ix.get(p)];
    if (modelName === 'piecewise') v += this.piecewiseCost(theta, design.price);
    else v += theta[ix.get(COST)] * design.price;
    if (modelName === 'h1' && design.carer === 'yes' && opts.profile) {
      for (const [k, name] of Object.entries(H1)) if (opts.profile[k]) v += theta[ix.get(name)];
    }
    return v;
  }

  piecewiseCost(theta, p) {
    const ix = this.idx.piecewise;
    const g = PW.map((n) => theta[ix.get(n)]);
    return g[0] * Math.min(p, 5) + g[1] * Math.max(0, Math.min(p, 20) - 5) + g[2] * Math.max(0, p - 20);
  }

  piecewiseSlope(theta, p) {
    const ix = this.idx.piecewise;
    const seg = p < 5 ? 0 : p < 20 ? 1 : 2;
    return theta[ix.get(PW[seg])];
  }

  asc(modelName, theta) { return theta[this.idx[modelName].get(ASC)]; }

  // Probability of choosing the programme rather than neither when offered alone
  uptakeFixed(modelName, design, opts = {}) {
    const block = this.m.models[modelName];
    const f = (th) => logistic(this.utility(modelName, th, design, opts) - this.asc(modelName, th));
    const point = f(block.theta);
    if (opts.point) return { point };
    return { point, ci: interval(block.draws.map(f)) };
  }

  // Probability of keeping a chosen programme (sequential model C)
  retention(design) {
    const block = this.m.models.sequential;
    const ix = this.idx.sequential;
    const f = (th) => logistic(Math.exp(th[ix.get(LOGSCALE)]) *
      (this.utility('sequential', th, design) - th[ix.get(ASC)]));
    return { point: f(block.theta), ci: interval(block.draws.map(f)) };
  }

  elasticityFixed(modelName, design) {
    const block = this.m.models[modelName];
    const f = (th) => {
      const P = logistic(this.utility(modelName, th, design) - this.asc(modelName, th));
      const slope = modelName === 'piecewise' ? this.piecewiseSlope(th, design.price)
        : th[this.idx[modelName].get(COST)];
      return slope * design.price * (1 - P);
    };
    return { point: f(block.theta), ci: interval(block.draws.map(f)) };
  }

  // Willingness to pay (A$ per session) for each non-reference level, MNL
  wtp(modelName = 'mnl') {
    const block = this.m.models[modelName];
    const ix = this.idx[modelName];
    const c = ix.get(COST);
    const out = [];
    for (const a of this.attributes) {
      for (const l of a.levels) {
        if (!l.param) continue;
        const k = ix.get(l.param);
        const ref = a.levels.find((x) => !x.param);
        out.push({
          attribute: a.key, attributeLabel: a.label, level: l.key, label: l.label,
          reference: ref ? ref.label : '',
          point: -block.theta[k] / block.theta[c],
          ci: interval(block.draws.map((th) => -th[k] / th[c])),
        });
      }
    }
    return out;
  }

  // Relative importance: range of part-worths / sum of ranges (cost over A$0 to A$50)
  relativeImportance(modelName = 'mnl') {
    const block = this.m.models[modelName];
    const ix = this.idx[modelName];
    const f = (th) => {
      const ranges = this.attributes.map((a) => {
        const vals = a.levels.map((l) => (l.param ? th[ix.get(l.param)] : 0));
        return Math.max(...vals) - Math.min(...vals);
      });
      ranges.push(Math.abs(th[ix.get(COST)]) * 50);
      const total = ranges.reduce((s, x) => s + x, 0);
      return ranges.map((r) => r / total);
    };
    const pt = f(block.theta);
    const dr = block.draws.map(f);
    const keys = [...this.attributes.map((a) => ({ key: a.key, label: a.label })), { key: 'cost', label: 'Cost per session' }];
    return keys.map((k, i) => ({ ...k, point: pt[i], ci: interval(dr.map((d) => d[i])) }))
      .sort((a, b) => b.point - a.point);
  }

  // WTP for carer inclusion by lived-experience profile (H1 model)
  carerValueByProfile(profile) {
    const block = this.m.models.h1;
    const ix = this.idx.h1;
    const f = (th) => {
      let b = th[ix.get('caregiver: Yes')];
      for (const [k, name] of Object.entries(H1)) if (profile[k]) b += th[ix.get(name)];
      return -b / th[ix.get(COST)];
    };
    return { point: f(block.theta), ci: interval(block.draws.map(f)) };
  }

  // ------------------------------------------------------------ mixed logit (MXL-R)
  mxl() {
    if (this._mxl) return this._mxl;
    const b = this.m.models.mxlr;
    const K = b.params.length;
    const ix = this.idx.mxlr;
    this._mxl = { b, K, ix, asc: ix.get(ASC), cost: ix.get(COST), random: b.random, z: b.z };
    return this._mxl;
  }

  // For one (mean, sd) vector: per-person (V without cost) - constant, and the cost coefficient
  mxlBase(design, mean, sd) {
    const { ix, asc, cost, random, z } = this.mxl();
    const on = this.activeParams(design).map((p) => ix.get(p));
    const n = z.length;
    const base = new Float64Array(n);
    // position of each parameter within the random list (z columns)
    if (!this._zcol) {
      this._zcol = new Map();
      random.forEach((p, j) => this._zcol.set(p, j));
    }
    const zc = this._zcol;
    for (let i = 0; i < n; i++) {
      const zi = z[i];
      let v = 0;
      for (const k of on) v += mean[k] + (zc.has(k) ? sd[k] * zi[zc.get(k)] : 0);
      const a = mean[asc] + (zc.has(asc) ? sd[asc] * zi[zc.get(asc)] : 0);
      base[i] = v - a;
    }
    return { base, bc: mean[cost] };
  }

  static meanLogistic(base, bc, price) {
    let s = 0;
    for (let i = 0; i < base.length; i++) s += 1 / (1 + Math.exp(-(base[i] + bc * price)));
    return s / base.length;
  }

  // Population-average uptake, with an interval over `nDraws` parameter draws
  uptakeMxl(design, nDraws = 1000) {
    const { b } = this.mxl();
    const pt = this.mxlBase(design, b.mean, b.sd);
    const point = Engine.meanLogistic(pt.base, pt.bc, design.price);
    if (nDraws === 0) return { point };
    const vals = [];
    const step = Math.max(1, Math.floor(b.draws_mean.length / nDraws));
    for (let r = 0; r < b.draws_mean.length; r += step) {
      const d = this.mxlBase(design, b.draws_mean[r], b.draws_sd[r]);
      vals.push(Engine.meanLogistic(d.base, d.bc, design.price));
    }
    return { point, ci: interval(vals) };
  }

  // Uptake and elasticity over a price grid. Returns arrays of {price, point, lo, hi}
  mxlCurve(design, prices, nDraws = 250) {
    const { b } = this.mxl();
    const pt = this.mxlBase(design, b.mean, b.sd);
    const step = Math.max(1, Math.floor(b.draws_mean.length / nDraws));
    const bases = [];
    for (let r = 0; r < b.draws_mean.length; r += step) bases.push(this.mxlBase(design, b.draws_mean[r], b.draws_sd[r]));
    const uptake = [], elasticity = [];
    for (const p of prices) {
      const ptU = Engine.meanLogistic(pt.base, pt.bc, p);
      const us = bases.map((d) => Engine.meanLogistic(d.base, d.bc, p));
      const [lo, hi] = interval(us);
      uptake.push({ price: p, point: ptU, lo, hi });
      const el = (d) => {
        let s = 0, P = 0;
        for (let i = 0; i < d.base.length; i++) {
          const q = 1 / (1 + Math.exp(-(d.base[i] + d.bc * p)));
          s += d.bc * q * (1 - q); P += q;
        }
        return P === 0 ? 0 : (s / d.base.length) * p / (P / d.base.length);
      };
      const es = bases.map(el);
      const [elo, ehi] = interval(es);
      elasticity.push({ price: p, point: el(pt), lo: elo, hi: ehi });
    }
    return { uptake, elasticity };
  }

  fixedCurve(modelName, design, prices) {
    const block = this.m.models[modelName];
    const uptake = [], elasticity = [];
    for (const p of prices) {
      const d = { ...design, price: p };
      const u = (th) => logistic(this.utility(modelName, th, d) - this.asc(modelName, th));
      const e = (th) => {
        const slope = modelName === 'piecewise' ? this.piecewiseSlope(th, p) : th[this.idx[modelName].get(COST)];
        return slope * p * (1 - u(th));
      };
      const [lo, hi] = interval(block.draws.map(u));
      const [elo, ehi] = interval(block.draws.map(e));
      uptake.push({ price: p, point: u(block.theta), lo, hi });
      elasticity.push({ price: p, point: e(block.theta), lo: elo, hi: ehi });
    }
    return { uptake, elasticity };
  }

  // Share who would not take the programme even when free, and the median reservation price
  reach(design) {
    const { b } = this.mxl();
    const pt = this.mxlBase(design, b.mean, b.sd);
    const res = Array.from(pt.base, (x) => x / -pt.bc).sort((a, c) => a - c);
    const never = res.filter((x) => x < 0).length / res.length;
    return { neverShare: never, medianReservation: quantile(res, 0.5) };
  }

  // Two programmes A and B plus neither. Shares and diversion when the price of A rises.
  substitution(designA, designB) {
    // MNL
    const th = this.m.models.mnl.theta;
    const ascM = this.asc('mnl', th);
    const bcM = th[this.idx.mnl.get(COST)];
    const eA = Math.exp(this.utility('mnl', th, designA));
    const eB = Math.exp(this.utility('mnl', th, designB));
    const e0 = Math.exp(ascM);
    const S = eA + eB + e0;
    const mnl = { A: eA / S, B: eB / S, none: e0 / S };
    mnl.diversionNone = mnl.none / (mnl.none + mnl.B);
    mnl.ownElasticity = bcM * designA.price * (1 - mnl.A);
    mnl.crossNone = -bcM * designA.price * mnl.A;
    // MXL-R
    const { b } = this.mxl();
    const ba = this.mxlBase(designA, b.mean, b.sd);
    const bb = this.mxlBase(designB, b.mean, b.sd);
    const n = ba.base.length; const bc = ba.bc;
    let PA = 0, PB = 0, P0 = 0, dA = 0, d0 = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.exp(ba.base[i] + bc * designA.price);
      const c = Math.exp(bb.base[i] + bc * designB.price);
      const s = 1 + a + c;
      const pa = a / s, pb = c / s, p0 = 1 / s;
      PA += pa; PB += pb; P0 += p0;
      dA += bc * pa * (1 - pa); d0 += -bc * pa * p0;
    }
    PA /= n; PB /= n; P0 /= n; dA /= n; d0 /= n;
    const mxl = {
      A: PA, B: PB, none: P0, diversionNone: -d0 / dA,
      ownElasticity: dA * designA.price / PA, crossNone: d0 * designA.price / P0,
    };
    return { mnl, mxl };
  }

  // Latent class uptake (point estimates)
  latentClasses(design) {
    const lc = this.m.models.lc2;
    const ix = new Map(lc.params.map((p, i) => [p, i]));
    return lc.share.map((share, g) => {
      let v = lc.beta[ix.get(COST)][g] * design.price;
      for (const p of this.activeParams(design)) v += lc.beta[ix.get(p)][g];
      return { share, uptake: logistic(v - lc.beta[ix.get(ASC)][g]) };
    });
  }

  // Single changes ranked by the gain in MXL-R uptake
  bestChanges(design) {
    const base = this.uptakeMxl(design, 0).point;
    const out = [];
    for (const a of this.attributes) {
      for (const l of a.levels) {
        if (l.key === design[a.key]) continue;
        const d = { ...design, [a.key]: l.key };
        if (!this.isFeasible(d)) continue;
        out.push({ attribute: a.label, from: this.label(a.key, design[a.key]), to: l.label,
          change: this.uptakeMxl(d, 0).point - base, design: d });
      }
    }
    for (const p of this.m.cost.levels) {
      if (p === design.price) continue;
      const d = { ...design, price: p };
      out.push({ attribute: 'Cost per session', from: `A$${design.price}`, to: p === 0 ? 'Free' : `A$${p}`,
        change: this.uptakeMxl(d, 0).point - base, design: d });
    }
    return out.sort((x, y) => y.change - x.change);
  }

  // All permitted combinations of the non-cost attributes
  allFeasibleDesigns(price) {
    const lists = this.attributes.map((a) => a.levels.map((l) => l.key));
    const out = [];
    const rec = (i, d) => {
      if (i === lists.length) { const dd = { ...d, price }; if (this.isFeasible(dd)) out.push(dd); return; }
      for (const k of lists[i]) rec(i + 1, { ...d, [this.attributes[i].key]: k });
    };
    rec(0, {});
    return out;
  }


  // ------------------------------------------------------------ benefits
  // Expected consumer surplus per person offered, per session (A$), from the logsum
  // (Small and Rosen 1981): the money value of having the programme available
  // compared with no programme, net of the fee. Returned with take-up P for each
  // parameter draw so that any benefit-cost measure can be given an interval.
  valueDraws(modelName, design, nDraws = 200) {
    if (modelName === 'mxlr') {
      const { b } = this.mxl();
      const one = (mean, sd) => {
        const d = this.mxlBase(design, mean, sd);
        let P = 0, CS = 0;
        for (let i = 0; i < d.base.length; i++) {
          const x = d.base[i] + d.bc * design.price;
          P += 1 / (1 + Math.exp(-x)); CS += softplus(x);
        }
        return { P: P / d.base.length, CS: CS / d.base.length / -d.bc };
      };
      const point = one(b.mean, b.sd);
      const step = Math.max(1, Math.floor(b.draws_mean.length / nDraws));
      const draws = [];
      for (let r = 0; r < b.draws_mean.length; r += step) draws.push(one(b.draws_mean[r], b.draws_sd[r]));
      return { point, draws };
    }
    const block = this.m.models[modelName];
    const c = this.idx[modelName].get(COST);
    const one = (th) => {
      const x = this.utility(modelName, th, design) - this.asc(modelName, th);
      return { P: logistic(x), CS: softplus(x) / -th[c] };
    };
    return { point: one(block.theta), draws: block.draws.map(one) };
  }

  /**
   * Benefit-cost analysis for one programme.
   * opts: { offered: people offered, providerCost: A$ per participant per session,
   *         benefitShare: share of stated benefit counted (0-1), years: 1 }
   * Gross benefit to participants = consumer surplus + fees paid (their willingness to pay),
   * multiplied by the share of stated value counted. Net benefit = gross benefit - provider cost;
   * fees are a transfer from participants to the provider and do not enter separately.
   */
  static bca(value, design, sessions, opts) {
    const N = opts.offered, c = opts.providerCost, k = opts.benefitShare ?? 1;
    const f = ({ P, CS }) => {
      const participants = N * P;
      const fees = participants * sessions * design.price;
      const benefit = k * (N * sessions * CS + fees);
      const cost = c == null ? null : participants * sessions * c;
      return {
        participants, fees, benefit, cost,
        net: cost == null ? null : benefit - cost,
        bcr: cost ? benefit / cost : null,
        breakEven: P > 0 ? k * (CS / P + design.price) : 0,
        benefitPerParticipantSession: P > 0 ? k * (CS / P + design.price) : 0,
        surplusPerOfferedSession: k * CS,
      };
    };
    const point = f(value.point);
    const d = value.draws.map(f);
    const ci = {};
    for (const key of Object.keys(point)) {
      if (point[key] == null) continue;
      ci[key] = interval(d.map((x) => x[key]));
    }
    // probability that net benefit is positive
    const pPositive = point.net == null ? null : d.filter((x) => x.net > 0).length / d.length;
    return { ...point, ci, pPositive, draws: d };
  }



  // valueDraws over a grid of fees, reusing the simulated people for the mixed logit
  valueCurve(modelName, design, prices, nDraws = 120) {
    if (modelName !== 'mxlr') return prices.map((p) => this.valueDraws(modelName, { ...design, price: p }));
    const { b } = this.mxl();
    const step = Math.max(1, Math.floor(b.draws_mean.length / nDraws));
    const sets = [this.mxlBase(design, b.mean, b.sd)];
    for (let r = 0; r < b.draws_mean.length; r += step) sets.push(this.mxlBase(design, b.draws_mean[r], b.draws_sd[r]));
    const val = (d, p) => {
      let P = 0, CS = 0;
      for (let i = 0; i < d.base.length; i++) { const x = d.base[i] + d.bc * p; P += 1 / (1 + Math.exp(-x)); CS += softplus(x); }
      return { P: P / d.base.length, CS: CS / d.base.length / -d.bc };
    };
    return prices.map((p) => ({ point: val(sets[0], p), draws: sets.slice(1).map((d) => val(d, p)) }));
  }

  // Where a design's take-up sits among all designs allowed by the study (four tested prices)
  rating(design) {
    if (!this._ratingPool) {
      const pool = [];
      for (const p of this.m.cost.levels) for (const d of this.allFeasibleDesigns(p)) pool.push(this.uptakeMxl(d, 0).point);
      this._ratingPool = Float64Array.from(pool).sort();
    }
    const u = this.uptakeMxl(design, 0).point;
    const pool = this._ratingPool;
    let below = 0;
    while (below < pool.length && pool[below] < u) below++;
    const percentile = below / pool.length;
    const level = percentile >= 2 / 3 ? 'green' : percentile >= 1 / 3 ? 'amber' : 'red';
    return { percentile, level, best: pool[pool.length - 1], worst: pool[0], median: quantile(pool, 0.5) };
  }

  // Check that this engine reproduces the MATLAB results stored in the export
  validate() {
    return this.scenarios.map((s) => {
      const mnl = this.uptakeFixed('mnl', s.design, { point: true }).point;
      const keep = this.retention(s.design).point;
      const mxl = this.uptakeMxl(s.design, 0).point;
      return {
        id: s.id, name: s.name, feasible: this.isFeasible(s.design),
        mnl, mnlMatlab: s.matlab.uptake_mnl, mnlOk: Math.abs(mnl - s.matlab.uptake_mnl) < 1e-4,
        keep, keepMatlab: s.matlab.keep_seq, keepOk: Math.abs(keep - s.matlab.keep_seq) < 1e-4,
        mxl, mxlMatlab: s.matlab.uptake_mxlr, mxlOk: Math.abs(mxl - s.matlab.uptake_mxlr) < 0.01,
      };
    });
  }
}

export async function loadEngine(url = 'data/model.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return new Engine(await res.json());
}
