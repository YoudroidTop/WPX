# Delivery acceptance status

Audit refreshed: 2026-10-14. The requested product remains **Zhuole Docs / 卓乐文档**, with **Zhuole Cloud Docs / 卓乐云文档** for the web service. Basic Word, spreadsheet and presentation editing, shared accounts and a 3,000,000,000-byte personal cloud quota are the baseline. Complex Office parity remains deferred by the user's chosen approach. Overall completion is **not established**.

The table is the current summary. Dated entries below are historical checkpoints and do not override it. This audit checked current source, native package verification records, the live public manifest and deployment list, and reran all 96 unit/API tests successfully. Historical UI checks retain their original build/platform scope.

| Requirement / delivery gate            | Authoritative evidence                                                                                                                                        | Current boundary                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web on the requested Cloudflare domain | `wrangler.jsonc`, `releases/cloudflare/0.1.6-after.json`, `0.1.6-api-smoke.log`, `0.1.6-safari-*.txt`                                                         | `https://wpx.youdroid.top`, Worker `7470c438-1f90-4a43-89c6-019843a4ed74` at 100%. Absolute-reference follow-up passed production API/XLSX and Safari edit/save readback; see `docs/cloudflare.md` and `absolute-*` evidence.                                                                                                     |
| Accounts and private 3 GB space        | `shared/documents.ts`, `tests/api.test.ts`, `tests/cloud-documents.test.ts`, `releases/current-baseline-tests.log`                                            | Registration/login/profile/password/logout, isolation and transactional exact-byte quota including trash implemented and tested. Email verification/password recovery channels remain unconfigured.                                                                                                                               |
| Basic Word, Excel and PPT              | `README.md`, `tests/core.test.ts`, `docs/verification.md`, latest production smoke                                                                            | Editors, save/reopen, bounded formulas, slides, native backups and basic Office conversion delivered. Complex compatibility remains explicitly excluded. Historical native editor results are version-specific.                                                                                                                   |
| macOS                                  | `releases/desktop/mac-distribution-manifest.json`, `docs/desktop.md`                                                                                          | Public 0.1.6 arm64/x64 installers signed/notarized/stapled and verified. Apple Silicon packaged UI accepted; Intel hardware runtime remains unverified.                                                                                                                                                                           |
| Windows                                | `releases/desktop/0.1.6-windows-signature.json`, `docs/desktop.md`                                                                                            | Public 0.1.6 x64/arm64 installers unsigned by user decision. User reported installation and three document types normal; build/CPU unspecified, login and upgrade not separately confirmed.                                                                                                                                       |
| Desktop downloads and update checks    | `cloud/desktop-release.json`, `releases/cloudflare/current-delivery-manifest.json`, `0.1.6-download-readback.json`, `releases/desktop/0.1.1-live-update.json` | Live 0.1.6 manifest matches all four artifact identities. All four full-file SHA-256/size/HEAD/range checks passed; all 24 historical links passed post-cutover checks. Manual update checks and confirmed download flow shipped since 0.1.1. Apple Silicon upgrade accepted; Windows/Intel upgrade execution remains unverified. |
| iOS                                    | `releases/mobile/0.1.4-ios-verification.json`, `docs/qa/ios-0.1.4-cases.json`, earlier versioned catalogs                                                     | Development IPA 0.1.4/build 5 and simulator app verified. Current simulator login/picker cancel/reopen/logout passed; prior basic editor/offline evidence remains recorded. No connected iPhone in latest inventory; physical and public/store delivery open.                                                                     |
| Android                                | `releases/mobile/0.1.4-android-release-verification.json`, `0.1.4-android-upgrade-verification.json`, `docs/mobile.md`                                        | Signed non-debuggable 0.1.4/code 5 APK verified; retained-data installation and cold launch passed. Prior editor/offline/native-file tests are older-build evidence. Current release visible workflows, physical devices and public/store delivery remain open.                                                                   |
| HarmonyOS                              | `releases/harmony/0.1.3-verification.json`, `0.1.3-installed-bundle.json`, `docs/mobile.md`                                                                   | Development HAP 0.1.3/code 4 installed. Latest launch blocked by locked device. Earlier basic editors/Office/ZDOC acceptance remains valid only for its recorded builds; current UI and public distribution open.                                                                                                                 |
| Cloud recovery operations              | `docs/recovery-protocol.md`, `releases/cloudflare/recovery-result.json`, WPX-4                                                                                | Isolated restore/undo, fencing, durable dispatch and alarm reconciliation verified. Production authenticated routing/bootstrap, operator authorization, ambiguous PITR handling and client idempotency remain unfinished. No customer restore is authorized by this audit.                                                        |

## Remaining delivery work

1. Complete current native mobile workflows, especially real file selection/import after the picker correction, and physical-device acceptance when devices are available. Do not repeatedly rebuild unrelated platforms solely to equalize version numbers.
2. Mobile distribution is deferred by the owner. Use `run_release.sh` for selectable local platform/device/Debug/Release builds and installation; store publication is not currently requested.
3. Preserve the Windows/Intel runtime and upgrade evidence gaps; do not infer full architecture coverage from the user's Windows report.
4. Continue the tracked production recovery work in isolation before any production cutover. Deployment health alone does not prove data recovery.
5. Keep IME and formula issues open until their recorded remaining native acceptance gates are resolved. Store publication, advanced Office parity and extra operational hardening must not be silently treated as already completed basic editing.

## Historical checkpoints

### Account availability follow-up (2026-10-14, local verification)

Authenticated storage failures now include an explicit `ACCOUNT_STORAGE_UNAVAILABLE` payload while retaining the original error status and session cookie. Updated clients retain account settings and display unknown quota usage instead of zero. Existing successful responses remain unchanged; older clients continue to receive an error. Document failures are not presented as an empty workspace.

Verification: 83 unit/API tests, TypeScript checks and the web build passed. The browser outage case verifies registration, reload, unavailable usage and counts, profile editing, password rotation and logout; screenshot: `test-results/web/storage-unavailable.png`. This follow-up is now deployed to the web service as Worker `892b37f4-3f77-430f-8dbf-dc403fb53997` (100% traffic). Live account and three-editor smoke passed; browser-only outage injection verified the deployed UI. Production storage was not fault-injected. Existing native installers do not include this frontend update.

The connected Harmony device again returned launch error `10106102` (screen locked) after the user's ready message. No fresh ZDOC open/restore acceptance was performed in this run; previous build evidence remains separate.

1. Retain the separate Intel Mac runtime gate; Windows installation and three-document acceptance were reported by the user. Official downloads, manual update checking, signed Mac delivery and Apple Silicon profile upgrade are verified.
2. Implement a controlled production recovery workflow with per-account write isolation, pre-restore snapshot/bookmark, explicit target approval, undo preservation, and stale-client protection. Validate first in isolated storage; do not restore customer data as a test.
3. Resume current-build Harmony scenarios when the user unlocks the device. No lock bypass, developer-mode change or unrelated foreground-app interruption is authorized by this audit.
4. Install and exercise the existing iOS development build when a registered iPhone is connected and trusted. Keep physical acceptance separate from simulator results.
5. Complete remaining distribution gates with the relevant platform credentials and review states recorded separately.

## Artifact identity

The current Harmony HAP SHA-256 is `74128965bc102873919e4766e86a0af0cb756dbaad429b8df5c5d42332cb77f1`. Its installation succeeded before the launch block. Current Mac artifacts and their hashes are in `MAC-SHA256SUMS` and `mac-distribution-manifest.json`; Windows artifacts are `ZhuoleDocs-0.1.2-win-x64.exe` and `ZhuoleDocs-0.1.2-win-arm64.exe` under `releases/desktop/`.

Recent Office conversion fixes are server-side and require no client installer refresh for clients connected to the production domain. A self-hosted older server must be updated separately. Do not treat source HEAD as the build identity of every existing installer.

## Desktop 0.1.3 candidate follow-up (2026-10-14)

Local Windows x64/arm64 installers and notarized Mac arm64/x64 DMGs are built with the account availability and draft discovery fixes. All four packaged payloads match staging. Nine source-client tests plus two packaged Apple Silicon tests passed, including a 0.1.2 profile upgrade. Both Mac architectures passed signature, ticket and Gatekeeper validation; Windows remains unsigned as requested. See `docs/desktop.md` for evidence. Public downloads remain 0.1.2 until upload/readback/cutover; mobile artifacts remain on their earlier builds.

## Desktop 0.1.3 public delivery (2026-10-14)

Official downloads now serve the verified 0.1.3 installers. All four public files passed complete checksum/size, HEAD and range checks; all 12 historical links remain available. The production browser smoke also passed. Windows user acceptance, Intel Mac runtime, mobile refresh and production recovery orchestration remain open.

## Mobile 0.1.1 development packages (2026-10-14)

Android debug APK, iOS development IPA and Harmony debug HAP now include the shared account availability/draft fixes, with native version 0.1.1/build 2. All bundled web files match staging. Android's dedicated-emulator editor/export/offline/cache/account regression passed. iOS signature/profile checks passed but paired phones were offline. Harmony build/package checks passed; device launch remained locked, and the new HAP was not installed. See `docs/mobile.md` for exact hashes and logs. Mobile public distribution and current-build iOS/Harmony runtime acceptance remain open.

## Android native 503 follow-up (2026-10-14)

Mobile 0.1.1 (2) now has native HTTP storage-outage acceptance on the dedicated Android emulator: account/session retention, process restart, local draft access and recovery synchronization passed against a loopback fault proxy. This closes the Android-specific 503 check; it does not establish iOS/Harmony runtime behavior or production recovery orchestration. Evidence and stale-emulator-snapshot safeguards are documented in `docs/mobile.md`.

## iOS native 503 follow-up (2026-10-14)

Simulator 0.1.1 (2) now has four fresh acceptance passes: installed asset identity, login/session/account access during native HTTP 503, pending Word draft discovery/opening after process restart, and recovery synchronization with exact authenticated API readback. One catalog case, registration during 503, remains not-run. See `docs/qa/ios-availability-cases.json` and `docs/mobile.md`. This closes the tested iOS simulator outage path, not physical-device acceptance, a full editor regression or public mobile distribution. No application code was changed in this follow-up.

## Recovery concurrency follow-up (2026-10-14)

Fixed a reproduced duplicate-acknowledgement race between HTTP writes and reconciliation. Account-scoped adapters now share execution while preserving durable pending commands on failure. All 85 unit/API tests and application/cloud type checks passed; isolated Worker `6726ce28-61d6-44fe-8a95-a5152396f587` passed deterministic concurrent replay after restart plus the existing restore/undo, 4 MB and read-isolation rehearsal. See `docs/recovery-protocol.md`. Production recovery remains incomplete: automatic scheduling, authenticated routing/bootstrap, operator authorization and ambiguous restore reconciliation are still required.

## Recovery scheduling follow-up (2026-10-14)

Automatic pending-mutation reconciliation now passes real Cloudflare alarm acceptance in the isolated namespace: atomic command/alarm scheduling, restart plus two consecutive simulated failures, exact replay without duplication, retained suspension and alarm cleanup. All 89 unit/API tests and application/cloud type checks passed. Worker `c6d924b9-b3db-4e90-8934-da4b962788ee`; evidence in `docs/recovery-protocol.md`. This advances the coordinator implementation; production authenticated routing, existing-account migration, operator approval, ambiguous PITR handling and client-level idempotency remain open.

## Android release signing follow-up (2026-10-14)

A local non-debuggable 0.1.1 (2) release APK is now signed with the dedicated project identity and verified for signatures, alignment, native version and ten editor assets. Fresh isolated emulator installation/cold Activity start passed; visible login/editor checks remain unverified because the UI controller could not bind that window. The original debug environment is preserved. See `docs/mobile.md` for artifact identity, signing-material backup and evidence. This is a local release candidate, not public download or app-store publication.

## Desktop 0.1.5 public delivery (2026-10-14)

All four current Mac/Windows installers are published and passed complete public hash/size plus HEAD/range verification. All twenty historical links passed post-deployment checks. Production API and fresh Safari UI smoke passed; dedicated test documents were removed. See `docs/cloudflare.md`. Windows installation and three-document operation are user-reported passes without a specified build or architecture. iOS 0.1.3 portrait and landscape presentation passes remain simulator-only; landscape account-dialog scrolling, physical devices and remaining native workflows are still open.
