# Extractable components

The Finance UI is a static monolith rather than a component framework. There are no existing reusable shell components suitable for Superdesign component extraction without first refactoring production code. For this scoped Money Map design, use `finance/money-map.js`, `finance/money-map.css` and `theme-jaimi.css` directly as context. Basic cards, buttons and toggles should remain inline in the draft.
