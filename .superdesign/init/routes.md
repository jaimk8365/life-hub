# Route map

Life Hub is a static multi-page application hosted under `/life-hub/`.

| URL | Source | Purpose |
|---|---|---|
| `/life-hub/` | `index.html` | Main Life Hub shell |
| `/life-hub/finance/app.html` | `finance/app.html` | Installable private Finance shell |
| `/life-hub/finance/index.html` | encrypted output built from ignored `src/finance.html` | Jaimi Finance application |
| `/life-hub/partner/` | encrypted output built from ignored `src/partner-finance.html` | Matthew shared Finance view |

The Finance inner app uses button-driven local views rather than URL routing. The relevant existing view is `accounts`, where the Money Map and internal transfers are rendered before account cards.
