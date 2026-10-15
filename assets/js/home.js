import { boot, iconArray, per100, money } from './common.js';

boot((engine) => {
  const best = engine.scenarios.find((s) => s.id === 'S1');
  const low = engine.scenarios.find((s) => s.id === 'S4');
  const u = engine.uptakeMxl(best.design, 0).point;
  const v = engine.uptakeMxl(low.design, 0).point;
  document.getElementById('hero-number').textContent = `${per100(u)} in 100`;
  document.getElementById('hero-text').textContent =
    `people in the study population would take up a free, local, weekly social group that includes the carer. ` +
    `For a virtual reality programme at home without carer support, the figure is ${per100(v)} in 100.`;
  iconArray(document.getElementById('hero-array'), u, `${per100(u)} of 100 people would take up the social group`);

  // Add the study's money values to the findings
  const w = engine.wtp('mxlr');
  const get = (param) => w.find((x) => engine.level(x.attribute, x.level).param === param);
  const carer = get('caregiver: Yes'), wider = get('distance: Wider community (50+ km)');
  const weekly = get('frequency: Weekly'), couns = get('type: Psychological counselling');
  const f = document.querySelectorAll('#findings .finding p');
  f[0].textContent += ` People valued it at about ${money(carer.point)} per session.`;
  f[1].textContent += ` Compared with a programme at home, it reduced the value by about ${money(-wider.point)} per session, more than carer inclusion added.`;
  f[2].textContent += ` Weekly contact was worth about ${money(weekly.point)} per session more than monthly contact.`;
  f[3].textContent += ` Counselling was worth about ${money(couns.point)} per session more than peer support.`;
  const reach = engine.reach({ type: 'peer', carer: 'yes', mode: 'hybrid', frequency: 'weekly', duration: '2h', distance: 'local', price: 0 });
  f[5].textContent = `About ${per100(reach.neverShare)} in 100 people would not choose a weekly local peer support group that includes the carer even if it were free. Referral, information and trust may matter more for them than programme features.`;
});
