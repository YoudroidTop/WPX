# Harmony code review

Date: 2026-10-13. Scope: six ArkTS application files, two Hvigor entrypoints, `src/harmony.ts`, `src/platform.ts`, and the Harmony integration in `DesktopHost.tsx` (11 source files).

## Result

- P0: zero unresolved.
- P1: zero unresolved code findings.
- P2: two follow-up items below.
- Code review passed. Device acceptance and distribution remain incomplete.

## Six dimensions

| Dimension           | Finding and resolution                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Style               | Services use typed methods and shared constants. Native errors remain technical; the adapter supplies user-facing messages. The single ArkUI `build` method follows its compiler-defined DSL signature.                                                                               |
| Types and modeling  | No `any` or `ESObject` in native code. Connection and file bridge contracts are explicit. ArkWeb's documented nullable interceptor behavior conflicts with its callback type; the assertion is confined to that boundary and documented. Record keys are quoted to satisfy ArkTS.     |
| State               | No redundant ArkUI state. The shared editor owns document state; native services own resource and file operations.                                                                                                                                                                    |
| UI and rendering    | No network request or expensive work in `build`. Local resource reads occur only in the request interceptor. App labels, launch color and asset error messages use resources.                                                                                                         |
| Routing             | A single centralized entry page and a fixed production origin. Main-frame navigation cannot leave the editor. Back requests go through the existing editor command handler.                                                                                                           |
| Logs and exceptions | Logger records operation names only. File failures propagate to localized adapter errors; file handles close in `finally`. No empty catch or sensitive logging. The SDK emits may-throw advisories for file APIs; Promise rejection is intentionally handled at the adapter boundary. |

## Follow-up findings

| File/surface                         | Priority | Finding                                                                                                                 | Acceptance plan                                                                                                                                                      |
| ------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ArkWeb host and `DocumentBridge.ets` | P2       | Native integration has build evidence but no signed device execution.                                                   | Provision the correct application/device profile; verify local assets, same-origin cookies, import/export bytes, account switching and offline drafts on the device. |
| `Index.ets`                          | P2       | Page-show/back hooks are present, but background-to-foreground lifecycle and root back behavior need device validation. | Exercise app backgrounding, editor return, root navigation, keyboard and foldable layouts before release; add lifecycle notification if page-show does not fire.     |

No external signing configuration, credentials, production account data or unrelated app settings were copied or modified.

## Signed-device follow-up — 2026-10-13

Reviewed `Index.ets` lifecycle changes and the two build/smoke scripts. A P0 runtime issue was found and fixed: `onPageShow` could invoke the controller before attachment and throw synchronously. Dispatch now requires readiness and catches both exception forms. Debug inspection is guarded by the generated build constant. No new ArkUI state or routing branches were introduced; logs remain operation-only. Signing material stays in a private ignored build copy, and the temporary signing configuration is removed in `finally`.

The physical API 24 device passed registration, all three editors, reload persistence and logout. This resolves the prior lack of signed execution for those flows; file pickers, offline lifecycle and foldable interaction remain P2 acceptance follow-ups. Final review: no unresolved P0 or P1 findings in this change.

## Session persistence follow-up — 2026-10-13

Scope: two ArkTS files, shared API/platform contracts, Harmony adapter and its unit test (six TypeScript/ArkTS files), plus the lifecycle harness. All six review dimensions passed for the delta: typed service methods, no new state/render work/routing, narrow async proxy exposure and sanitized adapter errors. Cookie values never cross the bridge. Awaited persistence failures reach the caller instead of being silently swallowed. No unresolved P0/P1 findings.

The physical device confirmed process termination, a new PID, restored session and pending-draft synchronization with cloud readback. Native file round trips and normal foreground recovery also have recorded acceptance. Remaining P2 gates include external file intents, keyboard/root-back and foldable interaction; this review does not imply distribution readiness.
