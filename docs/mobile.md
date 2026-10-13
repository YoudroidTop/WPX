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

Use the `.xcworkspace`, not the `.xcodeproj`, for iOS. Simulator builds do not produce a distributable IPA. A development-signed device IPA is now available using an existing local team profile; physical-device runtime and store distribution remain unverified.

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

The iOS case catalog is `docs/qa/ios-cases.json`. Run `node scripts/report-ios-qa.mjs` to validate case references/results and generate `releases/mobile/ios-qa-report.html`. Recorded simulator checks cover restored login, spreadsheet formula persistence and presentation editing/reopening/slideshow dismissal. Browser mirroring restored touch and individual key input. Presentation acceptance exposed a close control under the iOS status bar; native safe-area insets and 44-point controls fixed the defect and passed a rebuilt simulator run. Offline/cache also passed on the ce151b7 simulator build: the app-specific loopback proxy disconnected its service, synchronized caches were cleared with a Word draft pending, and a real process restart preserved the draft. The cleared spreadsheet required networking and downloaded again after reconnection. Independent server readback confirmed draft synchronization and the spreadsheet original unchanged. Evidence is listed in the case catalog. Physical-device, landscape and tablet acceptance are separate gates. Other projects' simulators were not operated.

### iOS service fault injection

Run the local API on port 3173, then `node scripts/mobile-qa-proxy.mjs`. After logging out, connect the simulator app to `http://127.0.0.1:3174` and use a dedicated QA account. Enter `offline` to close connections, `online` to restore forwarding, and `quit` to stop the proxy. Only loopback API requests are accepted; this does not change system networking or other clients using port 3173. Restore the app connection to port 3173 after logout before stopping the proxy. Credentials and generated evidence stay under ignored `releases/mobile/`.

### iOS development device package

`releases/mobile/ZhuoleDocs-0.1.0-ios-development.ipa` is a Release-configuration arm64 device build, signed for development by team `Y4MB2B6UD3`. It is restricted to the existing profile's registered devices (10 at export); the profile expires on 2027-07-14. It is not an App Store, TestFlight, enterprise, or unrestricted distribution artifact. No iPhone was online for installation/runtime acceptance.

The local wildcard profile already contained the available Apple Development certificate. No new certificate, profile, device registration or portal submission was needed. Archive with the certificate category, not its fingerprint, because the project uses automatic signing:

```sh
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release -destination 'generic/platform=iOS' -derivedDataPath releases/mobile/DeviceDerivedData -archivePath releases/mobile/ZhuoleDocs-device.xcarchive DEVELOPMENT_TEAM=Y4MB2B6UD3 CODE_SIGN_IDENTITY='Apple Development' archive
xcodebuild -exportArchive -archivePath releases/mobile/ZhuoleDocs-device.xcarchive -exportPath releases/mobile/ios-development-export -exportOptionsPlist releases/mobile/ios-development-export-options.plist
```

The generated local export plist uses `method=debugging`, `signingStyle=automatic`, `teamID=Y4MB2B6UD3`, and `manageAppVersionAndBuildNumber=false`. Do not force a manual provisioning profile for this Xcode-managed profile. The archive/export commands do not enable provisioning updates. Export metadata and provisioning material remain under ignored `releases/mobile/`.

`ios-development-verification.json` records SHA-256, arm64/iPhoneOS identity, development entitlement, profile expiry, registered-device count, and byte equality for all 12 staged web files. The extracted IPA passed `codesign --verify --deep --strict`. `SHA256SUMS` includes this package alongside the Android debug APK and iOS simulator ZIP.

## iPad simulator acceptance (2026-10-14)

The independent `docs/qa/ipad-cases.json` catalog records four passed cases and two unrun cases on the task-owned iPad Air 11-inch (M3), iOS 26.1 simulator. The installed 0.1.0 simulator ZIP has SHA-256 `fb2c77d84e37e6b93996b232bb0eee4b20be7c8b7db327cca6ae6e56258a1ac0` and a443485 editor assets. Fresh native UI evidence covers login and the portrait workspace, Word with the software keyboard in both orientations, a landscape spreadsheet formula (=120+80, rendered as 200), and landscape slide title editing, presentation and dismissal. Independent local API readback confirms all three saved values. No application code change was required.

Generate its separate report with `node scripts/report-ios-qa.mjs docs/qa/ipad-cases.json releases/mobile/ipad-qa-report.html`. The default command still produces the historical iPhone report. Evidence and synthetic account fixtures remain under ignored `releases/mobile/`; no production data was changed. Physical devices, Chinese composition/clipboard, multitasking, long-document caret scrolling and sheet/slide software-keyboard layouts remain separate gates.

### Word Pinyin follow-up (2026-10-14)

On the same iPad simulator build, native software-keyboard taps composed `ni` and `hao`, and candidate selection plus Chinese punctuation produced a second paragraph containing `你好。`. The original `Tablet QA` paragraph was preserved. Local API readback verified both paragraphs and left alignment at revision 8; app termination/relaunch and document reopening preserved the visible result. Evidence: `releases/mobile/ipad-ime-composition.png`, `ipad-ime-reopened.png`, and `ipad-ime-readback.json`. The first readback assertion expected null alignment instead of the existing left alignment; corrected against the visible toolbar, the exact document assertion passed. No application change was needed.

The catalog now separates basic Word Pinyin, native clipboard, and other editor/composition scenarios: five passed cases and three not-run cases. This sample does not establish physical-device, clipboard, long composition, replacement/cancellation or sheet/slide Chinese input acceptance. The dedicated simulator was shut down after QA.

## iPad spreadsheet native IME follow-up (2026-10-14)

Built a separate simulator artifact from `c3091c9`, including the `d73726a` spreadsheet composition guard. All 10 staged web files match the built app's `public` directory byte-for-byte, and the bundled JavaScript contains the composition guard. Artifact: `releases/mobile/ZhuoleDocs-0.1.0-ios-simulator-d73726a.zip`, SHA-256 `2196b6ec760d032ae34ec413a401cbd5632886108110d5657d95ace50b507f5e`. The native version remains 0.1.0; the source suffix distinguishes this QA artifact without replacing the previous ZIP or device IPA.

Installed over the existing app on the task-owned iPad Air simulator `6E217ADC-EDFD-498B-85D3-A69475D3382F`. Login and all three dedicated fixtures survived. Native software-keyboard taps composed `ni` in B2. The composing Return key confirmed literal `ni` without leaving B2; a second, non-composing Return moved to B3. Native candidate selections for `ni` and `hao` produced `你好` in B3. Save, process termination/relaunch and UI reopening preserved both cells and A1's existing formula, displayed as 200. Independent local API readback at revision 7 exactly matched `{A1: '=120+80', B2: 'ni', B3: '你好'}`. The readback session was logged out and the simulator shut down after QA.

Evidence under `releases/mobile/`: `ime-web-build.log`, `ime-ios-sync.log`, `ime-ios-build.log`, `ime-ios-assets.json`, `ipad-sheet-ime-composition.png`, `ipad-sheet-ime-confirmed.png`, `ipad-sheet-ime-reopened.png`, and `ipad-sheet-ime-readback.json`. Earlier catalog results retain their original artifact identity. This follow-up establishes basic native spreadsheet composition/confirmation on this simulator only; slide IME, composition replacement/cancellation, physical devices and refreshed Android/Harmony/desktop packages remain separate gates.

## Android composition build and regression (2026-10-14)

Refreshed the Android debug client with `d73726a` editor assets. Build used the task-local JDK at `releases/mobile/toolchains/jdk-21.0.12.1+1/Contents/Home`; no global Java setting changed. All 10 packaged `assets/public` files match `dist` byte-for-byte. Artifact: `releases/mobile/ZhuoleDocs-0.1.0-android-debug-d73726a.apk`, SHA-256 `9dfb35314c0b96478661870ba64144aebf2e4e7cddde880550fb39834c7f1846`. This source-suffixed QA package preserves the older artifact and remains debug-signed, native version 0.1.0.

Installed with `adb install -r` on the dedicated `Zhuole_Docs_API35` emulator. `ANDROID_SHARE_QA=1 node scripts/smoke-android.mjs` passed registration, three-editor save/reload, formula evaluation, slideshow, native Office export/share chooser and byte readback, oversized paste rejection, offline process restart/reconnect, cache cleanup preserving pending drafts, account isolation and offline logout. Added composing Enter/arrow/Tab event checks and independent server readback of Chinese cell D2. These synthetic WebView events verify application handling, not Android keyboard candidate selection. Native Android IME and physical-device coverage remain open.

Evidence: `releases/mobile/ime-android-build.log`, `ime-android-sync.log`, `ime-android-artifact.json`, and `ime-android-smoke.log`. The smoke refreshed its named Android screenshots under `releases/mobile/`. The emulator was stopped after the successful run. No release signing or store submission is established by this debug build.
