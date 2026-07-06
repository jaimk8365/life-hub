# Jaimi's Life Hub

One calm app, three sections, installable on iPhone / iPad / Mac:

| Section | What it is | Source of truth |
|---|---|---|
| 🏡 **Life Hub** | Daily HQ — calendar, tasks, email triage, Life OS | `/Users/jaimikyte/Desktop/jaimi-hq.html`, encrypted into `hub/index.html` |
| 🌙 **Quests** | Night Court Questkeeper | built from `~/NightCourtQuestkeeper` (`npm run build` → copy `dist/` into `quest/`) |
| 🌱 **Course** | "Steady" — 6-week ADHD course | `src/course.html` (gitignored), encrypted into `course/index.html` |

## Privacy

This repo is public (GitHub Pages requires it on the free plan), so the two personal sections —
the Life Hub dashboard (calendar/email data) and the Steady course (personalised content) — are
**AES-256-GCM encrypted** behind a passcode before they ever reach GitHub. The passcode lives in
`.hub-key` (gitignored, never committed); unlocking once covers both sections on that device.
Questkeeper contains no personal data. Anything typed into any section stays in the browser's
localStorage on each device.

To rebuild the course after editing its source: `node tools/build-hub.mjs src/course.html course/index.html`

## Refreshing (Claude does this on "refresh my hub")

1. Update `/Users/jaimikyte/Desktop/jaimi-hq.html` as usual (LIVE snapshot + both synced-at consts).
2. `cd ~/LifeHub && node tools/build-hub.mjs` — re-encrypts the fresh copy into `hub/index.html`.
3. `git add -A && git commit -m "refresh hub data" && git push` — GitHub Pages redeploys in ~1 min.

To change the passcode: overwrite `.hub-key`, rebuild (step 2), push — and re-enter it once per device.

## Install as an app

Open the GitHub Pages URL, then:
- **iPhone / iPad (Safari):** Share → *Add to Home Screen*
- **Mac (Safari):** File → *Add to Dock* &nbsp;·&nbsp; **Mac (Chrome):** ⋮ → *Cast, save and share* → *Install page as app*
