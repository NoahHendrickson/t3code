import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import { cn } from "~/lib/utils";
import { useDesignChangeDraftStore } from "../designChangeDraftStore";
import { designModeBridge } from "../designModeBridge";
import { selectDesignModeTab, useDesignModeStore } from "../designModeStore";
import { useDesignSentPreviews } from "../designSentPreviews";
import { applyDesignUndoEntry } from "../designUndoApply";
import { designUndoHistory } from "../designUndoHistory";
import {
  countUnresolvedDesignElements,
  type DesignModeAlignAxis,
  type DesignModeAlignValue,
  type DesignModeSizeMode,
  type DesignModeWritableKey,
} from "../protocol";
import { CanvasControls } from "./CanvasControls";
import { SentPreviewResolution } from "./SentPreviewResolution";
import { AppearanceSection } from "./sections/AppearanceSection";
import { LayoutSection } from "./sections/LayoutSection";
import { FillSection, MarginSection, StrokeSection } from "./sections/PaintSections";
import { PositionSection } from "./sections/PositionSection";
import { TypographySection } from "./sections/TypographySection";
import { fieldStateFor, type FieldStateFor } from "./selectionValues";

interface Props {
  runtimeTabId: string | null;
  threadRef: ScopedThreadRef;
  /** Which preview tab this panel is docked beside. An identifier, not surface state: the
   * canvas strip's screen-size picker reads the viewport for itself. */
  tabId: string | null;
}

/**
 * The native design panel — a column docked inside the preview pane while Design mode is
 * on for the active tab. This module is the wiring: it reads the guest's selection
 * snapshots (designModeStore, fed by the console-message bridge), turns panel intent into
 * designModeBridge commands, and composes the sections — every section itself lives in
 * `panel/sections/`.
 *
 * Section order and field chrome follow the fork's own Figma spec (t3-fork file, page V2,
 * node 193:9686): Position, Layout, Appearance — with the controls that spec doesn't draw
 * (margins, per-side spacing, min/max, the raw display select) kept behind disclosures
 * rather than dropped. Send builds the Forge's change-request markdown in the guest and
 * attaches it to the thread composer.
 * See `.fork/customizations.yaml#fork-design-mode`.
 */
export function ForkDesignPanel({ runtimeTabId, threadRef, tabId }: Props) {
  const tab = useDesignModeStore((state) => selectDesignModeTab(state.byTabId, runtimeTabId));

  const first = tab.selection[0];
  // Mutating verbs write to the ADDRESSABLE elements only: in a mixed selection, a draft
  // fanned onto an anonymous sibling is the same lying affordance the whole-selection
  // gate exists to stop, just reached through Shift-click (PR #72 review). Undo records
  // the same filtered set, so every entry covers exactly what was written.
  const ids = tab.selection
    .filter((element) => element.sourceState !== "anonymous")
    .map((element) => element.id);
  const addressable = tab.selection.filter((element) => element.sourceState !== "anonymous");
  // When NOTHING in the selection can be traced to code — every element's native-source
  // attempt settled with no tag, no file, no component name — editing is disabled with
  // the reason stated; inspection (values, selection, layers) stays live. Per-element
  // state is the single source of truth: no-resolver hosts settle elements as anonymous
  // too (nativeSource.ts), so there is no separate page-level concept, and `pending`
  // stays editable (no flicker; a settle re-emits the snapshot either way).
  const unaddressable = tab.selection.length > 0 && addressable.length === 0;
  /** Every verb below is a no-op without a tab and an addressable selection — one gate. */
  const target = runtimeTabId !== null && ids.length > 0 ? runtimeTabId : null;

  // Read through a ref so the mutation gate below — and therefore every verb built on it —
  // does not take the compare flag as a dependency and rebuild on each toggle.
  const comparingRef = useRef(tab.comparing);
  comparingRef.current = tab.comparing;

  /**
   * THE mutation gate. Every write the panel makes goes through this — there is no second way
   * in — so the rules a mutation owes are structural rather than a checklist each new verb has
   * to remember (Cursor review, PR #74).
   *
   * Two rules today, and both are easy to get wrong by omission:
   *
   * - **Leave compare first.** The guest auto-exits compare for the element it is drafting
   *   (DraftStore.apply), but only that one — so editing while comparing left a multi-element
   *   selection rendering half "before" and half "after", under a button still labelled for the
   *   whole-page state. Exiting for everything keeps the page, the guest and the label agreeing;
   *   mirroring the guest's per-element rule host-side would need compare state on the wire per
   *   element to describe something nobody wants to look at.
   * - **Clear the undo stack unless the verb records its own step.** Popping a step OLDER than
   *   an action undo cannot reverse would un-do the wrong thing, so clear-first is the default
   *   and only the two scrub-shaped writes pass a `record` (PR #70 review).
   */
  const mutate = useCallback(
    (run: (verbTarget: string) => void, record?: (verbTarget: string) => void) => {
      if (!target) return;
      if (runtimeTabId && comparingRef.current) {
        designModeBridge.compareAll(runtimeTabId, false);
        useDesignModeStore.getState().setComparing(runtimeTabId, false);
      }
      if (record) record(target);
      else designUndoHistory.clear(target);
      run(target);
    },
    [runtimeTabId, target],
  );

  const apply = useCallback(
    (property: DesignModeWritableKey, value: string) => {
      mutate(
        (verbTarget) => designModeBridge.applyDraft(verbTarget, ids, property, value),
        // Undo bookkeeping rides the same snapshots the fields display: mid-gesture the
        // selection snapshot still holds the pre-gesture value (the emit is a trailing
        // debounce), so the first tick records exactly the state Cmd+Z should restore.
        // Write-only shorthands (`gap`) never appear in snapshots — prev null makes undo
        // discard that property's draft instead (designUndoHistory.ts).
        (verbTarget) =>
          designUndoHistory.recordDraft(
            verbTarget,
            property,
            addressable.map((element) => ({
              id: element.id,
              prev: element.drafted.includes(property)
                ? ((element.styles as Partial<Record<DesignModeWritableKey, string>>)[property] ??
                  null)
                : null,
            })),
            value,
            Date.now(),
          ),
      );
    },
    // ids is rebuilt per render but changes only with the selection snapshot array.
    [mutate, tab.selection],
  );

  /** The gate's default arm, named for the verbs that read better with it. */
  const unrecorded = useCallback((run: (verbTarget: string) => void) => mutate(run), [mutate]);

  const setSizeMode = useCallback(
    (axis: "width" | "height", mode: DesignModeSizeMode) =>
      unrecorded((verbTarget) => designModeBridge.setSizeMode(verbTarget, ids, axis, mode)),
    [unrecorded, tab.selection],
  );

  const onAlign = useCallback(
    (axis: DesignModeAlignAxis, value: DesignModeAlignValue) =>
      unrecorded((verbTarget) => designModeBridge.alignSelection(verbTarget, ids, axis, value)),
    [unrecorded, tab.selection],
  );

  const onInset = useCallback(
    (axis: "x" | "y", px: number) => {
      if (!Number.isFinite(px)) return;
      mutate(
        (verbTarget) => designModeBridge.setInset(verbTarget, ids, axis, px),
        (verbTarget) =>
          designUndoHistory.recordInset(
            verbTarget,
            axis,
            addressable.map((element) => ({ id: element.id, prev: element.offsets[axis] })),
            px,
            Date.now(),
          ),
      );
    },
    [mutate, tab.selection],
  );

  const onAbsolute = useCallback(
    (on: boolean) => unrecorded((verbTarget) => designModeBridge.setAbsolute(verbTarget, ids, on)),
    [unrecorded, tab.selection],
  );

  const onAspectLock = useCallback(
    (on: boolean) =>
      unrecorded((verbTarget) => designModeBridge.setAspectLock(verbTarget, ids, on)),
    [unrecorded, tab.selection],
  );

  // Per-field mixed/changed state plus its revert — one helper the sections spread onto
  // every field (`{...field("width")}`), so a new field can't quietly skip either.
  const field = useCallback(
    (...args: Parameters<FieldStateFor>) =>
      fieldStateFor(tab.selection, (properties) => {
        unrecorded((verbTarget) => designModeBridge.revertDraft(verbTarget, ids, properties));
      })(...args),
    [unrecorded, tab.selection],
  );

  const onCompare = useCallback(() => {
    if (!runtimeTabId) return;
    const next = !tab.comparing;
    designModeBridge.compareAll(runtimeTabId, next);
    useDesignModeStore.getState().setComparing(runtimeTabId, next);
  }, [runtimeTabId, tab.comparing]);

  const onDiscard = useCallback(() => {
    if (!runtimeTabId) return;
    // Not through `unrecorded`: Discard works with an empty selection, which that gate
    // refuses — but it too is a mutation the history cannot reverse.
    designUndoHistory.clear(runtimeTabId);
    designModeBridge.discardAll(runtimeTabId);
    useDesignModeStore.getState().setComparing(runtimeTabId, false);
    useDesignSentPreviews.getState().forget(runtimeTabId);
  }, [runtimeTabId]);

  // Cmd+Z / Cmd+Shift+Z while Design mode is on. Window-level because after a scrub the
  // focus is wherever the pointer left it, not inside the panel; editable targets are
  // skipped so the composer's (and the fields' own) text undo stays native. The effect is
  // wiring only — filter, pop, apply — with the undo/redo semantics in designUndoApply.ts.
  useEffect(() => {
    if (!runtimeTabId || !tab.enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key.toLowerCase() !== "z" || event.defaultPrevented) return;
      const element = event.target;
      if (
        element instanceof HTMLElement &&
        (element.tagName === "INPUT" ||
          element.tagName === "TEXTAREA" ||
          element.tagName === "SELECT" ||
          element.isContentEditable)
      ) {
        return;
      }
      const direction = event.shiftKey ? "redo" : "undo";
      const entry =
        direction === "redo"
          ? designUndoHistory.redo(runtimeTabId)
          : designUndoHistory.undo(runtimeTabId);
      if (!entry) return;
      event.preventDefault();
      applyDesignUndoEntry(runtimeTabId, entry, direction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runtimeTabId, tab.enabled]);

  // buildSend can block up to the guest's native-source grace (~1.5s) — the flag both
  // shows the wait honestly on the button and makes a double-click during it a no-op
  // instead of a duplicate attachment pill.
  const [sending, setSending] = useState(false);
  const onSend = useCallback(async () => {
    if (!runtimeTabId || sending) return;
    setSending(true);
    try {
      const result = await designModeBridge.buildSend(runtimeTabId);
      if (result === "stale-engine") {
        // Distinct from "no changes": drafts exist, but a live engine older than the host
        // (dev HMR while the tool stayed on) built a payload the parser rejects. boot()'s
        // version check only rebuilds it at the next injection, which the toggle provides.
        toastManager.add({
          type: "error",
          title: "Design mode needs a refresh",
          description: "Toggle Design mode off and on, then send again — your edits are kept.",
        });
        return;
      }
      if (!result) {
        toastManager.add({ type: "info", title: "No changes to send" });
        return;
      }
      // Attachment-style delivery: the request lands as a composer pill
      // (ForkComposerDesignChanges) rather than as prompt text — the full markdown is
      // appended to the outgoing message by ChatView's fenced send path, so the composer
      // stays readable while the agent still gets the complete deterministic request.
      // Keyed by tab AND document (the payload's documentId, with pageUrl as the reload
      // fallback): a re-send from the same document updates this tab's pill in place even
      // when an SPA route change moved the href, while a Send after a real cross-page
      // navigation adds one — the drafts behind it are a different page's. See
      // designChangeDraftStore's `add`.
      useDesignChangeDraftStore.getState().add(threadRef, runtimeTabId, result);
      // Precision is part of the receipt: buildSend's ~1.5s native-source grace can expire
      // and downgrade elements to selector/text context. Say so here rather than letting
      // WHEN Send was clicked silently change what the agent gets (the pill repeats it).
      const unresolved = countUnresolvedDesignElements(result);
      toastManager.add({
        type: "success",
        title:
          result.elementCount === 1
            ? "Design change attached"
            : `Design changes for ${result.elementCount} elements attached`,
        description:
          unresolved > 0
            ? `${unresolved === result.elements.length ? (unresolved === 1 ? "The element has" : "All of them have") : `${unresolved} of them ${unresolved === 1 ? "has" : "have"}`} no source location — sent with selector and text context. Rides along with your next message.`
            : "It rides along with your next message — add a comment or just press Enter.",
      });
    } finally {
      setSending(false);
    }
  }, [runtimeTabId, sending, threadRef]);

  if (!runtimeTabId || !tab.enabled) return null;

  const sectionProps = {
    selection: tab.selection,
    apply,
    spacingBase: tab.tokens?.spacingBasePx ?? null,
    field,
  };

  return (
    <div
      className="flex w-[325px] shrink-0 flex-col border-l border-border bg-[var(--fork-design-surface)]"
      data-fork-design-panel
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-4">
        {first ? (
          <>
            <span className="rounded bg-[var(--fork-design-field)] px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              {first.tag}
            </span>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {tab.selection.length > 1
                ? `${tab.selection.length} selected`
                : (first.sourceLabel ?? "no source")}
            </span>
          </>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">Design</span>
        )}
      </header>

      <CanvasControls
        runtimeTabId={runtimeTabId}
        threadRef={threadRef}
        tabId={tabId}
        canvas={tab.canvas}
      />

      {first ? (
        // Keyed by selection identity so field-local input state resets per selection.
        <div
          key={`${first.id}:${tab.selection.length}`}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        >
          {unaddressable ? (
            <p
              className="mb-4 rounded-md bg-[var(--fork-design-field)] px-3 py-2 text-xs leading-relaxed text-muted-foreground"
              data-fork-design-unaddressable-note
            >
              {tab.selection.length === 1 ? "This element" : "These elements"} can&apos;t be traced
              to code — no source location, file, or component resolved — so the values below are
              read-only.
            </p>
          ) : null}
          {/* Read-only, not inert: the mutating callbacks above are the real gate (they
              write to addressable ids only, none here), and theme.custom.css turns off
              pointer events for inputs and non-disclosure buttons under this marker —
              NOT a disabled fieldset, which would also disable the Expando/section
              disclosure buttons and make collapsed values unreadable, contradicting the
              note (PR #72 review). Disclosures keep working via their aria-expanded. */}
          <div
            data-fork-design-readonly={unaddressable ? "" : undefined}
            aria-disabled={unaddressable ? "true" : undefined}
            className={cn("space-y-5", unaddressable && "opacity-60")}
          >
            <PositionSection
              element={first}
              selection={tab.selection}
              onAlign={onAlign}
              onInset={onInset}
              onAbsolute={onAbsolute}
            />
            <LayoutSection
              element={first}
              {...sectionProps}
              onSizeMode={setSizeMode}
              onAspectLock={onAspectLock}
            />
            <MarginSection element={first} {...sectionProps} />
            <AppearanceSection element={first} {...sectionProps} />
            <TypographySection element={first} {...sectionProps} tokens={tab.tokens} />
            <FillSection element={first} {...sectionProps} tokens={tab.tokens} />
            <StrokeSection element={first} {...sectionProps} tokens={tab.tokens} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center px-4 text-center">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {tab.sourceMode === "selector-only"
              ? "Click an element in the preview to inspect it. Source mapping wasn't detected on this page — elements that can't be traced to code are read-only."
              : "Click an element in the preview to edit it. Shift-click adds to the selection; double-click edits text."}
          </p>
        </div>
      )}

      <footer className="shrink-0 space-y-1.5 border-t border-border px-4 py-2">
        <SentPreviewResolution
          runtimeTabId={runtimeTabId}
          threadRef={threadRef}
          draftCount={tab.draftCount}
          onDiscard={onDiscard}
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {tab.draftCount === 0
              ? "No edits yet"
              : tab.draftCount === 1
                ? "1 change"
                : `${tab.draftCount} changes`}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              onClick={onCompare}
              disabled={tab.draftCount === 0}
              aria-pressed={tab.comparing ? "true" : "false"}
              type="button"
            >
              {tab.comparing ? "After" : "Before"}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={onDiscard}
              disabled={tab.draftCount === 0}
              type="button"
            >
              Discard
            </Button>
          </div>
        </div>
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => void onSend()}
          disabled={tab.draftCount === 0 || sending}
          type="button"
          data-fork-design-panel-send
        >
          {sending ? "Preparing…" : "Send to chat"}
        </Button>
      </footer>
    </div>
  );
}
