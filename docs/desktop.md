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

### Version 0.1.2 complete payload checkpoint (2026-10-14)

Intel app/DMG signing and ZIP/DMG generation completed. The retry's `--x64` flag did not override the explicit two-architecture target arrays in the builder configuration: after finishing Intel outputs it began rebuilding arm64. Stopped that task-owned redundant build, checked both accepted arm64 distribution hashes against `0.1.2-arm64-distribution.json`, retained the interrupted app separately, and restored the unpacked arm64 app from its accepted stapled ZIP. Accepted distribution files were unchanged. Future single-architecture retries must override the target architecture arrays themselves, not rely on `--x64` alone.

The full `scripts/verify-desktop-release.mjs` run passed: four unpacked CPU targets match all 13 staged files, and all six DMG/ZIP/NSIS payloads match their unpacked applications. Evidence: `releases/desktop/0.1.2-payload-verification.log` and `release-manifest.json`. Intel ZIP submission `d754f3cd-d5ca-4435-a117-52f41660055a` and DMG submission `35a86746-a3b6-4a25-bc92-043e50779289` both reached Apple Accepted. The Intel application and DMG were stapled, and the app was repacked as `ZhuoleDocs-0.1.2-mac-x64-stapled.zip`. All four Mac distribution files passed strict signature, ticket validation and Gatekeeper checks through the unfiltered distribution verifier. Evidence: `0.1.2-x64-status-final.log`, `0.1.2-x64-app-staple.log`, `0.1.2-x64-dmg-staple.log`, `0.1.2-mac-distribution.log`, and `mac-distribution-manifest.json`. Submission records remain in `notarization.json`; no public release switch has occurred.


### Version 0.1.2 public release (2026-10-14)

The official manifest now serves 0.1.2 for Mac arm64/x64 and Windows x64/arm64. All four public installer files passed complete hash/size readback plus HEAD/range checks. Both prior versions retain their eight immutable links, verified with HEAD and boundary bytes. Production Worker: `cb6f2753-63ad-49ae-ae5e-b6f65cde7fa9`. Publication evidence is recorded in `docs/cloudflare.md`. Windows remains unsigned and awaits user runtime acceptance; Intel Mac physical runtime is also unverified.

### Version 0.1.3 verified candidate (2026-10-14)

Desktop 0.1.3 includes authenticated storage-outage account access, unknown usage/count display and local draft discovery when cloud library reads fail. New immutable installer filenames preserve all published 0.1.2 artifacts.

Nine source desktop tests passed, including storage-failure reload and subsequent draft synchronization. Two packaged Apple Silicon tests passed: bundled UI/sandboxing and 0.1.2-to-0.1.3 upgrade with the same profile, retained session and saved document. Windows x64/arm64 installers and app executables have empty PE certificate tables as requested. Both NSIS payloads match their unpacked apps; Windows runtime acceptance remains with the user.

Apple accepted all four ZIP/DMG submissions. Tickets were attached to both Mac apps and DMGs; separate `-stapled.zip` files contain the stapled applications. Strict signature, ticket validation and Gatekeeper checks passed for both architectures and both distribution formats. Intel runtime acceptance remains unverified. The final full payload verifier compared all four CPU targets against the 13 staged files and all six original DMG/ZIP/NSIS containers against their applications.

Evidence under `releases/desktop/`: `0.1.3-client-tests.log`, `0.1.3-packaged-tests.log`, `0.1.3-windows-signature.json`, `0.1.3-arm64-status-final.log`, `0.1.3-x64-status-final.log`, `0.1.3-mac-distribution.log`, `0.1.3-payload-verification-final.log`, `release-manifest.json`, and `mac-distribution-manifest.json`. Prior 0.1.2 manifests/checksums are retained with the `0.1.2-preserved-` prefix. The official download manifest still serves 0.1.2; 0.1.3 upload, public readback and manifest cutover remain pending. Mobile packages are unchanged.

### Version 0.1.3 public release (2026-10-14)

The official manifest now serves 0.1.3 for Mac arm64/x64 and Windows x64/arm64. All four public downloads passed full-content hash/size comparison and HEAD/range verification. Three historical versions retain all 12 links, verified through HEAD and boundary bytes. Worker `7c787cea-6184-4071-9f6f-a1bf9e4ca45d` serves the release at 100% traffic. See `docs/cloudflare.md` for the deployment evidence. Windows user acceptance, Intel runtime acceptance and mobile refresh remain separate open gates.

### Version 0.1.4 packaging checkpoint (2026-10-14)

Desktop version 0.1.4 includes the aggregate formula reference correction. All 91 unit/API tests and the desktop staging build passed. Previous 0.1.3 unpacked applications and validation manifests were moved to `0.1.3-preserved-*` paths; published installers remain unchanged.

Windows x64 and arm64 NSIS files are ready locally as `releases/desktop/ZhuoleDocs-0.1.4-win-x64.exe` and `ZhuoleDocs-0.1.4-win-arm64.exe`. Both unpacked architectures match all 13 staged files, and the installer payloads match their unpacked apps. The PE certificate tables of both installers and application executables are empty, as requested. This is packaging acceptance, not Windows execution. Evidence: `0.1.4-windows-payload.json`, `0.1.4-windows-payload.log`, `0.1.4-windows-signature.json` under `releases/desktop/`. The scoped verifier's generic final log says six artifacts; its actual filtered manifest contains only the two Windows installers.

Mac arm64 signed DMG/ZIP packaging completed and notarization was started. Intel signing/packaging is still running at this checkpoint; no new Mac distribution readiness is claimed. Continue the existing build and notarization jobs rather than launching duplicates. Logs: `0.1.4-mac-build.log` and `0.1.4-arm64-notarization.log`; Apple submission identities, once returned, persist in `notarization.json`. Official public downloads remain 0.1.3 until all Mac acceptance, payload checks and public readback complete.

### Version 0.1.4 Mac acceptance checkpoint (2026-10-14)

Both Mac architectures finished Developer ID signing and packaging. The full payload verifier passed all four CPU targets against 13 staged files and all six original DMG/ZIP/NSIS containers against their unpacked apps (`0.1.4-payload-verification.log`, `release-manifest.json`).

Apple accepted arm64 ZIP `2a82b5fc-23f4-4ed1-a983-24abba845083` and DMG `8b5af9f2-60f4-4bcf-a82e-0265ba428e6b`. Tickets are attached to the app and DMG, with the app repacked into `ZhuoleDocs-0.1.4-mac-arm64-stapled.zip`. Both distributions passed strict signature, ticket and Gatekeeper checks (`0.1.4-arm64-distribution.json`, `0.1.4-arm64-distribution.log`). Do not resubmit the stapled DMG as a new artifact: use the existing Apple job IDs for status.

A real packaged arm64 application was launched with a separate `qa-0.1.4-profile`. Native CUA verified service connection, login, opening the dedicated aggregate fixture and results `0,12,12,12,-8,1`. Editing A1 to 36 visibly recalculated dependent values and saved to cloud. Independent API deep comparison confirmed only A1 changed; downloaded XLSX caches matched `0,36,36,36,-8,1`. The generated document was removed, quota returned to zero, API/browser sessions logged out, and the task-owned app exited. Evidence: task accessibility transcript, `0.1.4-native-launch.log`, `0.1.4-native-readback.json`. This is focused packaged runtime acceptance, not the full three-editor/profile-upgrade regression.

Intel ZIP submission `177f8ebd-288c-4b6e-be2c-67a8ba2bab4f` is In Progress; the existing submission process is continuing with the DMG. Preserve and resume that process and `notarization.json` rather than uploading duplicates. Intel notarization/stapling/distribution acceptance and the public 0.1.4 cutover remain open. Public downloads remain 0.1.3.

### Version 0.1.4 public release (2026-10-14)

Apple accepted Intel ZIP `177f8ebd-288c-4b6e-be2c-67a8ba2bab4f` and DMG `f1b74858-f3fe-4dce-8b52-83284a8c38dd`. Both Mac architectures now have stapled applications/DMGs and separate stapled ZIPs. Full distribution validation passed strict signatures, tickets and Gatekeeper on all four Mac distributions, followed by the complete four-target/six-container payload check. Evidence: `0.1.4-status-second.log`, `0.1.4-mac-distribution.log`, `mac-distribution-manifest.json`, `0.1.4-payload-final.log`.

Official downloads now serve 0.1.4 for all four Mac/Windows architectures. Full public file hashes/sizes and HEAD/range checks passed; all sixteen historical links remain valid. Cloudflare Worker `fa3f437a-7523-4936-a338-4a91976f1c1d` serves 100% traffic. See `docs/cloudflare.md`. Windows runtime remains with the user; Intel runtime and complete current-build mobile acceptance remain open.

### Notarization concurrency guard (2026-10-14)

The release helper now acquires an exclusive owner-only `releases/desktop/notarization.lock` before reading submission records. Submission and status operations use the same lock, preventing overlapping processes from submitting the same unrecorded artifact or overwriting one another's record updates. The lock records PID/start time without credentials and is removed on normal completion or a caught tool failure. A process killed before cleanup leaves a fail-closed lock: verify both the recorded owner and any child notarytool process are no longer active before manually removing that specific lock. The helper never guesses that an existing lock is stale.

`tests/notarization-lock.test.ts` uses separate real Node processes and a local fake xcrun, with no Apple credentials/network calls. Before the repair, the concurrent process entered the tool instead of refusing the operation; after the repair it was rejected before any second tool invocation. The test also checks successful record persistence and lock removal after success and tool failure. All 92 tests passed. This guard does not resolve an unknown remote submission outcome after network loss; reconcile Apple history before retrying such an artifact. Published binaries were not rebuilt or changed.

### Windows 0.1.5 candidate (2026-10-14)

Both NSIS installers include the presentation aspect-ratio correction. The TypeScript/Vite/desktop build and x64/ARM64 packaging succeeded. Both unpacked targets match all 13 staged files exactly; installer-extracted ASAR and executable hashes match their unpacked counterparts. PE machine types match the intended architecture. Certificate table offsets/sizes are zero for both installers and application executables, consistent with the user's unsigned-Windows requirement. Prior 0.1.4 installer hashes remain unchanged.

- `releases/desktop/ZhuoleDocs-0.1.5-win-x64.exe`: SHA-256 `30da411ca4b8cfcc43bea87a818bcb8e74afe1bcd9a48a86c673c6afdf3e9c75`.
- `releases/desktop/ZhuoleDocs-0.1.5-win-arm64.exe`: SHA-256 `bb41ea6612bc036732dac81b186a981fcfef140effad58960c18e509114b971a`.

Evidence: `releases/desktop/0.1.5-windows-{build.log,payload.log,payload.json,signature.json,SHA256SUMS}`. These are local candidates; the public download manifest remains 0.1.4. Windows installer execution and editor acceptance remain with the user. Mac 0.1.5 signing/notarization and the subsequent public cutover remain open.

### Mac 0.1.5 build checkpoint (2026-10-14)

Apple Silicon DMG/ZIP packaging completed with the existing Developer ID identity. Strict deep application signing and strict DMG signing checks passed; the unpacked application matches all 13 staged files exactly. Intel signing remains in progress. The same build process continues; do not start a second build against these output directories.

The arm64 notarization helper is running, with a live `notarytool` submission process observed but no 0.1.5 submission ID persisted yet. This is an outstanding submission, not an accepted job or a failed upload. Preserve its live process and exclusive lock, observe it to completion, and reconcile Apple history before retrying any ambiguous submission. Logs: `releases/desktop/0.1.5-{mac-build,arm64-notarization}.log`. Installer payload checks, Apple acceptance, stapling, Gatekeeper and public cutover remain open. Public downloads stay on 0.1.4.

The same arm64 process subsequently persisted ZIP submission `d9e377e0-e1a5-4584-b581-4aa5125020ba` as In Progress and continued with DMG submission. The DMG upload remains live; retain the process and lock rather than resubmitting.

### Mac 0.1.5 Apple Silicon distribution acceptance (2026-10-14)

The original Mac build completed successfully for both architectures. Full payload verification passed all four desktop CPU targets against 13 staged files and all six original installer/archive containers against their unpacked applications (`0.1.5-payload-verification.log`, `release-manifest.json`).

Apple accepted arm64 ZIP `d9e377e0-e1a5-4584-b581-4aa5125020ba` and DMG `dc205154-e38f-454b-b81e-b886c2798af1`, confirmed by separate live status responses saved as `0.1.5-arm64-{zip,dmg}-status.json`. The submission ledger retains its earlier In Progress observations until a later status refresh. The app and DMG now have validated tickets; the repacked `ZhuoleDocs-0.1.5-mac-arm64-stapled.zip` and DMG passed strict signature, ticket and Gatekeeper distribution checks (`0.1.5-arm64-distribution.{json,log}`). Use status-only checks for the existing DMG submission after stapling; do not submit its changed bytes again.

Intel notarization is running in the existing helper process (`0.1.5-x64-notarization.log`). Preserve that process and exclusive lock; submission, Apple acceptance and ticket checks are still separate gates. Public downloads remain 0.1.4. No 0.1.5 native editor/runtime or profile-upgrade acceptance is claimed by these packaging checks.

### Mac 0.1.5 complete distribution verification (2026-10-14)

The existing submission and status processes completed successfully. Apple accepted Intel ZIP `45856abe-4451-4bf7-bc4c-14ee52d8fd3b` and DMG `daf6584f-28a5-4b1c-beaa-88abae6419f3`; the status refresh also confirms both arm64 submissions as Accepted. Evidence: `releases/desktop/0.1.5-notary-status.log` and the updated submission ledger. No duplicate submission was made.

Intel application and DMG tickets were attached and validated, and a separate `ZhuoleDocs-0.1.5-mac-x64-stapled.zip` was created. `node scripts/verify-mac-distribution.mjs` passed all four final Mac distributions: strict signatures, Developer ID team, hardened runtime and CPU checks for extracted ZIP applications, stapled tickets, Gatekeeper acceptance, and unchanged hashes during verification. Evidence: `0.1.5-x64-{app,dmg}-staple.log`, `0.1.5-mac-distribution.log`, `mac-distribution-manifest.json`, and `MAC-SHA256SUMS`. The preceding 0.1.4 distribution manifests were preserved separately.

Focused arm64 runtime inspection remains inconclusive: accessibility reports the presentation dialog and changes from page 1 to page 2, while the captured image still shows the editor. Rebinding and raising the window did not reconcile those observations, and exit actions did not produce a confirmed transition. The existing `0.1.5-native-slides-page2.png` is an editor image, not proof of page-two playback. Do not count these observations as visual or exit acceptance. Public downloads remain 0.1.4 pending runtime verification and release cutover; Windows and Intel runtime acceptance remain open.

### Mac 0.1.5 focused playback acceptance (2026-10-14)

After the inconclusive observation above, the task-owned application was quit through its native menu and the original process was confirmed terminal with exit code zero. Relaunching the same signed arm64 application with the same isolated `qa-0.1.5-profile` preserved the authenticated session and four existing QA documents (881 B usage). No application code, rendering flags or document content was changed.

The restarted application visibly opened the retained two-slide fixture, entered presentation mode, advanced from `1201440` to `2201440` with page count `2 / 2`, and returned to the second-slide editor using the close button. Screenshots and accessibility state now agree. The slide surface is visibly 16:9 with controls and close button outside the surface. Evidence: `releases/desktop/0.1.5-native-relaunch.log`, `0.1.5-native-relaunch-page2.png`, `0.1.5-native-relaunch-page2.txt`, and `0.1.5-native-relaunch-exit.png`. The earlier incorrectly named screenshot is retained as inconclusive evidence, not reused for this pass.

Returned to the workspace, confirmed four documents and 881 B usage, logged out to the login page, then quit through the native menu; the relaunched process exited zero. This establishes focused packaged arm64 playback, close-button exit and same-version session persistence. It does not establish keyboard navigation, complete editor regression, cross-version upgrade or Intel/Windows runtime. The cause of the earlier observation mismatch is unresolved; it did not recur during this cold run. Public 0.1.5 cutover remains the next distribution step.

### Windows user acceptance (2026-10-14)

The user reported successful installation and normal operation of the word processor, spreadsheet and presentation document types. This is user-reported runtime acceptance, separate from local packaging verification. The tested installer version, CPU architecture and Windows version were not specified. Login was included in the question but was not separately confirmed in the answer. Do not infer both architecture targets, full regression, update installation or current 0.1.5 acceptance from this report. Windows signing remains deferred by explicit user decision.

### Official 0.1.5 distribution (2026-10-14)

The official release manifest serves the 0.1.5 Mac arm64/x64 DMGs and unsigned Windows x64/arm64 installers. Full public checksum/size and HEAD/range checks passed for all four files; twenty historical links remain available. Production API smoke and a fresh Safari private-window save/playback/exit/logout workflow passed. The isolated browser fixture was verified through API readback and removed, with account usage returning to zero. See `docs/cloudflare.md` for deployment identity and evidence. Windows user acceptance remains version/architecture-unspecified; Intel hardware and complete mobile acceptance remain separate gates.

## Desktop 0.1.6 candidate preparation (2026-10-14)

Desktop version 0.1.6 includes the absolute/mixed same-sheet formula correction (WPX-12). The shared build and all 116 unit/API tests passed. Windows x64 and ARM64 NSIS installers completed; both unpacked applications match all 13 staged files byte-for-byte. Extracted installer application archives and executables independently match those verified unpacked applications. Both installers and both application executables have empty PE certificate tables, preserving the owner's unsigned Windows choice. Evidence: `releases/desktop/0.1.6-{build,tests,windows-build}.log`, `0.1.6-windows-signature.json` and `0.1.6-nsis-verification.json`.

The signed Mac build is running in the original process (`0.1.6-mac-build.log`), with active signing child processes confirmed. It has not yet returned a terminal result. Do not restart it merely because an observation times out. Mac package verification, notarization, tickets, runtime and public distribution remain pending. Existing 0.1.5 artifacts and the public manifest remain unchanged; the preceding general package manifest/checksums were preserved under `0.1.5-preserved-*`. No new Windows runtime acceptance is inferred from packaging checks.

### Mac 0.1.6 signing and submission checkpoint (2026-10-14)

The original build produced the Apple Silicon ZIP and DMG and progressed to Intel signing. The arm64 application passed strict deep signature validation; all 13 application files match staging, and its ZIP application archive matches the unpacked app. Evidence: `0.1.6-arm64-payload.json` and `0.1.6-arm64-zip-check.log`. This is package evidence, not runtime or Gatekeeper acceptance.

The existing notarization configuration was reused without credential changes. Apple returned ZIP submission ID `e86c2d76-8959-4edf-89e7-38951935ed87`, currently In Progress. The same helper is proceeding with DMG submission; preserve its live process and exclusive lock (`0.1.6-arm64-notarization.log`) rather than submitting again. The original Intel signing/build process is also still live. No Apple Accepted status, stapled ticket, Intel package completion or public cutover is claimed at this checkpoint. Public downloads remain 0.1.5.
