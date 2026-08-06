import type { TaggedElement } from './source'
import type { StructuralOp } from './request'
import { draftToOps, opsIdentical, styleableChildren } from './ops'
import { locateBySource, sourceIndex } from './lifecycle-store'
// THE canonical offset derivations (see their docs: "when P3's Absolute toggle changes what X/Y
// means, this is the only place to change" — insetWithinParent is where P3 landed that) —
// panel-readers' own `drafts` import is type-only, so this edge adds no runtime cycle.
import { insetWithinParent } from './panel-readers'
// The per-kind preview layer (see structural-preview.ts's header for what lives there and why the
// split is safe). Everything per-kind is BEHIND these verbs: this file contains no `switch (s.kind)`
// and must never grow one — that is the whole point of the registry.
import {
  ABSOLUTE_PROPS,
  capturePriorInline,
  capturePriorOrder,
  commitPreview,
  parentRecordFor,
  previewedPrior,
  previewTargets,
  rebindStructural,
  restorePreview,
  writeInline,
  writePreview,
  type AbsoluteParent,
  type PriorOracle,
  type StructuralDraft,
} from './structural-preview'

// Re-exported rather than re-pointed at the source module: `StructuralDraft`, `PREVIEW_SPECS`,
// `ABSOLUTE_PROPS` and `writeInline` are imported from './structural-drafts' by drafts.ts (which
// re-exports the first two again for ops.ts, changelist.ts, verifier.ts and panel-specs.ts) and by
// the structural-drafts suite. A refactor that makes every consumer edit an import is no longer a
// refactor of one module.
export type { StructuralDraft, AbsoluteParent, PriorOracle } from './structural-preview'
export { PREVIEW_SPECS, ABSOLUTE_PROPS, writeInline, structuralInlineKeys } from './structural-preview'

/**
 * The css half of the draft store, as seen from the structural half (2026-07-25 split).
 *
 * The two halves are separate stores because they are separate data models — a css draft is a
 * per-property before/after on ONE element, a structural draft is a whole-element verb whose
 * preview writes to siblings and parents — but they share exactly three cross-cutting facts, and
 * this interface is that list, deliberately small enough to read in one screen:
 * - **compare state** (`showingOriginal`) is per ELEMENT, not per draft kind, so it stays on
 *   DraftStore and the structural half asks;
 * - **"does this element still have any css draft?"** is what decides whether forgetting a
 *   structural draft may also forget the element's compare state;
 * - **discarding a whole element** (applyDelete's two sweeps) is css + structural together, so it
 *   is DraftStore's `discardInternal` that both halves route through.
 * Plus `emit` — one onChange owner for the composed store.
 */
export interface DraftHost {
  /** Does the css draft map still hold anything for `el`? */
  hasCss(el: TaggedElement): boolean
  /** Snapshot of the elements with live css drafts — applyDelete's subtree sweep walks it. */
  cssDraftedElements(): TaggedElement[]
  /** Is `el` currently showing its ORIGINAL side (Compare)? */
  isComparing(el: TaggedElement): boolean
  /** Auto-exit compare so the user sees the edit they just made — DraftStore's showValueSide. */
  exitCompare(el: TaggedElement): void
  /** Forget `el`'s compare state (no DOM writes). */
  forgetCompare(el: TaggedElement): void
  /** Full discard of ONE element, css + structural, without an emit — DraftStore's
   * discardInternal, so a multi-element operation cascades onChange exactly once. */
  discardElement(el: TaggedElement): void
  /** Restores the recorded originals of specific css drafts on `el` and forgets them. */
  restoreCssProps(el: TaggedElement, props: readonly string[]): void
  emit(): void
}

/**
 * THE structural draft store: the Figma-pivot verbs (text/delete/move/absolute), their live
 * inline previews, and the prior-state oracle that keeps a preview from ever being captured as
 * "the page's own value". Split out of drafts.ts on 2026-07-25 (the css draft map stayed there and
 * COMPOSES this one, delegating every structural method it exposes) because the two had grown into
 * one 890-line file and P4's ghost-node insert preview lands here, not in the css store. The PR #47
 * review split it once more, along the other axis: the per-kind PREVIEW registry moved to
 * structural-preview.ts and this file is now the store alone — state, the mint verbs, the oracle,
 * heal, commit.
 *
 * Both splits are pure moves: DraftStore's public surface did not change by one character, and the
 * cross-cutting methods that legitimately touch both halves (apply, discard, commit, compare,
 * writeAll, the counts) stayed on DraftStore and call in through here.
 *
 * The two things the second split deliberately did NOT separate: the prior-state oracle's
 * implementation (pagePrior/recordedParent) stays on the same object as every mint site that reads
 * it, and applyDelete's subtree sweep stays in one method body with its sibling-move sweep.
 */
export class StructuralDraftStore {
  private structural = new Map<TaggedElement, StructuralDraft>()
  /** (dcSource, index) recorded when a structural draft is minted — structural drafts are
   * keyed by live node reference, and an unrelated HMR remount replaces that node, visibly
   * reverting the preview while the draft lingers as a phantom (counted by the pill, skipped
   * by the send builder's isConnected sweep — unsendable until discard-all). This address is
   * what heal() re-locates by, mirroring the sent entries' healPlaceholders()
   * (PR #44 review). null for untagged elements: preview-only, pruned if disconnected. */
  private structuralAddr = new Map<TaggedElement, { dcSource: string; index: number } | null>()
  /** Bound once so the capture helpers can stay pure module functions (rebindStructural is one
   * too) while still reading the live draft map. See pagePrior for the invariant it serves. */
  private readonly priorOracle: PriorOracle = {
    inline: (node, prop) => this.pagePrior(node, prop),
    parentRecord: (parent) => this.recordedParent(parent),
  }

  constructor(private readonly host: DraftHost) {}

  /** Text-content draft. Records `original` once (first call) — later calls only move
   * `value`, mirroring the css DraftProp capture rule — and writes the value to the DOM
   * (idempotent when a contenteditable session already typed it there). `originalHint` is
   * for callers whose DOM was already mutated before this call (the contenteditable path
   * commits AFTER typing): without it the "original" would be read from a DOM that already
   * shows the new text, collapsing every edit into a no-op. No-op on a delete-drafted
   * element: there is nothing meaningful to retype on a tombstone. */
  applyText(el: TaggedElement, value: string, originalHint?: string): void {
    const existing = this.structural.get(el)
    if (existing?.kind === 'delete') return
    if (existing?.kind === 'text') {
      if (existing.value === value) return
      if (existing.original === value) {
        // Edited back to the recorded original — the draft is a no-op now. Drop it entirely:
        // unlike css no-ops (dropped at send time via computed-style compare), text ops have
        // no send-time filter, so a surviving {X→X} draft would inflate the pill and ship a
        // nonsense 'Text: "X" → "X"' ask that terminally lands 'unverified' (PR #44 review).
        this.structural.delete(el)
        this.structuralAddr.delete(el)
        if (!this.host.hasCss(el)) this.host.forgetCompare(el)
        el.textContent = value
        this.host.emit()
        return
      }
      existing.value = value
    } else {
      const original = originalHint ?? el.textContent ?? ''
      if (original === value) return // nothing changed — don't mint a no-op draft
      this.structural.set(el, { kind: 'text', original, value })
      this.recordAddr(el)
    }
    // auto-exit compare so the user sees the edit they just made (same rule as apply())
    this.host.exitCompare(el)
    el.textContent = value
    this.host.emit()
  }

  /** Delete draft. Preview = inline `display:none`, held HERE (not as a css draft — it must
   * never render as a `display` property delta). Existing css drafts are discarded (the
   * user deleted the element; its style edits are moot) and an outgoing structural draft is
   * rolled back to its original side before being replaced, so a later discard resurrects the
   * true element (its own text, its own inline `order`/`position` — generalized from the
   * text-only rollback when P3's position-owning kinds landed).
   * Deleting moots every draft in the SUBTREE too: without the descendant sweep, one request
   * would carry "Delete this element (and children)" alongside style/text ops for elements
   * inside it — contradictory asks whose deltas get measured through the ancestor's
   * display:none into non-laid-out garbage values (PR #44 review). It moots a SIBLING's move
   * draft for the same reason (review finding 9), even though nothing about it is inside the
   * subtree: a move's from/to indices count the element that is about to disappear, so the
   * request would carry "delete B" plus "move C to position 0 of 3" while the applied parent ends
   * up with two element children — and the verifier's index oracle would then be measured against
   * a different basis than the one that was sent. One emit for the whole operation (the old
   * discard-then-re-emit fired two full onChange cascades per element).
   *
   * The two sweeps are ONE invariant and must never be separated (PR #46 review, major 5 — the
   * reciprocal case was missed exactly once already, and it was missed because the two halves of
   * "this delete moots other drafts" were not written next to each other). */
  applyDelete(el: TaggedElement): void {
    const existing = this.structural.get(el)
    if (existing?.kind === 'delete') return
    if (existing) {
      restorePreview(el, existing)
      // Forget it HERE rather than letting the `structural.set` below overwrite it: between the two,
      // the sweeps run repaintOverlapping, and a still-registered outgoing draft would be repainted
      // as a "survivor" — re-writing the very `order`/`position` preview just restored (minor 9).
      this.structural.delete(el)
      this.repaintOverlapping(el, existing)
    }
    for (const other of this.host.cssDraftedElements()) {
      if (other !== el && el.contains(other)) this.host.discardElement(other)
    }
    for (const other of Array.from(this.structural.keys())) {
      if (other !== el && el.contains(other)) this.host.discardElement(other)
    }
    // The sibling-move sweep (finding 9). priorOrder membership IS "same parent, counted me":
    // it's the draft's own sibling list, so this needs no second parent comparison and catches a
    // move draft whose parent link has since moved on.
    for (const [other, s] of Array.from(this.structural)) {
      if (other !== el && s.kind === 'move' && s.priorOrder.some(([sib]) => sib === el)) {
        this.host.discardElement(other)
      }
    }
    if (this.host.hasCss(el)) this.host.discardElement(el)
    this.structural.set(el, { kind: 'delete', priorInlineDisplay: this.pagePrior(el, 'display') })
    this.recordAddr(el)
    this.host.forgetCompare(el)
    el.style.setProperty('display', 'none')
    this.host.emit()
  }

  /** Reorder draft (P3). `toIndex` is the element's FINAL index among its parent's styleable
   * element children — the basis the verifier reads and the wire op carries. Preview = explicit
   * inline `order` on every sibling (see PREVIEW_SPECS' move arm).
   *
   * Mints NOTHING when `toIndex` lands back on `fromIndex`: a drag that returns to its original
   * slot is not an edit, and a surviving no-op draft would inflate the pill and ship a "move to
   * where it already is" ask (the same collapse rule applyText follows for text edited back to
   * its original). Re-targeting an existing move draft keeps the ORIGINAL priorOrder — it holds
   * the page's own values, and our own previewed `order` must never be captured as "prior".
   *
   * That last rule holds ACROSS drafts too, which is what pagePrior is for (review finding 1): a
   * second drag in the same row captured draft #1's `order` preview as "the page's" and a discard
   * then left all four siblings visibly reordered with no draft owning them.
   *
   * KNOWN LIMIT: two live move drafts in one parent still show only the LAST one's preview (each
   * writePreview recomputes the full `order` sequence from its own priorOrder, so the later write
   * wins). Both asks travel and both restore verbatim — it is the preview that under-reports, not
   * the state. Composing two reorders into one visual sequence is a drag-side product question.
   * The related DISCARD hole is now fixed rather than accepted (repaintOverlapping, PR #46 review's
   * minor 9); what survives of this limit is the last-write-wins paint itself, plus the same
   * last-write-wins ambiguity in per-element Compare (compare() restores ONE element's original
   * while an overlapping draft's preview still stands, and is deliberately not repainted — a
   * repaint there would immediately re-write `order` on the very element being compared). */
  applyMove(el: TaggedElement, toIndex: number): void {
    if (this.blockedByOtherStructural(el, 'move')) return
    const parent = el.parentElement
    if (!parent) return
    const siblings = this.reorderBasis(parent)
    const fromIndex = siblings.indexOf(el)
    if (fromIndex === -1) return
    const to = Math.max(0, Math.min(toIndex, siblings.length - 1))
    const existing = this.structural.get(el)
    if (to === fromIndex) {
      // Dragged back home: drop an in-flight move draft, mint nothing when there wasn't one.
      if (!existing) return
      this.dropStructural(el)
      this.host.emit()
      return
    }
    if (existing?.kind === 'move') {
      if (existing.toIndex === to) return
      existing.toIndex = to
      this.host.exitCompare(el)
      writePreview(el, existing)
      this.host.emit()
      return
    }
    const draft: StructuralDraft = {
      kind: 'move',
      fromIndex,
      toIndex: to,
      priorOrder: capturePriorOrder(siblings, this.priorOracle),
    }
    this.structural.set(el, draft)
    this.recordAddr(el)
    this.host.exitCompare(el)
    writePreview(el, draft)
    this.host.emit()
  }

  /** Absolute-position toggle (P3, ratified #4 — the toggle owns the parent too, as ONE op).
   * `on: true` seeds the inset from the element's current offsets so the preview doesn't jump,
   * and records the parent plus whether it still needs `position: relative`. `on: false` is the
   * absolute→static direction (only reachable on an element that IS absolute in the code) and
   * drafts `position: static` with no parent edit.
   *
   * Toggling straight back to the state the code already has DROPS the draft rather than
   * stacking a second one — applyText's edited-back-to-original collapse, same reasoning: a
   * {static → absolute → static} draft is a no-op ask with no send-time filter to catch it.
   *
   * Plain X/Y edits on an element that is ALREADY absolute in the code are NOT this path —
   * they're ordinary `left`/`top` css drafts (P3 delegated call #2). This op exists only for the
   * transition, where a bare inset delta would be an incoherent ask. */
  applyAbsolute(el: TaggedElement, on: boolean): void {
    if (this.blockedByOtherStructural(el, 'absolute')) return
    const existing = this.structural.get(el)
    if (existing?.kind === 'absolute') {
      if (existing.on === on) return
      this.dropStructural(el)
      this.host.emit()
      return
    }
    // A css draft on the very properties this draft is about to own would leave two owners of
    // one inline value: our preview would clobber the css draft's value, and priorInline would
    // capture OUR draft as the page's own (a discard could never get back). Restore those css
    // originals first — same "the other draft is moot now" rule applyDelete follows.
    this.host.restoreCssProps(el, ABSOLUTE_PROPS)
    const parent = el.parentElement
    // The seed is the element's inset WITHIN ITS PARENT, never elementOffsets' offsetParent-
    // relative reading (review finding 4): a `static` parent — the common case, and the very one
    // this draft is about to make `relative` — is by definition NOT the offsetParent, so those
    // offsets are measured against a distant ancestor (usually <body>). The preview jumped the
    // element clean out of its parent AND the op shipped that page coordinate as "px from the
    // parent's left", which the verifier then confirmed (its `expected` is minted from this same
    // seed). insetWithinParent owns the geometry and the why.
    const offsets = on && parent ? insetWithinParent(el, parent) : { x: 0, y: 0 }
    const draft: StructuralDraft = {
      kind: 'absolute',
      on,
      left: offsets.x,
      top: offsets.y,
      priorInline: capturePriorInline(el, this.priorOracle),
      parent: on && parent ? parentRecordFor(parent, this.priorOracle) : null,
    }
    this.structural.set(el, draft)
    this.recordAddr(el)
    this.host.exitCompare(el)
    writePreview(el, draft)
    this.host.emit()
  }

  /** Moves an `absolute` draft's inset (arrow-key nudge, panel X/Y). Deliberately draft-only:
   * an element with no absolute draft is either in flow (X/Y are read-only) or already absolute
   * in the code, where insets are plain `left`/`top` css drafts — the routing between the two
   * lives in the caller (panel/drag), not here (P3 plan §Panel). */
  setAbsoluteInset(el: TaggedElement, left: number, top: number): void {
    const s = this.structural.get(el)
    if (s?.kind !== 'absolute' || !s.on) return
    if (s.left === left && s.top === top) return
    s.left = left
    s.top = top
    this.host.exitCompare(el)
    writePreview(el, s)
    this.host.emit()
  }

  /**
   * THE move index basis: `parent`'s styleable element children MINUS the ones this request is
   * DELETING. Every index that describes a reorder — `applyMove`'s from/to, the `order` preview's
   * sibling list, move-drag's hit test and arrow-key range, `anchorFor`'s anchor pick — is an index
   * into this ONE list.
   *
   * Why the tombstones come out (PR #46 review, major 5 — the reciprocal of applyDelete's own
   * sibling-move sweep, finding 9): `toIndex` is an instruction about JSX children, so the basis is
   * whatever the AGENT counts. It counts every element child, including page-authored hidden ones —
   * a `display:none` div is still a JSX child, so those stay IN — but it does NOT count a child the
   * same request deletes, because that child is gone by the time the reorder lands. Counting a
   * tombstone shipped an index one too high AND let `anchorFor` name the doomed element as the
   * anchor ("reorder so it comes immediately after <B>" in a request that also deletes <B>); and
   * since the post-apply DOM no longer contains B, the verifier's index oracle was measured in a
   * different basis than the one that was sent — a systematic false MISMATCH on a correct apply.
   *
   * The mirror image of the same insight is why the VERIFIER still reads the raw `styleableChildren`
   * and needed no change: by the time it measures, the tombstone is gone from source, so the raw
   * list has already become this one. Hidden siblings are the case the two lists must NOT diverge
   * on — they are excluded from move-drag's rect hit test (no geometry) but counted here.
   */
  reorderBasis(parent: Element): TaggedElement[] {
    return styleableChildren(parent).filter((child) => this.structural.get(child)?.kind !== 'delete')
  }

  /**
   * Runs a GEOMETRY read against the page's own positioning context, with our own preview-only
   * `position: relative` writes on `el`'s ancestors temporarily lifted (PR #46 review, minor 5).
   *
   * The prior-state invariant below is about inline VALUES, and pagePrior answers those from a saved
   * record precisely so nothing has to be un-written and re-written. A geometry question has no such
   * shortcut — offsets are produced by layout, not stored anywhere — so this is the one capture site
   * that must neutralize-and-measure, the same trick verifier.ts's `withNeutralized` uses and the
   * same save-verbatim/restore shape as panel-readers' `insetWithinParent` (which does the inverse:
   * it temporarily ADDS a containing block).
   *
   * Scope is deliberately narrow: only ancestors that some live `absolute` draft records with
   * `needsRelative` — i.e. nodes that are `relative` ONLY because we previewed it — are lifted. A
   * css draft on `position` is a real pending ask the agent will apply, so it stays in force.
   */
  measureAtPagePrior<T>(el: TaggedElement, read: () => T): T {
    const stash: Array<[TaggedElement, string]> = []
    for (let node = el.parentElement; node; node = node.parentElement) {
      const record = this.recordedParent(node as TaggedElement)
      if (!record || !record.needsRelative) continue
      stash.push([node as TaggedElement, node.style.getPropertyValue('position')])
      writeInline(node as TaggedElement, 'position', record.priorInlinePosition)
    }
    try {
      return read()
    } finally {
      // Verbatim, and back to the PREVIEW's value (not the page's) — the preview is still live.
      for (const [node, live] of stash) writeInline(node, 'position', live)
    }
  }

  /**
   * Re-paints every OTHER live structural draft whose preview writes to a node `restored` just reset
   * (PR #46 review, minor 9). Structural previews SHARE nodes — a move writes `order` on all of its
   * siblings, an absolute writes `position` on the parent — so `restorePreview` for one draft
   * necessarily wipes part of another's, and nothing repainted: discarding child A's absolute draft
   * removed the shared parent's `relative` while child B's inset still stood (B jumped to a distant
   * containing block), and discarding one of two move drafts in a parent restored page-original
   * `order` on every shared sibling. The STATE was always right (both asks unaffected, both restore
   * verbatim) — it was the preview that broke, silently, which is worse.
   *
   * Overlap is computed from `previewTargets` rather than repainting everything, so this stays a
   * no-op in the overwhelmingly common single-draft case. `writePreview` is idempotent for every
   * kind, so a redundant repaint would be harmless anyway; an element currently showing its ORIGINAL
   * side (Compare) is skipped, because re-painting its preview is the one thing that would visibly
   * contradict the user.
   */
  repaintOverlapping(owner: TaggedElement, restored: StructuralDraft): void {
    const touched = new Set(previewTargets(owner, restored))
    for (const [other, s] of this.structural) {
      if (other === owner || this.host.isComparing(other)) continue
      if (!previewTargets(other, s).some((node) => touched.has(node))) continue
      writePreview(other, s)
    }
  }

  /** THE prior-state oracle behind the invariant stated on PriorOracle: **prior state is never
   * captured from a node whose properties a live structural draft is currently previewing.** Every
   * capture site — the two mint paths, heal's rebind, and DraftStore.apply()'s css original — reads
   * the page's own inline value through here instead of straight off the DOM.
   *
   * Reading the DOM was correct while `delete` and `text` were the only kinds: each previewed a
   * property of the drafted element ITSELF, and one-draft-per-element already serialized that. P3's
   * kinds broke the assumption — a move writes `order` on every SIBLING and an absolute toggle
   * writes `position` on the PARENT — so a second draft, or a heal after a remount, read OUR OWN
   * preview and recorded it as "the page's". Three proven consequences: a second drag in one row
   * left all four siblings stranded with inline `order` and no draft owning them after a discard
   * (finding 1), a healed move recorded the preview as prior (finding 2), and a healed absolute
   * shipped `needsRelative: false` for a parent that is only `relative` because we made it
   * (finding 3) — an instruction that positions the element against the wrong ancestor.
   *
   * Consulting the owning draft's SAVED value — rather than restoring every overlapping preview,
   * capturing, then re-applying — is what keeps this a pure read: the owner recorded the page's own
   * value at mint time, so it IS the answer, and no write/reflow/re-write cycle can fight an
   * in-flight preview or churn a text draft's child nodes on an unrelated element.
   *
   * This method and `recordedParent` live on the same object as the drafts they read, and every
   * mint site with them, BY DESIGN (2026-07-25 split): an oracle one module away from the map it
   * consults is an oracle that can be forgotten at the next capture site. */
  pagePrior(node: TaggedElement, prop: string): string {
    for (const [owner, s] of this.structural) {
      const saved = previewedPrior(owner, s, node, prop)
      if (saved !== null) return saved
    }
    return node.style.getPropertyValue(prop)
  }

  /** The live record of `parent` as some absolute draft's positioning context — the other half of
   * pagePrior (see parentRecordFor): `needsRelative` cannot be re-derived through our own
   * `position: relative`, so the untouched-page reading taken by whichever draft got there first
   * is the one that keeps travelling. */
  recordedParent(parent: TaggedElement): AbsoluteParent | null {
    for (const s of this.structural.values()) {
      if (s.kind === 'absolute' && s.parent?.el === parent) return s.parent
    }
    return null
  }

  /** One structural draft per element is the data model (`structural` is keyed by element), so a
   * kind arriving on an element another kind already owns is refused rather than allowed to
   * silently destroy it: a move over a text draft would drop the typed text, and `delete`'s
   * tombstone rule (nothing is meaningfully movable/positionable on a deleted element) is the
   * same refusal. Callers gate the gesture too (the drag never starts on a tombstone). */
  private blockedByOtherStructural(el: TaggedElement, kind: StructuralDraft['kind']): boolean {
    const s = this.structural.get(el)
    return !!s && s.kind !== kind
  }

  /** Drops a structural draft, restoring its preview, and forgets its records — the collapse
   * path (a draft toggled/dragged back to the state the code already has). Css drafts on the
   * same element survive untouched; the caller owns the emit. */
  private dropStructural(el: TaggedElement): void {
    const s = this.structural.get(el)
    if (!s) return
    restorePreview(el, s)
    this.structural.delete(el)
    this.structuralAddr.delete(el)
    if (!this.host.hasCss(el)) this.host.forgetCompare(el)
    this.repaintOverlapping(el, s)
  }

  /** Captures (dcSource, index) once per structural draft — see structuralAddr. */
  private recordAddr(el: TaggedElement): void {
    if (this.structuralAddr.has(el)) return
    const dcSource = el.dataset?.dcSource
    this.structuralAddr.set(el, dcSource ? { dcSource, index: sourceIndex(el, dcSource) } : null)
  }

  /** Re-binds structural drafts whose DOM node was replaced (an unrelated HMR remount) onto
   * the freshly-mounted node — re-applying the preview — and PRUNES drafts that can't be
   * re-located (or lost their address). The structural analog of the sent entries'
   * healPlaceholders(); without it a remount leaves a phantom draft the pill counts but the
   * send builder skips (PR #44 review). Called from the send path and the draft-sync flush —
   * cheap no-op while every drafted node is still connected. The per-kind re-derivation (and its
   * prune rules) lives in rebindStructural. */
  heal(): boolean {
    let changed = false
    for (const [el, s] of Array.from(this.structural)) {
      if (el.isConnected) continue
      const addr = this.structuralAddr.get(el) ?? null
      const next = addr ? locateBySource(addr.dcSource, addr.index) : null
      // Rebind BEFORE forgetting the outgoing draft (review findings 2 & 3): while it is still in
      // `structural` it is the only record of the page's own values for the nodes it is STILL
      // previewing — a move's surviving siblings, an absolute's surviving parent — and that is
      // exactly what the prior oracle consults. Deleting first made the rebind re-capture our own
      // preview as "prior", which a later discard could then never undo.
      const target = next && !this.structural.has(next) ? next : null
      const healed = target ? rebindStructural(target, s, this.priorOracle, (p) => this.reorderBasis(p)) : null
      // Pruning must not strand the preview either: the drafted node is gone, but the nodes we
      // wrote to may not be, and nothing else would ever own those inline values again. Safe to
      // run in the healed case too — restore writes the page's values to the OLD sibling/parent
      // set (including any node the fresh set no longer contains) and writePreview below re-paints
      // the new one.
      restorePreview(el, s)
      this.structural.delete(el)
      this.structuralAddr.delete(el)
      if (!this.host.hasCss(el)) this.host.forgetCompare(el)
      changed = true
      // Same wipe as a discard: the restore above resets nodes an OVERLAPPING draft is still
      // previewing (minor 9). Repaint before the healed draft's own write below, so the fresh draft
      // still gets the last word where the two target the same nodes (the last-write-wins limit).
      this.repaintOverlapping(el, s)
      if (!target || !healed) continue
      this.structural.set(target, healed)
      this.structuralAddr.set(target, addr)
      writePreview(target, healed)
    }
    if (changed) this.host.emit()
    return changed
  }

  of(el: TaggedElement): StructuralDraft | null {
    return this.structural.get(el) ?? null
  }

  entries(): ReadonlyMap<TaggedElement, StructuralDraft> {
    return this.structural
  }

  has(el: TaggedElement): boolean {
    return this.structural.has(el)
  }

  get size(): number {
    return this.structural.size
  }

  /** Puts the DOM back to the structural draft's original side (used by full discard). */
  restoreStructural(el: TaggedElement): void {
    const s = this.structural.get(el)
    if (!s) return
    restorePreview(el, s)
  }

  /** The structural half of DraftStore.writeAll — 'original' delegates to restoreStructural,
   * ONE owner of what "the original side" means for a structural draft, shared with discard
   * (PR #44 review: the two inline copies would drift the compare-toggle restore apart from the
   * discard restore). */
  writeSide(el: TaggedElement, side: 'original' | 'value'): void {
    const s = this.structural.get(el)
    if (!s) return
    if (side === 'original') this.restoreStructural(el)
    else writePreview(el, s)
  }

  /** The structural half of DraftStore.discardInternal: restores the original side, forgets every
   * record for `el`, and repaints AFTER the forget so the sweep can never see this draft as a
   * survivor (minor 9). No emit — the caller owns it. */
  discardFor(el: TaggedElement): void {
    const s = this.structural.get(el)
    this.restoreStructural(el)
    this.structural.delete(el)
    this.structuralAddr.delete(el)
    if (s) this.repaintOverlapping(el, s)
  }

  /** The structural half of an untargeted DraftStore.commit(el). Structural commit semantics: the
   * code owns the result now. Text → leave the DOM as-is (HMR re-rendered it from source). Delete →
   * leave display:none in place: the JSX is gone from source, so a surviving stale node must stay
   * invisible until the framework drops it — un-hiding it would flash a ghost of the deleted
   * element. Move/absolute → the opposite: strip the preview (see CommitPolicy's own note).
   * No emit — the caller owns it. */
  commitFor(el: TaggedElement): void {
    const s = this.structural.get(el)
    if (s) commitPreview(el, s)
    this.structural.delete(el)
    this.structuralAddr.delete(el)
    // move/absolute strip their preview here, which wipes any overlapping draft's preview exactly
    // like a discard does — same repaint (minor 9). No-op for text/delete, which restore nothing.
    if (s) this.repaintOverlapping(el, s)
  }

  /** Targeted structural commit — the structural analog of commit(el, props): forgets the
   * structural draft ONLY when it still matches what was actually sent/verified, so a
   * structural draft re-edited AFTER the send (new text typed while in flight) survives
   * exactly like an un-sent css draft does. The DOM follows the same per-kind commit policy as
   * commit() — untouched for text (HMR re-rendered it) and delete (display:none must stay on any
   * surviving stale node), preview stripped for move/absolute (see CommitPolicy). This is the
   * path the verifier actually takes for a verified structural op (verifier.ts's handleApplied
   * calls commitStructural, not commit), so the policy has to live here too, not only in
   * commit() — one shared helper rather than two tables. Takes the wire StructuralOp
   * directly (a TYPE-only import erases at build, so it can't cycle — changelist.ts and
   * lifecycle.ts already type-import it the same way); the match rule is ops.ts's shared
   * opsIdentical, not a third inline copy of the identity table. */
  commitStructural(el: TaggedElement, sent: StructuralOp): void {
    const s = this.structural.get(el)
    if (!s) return
    if (!opsIdentical(draftToOps(s), [sent])) return
    commitPreview(el, s)
    this.structural.delete(el)
    this.structuralAddr.delete(el)
    if (!this.host.hasCss(el)) this.host.forgetCompare(el)
    this.repaintOverlapping(el, s) // see commit()'s note (minor 9)
    this.host.emit()
  }

  /** Forgets every structural draft — the structural half of discardAll. The caller restores each
   * original side first (through restoreStructural) and owns the emit. */
  clear(): void {
    this.structural.clear()
    this.structuralAddr.clear()
  }
}
