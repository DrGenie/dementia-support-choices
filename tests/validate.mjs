// Checks that the browser engine reproduces the MATLAB results and the
// published estimates. Run with: npm test
import { readFileSync } from 'node:fs';
import { Engine } from '../assets/js/engine.js';

const model = JSON.parse(readFileSync(new URL('../data/model.json', import.meta.url)));
const e = new Engine(model);
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };

for (const r of e.validate()) {
  check(r.mnlOk, `${r.id} MNL uptake ${r.mnl.toFixed(4)} vs MATLAB ${r.mnlMatlab.toFixed(4)}`);
  check(r.keepOk, `${r.id} retention ${r.keep.toFixed(4)} vs MATLAB ${r.keepMatlab.toFixed(4)}`);
  check(r.mxlOk, `${r.id} MXL-R uptake ${r.mxl.toFixed(3)} vs MATLAB ${r.mxlMatlab.toFixed(3)}`);
}

// Published MNL willingness to pay (Table 4 of the manuscript), A$ per session
const published = { 'caregiver: Yes': 17.5, 'type: Psychological counselling': 16.5, 'frequency: Weekly': 15.4,
  'distance: Wider community (50+ km)': -21.0 };
const w = e.wtp('mnl');
for (const [param, val] of Object.entries(published)) {
  const row = w.find((x) => e.level(x.attribute, x.level).param === param);
  check(Math.abs(row.point - val) < 0.06, `WTP ${row.label} ${row.point.toFixed(2)} vs published ${val}`);
}

// Feasible design space: 384 combinations of the six non-cost attributes x 4 prices = 1,536
const n = e.allFeasibleDesigns(0).length;
check(n * 4 === 1536, `feasible combinations ${n} x 4 prices = ${n * 4} (expected 1536)`);

// Reference programme uptake when free and at A$50 (MNL 0.74 and 0.52)
const ref = { type: 'peer', carer: 'yes', mode: 'hybrid', frequency: 'weekly', duration: '2h', distance: 'local' };
const u0 = e.uptakeFixed('mnl', { ...ref, price: 0 }).point, u50 = e.uptakeFixed('mnl', { ...ref, price: 50 }).point;
check(Math.abs(u0 - 0.736) < 0.002 && Math.abs(u50 - 0.520) < 0.002, `reference programme uptake ${u0.toFixed(3)} free, ${u50.toFixed(3)} at A$50`);

// Diversion to neither at A$20 with counselling at A$20 (MNL 0.39, MXL-R 0.31)
const couns = { type: 'counselling', carer: 'no', mode: 'inperson', frequency: 'weekly', duration: '30min', distance: 'local', price: 20 };
const sub = e.substitution({ ...ref, price: 20 }, couns);
check(Math.abs(sub.mnl.diversionNone - 0.392) < 0.005 && Math.abs(sub.mxl.diversionNone - 0.306) < 0.02,
  `diversion to neither MNL ${sub.mnl.diversionNone.toFixed(3)}, MXL-R ${sub.mxl.diversionNone.toFixed(3)}`);

// Share who would not take the reference programme even when free (about 22%)
const reach = e.reach({ ...ref, price: 0 });
check(Math.abs(reach.neverShare - 0.224) < 0.02, `never take up when free ${(100 * reach.neverShare).toFixed(1)}%`);

// Consumer surplus per person offered per session (MATLAB econ_welfare_scenarios.csv / welfare_scenarios.csv)
const S = (id) => e.scenarios.find((x) => x.id === id).design;
const cs1 = e.valueDraws('mnl', { ...S('S1'), price: 0 }).point.CS;
const cs2 = e.valueDraws('mnl', S('S2')).point.CS;
check(Math.abs(cs1 - 74.64) < 0.2 && Math.abs(cs2 - 66.76) < 0.2, `MNL consumer surplus S1 free ${cs1.toFixed(2)} (MATLAB 74.64), S2 at A$5 ${cs2.toFixed(2)} (MATLAB 66.76)`);
const csm = e.valueDraws('mxlr', S('S1'), 10).point.CS;
check(Math.abs(csm - 100.67) < 3, `MXL-R consumer surplus S1 ${csm.toFixed(1)} (MATLAB 100.67, simulation error expected)`);
const b = Engine.bca(e.valueDraws('mnl', S('S1')), S('S1'), 52, { offered: 1000, providerCost: 50 });
check(Math.abs(b.breakEven - cs1 / e.uptakeFixed('mnl', S('S1')).point) < 1e-6, `break-even provider cost ${b.breakEven.toFixed(2)} per participant session`);

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll checks passed');
