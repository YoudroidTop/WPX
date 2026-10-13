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
- The existing per-origin/account IndexedDB cache and revision-based draft synchronization are reused. Their behavior inside ArkWeb still requires device acceptance.
- This initial host uses the fixed production service. Custom server switching, system incoming-file intents, background lifecycle reconnection and native distribution are pending. The UI file picker supports manual import.

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
