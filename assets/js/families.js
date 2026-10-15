import { boot, el, money, pct, toast, progress, setContext } from './common.js';
import { barChart } from './charts.js';

const IMPORTANCE = [
  { value: 'a lot', label: 'Matters a lot' },
  { value: 'a little', label: 'Matters a little' },
  { value: 'not much', label: 'Does not matter much' },
];

// Each question: what the person prefers, and how much it matters
const QUESTIONS = [
  { key: 'type', title: 'Type of programme', prompt: 'Which kinds of programme interest you?', multi: true,
    options: [['peer', 'Peer support group'], ['community', 'Social group, day programme or outing'], ['counselling', 'Counselling'], ['vr', 'Virtual reality sessions'], ['unsure', 'Not sure yet']] },
  { key: 'carer', title: 'Support for the carer', prompt: 'Should the programme also support the family member or friend who provides care?',
    options: [['yes', 'Yes, it should include the carer'], ['no', 'No, it is for the person with dementia'], ['unsure', 'Not sure']] },
  { key: 'mode', title: 'How to take part', prompt: 'How would you prefer to take part?',
    options: [['inperson', 'In person'], ['virtual', 'Online, by phone or video'], ['hybrid', 'A mix of both'], ['any', 'No preference']] },
  { key: 'frequency', title: 'How often', prompt: 'How often would suit you?',
    options: [['monthly', 'Once a month'], ['weekly', 'Once a week'], ['daily', 'Most days'], ['any', 'No preference']] },
  { key: 'duration', title: 'Length of each session', prompt: 'How long could each session be?',
    options: [['30min', 'About 30 minutes'], ['2h', 'About 2 hours'], ['4h', 'Half a day'], ['any', 'No preference']] },
  { key: 'distance', title: 'Travel', prompt: 'How far could you travel to a programme?',
    options: [['home', 'It needs to come to us at home'], ['local', 'Up to about 12 km'], ['wider', 'Further if needed']] },
  { key: 'cost', title: 'Cost', prompt: 'What is the most you could pay per session?',
    options: [['0', 'It needs to be free'], ['5', 'Up to $5'], ['20', 'Up to $20'], ['50', 'Up to $50 or more']] },
];

const QUESTIONS_TO_ASK = {
  type: {
    peer: 'Who else attends the peer support group, and is it for people with dementia, carers, or both?',
    community: 'What activities are on offer, and can activities be adapted as needs change?',
    counselling: 'Who provides the counselling, what are their qualifications, and is there a limit on the number of sessions?',
    vr: 'How long are virtual reality sessions, who supervises them, and what happens if the headset is uncomfortable?',
  },
  carer: {
    yes: 'Can I attend with them? Is there anything specifically for carers, such as education, a carer group or respite while they attend?',
    no: 'Can the person attend on their own, and how will staff keep me informed?',
  },
  mode: {
    inperson: 'Where are sessions held, and is the venue easy to get into and quiet?',
    virtual: 'What device and internet connection is needed, and can someone help us set it up the first time?',
    hybrid: 'Can we choose online or in person each week depending on how we are going?',
  },
  frequency: {
    monthly: 'Is there anything between monthly sessions if we need support sooner?',
    weekly: 'Is there a weekly option, and what happens if we miss a week?',
    daily: 'Can we start with fewer days and build up?',
  },
  duration: {
    '30min': 'Are shorter sessions available?',
    '2h': 'Is there a break during sessions, and are refreshments provided?',
    '4h': 'What does a longer session look like, and is there a quiet space to rest?',
  },
  distance: {
    home: 'Can the programme be delivered at home or online?',
    local: 'Is the programme held near us, and is transport available?',
    wider: 'Is transport provided or subsidised for longer trips?',
  },
  cost: {
    '0': 'Is the programme free, or is there a fee waiver?',
    '5': 'What is the fee per session, and is a waiver available?',
    '20': 'What is the fee per session, and can it be paid through an aged care service?',
    '50': 'What is the total cost over a year, and can it be paid through an aged care service?',
  },
};

function buildForm(container) {
  for (const q of QUESTIONS) {
    const fs = el('fieldset', { class: 'question' });
    fs.append(el('legend', {}, q.title));
    const pref = el('div', { class: 'field' });
    pref.append(el('span', { class: 'hint', id: `${q.key}-prompt` }, q.prompt));
    const choices = el('div', { class: 'choices', role: q.multi ? 'group' : 'radiogroup', 'aria-labelledby': `${q.key}-prompt` });
    for (const [v, lab] of q.options) {
      const input = el('input', { type: q.multi ? 'checkbox' : 'radio', name: `${q.key}-pref`, value: v });
      choices.append(el('label', {}, input, lab));
    }
    pref.append(choices);
    const imp = el('div', { class: 'field' });
    imp.append(el('span', { class: 'hint', id: `${q.key}-imp` }, 'How much does this matter to you?'));
    const ichoices = el('div', { class: 'choices', role: 'radiogroup', 'aria-labelledby': `${q.key}-imp` });
    for (const o of IMPORTANCE) {
      ichoices.append(el('label', {}, el('input', { type: 'radio', name: `${q.key}-imp`, value: o.value }), o.label));
    }
    imp.append(ichoices);
    fs.append(pref, imp);
    container.append(fs);
  }
}

function readForm(form) {
  const data = new FormData(form);
  return QUESTIONS.map((q) => ({
    ...q,
    prefs: data.getAll(`${q.key}-pref`),
    importance: data.get(`${q.key}-imp`),
  }));
}

function renderSummary(target, answers, engine, quiet) {
  const order = { 'a lot': 0, 'a little': 1, 'not much': 2, null: 3 };
  const sorted = answers.slice().sort((a, b) => order[a.importance] - order[b.importance]);
  const answered = answers.filter((a) => a.prefs.length || a.importance);
  target.replaceChildren();
  if (!answered.length) {
    target.append(el('p', { class: 'warning' }, 'Answer at least one question to see a summary.'));
    if (!quiet) target.focus();
    return;
  }
  const optionLabel = (q, v) => (q.options.find((o) => o[0] === v) || [v, v])[1];
  target.append(el('h3', {}, 'Your summary'));
  target.append(el('p', { class: 'print-only' }, `Prepared on ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })} using Dementia Support Choices.`));

  const top = sorted.filter((a) => a.importance === 'a lot');
  if (top.length) {
    target.append(el('p', {}, `What matters most to you: ${top.map((a) => a.title.toLowerCase()).join(', ')}.`));
  }
  const tbody = el('tbody');
  for (const a of sorted) {
    if (!a.prefs.length && !a.importance) continue;
    const imp = IMPORTANCE.find((o) => o.value === a.importance);
    tbody.append(el('tr', {},
      el('th', { scope: 'row' }, a.title),
      el('td', {}, a.prefs.length ? a.prefs.map((v) => optionLabel(a, v)).join('; ') : 'No answer'),
      el('td', {}, imp ? imp.label : 'No answer')));
  }
  target.append(el('div', { class: 'table-scroll' }, el('table', {},
    el('caption', {}, 'Your answers, most important first'),
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Feature'), el('th', { scope: 'col' }, 'Your preference'), el('th', { scope: 'col' }, 'How much it matters'))),
    tbody)));

  // Tailored questions
  const qs = [];
  for (const a of sorted) {
    if (a.importance === 'not much') continue;
    for (const v of a.prefs) {
      const t = QUESTIONS_TO_ASK[a.key] && QUESTIONS_TO_ASK[a.key][v];
      if (t && !qs.includes(t)) qs.push(t);
    }
  }
  if (qs.length) {
    target.append(el('h3', {}, 'Questions to ask, based on your answers'));
    target.append(el('ul', {}, qs.map((t) => el('li', {}, t))));
  }

  // Short notes linking answers to study findings
  const notes = [];
  const w = engine.wtp('mxlr');
  const get = (p) => w.find((x) => engine.level(x.attribute, x.level).param === p);
  const carerAns = answers.find((a) => a.key === 'carer');
  if (carerAns.prefs.includes('yes')) {
    notes.push(`You are not alone in wanting the carer included. It was one of the features people in our study valued most, at about ${money(get('caregiver: Yes').point)} per session, and even more among people in regular contact with someone living with dementia.`);
  }
  const dist = answers.find((a) => a.key === 'distance');
  if (dist.prefs.includes('home') || dist.prefs.includes('local')) {
    notes.push('Many people in our study wanted to avoid long trips. If a suitable programme is not close by, ask whether it can be offered online or whether transport is available.');
  }
  const cost = answers.find((a) => a.key === 'cost');
  if (cost.prefs.includes('0') || cost.prefs.includes('5')) {
    notes.push('Many community programmes are free. Ask about fee waivers, and ask My Aged Care whether an assessment could make you eligible for funded support.');
  }
  if (notes.length) {
    target.append(el('h3', {}, 'Things to keep in mind'));
    target.append(el('ul', {}, notes.map((t) => el('li', {}, t))));
  }
  target.append(el('p', {}, 'When you are ready, the National Dementia Helpline on 1800 100 500 can help you find programmes near you.'));
  const btns = el('div', { class: 'btnrow' },
    el('button', { type: 'button', class: 'btn', id: 'print-summary' }, 'Print or save as PDF'),
    el('button', { type: 'button', class: 'btn secondary', id: 'copy-summary' }, 'Copy the summary text'),
    el('a', { class: 'btn secondary', href: '#help' }, 'See where to get help'));
  target.append(btns);
  target.setAttribute('tabindex', '-1');
  if (!quiet) target.focus();
}

boot((engine) => {
  const form = document.getElementById('values-form');
  buildForm(document.getElementById('values-fields'));
  const summary = document.getElementById('summary');
  const steps = progress(document.getElementById('progress'), [
    { id: 'answer', label: 'Answer the questions', href: '#matters' },
    { id: 'summary', label: 'Show your summary', href: '#values-form' },
    { id: 'keep', label: 'Print or copy your summary', href: '#summary' },
    { id: 'help', label: 'Contact a service', href: '#help' },
  ]);
  const answered = document.getElementById('answered');
  const countAnswered = () => {
    const a = readForm(form);
    return { full: a.filter((x) => x.prefs.length && x.importance).length, any: a.filter((x) => x.prefs.length || x.importance).length };
  };
  let announcedAll = false;
  const refreshCount = () => {
    const c = countAnswered();
    answered.textContent = `${c.full} of ${QUESTIONS.length} questions fully answered`;
    if (c.full === QUESTIONS.length) {
      steps.mark('answer');
      if (!announcedAll) {
        announcedAll = true;
        toast({ level: 'green', title: 'All questions answered', message: 'Your summary is ready to show.', action: { label: 'Next: show my summary', onClick: () => form.requestSubmit() } });
      }
    }
  };
  let shown = false;
  form.addEventListener('change', () => {
    refreshCount();
    // Once the summary is showing, keep it in step with the answers
    if (shown) { renderSummary(summary, readForm(form), engine, true); wireSummary(); }
  });
  refreshCount();
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const c = countAnswered();
    renderSummary(summary, readForm(form), engine);
    if (!c.any) {
      toast({ level: 'red', title: 'No answers yet', message: 'Answer at least one question to see a summary.' });
      return;
    }
    shown = true;
    wireSummary();
    steps.mark('summary');
    toast({ level: c.full === QUESTIONS.length ? 'green' : 'amber', title: 'Your summary is ready',
      message: c.full === QUESTIONS.length ? 'It lists your priorities and questions to ask providers.' : `You answered ${c.full} of ${QUESTIONS.length} questions fully. The summary uses what you gave; you can add more answers and show it again.`,
      action: { label: 'Next: print or save it', onClick: () => document.getElementById('print-summary').focus() } });
  });
  function wireSummary() {
    const pb = document.getElementById('print-summary');
    if (!pb) return;
    pb.addEventListener('click', () => {
      steps.mark('keep');
      toast({ level: 'info', title: 'Opening the print window', message: 'Choose "Save as PDF" as the printer to keep a copy for appointments.' });
      setTimeout(() => window.print(), 300);
    });
    document.getElementById('copy-summary').addEventListener('click', async () => {
      steps.mark('keep');
      try {
        await navigator.clipboard.writeText(summary.innerText.replace(/Print or save as PDF[\s\S]*$/, '').trim());
        toast({ level: 'green', title: 'Summary copied', message: 'Paste it into an email, a note or a message to family.', action: { label: 'Next: see where to get help', href: '#help' } });
      } catch (e) {
        toast({ level: 'amber', title: 'Copying is not available in this browser', message: 'Use "Print or save as PDF" instead.' });
      }
    });
  }
  form.addEventListener('reset', () => {
    summary.replaceChildren(); announcedAll = false; shown = false;
    setTimeout(refreshCount, 0);
    toast({ level: 'info', title: 'Your answers have been cleared', message: 'Nothing was saved, so there is nothing else to delete.' });
  });
  document.querySelectorAll('#help a[href^="tel:"], #help a[href^="http"]').forEach((a) => a.addEventListener('click', () => steps.mark('help')));

  // Relative importance from the study
  const ri = engine.relativeImportance('mxlr');
  const names = { type: 'Type of programme', carer: 'Support for the carer', mode: 'How people take part', frequency: 'How often', duration: 'Length of each session', distance: 'Travel', cost: 'Cost per session' };
  barChart(document.getElementById('importance-chart'),
    ri.map((r) => ({ label: names[r.key], point: r.point, lo: r.ci[0], hi: r.ci[1], color: '#2a6bc4' })),
    { format: (v) => pct(v), title: 'Relative importance of programme features in the study' });

  const byRank = ri.slice().sort((a, b) => b.point - a.point);
  const payNames = { 'caregiver: Yes': 'Including the carer', 'type: Psychological counselling': 'Counselling', 'frequency: Weekly': 'Weekly rather than monthly sessions', 'type: Community engagement': 'Community groups', 'frequency: Daily': 'Daily rather than monthly sessions' };
  const topPay = engine.wtp('mxlr').filter((r) => r.point > 0).sort((a, b) => b.point - a.point).slice(0, 3)
    .map((r) => ({ ...r, label: payNames[engine.level(r.attribute, r.level).param] || r.label }));
  const carerOnly = engine.carerValueByProfile({});
  const frequent = engine.carerValueByProfile({ frequentContact: true });
  document.getElementById('others-text').replaceChildren(
    el('p', {}, `${names[byRank[0].key]} made the biggest difference across the range tested (cost ran from free to A$50 per session), followed by ${names[byRank[1].key].toLowerCase()} and ${names[byRank[2].key].toLowerCase()}. The features people would pay most for were ${topPay.map((r) => `${r.label.toLowerCase()} (about ${money(r.point)} per session)`).join(', ')}.`),
    el('p', {}, `A supporting analysis found that people in daily or weekly contact with someone living with dementia valued carer inclusion at about ${money(frequent.point)} per session, compared with about ${money(carerOnly.point)} for people without that experience.`));
  const top3 = byRank.slice(0, 3);
  setContext('importance', () => `the three features that mattered most were ${top3.map((r) => `${names[r.key].toLowerCase()} (${pct(r.point)})`).join(', ')}.`);
});
