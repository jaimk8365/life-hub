# Shared layouts

## Standalone Finance shell

- Source: `finance/app.html`
- Description: A compact installable-app header containing the Finance title, separate Life Hub link, sync status and the encrypted Finance iframe.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#F4EDFF">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="My Finance">
<title>My Finance</title>
<link rel="manifest" href="./manifest.webmanifest">
<link rel="icon" href="../icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../icons/icon-192.png">
</head>
<body>
<header><b>💰 My Finance</b><a href="../" target="_blank" rel="noopener" aria-label="Open Life Hub separately">Life Hub ↗</a><button id="finance-sync-status" aria-controls="finance-sync-panel" aria-expanded="false">Sync</button></header>
<p id="finance-loading" role="status">Checking your existing encrypted sync…</p>
<iframe id="f-finance" title="My Finance — encrypted personal accounts" hidden></iframe>
<section id="finance-sync-panel" hidden aria-labelledby="finance-sync-heading"><button class="close" aria-label="Close sync settings">✕</button><h2 id="finance-sync-heading">Your private device sync</h2><div id="finance-sync-content"></div><p id="finance-sync-message" role="status"></p></section>
</body>
</html>
```

## Encrypted Finance inner navigation

- Source: private ignored file `src/finance.html`; only the non-sensitive structure is recorded here.
- Description: Top title and action controls, followed by horizontally scrollable tabs for Overview, Accounts, Budget, Income, Save & Goals, Bills, Expenses, Debts, Tax and Insights. Each tab renders into a single view container. The Money Map currently appears as a collapsible section at the top of Accounts.
