# Cloudflare deployment

## Target

The public service is `https://wpx.youdroid.top`. WPX-4 tracks deployment and live acceptance. The current local Express service remains supported while the Cloudflare entry point is implemented.

## Storage design

Use a SQLite-backed Durable Object per account. The authenticated Worker selects the object using the account ID; callers must never select an arbitrary object through a request parameter. Keep credentials and session lookup separate from document bodies. A document mutation runs its quota check, revision check, metadata change, and body write in one `storage.transactionSync` callback with no asynchronous work inside it.

`cloud/documents.ts` implements the account-local document repository against a minimal synchronous SQL interface. Metadata includes the UTF-8 serialized content size. Bodies are stored as ordered 512,000-byte BLOB chunks and reconstructed before parsing. This preserves the existing 4 MB document limit despite Cloudflare's 2 MB SQLite row limit. The public document JSON and revision protocol are unchanged. Trash counts toward the exact 3,000,000,000-byte quota until permanent deletion.

The [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/) specify 10 GB per SQLite object on Workers Paid and 1 GB on Free. Production must verify a compatible existing account plan before claiming a usable 3 GB allowance. Do not silently lower the product quota to fit an infrastructure limit. Subscription changes require a separate decision if the existing account is insufficient.

The repository accepts only already validated document models. The HTTP boundary must enforce `contentSchema`, names, revisions, bounded request bodies, authentication, origin checks, rate limits, and error handling. The native SQL transaction adapter and actual Workers runtime are still pending; local SQLite tests alone do not establish those integrations.

## Verification so far

- Large Unicode documents round-trip across multiple chunks; each chunk stays below the SQLite row limit.
- Account-local stores do not expose each other's document IDs.
- Exact-byte quota includes trash; stale revisions cannot rename or overwrite content.
- Injected chunk insertion failure rolls back both updates and creates, including metadata and quota.
- Existing API/model tests and the production web build pass after extracting a runtime-neutral API error class. Office conversion no longer imports the Node SQLite store indirectly.

Pending: Worker routes, authentication/session storage, Durable Object bindings, local workerd integration tests, production plan and domain inspection, deploy/rollback configuration, live API and browser acceptance, and backup/recovery evidence.
