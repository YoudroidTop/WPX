# Desktop delivery

## Scope

The suite name is 卓乐文档. Windows and macOS use the same Electron application and the phase-one cloud account/document API. Editors are bundled into the client and remain available when the cloud endpoint is unreachable.

Implemented behavior:

- First-launch cloud service configuration, health validation, and persistent connection settings.
- HTTPS server support; HTTP is permitted only for localhost/loopback development endpoints.
- Native window lifecycle, application menus, keyboard shortcuts, and system file-open events.
- Native file dialogs for importing DOCX/XLSX/PPTX/ZDOC and saving backups/Office exports.
- ZDOC file association in installer configuration; existing Office default applications are not replaced.
- Server-scoped sessions, per-account cache and draft isolation, persistent offline edits, background library synchronization, and conflict-copy recovery.
- Desktop branding and an application icon.

## Build and run

```sh
npm ci
npm run desktop:build
npm run desktop:dev
```

Electron's install script downloads its runtime. If the package manager's lifecycle policy skipped it, run `node node_modules/electron/install.js` explicitly after reviewing the installed package.

For automated local testing, development builds accept `ZHUOLE_CLOUD_ORIGIN` and `ZHUOLE_DESKTOP_DATA`. Packaged apps do not accept these overrides. They use their connection screen and the OS application-data directory.

```sh
npm run desktop:pack:mac
npm run desktop:pack:win
```

The builder configuration produces macOS arm64/x64 and Windows x64/arm64 artifacts. Outputs are under `releases/desktop/`; generated application bundles and installers are excluded from Git.

Builds include only the bundled main/preload files, editor assets, and runtime metadata. Cloud API server code and its database are not part of the desktop package.

## Offline model

Only documents already created/opened on this device can be opened while offline. Creation/import and Office conversion currently require the cloud API. Existing cached documents can be edited offline, and native ZDOC backups can be written without the server.

The client stores a local draft on each edit before reporting durable local save. The displayed state distinguishes cloud-saved content from a local draft waiting to synchronize. Returning to the library is allowed after durable local persistence when the network is unavailable. Before closing, unsaved-change protection remains active if neither cloud storage nor local persistence has accepted the latest edit.

When the library reconnects, closed drafts are submitted only against their original cloud revision. A changed or deleted cloud document produces a visible pending draft, not an overwrite. Open editors serialize their own saves and expose a separate-cloud-copy action on conflict. Native export cancellation does not dismiss an unsaved editor.

Local drafts and cached document bodies are on the device disk, protected by the OS account but not separately encrypted by the app. Logging out removes the active offline identity and local session cookies; drafts remain associated with their original server/account and are available after signing back into that same account. A failed network logout cannot revoke a server-side session immediately, but removes its local cookie so the client no longer uses it.

The 3 GB limit continues to apply to persisted cloud document content, not to local cache files. A local draft exceeding cloud limits remains local and is not reported as uploaded.

## Verification and release boundaries

`npm run test:desktop` launches actual Electron processes against an isolated API. It tests the native window, registration/login, cloud saves, local backup writes, offline edits, process restart recovery, synchronization, conflict copy, OS file-open handling, unsafe connection rejection, and persistent server selection. The automated native save dialog is substituted with a deterministic test path; the real IPC handler writes and the test reads the actual backup file.

macOS test packages use ad-hoc signing (`identity: '-'`) deliberately. A Developer ID certificate, notarization, and a release update service are separate distribution tasks. The user explicitly accepted unsigned Windows installers for this delivery; Windows code signing is deferred. Unsigned installation does not establish trusted-publisher status. No updater is enabled against an unconfigured endpoint.

Current platform artifacts and runtime evidence are recorded in `docs/verification.md`. Building a Windows artifact on macOS is not Windows installation or runtime acceptance. The cloud service is deployed at https://wpx.youdroid.top. macOS Developer ID signing and notarization are verified below; an update distribution endpoint remains open delivery work.

## Production connection default

The shared native connection form now pre-fills `https://wpx.youdroid.top`. First launch still validates the selected service before storing it. Existing connection settings, account partitions and local drafts remain unchanged; custom HTTPS services remain supported. A real Electron run connected through the production default and reached the login screen. The seven desktop regression scenarios passed, including the default-field assertion and custom-service persistence. Previously packaged installers are not automatically updated by a source build.

## Reproducible artifact inventory

`desktop:pack:win` runs x64 and ARM64 packaging separately. The Windows target configuration leaves architecture selection to those explicit commands. Historical combined installers may remain in the ignored output directory; do not select artifacts by directory glob. The release manifest identifies the six intended files: macOS arm64/x64 DMG and ZIP, Windows x64/arm64 EXE.

After both packaging commands finish, run on macOS:

```sh
SEVEN_ZIP=/path/to/trusted/7zz npm run desktop:verify-release
```

Use the 7zz binary already provided by the installed Electron builder toolchain, or an independently trusted installation. The verifier compares every ASAR file against the current staged build, checks Mach-O/PE CPU architectures and macOS signature integrity, mounts DMGs read-only and extracts ZIP/NSIS payloads for comparison, and hashes all six artifacts. It fails on stale/missing/extra packaged content. It writes `releases/desktop/release-manifest.json` and `SHA256SUMS`; the manifest records Git HEAD and dirty state without claiming that HEAD alone identifies the build.

DMGs are mounted read-only in a task-owned temporary directory and detached after checking the embedded app signature, executable and ASAR. A detach failure leaves the mount directory intact. This verifies packaged contents, not user installation. Payload comparison is recorded per artifact. Windows installer execution, macOS Developer ID signing/notarization and update delivery are separate gates. Windows signing is deferred by user decision. `publicReleaseReady` remains false until those gates are independently satisfied.

## Verified macOS distribution (2026-10-13)

Developer ID Application certificate DBFQZ3TW3Z was issued for team Y4MB2B6UD3 with the G2 chain, valid through 2031-09-17. Its public key matches the local RSA-2048 private key. Signing credentials remain outside the repository. Both architectures use Developer ID signatures, secure timestamps and Hardened Runtime; DMG containers are also signed.

All four Mac distribution files passed signature, stapled-ticket and Gatekeeper verification. ZIPs were independently extracted before checks, including CPU architecture verification. The final files are:

- ZhuoleDocs-0.1.0-mac-arm64.dmg
- ZhuoleDocs-0.1.0-mac-x64.dmg
- ZhuoleDocs-0.1.0-mac-arm64-stapled.zip
- ZhuoleDocs-0.1.0-mac-x64-stapled.zip

Use releases/desktop/mac-distribution-manifest.json and MAC-SHA256SUMS for these exact files. Original submission ZIPs remain unchanged for hash traceability. The Apple Silicon packaged app launch passed (1/1). Intel physical runtime and Windows installer execution remain separate acceptance work.

Apple accepted these submission IDs:

| Architecture | App ZIP                              | Signed DMG                           |
| ------------ | ------------------------------------ | ------------------------------------ |
| arm64        | e3703b0a-ccd9-417c-9bfa-dada3db8acd0 | d7ccb019-27c2-47b1-84ca-dd7edc2010e5 |
| x64          | 1e9fa5c7-a07e-4a33-b440-45c7311fa7af | dc75dbdb-b682-437e-8089-1642a8f33fdf |

These are the refreshed artifacts containing the spreadsheet paste protection from `a443485`. Both Windows architectures were rebuilt unsigned as requested. The desktop suite passed eight cases, including paste rejection and preserved contents after reopening. The final Apple Silicon packaged app separately passed its launch/sandbox check. All four Mac distribution files passed notarization, ticket validation and Gatekeeper again; the earlier submissions remain in the local notarization history.

The distribution verifier previously rejected an unstapled Intel DMG, then passed once its accepted ticket was attached. General artifact verification checks all four unpacked CPU targets against all 13 staged files, compares DMG/ZIP/NSIS payloads and hashes six original packaging outputs. Windows installers remain unsigned by user decision.

## Reproduce signing and notarization

```sh
npm run desktop:pack:mac:signed
SEVEN_ZIP=/path/to/trusted/7zz npm run desktop:verify-release
node scripts/notarize-mac.mjs /path/to/asc.env
node scripts/notarize-mac.mjs /path/to/asc.env --status
npm run desktop:verify:mac-distribution
```

The separate release configuration requires the project team's identity and fails if signing is unavailable. Development packaging retains ad-hoc signing. The notarization command reads ASC_API_KEY_PATH, ASC_KEY_ID (or ASC_API_KEY_ID) and ASC_ISSUER_ID without executing the environment file. It saves submission IDs with input hashes. Optional arm64/x64 arguments limit submissions to one architecture. Use --status after stapling changes bytes: it polls stored IDs without reading or uploading artifacts. Run these commands serially because they share a local record file. Status-only mode was verified with missing original files and a submit-forbidden fixture.

After Apple accepts each submission, staple and validate the app bundles and DMGs. Recreate the -stapled.zip archives from the stapled app bundles using ditto with resource preservation. Then run both verifiers. The distribution verifier emits its manifest only after every target passes, and rejects files that change during verification. Apple acceptance, ticket attachment, Gatekeeper assessment and device runtime remain distinct evidence.

## Manual update checking

The desktop source now provides Help → Check for Updates on macOS and Windows. The main process reads the official HTTPS release manifest without account cookies, rejects redirects and responses larger than 32 KiB, and validates stable numeric versions and exact platform/architecture installer paths. The configured document cloud server cannot change the update source. A newer version offers an explicit download confirmation; cancellation opens nothing. Users save documents, quit the app and run the downloaded installer themselves. Windows unsigned distribution is disclosed in the update prompt. There is no background installation or forced restart.

Initial implementation validation, before 0.1.1 packaging: 32 unit/API tests and nine Electron cases passed, including native menu invocation, cancel/confirm behavior, platform selection, current-version and network-failure messages. The update test replaces the native dialog and download launcher to inspect their arguments safely. At that point the packaged-app launch case exercised the previously published 0.1.0 artifact; it did not prove that artifact contained the new updater. The original official 0.1.0 binaries remain immutable and do not contain this menu. Version 0.1.1 adds it; release acceptance is recorded below.

A separate Electron run used the real official HTTPS endpoint through the existing proxy and returned the current-version result. Only the dialog was intercepted to record the result; the manifest fetch and parser were real. Evidence: `releases/desktop/update-live-result.json`, `update-desktop-tests.log`, `update-tests.log`, and `update-build.log`.

## Version 0.1.1 candidate verification

Version 0.1.1 includes the manual update menu. Both Windows CPU targets and both Developer ID signed Mac targets have been built. All four unpacked targets match the 13 staged files; the six DMG/ZIP/NSIS packaging outputs passed payload comparison. Both Mac app archives and DMGs were accepted by Apple, their tickets were attached, and the distribution verifier passed signature, ticket and Gatekeeper checks for all four distribution files. Windows remains unsigned. The four published 0.1.0 installer files were rehashed and remain unchanged.

Notarization jobs: arm64 ZIP `78640b05-0737-4a63-8dac-4e2d2e566e66`, arm64 DMG `ba14e305-063f-4b6b-84c9-17e771283dd7`, x64 ZIP `b2471da0-34da-454e-a581-3d990b09bdba`, x64 DMG `ff7a5473-16e0-45e6-aaf4-f2267ed2863a`.

The nine desktop cases passed against the new build, including actual packaged version/menu assertions. An additional packaged upgrade case launched the preserved 0.1.0 archive, created and saved a document against the isolated local test server, then launched 0.1.1 with the same user directory. The login session and saved content survived. This proves the Apple Silicon application replacement/profile path; it is not Windows installer or Intel runtime acceptance. Evidence: `releases/desktop/0.1.1-desktop-tests.log`, `0.1.1-upgrade-test.log`, `0.1.1-payload-verification.log`, `0.1.1-mac-distribution.log`, and `test-results/desktop-upgrade.png`.

The download handler now retains the explicit historical release allowlist so advancing the current manifest cannot remove old immutable links. Unit/API suite: 33 passed; cloud dry-run and TypeScript checks passed. Public version switching and full remote readback are recorded separately from local candidate verification.

### Version 0.1.1 public release (2026-10-14)

All four installers are now available through the official `/downloads/desktop/0.1.1/` paths. Full public SHA-256/size readback, HEAD and first/last byte ranges passed for every file. The four 0.1.0 links also passed HEAD and byte comparisons after the cutover. A real packaged 0.1.1 process read the live manifest and reported the current version; a test override of only the local version exercised the newer-version path against that same real manifest and selected the arm64 DMG. Dialog/download launch were intercepted to inspect confirmation safely. Evidence: `releases/desktop/0.1.1-live-update.json`, `releases/cloudflare/desktop-download-readback.json`, `0.1.1-download-direct.log`, and `0.1.0-legacy-links.json`. Windows EXE certificate tables were inspected and are absent, as requested (`releases/desktop/0.1.1-windows-signature.json`). Windows installer/runtime and Intel Mac physical runtime remain unverified.

### Version 0.1.2 candidate (2026-10-14)

Advanced the desktop package version to 0.1.2 to deliver the spreadsheet IME composition fix without replacing published 0.1.1 bytes. The renderer regression now checks composing Enter/arrow/Tab focus, ordinary Enter navigation, and Chinese cell persistence. Eight non-packaged desktop tests passed. Two packaged Apple Silicon tests passed, including actual version/sandbox assertions and a 0.1.1-to-0.1.2 profile upgrade retaining login and the saved document.

Windows x64 and arm64 NSIS installers are available locally as `releases/desktop/ZhuoleDocs-0.1.2-win-x64.exe` and `ZhuoleDocs-0.1.2-win-arm64.exe`. Both unpacked architectures match all 13 staged files; extracted installer ASAR and executable payloads match their unpacked targets. PE certificate tables are empty as requested. This is packaging validation, not Windows runtime acceptance. Prior unpacked Windows apps were retained under `0.1.1-win-unpacked` and `0.1.1-win-arm64-unpacked`.

Mac arm64 signed packaging and local launch/upgrade tests passed; Intel signing and Apple notarization are still in progress at this checkpoint. Do not promote 0.1.2 to the public manifest until both Mac architectures complete signing/notarization, tickets are attached, distribution validation passes, and all public artifacts pass readback. The production download channel remains 0.1.1.

Evidence: `releases/desktop/0.1.2-desktop-tests.log`, `0.1.2-packaged-tests.log`, `0.1.2-windows-payload.json`, `0.1.2-windows-payload.log`, and `0.1.2-windows-signature.json`. The Windows-only verification reused the existing payload verifier with a target filter in the ignored `verify-windows-candidate.mjs`; it does not replace the eventual full release manifest. Mac build/submission logs are `0.1.2-mac-build.log` and `0.1.2-arm64-notarization.log`.

### Version 0.1.2 arm64 notarization checkpoint (2026-10-14)

Apple accepted the arm64 ZIP submission `ca766375-c23c-4259-a24d-98aed34065ee` and DMG submission `3883b518-15cf-43ce-aef4-fbbe9b2dd3cf`. An initial status query timed out; polling the same recorded submissions succeeded without uploading duplicates. Tickets were attached to the arm64 app and DMG, and the app was repacked as `ZhuoleDocs-0.1.2-mac-arm64-stapled.zip`. Both distribution files passed strict signature, ticket and Gatekeeper verification. The arm64 app matches all 13 staged files; DMG and original ZIP payload comparisons passed.

Evidence: `releases/desktop/0.1.2-arm64-notarization-retry.log`, `0.1.2-arm64-staple.log`, `0.1.2-arm64-distribution.json`, `0.1.2-arm64-distribution.log`, and `0.1.2-arm64-payload.json`. Architecture-filtered copies of the existing verifiers produced these scoped records under ignored `releases/desktop/`; the full release manifests remain pending.

The original Intel packaging process terminated because Apple's timestamp service was unavailable while signing a framework resource. A single x64-only retry is running, logged in `releases/desktop/0.1.2-mac-x64-retry.log`. It has not yet established a signed Intel artifact or notarization. Do not repeat the completed arm64 submissions or rebuild its accepted artifacts. Public release remains 0.1.1 until the remaining architecture and full release validation complete.
