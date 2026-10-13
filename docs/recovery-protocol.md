# Account recovery coordination design

Status: design, not an implemented production capability. The production service has no operator recovery or maintenance endpoint. The existing isolated rehearsal proves PITR, undo and revision fencing only.

## Required boundary

Coordinate recovery per account in storage that is never restored with that account's document object. Do not use the shared Accounts directory as a PITR target, and do not rely on a maintenance flag inside the document snapshot: restoring that snapshot would also restore its old flag. The coordinator must retain operation identity, phase, target/undo bookmarks, approvals, code/schema identity and every issued revision ceiling across restarts and rollback.

A separate per-account coordinator is preferable to serializing document traffic through the shared Accounts directory. It avoids a global recovery bottleneck and keeps authentication recovery out of the document repair boundary. Introducing its Durable Object namespace, routing and persistent operation records requires a separate implementation and deployment review.

## Mutation coverage

All external document requests must select the coordinator from the authenticated account ID. Discard caller-provided maintenance, operation or revision headers. No direct document namespace path may remain reachable from the public Worker.

| Request                               | Final storage operation                           | Required behavior while suspended                                                                         |
| ------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| POST /api/documents                   | create                                            | Reject without allocating a document or quota                                                             |
| POST /api/documents/import            | create after asynchronous parsing                 | Reject even if parsing started before suspension                                                          |
| PATCH /api/documents/:id              | update, including rename, star, trash and restore | Reject without metadata, content or quota changes                                                         |
| DELETE /api/documents/:id             | permanent removal                                 | Reject without removing metadata or chunks                                                                |
| GET list, document, usage or export   | reads                                             | Serve during draining only; reject during restore/verification to avoid exposing an intermediate timeline |
| Account login/profile/password/logout | separate Accounts storage                         | Remain independent; never restore credentials as part of document recovery                                |

Checking a flag only at the outer HTTP handler is insufficient. Both request-body reads and Office parsing await before the synchronous repository mutation. Suspension can arrive during those awaits. Mutation admission must remain valid through the final repository transaction; restoration cannot start until every admitted operation has a durable, known outcome.

## State transitions

1. **Active:** issue a durable operation ID and reserve a revision ceiling outside document storage before allowing a mutation. Include creates and imports. Never reuse a reserved value after failure, deletion or undo. Reject allocation before exceeding the safe integer range.
2. **Draining:** persist the approved recovery operation and reject new mutation admissions. Wait for all previously admitted operations to have recorded outcomes. A timeout or coordinator restart is not evidence that an operation stopped. Do not expire an uncertain permit and proceed with recovery.
3. **Suspended:** reject document reads and writes. Capture the current snapshot/hash/counters and bookmark, and persist the exact target approval. Compare the account, object identity, operation ID and target again before scheduling PITR.
4. **Restoring:** schedule the approved target and persist the returned undo bookmark outside the target before restarting it. Keep traffic suspended through restarts and retries. Record completed phases so a retry cannot replace the original undo point.
5. **Verifying:** compare expected document identities, content, trash and quota. Advance revisions above the durable historical ceiling, persist the new ceiling externally, and verify stale updates and removals fail. Export any diagnostic evidence without credentials.
6. **Active after recovery:** resume only after verification is durably complete. Clients must reload; pending drafts must remain recoverable as local backups rather than being silently discarded or forced over restored content.
7. **Undo:** use the same suspended protocol and the preserved undo bookmark. Advance revisions above all values issued after recovery as well. Never restore coordinator history along with documents.

An interrupted or ambiguous operation remains suspended until its durable receipt is reconciled. Automatic lease expiry, time-based revision allocation and reading only the currently visible document maximum are not sufficient: deleted documents and abandoned timelines may have exposed higher revisions.

## Acceptance before production exposure

- Exercise every mutation route while suspended, including an import paused inside its asynchronous parser.
- Admit a mutation before suspension, delay its final transaction, and prove recovery cannot start until its outcome is known.
- Crash/restart at each durable phase, including after scheduling PITR but before restarting, and after fencing but before resume. Preserve the original undo point throughout retries.
- Restore a snapshot older than a permanently deleted high-revision document, then reject that abandoned timeline's revisions.
- Attempt stale update, rename, star, trash, restore and permanent deletion after recovery and after undo. Verify fresh edits still work.
- Deny ordinary users, unauthenticated requests, forged internal headers, cross-account targets, stale approvals and duplicate conflicting operations.
- Verify another account continues normally while one account is suspended.
- Run against isolated namespaces first. Customer restoration still requires approval of the exact account/object and target; generated fixtures do not authorize customer data changes.

Current prerequisite evidence: `tests/cloud-documents.test.ts`, `cloud/recovery-rehearsal.ts`, and `releases/cloudflare/recovery-result.json`. None of those establishes the coordinator or its crash-safety guarantees.

## Implemented admission bookkeeping (2026-10-14)

`cloud/write-admission.ts` now provides the SQLite-backed admission component for a future per-account coordinator. It reserves monotonically increasing revisions, permits one in-flight write, records suspension ownership, drains that write before recovery, and retains the revision ceiling when verification allows admission to reopen. A permit has no timeout-based expiry. Completion requires the exact pending token and reserved revision; it must be called only after a durable terminal document outcome is known, not unconditionally from a request's `finally` block.

`tests/write-admission.test.ts` covers draining, stale receipts, repeated suspension, conflicting recovery ownership, undo revision floors, account isolation, safe integer exhaustion, database close/reopen and an operation delayed across suspension. These are real SQLite component tests, not Worker route or remote process-crash acceptance. The caller still supplies the trusted receipt and verification decision; this component does not verify document-side receipts, approvals, bookmarks or recovered content itself.

The component is not bound to production or the remote rehearsal. Production routing, document mutation receipts/idempotency, use of reserved revisions by every mutation, existing-account initialization, operator authentication and recovery-phase journaling remain required. Simultaneous admissions currently receive a retryable rejection; a future coordinator must integrate client retry/backpressure without claiming that rejected edits were saved. No schema or binding was changed in production.
