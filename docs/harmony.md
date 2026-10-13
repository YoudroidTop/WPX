# HarmonyOS client

The ArkUI/ArkWeb host lives in `harmony/`. It uses the bundled React editor, the production origin `https://wpx.youdroid.top`, and the same account, document model and 3,000,000,000-byte server quota as the web client.

## Build

Requirements: Huawei Command Line Tools, SDK 6.1.1 API 24, Node 24 or newer. The declared minimum is HarmonyOS 5.0.0 API 12; runtime compatibility at that minimum remains unverified.

```sh
npm ci
npm run harmony:sync
cd harmony
ohpm install
hvigorw assembleHap
```

The default build produces `entry/build/default/outputs/default/entry-default-unsigned.hap`. No signing credentials or provisioning profiles are included in Git. A matching development profile is now available locally and has been used for physical-device installation. An unsigned build is not a distributable release.

## Boundaries

- The resource interceptor serves only manifest-listed bundled editor files at the production HTTPS origin. `/api/` uses HTTPS network requests and the native WebView cookie store. An SDK callback typing mismatch requires a non-null assertion for the documented null network pass-through result.
- Main-frame navigation is restricted to the editor root. File access, mixed content and multiple windows are disabled. The bundled document CSP disallows remote scripts, frames and plugins.
- The JavaScript proxy exposes connection metadata, user-selected import/export and cookie clearing. It never exposes passwords, cookies or arbitrary filesystem paths.
- Imports accept DOCX, XLSX, PPTX and ZDOC, at most 10 MB. Exports use the system save picker, sanitize the suggested filename and enforce the same binary limit. Failed or partial I/O rejects the operation instead of reporting success.
- The existing per-origin/account IndexedDB cache and revision-based draft synchronization are reused. Physical-device acceptance covers page reload, foreground recovery and process restart with pending drafts.
- This initial host uses the fixed production service. Custom server switching and native distribution are pending. System incoming-file support is implemented with a separate runtime acceptance gate below. The UI file picker supports manual import.

## Verification

`npm test` covers the JavaScript adapter's binary round-trip, invalid payload, fixed-origin policy, cookie-clear invocation and command listener removal. It does not emulate ArkWeb or the native picker.

On 2026-10-13, `npm run harmony:sync` and `hvigorw assembleHap` succeeded with the local API 24 toolchain. A connected API 24 device was detected read-only. Subsequent signed-device acceptance passed local assets, native bridge availability, production registration/login, Word persistence/reload, SUM calculation, slide editing/presentation and logout. Native file pickers, offline editing, keyboard, safe areas and tablet/foldable layouts remain explicit runtime gates.

## Local development signing and device smoke

After `npm run harmony:sync`, the signing helper accepts a JSON-compatible reference build profile with a `debug` signing configuration, the application's development profile, and the local Hvigor executable:

```sh
node scripts/build-harmony-debug.mjs /path/to/reference/build-profile.json5 /path/to/zhuoledocs_debugDebug.p7b /path/to/hvigorw
```

It validates the bundle, profile type/validity and matching certificate within the full PEM chain, builds in a private ignored workspace and removes the material-bearing configuration afterward. It never prints passwords. Native package installation additionally verifies the actual signature and device authorization. Output: `releases/harmony/ZhuoleDocs-0.1.0-harmony-debug.hap`.

Debug builds expose ArkWeb inspection; release builds disable it through the generated `DEBUG` constant. Forward only this application's debug socket to localhost port 9224, then run `node scripts/smoke-harmony.mjs`. The test creates a random account on the production service, exercises the three editors and removes only that account's generated documents before logout. The empty test account remains. No real user account is used.

The first device launch uncovered synchronous controller access before attachment. `Index.ets` now gates dispatch on controller readiness and handles both synchronous errors and Promise rejection. Build success alone had not detected this lifecycle failure.

The physical-device smoke now also aborts only the inspected page's API traffic, edits a cached draft, reloads it, reconnects and verifies the server content. A second account checks offline library isolation and logout persistence before the first account is restored. The finalizer removes the test route without changing device networking. This covers page reloads; process termination and foreground/background transitions still require separate acceptance. Assertions allow 30 seconds for native-device/cloud latency. Failure output excludes registration snapshots containing random QA passwords.

## Native file picker acceptance

`scripts/smoke-harmony-files.mjs` combines the actual debug ArkWeb with device `uitest` layout inspection. It saves DOCX/XLSX/PPTX through the system picker, selects the saved file again, confirms cloud import, and checks text, SUM=200 and slide title. Filenames include a fresh run suffix to avoid overwriting existing files. The harness locates native controls from the current accessibility tree; it rejects unexpected save-sheet layouts instead of guessing a confirmation target.

Prerequisites: an unlocked connected device, this app's debug socket forwarded to port 9224, and a dedicated generated QA account named `文件验收`. Store that account's `email` and `password` in the ignored, mode-0600 `releases/harmony/file-qa-credentials.json`; never use a real user's account. The harness checks the authenticated email before creating or deleting documents. It removes the dedicated account's cloud documents on success, logs out and retains exported Download files for inspection.

```sh
HDC=/path/to/hdc HARMONY_DEVICE=device-id node scripts/smoke-harmony-files.mjs
```

A password-vault prompt, if shown, should be declined for these generated test credentials. Layout and screenshot artifacts remain local under `releases/harmony/`. Native picker acceptance is separate from receiving external application file-open intents.

## Foreground recovery acceptance

With the same dedicated account fixture, unlocked device and forwarded ArkWeb port, run:

```sh
HDC=/path/to/hdc HARMONY_DEVICE=device-id node scripts/smoke-harmony-lifecycle.mjs
```

The test creates one uniquely named document, aborts only its page API requests, waits for a persisted offline draft, sends the actual native Home action, and confirms that the WebView becomes hidden. It restores API requests while the app is in the background, starts the existing ability, confirms visibility, and requires cloud synchronization without clicking reconnect or injecting an online event. Server readback verifies the draft text. The finalizer removes the route, deletes only that test document after verifying the account, reloads and logs out.

This scenario passed on the API 24 device using the existing `onPageShow` hook; no additional lifecycle bridge was needed. Process termination is covered by the separate scenario below.

## Process restart and session persistence

The native bridge flushes ArkWeb cookies after successful login/registration, before the shared client caches the account. Logout clears cookies and flushes that removal. The service owns these operations; JavaScript receives no cookie values. Other platforms retain their existing behavior through an optional bridge method.

```sh
HDC=/path/to/hdc HARMONY_DEVICE=device-id HARMONY_RESTART_QA=1 node scripts/smoke-harmony-lifecycle.mjs
```

This mode force-stops the app while its page API requests are blocked, confirms the old process exits, starts a distinct process and reconnects its debug socket. It requires restored login, the persisted draft text and synchronized server content. The API 24 physical device passed after explicit cookie flushing was added. The earlier build lost its login session in this scenario. Networking is available after restart; this is not an airplane-mode cold-start or OS memory-pressure test.

## Cache cleanup acceptance harness

`node scripts/smoke-harmony-cache.mjs` uses the same dedicated account fixture and debug forwarding as the file-picker harness. It creates two uniquely named Word documents, leaves one pending under page-only API failure, clears synced bodies from account settings, reloads the pending draft offline, and checks that the removed body requires the cloud and can be downloaded again. The finalizer restores API access, verifies the pending text reaches the cloud, deletes only this run's documents and logs out.

The initial attempt after packaging the feature could not establish debug inspection while the device was locked; no test documents were created. The signed build is installed, but this new scenario is not yet claimed as physically verified.

## System incoming documents

The singleton ability handles `ohos.want.action.viewData` on both creation and new Wants. The manifest advertises file URIs with `linkFeature: FileOpen` for DOCX/XLSX/PPTX MIME types and `application/x-zhuole-document`. Configuration follows the [official URI matching guide](https://developer.huawei.com/consumer/en/doc/harmonyos-guides/app-uri-config). Receiving another app's file still depends on that caller granting read access to the URI.

`DocumentInbox` serializes reads/writes and copies supported files into the application's private `filesDir/document-inbox`. Each file must contain 1–10,000,000 bytes; at most eight complete copies are queued. A partial write is never exposed: bytes are flushed and the temporary file renamed before notification. Interrupted partial copies matching the service's generated naming scheme are removed on the next operation. Unrelated entries and original source files are untouched. Filenames are sanitized; names longer than 120 characters are rejected.

The JavaScript bridge consumes one queued copy at a time and reuses the existing login-gated import confirmation. Nothing is automatically uploaded. Returning from an editor/dialog drains the next pending item. Once consumed into confirmation, cancellation or process termination requires reopening the original source, matching the other mobile clients. Errors use generic user-facing text and operation-only native logs.

`tests/harmony-inbox.test.ts` bundles the actual ArkTS service with a filesystem-backed test adapter. It verifies persistence across a fresh service instance, exact bytes for all four formats, one-time consumption, the eight-file cap, exact 10 MB acceptance, oversized/empty/unsupported/directory rejection, stale partial cleanup and source preservation. This does not emulate OS URI grants, ability matching or ArkWeb delivery. The signed build compiles. Physical-device tests now cover cold/warm Office opens, login deferral and cancellation; queue-full feedback and external ZDOC type matching remain separate acceptance gates.

### External file-open repair and device evidence

The system file manager initially omitted Zhuole Docs from its open-with panel. Adding `linkFeature: FileOpen` to the four existing file declarations repaired discovery without widening the accepted MIME types or requesting more permissions.

Device testing then exposed a second defect: `asyncMethodList` discarded bridge return values, so a queued document was consumed natively while JavaScript received `0`. All bridge methods now use `methodList`, preserving Promise results from file and session operations. The ArkTS implementations still perform file I/O asynchronously. Temporary diagnostic probes were removed after verification.

On the connected API 24 device, the actual file-manager path (search generated sample, long-press, other applications, Zhuole Docs) passed DOCX text import, cold-start XLSX import with SUM=200, and warm-start PPTX title import. The logged-out flow deferred confirmation until login. Canceling then reloading created no extra cloud document. Confirmation was required before upload. Three exact test document IDs were removed, the account logged out, and source files remained in Download. Evidence: `releases/harmony/external-open-result.json`, `external-*-imported.png`, `external-login-deferred.png`, and `external-open-chooser.json`.

Review under `harmony-develop`/`harmony-review`: two implementation files; no P0/P1/P2 findings. The change adds no UI state, storage schema, permissions, sensitive logging or user-facing strings. Release verification includes a signed `hvigorw assembleHap`, 17 passing unit tests, and updated HAP SHA-256. The OS file-manager path is separate from the existing in-app picker regression.

### ZDOC type registration

The entry HAP now includes `resources/rawfile/arkdata/utd/utd.json5`, registering `.zdoc` and the existing `application/x-zhuole-document` MIME type under `com.youdroid.zhuoledocs.document`. The type inherits the system JSON type because native backups contain JSON. This supplies the extension-to-type mapping missing from the MIME-only ability declaration; it does not register all JSON files for opening in Zhuole Docs. Configuration follows the [OpenHarmony custom UTD guide](https://github.com/openharmony/docs/blob/master/en/application-dev/database/uniform-data-type-descriptors.md).

The signed HAP builds successfully and contains the exact declaration bytes; the MIME matches the existing FileOpen entry. The updated HAP was subsequently installed on the physical device (see the current-build acceptance section below); external ZDOC acceptance is still pending. Device interaction stopped when an unrelated application became foreground, before the ZDOC open-with check. A generated `Harmony ZDOC Backup QA` cloud document remains as a dedicated acceptance fixture. Its native save confirmation was selected, but the resulting file has not been independently read back. Do not treat successful packaging as system registration or restore acceptance.

Review: one resource configuration file, no ArkTS/TypeScript changes; no P0/P1/P2 findings. No permission, storage model, UI state or logging changes. The OS type description is English metadata, not an application UI string.

## Current-build acceptance catalog

The current signed HAP (SHA-256 `74128965bc102873919e4766e86a0af0cb756dbaad429b8df5c5d42332cb77f1`) was installed successfully on device `4UQ9K25530058677` on 2026-10-13, preserving application data. Launch returned system error 10106102 because the screen was locked. No UI pass is claimed from installation.

`tool/agent_harmony_tests/cases.json` records this fresh result and the pending ZDOC, Office round-trip, paste-boundary and inbox-capacity scenarios. `report.html` is generated from that manifest. Historical device passes remain in `docs/verification.md` with their original build boundaries.

```sh
node /Users/liang/.agents/skills/pre-release-harmony-agent-qa/scripts/generate_report.js tool/agent_harmony_tests/cases.json tool/agent_harmony_tests/report.html
```

### Current ZDOC device acceptance

On 2026-10-13, the user unlocked TLR-AL00 and the current HAP (SHA-256 `74128965bc102873919e4766e86a0af0cb756dbaad429b8df5c5d42332cb77f1`) launched successfully. The dedicated `Harmony ZDOC Backup QA` fixture was saved to Download. File manager search and Other applications offered Zhuole Docs for the `.zdoc` file. With an editor open, confirmation waited until returning to the workspace. Before confirmation the account still contained one document; after import, authenticated API readback of the new document deeply matched the original content. The original and restored QA documents remain available. Evidence: `releases/harmony/zdoc-open-chooser.json`, `zdoc-confirmation.png`, `zdoc-restored.png`, and `zdoc-restore-result.json`. This closes external ZDOC acceptance, but does not establish the remaining current-build Office, native paste or inbox-capacity cases.

## Spreadsheet composition build (2026-10-14)

Refreshed the bundled editors with the `d73726a` composition guard. The signing helper validated the existing application debug profile and matching certificate, then ran `hvigorw assembleHap` in its isolated build directory. All 10 packaged web files match `dist` byte-for-byte; the ZDOC UTD declaration also matches source. No native permissions or signing configuration were changed in Git.

Artifact: `releases/harmony/ZhuoleDocs-0.1.0-harmony-debug-d73726a.hap`, SHA-256 `568820110f8512829489027d0b12584a7d90306b2486427530b3e3c7ca03af2f`. The helper's standard HAP path contains the same new build. The previous HAP is preserved as `ZhuoleDocs-0.1.0-harmony-debug-74128965bc10.hap`; its prior acceptance evidence remains historical. Native version remains 0.1.0.

Installation on registered device `4UQ9K25530058677` succeeded without clearing data. Launch returned error 10106102 because the screen was locked. This establishes packaging, device signature acceptance and installation only. The existing case catalog describes the preceding `74128965...` HAP, not a fresh UI pass for this artifact. Current-build IME, Office picker and ZDOC regression require an unlocked device.

Evidence: `releases/harmony/ime-web-sync.log`, `ime-build.log`, `ime-artifact.json`, `ime-install.log`, and `ime-launch.log`. The material-bearing temporary signing configuration was removed by the helper; signing details were not copied into the repository.
