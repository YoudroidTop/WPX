# Architecture and delivery plan

## Product scope

Zhuole Docs (卓乐文档) is the suite brand. Zhuole Cloud Docs (卓乐云文档) is the web product. The initial priority is actual basic editing for word processing, spreadsheets, and presentations, plus a shared account and 3 GB private storage model. Cyclar project `WPX` tracks all product scope and acceptance changes.

Two implementation routes were considered:

1. Basic editors with an application-owned model and Office conversion: independent local setup, a smaller infrastructure footprint, and shared models for later clients; limited Office fidelity.
2. A mature Office document server: stronger format compatibility, but another service to operate and a licensing decision.

The user selected route 1. Advanced Office compatibility can later be provided as an explicit alternative editor backend. It must not silently convert documents and claim lossless editing.

## Components

- React / TypeScript / Vite render the workspace. Tiptap supplies the rich-text editing engine; native form controls implement the bounded spreadsheet and slide editor.
- The Express API owns authentication, authorization, quota, input validation, document revisions, and file conversion. Clients cannot provide an owner ID.
- SQLite WAL stores users, session token hashes, and normalized JSON document bodies. `BEGIN IMMEDIATE` serializes quota checks and writes. Updates use the caller's revision, including star/trash mutations, to protect against stale clients.
- Passwords use a random 128-bit salt and Node's scrypt; random 256-bit session tokens are stored only as SHA-256 hashes on the server. Sessions expire after seven days. Production cookies use Secure, HttpOnly, and SameSite=Lax.
- Mutations require an exact configured browser Origin, in addition to a valid session. No permissive CORS is enabled. Authentication attempts are rate-limited. HTTP responses include Helmet headers.
- Office export uses `docx`, `exceljs`, and `pptxgenjs`. Import uses ZIP/XML parsing and ExcelJS. XML document type and entity declarations are rejected; standard escaped characters are decoded. The upload is converted into the native model and discarded.

## Native document model

Documents have an immutable kind (`word`, `sheet`, `slide`), UUID, owner, display name, integer revision, created/updated timestamps, star flag, and optional trash timestamp.

- Word: a restricted Tiptap document tree. Only supported nodes and marks pass validation. Links allow HTTP, HTTPS, and mailto only.
- Sheet: ordered worksheets with stable UUIDs and sparse A1-addressed string cells. A string starting with `=` is parsed by the bounded formula interpreter, never JavaScript evaluation.
- Slide: an ordered collection of stable UUIDs, title, body, notes, and a named theme. Native slide models remain independent of PPTX serialization.

The schema is the first version. Future data model migrations must be explicit and tested before changing persisted fields. `.zdoc` is the current native JSON backup format, not a promise of permanent unversioned compatibility.

## Saving and recovery

The client debounces edits for 800 ms, snapshots the current model, and performs one save at a time. If typing continues during the request, the next revision is submitted afterward. The browser warns before leaving with unsaved changes. Navigating back through the app waits for the save to complete.

A network, quota, or conflict failure leaves the local draft visible. It exposes native backup download and backup-then-return actions. No automatic merge or overwrite is performed. Backups contain document content; filenames carry the display name.

The current app does not promise durable offline storage. A browser crash can lose edits that have not reached the API. Desktop/mobile offline editing will require an explicit local database and sync protocol.

## API summary

All mutation routes require the configured Origin. All document/account routes require the session cookie.

| Route                           | Behavior                                                       |
| ------------------------------- | -------------------------------------------------------------- |
| `POST /api/auth/register`       | Create account and session                                     |
| `POST /api/auth/login`          | Authenticate and create session                                |
| `POST /api/auth/logout`         | Revoke current session                                         |
| `GET /api/me`                   | Profile and current quota usage                                |
| `PATCH /api/me`                 | Update display name                                            |
| `POST /api/me/password`         | Verify current password; rotate password and sessions          |
| `GET /api/documents`            | Owned metadata, including trash, plus quota usage              |
| `POST /api/documents`           | Create a blank or validated native document                    |
| `POST /api/documents/import`    | Raw octet-stream import, encoded filename in `X-Filename`      |
| `GET /api/documents/:id`        | Read an owned document                                         |
| `PATCH /api/documents/:id`      | Revision-checked name/content/star/trash update                |
| `DELETE /api/documents/:id`     | Revision-checked permanent deletion of a trashed document      |
| `GET /api/documents/:id/export` | Download Office output; `format=zdoc` downloads native content |

HTTP 401 indicates a missing/expired session, 404 hides documents not owned by the account, 409 indicates a conflict, and 413 indicates content or quota limits.

## Later phases

### Phase two: Windows and macOS

Keep the API authoritative for accounts and cloud quota. Introduce a desktop shell only after choosing the packaging/runtime trade-off. Add local file open/save, native menus, keyboard shortcuts, durable local drafts, connectivity state, and sync conflict review. Ship platform-signed installers and a verified update channel. Desktop shell compilation is not installation, signing, or device acceptance.

### Phase three: mobile

Select target operating systems and native/cross-platform UI before implementation. Prioritize document access, focused editing, file provider/share integration, and touch-sized controls. Reuse API authorization and quota rules. Mobile offline sync should share the desktop protocol. Store submission, review, publication, and actual device acceptance remain separate delivery states.
