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
- This initial host uses the fixed production service. Custom server switching, system incoming-file intents and native distribution are pending. The UI file picker supports manual import.

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
