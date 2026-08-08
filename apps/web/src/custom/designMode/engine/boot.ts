/**
 * Engine entry point — bundled to a self-contained IIFE (see apps/web/fork's
 * vitePluginForkDesignMode) and injected into the preview webview's guest page via
 * `webview.executeJavaScript` when the user toggles Design mode on.
 *
 * Headless: the properties panel is NATIVE T3 UI (custom/designMode/panel/). The guest
 * keeps only what must live in the page — selection chrome, drafts, gestures — and talks
 * to the host over the console-message bridge (guest→host) and the
 * `window.__T3_DESIGN_MODE__` command handle (host→guest, `DesignModeGuestHandle`).
 *
 * Injection is idempotent: a live handle re-activates instead of double-mounting, so the
 * host can always inject the full bundle without probing first. A page navigation wipes
 * the guest's globals, and the host re-injects on the webview's `dom-ready`.
 */
import {
  DESIGN_MODE_GLOBAL,
  DESIGN_MODE_PROTOCOL_VERSION,
  type DesignModeGuestHandle,
} from "../protocol";
import { emitToHost } from "./bridge";
import { HeadlessOverlay } from "./headlessOverlay";
import { HeadlessDesignMode } from "./headlessMode";
import { hasForgeTags, hasNativeResolver } from "./nativeSource";
import { loadLifecycle } from "./vendor/lifecycle-store";
import { readTheme, readTokens } from "./vendor/tokens";

function existingHandle(): DesignModeGuestHandle | undefined {
  return (globalThis as Record<string, unknown>)[DESIGN_MODE_GLOBAL] as
    | DesignModeGuestHandle
    | undefined;
}

function boot(): void {
  const existing = existingHandle();
  if (existing) {
    // Same contract: re-activate the live engine rather than double-mounting. A DIFFERENT
    // one (a host update while the webview kept its engine, the common HMR case) must be
    // torn down instead — reusing it fails silently, since new verbs throw into the
    // bridge's catch and its older snapshots are rejected wholesale by the stricter parser,
    // leaving the panel frozen with nothing to explain it (PR #57 review).
    if (existing.version === DESIGN_MODE_PROTOCOL_VERSION) {
      existing.setActive(true);
      return;
    }
    try {
      existing.destroy();
    } catch {
      delete (globalThis as Record<string, unknown>)[DESIGN_MODE_GLOBAL];
    }
  }

  const overlay = new HeadlessOverlay();
  overlay.mount();
  const mode = new HeadlessDesignMode(overlay);

  mode.onSelection = (elements) => emitToHost({ type: "selection", elements });
  mode.onDraftsCount = (count) => emitToHost({ type: "drafts", count });
  mode.onLayers = (roots, truncated) => emitToHost({ type: "layers", roots, truncated });
  mode.onVerdict = (report) => emitToHost({ type: "verdict", report });
  mode.canvas.onCanvas = (on, scalePercent) => emitToHost({ type: "canvas", on, scalePercent });
  // Theme tokens re-read on every activation (setActive resets the vendored token
  // cache, so a CSS edit made while the tool was off is picked up here too).
  const emitTokens = () => {
    const tokens = readTokens();
    const theme = readTheme();
    emitToHost({ type: "tokens", colors: tokens.colors, spacingBasePx: theme.spacingBasePx });
  };
  mode.onStateChange = (active) => {
    emitToHost({ type: "state", active });
    // Tokens and canvas ride AFTER `state`: the host resets its per-tab world view on
    // every enabled flip, so anything emitted before `state` would be wiped by it.
    if (active) {
      emitTokens();
      mode.canvas.reassert();
    }
  };

  const handle: DesignModeGuestHandle = {
    version: DESIGN_MODE_PROTOCOL_VERSION,
    setActive: (on) => mode.setActive(on),
    isActive: () => mode.active,
    applyDraft: (ids, property, value) => mode.applyDraft(ids, property, value),
    setSizeMode: (ids, axis, sizeMode) => mode.setSizeMode(ids, axis, sizeMode),
    setAbsolute: (ids, on) => mode.setAbsolute(ids, on),
    setInset: (ids, axis, px) => mode.setInset(ids, axis, px),
    alignSelection: (ids, axis, value) => mode.alignSelection(ids, axis, value),
    setAspectLock: (ids, on) => mode.setAspectLock(ids, on),
    revertDraft: (ids, properties) => mode.revertDraft(ids, properties),
    discardAll: () => mode.discardAll(),
    compareAll: (on) => mode.compareAll(on),
    buildSend: () => mode.buildSend(),
    selectElement: (id, selectMode) => mode.selectById(id, selectMode),
    hoverElement: (id) => mode.hoverById(id),
    reorderElement: (id, beforeId) => mode.reorderById(id, beforeId),
    setCanvas: (on) => mode.canvas.setOn(on),
    canvasCommand: (action) => mode.canvas.run(action),
    verifySent: () => mode.verifySent(),
    // Sync engine-side; Promise-typed on the wire so the count rides executeJavaScript
    // back exactly as buildSend's payload does.
    commitVerified: () => Promise.resolve(mode.commitVerified()),
    destroy: () => {
      mode.setActive(false);
      overlay.destroy();
      delete (globalThis as Record<string, unknown>)[DESIGN_MODE_GLOBAL];
    },
  };
  (globalThis as Record<string, unknown>)[DESIGN_MODE_GLOBAL] = handle;

  // Project Forge tags are the most precise mapping and always win per element; the
  // native resolver (desktop preload) recovers untagged React elements lazily; with
  // neither, everything stays editable and sends fall back to selector/text context.
  emitToHost({
    type: "ready",
    sourceMode: hasForgeTags() ? "forge" : hasNativeResolver() ? "native-react" : "selector-only",
  });

  // Drafts survive the full reloads dev servers legitimately do (non-HMR-able edits) AND
  // host-side off/on toggles (destroy() persists designModeOn:false, but the host injecting
  // this bundle IS the activation signal — so the flag is forced on rather than trusted).
  const saved = loadLifecycle();
  if (saved) {
    try {
      mode.restoreLifecycle({ ...saved, designModeOn: true });
    } catch {
      mode.setActive(false);
    }
  }
  mode.setActive(true);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}
