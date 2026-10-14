# Cloudflare deployment

## Target

The public service is `https://wpx.youdroid.top`. WPX-4 tracks deployment and live acceptance. The local Express service remains supported. `cloud/worker.ts` supplies the Cloudflare entry point and two SQLite Durable Object classes.

## Storage design

Use a SQLite-backed Durable Object per account. The authenticated Worker selects the object using the account ID; callers must never select an arbitrary object through a request parameter. The Accounts directory stores credentials, hashed sessions, and per-IP authentication attempt counters separately from document bodies. A document mutation runs its quota check, revision check, metadata change, and body write in one `storage.transactionSync` callback with no asynchronous work inside it.

`cloud/documents.ts` implements the account-local document repository against a minimal synchronous SQL interface. Metadata includes the UTF-8 serialized content size. Bodies are stored as ordered 512,000-byte BLOB chunks and reconstructed before parsing. This preserves the existing 4 MB document limit despite Cloudflare's 2 MB SQLite row limit. The public document JSON and revision protocol are unchanged. Trash counts toward the exact 3,000,000,000-byte quota until permanent deletion.

The [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/) specify 10 GB per SQLite object on Workers Paid and 1 GB on Free. Production must verify a compatible existing account plan before claiming a usable 3 GB allowance. Do not silently lower the product quota to fit an infrastructure limit. Subscription changes require a separate decision if the existing account is insufficient.

The repository accepts only already validated document models. The HTTP boundary must enforce `contentSchema`, names, revisions, bounded request bodies, authentication, origin checks, rate limits, and error handling. The Documents Durable Object supplies the native SQL adapter and transactionSync callback. A local workerd integration suite verifies this path independently from the local SQLite unit tests.

## Verification so far

- Large Unicode documents round-trip across multiple chunks; each chunk stays below the SQLite row limit.
- Account-local stores do not expose each other's document IDs.
- Exact-byte quota includes trash; stale revisions cannot rename or overwrite content.
- Injected chunk insertion failure rolls back both updates and creates, including metadata and quota.
- Existing API/model tests and the production web build pass after extracting a runtime-neutral API error class. Office conversion no longer imports the Node SQLite store indirectly.

## Local runtime checks

```sh
npm run cloud:build
npm run cloud:dev
# In a second terminal, against the local service only:
npm run test:cloud
# This command starts an isolated workerd instance automatically:
npm run test:cloud:browser
```

The HTTP integration suite verifies registration, failed login, account isolation, cross-origin rejection, one-winner concurrent writes, DOCX/XLSX/PPTX export/import, trash accounting and deletion, profile changes, password rotation with prior-session invalidation, logout, and a Unicode document larger than 2 MB. The browser suite reuses the five existing editor/workspace scenarios against workerd and SQLite Durable Objects. Test storage is ignored by Git.

Office ZIP validation uses JSZip's chunk stream rather than its Node-only stream adapter so expansion limits also apply in Workers. Empty spreadsheet exports tolerate ExcelJS's null columns collection.

`wrangler.jsonc` defines bindings, initial SQLite class creation and the target Origin. The verified custom domain is configured as a Worker route. The dry-run bundle is approximately 784 KiB compressed.

The local checks do not constitute deployment evidence. The production deployment and remaining recovery work are recorded below.

## First production deployment — 2026-10-13

- Service: `https://wpx.youdroid.top`.
- Worker version: `ef808837-acc9-40fe-8236-ca260e847641`, 100% traffic confirmed by `wrangler deployments list`.
- Account preflight: the Workers Standard API returned `standard: true`; zone active; no existing target Worker or custom-domain binding. Billing subscriptions and raw DNS record listing were not available to the OAuth scope. No subscription or existing DNS record was manually changed.
- Custom-domain deployment succeeded without an overwrite prompt. Public DNS returned Cloudflare A records; authenticated HTTPS API and browser checks passed on the custom hostname.
- The local resolver initially returned ENOTFOUND. Public DNS and an HTTPS request pinned to the public address independently confirmed the domain; subsequent smoke used the existing local proxy without disabling TLS validation.
- The workers.dev fallback timed out from this network. Its registration is confirmed, but reachability is not claimed.

Run `node scripts/smoke-cloud.mjs` for the named production host only. It creates a random test account, verifies private document access, DOCX/XLSX/PPTX exports, revision rejection, trash/deletion and logout, then removes its test documents. `node scripts/smoke-cloud-browser.mjs` verifies registration, Word persistence, formula evaluation, presentation mode, reload and logout in Chromium, and removes its generated account's documents. Both retain empty test accounts because account deletion is not implemented. Credentials and session tokens are never printed or saved. Browser screenshots go to ignored `releases/cloudflare/`. `SMOKE_PROXY` optionally selects an existing proxy for the browser runner; Node HTTP smoke can use standard proxy environment variables with `--use-env-proxy`.

## Recovery boundary

This is the first deployment, so there is no earlier application version to roll back to. Keep the version above as the known working code baseline. For a later incompatible code-only rollout, inspect `wrangler deployments list`, then use `wrangler rollback <verified-version-id>`; code rollback does not restore document data or reverse SQLite schema changes. Do not delete Durable Object classes, bindings, namespaces, or migrations as a rollback shortcut.

User-level recovery is available through native ZDOC backups and imports; Office exports preserve the supported basic content. SQLite Durable Objects provide point-in-time recovery. An isolated rehearsal is prepared below, but the production operator restore workflow and successful recovery acceptance remain open and must not be inferred from a successful code deployment.

### Isolated recovery rehearsal

`cloud/recovery-rehearsal.ts` reuses the production `AccountDocuments` repository in a separate `RecoveryRehearsal` class. `wrangler.recovery.jsonc` has no routes, workers.dev endpoint, account binding, or production namespace binding. Never add production bindings to either rehearsal configuration.

The test seeds a multi-chunk Unicode Word document, a spreadsheet formula, and a starred slide in trash. It captures a bookmark, changes document bodies and metadata, permanently removes only its generated trash fixture, and schedules a restore. After aborting/restarting the object, full-document SHA-256, document count, quota bytes and trash count must exactly match. A second restore to the returned undo bookmark must recover the changed state. No caller can choose an object, customer account, content or bookmark.

Cloudflare's [PITR documentation](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#pitr-point-in-time-recovery-api) describes a 30-day history and requires a new object session after scheduling recovery. Local development does not implement PITR, so local tests cannot certify this operation.

```sh
npx wrangler whoami
npx tsc -p tsconfig.cloud.json
npx wrangler deploy --config wrangler.recovery.jsonc
npx wrangler dev --remote --config wrangler.recovery-driver.jsonc --ip 127.0.0.1 --port 8791 --inspector-port 9241
```

In a second terminal, while the preview is ready:

```sh
curl --fail-with-body --max-time 60 -X POST http://127.0.0.1:8791/rehearse
```

Stop that exact preview process afterward. A successful result must contain `passed: true`; a deployment, ready message, timeout or mock result is not acceptance. Each invocation allocates a new test object, retains approximately 1.2 MB of generated history for diagnosis, and incurs normal test-resource usage. No scheduled trigger is configured.

2026-10-13: the isolated class deployed as `zhuole-recovery-rehearsal`, version `0e374ceb-8686-4378-8abd-8be3472651bb`, with no public targets. Direct remote preview warned that SQLite is unsupported, so the driver binds to this deployed class instead. Requests through Wrangler's local forwarding runtime timed out, including an ordinary no-op path. The Node runner below successfully reached the same remote preview through the existing system proxy and completed both restoration and undo. Production deployment and objects were not modified.

Use `scripts/rehearse-cloud-recovery.mjs` for a self-contained run. It starts the preview, receives the documented reload event from the locked Wrangler package, and sends its temporary authorization headers only to that preview's HTTPS host. Credentials remain in memory; redirects are rejected. The runner checks the no-op path first, verifies the full restore result, writes only non-secret evidence and tears down the preview in `finally`. Use the existing network proxy environment when required; do not configure a new public endpoint to bypass preview transport failures.

```sh
node --use-env-proxy scripts/rehearse-cloud-recovery.mjs
```

Verified result: three documents and one trashed item at 1,200,430 quota bytes; mutation reduced these to two documents, zero trashed items and 174 bytes. Restore recovered the original full-document SHA-256 and all counters; undo recovered the changed SHA-256 and counters. Evidence: `releases/cloudflare/recovery-result.json` and `recovery-node-run.log`. This proves the real remote PITR mechanism with production document storage code in an isolated namespace; it does not establish a customer-facing or production operator restore service.

### Customer recovery gate

Before implementing or invoking a customer restore, record explicit approval for the exact account/object and target time; suspend writes and synchronization for that account, export its current documents, record the current bookmark and schema/code version, and preserve the undo bookmark outside the object before restarting it. Afterward verify IDs, content, revisions, trash and quota; force clients to reload so old drafts cannot silently overwrite recovered state. Resume traffic only after these checks.

Restoring the shared Accounts directory is a separate, wider operation: it can roll credentials and sessions back for multiple users. Do not restore it as part of a single-account document repair. The production code currently exposes no restore endpoint or maintenance gate. The isolated rehearsal is groundwork, not a completed production restore workflow or an independent backup outside Cloudflare.

## Desktop download channel

`cloud/desktop-release.json` records the current four platform/architecture installers. Only current and explicitly retained historical release paths are downloadable; the Worker does not accept arbitrary R2 keys. `RELEASES` binds the separate `zhuole-desktop-releases` bucket, which contains installer binaries rather than account documents and does not affect user cloud quota.

The public `/api/releases/desktop` response supplies version, platform, architecture, filename, size, SHA-256, signing state and download path, without internal object keys. Download responses support HEAD and single byte ranges, including suffix ranges; invalid ranges return 416. R2 object sizes must match the release record. Versioned download URLs use immutable caching: never replace a published version's bytes or reuse that version for different artifacts.

`node scripts/publish-desktop.mjs` checks local sizes and SHA-256 and requires the recorded Mac signature, notarization ticket and Gatekeeper evidence. `--upload` additionally uploads to content-addressed R2 keys. Windows binaries remain unsigned by the user's explicit decision. Run `node --use-env-proxy scripts/verify-desktop-downloads.mjs` with the existing proxy environment after deployment: it validates manifest, HEAD, first/last byte ranges and full streaming SHA-256 for all four public files. Evidence is written only after every file passes, to `releases/cloudflare/desktop-download-readback.json`.

This supplies official installer delivery. Client-side version checking and the update installation flow remain a separate WPX-9 acceptance gate; publishing these endpoints alone does not establish automatic updates.

2026-10-13 live acceptance: Worker `c7d34f4d-6af7-4c39-b19b-880af97f9b9f` serves the channel on the production custom domain. All four installers passed full public SHA-256/size readback, HEAD and first/last byte range comparisons against local artifacts. The production Word/table, spreadsheet/formula and presentation/notes smoke passed; generated cloud documents and session were removed. Unit/API suite: 29 passed; application/cloud TypeScript checks and cloud dry-run passed. Evidence: `releases/cloudflare/desktop-download-readback.json`, `download-live-smoke.log`, `download-tests.log`, `download-build.log`, and `download-deploy.log`. Previous Worker `6b5ebc1b-42e7-4e02-a30b-b18e973bd715` is the code rollback target; retain release objects when rolling back, and do not alter account/document bindings.

2026-10-14 version 0.1.1 cutover: Worker `a2b998cb-d5de-445a-9f1f-bf9b5ec93174` serves the current manifest plus `cloud/desktop-release-history.json` for immutable prior links. All four 0.1.1 installers passed complete public hash/size readback and HEAD/range checks; all four 0.1.0 paths remained available with matching metadata and bytes. Evidence: `releases/cloudflare/desktop-download-readback.json`, `0.1.1-download-direct.log`, and `0.1.0-legacy-links.json`. Previous readback is preserved in `0.1.0-desktop-download-readback.json`. Code rollback target: `c7d34f4d-6af7-4c39-b19b-880af97f9b9f`; keep installer objects and account/document bindings intact.

The first upload received a transient 502; a bounded retry completed all uploads before deployment. Proxy-based smoke runs encountered connection failures; the first completed Word/Sheet cleanup before interruption, so a generated slide fixture/session may remain from that interrupted run. No customer records were changed. Direct transport passed all three document smoke scenarios and cleaned that successful run's documents/session (`0.1.1-live-smoke-direct.log`). The slow proxy download verifier was explicitly stopped after transport comparison; the direct verifier completed all four files. Local checks: 33 unit/API cases, application/cloud TypeScript checks and dry-run passed.

### Recovery revision fencing (2026-10-14)

Restoring a snapshot also restores its revision counters. A client holding a revision from the abandoned timeline could otherwise match the restored counter and overwrite recovered content. `AccountDocuments.advanceRevisionsPast` atomically advances every restored document, including trash, above a supplied historical high-water mark while preserving content, metadata timestamps and quota. Unsafe or exhausted integer bounds fail without mutation. It is currently invoked only by the isolated rehearsal; production HTTP/RPC recovery remains unavailable.

The caller must isolate writes and retain the maximum of **all issued revisions outside the restored storage**, including permanently removed documents, prior recoveries and edits before undo. Computing only the current documents' maximum is insufficient. The helper cannot supply these coordinator guarantees or protect creates/imports by itself. Do not expose it as an operator endpoint until that protocol and authorization exist.

The isolated Worker was updated to `4132303b-965e-4aa0-a8d3-ebbac736cfe1`, still with no public targets or customer bindings. The real remote PITR/undo run passed full pre-fence content/counter comparisons, then checked unchanged content after fencing and rejection of three stale writes after restore (revision 3) and two after undo (revision 4). Its fixture deterministically issues revisions 1 and 2 with no concurrent writers; this is not evidence of a production high-water coordinator. The preview shut down successfully. Evidence: `releases/cloudflare/recovery-fence-deploy.log`, `recovery-fence-run.log`, and `recovery-result.json`; the preceding result is preserved in `recovery-before-fencing-result.json`. All 35 unit/API tests and the cloud TypeScript check passed. Production Worker and data were unchanged.


## Spreadsheet IME deployment (2026-10-14)

Production Worker `384229a8-835a-424a-b4a1-c20e6aa70935` serves 100% of traffic on `wpx.youdroid.top`. Editor source includes `d73726a`: spreadsheet navigation ignores composing keyboard events. The deployment also includes the previously tested safe-integer revision exhaustion guard; recovery orchestration is still disconnected from production. Bindings and migration declarations are unchanged. Code rollback target: `a2b998cb-d5de-445a-9f1f-bf9b5ec93174`.

`npm run cloud:build` and all six cloud document tests passed. The production browser smoke passed registration, Word persistence, spreadsheet SUM, composing Enter/arrow/Tab event handling, normal Enter navigation, Chinese text readback after reload, slide presentation and logout. Only generated QA documents were removed. These synthetic keyboard events verify application interception, not native OS candidate selection. Client installers have not been rebuilt for this fix.

Evidence: `releases/cloudflare/ime-build.log`, `ime-before-deploy.log`, `ime-deploy.log`, `ime-after-deploy.log`, and `ime-live-browser.log`. Reproduce browser acceptance with `SMOKE_PROXY=http://127.0.0.1:7897 node scripts/smoke-cloud-browser.mjs` in this configured environment.


## Desktop 0.1.2 public cutover (2026-10-14)

Worker `cb6f2753-63ad-49ae-ae5e-b6f65cde7fa9` serves the 0.1.2 desktop manifest on the production custom domain. All four installers were uploaded to content-addressed R2 keys before deployment. The explicit history now retains both 0.1.0 and 0.1.1; none of their records or published files were overwritten. Code rollback target: `384229a8-835a-424a-b4a1-c20e6aa70935`. Account/document bindings and migrations are unchanged.

All four public 0.1.2 files passed full streaming SHA-256/size comparison, HEAD metadata, and first/last byte range checks. All eight historical links passed HEAD metadata and first/last byte comparisons against local artifacts. The production browser smoke passed registration, Word persistence, sheet formula/composition events/Chinese persistence, slideshow and logout; its generated documents were removed. All 53 unit/API tests and the cloud build passed before deployment.

Evidence under `releases/cloudflare/`: `0.1.2-upload.log`, `0.1.2-deploy.log`, `0.1.2-after.log`, `desktop-download-readback.json`, `0.1.2-download-readback.log`, `0.1.2-history-links.json`, `0.1.2-browser-smoke.log`, `0.1.2-tests.log`, and `0.1.2-build.log`. Previous 0.1.1 readback is preserved in `0.1.1-preserved-download-readback.json`. Windows remains unsigned as requested; public delivery does not establish Windows or Intel Mac runtime acceptance.

## Session preservation and shared handlers deployment (2026-10-14)

Production Worker `151776aa-dbd9-4782-b217-05776fb9d27f` serves 100% of traffic on `wpx.youdroid.top`. It includes the shared document request/read handlers and the registration/login cookie-preservation fix when usage fails. Password rotation already returns its cookie with 204 before usage lookup and was not affected by that defect. No recovery coordinator binding, migration declaration, desktop release manifest or customer-data operation changed. Code rollback target: `cb6f2753-63ad-49ae-ae5e-b6f65cde7fa9`.

The cloud build and focused session regression checks passed; the preceding full suite contained 82 passing tests. The expanded public API smoke now verifies logout/login, password rotation, old-session revocation and login with the new password, followed by three Office round trips, private access, revision conflicts, trash/removal and final logout. Browser smoke passed registration, Word persistence, sheet SUM/composition-event/Chinese persistence, slideshow, reload and logout. Generated QA documents and sessions were removed; empty QA accounts remain. Usage-failure injection is covered by local tests, not induced against production.

Evidence: `releases/cloudflare/session-fix-{auth,before,build,deploy,after,live-api,live-browser}.log`. Recovery components remain isolated; production recovery and migration acceptance are still open.


## Account availability deployment (2026-10-14)

Worker `892b37f4-3f77-430f-8dbf-dc403fb53997` serves 100% of production traffic. It includes the authenticated storage-unavailable payload and account UI from `75edcd6`. Successful account responses, bindings, migration declarations and desktop manifests are unchanged. Rollback target: `151776aa-dbd9-4782-b217-05776fb9d27f`. Native installers have not been refreshed for this frontend change.

Cloud build passed. Live API checks passed account login, password rotation, old-session revocation, new-password login and all three document types with private access, Office exports, stale-write rejection and cleanup. Browser checks passed Word persistence, spreadsheet formula/composition events/Chinese persistence, slideshow, reload and logout. An optional `SMOKE_STORAGE_OUTAGE=1` browser-only response injection verifies that the deployed bundle retains account access and shows unavailable usage without false zero counts. This is not a production server outage test; the server error payload is covered by local unit tests. Only generated QA documents/sessions were removed; empty QA accounts remain.

Evidence: `releases/cloudflare/availability-{auth,before,build,deploy,after,live-api,live-browser}.log` and `live-storage-unavailable.png`. Reproduce with `SMOKE_PROXY=http://127.0.0.1:7897 SMOKE_STORAGE_OUTAGE=1 node scripts/smoke-cloud-browser.mjs`. Production recovery orchestration and device acceptance remain open.

## Desktop 0.1.3 public cutover (2026-10-14)

Worker `7c787cea-6184-4071-9f6f-a1bf9e4ca45d` serves 100% of traffic and advertises desktop 0.1.3. All four installers were uploaded to content-addressed R2 keys before deployment. The explicit history retains 0.1.0, 0.1.1 and 0.1.2 without overwriting their records or files. Rollback target: `892b37f4-3f77-430f-8dbf-dc403fb53997`. Account/document bindings and migration declarations remain unchanged. This deployment also contains the local draft discovery fix from `6f59899`.

All four public installer files passed complete SHA-256/size comparison, HEAD metadata and first/last byte ranges. All 12 historical links passed HEAD metadata and boundary-byte comparison with their local artifacts. The production browser smoke passed registration, Word persistence, spreadsheet formula/composition-event/Chinese persistence, slideshow, reload and logout; browser-only outage injection verified the deployed unavailable-usage UI. Generated QA documents and session were removed. All 83 unit/API tests and the cloud build passed before deployment.

Evidence: `releases/cloudflare/0.1.3-{auth,before,upload,tests,build,deploy,after,download-readback,history-links,browser-smoke}.log`, `desktop-download-readback.json`, and `0.1.3-history-links.json`. Previous 0.1.2 readback remains in `0.1.2-preserved-download-readback.json`. Windows is unsigned as requested. Public delivery does not establish Windows or Intel Mac runtime acceptance. Mobile packages are unchanged.

## Aggregate formula deployment (2026-10-14)

Production Worker `97f9b16f-7dd3-4398-9644-a081fbb99d9d` serves 100% of traffic with the direct blank/text reference correction from `a10eb6f`. Rollback target: `7c787cea-6184-4071-9f6f-a1bf9e4ca45d`. Account/document bindings, migrations and desktop manifests are unchanged. Recovery coordinator code remains disconnected from production.

Cloud build passed. The expanded live API smoke passed account/password/session checks, all three document types, private access, revision conflicts and generated-document cleanup. The downloaded XLSX retains the exact formulas and corrected numeric caches for COUNT, AVERAGE, SUM, MIN and MAX with blank/text references. All ten production static resources match the local build byte-for-byte. Browser inventory found the page, but both tab creation/binding timed out; no fresh rendered UI or browser calculation acceptance is claimed. Native installers have not been rebuilt.

Evidence: `releases/cloudflare/aggregate-{auth,before,build,deploy,after,live-api}.log` and `aggregate-assets.json`. The API smoke leaves only an empty generated test account; documents and session were removed. Source regression evidence remains in `docs/verification.md`.
