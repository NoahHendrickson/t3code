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
 * method returning validated scalars (`file`/`line`/`column`) or null. No Electron
 * object, IPC function, Node capability, React Fiber, or raw react-grab context
 * ever crosses this boundary.
 */
import { getElementContext } from "react-grab/primitives";

import {
  DESIGN_SOURCE_RESOLVER_GLOBAL,
  describeResolvedSource,
  type DesignSourceResult,
} from "./DesignSourceResult.ts";

/** What `resolve` actually puts on the wire: a full location, or — when react-grab could not
 * symbolicate — just the component name, which the engine uses to label an otherwise
 * selector-addressed element. Reading only the location fields yields the original contract. */
type ResolvedPayload = Partial<DesignSourceResult> & { componentName?: string };

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
  // The slot is handed over by releaseSlot, not re-acquired here — decrementing and
  // re-incrementing would open a microtask window where a fresh synchronous caller
  // takes the fast path and the gate overshoots its cap (PR #54 review).
  await new Promise<void>((resolve) => waiters.push(resolve));
}

function releaseSlot(): void {
  const next = waiters.shift();
  if (next) next();
  else activeResolutions -= 1;
}

/** Settled AND in-flight results share one promise per element — concurrent callers
 * (hover prefetch racing a click promotion) never trigger duplicate react-grab work.
 * Successes cache for the element's lifetime; null results expire after a short TTL so
 * an element resolved before React mounted its dev metadata (hydration, a lazy chunk)
 * can succeed on a later ask instead of staying selector-only forever (PR #54 review).
 * The TTL also bounds retry cost: at most one react-grab attempt per element per TTL. */
const resolutionCache = new WeakMap<Element, Promise<ResolvedPayload | null>>();

const NULL_RESULT_TTL_MS = 5000;

async function resolveElement(element: Element): Promise<ResolvedPayload | null> {
  await acquireSlot();
  try {
    const context = await getElementContext(element);
    const normalized = describeResolvedSource(context);
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

function resolve(element: unknown): Promise<ResolvedPayload | null> {
  if (!(element instanceof Element) || element.ownerDocument !== document || !element.isConnected) {
    return Promise.resolve(null);
  }
  const cached = resolutionCache.get(element);
  if (cached) return cached;
  const resolution = resolveElement(element);
  resolutionCache.set(element, resolution);
  void resolution.then((result) => {
    if (result !== null) return;
    window.setTimeout(() => {
      if (resolutionCache.get(element) === resolution) resolutionCache.delete(element);
    }, NULL_RESULT_TTL_MS);
  });
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
