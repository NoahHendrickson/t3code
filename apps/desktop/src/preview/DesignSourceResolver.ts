/**
 * Fork customization — see `.fork/customizations.yaml#fork-design-mode`.
 *
 * Installs a narrow, read-only React source resolver on the preview guest page's
 * `globalThis` so the fork's Design-mode engine (injected via `executeJavaScript`)
 * can map clicked elements to source without the previewed project running
 * forge-mode's JSX tagger. The preview webview runs with `contextIsolation=false`
 * (see WebviewPreferences.ts), so this preload shares the page's global object —
 * the same property react-grab already depends on for the element picker.
 *
 * The surface is deliberately tiny: one frozen object with one async `resolve`
 * method returning validated scalars (`file`/`line`/`column` plus optional
 * `componentName`/`selector`) or null. No Electron object, IPC function, Node
 * capability, React Fiber, or raw react-grab context ever crosses this boundary.
 */
import { getElementContext } from "react-grab/primitives";

import {
  DESIGN_SOURCE_RESOLVER_GLOBAL,
  normalizeResolvedSource,
  type DesignSourceResult,
} from "./DesignSourceResult.ts";

/** react-grab resolution symbolicates through source maps — cap concurrent work so a
 * scrubbing cursor can't queue dozens of expensive lookups at once. */
const MAX_CONCURRENT = 2;

// Tiny concurrency gate — no queue library in a preload.
let activeResolutions = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeResolutions < MAX_CONCURRENT) {
    activeResolutions += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  activeResolutions += 1;
}

function releaseSlot(): void {
  activeResolutions -= 1;
  waiters.shift()?.();
}

/** Settled AND in-flight results share one promise per element — concurrent callers
 * (hover prefetch racing a click promotion) never trigger duplicate react-grab work. */
const resolutionCache = new WeakMap<Element, Promise<DesignSourceResult | null>>();

async function resolveElement(element: Element): Promise<DesignSourceResult | null> {
  await acquireSlot();
  try {
    const context = await getElementContext(element);
    const normalized = normalizeResolvedSource(context);
    // Recheck after the await — an element replaced mid-resolution must not hand the
    // engine a location for a node that no longer exists.
    if (!normalized || !element.isConnected || element.ownerDocument !== document) return null;
    return normalized;
  } catch {
    return null;
  } finally {
    releaseSlot();
  }
}

function resolve(element: unknown): Promise<DesignSourceResult | null> {
  if (!(element instanceof Element) || element.ownerDocument !== document || !element.isConnected) {
    return Promise.resolve(null);
  }
  const cached = resolutionCache.get(element);
  if (cached) return cached;
  const resolution = resolveElement(element);
  resolutionCache.set(element, resolution);
  return resolution;
}

if (typeof document !== "undefined" && !(DESIGN_SOURCE_RESOLVER_GLOBAL in globalThis)) {
  // Non-writable, non-configurable, frozen: the page can call it but never replace it.
  Object.defineProperty(globalThis, DESIGN_SOURCE_RESOLVER_GLOBAL, {
    value: Object.freeze({ resolve }),
    writable: false,
    configurable: false,
    enumerable: false,
  });
}
