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
