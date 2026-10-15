# Web spreadsheet full-sheet style budget acceptance

Date: 2026-10-15. Requirement: WPX-18.

## Behavior

A valid scalar cell style is charged as one structural leaf during the generic content preflight. This permits ordinary formatting across a full 500 × 52 sheet while retaining strict style fields, address validation, nesting and generic node limits. Invalid or unknown style properties still traverse the normal bounded structure path and fail schema validation. The 4 MB document storage cap and 3 GB account quota are unchanged.

## Verification

- `tests/sheet-style-budget.test.ts`: a 26,000-cell style map under the byte cap passes the content schema and clipboard round trip. Deep/unknown payloads, non-sheet style maps, invalid colors and invalid addresses remain rejected.
- `releases/qa/sheet-budget-tests.log`: complete test suite result.
- `releases/qa/sheet-budget-readback.json`: production save/readback covered 26,000 styles in 1,801,488 bytes. A 4,804,007-byte update received HTTP 413 without changing content or revision.
- `releases/qa/sheet-budget-final-verification.json`: dedicated QA document removed, account usage returned to zero, and all seven deployed assets matched the staged build byte-for-byte.

## Production

Cloudflare Worker `3366e7ab-74c1-4ad1-88ba-800b391e8c24` is live at `https://wpx.youdroid.top`. The release changed shared document preflight behavior only; storage routes and configuration were not changed. The production fixture exercised the same document validation and persistence path used by the web editor.
