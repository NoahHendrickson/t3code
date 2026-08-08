import type { TaggedElement } from './source'
import type { StructuralOp } from './request'
import {
  ABSOLUTE_PROPS,
  StructuralDraftStore,
  writeInline,
  type DraftHost,
  type StructuralDraft,
} from './structural-drafts'

// The Figma-pivot structural drafts (their type, their preview registry, their store) moved to
// structural-drafts.ts on 2026-07-25 — this file had grown to 890 lines carrying two data models,
// and P4's ghost-node insert preview lands in that one. Re-exported here rather than re-pointed at
// the source module because `StructuralDraft` and `PREVIEW_SPECS` are imported from './drafts' by
// ops.ts, changelist.ts, verifier.ts, panel-specs.ts and their tests: the split must not cost every
// consumer an import edit, and a pure refactor that touches consumers is no longer pure.
export type { StructuralDraft } from './structural-drafts'
export { PREVIEW_SPECS } from './structural-drafts'

interface DraftProp {
  original: string
  value: string
}

export class DraftStore {
  onChange: (() => void) | null = null

  private drafts = new Map<TaggedElement, Map<string, DraftProp>>()
  private showingOriginal = new Set<TaggedElement>()
  /** The cross-cutting facts the structural half needs from the css half (see DraftHost for why
   * these three and no more). Bound once, as an object literal rather than by making DraftStore
   * `implements DraftHost`, so none of it leaks into DraftStore's public surface — which the
   * 2026-07-25 split kept identical to the character. */
  private readonly host: DraftHost = {
    hasCss: (el) => this.drafts.has(el),
    cssDraftedElements: () => [...this.drafts.keys()],
    isComparing: (el) => this.showingOriginal.has(el),
    exitCompare: (el) => this.showValueSide(el),
    forgetCompare: (el) => {
      this.showingOriginal.delete(el)
    },
    discardElement: (el) => this.discardInternal(el),
    restoreCssProps: (el, props) => this.restoreDraftedProps(el, props),
    emit: () => this.emit(),
  }
  /** The structural draft store this one COMPOSES: every structural method below is a delegation,
   * and the shared verbs (apply/discard/commit/compare/writeAll and the counts) are the ones that
   * legitimately touch both halves. */
  private readonly structural = new StructuralDraftStore(this.host)

  /* t3-fork: `knownOriginal` is the restore path's answer to "what did the page have here?".
   * The default oracle (`pagePrior`) reads the element's live inline style for a css draft,
   * which is the previous engine's own preview whenever this session is being rebuilt into the
   * SAME document (the Design-mode off/on toggle destroys the engine but leaves the previews
   * painted). A restore already knows the real original — it was persisted with the draft —
   * so it passes it rather than letting the oracle re-derive a lie. See
   * lifecycle-store.ts's PersistedLifecycle.drafts. */
  apply(el: TaggedElement, prop: string, value: string, knownOriginal?: string): void {
    // Same tombstone guard as applyText: Compare un-hides a delete-drafted element
    // (writeAll 'original' restores its display), which makes it selectable and scrubbable
    // again — a css draft minted there would ride the same request as the delete, telling
    // the agent to both restyle and remove the element (PR #44 review).
    const structural = this.structural.of(el)
    if (structural?.kind === 'delete') return
    // The same refusal for the properties an `absolute` draft owns end-to-end (review finding 8) —
    // the missing mirror of applyAbsolute's restoreDraftedProps, which already clears this pair
    // the other way round. Reachable from the panel's X/Y fields, which stay editable while the
    // draft is live: a css draft minted here would ride the SAME request as the absolute op, so
    // one item would carry `left: … → 80px` AND the op's own `inset` — two contradictory asks.
    // Refused in both directions: on an `on: false` draft (returning to flow) an inset is
    // meaningless, and priorInline/commit own all three properties there too.
    if (structural?.kind === 'absolute' && (ABSOLUTE_PROPS as readonly string[]).includes(prop)) return
    let props = this.drafts.get(el)
    if (!props) {
      props = new Map()
      this.drafts.set(el, props)
    }
    const existing = props.get(prop)
    // `original` is the PAGE's own value, not the live one: another element's structural preview
    // may be sitting on this very property (a child's absolute draft writes `position: relative` on
    // THIS node), and capturing that as "original" would make a discard un-restorable — same rule,
    // same oracle, as every structural capture (review findings 1-3).
    if (existing) existing.value = value
    else props.set(prop, { original: knownOriginal ?? this.structural.pagePrior(el, prop), value })

    if (this.showingOriginal.has(el)) {
      // auto-exit compare so the user sees the edit they just made
      this.showingOriginal.delete(el)
      this.writeAll(el, 'value')
    }
    el.style.setProperty(prop, value)
    this.emit()
  }

  /** @see StructuralDraftStore.applyText */
  applyText(el: TaggedElement, value: string, originalHint?: string): void {
    this.structural.applyText(el, value, originalHint)
  }

  /** @see StructuralDraftStore.applyDelete */
  applyDelete(el: TaggedElement): void {
    this.structural.applyDelete(el)
  }

  /** @see StructuralDraftStore.applyMove */
  applyMove(el: TaggedElement, toIndex: number): void {
    this.structural.applyMove(el, toIndex)
  }

  /** @see StructuralDraftStore.applyAbsolute */
  applyAbsolute(el: TaggedElement, on: boolean): void {
    this.structural.applyAbsolute(el, on)
  }

  /** @see StructuralDraftStore.setAbsoluteInset */
  setAbsoluteInset(el: TaggedElement, left: number, top: number): void {
    this.structural.setAbsoluteInset(el, left, top)
  }

  /** THE move index basis — @see StructuralDraftStore.reorderBasis (move-drag's hit test, the
   * arrow-key range and `applyMove` must all count in this ONE list). */
  reorderBasis(parent: Element): TaggedElement[] {
    return this.structural.reorderBasis(parent)
  }

  /** @see StructuralDraftStore.measureAtPagePrior */
  measureAtPagePrior<T>(el: TaggedElement, read: () => T): T {
    return this.structural.measureAtPagePrior(el, read)
  }

  /** @see StructuralDraftStore.heal — kept under its original name because index.ts's send path
   * and draft-sync flush call it. */
  healStructural(): boolean {
    return this.structural.heal()
  }

  structuralOf(el: TaggedElement): StructuralDraft | null {
    return this.structural.of(el)
  }

  structuralEntries(): ReadonlyMap<TaggedElement, StructuralDraft> {
    return this.structural.entries()
  }

  current(el: TaggedElement, prop: string): string | null {
    return this.drafts.get(el)?.get(prop)?.value ?? null
  }

  hasDrafts(el: TaggedElement): boolean {
    return this.drafts.has(el) || this.structural.has(el)
  }

  elementCount(): number {
    let n = this.drafts.size
    for (const el of this.structural.entries().keys()) if (!this.drafts.has(el)) n++
    return n
  }

  /** Total drafted properties across all elements — the composer pill's "N changes" count.
   * Same cheap Map-size read as elementCount(); a CSS draft scrubbed back to its exact
   * original still counts (css no-ops are only detectable at send time via computed styles —
   * see buildChangeRequestWithElements), matching elementCount()'s identical blind spot.
   * Text drafts have no such blind spot: applyText collapses an edit back to the original. */
  changeCount(): number {
    let n = this.structural.size // one change per structural draft (text/delete/move/absolute)
    for (const props of this.drafts.values()) n += props.size
    return n
  }

  compare(el: TaggedElement, on: boolean): void {
    if (!this.hasDrafts(el) || on === this.showingOriginal.has(el)) return
    if (on) this.showingOriginal.add(el)
    else this.showingOriginal.delete(el)
    this.writeAll(el, on ? 'original' : 'value')
    this.emit()
  }

  compareAll(on: boolean): void {
    for (const el of this.draftedElements()) {
      if (on) this.showingOriginal.add(el)
      else this.showingOriginal.delete(el)
      this.writeAll(el, on ? 'original' : 'value')
    }
    this.emit()
  }

  isComparing(el: TaggedElement): boolean {
    return this.showingOriginal.has(el)
  }

  isComparingAll(): boolean {
    // Runs on EVERY drafts.onChange (refreshStatus → overlay.updateStatus), i.e. per scrub
    // tick — count arithmetically via elementCount() (O(structural), typically 0-2 entries)
    // instead of iterating the whole drafted-element union per pointermove (PR #44 review).
    const total = this.elementCount()
    return total > 0 && this.showingOriginal.size === total
  }

  entries(): ReadonlyMap<TaggedElement, ReadonlyMap<string, { original: string; value: string }>> {
    return this.drafts
  }

  discard(el: TaggedElement, props?: string[]): void {
    const draftProps = this.drafts.get(el)
    if (props) {
      if (!draftProps) return
      // targeted discard: restore only the listed properties' recorded originals —
      // an un-targeted draft on the same element must survive untouched.
      // Targeted discards are css-only by contract: structural drafts have no property
      // names to target and must survive them.
      for (const prop of props) {
        const d = draftProps.get(prop)
        if (!d) continue
        writeInline(el, prop, d.original)
        draftProps.delete(prop)
      }
      if (draftProps.size === 0) {
        this.drafts.delete(el)
        if (!this.structural.has(el)) this.showingOriginal.delete(el)
      }
    } else {
      if (!draftProps && !this.structural.has(el)) return
      this.discardInternal(el)
    }
    this.emit()
  }

  /** Full-discard body without the emit — restores css originals + the structural original
   * side and forgets every record for `el`. Shared by discard() and applyDelete()'s subtree
   * sweep so a multi-element operation cascades onChange exactly once. */
  private discardInternal(el: TaggedElement): void {
    const draftProps = this.drafts.get(el)
    if (draftProps) for (const [prop, d] of draftProps) writeInline(el, prop, d.original)
    this.drafts.delete(el)
    this.showingOriginal.delete(el)
    // The structural half restores its own original side and runs its repaint sweep AFTER the
    // forget, so this draft can never be seen as a survivor (minor 9).
    this.structural.discardFor(el)
  }

  commit(el: TaggedElement, props?: string[]): void {
    const draftProps = this.drafts.get(el)
    if (props) {
      if (!draftProps) return
      // targeted commit: only forget the properties that were actually verified/sent —
      // an un-sent draft on the same element (e.g. a different property edited after
      // the request went out) must survive so it isn't silently lost.
      // Targeted commits are css-only by contract (see targeted discard above).
      for (const prop of props) {
        el.style.removeProperty(prop)
        draftProps.delete(prop)
      }
      if (draftProps.size === 0) {
        this.drafts.delete(el)
        if (!this.structural.has(el)) this.showingOriginal.delete(el)
      }
    } else {
      if (!draftProps && !this.structural.has(el)) return
      if (draftProps) for (const prop of draftProps.keys()) el.style.removeProperty(prop)
      this.drafts.delete(el)
      this.showingOriginal.delete(el)
      // Structural commit semantics: the code owns the result now. Text → leave the DOM
      // as-is (HMR re-rendered it from source). Delete → leave display:none in place: the
      // JSX is gone from source, so a surviving stale node must stay invisible until the
      // framework drops it — un-hiding it would flash a ghost of the deleted element.
      // Move/absolute → the opposite: strip the preview (see CommitPolicy's own note).
      this.structural.commitFor(el)
    }
    this.emit()
  }

  /** @see StructuralDraftStore.commitStructural — the verifier's path for a verified structural
   * op (verifier.ts's handleApplied calls this, not commit()). */
  commitStructural(el: TaggedElement, sent: StructuralOp): void {
    this.structural.commitStructural(el, sent)
  }

  discardAll(): void {
    for (const el of Array.from(this.drafts.keys())) {
      const props = this.drafts.get(el)!
      for (const [prop, d] of props) writeInline(el, prop, d.original)
      this.showingOriginal.delete(el)
    }
    for (const el of Array.from(this.structural.entries().keys())) {
      this.structural.restoreStructural(el)
      this.showingOriginal.delete(el)
    }
    this.drafts.clear()
    this.structural.clear()
    this.emit()
  }

  /** The css+structural drafted-element union — THE one iteration every consumer walks
   * (request builder, changelist, compareAll). Public since the PR #44 review: the two
   * external hand-rolled sweeps of entries()-then-structuralEntries() had already diverged
   * on their isConnected filters. */
  *draftedElements(): IterableIterator<TaggedElement> {
    yield* this.drafts.keys()
    for (const el of this.structural.entries().keys()) if (!this.drafts.has(el)) yield el
  }

  /** Auto-exit compare so the user sees the edit they just made (same rule as apply()). */
  private showValueSide(el: TaggedElement): void {
    if (!this.showingOriginal.has(el)) return
    this.showingOriginal.delete(el)
    this.writeAll(el, 'value')
  }

  /** Restores the recorded originals of specific css drafts and forgets them — the un-emitted
   * body of a targeted discard, for callers that are mid-operation and own the emit. */
  private restoreDraftedProps(el: TaggedElement, props: readonly string[]): void {
    const draftProps = this.drafts.get(el)
    if (!draftProps) return
    for (const prop of props) {
      const d = draftProps.get(prop)
      if (!d) continue
      writeInline(el, prop, d.original)
      draftProps.delete(prop)
    }
    if (draftProps.size === 0) this.drafts.delete(el)
  }

  private writeAll(el: TaggedElement, side: 'original' | 'value'): void {
    const props = this.drafts.get(el)
    if (props) for (const [prop, d] of props) writeInline(el, prop, d[side])
    // 'original' delegates to restoreStructural — ONE owner of what "the original side"
    // means for a structural draft, shared with discard (PR #44 review: the two inline
    // copies would drift the compare-toggle restore apart from the discard restore).
    this.structural.writeSide(el, side)
  }

  private emit(): void {
    this.onChange?.()
  }
}
