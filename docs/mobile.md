# Mobile clients

## Scope and implementation

Phase three targets iOS, Android, and HarmonyOS. Native implementations exist for iOS and Android, with the HarmonyOS ArkUI/ArkWeb client described in `docs/harmony.md`. A development-signed HarmonyOS build has passed physical-device editor, file-picker and lifecycle scenarios. The app is named 卓乐文档 and embeds the same three editors used by the web and desktop clients. The bundled UI works without downloading executable application code from the cloud service.

Capacitor provides native HTTP, preferences, filesystem, sharing, app lifecycle, and keyboard integration. A common native bridge keeps desktop behavior intact while enabling server configuration, local drafts, account-scoped caching, revision-aware synchronization, and file export on mobile. Native HTTP sends the configured service Origin; the existing API authentication and 3 GB quota enforcement remain authoritative. Cookies are handled by the native transport and removed on logout. Only HTTPS roots and loopback HTTP development addresses are accepted.

The mobile UI includes safe-area padding, a contained scrolling viewport, 44-point icon controls, a horizontally scrollable formatting toolbar, visible backup controls, and a connection button on the workspace/login screen. Android back returns from an editor through its save queue or dismisses the current workspace dialog. Returning to the foreground retries synchronization.

Import uses the system file chooser exposed by the WebView file input. Export writes a cache file and presents the native share sheet; the user chooses Files or a receiving application. Shared files remain in the app cache so the receiving app can finish reading them. After creating a new export, the client prunes generated export copies older than seven days. It only removes a UUID-v4 directory containing exactly one recognized Office/ZDOC file when both directory and file modification times are older than the retention window. Recent files, malformed paths, unknown contents and offline drafts are preserved; cleanup failure does not block sharing. A share-sheet result is not proof that an external recipient persisted a file. Incoming system document opens on iOS and content-URI open/share intents on Android copy DOCX, XLSX, PPTX, and ZDOC files into a private persistent inbox (10 MB per file, eight pending files). The UI asks for confirmation before cloud import and processes one file at a time. Taking a file into the confirmation dialog consumes its inbox copy; cancellation or process termination at that point requires reopening the original source. Source files are never deleted. The export-copy retention policy is implemented; complete cross-platform native offline acceptance remains follow-up work.

## Build

```sh
npm ci
npm run mobile:sync
```

Android requires JDK 21 and Android SDK 36 to build, and Android System WebView 111 or newer to run the editor bundle. Older WebViews receive a local update-required page. iOS deployment targets version 16.4 or newer, matching the bundled browser feature baseline. Set `JAVA_HOME` and `ANDROID_HOME` to the installed toolchains, then run:

```sh
./android/gradlew -p android assembleDebug
```

The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`. Only the debug manifest permits cleartext networking for loopback development. Release builds use the HTTPS policy. Android backup is disabled to avoid copying cached private documents and sessions into an unrelated backup account.

The iOS project uses CocoaPods source builds. `Capacitor` and plugins resolve from locked npm packages. The application-owned IONFilesystemLib podspec compiles upstream 2.0.0 sources pinned to commit `13848aab4f3447ff98dfdbe72ff8ef31bf333db0`; it avoids a separate precompiled GitHub release download. No upstream implementation is modified. The privacy manifest declares UserDefaults and file timestamp API reasons used by these plugins.

```sh
pod install --project-directory=ios/App
xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -derivedDataPath releases/mobile/DerivedData CODE_SIGNING_ALLOWED=NO build
```

Use the `.xcworkspace`, not the `.xcodeproj`, for iOS. Simulator builds do not produce a distributable IPA. Physical-device signing and store distribution have not been configured.

For local Android emulator testing, map port 3173 with `adb reverse tcp:3173 tcp:3173` and connect to `http://127.0.0.1:3173`. The iOS simulator can use the same host loopback address directly. Public deployment uses an HTTPS server.

## Current evidence and remaining gates

See `docs/verification.md` for checks actually completed. Web viewport checks do not establish keyboard, lifecycle, or native file behavior on every OS. The public Cloudflare service is deployed. Windows runtime acceptance, the remaining mobile native scenarios, signing, and store publication remain separate work items. The full project goal is still active.

The selected public service target is `https://wpx.youdroid.top` on Cloudflare. Deployment and live API/browser checks are recorded in WPX-4 and `docs/verification.md`.

The shared iOS/Android first-connection form pre-fills `https://wpx.youdroid.top`; users can connect directly or enter their own service. Saved connections are not overwritten. The Android 35 emulator with WebView 124 has passed editor persistence, offline drafts and account isolation checks; those results remain separate from physical-device acceptance.

## Android native smoke

`scripts/smoke-android.mjs` attaches Playwright to the task-owned Android debug WebView on emulator-5554 using CDP with `noDefaults: true`; ordinary Chromium context/download overrides are unsupported by Android WebView. It requires a running local test API on port 3173, an installed debug APK, and `ADB` pointing to the Android platform-tools executable. The first run validates the production default before selecting the loopback test service. Subsequent runs use the saved local connection.

The test creates random local-only credentials, exercises all editors through the rendered WebView, checks native HTTP persistence through an independent host API session, and logs out. Its offline phase removes only the emulator's port-3173 reverse mapping, restarts the application process, writes a cached draft, restarts again, restores the mapping, and retries synchronization. It never changes device-wide networking and restores the mapping in its finalizer. Local generated test accounts/documents remain available for inspection. It does not establish physical-device keyboard, accessibility, store-signing, or iOS/HarmonyOS acceptance.

### Android account isolation and export smoke

With the task-owned `Zhuole_Docs_API35` emulator running the debug application, the local API on port 3173, and the emulator port reverse configured, run:

```sh
node scripts/smoke-android.mjs
ANDROID_SHARE_QA=1 node scripts/smoke-android.mjs
```

The default scenario includes account switching, offline restart isolation, offline logout and original-account recovery. The optional scenario additionally checks native Office exports and their ZIP/XML bytes through the system share chooser. It requires a responsive Android System UI; cancellation must return control to an enabled export button. The first 2026-10-13 attempt was interrupted by a System UI ANR. After the system recovered and the harness was corrected to inspect the current foreground chooser rather than historical activity records, all three exports passed ZIP/XML verification and chooser dismissal. This proves file generation and the chooser cancellation path; it does not prove that an external app persisted a received file.

## Local document cache controls

Native account settings offer a two-step **清理已同步缓存** action. It removes only downloaded document bodies for the current service/account, preserving library metadata, the active account, every pending draft and its cached body, and all other namespaces. Draft detection and deletion share one IndexedDB read/write transaction. The action does not send cloud mutations or touch native exports/incoming files. Cleared documents require a network connection to reopen; subsequent opens cache them again.

The Electron integration test verifies cancellation, exact before/after IndexedDB contents, foreign-account/service preservation, offline draft reload and later cloud redownload. This shared implementation is bundled in mobile builds; each native runtime's acceptance remains separately recorded.

## Native cache acceptance and iOS case catalog

The Android smoke now clears the two synchronized body caches while its Word draft is pending. It restarts the real app process with the service reverse mapping removed, verifies that the cleared spreadsheet cannot open offline, recovers the Word draft, reconnects and re-downloads the spreadsheet with SUM=200. This scenario passed on the updated API 35 emulator, together with the existing three-editor, account-isolation and logout scenarios. Evidence: `releases/mobile/android-cache-controls.log` and `android-cache-cleanup.png`.

The iOS case catalog is `docs/qa/ios-cases.json`. Run `node scripts/report-ios-qa.mjs` to validate case references/results and generate `releases/mobile/ios-qa-report.html`. The current run verifies install/launch and restored QA session from a native screenshot. Spreadsheet, presentation and cache scenarios remain blocked by Simulator UI automation returning no app elements and rejecting content clicks; these are not recorded as application failures or passes. The other project's simulator was not operated.
