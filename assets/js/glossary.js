// Plain-language definitions used by the glossary page and the (i) buttons across the site.
export const GLOSSARY = {
  'take-up': {
    term: 'Take-up',
    text: 'The share of people who would choose a programme rather than no programme if it were offered to them. "71 in 100" means that of every 100 people offered the programme, about 71 would choose to use it. It comes from what people chose in the survey, so it describes what they would accept, not how many would attend every session.',
  },
  interval: {
    term: '95% interval',
    text: 'A range that shows how precise a result is. The study asked 264 people, not everyone, so every number has some uncertainty. We can be fairly confident the true value lies within the 95% interval. A narrow range means a precise result; a wide range means the result should be treated with more caution.',
  },
  model: {
    term: 'The choice model (mixed logit)',
    text: 'The statistical model used to turn people\'s survey choices into predictions. It allows people to differ from one another, both in how much they value each feature and in how willing they are to use any programme at all. It fitted the survey answers better than the simpler models, so every result on the tool pages comes from it.',
  },
  dce: {
    term: 'Discrete choice experiment',
    text: 'A survey method in which people choose between options that differ in several features, such as cost and travel. Because the features change from one question to the next, the choices show how much each feature matters and how people trade one against another.',
  },
  wtp: {
    term: 'Willingness to pay',
    text: 'The amount of money per session that would make people equally happy with a programme before and after a change in one feature. For example, if including the carer is worth A$15 per session, people would accept a fee about A$15 higher for a programme that includes the carer. A negative value means people would need to be compensated for that feature.',
  },
  value: {
    term: 'Value to families',
    text: 'How much better off people are, in dollars, from being offered a programme compared with having no programme, after paying any fee. It is averaged over everyone offered the programme, including those who would not use it. Economists call this consumer surplus.',
  },
  'break-even': {
    term: 'Break-even running cost',
    text: 'The running cost per participant per session at which the value of a programme to the people who use it equals the cost of providing it. A programme that costs less than this to run returns more value than it costs.',
  },
  'running-cost': {
    term: 'Running cost',
    text: 'What it costs a provider to deliver one session to one participant: staff time, venue, materials and transport, divided by the number of participants in the session. The study did not measure running costs, so you enter your own.',
  },
  bcr: {
    term: 'Benefit-cost ratio',
    text: 'The value of a programme to participants divided by the cost of running it. A ratio above 1 means the programme returns more value than it costs; below 1 means it costs more than the value it returns. A ratio of 1.5 means every dollar spent returns A$1.50 in value.',
  },
  'net-benefit': {
    term: 'Net benefit',
    text: 'The value of a programme to participants minus the cost of running it, over a year. A positive net benefit means the programme is worth more than it costs. Fees paid by participants go to the provider, so they do not change the net benefit to society.',
  },
  elasticity: {
    term: 'Price sensitivity (elasticity)',
    text: 'How much take-up changes when the fee changes. A price sensitivity of -0.3 means a 10% rise in the fee reduces take-up by about 3%. Values closer to zero mean people are less put off by price.',
  },
  keep: {
    term: 'Keep it once chosen',
    text: 'In each survey question, people first chose the better of two programmes, then said whether they would still use it if they could choose neither. "Keep it once chosen" is the share who stayed with their choice at that second step. It comes from a supporting analysis (a sequential model) reported on the research page.',
  },
  'never-free': {
    term: 'Would not take it even if free',
    text: 'The share of simulated people who would still prefer no programme even if this one cost nothing. For them, the features of the programme are not the main barrier. Information, referral from a trusted health professional or a trial session may matter more.',
  },
  'lived-experience': {
    term: 'Lived experience',
    text: 'In this study, people who had caring responsibilities, a close family member with dementia, or daily or weekly contact with a person living with dementia. Results by lived experience come from a supporting analysis that lets the value of carer inclusion differ between these groups. They are reported on the research and families pages.',
  },
  groups: {
    term: 'The two groups of people',
    text: 'A supporting analysis (a latent class model) found two broad groups of people. The larger group rarely chose no programme and was less sensitive to price. The smaller group often chose no programme and was more sensitive to price. This is reported on the research page; the tool pages describe differences between people with the mixed logit instead.',
  },
  rating: {
    term: 'Design rating',
    text: 'Where a programme sits among all 1,536 combinations of features and prices that the study allowed. Green means it is in the top third for take-up, amber the middle third, and red the bottom third.',
  },
  'study-design': {
    term: 'Combinations not in the study',
    text: 'Some combinations of features were never shown to respondents because they do not happen in practice, for example a group programme held in a person\'s own home. Predictions for these combinations would be guesses, so the tool does not offer them.',
  },
  importance: {
    term: 'Relative importance',
    text: 'How much each feature changed people\'s choices, as a share of the total, across the range of options in the study. It depends on the ranges tested; for example, cost covers free to A$50 per session.',
  },
  'benefit-share': {
    term: 'Share of stated value counted',
    text: 'People can say they value something more in a survey than they would pay in practice. Counting only three quarters or half of the stated value tests whether a conclusion still holds if survey answers overstate real value.',
  },
  diversion: {
    term: 'Where people go when a fee rises',
    text: 'When two programmes are available and one becomes more expensive, some people switch to the other programme and some stop using any programme. The share who stop using any programme is shown here.',
  },
  'reference-level': {
    term: 'Compared with',
    text: 'Each value is measured against a starting point for that feature: peer support, no carer support, in person, monthly, 30 minutes, at home and free.',
  },
  likely: {
    term: 'Likely, undecided and unlikely users',
    text: 'The choice model simulates 1,000 people who differ in their preferences, as the people in the study did. For each simulated person it gives their own chance of choosing the programme. "Likely" means a chance of 80% or more, "unlikely" less than 20%, and "undecided" anything in between. Undecided people are the ones most affected by design changes, fees and how the programme is promoted.',
  },
  improve: {
    term: 'Where a programme could improve',
    text: 'For each feature, the tool tries every other option allowed with the rest of the design and reports the one that raises take-up most. Green means the current choice is already the best or within 1 in 100 of it. Amber means a gain of 1 to 5 in 100. Red means a gain of more than 5 in 100, so that feature is holding the programme back.',
  },
  'simulated-people': {
    term: 'Simulated people',
    text: 'To show that people differ, the mixed logit model represents the population with 1,000 simulated people, each with their own preferences drawn from the estimated spread in the study. Results are averages over these people.',
  },
  mnl: {
    term: 'Multinomial logit',
    text: 'A simpler choice model that assumes everyone has the same preferences. It was the starting point of the analysis and gives similar average values to the mixed logit. The tool pages do not use it; it appears only in the technical check on the research page.',
  },
  'dual-response': {
    term: 'Dual response',
    text: 'A survey format with two answers per question: first, which of two programmes is better; second, whether the person would still take it up if they could choose neither. The second answer is what makes it possible to predict take-up rather than only which programme is preferred.',
  },
  'supporting-analyses': {
    term: 'Supporting analyses',
    text: 'Separate models used to check and extend the main results: a sequential model of the two answers (how many would keep a programme once chosen), a lived-experience model (whether caring or contact with dementia changes the value of carer inclusion), a latent class model (two broad groups of people) and a piecewise cost model (whether the first dollars of a fee matter more). They are reported on the research page; the tool pages use only the mixed logit.',
  },
  'krinsky-robb': {
    term: 'Krinsky-Robb method',
    text: 'The way the 95% intervals are calculated. The model estimates are redrawn 1,000 times from their estimated uncertainty, every result is recalculated for each draw, and the middle 95% of the results forms the interval.',
  },
  'hypothetical-bias': {
    term: 'Hypothetical bias',
    text: 'The tendency for people to say they value something more in a survey than they would pay in real life. The benefit-cost page lets you count only part of the stated value to test this.',
  },
};

// Groups for the glossary page
export const GLOSSARY_GROUPS = [
  { title: 'Reading the results', keys: ['take-up', 'interval', 'rating', 'improve', 'likely', 'never-free', 'elasticity', 'diversion', 'importance', 'reference-level', 'study-design'] },
  { title: 'Money and value', keys: ['wtp', 'value', 'running-cost', 'break-even', 'bcr', 'net-benefit', 'benefit-share', 'hypothetical-bias'] },
  { title: 'How the study and the models work', keys: ['dce', 'dual-response', 'model', 'simulated-people', 'krinsky-robb', 'mnl', 'supporting-analyses', 'keep', 'lived-experience', 'groups'] },
];
export const GLOSSARY_ORDER = GLOSSARY_GROUPS.flatMap((g) => g.keys);
