# Finance storage exhaustion: audit and recovery

## Confirmed from production code

- Finance, partner data and the other Life Hub applications share the origin's localStorage quota. A failure does not establish that the computer's disk is full.
- `PocketSmithFinance` retains its raw snapshot only in memory. The worker can return up to 40 pages of 1,000 transactions; the importer previously kept every accepted transaction indefinitely in `fin_txns`. Stable external IDs prevent ordinary repeat imports from adding the same ID twice. Old duplicate rows are not automatically removed.
- `lifehub_record_versions_v1` duplicates per-record hashes, ancestry, timestamps and deletion tombstones alongside Finance data. Tombstones have no expiry. This is required sync state, not safe-to-delete cache data.
- Recovery export previously called `localMap()`, which wrote versions and metadata. Consequently, trying to back up could itself fail at quota.
- `saveAtomic` journals complete previous values in sessionStorage with a marker in localStorage (and falls back to localStorage if sessionStorage is unavailable). The ledger plus the rollback copy requires temporary headroom; the old rollback order could fail after another key had grown. A tab-only journal is not a durable cross-tab backup.
- Conflict alternatives are already limited to 100 per merged collection, but an alternative can contain a large attachment. Budget history is unbounded; goal attachments and tax receipts store base64 files within localStorage, with per-file rather than total limits. These are additional potential contributors, not measured causes on this device.
- The service worker previously cached every successful same-origin GET including query variants and other applications' paths. Cache Storage has different accounting from localStorage; deleting app caches is not a reliable fix for Web Storage exhaustion. API calls to GitHub/PocketSmith are not cached by this worker.
- Connecting a valid GitHub token previously deleted it if a subsequent sync failed for any reason, including quota.

## Implemented safeguards

- Read-only encrypted recovery export. Saved records and the live ledger are preserved separately, with conflict and interrupted-save evidence. No new token is required if one remains saved.
- Separate `finance/recovery.html` page can inspect sizes and export the saved local copy without running Finance, starting sync, importing bank data or refreshing the old tab. Size/count output contains no record contents or credentials. It cannot recover another tab's unsaved memory or tab-only journal.
- Verified, lossless migration of sync record versions to IndexedDB. Legacy metadata remains on failure; only an identical verified duplicate is removed. Tombstones survive reloads and older-tab metadata. No Finance records, balances or credentials are removed. An unreadable archive stops sync rather than silently discarding version history.
- Previously unseen bank history is limited to two years, 5,000 total linked bank records and a 2,000,000-character ledger growth ceiling. Existing history is retained, including manual edits; old linked transactions can still be updated. Exceeding a cap stops the import atomically, without moving its success cursor. These are safety limits, not an automatic history archival system: a legacy ledger already above the cap may need a separate larger-store migration before further growth.
- Unchanged atomic saves do not write; shrinking replacements happen first; failed rollback retains its journal. Valid Gist credentials survive subsequent sync failures.
- Cache version v44 scopes interception to Life Hub and does not persist query variants. Existing encrypted pages and network-first/offline fallback remain supported.

## Verification

233 Node regression tests passed, including quota failures, failed migration/readback, encryption round-trip, token retention, duplicate imports, rollback failures and record preservation. A browser test with native IndexedDB and synthetic storage also passed migration, tombstone preservation and encrypted export with all localStorage writes rejected.

The encrypted Finance page was rebuilt from the current encrypted page, with decrypted output verified against the intended narrow patch. `tools/build-finance-storage-repair.mjs` reproduces the change without publishing private source data.

## Recovery and release boundaries

Open the separate recovery page, inspect the largest saved collections, and save an encrypted backup before refreshing the original Finance tab. Preserve the original tab until any unsaved records and its recovery journal have been accounted for. Do not clear browser data, disconnect PocketSmith or rotate credentials to fix storage capacity.

Code-level causes and safeguards are verified. Actual device key sizes, a real saved backup, and successful live PocketSmith/Gist sync must be verified separately. A missing token that was already deleted by the old code cannot be reconstructed from Finance records.

Rollback: reverting code does not require deleting user data. Keep the IndexedDB archive; an old sync build does not understand it. Restore archived metadata only via a verified recovery operation with sufficient headroom, never by clearing it.

References: [MDN storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/).
