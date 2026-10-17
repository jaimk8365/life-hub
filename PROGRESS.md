# Progress log

Newest at the top. Keep each entry to a few lines.

## Hand-off (read this first)
- Baton: free (last: Claude Code, 18/10/2026)
- What changed last: Finance redesign steps 1.2, 1.3, 1.4 and Phase 2 (new Home) built together. (1.2) finance/fin-dates.js: one date helper (budget week Wed to Tue, day X of 7, countdowns, "X ago"). (1.3) New navigation: bottom bar on phone/iPad portrait (Home, Goals, Ask Pip, Funds, More), sidebar on iPad landscape/Mac; the 11 old tabs are hidden and reachable from More in 5 groups. (1.4) "?" on every Home card (new cards have written help; older cards get a generic one). (2.1/2.2) New Home at top of Overview: week run path, Safe to Spend energy bar, Pip alert, account jars, goals strip, sinking funds strip, files inbox placeholder. Old Overview cards are still underneath. Ask Pip is a shortcut sheet only (chat comes in Phase 8).
- Files touched: finance/fin-dates.js, finance/home-redesign.js, finance/home-redesign.css (new); tools/finance-redesign-patches.mjs (new); src/finance.html (patched); finance/index.html (rebuilt); sw.js (cache v63); tests/fin-dates.test.mjs, tests/finance-home-redesign.test.mjs (new); tests/dashboard-review-flow.test.mjs, tests/copilot-shell.test.mjs (updated); PROGRESS.md
- Half-done: nothing. NOT committed and NOT pushed.
- Proof it works: tests 393/393. Checked in the browser on the decrypted source (src/finance.html, demo data, not Jaimi's real numbers) at phone, iPad portrait and Mac width: Home renders, today is the gold dot, all 11 old tabs and 5 sub-tabs open from More with no console errors. Not yet checked on a real phone or iPad, or on Jaimi's real data.
- Next step: Jaimi checks the new Home on her Mac against the design canvas (Finance > Overview). Then commit the exact files above and, only if she says yes, push and check the Pages run.
- Back-ups made: src/backups/finance-pre-redesign-20261018-0901.html, .lifehub-backups/finance-index-pre-redesign-*.html

## Up next
- [ ] Your day: merge Co-Pilot Today with the Planner day timeline (Today currently shows a fixed timeline and does not show Planner blocks; Planner only counts as busy time). Then one shared on-device Pip for Your day. Plan first, back up first.
- [ ] Budget Swap (Finance): enter a new cost (e.g. phone $140/mo), Pip suggests non-essential categories to swap so the total stays equal; builds on affordabilityTradeoffs(). Add after Phase 4 (goals).
- [ ] Finance redesign (src/finance-redesign/BRIEF.md): 0.1, 0.2, 1.1 to 1.4 and Phase 2 done (once Jaimi OKs the look). Next is Phase 3 (two profiles, plan mode first), then goals/sinking funds (Phase 4). Still to polish: Home shows real Safe to Spend only when balances are trusted; Home sinking-fund strip uses the old FUNDS list until Phase 4.
- [ ] Ask Jaimi before pushing; after a push, check the GitHub Pages run finished and the Actions run is green.

## Done
- 18/10/2026 – Finance redesign 1.2 to 1.4 + Phase 2 Home: date helper, new navigation (5 tabs / sidebar, old tabs under More), ? help on Home cards, new Home (week path, Safe to Spend bar, jars, goals, sinking funds, files placeholder). Cache v63. Tests 393/393. Not committed or pushed. – Claude Code
- 18/10/2026 – Handoff pack made: ~/Desktop/App Building/ now holds both guides (moved from ~/AI Projects/_guides) and Life Hub Co-Pilot/ (START HERE handoff, spec, mockup pictures + HTML, shortcuts to these instruction files). Spec copy refreshed in tmp/. No app code changed. – Claude chat
- 17/10/2026 – Moved My Planner and Notes under "Your day" (sidebar and phone More panel). Tests 372/372. Not pushed. – Claude chat
- 17/10/2026 – Fixed Finance still looking cream/pink: theme-jaimi.css forced the old palette with !important; added a Finance-only Ocean override, re-themed finance/app.html (colours, Day/Dusk follow, top bar no longer cut off), headings now Fredoka. Cache v62, test updated. Tests 372/372. Not pushed. – Claude chat
- 17/10/2026 – Set up Claude/Codex hand-off: Hand-off block in PROGRESS.md, rules in AGENTS.md, /carry-on and /save-progress (and $ versions) updated, guide at ~/AI Projects/_guides/5-Claude-and-Codex-Handoff.md. – Claude chat
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
