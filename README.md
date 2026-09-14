# Jaimi's Life Hub

Life Hub and Finance have separate app entry points, with the existing encrypted data and sync retained.

- Life Hub: `index.html`.
- My Finance: `finance/app.html` (its own install manifest; opens the encrypted `finance/index.html`).
- Matthew: `partner/index.html` (existing separate household profile).

The Finance separation is navigation and installation separation on the same origin, not a new database or independently secured storage vault. Existing browser storage keys, passcodes and Gists are unchanged. New device or home-screen installations may need their own one-time sync setup. Do not clear storage to make the new app appear.

Core Life Hub sections:

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

## Device sync

`sync.js` (loaded by the shell) mirrors three localStorage keys — `steady_*` (course),
`nightcourt-*` (Questkeeper), `hq_*` (hub cleaning edits) — into ONE secret GitHub Gist
(`lifehub-sync.enc.json`), **encrypted on-device with the hub passcode** (PBKDF2 300k +
AES-256-GCM) so GitHub only stores ciphertext. Setup per device via the Sync button: paste a
classic PAT with only the `gist` scope (create at
github.com/settings/tokens/new?scopes=gist&description=Life%20Hub%20sync). The token lives in
that device's localStorage; revoking it on GitHub kills sync everywhere it was used.
Conflicts are last-write-wins per key. Pulls happen on app open/foreground + every 60s;
pushes ~2.5s after an edit. Passcode changes require a backed-up, tested re-encryption
migration across devices. Do not clear a Gist or browser storage to change a password.

Finance's private device sync runs in `finance/app.html`, using the same engine as Life Hub.
Matthew's permitted shared data uses `partner-sync.js`. Shared budget projections exclude
private funding accounts; old encrypted Gist revisions and data already downloaded to a
device are not erased by a UI filter. This is not a claim of independent cryptographic vaults.

## Finance source and safe release

Editable personal sources are `src/finance.html` and `src/partner-finance.html`, both ignored
by Git. Never force-add `src`, key files, uploaded statements or plaintext backups.
Build Finance with `node tools/build-hub.mjs src/finance.html finance/index.html` and Matthew
with `node tools/build-partner.mjs`. Run `node --test --test-reporter=./tests/quiet-reporter.mjs tests/*.test.mjs`
before publishing. The quiet reporter avoids printing private HTML in failed assertion output.

Back up first, pull remote changes immediately before committing, and stage only the exact
reviewed release files. Preserve newer reminder feeds. `node tools/build-page-repairs.mjs`
applies idempotent code repairs to the latest encrypted Hub/Planner pages without rebuilding
them from an older desktop data snapshot. The separate Wealth Coach brief is not implemented
by the Finance launcher; external AI access must be approved before transmitting financial data.

## Refreshing (Claude does this on "refresh my hub")

1. Update `/Users/jaimikyte/Desktop/jaimi-hq.html` as usual (LIVE snapshot + both synced-at consts).
2. `cd ~/LifeHub && node tools/build-hub.mjs` — re-encrypts the fresh copy into `hub/index.html`.
3. Test the updated encrypted output, pull and preserve newer remote work, then stage only
   `hub/index.html`, commit and push. Verify the GitHub Pages run and live result; do not
   assume a push means deployment has completed. Never use blanket staging for this repository.

To change the passcode: overwrite `.hub-key`, rebuild (step 2), push — and re-enter it once per device.

## Install as an app

Open the GitHub Pages URL, then:
- **iPhone / iPad (Safari):** Share → *Add to Home Screen*
- **Mac (Safari):** File → *Add to Dock* &nbsp;·&nbsp; **Mac (Chrome):** ⋮ → *Cast, save and share* → *Install page as app*
