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
import { DESIGN_MODE_GLOBAL, type DesignModeGuestHandle } from "../protocol";
import { emitToHost } from "./bridge";
import { HeadlessDesignMode } from "./headlessMode";
import { Overlay } from "./vendor/overlay";
import { loadLifecycle } from "./vendor/lifecycle-store";

function existingHandle(): DesignModeGuestHandle | undefined {
  return (globalThis as Record<string, unknown>)[DESIGN_MODE_GLOBAL] as
    | DesignModeGuestHandle
    | undefined;
}

function boot(): void {
  const existing = existingHandle();
  if (existing) {
    existing.setActive(true);
    return;
  }

  const overlay = new Overlay();
  overlay.mount();
  // No in-page chrome in headless mode: the T3 preview chrome owns activation and the
  // native panel owns every control — the overlay contributes outlines/handles only.
  overlay.toggle.hidden = true;
  overlay.status.hidden = true;
  const mode = new HeadlessDesignMode(overlay);

  mode.onSelection = (elements) => emitToHost({ type: "selection", elements });
  mode.onDraftsCount = (count) => emitToHost({ type: "drafts", count });
  mode.onStateChange = (active) => emitToHost({ type: "state", active });

  const handle: DesignModeGuestHandle = {
    setActive: (on) => mode.setActive(on),
    isActive: () => mode.active,
    applyDraft: (ids, property, value) => mode.applyDraft(ids, property, value),
    discardAll: () => mode.discardAll(),
    compareAll: (on) => mode.compareAll(on),
    buildSend: () => mode.buildSend(),
    destroy: () => {
      mode.setActive(false);
      overlay.host.remove();
      delete (globalThis as Record<string, unknown>)[DESIGN_MODE_GLOBAL];
    },
  };
  (globalThis as Record<string, unknown>)[DESIGN_MODE_GLOBAL] = handle;

  emitToHost({ type: "ready", tagged: document.querySelector("[data-dc-source]") !== null });

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
