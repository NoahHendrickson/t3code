// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and `.fork/customizations.yaml#fork-design-mode`.
 *
 * The design mode's outcome contract, from the outside in:
 *   - the toggle is wired into the preview chrome and the panel is docked by an override;
 *   - the engine bundler plugin is registered and the engine TS island stays excluded;
 *   - the engine bundles to one self-contained IIFE (proves the vendored module graph is
 *     complete after any upstream sync or Forge re-sync);
 *   - the engine keeps ZERO network delivery — T3 threads are the only delivery surface,
 *     so a Forge re-sync that drags /__the-forge/* fetches back in must fail here;
 *   - the console-message protocol round-trips.
 */

import {
  PREVIEW_VIEWPORT_MAX_AREA,
  PREVIEW_VIEWPORT_MAX_DIMENSION,
  PREVIEW_VIEWPORT_MIN_DIMENSION,
} from "@t3tools/contracts";
import { build } from "esbuild";
import * as NodeBuffer from "node:buffer";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  extractTrailingDesignChanges,
  summarizeDesignChangeBlock,
} from "../custom/designMode/designChangeTranscript";
import { resolveBrowserDeviceViewportArea } from "../browser/browserViewportLayout";
import {
  CANVAS_RESOLUTIONS,
  resolutionForViewport,
  viewportAtTrueSize,
  viewportFillingPane,
} from "../custom/designMode/panel/canvasResolutions";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules } from "./cssRules";
import {
  capPageUrl,
  DESIGN_MODE_CONSOLE_PREFIX,
  DESIGN_MODE_GLOBAL,
  DESIGN_MODE_LAYERS_MAX_DEPTH,
  DESIGN_MODE_PAGE_URL_CAP,
  DESIGN_MODE_STYLE_KEYS,
  parseDesignChangeRequestPayload,
  parseDesignModeConsoleMessage,
} from "../custom/designMode/protocol";

const webRoot = NodePath.resolve(NodeURL.fileURLToPath(new URL(".", import.meta.url)), "../..");
const read = (relative: string) => NodeFS.readFileSync(NodePath.join(webRoot, relative), "utf8");
/** Every fork theme rule is scoped under this; an unscoped one leaks into upstream. Derived
 * from the marker module rather than hardcoded, like the sibling theme guards. */
const FORK_MARKER = `[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;

describe("fork guard: design mode", () => {
  it("mounts the Design toggle and the native panel in the preview pane", () => {
    const previewView = read("src/components/preview/PreviewView.tsx");
    const previewPanel = read("src/overrides/components/preview/PreviewPanel.tsx");
    expect(previewView).toContain(
      'import { ForkPreviewDesignMode } from "~/custom/designMode/ForkPreviewDesignMode"',
    );
    expect(previewView).toContain("<ForkPreviewDesignMode");
    expect(previewView).not.toContain("ForkDesignPanel");
    expect(previewPanel).toContain(
      'import { ForkDesignPanel } from "~/custom/designMode/panel/ForkDesignPanel"',
    );
    // Prefix, not the whole tag: the panel may take further props over time, and this
    // guard is about the mount.
    expect(previewPanel).toContain(
      "<ForkDesignPanel runtimeTabId={runtimeTabId} threadRef={threadRef}",
    );
    // Layers rail docks in the same override, left of the untouched preview surface.
    expect(previewPanel).toContain("<ForkLayersTree runtimeTabId={runtimeTabId} />");
    expect(previewView).not.toContain("ForkLayersTree");
  });

  it("reconciles the guest on every bridge attach, and forgets a closed tab", () => {
    // Injection used to happen on the toggle and on `dom-ready` only. This component unmounts
    // whenever the right panel shows a terminal or a diff, or the user switches threads — and
    // a page reload in that window (a non-HMR-able agent edit: the feature's own loop) wiped
    // the guest with nobody listening, leaving Design mode "on" over a page with no engine.
    const toggle = read("src/custom/designMode/ForkPreviewDesignMode.tsx");
    expect(toggle).toContain("reconcileEngine");
    expect(toggle).toContain("engineIsCurrent");
    expect(toggle).toContain("if (enabledRef.current) void reconcileEngine(runtimeTabId)");

    // A re-injection invalidates every host memo keyed on guest ids, so injection owns those
    // clears rather than each call site remembering them.
    expect(toggle).toContain("designUndoHistory.clear(tabId)");
    expect(toggle).toContain("designModeBridge.forgetHover(tabId)");
    // ...and the reconcile re-checks the toggle after its probe's round trip, or a toggle-off
    // inside that window would be undone by the injection that follows.
    expect(toggle).toContain("if (!enabledRef.current) return;");

    // The counterpart: the one place that knows a preview tab is CLOSED rather than merely
    // unmounted. Without it `designModeStore.remove` had no call site at all. The lease makes
    // ONE call — what gets released is the feature's own business, so the next per-tab memo
    // does not grow another line in an upstream file.
    const tabLifetime = read("src/browser/desktopTabLifetime.ts");
    expect(tabLifetime).toContain("fork:begin fork-design-mode");
    expect(tabLifetime).toContain("disposeDesignModeTab(tabId)");
    for (const internal of ["useDesignModeStore", "designUndoHistory", "designModeBridge"]) {
      expect(tabLifetime).not.toContain(internal);
    }
    const disposal = read("src/custom/designMode/designModeTabLifetime.ts");
    expect(disposal).toContain("useDesignModeStore.getState().remove(runtimeTabId)");
    expect(disposal).toContain("designUndoHistory.clear(runtimeTabId)");
    expect(disposal).toContain("designModeBridge.forgetTab(runtimeTabId)");
  });

  it("commits the screen's real width and derives a height that fills the pane", () => {
    // The whole point: the guest's CSS viewport width IS the screen's, so a page that hides
    // content below a breakpoint sees the screen and not however wide the pane happens to
    // be. The height is derived instead so upstream's fit lands 1:1 on both axes and the
    // frame fills the preview area — a fixed screen height would letterbox it.
    const pane = { width: 1100, height: 1650 };
    const area = resolveBrowserDeviceViewportArea(pane);
    for (const resolution of CANVAS_RESOLUTIONS) {
      const setting = viewportFillingPane(resolution, pane);
      expect(setting._tag).toBe("freeform");
      expect(setting.width).toBe(resolution.width);
      // Same aspect ratio as the fit area, so nothing is letterboxed (within rounding) —
      // unless the contract's area cap bit first, which it does for the widest screens in a
      // tall pane. That letterbox is honest: the alternative is a refused resize.
      const ceiling = Math.floor(PREVIEW_VIEWPORT_MAX_AREA / resolution.width);
      if (setting.height < ceiling) {
        expect(setting.height / setting.width).toBeCloseTo(area.height / area.width, 2);
      }
      // ...and always a size the contract will accept, or the commit toasts instead.
      expect(setting.width).toBeLessThanOrEqual(PREVIEW_VIEWPORT_MAX_DIMENSION);
      expect(setting.height).toBeGreaterThanOrEqual(PREVIEW_VIEWPORT_MIN_DIMENSION);
      expect(setting.height).toBeLessThanOrEqual(PREVIEW_VIEWPORT_MAX_DIMENSION);
      expect(setting.width * setting.height).toBeLessThanOrEqual(PREVIEW_VIEWPORT_MAX_AREA);
    }
    // A tall pane at the widest screen is the case that would blow the area cap.
    const widest = CANVAS_RESOLUTIONS.reduce((a, b) => (b.width > a.width ? b : a));
    const clamped = viewportFillingPane(widest, { width: 400, height: 4000 });
    expect(clamped.width * clamped.height).toBeLessThanOrEqual(PREVIEW_VIEWPORT_MAX_AREA);
    // Unmeasured pane falls back to the screen's own height rather than something absurd.
    const unmeasured = viewportFillingPane(widest, null);
    expect(unmeasured.height).toBe(widest.height);
    // True height frames the screen verbatim on both axes — the fold is the whole point of
    // the switch, so the pane must not get a say in the height.
    for (const resolution of CANVAS_RESOLUTIONS) {
      const framed = viewportAtTrueSize(resolution);
      expect(framed).toEqual({
        _tag: "freeform",
        width: resolution.width,
        height: resolution.height,
      });
    }
    // Off by default, and flipping it re-commits the applied screen rather than waiting for
    // the next pick — otherwise the switch reads as broken.
    const menu = read("src/custom/designMode/panel/ScreenSizeMenu.tsx");
    expect(/const TRUE_HEIGHT_STORAGE_KEY = "([^"]+)"/u.exec(menu)?.[1]).toMatch(
      /^t3code:fork:[a-z-]+:v\d+$/u,
    );
    expect(menu).toContain("TRUE_HEIGHT_STORAGE_KEY,\n    false,");
    expect(menu).toContain(
      "if (activeResolution) commitCanvasViewport(runtimeTabId, viewportFor(activeResolution, next));",
    );

    // Widths are the identity the panel matches an applied viewport back by.
    const widths = CANVAS_RESOLUTIONS.map((r) => r.width);
    expect(new Set(widths).size).toBe(widths.length);
    // Identity is width AND a height this menu could have produced — a hand-typed viewport
    // that merely shares a catalog width must NOT be claimed, or True height would re-commit
    // over it and discard the height the user set.
    expect(resolutionForViewport(viewportAtTrueSize(widest), pane)).toEqual(widest);
    expect(resolutionForViewport(viewportFillingPane(widest, pane), pane)).toEqual(widest);
    expect(
      resolutionForViewport({ _tag: "freeform", width: widest.width, height: 700 }, pane),
    ).toBeNull();
    // A `preset` viewport is upstream's device toolbar's, never ours — the legacy catalog's
    // desktop-1920x1080 shares a width with the 24" entry.
    expect(
      resolutionForViewport(
        { _tag: "preset", width: 1920, height: 1080, presetId: "desktop-1920x1080" },
        pane,
      ),
    ).toBeNull();
  });

  it("keeps a way back out of the collapsed layers rail", () => {
    // A one-way door is the failure mode: collapsed, the rail renders nothing, so the only
    // control that reopens it would go with it. It moves to the chrome row's leading slot
    // instead — which means the flag has to be shared state, not the rail's own.
    const rail = read("src/custom/designMode/ForkLayersTree.tsx");
    const toggle = read("src/custom/designMode/ForkPreviewLayersToggle.tsx");
    const shared = read("src/custom/designMode/layersCollapsed.ts");
    expect(/const LAYERS_COLLAPSED_STORAGE_KEY = "([^"]+)"/u.exec(shared)?.[1]).toMatch(
      /^t3code:fork:[a-z-]+:v\d+$/u,
    );
    // Both halves read the same hook; a local useState in either would desync them.
    for (const source of [rail, toggle]) {
      expect(source).toContain('from "./layersCollapsed"');
      expect(source).not.toContain("useState(false)");
    }
    // The two always-mounted readers select a PRIMITIVE. The tab object's identity churns on
    // every selection/layers/tokens patch — up to ~4/s while an agent edits the page — and
    // both of these care about one transition. (The inner LayersRail does take the whole
    // tab, correctly: it renders it, and only exists while the rail is open.)
    // One availability predicate, not two: the copies had already drifted (the toggle's was
    // missing the runtimeTabId half, harmless only by accident of the empty-tab default).
    for (const source of [rail, toggle]) expect(source).toContain("layersRailAvailable(");
    // Each half unmounts ITSELF on activation, so each hands focus to its counterpart —
    // otherwise a keyboard user lands on <body> and tabs in from the top of the document.
    expect(rail).toContain("focusLayersControl(LAYERS_SHOW_BUTTON)");
    expect(toggle).toContain("focusLayersControl(LAYERS_HIDE_BUTTON)");
    // A disclosure pair: both point aria-controls at the rail they govern.
    for (const source of [rail, toggle]) expect(source).toContain("aria-controls={LAYERS_RAIL_ID}");
    // A gate component, not an early return inside the body: the rail's flatten/filter/
    // reveal machinery re-runs on every debounced layers re-emit, and hiding its output
    // while leaving it subscribed would burn that work for a rail the user closed.
    expect(rail).toContain("if (collapsed || !available || !runtimeTabId) return null;");
    expect(rail).toContain("function LayersRail(");
    expect(rail).toContain('aria-label="Hide layers"');
    expect(toggle).toContain('aria-label="Show layers"');
    expect(toggle).toContain("setCollapsed(false)");
    // ...and the slot it mounts into exists on the chrome row and is actually passed.
    const chromeRow = read("src/components/preview/PreviewChromeRow.tsx");
    expect(chromeRow).toContain("leadingActions?: ReactNode;");
    expect(chromeRow).toContain("{leadingActions}");
    expect(read("src/components/preview/PreviewView.tsx")).toContain(
      "leadingActions={<ForkPreviewLayersToggle runtimeTabId={runtimeTabId} />}",
    );
  });

  it("continues the guest's canvas across the host letterbox in the same color", () => {
    // Two surfaces draw one canvas: the guest paints its <html> from CANVAS_BG, and the
    // host paints the area the fit-scaled webview does not cover. Different values are a
    // visible seam around the artboard, and nothing else would catch the drift.
    const guest = read("src/custom/designMode/engine/vendor/canvas.ts");
    const canvasBg = /export const CANVAS_BG = '([^']+)'/u.exec(guest)?.[1];
    expect(canvasBg).toBeDefined();
    const rules = cssRules(read("src/theme.custom.css"));
    const token = rules.find((rule) => rule.body.includes("--fork-design-canvas:"));
    expect(token?.selector).toContain(FORK_MARKER);
    expect(token?.body).toContain(`--fork-design-canvas: ${canvasBg};`);
    // The surround only exists while canvas mode is on — a fixed viewport without it is
    // upstream's plain device preview.
    const surround = rules.find((rule) => rule.selector.includes("[data-preview-viewport]"));
    expect(surround?.selector).toContain(FORK_MARKER);
    expect(surround?.selector).toContain('[data-fork-canvas="on"]');
    expect(surround?.body).toContain("background-color: var(--fork-design-canvas)");
    // The wrapper, NOT the surface slot beneath it: the wrapper is `fixed`, z-30 and carries
    // its own translucent `bg-muted/35`, so anything painted under it is tinted rather than
    // shown — in light mode that seam ring is ~#7d7d7d against #3c3c3c. It also mounts under
    // ElectronBrowserHost, outside the preview panel's subtree, so a descendant selector
    // rooted at the panel could never have reached it.
    const host = read("src/browser/HostedBrowserWebview.tsx");
    expect(host).toContain('className="fixed overflow-hidden bg-muted/35"');
    expect(host).toContain('data-fork-canvas={canvasOn ? "on" : undefined}');
    expect(host).toContain("fork:begin fork-design-mode");
  });

  it("hands the page back while the browse modifier is held", () => {
    // The browse policy's module contract (browseHandoff.ts), not its call sites — freezing
    // the engine's handler strings would make the next correct refactor fail this guard.
    const handoff = read("src/custom/designMode/engine/browseHandoff.ts");
    // ONE predicate, read off the event itself: a keydown-tracked flag would read false
    // whenever the ⌘ press landed on T3's own chrome (panel, layers rail) rather than the guest.
    expect(handoff).toContain(
      "shouldYield(e: MouseEvent | KeyboardEvent): boolean {\n    return e.metaKey;\n  }",
    );
    // The click is REPLACED, not released: Chromium reads a ⌘-click on an anchor as "open in
    // a new tab" and router Links bail out of client-side navigation on metaKey, so a released
    // ⌘-click would open tabs instead of following links. Hence a modifier-free copy, the
    // real event swallowed, and a re-entrancy guard for the copy's own trip through the
    // capture listener.
    expect(handoff).toContain('if (e === this.inFlight) return "passthrough";');
    const copy = /const copy = new MouseEvent\("click", \{([\s\S]*?)\n {6}\}\);/u.exec(
      handoff,
    )?.[1];
    expect(copy).toBeDefined();
    for (const modifier of ["metaKey", "ctrlKey", "altKey", "shiftKey"]) {
      expect(copy).not.toContain(modifier);
    }
    expect(copy).toContain("clientX: e.clientX");
    expect(copy).toContain("button: e.button");
    // The policy has ONE home. The engine constructs the handoff and asks it; a metaKey
    // read growing back inside the orchestrator is the scatter this guard exists to stop.
    const engine = read("src/custom/designMode/engine/headlessMode.ts");
    expect(engine).toContain("new BrowseHandoff()");
    expect(engine).not.toContain("metaKey");
    // The drag module hands the press itself to caller policy — modifier-gated modes can
    // only block a drag they can see.
    expect(read("src/custom/designMode/engine/vendor/move-drag.ts")).toContain(
      "if (this.opts.blocked(e)) return",
    );
  });

  it("selects on pointerdown so menus cannot activate under the press", () => {
    // Base UI MenuTrigger opens on pointerdown; a click-only intercept lets the menu open
    // and often swallows the click, so the design panel stayed empty. The press must be
    // owned before the page sees it — except for MoveDrag targets, which still need a
    // sub-threshold press to become an ordinary click.
    const engine = read("src/custom/designMode/engine/headlessMode.ts");
    // One funnel owns tombstone refusal + toggle/select/deselect; both event paths call it.
    const selectFromTarget =
      /private selectFromTarget\(el: TaggedElement \| null, shiftKey: boolean\): void \{([\s\S]*?)\n  \}/u.exec(
        engine,
      )?.[1];
    expect(selectFromTarget).toBeDefined();
    expect(selectFromTarget).toContain('kind === "delete"');
    expect(selectFromTarget).toContain("this.toggleSelection(el)");
    expect(selectFromTarget).toContain("this.select(el)");
    expect(selectFromTarget).toContain("this.deselect()");

    const body = /private onPointerDown = \(e: PointerEvent\): void => \{([\s\S]*?)\n  \};/u.exec(
      engine,
    )?.[1];
    expect(body).toBeDefined();
    expect(body).toContain("this.browse.shouldYield(e)");
    expect(body).toContain("this.moveDrag.wouldDrag(el)");
    expect(body).toContain("e.preventDefault()");
    expect(body).toContain("e.stopPropagation()");
    expect(body).toContain("this.selectFromTarget(el, e.shiftKey)");
    expect(body).toContain("this.suppressNextClickSelection = true");
    // Clear shape: delete early-return, then wouldDrag fall-through (no preventDefault),
    // then preventDefault + selectFromTarget. Do not fold delete into the drag gate.
    expect(body).toMatch(
      /kind === "delete"\) return;[\s\S]*?if \(el && this\.moveDrag\.wouldDrag\(el\)\) return;[\s\S]*?e\.preventDefault\(\)/u,
    );
    expect(body).not.toContain('kind !== "delete"');

    const click = /private onClick = \(e: MouseEvent\): void => \{([\s\S]*?)\n  \};/u.exec(
      engine,
    )?.[1];
    expect(click).toBeDefined();
    expect(click).toContain("this.suppressNextClickSelection");
    expect(click).toContain("this.selectFromTarget(");
    // Click must not re-run the toggle/select ladder inline — only via the helper,
    // and only when pointerdown did not already own the gesture.
    expect(click).not.toContain("this.toggleSelection(el)");
  });

  it("wires every guest-handle verb from the protocol through boot and the host bridge", () => {
    // The drift this catches: a verb declared in DesignModeGuestHandle but never installed on
    // the page global (the panel's call silently no-ops) or never given a bridge wrapper (no
    // way for the panel to call it at all). Both halves have to move with the contract.
    const protocol = read("src/custom/designMode/protocol.ts");
    const body = /export interface DesignModeGuestHandle \{([\s\S]*?)\n\}/u.exec(protocol)?.[1];
    expect(body).toBeDefined();
    const verbs = [...(body ?? "").matchAll(/^ {2}(\w+)[(<]/gmu)].map((match) => match[1]);
    expect(verbs).toContain("alignSelection");
    expect(verbs.length).toBeGreaterThan(10);

    const boot = read("src/custom/designMode/engine/boot.ts");
    const bridge = read("src/custom/designMode/designModeBridge.ts");
    // `isActive` is the guest's own predicate — the host tracks enablement in its store.
    const guestOnly = new Set(["isActive"]);
    for (const verb of verbs) {
      expect(boot, `boot.ts installs ${verb}`).toContain(`${verb}:`);
      if (guestOnly.has(verb ?? "")) continue;
      expect(bridge, `designModeBridge.ts calls ${verb}`).toContain(`"${verb}"`);
    }
  });

  it("delivers design changes as composer attachments, not prompt text", () => {
    const chatComposer = read("src/components/chat/ChatComposer.tsx");
    expect(chatComposer).toContain(
      'import { ForkComposerDesignChanges } from "~/custom/designMode/ForkComposerDesignChanges"',
    );
    expect(chatComposer).toContain("<ForkComposerDesignChanges target={composerDraftTarget}");
    // Pill-only sendability: the button's own sendState memo counts pending attachments.
    expect(chatComposer).toContain(
      "const forkPendingDesignChangeCount = useForkPendingDesignChangeCount(composerDraftTarget)",
    );
    expect(chatComposer).toContain("forkPendingDesignChangeCount,");
    const chatView = read("src/components/ChatView.tsx");
    expect(chatView).toContain(
      'import { forkDesignChanges } from "~/custom/designMode/designChangeDraftStore"',
    );
    expect(chatView).toContain("forkDesignChanges.count({ environmentId, threadId:");
    // ONE read: the outgoing text and the entries that went into it come back together, so
    // "what rode the message" is not an invariant ChatView holds by hand across the await.
    expect(chatView).toContain(
      "forkDesignChanges.takeForSend(forkDesignChangeRef, messageTextForSend)",
    );
    expect(chatView).toContain("forkDesignSend.text || IMAGE_ONLY_BOOTSTRAP_PROMPT");
    // Cleared by ENTRY, not by id — a re-send during the awaited turn start replaces the pill
    // in place under the same id, so only identity distinguishes it from what was sent.
    expect(chatView).toContain("forkDesignChanges.markSent(");
    expect(chatView).toContain("messageCreatedAt,");
    expect(chatView).toContain("messageIdForSend,");
    expect(chatView).not.toContain("pendingIds");
  });

  it("offers to resolve previews that were sent, claiming only what was measured", () => {
    // Sent drafts stay painted over whatever the agent then changed, and inline styles win —
    // so the page stops being evidence until they come off. Once the turn ends the panel
    // arms the guest verifier and renders MEASUREMENTS: any success wording must come from
    // a verdict the page produced, never from the agent's account or from optimism.
    //
    // The turn-over invariant itself ("never offer while the turn is open") is NOT pinned
    // here as an implementation string — it lives in shouldOfferPreviewResolution, a pure
    // exported predicate with its own behavioral tests (designSentPreviews.test.ts). This
    // guard holds the wiring: the panel's offer routes through that predicate, so the
    // invariant cannot be bypassed by a hand-rolled condition in the component.
    const panel = read("src/custom/designMode/panel/SentPreviewResolution.tsx");
    expect(panel).toContain("shouldOfferPreviewResolution(");
    expect(panel).toContain("data-fork-design-resolve-previews");
    // Verdict wording has ONE home — the shared label map — and the panel renders labels
    // through it rather than hand-writing claims beside the data attribute. Every verdict
    // key is in the map, `missing` included: a wording hand-written twice is a wording
    // that drifts.
    expect(panel).toContain("VERIFY_VERDICT_LABELS[check.verdict]");
    expect(panel).toContain("VERIFY_VERDICT_LABELS.missing");
    expect(panel).toContain("VERIFY_VERDICT_LABELS.applied");
    // The region scan the label map cannot replace: any hand-written success claim in the
    // rendered footer must trip CI even if it never touches the map. ("applied" appears
    // legitimately as the verdict KEY in code — the scan covers the words with no such
    // alias.) The discard's blast radius is stated on every path, measured or not.
    const region = panel.slice(panel.indexOf("data-fork-design-resolve-previews"));
    for (const claim of ["verified", "landed successfully", "Applied"]) {
      expect(region).not.toContain(claim);
    }
    expect(region).toContain("Discarding clears every edit on this tab");
    const labels = read("src/custom/designMode/designSentPreviews.ts");
    // 'unverifiable' must never borrow the success words — "can't be checked" rendered as
    // anything stronger is exactly the invented claim this feature exists to avoid. And
    // even the success label stays at measurement strength: the page renders the value
    // ("landed"), which is not "the agent's edit was correct" ("applied"/"verified").
    expect(labels).toContain('applied: "landed"');
    expect(labels).toContain('unverifiable: "can\'t be checked"');
    expect(labels).toContain('missing: "gone from the page"');
    for (const claim of ["applied", "verified"]) {
      expect(labels.slice(labels.indexOf("VERIFY_VERDICT_LABELS = {"))).not.toContain(`"${claim}"`);
    }

    // The record is minted by the send path, from the entries it is about to clear.
    const store = read("src/custom/designMode/designChangeDraftStore.ts");
    expect(store).toContain("sent: readonly PendingDesignChange[]");
    expect(store).toContain("useDesignSentPreviews.getState().markSent(");

    // And it dies with its tab, like every other per-tab design-mode state.
    expect(read("src/custom/designMode/designModeTabLifetime.ts")).toContain(
      "useDesignSentPreviews.getState().forget(runtimeTabId)",
    );
  });

  it("renders sent design changes as transcript chips, not raw markdown", () => {
    const timeline = read("src/components/chat/MessagesTimeline.tsx");
    expect(timeline).toContain(
      'import { extractTrailingDesignChanges } from "~/custom/designMode/designChangeTranscript"',
    );
    expect(timeline).toContain(
      "const forkDesignChanges = extractTrailingDesignChanges(row.message.text)",
    );
    expect(timeline).toContain("<ForkTranscriptDesignChanges");
    expect(timeline).toContain("blocks={forkDesignChanges.blocks}");
    // The verdict line's correlation key: the message's own id — the one stable identity
    // of the row — so the chip merges every contributing tab's records for exactly this
    // message (`sentAt` is shared across tabs and only ms-unique).
    expect(timeline).toContain("messageId={row.message.id}");
    // Extraction round-trip: blocks are the outermost trailing run and strip cleanly,
    // restoring the position the upstream element/terminal extractors rely on.
    const markdown = "# Design change request\n\n## 1. <button> — src/App.tsx:5:3\n- x";
    const prompt = `make it pop\n\n<design_change_request>\n${markdown}\n</design_change_request>`;
    const extracted = extractTrailingDesignChanges(prompt);
    expect(extracted.promptText).toBe("make it pop");
    expect(extracted.blocks).toEqual([markdown]);
    expect(summarizeDesignChangeBlock(markdown)).toEqual({
      elementCount: 1,
      firstLabel: "<button> — src/App.tsx:5:3",
    });
    expect(extractTrailingDesignChanges("no blocks here").blocks).toEqual([]);
  });

  it("registers the engine bundler plugin and serves the virtual module", () => {
    const viteConfig = read("vite.config.ts");
    expect(viteConfig).toContain(
      'import { forkDesignModeEngine } from "./fork/vitePluginForkDesignMode"',
    );
    expect(viteConfig).toContain("forkDesignModeEngine({");
    const plugin = read("fork/vitePluginForkDesignMode.ts");
    expect(plugin).toContain('"virtual:fork-design-mode-engine"');
  });

  it("keeps the engine TS island excluded from the web project", () => {
    const tsconfig = read("tsconfig.json");
    expect(tsconfig).toContain('"exclude": ["src/custom/designMode/engine"]');
    expect(
      NodeFS.existsSync(NodePath.join(webRoot, "src/custom/designMode/engine/tsconfig.json")),
    ).toBe(true);
  });

  it("keeps the engine free of network delivery (T3 threads are the delivery surface)", () => {
    const engineDir = NodePath.join(webRoot, "src/custom/designMode/engine");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of NodeFS.readdirSync(dir, { withFileTypes: true })) {
        const absolute = NodePath.join(dir, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (entry.isFile() && entry.name.endsWith(".ts")) {
          const source = NodeFS.readFileSync(absolute, "utf8");
          // Quoted endpoint literals and network constructors — comments that merely
          // mention the removed delivery layer are fine; call sites are not.
          if (
            source.includes("'/__the-forge") ||
            source.includes('"/__the-forge') ||
            /\bfetch\s*\(/u.test(source) ||
            source.includes("new WebSocket") ||
            source.includes("new EventSource") ||
            source.includes("XMLHttpRequest")
          ) {
            offenders.push(NodePath.relative(webRoot, absolute));
          }
        }
      }
    };
    walk(engineDir);
    expect(offenders).toEqual([]);
  });

  it("bundles the engine into one self-contained injectable IIFE", async () => {
    const result = await build({
      entryPoints: [NodePath.join(webRoot, "src/custom/designMode/engine/boot.ts")],
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      minify: true,
      write: false,
      logLevel: "silent",
    });
    const code = result.outputFiles[0]?.text ?? "";
    expect(code.length).toBeGreaterThan(50_000);
    expect(code).toContain(DESIGN_MODE_CONSOLE_PREFIX);
    expect(code).toContain(DESIGN_MODE_GLOBAL);
    // The delivery layer must not ride along in any form.
    expect(code).not.toContain("/__the-forge/");
  });

  it("preserves px sizing intent and skips over-depth layers before spending budget", async () => {
    const result = await build({
      stdin: {
        contents: [
          'export { seedFrom } from "./src/custom/designMode/engine/vendor/resize";',
          'export { buildLayerTree } from "./src/custom/designMode/engine/vendor/layers";',
        ].join("\n"),
        resolveDir: webRoot,
        sourcefile: "design-mode-engine-guard.ts",
        loader: "ts",
      },
      bundle: true,
      format: "esm",
      platform: "node",
      target: "es2022",
      write: false,
      logLevel: "silent",
    });
    const code = result.outputFiles[0]?.text ?? "";
    const moduleUrl = `data:text/javascript;base64,${NodeBuffer.Buffer.from(code).toString("base64")}`;
    const engine = (await import(moduleUrl)) as {
      seedFrom: (draft: string | null, measured: string) => number;
      buildLayerTree: (
        root: Element,
        includeUntagged: boolean,
        budget: { left: number; truncated: boolean; exhausted?: boolean },
        maxDepth: number,
      ) => Array<{ el: { id: string }; children: unknown[] }>;
    };

    expect(engine.seedFrom("240px", "600px")).toBe(240);
    expect(engine.seedFrom("100%", "600px")).toBe(600);
    expect(engine.seedFrom("auto", "600px")).toBe(600);

    type FakeElement = {
      tagName: string;
      dataset: { dcSource: string };
      id: string;
      children: FakeElement[];
      childNodes: never[];
    };
    const element = (id: string, children: FakeElement[] = []): FakeElement => ({
      tagName: "DIV",
      dataset: { dcSource: id },
      id,
      children,
      childNodes: [],
    });
    const tooDeep = element("too-deep");
    const root = {
      children: [element("deep-root", [element("deep-child", [tooDeep])]), element("later-peer")],
    } as unknown as Element;
    const budget = { left: 10, truncated: false };
    const layers = engine.buildLayerTree(root, false, budget, 1);

    expect(layers.map((node) => node.el.id)).toEqual(["deep-root", "later-peer"]);
    expect(layers[0]?.children).toHaveLength(1);
    expect(budget).toEqual({ left: 7, truncated: true });
  });

  it("restores a persisted draft's ORIGINAL rather than re-deriving it", async () => {
    // The engine's own restore contract, and the one place it can be wrong invisibly.
    //
    // Toggling Design mode off destroys the engine but deliberately leaves the draft previews
    // painted as inline styles (they come back from sessionStorage). So when the next
    // injection re-applies them into the SAME document, DraftStore's default prior oracle —
    // which for a css draft reads the element's live inline style — answers with the previous
    // engine's own preview. Every restored draft would then record its drafted value as the
    // page's original: Discard restores the draft over itself, and the send builder measures
    // before === after and drops the change, so the panel counts N changes while Send says
    // there is nothing to send. The persisted third tuple slot is what closes it.
    const result = await build({
      stdin: {
        contents: [
          'export { DraftStore } from "./src/custom/designMode/engine/vendor/drafts";',
          'export { loadLifecycle } from "./src/custom/designMode/engine/vendor/lifecycle-store";',
        ].join("\n"),
        resolveDir: webRoot,
        sourcefile: "design-mode-drafts-guard.ts",
        loader: "ts",
      },
      bundle: true,
      format: "esm",
      platform: "node",
      target: "es2022",
      write: false,
      logLevel: "silent",
    });
    const code = result.outputFiles[0]?.text ?? "";
    const moduleUrl = `data:text/javascript;base64,${NodeBuffer.Buffer.from(code).toString("base64")}`;
    const engine = (await import(moduleUrl)) as {
      DraftStore: new () => {
        apply: (el: unknown, prop: string, value: string, knownOriginal?: string) => void;
        discard: (el: unknown, props?: string[]) => void;
        entries: () => Map<unknown, Map<string, { original: string; value: string }>>;
      };
      loadLifecycle: (storage: unknown) => { drafts: unknown[] } | null;
    };

    // Just enough element for the css half of the store: it only ever reads and writes
    // inline style declarations.
    const element = () => {
      const inline = new Map<string, string>();
      return {
        inline,
        style: {
          setProperty: (key: string, value: string) => inline.set(key, value),
          removeProperty: (key: string) => inline.delete(key),
          getPropertyValue: (key: string) => inline.get(key) ?? "",
          getPropertyPriority: () => "",
        },
      };
    };

    // A restore into a document still showing the previous engine's preview.
    const restored = element();
    restored.style.setProperty("padding-top", "32px");
    const store = new engine.DraftStore();
    store.apply(restored, "padding-top", "32px", "");
    expect(store.entries().get(restored)?.get("padding-top")?.original).toBe("");
    store.discard(restored, ["padding-top"]);
    expect(restored.inline.has("padding-top")).toBe(false);

    // The default oracle on the same shape — the behaviour the persisted original exists to
    // avoid, pinned here so nobody "simplifies" the parameter away.
    const rederived = element();
    rederived.style.setProperty("padding-top", "32px");
    const naive = new engine.DraftStore();
    naive.apply(rederived, "padding-top", "32px");
    naive.discard(rederived, ["padding-top"]);
    expect(rederived.inline.get("padding-top")).toBe("32px");

    // A first-time draft is unaffected: no inline style, so the original is empty either way.
    const fresh = element();
    const first = new engine.DraftStore();
    first.apply(fresh, "padding-top", "32px");
    expect(first.entries().get(fresh)?.get("padding-top")?.original).toBe("");

    // The wire shape: triples load, pre-upgrade 2-tuples still load (a session in flight must
    // not be thrown away), and a non-string original is rejected — it would be handed
    // straight to setProperty on discard.
    const stored = (drafts: unknown) => ({
      getItem: () => JSON.stringify({ v: 1, designModeOn: true, selection: [], drafts, sent: [] }),
    });
    const entry = (props: unknown) => ({ dcSource: "App.tsx:1:1", index: 0, props });
    expect(
      engine.loadLifecycle(stored([entry([["padding-top", "32px", "24px"]])]))?.drafts,
    ).toEqual([entry([["padding-top", "32px", "24px"]])]);
    expect(engine.loadLifecycle(stored([entry([["padding-top", "32px"]])]))?.drafts).toHaveLength(
      1,
    );
    expect(engine.loadLifecycle(stored([entry([["padding-top", "32px", 24]])]))?.drafts).toEqual(
      [],
    );
  });

  it("verification's measurement window restores the page's inline styles exactly", async () => {
    // The riskiest write in the verifier: the suppress → measure → restore pass mutates
    // inline styles on the user's live page, and a restore that loses `!important`, a
    // page-authored longhand, or a value written mid-window corrupts the page silently.
    // withTransitionsSuppressed's contract is a WHOLE-cssText snapshot per element, rolled
    // back wholesale — pinned here on the same inline-style shim the restore-original
    // guard uses, so a vendor re-sync that "simplifies" it to value-only save/restore
    // fails loudly. expandCollapsedProperty is the commit path's other pure seam: the
    // report's collapsed names must expand through the builder's own COLLAPSE table.
    const result = await build({
      stdin: {
        contents: [
          'export { withTransitionsSuppressed } from "./src/custom/designMode/engine/vendor/request";',
          'export { expandCollapsedProperty } from "./src/custom/designMode/engine/verifySession";',
        ].join("\n"),
        resolveDir: webRoot,
        sourcefile: "design-mode-verify-guard.ts",
        loader: "ts",
      },
      bundle: true,
      format: "esm",
      platform: "node",
      target: "es2022",
      write: false,
      logLevel: "silent",
    });
    const code = result.outputFiles[0]?.text ?? "";
    const moduleUrl = `data:text/javascript;base64,${NodeBuffer.Buffer.from(code).toString("base64")}`;
    const engine = (await import(moduleUrl)) as {
      withTransitionsSuppressed: <T>(els: Iterable<unknown>, fn: () => T) => T;
      expandCollapsedProperty: (property: string, draftProps: readonly string[]) => string[];
    };

    // An element whose inline slot carries priorities and longhands — the shapes a
    // value-only restore destroys.
    const cssTextElement = () => {
      let cssText = "transition-duration: 200ms !important; padding-top: 8px;";
      return {
        style: {
          get cssText() {
            return cssText;
          },
          set cssText(next: string) {
            cssText = next;
          },
          setProperty(key: string, value: string, priority = "") {
            cssText += ` ${key}: ${value}${priority ? ` !${priority}` : ""};`;
          },
          removeProperty(key: string) {
            cssText = cssText
              .split(";")
              .filter((declaration) => !declaration.trim().startsWith(`${key}:`))
              .join(";");
          },
        },
      };
    };
    const el = cssTextElement();
    const before = el.style.cssText;
    const out = engine.withTransitionsSuppressed([el], () => {
      // The measurement pass's own suppression writes happen INSIDE the window and must
      // roll back with the transition.
      el.style.removeProperty("padding-top");
      el.style.setProperty("color", "red");
      return el.style.cssText;
    });
    expect(out).toContain("transition: none");
    expect(out).not.toContain("padding-top");
    expect(el.style.cssText).toBe(before);

    // Collapsed names expand through the builder's own table, scoped to what was sent.
    expect(
      engine.expandCollapsedProperty("padding-inline", ["padding-left", "padding-right", "color"]),
    ).toEqual(["padding-left", "padding-right"]);
    expect(engine.expandCollapsedProperty("color", ["color"])).toEqual(["color"]);
    expect(engine.expandCollapsedProperty("padding-inline", ["color"])).toEqual([]);
  });

  it("keeps the native source bridge contract aligned across preload and engine", () => {
    // The desktop preload installs the resolver global; the engine consumes it by the
    // same name. A drifted literal on either side silently degrades every untagged React
    // page to selector-only — fail here instead.
    const resolverGlobal = "__T3_DESIGN_SOURCE_RESOLVER_V1__";
    const desktopRoot = NodePath.join(webRoot, "../desktop");
    const preloadResult = NodeFS.readFileSync(
      NodePath.join(desktopRoot, "src/preview/DesignSourceResult.ts"),
      "utf8",
    );
    const engineNativeSource = read("src/custom/designMode/engine/nativeSource.ts");
    expect(preloadResult).toContain(`"${resolverGlobal}"`);
    expect(engineNativeSource).toContain(`"${resolverGlobal}"`);

    // The preload entry must keep the fenced resolver import — an upstream sync that
    // reverts the entry file to its one-line upstream form drops the whole bridge.
    const preloadEntry = NodeFS.readFileSync(
      NodePath.join(desktopRoot, "src/preview-pick-preload.ts"),
      "utf8",
    );
    expect(preloadEntry).toContain("fork:begin fork-design-mode");
    expect(preloadEntry).toContain('import "./preview/DesignSourceResolver.ts"');

    // Every package the resolver imports must be BUNDLED into the preload artifact. This
    // webview is sandboxed, so a leftover external require() throws before the preload
    // installs the picker or the resolver global — the whole preview-pick path dies, and
    // only in packaged builds where a dev server never catches it.
    const desktopViteConfig = NodeFS.readFileSync(
      NodePath.join(desktopRoot, "vite.config.ts"),
      "utf8",
    );
    for (const bundled of ["react-grab", "bippy"]) {
      expect(desktopViteConfig).toContain(`id === "${bundled}"`);
    }

    // react-grab stays a desktop-preload dependency only — never bundled into the web app.
    const webPackage = read("package.json");
    expect(webPackage).not.toContain("react-grab");

    // The Forge-install handoff is gone: every page is editable without project setup.
    const designModeToggle = read("src/custom/designMode/ForkPreviewDesignMode.tsx");
    expect(designModeToggle).not.toContain("forge-mode init");
    expect(designModeToggle).not.toContain("SETUP.md");
  });

  it("round-trips and rejects ready messages (source modes)", () => {
    for (const sourceMode of ["forge", "native-react", "selector-only"]) {
      expect(
        parseDesignModeConsoleMessage(
          `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"ready","sourceMode":"${sourceMode}"}`,
        ),
      ).toEqual({ type: "ready", sourceMode });
    }
    // The retired tagged shape and unknown modes reject rather than half-parse.
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}{"type":"ready","tagged":true}`),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"ready","sourceMode":"psychic"}`,
      ),
    ).toBeNull();
  });

  it("round-trips and rejects canvas messages", () => {
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"canvas","on":true,"scalePercent":125}`,
      ),
    ).toEqual({ type: "canvas", on: true, scalePercent: 125 });
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"canvas","on":false,"scalePercent":100}`,
      ),
    ).toEqual({ type: "canvas", on: false, scalePercent: 100 });
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"canvas","on":"yes","scalePercent":100}`,
      ),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}{"type":"canvas","on":true}`),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"canvas","on":true,"scalePercent":null}`,
      ),
    ).toBeNull();
  });

  it("round-trips the console-message protocol", () => {
    const styles = Object.fromEntries(DESIGN_MODE_STYLE_KEYS.map((key) => [key, `${key}-value`]));
    const element = {
      id: 1,
      tag: "button",
      sourceLabel: "App.tsx:5",
      sourceState: "resolved",
      styles,
      sizeModes: { width: "fixed", height: "hug" },
      offsets: { x: 24, y: -8 },
      positionState: "flow",
      alignCaps: { horizontal: true, vertical: false },
      drafted: ["padding-top", "gap"],
    };
    const selection = { type: "selection", elements: [element] };
    const line = `${DESIGN_MODE_CONSOLE_PREFIX}${JSON.stringify(selection)}`;
    expect(parseDesignModeConsoleMessage(line)).toEqual(selection);
    // Every snapshot half is required: a missing or malformed one rejects the whole message
    // rather than half-parsing into a panel that would then read `undefined` as a value.
    const withoutKey = (key: keyof typeof element) => {
      const rest: Record<string, unknown> = { ...element };
      delete rest[key];
      return `${DESIGN_MODE_CONSOLE_PREFIX}${JSON.stringify({
        type: "selection",
        elements: [rest],
      })}`;
    };
    for (const key of ["sizeModes", "offsets", "positionState", "alignCaps", "drafted"] as const) {
      expect(parseDesignModeConsoleMessage(withoutKey(key))).toBeNull();
    }
    const withPatch = (patch: Record<string, unknown>) =>
      `${DESIGN_MODE_CONSOLE_PREFIX}${JSON.stringify({
        type: "selection",
        elements: [{ ...element, ...patch }],
      })}`;
    expect(
      parseDesignModeConsoleMessage(withPatch({ sizeModes: { width: "stretchy", height: "hug" } })),
    ).toBeNull();
    expect(parseDesignModeConsoleMessage(withPatch({ positionState: "floating" }))).toBeNull();
    expect(parseDesignModeConsoleMessage(withPatch({ offsets: { x: 1 } }))).toBeNull();
    expect(parseDesignModeConsoleMessage(withPatch({ offsets: { x: 1, y: "2" } }))).toBeNull();
    expect(
      parseDesignModeConsoleMessage(withPatch({ alignCaps: { horizontal: true } })),
    ).toBeNull();
    expect(parseDesignModeConsoleMessage(withPatch({ drafted: [1, 2] }))).toBeNull();
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}{"type":"drafts","count":3}`),
    ).toEqual({ type: "drafts", count: 3 });
    expect(parseDesignModeConsoleMessage("plain page log")).toBeNull();
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}{"type":"nope"}`),
    ).toBeNull();
    expect(parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}not-json`)).toBeNull();
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"selection","elements":[{"id":1}]}`,
      ),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}{"type":"drafts","count":"3"}`),
    ).toBeNull();
  });

  it("round-trips and rejects tokens messages", () => {
    const tokens = {
      type: "tokens",
      colors: [{ name: "red-500", value: "oklch(0.637 0.237 25.331)" }],
      spacingBasePx: 4,
    };
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}${JSON.stringify(tokens)}`),
    ).toEqual(tokens);
    // null spacing base = "not a Tailwind project" — a valid shape, not a rejection.
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"tokens","colors":[],"spacingBasePx":null}`,
      ),
    ).toEqual({ type: "tokens", colors: [], spacingBasePx: null });
    // Rejections: malformed token entry, stringly-typed base, missing colors.
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"tokens","colors":[{"name":"red-500"}],"spacingBasePx":4}`,
      ),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"tokens","colors":[],"spacingBasePx":"4"}`,
      ),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"tokens","spacingBasePx":4}`,
      ),
    ).toBeNull();
  });

  it("round-trips and rejects layers messages, including the depth bound", () => {
    const layers = {
      type: "layers",
      roots: [
        {
          id: 1,
          tag: "div",
          label: "Frame",
          reorderable: false,
          siblingGroup: 0,
          children: [
            {
              id: 2,
              tag: "button",
              label: "Save",
              reorderable: true,
              siblingGroup: 1,
              children: [],
            },
          ],
        },
      ],
      truncated: false,
    };
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}${JSON.stringify(layers)}`),
    ).toEqual(layers);
    // Rejections: missing label, missing reorderable, missing siblingGroup (the rail's
    // DOM-sibling drop gate), missing truncated, one bad child poisons the message.
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"layers","roots":[{"id":1,"tag":"div","reorderable":false,"siblingGroup":0,"children":[]}],"truncated":false}`,
      ),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"layers","roots":[{"id":1,"tag":"div","label":"Frame","siblingGroup":0,"children":[]}],"truncated":false}`,
      ),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"layers","roots":[{"id":1,"tag":"div","label":"Frame","reorderable":false,"children":[]}],"truncated":false}`,
      ),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}{"type":"layers","roots":[]}`),
    ).toBeNull();
    // Depth bound: a chain one level past the shared bound rejects rather than recursing.
    const chain = (levels: number) => {
      let node: Record<string, unknown> = {
        id: levels,
        tag: "div",
        label: "leaf",
        reorderable: false,
        siblingGroup: 0,
        children: [],
      };
      for (let index = levels - 1; index >= 1; index -= 1) {
        node = {
          id: index,
          tag: "div",
          label: "Frame",
          reorderable: false,
          siblingGroup: 0,
          children: [node],
        };
      }
      return `${DESIGN_MODE_CONSOLE_PREFIX}${JSON.stringify({ type: "layers", roots: [node], truncated: false })}`;
    };
    // Roots are depth 0, so the bound admits MAX_DEPTH + 1 levels and rejects one more.
    expect(parseDesignModeConsoleMessage(chain(DESIGN_MODE_LAYERS_MAX_DEPTH + 1))).not.toBeNull();
    expect(parseDesignModeConsoleMessage(chain(DESIGN_MODE_LAYERS_MAX_DEPTH + 2))).toBeNull();
    // The GUEST serializer must stop at the same bound, or a deep page emits a tree the host
    // rejects wholesale and the layers rail silently never appears (PR #52/#54 review).
    expect(read("src/custom/designMode/engine/layersSession.ts")).toContain(
      "DESIGN_MODE_LAYERS_MAX_DEPTH",
    );
  });

  it("decodes complete design-change payloads only", () => {
    const payload = {
      markdown: "Change button padding",
      elementCount: 1,
      elements: [{ tag: "button", sourceLabel: "App.tsx:5", deltas: ["8px → 12px"] }],
      documentId: "doc-1",
      pageUrl: "http://localhost:5173/",
    };
    expect(parseDesignChangeRequestPayload(payload)).toEqual(payload);
    expect(parseDesignChangeRequestPayload({ ...payload, elementCount: 2 })).toBeNull();
    expect(
      parseDesignChangeRequestPayload({
        ...payload,
        elements: [{ ...payload.elements[0], deltas: [3] }],
      }),
    ).toBeNull();
    // documentId and pageUrl are the composer's replace-vs-append key (designChangeDraftStore),
    // so a payload missing either can't be honored. An engine too old to send them fails the
    // parse here; designModeBridge.buildSend reports that as "stale-engine" and the panel
    // surfaces it (boot()'s version check only rebuilds the engine at the NEXT injection —
    // the toggle or a navigation — never on the Send path).
    const { pageUrl: _omitted, ...withoutPage } = payload;
    expect(parseDesignChangeRequestPayload(withoutPage)).toBeNull();
    const { documentId: _omittedDoc, ...withoutDocument } = payload;
    expect(parseDesignChangeRequestPayload(withoutDocument)).toBeNull();
    expect(parseDesignChangeRequestPayload({ ...payload, documentId: "" })).toBeNull();
    expect(parseDesignChangeRequestPayload({ ...payload, pageUrl: "x".repeat(2049) })).toBeNull();
  });

  it("caps long page urls without letting distinct documents collide", () => {
    // The guest sends capPageUrl(location.href); the parser rejects anything longer than the
    // cap, so the capped form must always fit.
    const base = `data:text/html,${"a".repeat(3000)}`;
    expect(capPageUrl(base).length).toBeLessThanOrEqual(DESIGN_MODE_PAGE_URL_CAP);
    expect(capPageUrl("http://localhost:5173/")).toBe("http://localhost:5173/");
    // Two long data: documents sharing their first 2KB must still compare UNEQUAL — a plain
    // slice would collide them, and the draft store would replace one page's pill with the
    // other's, silently dropping its asks (PR #63 review).
    expect(capPageUrl(`${base}-variant-one`)).not.toBe(capPageUrl(`${base}-variant-two`));
    // Identical hrefs still cap identically, or the reload half of the key would never match.
    expect(capPageUrl(`${base}-same`)).toBe(capPageUrl(`${base}-same`));
  });
});
