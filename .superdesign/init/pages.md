# Page dependency trees

## `/life-hub/finance/app.html` — standalone Finance

Entry: `finance/app.html`

- `finance/standalone.js`
- `sync.js`
- `finance/index.html` — encrypted generated output
  - private source: ignored `src/finance.html`
  - `theme-jaimi.css`
  - `finance/money-map.css`
  - `finance/money-map.js`
  - `finance/ui-safety.js`
  - `finance/shared-budget.js`
  - `finance/wealth-coach.js`
  - `finance/budget-logic.mjs`

The Money Map renders inside the Accounts view of the encrypted inner page. For design calls, use only the public Money Map renderer, its CSS and the theme; never submit the private source or real figures.

## `/life-hub/partner/` — Matthew Finance

Entry: encrypted `partner/index.html`

- private source: ignored `src/partner-finance.html`
- `theme-matthew.css`
- `finance/money-map.css`
- `finance/money-map.js`
- `finance/ui-safety.js`
- `finance/shared-budget.js`
- `partner-sync.js`

Matthew uses the same Money Map renderer with shared permitted data and a separate visual theme.
