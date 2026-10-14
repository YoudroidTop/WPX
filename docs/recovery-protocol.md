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

## Atomic completion (2026-10-14)

`cloud/recovery-completion.ts` now reopens admission and marks the verified journal complete in the same coordinator transaction. It rejects unverified operations. If journal completion fails after admission was updated, the transaction rolls both changes back, retaining suspension and the verified record. Repeating an already completed operation returns that record without changing later admission state, including a newer pending write or recovery suspension. The isolated RPC surface no longer offers separate resume/journal-complete methods.

The remote rehearsal injects a completion-storage exception between those two updates, confirms suspension and verification remain, rejects a new admission, then completes normally. It also repeats completion while a fresh write is pending and verifies that permit remains intact. Worker `5a7aa833-6e5d-46cc-958e-8629314e6048` passed these checks and the existing restore/undo sequence. Evidence: `releases/cloudflare/recovery-completion-run.log`, `recovery-completion-deploy.log`, and `recovery-result.json`; the earlier result is preserved in `recovery-before-completion-result.json`. Seventeen related component tests, application/cloud type checks and formatting checks passed. The remote preview exited successfully.

This closes the admission/journal completion transaction gap described above. It does not resolve ambiguous PITR scheduling, operator authorization, account initialization or production request routing. All production bindings and customer data remain unchanged.

## Historical ceiling registration (2026-10-14)

`AccountWriteAdmission.registerHistoricalCeiling` persists a supplied historical revision ceiling only while the named operation exclusively owns drained admission. It retains the larger of the stored and supplied ceilings, making retries monotonic, and never reopens admission. Active accounts, pending writes, conflicting owners and invalid numeric values are rejected. SQLite close/reopen tests retain the ceiling and suspension; an exhausted ceiling cannot reopen through verification.

This is an initialization primitive, not a completed account migration. Before calling it, the private coordinator must fence **all legacy writers**, drain their outstanding operations, and obtain an authoritative highest-ever-issued revision including deleted documents and abandoned timelines. The existing production store does not yet retain that complete history. Reading its visible maximum or supplying zero must not be treated as proof that an existing account is safe. If history cannot be established, a separately designed epoch migration is required before production cutover. New coordinator construction still starts at zero; production routing must not expose that state for an existing account.

Validation: all 55 unit/API tests and cloud TypeScript validation passed. No production deployment, schema migration, binding change or remote initialization acceptance was performed. Operator authorization, ambiguous PITR reconciliation and request routing remain open.

## Fail-closed initialization (2026-10-14)

New coordinator construction now reports `uninitialized` and rejects admission, completion and suspension until the private caller explicitly initializes its historical ceiling. The ceiling and an immutable initialization receipt commit in one SQLite transaction. An exact retry returns without touching later permits, suspension or revision progression; a different ceiling conflicts. Legacy nonempty coordinator state without an initialization receipt is rejected for explicit migration rather than silently adopted.

This supersedes the previous paragraph's default-open construction behavior. It does not establish a trustworthy ceiling for an existing production account: complete historical evidence and fencing of legacy writers are still required. The initialization API is private and trusts its caller; supplying zero is justified only for a proven new account. No public endpoint or production binding exposes this component.

The isolated rehearsal driver now explicitly initializes its generated coordinator after verifying an admission rejection. This revised driver has type-checked but has not been deployed or run remotely; earlier remote results apply to the preceding implementation. All 58 unit/API tests pass, including SQLite-trigger failure injection proving atomic rollback, close/reopen persistence, retry behavior during a pending recovery, and rejection of legacy coordinator state. Cloud TypeScript validation passes.

## Remote initialization acceptance (2026-10-14)

The revised isolated rehearsal is now deployed as Worker version `7c70a2e4-bd23-414d-86c9-314843d02caa`. The generated coordinator rejects admission before initialization, retains that rejection after an actual restart, and retains its initialized active state and ceiling after a second restart. Repeating initialization while recovery drains a response-lost write leaves the entire admission state unchanged.

The full remote run also passed existing document-content/quota restore and undo comparisons, response-loss reconciliation, stale-permit rejection, durable journal checks and atomic completion failure/retry checks. Evidence: `releases/cloudflare/recovery-initialization-deploy.log`, `recovery-initialization-run.log`, and `recovery-result.json` with `initializationSurvivedRestart` and `initializationRetryPreservedPending` true. The prior result is preserved in `recovery-before-initialization-result.json`. Cloud type checking and formatting passed; the preview process exited successfully after teardown.

This supersedes the preceding statement that the revised driver had not run remotely. Only generated objects in the isolated namespace were used; production bindings and customer data were unchanged. Existing-account historical evidence, legacy-writer fencing, operator authorization, ambiguous PITR reconciliation and production request routing remain open.

## Durable mutation dispatch (2026-10-14)

`cloud/mutation-dispatch.ts` stores the normalized mutation command and reserved permit in one coordinator transaction. This closes a missing prerequisite for crash reconciliation: a permit alone could not reconstruct the input of a response-lost create/import after the HTTP request disappeared. Replay must use `pending()`'s persisted command, including generated sheet IDs, rather than reparsing or regenerating input. The command is removed atomically with admission completion only after a matching terminal receipt from the private document executor. Transport failures and unknown execution failures leave it pending. At most one command is retained per account; subsequent commands cannot replace it.

Parsing and request validation must complete before enqueue, which rechecks admission synchronously. Thus a parse that finishes after suspension cannot obtain a permit. A permit already enqueued before suspension retains its exact command until reconciliation. This class trusts validated internal commands and executor receipts; it is not a public request/authentication adapter.

Five SQLite component tests verify database close/reopen after response loss, exact replay without duplicate documents, caller mutation isolation, mismatched receipts, command/acknowledgement storage failure rollback, uninitialized/suspended rejection, and durable API rejection versus unknown storage failure. Large Unicode commands are split into rows of at most 400,000 UTF-8 bytes, preserving code points; partial chunk-write failure rolls back both chunks and admission. All 63 unit/API tests and cloud type checking pass. The component is not yet wired to HTTP or the remote rehearsal; the preceding remote result does not verify this new dispatch component. Production routing, transport response adaptation, authoritative migration evidence and operator authorization remain required.

## Remote durable dispatch acceptance (2026-10-14)

The isolated rehearsal now uses `AccountMutationDispatch` for enqueue and acknowledgement instead of manipulating permits directly. After an intentional commit-response loss and coordinator restart, the driver obtains the command from coordinator storage, compares it with the original and replays that stored command. Acknowledgement clears the durable command; initialization retry, restore, fresh write, undo and completion checks still pass.

Worker `dd095e31-0923-4745-8a3f-abcf46b7aa4f` passed the full remote run. `recovery-result.json` now includes `durableCommandSurvivedRestart: true`; prior evidence is preserved in `recovery-before-dispatch-result.json`. Logs: `releases/cloudflare/recovery-dispatch-deploy-fixed.log`, `recovery-dispatch-run.log`, and `recovery-dispatch-tests.log`. All 63 unit/API tests, cloud types and formatting passed; the remote preview exited successfully.

The first integration exposed a TypeScript RPC serialization mismatch for rich-text attributes typed as unknown. The private rehearsal transport now carries the persisted command as JSON and reconstructs it only at the trusted executor boundary. The initial isolated deployment `e6021c96-9e04-4fed-9658-9a97d7da1a53` was superseded before running the rehearsal. This is not a validated public HTTP adapter, and the remote fixtures do not establish maximum-size command transport acceptance. Production bindings, routing and customer data remain unchanged.

## Maximum-content remote dispatch acceptance (2026-10-14)

Worker `74a0e8e4-ef09-4ba5-8e6f-6d01b83d6f48` passed an additional generated-account dispatch scenario with an exact 4,000,000-byte schema-valid Word body containing Chinese text and emoji. After committing and intentionally losing the response, a real coordinator restart retains the exact command. Replay returns the existing receipt, preserves the complete document snapshot and used-byte count, and the stored content SHA-256 matches the original command. A 4,000,001-byte body receives a durable 413 rejection; replaying that rejection and acknowledging it leaves the original snapshot unchanged and clears pending dispatch.

The existing full restore/undo rehearsal also passes. Evidence: `releases/cloudflare/recovery-large-deploy-final.log`, `recovery-large-run.log`, and `recovery-result.json` (`largeDispatch.passed: true`). The previous result is preserved in `recovery-before-large-result.json`. Cloud TypeScript and formatting checks passed; preview teardown completed with exit 0. These are internal JSON RPC transport and storage checks, not public HTTP import/body-limit or production routing acceptance. Production bindings and customer data were unchanged.

## Shared HTTP mutation parsing (2026-10-14)

`cloud/document-mutations.ts` now normalizes POST create/import, PATCH content/rename/star/trash/restore, and DELETE into the executor's mutation union. `cloud/request-body.ts` retains bounded streaming reads. The existing Worker uses this shared parser while preserving its response shapes and current direct repository execution; production coordinator routing is still not enabled. A future coordinator must enqueue only after parsing completes and must not treat a parsed command as an admission grant.

New tests cover every mutation shape, ignored forged permit headers, mismatched document types, real ZDOC conversion, malformed/empty imports, streaming length enforcement and an import deliberately paused inside its asynchronous parser while admission is suspended. That delayed import cannot enqueue or advance the revision ceiling. All 67 unit/API tests, application/cloud type checks and formatting pass.

Local workerd integration passed account isolation, CSRF, optimistic revisions, all three Office round trips, trash quota, password rotation and logout. The initial local run using the production custom-domain configuration failed origin validation before document handling; an isolated local configuration with no production route resolved the test setup without relaxing application validation. Evidence: `releases/cloudflare/http-adapter-tests.log`, `http-adapter-integration.log`, and `http-adapter-local.json`. The local server was stopped. No production deployment was performed.

## Coordinated HTTP response adapter (2026-10-14)

`cloud/coordinated-mutations.ts` connects parsed HTTP mutations to durable dispatch and the private document transport. It verifies receipt identity, reads the complete document while the permit is still pending, checks every receipt-summary field against readback, and only then acknowledges and returns the existing 201/200 document or empty 204 deletion contract. Known executor rejections retain their original status/message and are acknowledged. Unknown execution/readback/serialization failures leave the exact command pending for explicit reconciliation. A second write while one is pending receives retryable 503 rather than a generic internal error.

Four new component tests use separate real SQLite coordinator/document databases and cover full-document create/update, rename/star/trash/restore/removal responses, committed response loss, readback failure, mismatched revision/receipt, duplicate-write rejection while pending, and durable 409 response handling. All 71 unit/API tests, application/cloud types and formatting passed. Evidence: `releases/cloudflare/coordinated-http-tests.log`.

This adapter is not yet instantiated by production or remote rehearsal routes. Account authentication/target selection, scheduling reconciliation after restart, read-side isolation, and transport wiring remain the outer coordinator's responsibility. It reconciles coordinator-to-document response loss; it does not establish end-to-end client request idempotency after acknowledgement but before HTTP delivery. No production deployment was performed.

## Remote coordinated HTTP acceptance (2026-10-14)

The isolated rehearsal now instantiates `CoordinatedMutations` behind private RPC methods carrying real HTTP Request/Response objects. Generated coordinator/document objects exercise Word/sheet/slide creation, full-document readback, rename/star/content updates, trash/restore, permanent deletion, stale revision 409, and a Unicode-named ZDOC import. Uninitialized and suspended writes return 503. A simulated response loss after commit followed by coordinator restart is explicitly reconciled to the original full-document 201 response without a duplicate document, while recovery remains suspended.

Worker `a073929e-3563-44f6-8e64-0385bf4d9dc3` passed the new HTTP scenario and the existing restore/undo and maximum-content scenarios. Evidence: `releases/cloudflare/recovery-http-deploy.log`, `recovery-http-run.log`, `recovery-http-tests.log`, and `recovery-result.json` (`httpMutations.passed: true`). Earlier results are preserved in `recovery-before-http-result.json`. All 71 unit/API tests, cloud types and formatting passed. The remote preview exited after teardown.

This validates the adapter and private transport together, not public authentication, production account-to-object selection, read isolation or automatic restart scheduling. Fixture methods accept generated object IDs only within the isolated namespace; they must not be copied into a public production interface. Production bindings and customer data were not changed.

## Read response isolation (2026-10-14)

`cloud/coordinated-reads.ts` fences a complete read response using the non-restored admission state. Only active or draining accounts begin storage reads. After awaiting both the storage response and its entire body, it compares phase, revision ceiling, pending permit and recovery owner with their initial values; any change returns a retryable 503 instead of the possibly stale response. Buffering before the final check prevents a lazy response body from continuing past that check. Uninitialized/suspended accounts do not call the supplied storage loader.

Four SQLite component tests cover active/draining response bytes and headers, suspension and resume during a slow read, completion of an in-flight write, export-body streaming across draining completion, revision changes and another account remaining available. All 75 unit/API tests, cloud types and formatting pass. Evidence: `releases/cloudflare/coordinated-read-tests.log`.

This primitive is not yet wired to HTTP list/document/usage/export routes or deployed remotely. It intentionally rejects reads overlapping changes even if some could have returned a consistent snapshot; callers should retry. Storage responses must remain within application size/memory bounds because the body is materialized. It does not revoke a response already completed before recovery began, and does not substitute for account authentication, target selection or operator authorization. Production behavior remains unchanged.

## Shared read routes and remote isolation acceptance (2026-10-14)

`cloud/document-reads.ts` now owns GET list, document, usage and native/Office export responses. The existing Worker reuses it without enabling coordinator routing. The isolated coordinator wraps the same handler's private transport with `CoordinatedReads`, so all supported read routes use the same response fence.

Worker `fe3bc567-12d1-4273-9f42-f7a37071d8d0` passed list/document/usage, native backup equality, and all three Office export responses (attachment headers and ZIP signatures). Reads remain available while draining and every tested route returns 503 after the outstanding write is reconciled and admission becomes suspended. Existing HTTP writes, response-loss restart reconciliation, 4 MB boundary and PITR/undo scenarios still pass. This remote run validates route coverage and phase blocking; the deliberately delayed/streaming transition races remain covered by the component tests, not claimed as remote race coverage.

All 75 unit/API tests, cloud types and formatting passed. Local workerd integration also passed accounts, isolation, CSRF, revisions, three Office round trips, trash quota, password rotation and logout. Evidence: `releases/cloudflare/recovery-reads-{deploy,run,tests,local-integration}.log` and `recovery-result.json`; the previous result is preserved in `recovery-before-reads-result.json`. The local server and remote preview were stopped. Production bindings and deployed behavior remain unchanged.

## Immutable account target binding (2026-10-14)

`cloud/coordinator-target.ts` durably binds one coordinator to one account ID and document object ID. Exact retries are harmless; changing either identity conflicts. Requiring another account or using an unbound coordinator fails closed. The isolated HTTP fixture atomically binds its generated target and initializes admission. Subsequent read/write/reconcile RPCs carry the trusted account identity, not a replaceable document object ID; they resolve the stored target before transport.

Worker `8e3990c9-672b-42c6-b182-518224f5ac12` passed unbound rejection, conflicting target rejection, wrong-account rejection and the full HTTP/restart/read-isolation/4 MB/PITR rehearsal. All 78 unit/API tests, cloud types and formatting passed, including target binding across SQLite close/reopen and independent account storage. Evidence: `releases/cloudflare/recovery-target-{tests,deploy,run}.log`, `recovery-result.json`; the previous result is preserved in `recovery-before-target-result.json`. Preview teardown completed.

This establishes immutable internal targeting, not authentication or proof that an existing production account is new. Production bootstrap still needs account-directory evidence and a reviewed migration path. Also, the current public Worker obtains document usage while constructing login/profile responses: directly replacing that usage read with a suspended coordinator would prevent successful account responses from reaching clients. Resolve that account/usage contract before production cutover rather than bypassing read isolation. No production binding or deployment changed.

## Session preservation on usage failure (2026-10-14)

`cloud/account-usage-response.ts` fixes a failure already present in the account response path: successful registration or login could commit a new session, then lose its Set-Cookie header when document usage failed. Password rotation already returns 204 with its cookie before usage is read, so it is not affected by this defect. The Worker now preserves the trusted authentication cookie on usage rejection or transport/JSON failure, while returning an error rather than inventing usage. A cookie supplied by the document service is discarded. Successful responses retain their existing status and account/usage JSON shape.

Four regression tests cover 200/201 success, usage 503 with retry headers, transport/malformed-response failure and cookie provenance. All 82 unit/API tests, application/cloud type checks and formatting passed. Local workerd account/isolation/CSRF/revision/Office/trash/password/logout integration passed and the server was stopped. Evidence: `releases/cloudflare/account-usage-tests.log` and `account-usage-integration.log`.

This prevents loss of a committed session but does not yet make the complete login/profile UI available while usage is suspended: the response still reports storage unavailability, and the client can retry with the preserved session. A separately reviewed account/usage availability contract remains required before coordinator production cutover. No production deployment was performed.

## Production session-fix release (2026-10-14)

The shared request/read handlers and session-cookie preservation helper are now deployed as production Worker `151776aa-dbd9-4782-b217-05776fb9d27f` (100% traffic). Production API and browser smoke passed; see `docs/cloudflare.md` for evidence and rollback. This supersedes the earlier undeployed status of those handlers only. Coordinator/recovery components, bindings and routing remain isolated. The earlier password-rotation defect claim was corrected: that route already returns 204 before usage, while registration/login were exposed to the missing-cookie failure.

## Concurrent reconciliation acceptance (2026-10-14)

Overlapping HTTP execution and reconciliation previously executed/read/acknowledged the same persisted permit independently. A deterministic SQLite regression reproduced a second acknowledgement failing after the first had already cleared the durable command. `CoordinatedMutations` now shares one execution promise per permit through an account-scoped `MutationFlight` holder. Every caller receives an independent response clone; terminal completion acknowledges once. Failure clears only the in-memory flight and leaves the exact durable command pending for later retry. Each account coordinator must retain and share the holder across its request and reconciliation adapters; it is not a cross-account cache or a replacement for durable receipts.

Two new tests cover concurrent request/reconciliation responses, draining suspension, a shared committed-response loss, retained pending command, retry and subsequent new writes. All 85 unit/API tests passed. Application/cloud type checks and formatting passed after replacing an unsupported test-only `Promise.withResolvers` helper with a compatible deferred promise.

Isolated Worker `6726ce28-61d6-44fe-8a95-a5152396f587` passed the complete remote restore/undo, 4 MB and HTTP rehearsal. After a committed response loss and coordinator restart, two adapters deterministically enter reconciliation before awaiting private transport; both return the same complete document independently, without duplication, and suspension remains in force. Evidence: `releases/cloudflare/coordinated-flight-before.log`, `coordinated-flight-tests.log`, `recovery-flight-deploy.log`, `recovery-flight-run-proxy.log` and `recovery-result.json` (`httpMutations.concurrentReconciliation: true`). The previous remote result is preserved as `recovery-before-flight-result.json`. The first preview attempt failed at network connection before the rehearsal; using the system's existing proxy resolved it, and preview teardown exited successfully.

This closes overlapping execution for adapters sharing a coordinator-owned holder. Automatic restart scheduling, authenticated production routing/bootstrap, operator authorization and ambiguous PITR reconciliation remain open. No production bindings, migrations, customer data or public routes changed.

## Automatic pending-mutation reconciliation (2026-10-14)

`ScheduledMutations` wraps durable dispatch in an asynchronous SQLite transaction that includes the account's alarm. Enqueue commits the permit, command, retry ownership and initial alarm together. Terminal acknowledgement clears the command, retry row and alarm together. SQL or alarm failures roll back the entire operation. This uses the documented [SQLite storage transaction contract](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#transaction), not `transactionSync` around asynchronous alarm writes. The component exclusively owns its account coordinator's alarm and must not share it with an unrelated scheduler.

Before any replay transport, `prepareRetry` durably schedules the next attempt. Delays double from the default five-second initial delay to a one-minute cap; the counter is bounded. Unknown execution failures leave admission and command pending. A known terminal receipt completes normally; existing recovery suspension is preserved. A stale alarm with no pending command clears itself. Missing or mismatched retry ownership fails closed and requires explicit legacy migration. The [platform's finite automatic retries](https://developers.cloudflare.com/durable-objects/api/alarms/) are not used as the application's only retry mechanism.

Four new SQLite tests verify initial scheduling rollback, acknowledgement/cancellation rollback, suspension, close/reopen persistence, ten successive bounded retries, retry-write rollback and unscheduled legacy rejection. Account identity lookup used by the alarm is derived from the immutable coordinator binding and is covered before/after reopening. All 89 unit/API tests, application/cloud types and scoped formatting checks passed.

Isolated Worker `c6d924b9-b3db-4e90-8934-da4b962788ee` passed a real alarm rehearsal. An injected failure after setting the initial alarm rolled back both SQL admission and alarm, leaving the data object empty. A subsequent write committed then lost its response; the coordinator was suspended and restarted. Its first two alarm attempts failed intentionally, then a later alarm replayed the persisted command and acknowledged it without creating a duplicate document. The driver only observed status; it never invoked alarm or reconciliation. The final state retained suspension, had no pending command and no alarm. The fixture uses a two-second initial/four-second capped interval to bound test duration. Existing restore/undo, 4 MB, HTTP concurrency and read-isolation scenarios also passed.

Evidence: `releases/cloudflare/recovery-scheduling-{tests,deploy,run}.log`, `recovery-result.json` (`scheduledMutations.passed: true`); previous result preserved as `recovery-before-scheduling-result.json`. Remote preview teardown exited successfully. The alarm handler and injected failures are confined to the generated-fixture namespace. This establishes automatic mutation reconciliation in isolation, not automatic PITR orchestration or production routing. Existing-account bootstrap/migration, operator authorization, ambiguous restore resolution and end-to-end client request idempotency remain open. Production bindings, schema and customer data were unchanged.
