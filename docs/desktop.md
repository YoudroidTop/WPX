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

| Architecture | App ZIP | Signed DMG |
| --- | --- | --- |
| arm64 | 9f474189-112e-4530-b866-285eec16ffc4 | 092ed9a5-b381-46c9-84b9-0b39f01bbea5 |
| x64 | b77cc586-7d80-40b5-ab8e-8317a3e57592 | 638c8099-e858-4f95-abd8-56d6bf4fa85c |

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
