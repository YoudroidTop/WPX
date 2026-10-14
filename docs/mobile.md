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

## iOS device composition artifact (2026-10-14)

Archived and exported a new development IPA containing the `d73726a` editor fix using the existing team/profile, without provisioning updates. Artifact: `releases/mobile/ZhuoleDocs-0.1.0-ios-development-d73726a.ipa`, SHA-256 `c87d4aeaa18221c9259c14bc2f58558f9701519c7cc845b1300effbf14c17000`. The previous IPA remains unchanged. Native version/build remain 0.1.0 (1); the source suffix distinguishes this local QA artifact.

The extracted IPA passed `codesign --verify --deep --strict`; bundle identity, arm64/iPhoneOS platform, development entitlement and team `Y4MB2B6UD3` matched. The existing profile authorizes 10 devices and expires 2027-07-14. All 10 bundled web files match the current `dist` bytes. The system Python verifier succeeded after the Homebrew Python's plist parser failed to load its Expat dependency; no toolchain installation or system configuration was changed.

Evidence: `releases/mobile/ime-ios-device-build.log`, `ime-ios-device-export.log`, and `ime-ios-device-verification.json`. All three paired iPhones were unavailable according to `devicectl`; no new physical-device installation or runtime pass is claimed. This development package remains restricted to registered devices and is not a TestFlight/App Store release.

## Mobile 0.1.1 build refresh (2026-10-14)

Android, iOS and Harmony native versions are now 0.1.1, build/version code 2. All three development packages include the authenticated storage-outage UI and local draft discovery fix from `6f59899`. Each package's 10 bundled web files matches the current `dist` byte-for-byte. Existing 0.1.0 artifacts remain unchanged.

- Android: `releases/mobile/ZhuoleDocs-0.1.1-android-debug.apk`, SHA-256 `d284c3f914c1096f765678ebc2e7349022d8483228ca68b8c74f32ee93da9935`. Installed with data preservation on the task-owned `Zhuole_Docs_API35` emulator. Full native HTTP/WebView smoke passed all three editors, persistence, slideshow, clipboard limits, Office export bytes/share chooser, offline process restart, pending-draft-preserving cache cleanup, reconnect, account isolation and offline logout. The emulator was stopped after verification. This remains a debug package, not a signed public Android release.
- iOS: `releases/mobile/ZhuoleDocs-0.1.1-ios-development.ipa`, SHA-256 `9f6f89a06e3fc7e45aa0f69265165da2796643c0f45741d6b130003f587f6f21`. Archive/export, strict signature, bundle version and actual signed application identifier passed. The existing development profile permits 10 registered devices and expires 2027-07-14; its wildcard App ID covers the exact application entitlement. No provisioning update was requested. All three paired iPhones were unavailable; this build has no new device runtime acceptance and is not an App Store/TestFlight artifact.
- Harmony: `releases/harmony/ZhuoleDocs-0.1.1-harmony-debug.hap`, SHA-256 `b813a8de8c9274eae325aee29064f1f63155e1ab6bf2a5bdcc6a2752817608cb`. Built with the matching debug profile using `hvigorw assembleHap`; packaged version and web resources verified. The connected device returned launch error 10106102 (screen locked) before the build. This new HAP was not installed or accepted on-device in this run.

Evidence: `releases/mobile/0.1.1-{sync,android-build,android-smoke,ios-build,ios-export}.log`, `0.1.1-artifacts.json`, `0.1.1-signature-version.json`, and `releases/harmony/0.1.1-debug-build.log`. Runtime evidence is platform-specific: the new 503 recovery path was previously verified in Electron; Android regression here verifies existing native editor/offline flows, not injected native 503 behavior.

## Android native storage-outage acceptance (2026-10-14)

`scripts/smoke-android-outage.mjs` drives the installed 0.1.1 (2) APK through its real Capacitor HTTP bridge against the loopback-only QA proxy. The proxy now supports `storage-unavailable`: document requests receive 503, while authenticated account responses retain the upstream session cookie and use the explicit unavailable-account payload. Online/offline modes remain available. This exercises native transport and UI handling; it does not induce a production Durable Object failure.

The run passed registration during 503, native cookie retention across process restart, account settings access, logout/login during 503, creation after recovery, offline draft persistence, another process restart during 503, draft visibility/readability, restored cloud synchronization and normal quota display. The generated account/document remain in the local QA database; the app was logged out and restored to its normal loopback endpoint. The proxy and task-owned emulator were stopped. Evidence: `releases/mobile/0.1.1-android-native-outage.log` and `android-native-outage.png`.

The first attempt encountered the emulator's restored 0.1.0 snapshot rather than the recently built APK. Reinstalled 0.1.1 and added a version/build preflight that rejects stale installed packages. The final pass is from the verified 0.1.1 installation. Also fixed proxy shutdown so closing stdin terminates the child process after a failed test, and limited test error output to the message rather than snapshots containing form values. Reproduce after starting the dedicated emulator and installing the current APK with `ADB=/Users/liang/Library/Android/sdk/platform-tools/adb node scripts/smoke-android-outage.mjs`; it expects the task's local server on port 3173 and an available proxy port 3174.

## iOS native storage-outage acceptance (2026-10-14)

Built and installed simulator 0.1.1 (2) from `164b5f6` on the task-owned iPad Air 11-inch (M3), iOS 26.1. All ten installed editor resources match the built app and `dist` byte-for-byte. The separate `docs/qa/ios-availability-cases.json` catalog records four passed cases and one not-run case; historical iPhone/iPad catalogs retain their original build boundaries. Generate the report with `node scripts/report-ios-qa.mjs docs/qa/ios-availability-cases.json releases/mobile/ios-availability-report.html`.

Using the loopback proxy and real Capacitor HTTP bridge, login during 503, process restart, retained account settings, unavailable quota/list presentation, pending Word draft discovery/opening after restart, and recovery synchronization passed. Native frames show marker `5031213` before and after recovery; authenticated API readback deeply matches the recovered Word content. The initial Latin test phrase encountered the active Pinyin input method, so this storage test used a numeric marker and makes no new IME fidelity claim. An attempted pre-recovery API assertion lacked Origin and returned 403; only the corrected post-recovery readback is claimed.

Evidence: `releases/mobile/ios-0.1.1-simulator-identity.json`, `ios-0.1.1-recovery-readback.json`, and the catalog's native screenshots. The mirror's accessibility overlay returned stale labels; live native frames, not those labels, support UI results. The app was logged out and its previous port-3173 endpoint restored. The fault proxy and mirror exited; only this task's iPad simulator was shut down. Synthetic account/document fixtures remain in the local database. Native registration during 503, physical devices, full current-build three-editor regression and store distribution remain separate gates. Production was not fault-injected.

## Android release candidate 0.1.1 (2026-10-14)

A dedicated RSA-3072 release identity now signs the local candidate `releases/mobile/ZhuoleDocs-0.1.1-android-release.apk` (3,490,155 bytes). Native version/build is 0.1.1 (2), minimum SDK 24, target SDK 36. SHA-256: `a287a39464bb689244a5a82e5aaf956f6ebcae9c0ef669d7c847c0d49c50effc`. Signer certificate SHA-256: `af0c91003e1ab17fce4ea04019aa8ccf8cf8d184c3e8698aa05d6f60e18a4d8c`. The official apksigner verifies v2/v3 signatures, zipalign verification passes, the APK is not debuggable, and all ten packaged editor assets match `dist`. Release lint/build passed.

`scripts/build-android-release.mjs` builds the editors and Release APK, aligns before signing, and verifies the artifact before publishing its local filename. It requires explicit JDK/SDK paths, defaults to Build Tools 36.0.0, refuses existing same-version release output, and never creates or replaces signing material during a normal build. `--initialize-key` is an explicit one-time setup operation and refuses an existing signing directory. Keys/password material are owner-only files outside the repository under `~/.config/zhuole-docs/android-release/`; preserve an encrypted backup of that directory for future updates. Override its location with `ZHUOLE_ANDROID_SIGNING_DIR`, also outside the workspace. Passwords are supplied through a local file, not command-line values. Signing follows the [Android apksigner workflow](https://developer.android.com/tools/apksigner).

`JAVA_HOME` must point to JDK 21 and `ANDROID_HOME` to the SDK before running `npm run mobile:pack:android`. This run used the existing task-local JDK and SDK, without changing global settings. Initial signing failed because supplying the same one-line password file twice exhausted apksigner's file reader; the corrected invocation lets the PKCS12 key reuse the store password. The successful candidate is verified separately. Guard checks also confirmed that retrying key initialization or an existing release build leaves both the identity and artifact unchanged.

A fresh task-owned `Zhuole_Docs_Release_API35` emulator installed this APK successfully and reported a successful cold Activity start, live process, native version/build and no DEBUGGABLE package flag. The UI controller could not bind the emulator window, so no fresh visible login/editor acceptance is claimed. Error-level startup logs contain debugger-agent and SurfaceSyncGroup warnings, not a recorded application exception; this is not a substitute for UI QA. The emulator was stopped and its isolated state retained. Existing debug AVDs and packages were untouched. Release and debug certificates differ, so they cannot update one another in place; do not remove a debug install with unsynchronized drafts merely to install this candidate.

Evidence: `releases/mobile/0.1.1-android-release-{build-retry.log,verification.json,guards.json,install.log,runtime-errors.log}`. The candidate has not been uploaded to public downloads or an app store. Release-specific visible/native file/network acceptance and physical Android coverage remain open.

## Android release candidate 0.1.2 (2026-10-14)

`releases/mobile/ZhuoleDocs-0.1.2-android-release.apk` packages the aggregate formula correction with native version 0.1.2/code 3. Size: 3,490,155 bytes; SHA-256: `9797a9fdc55122812958a379ced73e429d48a8d59f39db83be7c3eed399bbed4`. The certificate fingerprint is identical to 0.1.1; apksigner/zipalign, non-debuggable checks and all ten bundled editor resources passed. The previous 0.1.1 APK checksum remains unchanged. The release build/lint passed.

On the task-owned `Zhuole_Docs_Release_API35` emulator, `adb install -r` successfully upgraded the existing release install. Package metadata changed from 0.1.1/code 2 to 0.1.2/code 3 while preserving appId 10207 and the first installation time. This proves package-manager upgrade acceptance, not application draft/session migration. Evidence: `releases/mobile/0.1.2-android-{release-build.log,release-verification.json,before-upgrade.log,after-upgrade.log,upgrade.log}`. Initial Activity startup failed while Android's user state remained BOOTING; the host renderer reported graphics surface errors. Retrying the same AVD with software rendering preserves its existing data. Fresh runtime/editor acceptance is tracked separately from the successful package upgrade.

This is a local signed candidate, not a public download or store publication. iOS, HarmonyOS and desktop installers still require this formula correction in a subsequent version.

With software rendering the OS completed boot in 75.7 seconds and reported RUNNING_UNLOCKED. The subsequent `am start -W` observation timed out after 11 seconds, but follow-up activity inspection confirmed a live process (1870) and top-resumed MainActivity. The captured AndroidRuntime error log was empty. This is process/activity evidence only: no visible editor or draft/session acceptance is claimed. Logs: `0.1.2-android-{launch-booted,activities,runtime-errors}.log`. The task emulator was stopped after evidence collection; its upgraded data remains available for further QA.

## iOS and HarmonyOS 0.1.2 packages (2026-10-14)

Both native projects now use version 0.1.2/build 3 and embed the aggregate reference correction. Existing artifacts are retained. All ten web resources in each new package match the current `dist` byte-for-byte.

- iOS: `releases/mobile/ZhuoleDocs-0.1.2-ios-development.ipa`, 1,116,499 bytes, SHA-256 `4e53e6aa3f658add3bbf24f1917482ba718c237255dbe21dc4994ac6d33205a8`. Release archive/export and strict deep codesign verification passed. Actual entitlements identify `Y4MB2B6UD3.com.youdroid.zhuoledocs` with development access. The existing profile lists ten devices and expires 2027-07-14. No provisioning update or store submission occurred. All three paired iPhones were unavailable during this run; no installation/runtime acceptance is claimed.
- HarmonyOS: `releases/harmony/ZhuoleDocs-0.1.2-harmony-debug.hap`, 1,023,068 bytes, SHA-256 `657bde2e6d917294b2ed39a3395b9ebc77de6f65d243fe6eea6e990e3b2392db`. The existing matching profile/certificate passed validation and `hvigorw assembleHap` succeeded. Installation on `4UQ9K25530058677` succeeded without an uninstall or clear-data command. The installed bundle dump confirms version 0.1.2/code 3. No new visible UI acceptance is claimed.

Evidence: `releases/mobile/0.1.2-ios-{archive,export,sync}.log`, `0.1.2-ios-verification.json`; `releases/harmony/0.1.2-{debug-build.log,verification.json,install.log,installed-bundle.json}`. Material-bearing temporary Harmony signing configuration was removed by the build helper. These remain development packages, not public/store releases. Desktop packages and mobile runtime acceptance remain separate work.

### iOS 0.1.2 simulator baseline — 2026-10-14

The installed iPad simulator build is 0.1.2 (3). All ten embedded editor resources match current `dist` byte-for-byte, with an exact asset filename set. Fresh native CUA checks passed login into the existing local QA account, opening the original Word fixture (marker `5031213`), session retention across process termination/relaunch, and logout. The workspace displayed 193 B / 3 GB. Initial automated credential entry lost trailing characters; waiting for the observation after each input before changing focus allowed successful login. This is an automation observation, not a diagnosed application input defect.

The catalog `docs/qa/ios-0.1.2-cases.json` records five passes and three editor scenarios not run. Generate the report with `node scripts/report-ios-qa.mjs docs/qa/ios-0.1.2-cases.json releases/mobile/ios-0.1.2-report.html`. Screenshots and installed resource hashes are under `releases/mobile/ios-0.1.2-*`. No document content was edited or deleted; the local endpoint remains unchanged and the app was logged out. Current-build editor write/Office/offline regression and physical-device acceptance remain separate gates.

### iOS 0.1.2 aggregate editing — 2026-10-14

The same installed build passed native formula-bar editing, save and reopen. A dedicated local sheet initially rendered `B1:B6` as `0,12,12,12,-8,1` for blank/text-reference cases. Editing `A1` to `48` and entering `C1 =SUM(A1,A2,A3)` produced `0,48,48,48,-8,1` and `C1=48`, retained on reopen. Independent authenticated API readback deeply matched all cells at revision 4. The catalog now has six passes and two editor cases not run.

The existing port-3173 server (PID 80916, started October 13) predates the October 14 aggregate fix; its XLSX export failed the expected cached-value assertion. Fresh current-code `exportOffice` on the exact API-read document passed all seven cached values. These are separate evidence states: the stale server was preserved, and no native share-sheet export acceptance is claimed. Evidence: `releases/mobile/ios-0.1.2-sheet-{initial.png,reopened.png,readback.json,current-export.xlsx,logout.png}`. The dedicated local fixture is retained for inspection; native/API sessions were logged out and the task simulator was shut down.

### iOS 0.1.2 Word and presentation editing — 2026-10-14

Dedicated local fixtures passed native CUA editing, save and reopen. Word marker `1201437` retained bold and centered alignment; authenticated API revision 3 deeply matched the complete paragraph. Presentation titles `1201440` and `2201440`, body `481216` and midnight theme persisted after duplication and reopening. API revision 6 matched both slides exactly, including distinct slide IDs. Playback reached page 2/2 and closing returned to the second slide editor. A CUA connection expired before playback; rebinding restored control.

The catalog now records eight passing baseline/basic cases, not complete release acceptance. Numeric input does not cover Chinese IME. Portrait playback aspect-ratio fidelity, notes/reordering/deletion, native Office import/export, current-build offline/503 and physical-device acceptance remain open. Evidence: `releases/mobile/ios-0.1.2-word-format-reopened.png`, `ios-0.1.2-slides-{reopened,page2,closed}.png`, `ios-0.1.2-word-slide-{readback.json,logout.png}`. API/native sessions were logged out and the task simulator was shut down. Dedicated fixtures remain available for inspection; existing documents and the stale local server were preserved.

### Presentation aspect-ratio correction — 2026-10-14

The previous desktop playback rule forced full height while independently clamping width, stretching the slide on portrait iPads. Playback now reserves a flexible stage above the controls and fits a 16:9 frame to both available dimensions. The surface fills that frame; percentage padding is relative to the fitted frame instead of the viewport. The narrow-screen rule no longer overrides its sizing.

A local CUA browser harness rendered the actual `SlideEditor` and application CSS with the native-mobile class at 820x1180, 1280x720, 844x390 and 390x844. DOM geometry checks passed aspect ratio (tolerance 0.001), stage containment, controls clearance and 44px close target. Next reached page 2/2 and close returned to the second-slide editor. Evidence: `releases/qa/slide-layout-results.json` and `releases/qa/slide-layout-ipad.png`. TypeScript/Vite build passed. This is current-source browser verification with simulated native styling, not a rebuilt iOS/Harmony/Android package or live-site deployment; installed 0.1.2 packages still contain the prior CSS. Device safe-area validation remains open.

### Android release candidate 0.1.3 — 2026-10-14

`releases/mobile/ZhuoleDocs-0.1.3-android-release.apk` includes the presentation aspect-ratio correction, version 0.1.3/code 4. Size: 3,490,155 bytes; SHA-256: `56b2ab9e35cf71804221c70aef71c2d823d6e0c2d426cc09c93a3055311c9652`. The dedicated release certificate matches 0.1.2. Signature/alignment, non-debuggable and package metadata checks passed; all ten web resources match current `dist`, including an exact asset filename set. The previous APK hash remains unchanged.

The task-owned `Zhuole_Docs_Release_API35` emulator accepted `adb install -r` over 0.1.2 and preserved its first installation time. Cold Activity launch completed successfully in 1,501 ms; PID 2876 was live and MainActivity was top-resumed. The AndroidRuntime error log was empty. CUA did not expose the emulator application, so this is package/process acceptance, not visible slideshow or draft/session acceptance. No uninstall or clear-data operation occurred. The task emulator was stopped after verification.

Evidence: `releases/mobile/0.1.3-android-{release-build.log,release-verification.json,before-upgrade.log,after-upgrade.log,upgrade.log,launch.log,activities.log,runtime-errors.log}`. This signed local APK has not been uploaded to a public download or store. iOS, HarmonyOS and desktop packages still need the presentation correction; their prior acceptance remains version-specific.

### iOS development candidate 0.1.3 — 2026-10-14

`releases/mobile/ZhuoleDocs-0.1.3-ios-development.ipa` packages the presentation aspect-ratio correction with version 0.1.3/build 4. Size: 1,116,511 bytes; SHA-256: `3a1b132f260bfcb33ab8421e6488949cb0a499ce06eb498ac936e11032c3d59b`. Release archive/export and strict deep signature verification passed. Entitlements identify `Y4MB2B6UD3.com.youdroid.zhuoledocs` with development access; the existing profile lists ten devices and expires 2027-07-14. All ten embedded web files match current `dist`, with an exact asset filename set. The 0.1.2 IPA remains unchanged.

A separate Debug simulator build also succeeded at `releases/mobile/Simulator013/Build/Products/Debug-iphonesimulator/App.app`, with matching version/build and all ten web resources. This turn verifies package construction, not installation or runtime. All three paired iPhones remained unavailable in `devicectl`; physical-device, safe-area and current-build editor acceptance remain open. No profile changes, public upload or App Store submission occurred.

Evidence: `releases/mobile/0.1.3-ios-{sync.log,archive.log,export.log,simulator-build.log,verification.json}`. HarmonyOS and desktop packages still require this correction.
