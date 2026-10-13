# Delivery verification

Verified locally on 2026-10-13 using Node.js 24.19.0.

## Automated results

- `npm test`: 9 tests passed. Coverage includes account isolation, CSRF, password hashing/rotation/logout, stale/concurrent writes, byte-exact quota and trash accounting, formula evaluation/errors, unsafe input validation, bounded ZIP imports, OOXML export/import, native backups, and malformed/deep document trees.
- `npm run build`: TypeScript checking and Vite production build passed. The rich-text editor is a separate lazy-loaded chunk.
- `npm run test:e2e`: 4 Chromium scenarios passed. Coverage includes creating/editing all three document kinds, saving/reopening, Office downloads, search/star/trash/restore, conflict backup, native import, rich-text table persistence, renaming, profile edits, logout, and mobile layout overflow.
- `npm run format:check`: passed.
- `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org`: zero known vulnerabilities. Scoped overrides upgrade ExcelJS's UUID dependency and PptxGenJS's image-size dependency; Office round-trip tests pass with these versions.

## Visual inspection

Reviewed generated screenshots of the 1440 px workspace, 390 px workspace, desktop login, and slide editor. Content is visible after transitions, mobile navigation retracts correctly, and the workspace has no horizontal page overflow. Browser tests also captured Word and spreadsheet editor screenshots.

Screenshots are generated under `test-results/` and excluded from Git. Test accounts belong to a separate disposable test database; they are not bundled in the user application.

## Limits of this evidence

The checks establish a local web MVP. They do not establish production deployment, multi-user load capacity, complete Office format fidelity, screen-reader certification, desktop installer delivery, mobile native delivery, or physical-device acceptance. Public hosting still needs HTTPS, trusted proxy configuration, persistent storage, backups, and operational validation.

## Phase-two desktop checkpoint

Implemented Electron clients with bundled editors, native menus and file dialogs, server configuration, account-scoped offline drafts, reconnect synchronization, conflict-copy recovery, and native ZDOC file-open handling.

- `npm run desktop:build`: TypeScript, Vite, and Electron main/preload bundling passed.
- `npm run test:desktop`: six Electron scenarios passed, including native disk backup, offline persistence across process restart, conflict recovery from the draft list, account switching/offline logout, startup file arguments, and a packaged macOS launch. Dialog selections are deterministic test substitutions; actual IPC reads/writes are exercised.
- The nine API/model tests and four web regression scenarios passed with the desktop integration.
- macOS arm64/x64 DMG and ZIP artifacts and Windows x64/arm64 NSIS artifacts were generated under `releases/desktop/`. Both macOS application bundles passed `codesign --verify --deep --strict` with ad-hoc signatures. Windows executables are unsigned; PE headers identify x64 and ARM64 respectively.
- Packaged Apple Silicon macOS UI was actually launched and inspected. Windows and Intel macOS runtime acceptance remain unverified.
- ASAR payloads contain only main/preload code, bundled web assets, and package metadata, with no API server or node_modules directory. Build staging removes only its generated web directory before copying assets, preventing stale hashed bundles from accumulating.
- Production dependency audit: zero known vulnerabilities. The development toolchain audit reports eight moderate findings in the electron-builder download/logging dependency chain; these dependencies are not included in the application payload.

Desktop screenshots are `test-results/desktop-offline.png`, `test-results/desktop-workspace.png`, and `test-results/desktop-packaged.png`. Installer SHA-256 checksums are written beside the generated artifacts in `releases/desktop/SHA256SUMS`.

This is a local desktop development delivery, not a signed public release. Developer ID/notarization, Windows code signing, a verified update distribution service, public cloud deployment, and Windows native installation/runtime checks remain open. Mobile clients have not yet been delivered.

## Phase-three mobile foundation checkpoint

- `npm test`: ten tests passed, including native HTTP JSON/error handling, binary Office bytes, cookie-header removal, and 204 responses.
- `npm run test:e2e`: five scenarios passed. The added mobile editor check exercises Word, sheets, and slides at 360×780, 430×930, 780×360, 768×1024, and 1024×768, verifies no document-level horizontal overflow, visible return controls, and 44-point return targets.
- `npm run test:desktop`: six scenarios passed after introducing the common native bridge. The previously built macOS artifact remains the prior desktop checkpoint; mobile changes do not imply a newly distributed desktop release.
- iOS simulator source build and Android `assembleDebug` passed. iOS uses CocoaPods and a pinned source podspec after the original SPM binary release download stalled; the failing binary route is not the delivered build path.
- On the iPhone 17 Pro / iOS 26.1 simulator, the installed app connected to the local API, signed in, restored its session after reinstall/relaunch, created/opened a Word document, and saved `Created on iPhone.`. Independent API readback returned revision 2 with that exact content. The DOCX export reached the real iOS share sheet; the 9,560-byte cache file was opened as ZIP and its `word/document.xml` contained the same text.
- Native visual testing found and fixed retained login scrolling obscuring the editor header. The fixed build was reinstalled; the workspace, document title, return button, save state, and export controls were visibly below the system status area.
- The Android APK installed and its activity launched on an Android 12 emulator, but its bundled WebView 91 is below the supported WebView 111 baseline. This is not Android editing acceptance. A local update-required page now guards unsupported engines; a newer Android emulator image is being prepared for further validation.

Remaining mobile gates: Android supported-engine interaction, native spreadsheet/presentation editing, full offline/reconnect/account isolation on both mobile platforms, incoming OS file/share integration, software-keyboard and text-scaling coverage, iPad/native landscape acceptance, cache retention policy, physical-device signing, and store distribution. Current packages are development artifacts. Public cloud deployment and desktop distribution gates remain open separately.

## Native document inbox checkpoint

- iOS simulator and Android debug builds passed with application-owned native inbox plugins.
- Android `:app:connectedDebugAndroidTest` passed on the Android 12 emulator: a FileProvider content URI delivered through ACTION_SEND produced byte-identical private inbox contents, persisted across activity restart, and preserved the original source. This verifies the native transport, not editing under its unsupported WebView 91.
- iOS simulator system file URL dispatch opened the import confirmation with the correct ZDOC filename and size. A valid fixture imported successfully into the local cloud service. An invalid fixture was rejected without creating a document.
- Ten unit/API tests, five web scenarios, and six desktop scenarios passed after the serialized native import-dialog change.
- A broad Gradle test invocation initially overlapped Capacitor sync and failed on a regenerated Cordova metadata path; the final app-scoped run was executed after sync and passed.

The platform requirement now includes HarmonyOS. Cloudflare hosting at `wpx.youdroid.top` is selected and tracked separately; no public deployment is claimed by these native checks.

## Cloudflare runtime checkpoint

- `npm run cloud:build` passed TypeScript checks, the web build, and Wrangler dry-run bundling (approximately 784 KiB gzip). No remote deployment occurred.
- `npm run test:cloud` passed against local workerd with actual SQLite Durable Objects: account registration and login, owner isolation, CSRF rejection, concurrent revisions, all three Office export/import round trips, trash usage, stale deletion rejection, profile update, password rotation, prior-session invalidation, logout, and >2 MB Unicode content.
- `npm run test:cloud:browser`: all five workspace/editor/browser scenarios passed against a separate local workerd instance. The conflict fixture now uses the active origin and asserts that its simulated competing update actually succeeded.
- `npm test`: all 13 unit/API/model/storage tests passed. Formatting and diff checks passed.
- Runtime testing exposed and fixed the Node-only JSZip stream dependency and blank-sheet ExcelJS columns handling. These shared fixes preserve the bounded decompression checks on both server runtimes.

Production plan capacity, domain attachment, public deployment, live acceptance, and recovery checks remain open under WPX-4.

## First public Cloudflare acceptance — 2026-10-13

`https://wpx.youdroid.top` is deployed at Worker version `ef808837-acc9-40fe-8236-ca260e847641` with 100% traffic confirmed remotely.

- Live API smoke passed HTTPS health, unauthenticated 401, registration with Secure/HttpOnly cookies, exact 3 GB account allowance, private document access, DOCX/XLSX/PPTX ZIP exports, updates, stale-write 409, test-document deletion and logout. Generated documents and sessions were cleaned up; empty generated accounts remain.
- Real Chromium smoke passed registration, Word save/reopen persistence, SUM formula result 200, slide presentation mode, reload and logout. No page errors were observed. Generated test documents were removed.
- The first local DNS lookup failed before the new hostname resolved locally. Public Google DNS returned Cloudflare addresses, and both TLS-preserving pinned-address HTTP and existing-proxy HTTPS reached the production API. No certificate checks were disabled.
- Initial code deployment has no earlier rollback version. Data restore rehearsal, signed client distribution and HarmonyOS implementation remain open; these are not implied by web acceptance.

## Android native editing and offline acceptance

On the task-owned Android 35 emulator with WebView 124.0.6367.219 and the installed debug APK, `scripts/smoke-android.mjs` passed against the local API through native Capacitor HTTP:

- Registration/login, Word text editing, spreadsheet SUM result 200, slide title editing and presentation mode, save, reload/reopen, and logout.
- Independent host-side authenticated API readback confirmed all three document models, including the exact Word text, stored formula and slide title.
- Removed the emulator's API reverse mapping, force-stopped and restarted the app, opened the cached Word document, and saved an offline draft. A second process restart preserved that draft. Restoring the mapping and retrying synchronization reached the saved-to-cloud state; reopening retained the edited content.
- The reverse mapping is restored in the test finalizer. No device-wide networking was changed. Local test fixtures remain available for inspection.
- `releases/mobile/android-word.png` was visually inspected: the title, saved state, formatting controls, document text and export controls were visible. This screenshot is a WebView surface capture and does not prove software keyboard or system share-sheet behavior.

The first full native smoke passed before offline coverage was added. During offline test development, a GUI emulator exited with status 134; a headless restart preserved its data and completed boot. Early retries exposed test harness timing assumptions (missing PID immediately after launch and a 5-second assertion shorter than the native offline timeout); the final run uses bounded startup polling and a 45-second assertion budget and passed end to end. No app authentication or document model changes were required.

Still open: Android native share/export acceptance, account-switch isolation under native storage, physical keyboard/touch/accessibility coverage, iOS equivalent full offline acceptance, and HarmonyOS implementation.

## HarmonyOS host foundation — 2026-10-13

- Added an ArkUI/ArkWeb host with manifest-limited local editor assets at the production HTTPS origin, native document pickers, bounded binary import/export and cookie clearing.
- `npm run harmony:sync`: passed (TypeScript and production bundle).
- `hvigorw assembleHap`: passed using Huawei Command Line Tools 6.24.4 and SDK API 24. Output is unsigned; no distribution or installation claim.
- `npm test`: 14 passed, including a Harmony adapter contract test with 20,000 binary bytes, origin rejection, malformed input and listener cleanup.
- `npm run test:e2e`: 5 passed, covering all three editors and responsive mobile layouts.
- Review: `docs/harmony-review.md`; native API may-throw advisories remain, with rejected file operations surfaced by the shared adapter.
- `npm run desktop:build` and `npm run test:desktop`: passed, including all 6 desktop checks.
- A connected HarmonyOS API 24 device was detected read-only. No matching application signing configuration is available; native runtime acceptance remains pending.
- Artifact: `releases/harmony/ZhuoleDocs-0.1.0-harmony-unsigned.hap` (ignored build output).

## Android account isolation and native export attempt — 2026-10-13

- Extended `scripts/smoke-android.mjs` with a second account, offline process restart, absence of the first account's document, offline logout, another process restart requiring login, and recovery of the first account's document after reauthentication.
- `node scripts/smoke-android.mjs`: passed on the task-owned API 35 emulator / WebView 124. The same run also passed all three editor flows, independent server readback and offline draft recovery/synchronization. No page errors were reported.
- Optional `ANDROID_SHARE_QA=1 node scripts/smoke-android.mjs` exercises native Office export, system chooser appearance, private-cache ZIP/XML byte readback and chooser dismissal. This optional scenario did not pass: DOCX generation and `word/document.xml` content assertions passed, but the emulator displayed `System UI isn't responding`; the chooser remained active and the export button remained busy while it was open.
- XLSX/PPTX native export and successful chooser dismissal are not claimed. This attempt does not establish an application defect. Revalidate the optional scenario on a responsive emulator or physical device; do not bypass the busy-state assertion.
- Test fixtures use random local accounts on port 3173. The script restores the task-owned emulator's port mapping in `finally`, and no production accounts were mutated.

## Android native Office export acceptance — 2026-10-13

- Rechecked the live task-owned emulator: System UI had recovered, and the application was foreground.
- The next attempt exposed a harness race: `dumpsys activity` includes historical chooser records. Changed the assertion to require the currently resumed chooser and poll for a newly generated export file. Dismissal additionally requires the app to become foreground and the export control to become enabled.
- `ANDROID_SHARE_QA=1 node scripts/smoke-android.mjs`: passed. DOCX `word/document.xml` contains the authored text; XLSX `xl/worksheets/sheet1.xml` contains `SUM(A1:A2)`; PPTX `ppt/slides/slide1.xml` contains the authored title. Each file was read from the native app cache as ZIP bytes. Each native chooser opened and dismissed successfully.
- The same run passed editor persistence, offline draft process restart and synchronization, second-account isolation, offline logout and original-account recovery, with no page errors.
- Evidence: `releases/mobile/android-share-passed.log`. This supersedes the earlier unsuccessful chooser attempt for emulator acceptance. It does not establish persistence by an external receiving app or physical-device behavior.

## Mobile export cache retention — 2026-10-13

- Implemented seven-day retention for generated iOS/Android export copies. Cleanup is restricted to UUID-v4 directories under the app's export cache, containing exactly one recognized file; both modification times must be expired. No recursive deletion is used. Offline drafts and user originals are outside this path.
- `npm test`: 16 passed, including cutoff, recent file, unsafe path, nested contents, invalid time and failed-removal behavior. `npm run mobile:sync`, Android `assembleDebug` and unsigned iOS simulator `xcodebuild`: passed.
- Installed the new Android debug APK with data preserved. Seeded an expired generated cache fixture and a recent fixture; after a real export, readback confirmed the expired directory was absent and the recent file remained. Removed only the test-owned recent fixture afterward.
- `ANDROID_SHARE_QA=1 node scripts/smoke-android.mjs`: passed on the updated APK, including all three native exports, offline recovery and account isolation. Log: `releases/mobile/android-cache-retention.log`.
- Refreshed the ignored Android debug APK and iOS simulator ZIP plus `releases/mobile/SHA256SUMS`. iOS native cleanup execution remains unverified; shared policy tests and its simulator build passed.

## Harmony signed physical-device acceptance — 2026-10-13

- Located the user-provided development profile, verified bundle `com.youdroid.zhuoledocs`, validity, device authorization and matching certificate in the reference PEM chain. Signed in an ignored private build copy; no signing passwords/profile contents enter Git.
- Signed HAP installation succeeded. Initial launch was blocked by the locked screen; the user unlocked it. The first real launch then exposed a synchronous WebView controller exception in `onPageShow`. Added an attachment guard and synchronous/async error handling, rebuilt, signed and installed successfully.
- `node scripts/smoke-harmony.mjs`: passed against the actual API 24 device ArkWeb. Production account registration, Word editing/save/reload, spreadsheet SUM=200, slide edit/presentation and logout all passed without page errors. Three generated test documents were removed; the empty QA account remains.
- Visually inspected login and workspace screenshots under `releases/harmony/`. The native bridge was present and mobile CSS active. No file-picker or offline-device acceptance is claimed yet.
- Artifact: `releases/harmony/ZhuoleDocs-0.1.0-harmony-debug.hap`. Log: `releases/harmony/device-smoke.log`. This is development signing, not a store release.

## Harmony offline draft and account isolation — 2026-10-13

- Extended the physical-device ArkWeb smoke to abort only this debug page's `/api/` requests. Device-wide networking and unrelated applications were unchanged, and the route is removed in `finally`.
- Passed: offline cached library, Word draft editing, page reload preserving the draft, reconnection, saved indicator and independent authenticated API readback of the synchronized content.
- Passed: a second named account has an empty library after offline reload, cannot see the first account's Word document, and offline logout remains logged out after another reload. Reauthentication restores the original account's document.
- The first attempt timed out after the default five seconds during second-account registration, while the form was still pending. The final run used a 30-second assertion timeout and passed. Failure logging now omits Playwright registration snapshots to avoid recording generated passwords.
- The successful run removed its three generated documents and logged out. The earlier interrupted run left three test documents in its generated QA account; no real user data was involved. These fixtures are not represented as cleaned up.
- Log: `releases/harmony/device-offline-smoke.log`. This verifies page reload persistence and API failure recovery on the actual device, not application-process termination, airplane mode or background lifecycle behavior.

## Harmony native Office file round trip — 2026-10-13

- On the physical API 24 device, saved DOCX through the native system save picker into Download, reopened it through the native document picker, confirmed cloud import and verified the original body text. Declined the system password-vault prompt for the generated QA credentials.
- Added and executed `scripts/smoke-harmony-files.mjs`, then completed one full run covering DOCX, XLSX and PPTX with unique output filenames. It asserts the dedicated QA account before mutations and derives picker targets from fresh native accessibility layouts.
- Verified reimported Word text, spreadsheet formula result 200, and presentation title. The native save callback completed and editing remained available. All six cloud documents from the final run were deleted and the app logged out; the earlier manual Word and first sheet/slide run's six cloud documents were also cleaned up.
- Evidence: `releases/harmony/native-docx-roundtrip.png`, `native-xlsx-roundtrip.png`, `native-pptx-roundtrip.png`, `file-qa-result.json`, and `native-file-smoke.log`.
- Exported test files remain in device Download for inspection. This proves persistence through the system picker and later native readback; receiving file-open intents from other apps remains separate work.

## Harmony native foreground recovery — 2026-10-13

- `scripts/smoke-harmony-lifecycle.mjs` passed on the connected API 24 device. It confirmed a persisted offline Word draft, actual native Home/background transition, hidden WebView state, restored API access, ability foreground transition and visible WebView state.
- The app synchronized automatically after foregrounding; the test neither clicked reconnect nor dispatched an online event. Authenticated server readback contained the draft text. The existing page-show hook was sufficient, so no application lifecycle code was changed.
- The final run cleaned up its uniquely named document, removed the page-only API interception, reloaded and logged out. Device networking and unrelated app state were not changed.
- Evidence: `releases/harmony/device-lifecycle-smoke.log`. This proves a normal background/foreground cycle, not application-process termination or OS memory-pressure recovery.

## Harmony process restart session repair — 2026-10-13

- The first force-stop/new-process test lost the authenticated session despite a persistent server cookie. Added awaited ArkWeb `saveCookieAsync()` after successful login/registration, and after logout cookie removal. The optional bridge hook preserves other platforms' existing authentication flow.
- Rebuilt, development-signed and installed the HAP. `HARMONY_RESTART_QA=1` passed: page-only API failure, persisted pending draft, force-stop before disconnecting inspection, old PID exit, distinct new PID, restored login, draft recovery and authenticated server readback after synchronization. The script exited successfully and logged out.
- Removed the exact earlier failed-run document from the verified dedicated QA account. No other account's data was modified. Log: `releases/harmony/device-restart-smoke.log`.
- `npm test`: 16 passed. Harmony sync/signing and desktop build passed. Web E2E: 5 passed. Desktop suite: 5 passed, one timeout locating the document after restart; that exact test passed on an isolated rerun. The initial desktop failure remains recorded as intermittent, without claiming its cause is established.
- Review found no unresolved P0/P1 issues in this delta. This verifies process restart with networking restored, not device-wide offline cold start, OS memory pressure, or formal distribution.

## Native account cache controls — 2026-10-13

- Implemented two-step clearing of synchronized document bodies for the active service/account. A single IndexedDB read/write transaction preserves pending drafts and their body caches; directory metadata, sessions, foreign accounts and foreign origins are untouched. Cloud documents are never mutated by this action.
- New Electron integration test passed: cancel leaves exact contents unchanged; confirm removes exactly the eligible body; reload while offline still opens the pending draft; removed body reports that a connection is needed, then reopens with original content online.
- Full desktop suite: 7 passed. Web E2E: 5 passed. Unit tests: 16 passed. Desktop build, mobile sync, Android debug build, iOS simulator build and Harmony development signing passed. Refreshed the ignored Android APK, iOS simulator ZIP and checksums. The updated Harmony HAP was installed.
- The earlier desktop restart lookup timeout did not recur in five consecutive targeted runs or the full suite. Its cause remains unproven; no speculative change was made to that flow.
- Added a dedicated Harmony cache harness. Its initial connection attempt timed out before any test mutation; the device then reported a locked-screen launch block. Requested unlock. Cache UI runtime acceptance on Harmony/iOS/Android remains open; prior editor/lifecycle acceptance remains separate.
