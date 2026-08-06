// THE canonical structural-kind list. Same rule as chat-constants.ts and guardrails.ts: pure
// data with NO imports, forever. Here the reason is layering rather than the server/browser
// boundary — every layer that must handle a kind (ops.ts's projection + identity, request.ts's
// ask, verifier.ts's verify arms, lifecycle-store.ts's persisted-op validators,
// structural-preview.ts's preview specs) value-imports this module, and any import of its own would
// drag one of those layers into all the others' bundle paths and create exactly the cycles the
// current layering avoids on purpose (see ops.ts's leaf note).
//
// WHY it exists (2026-07-25; the claim below corrected by the PR #47 review): adding an op kind
// meant a set of hand-synchronized edits whose weakest member — lifecycle-store's
// isValidStructuralOp — had no compile guard at all, so a missing arm still compiled and then
// silently DROPPED every restored sent entry carrying that kind.
//
// WHAT THIS BUYS, stated honestly: not "one place to declare a kind". How a kind projects to the
// wire, how it reads as an ask, how it verifies, how it validates and how it previews are genuinely
// per-layer facts, and there are SIX declaration sites. What the list buys is COMPILE-TIME TOTALITY
// AT EVERY ONE OF THEM: each layer keys a total map off this list, so a fifth kind fails to build at
// all six and the compiler walks the author through them instead of memory doing it. The six:
//   1. ops.ts                 OP_PROJECTIONS           — draft → wire op
//   2. ops.ts                 IDENTITY_KEYS            — what "the same ask" means
//   3. request.ts             OP_ASKS                  — the markdown the agent reads
//   4. verifier.ts            VERIFY_ARMS              — how it verifies (null = declared unverifiable)
//   5. lifecycle-store.ts     STRUCTURAL_OP_VALIDATORS — the persisted-op validator (the site that
//                                                        had no guard at all)
//   6. structural-preview.ts  PREVIEW_SPECS            — all seven per-kind preview facts
// Plus the two union types that carry the payload (`StructuralOp` in request.ts, `StructuralDraft`
// in structural-preview.ts) and whatever mint verb the store needs for the kind.
//
// AND A TOTAL `Record` IS NOT THE HOUSE PATTERN — it is one of two equally compile-total shapes. A
// `switch` with a `const exhaustive: never = x` guard is just as total and costs no cast at the call
// site; the maps are the better tool specifically where the key arrives at RUNTIME as an untrusted
// string (site 5 reads sessionStorage, and sites 1-4 dispatch ops that may have come from there) or
// where one canonical list has to walk several layers, which is this file's whole job. Don't convert
// a working exhaustive switch into a map for the form of it.

export const STRUCTURAL_OP_KINDS = ['text', 'delete', 'move', 'absolute'] as const
export type StructuralOpKind = (typeof STRUCTURAL_OP_KINDS)[number]

/** Draft kinds are the same set today and may legitimately diverge later (a kind could exist on
 * the wire with no local preview). Declared separately so that divergence is a deliberate edit. */
export const STRUCTURAL_DRAFT_KINDS = STRUCTURAL_OP_KINDS
export type StructuralDraftKind = StructuralOpKind

/** THE canonical "is this a kind we know" guard — the one lookup gate for every per-kind map in
 * this codebase. Each of those maps is an object literal, so an UNGUARDED `MAP[someKind]` on a
 * runtime-supplied string reaches Object.prototype (`'toString'`, `'constructor'`) and hands back
 * a truthy function that isn't an arm at all; a persisted op read back by a version-skewed client
 * is exactly the untrusted-string case. Guarding the lookup with this keeps every map's
 * unknown-kind path the module's own fail-closed rule instead of an inherited method.
 * A pure type-guard adds no imports — the no-imports rule (see header) is about module
 * dependencies, not about function exports (same precedent as chat-constants' isHarnessId). */
export function isStructuralOpKind(v: unknown): v is StructuralOpKind {
  return typeof v === 'string' && (STRUCTURAL_OP_KINDS as readonly string[]).includes(v)
}
