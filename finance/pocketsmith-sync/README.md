# PocketSmith secure sync bridge

This directory is deliberately safe to keep in the public Life Hub repository. **It contains no credentials or banking data.**

## Purpose

The Worker is the private boundary between PocketSmith and the browser Finance app:

NAB → PocketSmith → Worker → Finance app → summary-only Notion Money Hub

The PocketSmith developer key is never sent to the browser and must never be committed to Git.

## Required Worker secrets

Set these in the Cloudflare Worker dashboard as encrypted secrets:

- `POCKETSMITH_DEVELOPER_KEY` — the personal key created in PocketSmith.
- `APP_SYNC_TOKEN` — a separate long random value used only by the Finance app to authenticate to this bridge.

Set this non-secret Worker variable:

- `ALLOWED_ORIGIN` — the exact GitHub Pages origin for Life Hub (for example `https://jaimk8365.github.io`; verify the live origin before deployment).

Do not paste either secret into this repository, issues, pull requests, Actions logs or chat.

## Endpoints

- `GET /health` — verifies the PocketSmith key works without returning finance data.
- `GET /snapshot` — returns normalised accounts and transactions.
- `GET /snapshot?updated_since=<ISO8601>` — returns account balances plus only transactions changed since the supplied timestamp.

Both endpoints require `Authorization: Bearer <APP_SYNC_TOKEN>` and the configured browser Origin.

## Privacy design

- No PocketSmith key in GitHub Pages/browser JavaScript.
- No raw transaction files committed to GitHub.
- No account numbers, BSBs, credentials or security information are returned.
- Worker logging/observability is disabled in `wrangler.jsonc`.
- Responses use `Cache-Control: no-store`.
- The existing `finance/notion-sync-contract.json` remains authoritative: Notion receives summaries only, never raw transactions.

## Deployment

Cloudflare Workers hosts the secret-holding bridge. Its Git-connected production branch is `pocketsmith-secure-sync`, with the build root `/finance/pocketsmith-sync/`. Preview builds must use that same root and `npx wrangler preview`; the empty `previews` block in `wrangler.jsonc` enables them. The Previews Base has no bank-feed secrets, so previews cannot fetch a PocketSmith snapshot. Do not copy production secrets into previews.

The Finance client maps PocketSmith account IDs to existing Finance accounts and imports through its checked, deduplicated save path. Do not write directly into undocumented Finance localStorage structures.
