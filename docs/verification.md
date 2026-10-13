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

## Android cache controls and iOS verification boundary — 2026-10-13

- Installed the current Android APK on the task-owned Zhuole_Docs_API35 emulator. Extended and executed `scripts/smoke-android.mjs` with real native HTTP isolation using removal of only port 3173's reverse mapping.
- Passed: exactly two synchronized body caches cleared while Word remained pending; process restart while offline; cleared sheet requires a connection; pending Word content survives; reconnect saves Word and re-downloads the sheet with SUM=200. The complete run also passed three editors, slideshow, independent server readback, second-account isolation and offline logout. Generated local test accounts/documents remain; the final app is logged out and the reverse mapping restored.
- Evidence: `releases/mobile/android-cache-controls.log` and `android-cache-cleanup.png`. No Android native-share scenario was requested in this run; prior export evidence remains separate.
- Installed and launched the current iOS simulator app preserving data. Screenshot `releases/mobile/ios-cache-build-workspace.png` confirms the existing Mobile QA session and previous test documents. CUA returned no application accessibility nodes and `windowNotFoundAtPosition` for content clicks even after selecting/raising/centering the dedicated window. No new iOS documents were created.
- Added a stable iOS case manifest and validated HTML report generation: one passed install/session case, three blocked interaction cases. Physical devices, iOS formulas/slides/cache and broader layouts are not claimed complete.

## Harmony system file inbox implementation — 2026-10-13

- Added singleton cold/warm `viewData` handling, Office MIME associations, a persistent eight-item/10 MB private inbox, event notification and bridge consumption into the existing login-gated confirmation flow. Picker imports now share the same bounded reader. No automatic cloud upload or source deletion occurs.
- Actual ArkTS service tests use a filesystem adapter and verify all supported extension byte round trips, fresh-instance recovery, consume-once, capacity, exact size boundary and rejected input, directory rejection, partial-copy cleanup and preservation of unrelated/source files. JS adapter tests cover pending-byte delivery, empty queue and native error translation. `npm test`: 17 passed.
- Harmony sync and signed build passed after fixing an ArkTS restriction on rethrowing an untyped caught value. Desktop build and all seven desktop integration tests passed.
- Updated development HAP installed successfully and checksum refreshed. Device launch remains blocked by the OS locked-screen condition. System file-manager matching, URI grants and live incoming confirmation are not claimed verified; existing native-picker evidence predates this shared-reader refactor.

## Harmony cache controls on the inbox build — 2026-10-13

- The physical API 24 device became available and launched the currently installed signed inbox build. The task-owned CDP forward was updated to its current process.
- `node scripts/smoke-harmony-cache.mjs` exited 0: two generated QA documents, one pending draft, synchronized-body cleanup, offline page reload, retained pending text, a cleared body requiring connectivity, cloud re-download, final pending-draft synchronization readback, generated-document cleanup and logout all passed. This run uses page-scoped API failure, not device-wide offline networking or process termination.
- Evidence: releases/harmony/device-cache-smoke.log and cache-cleanup.png. The dedicated QA account was verified before mutations.
- A subsequent native Office-picker regression attempt timed out before observing the expected save filename. The native layout showed the system control center, not the file picker; no new picker acceptance is claimed. Evidence: releases/harmony/device-inbox-build-picker-smoke.log and file-qa-layout.json. Generated picker QA data remains for follow-up; device interaction was stopped to avoid interference.

## Harmony picker regression and iOS formula acceptance — 2026-10-13

- Resumed the authorized API 24 device test on the installed inbox build. The first attempt selected coordinates from a covered save modal retained in the accessibility tree. Scoped the harness to the app's last modal and added polling for the active import picker and exported filename. No application code changed.
- After restarting only Zhuole Docs, the full native DOCX/XLSX/PPTX save-and-reimport script exited 0. Body text, formula result 200 and slide title all passed. Eight dedicated-account cloud documents were removed, including two interrupted-run fixtures; logout passed. Exported fixtures remain in Download. Evidence: `releases/harmony/device-inbox-build-picker-smoke.log`, `file-qa-result.json` and `native-*-roundtrip.png`.
- This closes the picker regression after the shared-reader refactor. External file-manager MIME matching, URI grants and cold/warm incoming-file delivery remain unverified.
- iOS browser mirroring restored touch and individual key input for the task-owned simulator. The named sheet `iOS-sheet-1013` showed SUM=200 before and after reopening. Read-only local server database evidence retained A1=120, A2=080 (numeric 80), B1=`=sum(a1:a2)`, revision 7. The fixture remains for inspection; no other simulator was operated.
- Evidence: `releases/mobile/ios-sheet-reopened.png` and `ios-sheet-server-readback.json`. The iOS QA catalog now records the formula case as passed; presentation and offline/cache remain unexecuted. This is simulator evidence, not physical iPhone acceptance.

## iOS slideshow safe-area repair — 2026-10-13

- Real simulator interaction found the fixed slideshow close control overlapping the iOS status bar; tapping it did not dismiss the slideshow. The native body padding did not constrain this fixed overlay.
- Inset the native slideshow by all four system safe-area values and give its close/navigation controls a minimum 44-point target. Desktop/web styling is unchanged. The rule also applies to native Android/Harmony hosts when they are rebuilt; those artifacts have not been refreshed for this delta.
- `npm run mobile:sync` and the task-scoped Debug simulator Xcode build passed. Installed the resulting app on Zhuole Docs QA only, preserving its session and data. Reopened `iOS-slides-1013`, verified its title, started slideshow, observed the close control below the status bar and successfully tapped back to the editor.
- Read-only local server database evidence retained `iOS slide qa`, revision 3. The dedicated QA document remains for inspection. Screenshots: `releases/mobile/ios-slides-presenting.png` (before), `ios-slides-safe-area.png` (after), `ios-slides-dismissed.png`; build log: `ios-slides-safe-area-build.log`.
- This validates portrait iPhone 17 Pro / iOS 26.1 Simulator. Physical iPhone/iPad, landscape and offline/cache acceptance remain open. The mirror was shut down by its exact simulator UDID; other simulators were not operated.

## Mobile artifact refresh after slideshow repair — 2026-10-13

- Rebuilt Android Debug and the development-signed Harmony HAP from `ce151b7`, and repackaged the previously verified iOS simulator app. The Android Gradle build and Harmony `assembleHap` completed successfully.
- Opened all three release archives and verified they contain the same `index-LT5bJQne.css` bundle with the native slideshow safe-area rule. Refreshed and checked `releases/mobile/SHA256SUMS` and `releases/harmony/SHA256SUMS` against the actual files.
- Installed the APK on the task-owned Android emulator and the HAP on the authorized Harmony device. Harmony launch was rejected because the screen was locked; no updated-build visual acceptance is claimed. Android's initial post-install launch lacked a live PID; an explicit `am start -W` subsequently completed a cold launch successfully, and the crash buffer contained no application crash evidence.
- Changed both native smoke harnesses to click the visible slideshow exit button and assert dismissal, replacing keyboard Escape so touch-only exit regressions are covered. Android runtime results are recorded below; the updated Harmony harness still awaits an unlocked device.
- Build logs: `releases/mobile/android-safe-area-build.log` and `releases/harmony/safe-area-build.log`. The three artifacts remain development/debug or simulator builds, not store-distribution packages.
- Android updated-build smoke reached successful three-editor persistence/server readback, clicked slideshow exit, and completed offline process restart/cache-clear/redownload with SUM=200. It then exited 1 waiting for the second test account's create button to become stable (20-second action timeout). This run does not prove the remaining account-isolation/logout portion; the earlier successful run remains historical evidence. Local QA data remains. Log: `releases/mobile/android-safe-area-smoke.log`. The finalizer restored the task emulator's API reverse mapping.

## Remote Cloudflare recovery and undo — 2026-10-13

- Resolved the isolated preview transport failure by requesting Wrangler's remote preview directly through Node's existing HTTP(S) proxy support, keeping its authorization headers in memory and rejecting redirects. The loopback forwarding path had timed out even for an ordinary no-op request; the direct path returned the expected 404 and then the rehearsal result.
- Two real remote runs exited 0, including the final runner with coordinated startup timeout handling and `finally` teardown. The deployed rehearsal Durable Object uses the production `AccountDocuments` repository but has no customer account or document bindings and no public routes.
- Before mutation: 3 documents, 1 trashed, 1,200,430 quota bytes, including multi-chunk Unicode Word text and a spreadsheet formula. After mutation: 2 documents, 0 trashed, 174 bytes. Restore reproduced the complete original document/metadata SHA-256 and counters; undo reproduced the changed SHA-256 and counters. This was Cloudflare PITR, not a local mock or an export/import approximation.
- Evidence: `releases/cloudflare/recovery-result.json` and `recovery-node-run.log`. Generated isolated objects remain for diagnosis, with no scheduled trigger. Preview processes exited after teardown. Production data and deployed application were unchanged.
- `node --check scripts/rehearse-cloud-recovery.mjs`, formatting, TypeScript cloud checking and diff checks passed. Production maintenance/write isolation, operator authorization, independent backups and customer recovery acceptance remain separate unfinished work.

## Android current-build regression completed — 2026-10-13

- Re-ran the unmodified `scripts/smoke-android.mjs` against the installed `ce151b7` Debug APK on the task-owned Zhuole_Docs_API35 emulator, after returning the previous registration screen to login.
- The process exited 0. Three-editor save/reopen, formula evaluation, visible slideshow exit, independent server readback, real offline process restart, cache cleanup/draft protection, spreadsheet re-download, second-account cache isolation, offline logout, and original-account recovery all passed.
- The previous registration button stability timeout did not reproduce. No product or test behavior was changed to bypass actionability checks. Retain the earlier failure log as historical evidence rather than treating this run as a root-cause diagnosis.
- Evidence: `releases/mobile/android-current-regression.log`. The finalizer restored `tcp:3173` reverse mapping; the test finished logged out. Generated local QA accounts/documents remain for inspection. Native sharing was not enabled in this run; prior sharing evidence and physical-device/store acceptance remain separate.

## iOS development IPA and current Harmony acceptance — 2026-10-13

- The iPhoneOS Release build and development-signed archive succeeded. Export succeeded with automatic signing and `method=debugging`, reusing the installed wildcard profile and Apple Development identity for team Y4MB2B6UD3. No provisioning updates or portal writes were enabled. Manual export of the Xcode-managed profile was rejected before switching to automatic export.
- `releases/mobile/ZhuoleDocs-0.1.0-ios-development.ipa` passed extracted deep/strict code-sign verification. Verified bundle `com.youdroid.zhuoledocs`, arm64, iPhoneOS, development entitlement, unexpired profile, and all 12 bundled web files byte-for-byte against the staged source. The profile covers 10 registered devices and expires 2027-07-14. All three mobile SHA-256 entries passed. This is development-device distribution; no physical iPhone was online and runtime acceptance remains open.
- Evidence: `ios-device-release-build.log`, `ios-device-archive.log`, `ios-device-export.log`, and `ios-development-verification.json` under `releases/mobile/`.
- After the user unlocked the Harmony device, the installed ce151b7 build passed DOCX/XLSX/PPTX native system save/picker import round trips. Verified Word text, spreadsheet SUM=200, and slide title. Six generated cloud documents were removed and the dedicated account logged out. Evidence: `releases/harmony/current-build-picker-smoke.log`, `file-qa-result.json`, and `native-*-roundtrip.png`.
- The current Harmony editor smoke also exited 0: three editors, visible slideshow exit, reload/persistence, API-failure offline draft recovery/sync, second-account isolation, offline logout and original-account recovery. Generated documents were removed and the test finished logged out. Evidence: `releases/harmony/current-build-editors-smoke.log`. This test does not establish external file-manager URI handling or device-wide network-loss behavior.

## Harmony external Office open and bridge repair — 2026-10-13

- Found two device defects: the file-manager open-with panel excluded Zhuole Docs without `linkFeature: FileOpen`; native pending-file calls registered in `asyncMethodList` consumed the file but returned `0` to JavaScript. Added FileOpen to the existing four MIME declarations and registered result-bearing bridge methods in `methodList`. No additional file permission or accepted MIME type was added.
- Physical API 24 device checks passed: system DOCX open and explicit text import, final-build cold XLSX import with SUM=200, warm PPTX title import, logged-out deferral until login, and cancellation/reload without another cloud document. Three exact test IDs were removed and source samples retained. No upload happened before confirmation.
- Final debug HAP built and installed; 17 unit tests passed. The final three-format native save/picker reimport regression also exited 0, with six generated cloud documents removed and the account logged out. SHA-256 was refreshed and verified. No temporary diagnostics remain.
- Evidence: `releases/harmony/external-open-result.json`, `external-docx-imported.png`, `external-xlsx-imported.png`, `external-pptx-imported.png`, `external-login-deferred.png`, `file-open-build.log`, `file-open-tests.log`, and `file-open-picker-regression.log`. DOCX cold-open evidence includes a temporary diagnostic build with identical bridge/manifest behavior; XLSX/PPTX, login/cancel and picker regression were repeated on the final build.
- External ZDOC MIME association and physical queue-full feedback remain unverified. Existing unit coverage for queue capacity does not replace those device gates.

## Harmony ZDOC type declaration — 2026-10-13

- Added the missing custom UTD declaration linking `.zdoc` to the existing native backup MIME and a bundle-scoped type identifier. Only this extension is registered; generic JSON remains outside the ability's advertised MIME list.
- Development signing/build passed. Inspected the final HAP archive: declaration bytes match source and its MIME matches the FileOpen manifest entry. Refreshed and verified the HAP SHA-256. Evidence: `releases/harmony/zdoc-type-build.log` and `zdoc-type-verification.json`.
- Created a dedicated Word cloud fixture and selected confirmation in the application's native backup save sheet; the resulting file has not been independently read back. The device then became active in an unrelated application, so interaction stopped. The new HAP is not installed; external ZDOC discovery, URI delivery and complete-model restore remain unverified. The previously installed Office-verified build remains on the device.
- Configuration review under the Harmony development/review skills found no P0/P1/P2 issues. No editor/runtime code changed; no broad editor regression was rerun for this resource-only change.

## Spreadsheet paste data-loss prevention — 2026-10-13

- Removed silent row, column and cell-text truncation from multi-cell clipboard paste. The full rectangle is validated before cloning/updating cells; an over-limit paste produces an accessible error and leaves all existing cells unchanged. The existing 10,000-character schema limit is shared with the editor and parser. Single-cell native text insertion is unchanged.
- All 20 unit/API tests passed; the dedicated browser regression passed (1/1). Verified row/column/length rejection, saved-content preservation after reopening, legal CRLF paste, blank-cell clearing and formula result 200. Exact last-row/last-column/cell-length acceptance is covered by unit tests. Application build and Cloudflare TypeScript checks passed.
- Deployed the web app to `https://wpx.youdroid.top`, version `35e5bc4a-d294-46cb-b75a-839bf85ba7ef`, confirmed at 100% traffic. The previous version `ef808837-acc9-40fe-8236-ca260e847641` remains the code rollback target. No storage migration or binding changes were made.
- Live Chromium smoke passed all three editors plus all three rejected clipboard cases, Word reload, logout and generated-document cleanup. Public health returned success; anonymous `/api/me` returned 401. Evidence: `releases/cloudflare/paste-deploy.log`, `paste-postflight-deployments.log`, and `paste-live-browser.log`. The generated empty test account remains.
- Existing desktop/mobile packaged assets have not been rebuilt for this editor change. Their earlier verification does not establish this paste fix in installed clients. WPX-5 tracks the delivery boundary.

## Mobile paste-fix artifact delivery — 2026-10-13

- Rebuilt from `a443485`: Android Debug APK, iOS Debug simulator ZIP, iOS Release development IPA, and development-signed Harmony HAP. Capacitor sync, Gradle, Xcode build/archive/export and `hvigorw assembleHap` succeeded. No provisioning updates were requested.
- Opened all four archives and compared every one of the 10 current `dist` files byte-for-byte, including the complete asset filename set to reject stale bundles. All include `index-BKPtCBwA.js`. The HAP also contains the exact ZDOC custom type declaration. Regenerated and verified both mobile and Harmony SHA-256 lists. Evidence: `releases/mobile/paste-artifact-verification.json`.
- Extracted the new IPA with resource preservation: deep/strict signature verification passed, with arm64/iPhoneOS, the expected bundle/team identifier, development entitlement, and an unexpired profile covering 10 registered devices. This remains a development package, not store distribution.
- Installed the APK on the task-owned Zhuole_Docs_API35 emulator. The expanded Android smoke exited 0: three oversized clipboard rectangles were rejected with unchanged cells; three-editor persistence, slideshow, independent server readback, offline process restart/reconnect, cache cleanup/draft protection, account isolation, offline logout and original-account recovery all passed. The clipboard cases dispatch DOM paste events into the real WebView, not Android keyboard clipboard gestures. The visible error and preserved 120/80/200 values were inspected in `android-paste-rejected.png`.
- Evidence: `releases/mobile/paste-android-smoke.log`, `paste-sync.log`, `paste-android-build.log`, `paste-ios-simulator-build.log`, `paste-ios-archive.log`, `paste-ios-export.log`, and `releases/harmony/paste-build.log`. Local generated QA accounts/documents remain; the smoke logged out and restored the API reverse mapping.
- New iOS and Harmony artifacts were not installed during this run. Their prior runtime evidence remains historical. Desktop installers still need the paste fix; WPX-5 stays in progress until that delivery is completed.
