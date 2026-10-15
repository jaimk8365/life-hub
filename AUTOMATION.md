# Life Hub conventional refresh

This replaces only the predictable calendar and reminder portion of the Claude refresh. It does not process finance screenshots, recipes, weekly planning, or make intelligent changes.

## How it works

- `tools/publish-reminders-snapshot.mjs` runs on Jaimi's Mac, reads Apple Reminders and uploads a separately encrypted `lifehub-reminders.enc.json` file to the existing Life Hub Gist.
- `tools/refresh-lifehub.mjs` runs in GitHub Actions, reads Google Calendar plus the latest encrypted reminder snapshot, decrypts the existing Hub and Planner pages in memory, updates only their feed data, then re-encrypts them.
- `.github/workflows/refresh-lifehub.yml` is deliberately **manual-only** during rollout. GitHub → Actions → Refresh Life Hub → Run workflow is the Run Now control.

Personal titles, locations and reminder text must never be printed in Actions logs. Only encrypted pages are committed to the public repository.

## One-time setup

1. On the Mac, confirm `gh auth status` works and run:
   `node tools/publish-reminders-snapshot.mjs --dry-run`
2. When the count looks reasonable, upload the first encrypted snapshot:
   `node tools/publish-reminders-snapshot.mjs`
3. Create a Google Cloud OAuth client with read-only Google Calendar access and obtain an offline refresh token.
4. Add these GitHub repository secrets: `HUB_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.
5. Use the manual Run workflow button and confirm the Hub and Planner decrypt correctly on a device.

## Cutover rule

Do not add an hourly `schedule` trigger until the active Claude hourly trigger has been identified, disabled, and observed through one former run boundary. Once verified, the intended Brisbane schedule is hourly from 6am through 10pm. Apple Reminders remain as fresh as the latest snapshot uploaded while the Mac was awake; Google Calendar can refresh with the Mac off.
