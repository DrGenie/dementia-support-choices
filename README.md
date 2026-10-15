# Dementia Support Choices

A public website that turns the results of an Australian discrete choice experiment on dementia support programmes into practical tools for three groups:

- **Families and carers** (`families.html`): plain-language information on programme types, a short exercise to work out what matters most, a printable summary with questions to ask providers, and national helplines.
- **Service providers and programme designers** (`plan.html`): build a programme from seven features and see predicted take-up with 95% intervals, the share who would keep it once chosen, reach by lived experience and by preference group, the single changes that raise take-up most, and a side-by-side comparison.
- **Policy makers and funders** (`fees.html`): take-up and price elasticity across fees from free to A$50 per session under three models, switching between two programmes when a fee rises, travel distance by delivery mode, who a programme will not reach, and the cost of each extra participant using your own provider costs.

`research.html` describes the study, shows willingness to pay and relative importance, lists limitations, and checks on every load that the website reproduces the MATLAB results.

The site is static HTML, CSS and JavaScript. It has no build step, no external libraries, no cookies and no analytics. Fonts are served from the repository.

## Study

Genie MG, Mansfield E, Paolucci F. Public preferences for dementia support programmes and implications for service design in Australia: evidence from a dual-response discrete choice experiment. The University of Newcastle, 2026.

264 Australian adults, 24 March to 7 April 2025, eight dual-response choice tasks each. Funded by the National Health and Medical Research Council (G1401207). Approved by the University of Newcastle Human Research Ethics Committee (H-2023-0412).

## Repository layout

```
index.html, families.html, plan.html, fees.html, research.html
accessibility.html, privacy.html, 404.html
assets/css/site.css          layout, type and print styles
assets/js/engine.js          all model calculations (shared by the browser and the tests)
assets/js/charts.js          SVG charts with hover tooltips
assets/js/common.js          text size, loading, formatting, icon array
assets/js/home.js, families.js, plan.js, fees.js, research.js   page code
assets/fonts/                Atkinson Hyperlegible and Source Serif 4 (SIL OFL)
assets/img/                  logo and favicon
data/model.json              model estimates and parameter draws exported from MATLAB
matlab/export_tool_json.m    script that writes data/model.json from the analysis results
tests/validate.mjs           checks the engine against the MATLAB results
.github/workflows/pages.yml  runs the tests, then deploys to GitHub Pages
```

## Deploy on GitHub Pages

1. Create a new repository on GitHub, for example `dementia-support-choices`, and push these files to the `main` branch:

   ```bash
   cd dementia-support-choices
   git init
   git add .
   git commit -m "Dementia Support Choices website"
   git branch -M main
   git remote add origin https://github.com/DrGenie/dementia-support-choices.git
   git push -u origin main
   ```

2. On GitHub, open **Settings > Pages** and under **Build and deployment** set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` runs `npm test` and, if the checks pass, publishes the site. The address appears in the **Actions** run and in **Settings > Pages**, for example `https://drgenie.github.io/dementia-support-choices/`.

To use a custom domain, add it under **Settings > Pages > Custom domain** and create the DNS record GitHub shows.

## Run locally

The pages load `data/model.json`, so they must be served over HTTP rather than opened as files:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Update the model

1. In MATLAB, from the root of the analysis package, run:

   ```matlab
   export_tool_json('outputs/results', 'outputs/tool/model.json')
   ```

   The script stops with an error if the exported values do not reproduce the saved MATLAB results.
2. Copy the new `model.json` into `data/`.
3. Run `npm test` (Node 18 or later) and commit. The website reads everything from this one file, so no other change is needed.

## Tests

`npm test` checks that the browser engine reproduces, for the eight example programmes, the MATLAB values for logit take-up and retention (to 0.0001) and mixed logit take-up (to 0.01, the simulation error), the published willingness-to-pay values, the size of the permitted design space (1,536 combinations), the reference programme's take-up at A$0 and A$50, the diversion ratio and the share who would not take a free programme.

## Accessibility

Designed to WCAG 2.2 AA: large default text with a text size control, a typeface designed for low-vision readers, plain language, consistent navigation, full keyboard use with a visible focus indicator, charts with line patterns, labels and nearby text, and print styles for summaries. See `accessibility.html`.

## Licence

Code: MIT. Text and model estimates: CC BY 4.0. Fonts: SIL Open Font License 1.1. See `LICENSE` and `CITATION.cff`.

## Contact

Dr Mesfin Genie, Newcastle Business School, The University of Newcastle, mesfin.genie@newcastle.edu.au
