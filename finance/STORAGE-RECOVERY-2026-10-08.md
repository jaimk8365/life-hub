# Finance durable storage follow-up

The first repair made recovery exports read-only and removed duplicated sync metadata from localStorage. It could not make an existing ledger above the import cap usable. A read-only device inspection identified transaction history and screenshot inbox attachments as the dominant localStorage consumers; transaction IDs were not duplicated. Deleting service-worker files does not resolve the small localStorage budget.

## Implementation

`bulk-storage.js` moves `fin_txns`, `fin_inbox`, record-version metadata and preserved sync conflicts to IndexedDB. Every existing record is copied without pruning, with a retained original checkpoint and exact read-back verification before removing the redundant localStorage copies. Account balances, opening balances and credentials remain unchanged by migration. New imports use the larger store; legacy browsers without it retain protective limits. The existing 730-day filter applies only to previously unseen imported history, never to existing records.

Finance waits for hydration before booting. Saves serialize under Web Locks; a durable journal coordinates small localStorage changes with the IndexedDB transaction. Failed writes roll back, interrupted writes recover at startup, and stale tabs or conflicting old-store writes stop rather than overwrite newer records. Pending/failed changes remain available for recovery. Bank imports await durable completion before reporting success or advancing their cursor.

Sync reads complete collections from the logical store and commits pulled records with version metadata. Full and encrypted exports read durable data without storage writes and retain original migration/journal evidence and pending edits. The independent recovery page does not initialize migration, importing or sync and reads a fresh snapshot on download. Both legacy and larger-store copies are included when there is a conflict.

The Finance page remains encrypted with the existing key. `tools/finance-bulk-patches.mjs` contains only guarded generic source replacements; `tools/build-finance-bulk-repair.mjs` applies them to the current encrypted page and verifies the encrypted round-trip. No private source, key, token, bank response or backup is committed. Service-worker v45 includes the new module.

## Validation

- 249 regression tests pass, including synthetic 8,047-record migration, 8,048-record save/sync/export, retained opening balances/tokens, IndexedDB aborts, localStorage quota errors, durable interrupted journals, stale tabs, concurrent sync edits and asynchronous import failure.
- Native WebKit browser: IndexedDB and Web Locks passed lossless migration, larger save, checkpoint retention, stale-tab rejection, read-only recovery with all localStorage writes blocked and deferred-runtime compatibility with importer eval.
- Modified inline scripts parse. Generated encrypted Finance decrypts to the exact guarded patch output; unchanged source outside those replacements is retained.

This verifies storage behavior, not the correctness or completeness of historical financial reconciliation. IndexedDB can still fill or be unavailable; those failures remain visible and fail closed. Keep encrypted exports outside the browser. After updating, use one current Finance tab while checking migration and reconnecting sync if the previously failed token save left no stored credential.
