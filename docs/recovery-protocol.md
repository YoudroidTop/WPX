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

The component is not bound to production. Its subsequent isolated remote integration is recorded below. Production routing, document mutation receipts/idempotency, use of reserved revisions by every mutation, existing-account initialization, operator authentication and recovery-phase journaling remain required. Simultaneous admissions currently receive a retryable rejection; a future coordinator must integrate client retry/backpressure without claiming that rejected edits were saved. No schema or binding was changed in production.

## Implemented document receipts (2026-10-14)

`cloud/mutation-executor.ts` adds a private, synchronous transaction executor for coordinator-admitted create/import, update and permanent removal commands. A successful transaction commits document metadata/chunks and one bounded receipt together. It uses the externally reserved revision and stores document summaries rather than duplicating content in receipt storage. Replaying the same permit and command returns the receipt; changed input, obsolete revisions and receipts behind current document revisions are rejected. A known API rejection is recorded after rolling back the mutation. Unknown or storage failures propagate without a successful receipt and must leave admission pending.

The one-receipt design relies on the coordinator's single outstanding permit. Do not mix this executor with unfenced writes. Do not route abandoned pre-recovery permits back to it: restored receipt history is not an external recovery epoch, especially when no documents remain. Existing-account initialization and the external revision ceiling are still mandatory. HTTP adapters will need to translate summary receipts into the existing response contract and retrieve content where required; no client response format was changed here.

`tests/mutation-executor.test.ts` verifies response-loss replay without duplicate quota/documents, update/trash/removal replay, durable quota rejection, stale permit rejection, rollback on receipt-storage failure, and admission remaining suspended until a retried operation has a known outcome. These SQLite component tests do not establish remote transport, production routing, authorization or whole-protocol crash safety. The executor is not bound to production. Its subsequent isolated remote integration is recorded below.

## Remote coordination rehearsal (2026-10-14)

`cloud/recovery-coordination-rehearsal.ts` now runs the two components against distinct generated Durable Objects in the existing isolated rehearsal namespace. One object stores documents/receipts; the other stores admission state and is never restored. No production binding, namespace migration, public endpoint or account data was changed.

The remote run on rehearsal Worker `9887e400-60b1-4a0b-a270-5625e32f7cad` passed: a fixture commits then intentionally throws instead of returning its receipt; suspension and a real coordinator restart retain the pending permit; replay returns the stored receipt without creating a third document; recovery cannot drain until that outcome is acknowledged. Actual document PITR leaves coordinator state suspended and its ceiling intact. Fencing rejects the abandoned permit, a new write succeeds at revision 4, and undo preserves the external ceiling and rejects that new timeline's stale permit. A final coordinator restart retains active status, no pending write and ceiling 5. The original full-content/hash/quota restore and undo checks also still pass.

The first two attempts failed because the fixture rebuilt a blank spreadsheet with a different generated sheet ID on replay. Fixing the fixture to reuse its exact command allowed the remote run to pass; the fingerprint check was correctly rejecting changed input. Evidence: `releases/cloudflare/recovery-coordination-fixed-run.log`, `recovery-coordination-deploy-fixed.log`, and `recovery-result.json`. Earlier evidence remains in `recovery-before-coordination-result.json`. Eleven component tests and cloud TypeScript validation passed. Preview and diagnostic tail processes were stopped.

This proves the scripted fixture flow and the tested coordinator restart points. That run held bookmarks and orchestration steps in driver memory; the later journal integration below adds durable records without claiming automatic crash recovery. Operator authorization, durable recovery-phase journaling, initialization of existing accounts, HTTP request routing and real import/request cancellation races remain unimplemented or unverified.

## Durable recovery journal and remote verification (2026-10-14)

`cloud/recovery-journal.ts` persists immutable operation identity (account/object, approval reference, code/schema identity, target and before bookmarks, expected/before snapshot summaries and historical revision ceiling) outside document storage. Its phases are prepared, scheduling, scheduled, restored, verified and complete. Only one unfinished recovery can exist per coordinator. A conflicting retry cannot replace the target or original undo bookmark. Verification compares the target snapshot summary and requires a safely advanced revision before completion.

Scheduling intent is persisted **before** invoking PITR. Only the first `startScheduling` call succeeds. A coordinator found in scheduling after an interrupted call cannot assume PITR did not run and cannot blindly issue it again. The before bookmark remains available for investigation. This intentionally fails closed; automatic reconciliation of an ambiguous schedule is not implemented. An approval reference is audit metadata, not authorization enforcement.

The isolated remote rehearsal now stores both restore and undo records, restarts the coordinator during scheduling and after persisting undo, and reads the stored original undo bookmark for the undo operation. Rehearsal Worker `f397136a-1f78-40ff-bd52-61464ca58e58` passed the full existing content/counter and stale-write checks plus journal persistence and original-undo preservation. The live driver retained knowledge that PITR had not yet been called during its intentional scheduling restart; this does not simulate an independently restarted driver resolving an ambiguous RPC.

Evidence: `releases/cloudflare/recovery-journal-run.log`, `recovery-journal-deploy.log`, and `recovery-result.json`. The previous result is retained in `recovery-before-journal-result.json`. Fourteen component tests pass, including SQLite close/reopen at every journal phase, immutable ownership, no phase skipping, snapshot mismatch and unsafe revision rejection. Application/cloud type checks and formatting checks pass. The remote preview shut down successfully.

Production remains unchanged. Remaining integration includes operator authentication/approval checks, existing-account initialization, request routing, snapshot evidence validation at the transport boundary, and atomic reconciliation of admission reopening with journal completion. The component methods trust the private coordinator caller; they do not themselves prove recovered content or replace the operator's approval. Do not expose them directly through public HTTP.
