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

The default build produces `entry/build/default/outputs/default/entry-default-unsigned.hap`. No signing credentials or provisioning profiles are included. Configure a development signing profile for `com.youdroid.zhuoledocs` and the intended device before installation. An unsigned build is not a distributable release.

## Boundaries

- The resource interceptor serves only manifest-listed bundled editor files at the production HTTPS origin. `/api/` uses HTTPS network requests and the native WebView cookie store. An SDK callback typing mismatch requires a non-null assertion for the documented null network pass-through result.
- Main-frame navigation is restricted to the editor root. File access, mixed content and multiple windows are disabled. The bundled document CSP disallows remote scripts, frames and plugins.
- The JavaScript proxy exposes connection metadata, user-selected import/export and cookie clearing. It never exposes passwords, cookies or arbitrary filesystem paths.
- Imports accept DOCX, XLSX, PPTX and ZDOC, at most 10 MB. Exports use the system save picker, sanitize the suggested filename and enforce the same binary limit. Failed or partial I/O rejects the operation instead of reporting success.
- The existing per-origin/account IndexedDB cache and revision-based draft synchronization are reused. Their behavior inside ArkWeb still requires device acceptance.
- This initial host uses the fixed production service. Custom server switching, system incoming-file intents, background lifecycle reconnection and native distribution are pending. The UI file picker supports manual import.

## Verification

`npm test` covers the JavaScript adapter's binary round-trip, invalid payload, fixed-origin policy, cookie-clear invocation and command listener removal. It does not emulate ArkWeb or the native picker.

On 2026-10-13, `npm run harmony:sync` and `hvigorw assembleHap` succeeded with the local API 24 toolchain. A connected API 24 device was detected read-only. No application was installed: a matching signing configuration is not present. Native cookies, local resource loading, file picker behavior, offline editing, keyboard, safe areas and tablet/foldable layouts remain explicit runtime gates.
