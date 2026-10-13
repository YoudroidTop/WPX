# Mobile clients

## Scope and implementation

Phase three targets iOS and Android initially. The app is named 卓乐文档 and embeds the same three editors used by the web and desktop clients. The bundled UI works without downloading executable application code from the cloud service.

Capacitor provides native HTTP, preferences, filesystem, sharing, app lifecycle, and keyboard integration. A common native bridge keeps desktop behavior intact while enabling server configuration, local drafts, account-scoped caching, revision-aware synchronization, and file export on mobile. Native HTTP sends the configured service Origin; the existing API authentication and 3 GB quota enforcement remain authoritative. Cookies are handled by the native transport and removed on logout. Only HTTPS roots and loopback HTTP development addresses are accepted.

The mobile UI includes safe-area padding, a contained scrolling viewport, 44-point icon controls, a horizontally scrollable formatting toolbar, visible backup controls, and a connection button on the workspace/login screen. Android back returns from an editor through its save queue or dismisses the current workspace dialog. Returning to the foreground retries synchronization.

Import uses the system file chooser exposed by the WebView file input. Export writes a cache file and presents the native share sheet; the user chooses Files or a receiving application. Shared files remain in the app cache so the receiving app can finish reading them. A share-sheet result is not proof that an external recipient persisted a file. Cache cleanup policy, incoming system share/open integration, and complete native offline acceptance remain follow-up work.

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

See `docs/verification.md` for checks actually completed. Web viewport checks do not establish keyboard, lifecycle, or native file behavior on every OS. Windows desktop distribution, public hosting, mobile native acceptance, signing, and store publication remain separate work items. The full project goal is still active.
