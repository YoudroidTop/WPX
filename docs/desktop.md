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

macOS test packages use ad-hoc signing (`identity: '-'`) deliberately. A Developer ID certificate, notarization, and a release update service are separate distribution tasks. Windows installers likewise require a production code-signing certificate before a trusted public distribution claim. No updater is enabled against an unconfigured endpoint.

Current platform artifacts and runtime evidence are recorded in `docs/verification.md`. Building a Windows artifact on macOS is not Windows installation or runtime acceptance. Public hosting, signing credentials, notarization, and an update distribution endpoint are still external delivery gates.
