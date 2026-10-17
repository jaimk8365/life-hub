# Progress log

Newest at the top. Keep each entry to a few lines.

## Up next
- [ ] Finance redesign (src/finance-redesign/BRIEF.md): 0.1, 0.2 and 1.1 done. Next is 1.2: one shared date helper (budget week Wed–Tue, day X of 7, countdowns, synced X ago) with tests.
- [ ] Ask Jaimi before pushing; after a push, check the GitHub Pages run finished and the Actions run is green.

## Done
- 17/10/2026 – Ocean 1.1 fix: first release still looked cream because finance/household-dashboard.css and interactive-guide.css forced old cream/pink/green colours. Both now follow Ocean for Jaimi (Matthew keeps old colours via fallbacks). Verified by rendering Day and Dusk screenshots locally. Cache v61. Backups of the old CSS: .lifehub-backups/ocean-1.1/.
- 17/10/2026 – Finance redesign step 1.1 done: Ocean colours with Day/Dusk (auto from device, override in Insights > Settings & month-end tools > Appearance, saved per device under lifehub_fin_theme). Fonts now Fredoka + Nunito. Layout unchanged. Added tools/ocean-theme-patches.mjs; src/finance.html and finance/index.html rebuilt (backups: src/backups/finance-pre-ocean-2026-10-17.html, .lifehub-backups/ocean-1.1/). Cache v60. Tests 372/372. Matthew's partner app NOT re-themed yet.
- 17/10/2026 – Finance now opens in the SAME tab (was a new tab): Open Finance link and show('finance') in index.html; tests updated; service worker cache bumped to v59. Tests 372/372. Not committed or pushed yet.
- 17/10/2026 – Committed Co-Pilot, automation fixes and test updates (22 files, reviewed list). Not pushed yet. Left out on purpose: tools/build_bali_fund_pdf.py, tools/create-lifehub-template.mjs, package-lock.json.
- 17/10/2026 – Full test suite passes: 372/372. Installed the free dev-only test helper fake-indexeddb (npm install; node_modules is git-ignored). Updated tests/finance-separation.test.mjs: its fake browser now has setInterval, querySelectorAll, URLSearchParams and location, and the 'storage unavailable' case now expects Co-Pilot (the new front door) instead of Hub. package-lock.json only changed its name field.
- 17/10/2026 – Found the Finance test failures came from stale private sources (src/finance.html and src/partner-finance.html were from 30/09). Backed both up to src/backups/ (…-2026-10-17.html), then replaced them with the decrypted live pages. Live encrypted pages untouched. Full suite now finishes: 336 pass, 6 fail (see Known issues).
- 17/10/2026 – Fixed broken indentation in .github/workflows/refresh-reminders.yml (Co-Pilot lines would have broken the reminders refresh). Both workflow files now parse correctly.
- 16/10/2026 – Built Co-Pilot engine, encrypted page, Hub/Task Engine/sync/reminder integrations, build tooling, tests, and documentation; added More-menu routes for Shutdown and Settings. Encrypted build succeeded; focused Co-Pilot tests pass (23/23).
- 16/10/2026 – Added AGENTS.md / CLAUDE.md / PROGRESS.md instruction files – Claude (chat)

## Known issues
- Safari verification of the encrypted page, live sync, Quest delivery, and deployment remain outstanding.
