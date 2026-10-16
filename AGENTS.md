# Life Hub (jaimi-hq)

## What this app is
- My personal "Command Centre" for running life and family admin.
- Used by me (and Matthew's shared profile). Daily use, so it must stay fast and simple.
- Sections include: Life Hub (calendar, tasks, email triage, Life OS), Planning, Finance, Kitchen, Kids, Wardrobe, Quests, Course.
- Co-Pilot is the daily front door: its source is ignored at `src/copilot.html`, its encrypted output is `copilot/index.html`, and its deterministic engine is in `copilot/`.

## Tech (read README.md for full detail — it is the source of truth)
- Multi-folder static web app hosted on GitHub Pages. Entry points:
  - Life Hub: `index.html`
  - My Finance: `finance/app.html`
  - Matthew: `partner/index.html`
- Personal sections are AES-256-GCM encrypted before reaching GitHub. Editable sources live in `src/` (gitignored).
- Never stage Co-Pilot's source or local config; only its encrypted `copilot/index.html` output is public.
- Build with the scripts in `tools/` (e.g. `node tools/build-hub.mjs ...`) — see README.md for the exact command per section.
- Build Co-Pilot with `node tools/build-copilot.mjs`; Claude briefs use `node tools/update-copilot-brief.mjs <brief.json>`. Co-Pilot uses `cp_*` sync keys and the existing Task Engine store.
- Data lives in browser localStorage per device, synced via `sync.js` / `partner-sync.js` to encrypted Gists.
- Tests: `node --test --test-reporter=./tests/quiet-reporter.mjs tests/*.test.mjs` — run before publishing.

## Safety rules (this repo is PUBLIC)
- NEVER commit or force-add `src/`, `.hub-key`, `.partner-key`, statements, backups or any plaintext personal data.
- NEVER use blanket staging (`git add -A` / `git add .`). Stage only the exact reviewed files.
- NEVER clear browser storage or a Gist, or change the passcode, without asking me first.
- Back up first, and pull remote changes right before committing.
- A push is not the same as deployed — check the GitHub Pages run finished.

## Rules
- Each section is its own area. When I ask about one section, only change that section.
- Don't rename sections, tabs, storage keys or IDs without asking. Other parts and sync depend on them.
- No paid APIs, no sign-ups, no tracking.
- Co-Pilot is deterministic and local; its existing encrypted Gist sync carries `cp_*` data. Reminders are read-only.
- After a change, tell me exactly which tab to open and what to click to check it.

## Design
- ADHD-friendly: big clear buttons, visible cues, minimal clutter, low friction.
- Match the existing colours and fonts (`theme-jaimi.css`).

## Start of every task
- Read PROGRESS.md first to see where we're up to.

## End of every task
- Update PROGRESS.md: date, what changed, anything broken, next step.
