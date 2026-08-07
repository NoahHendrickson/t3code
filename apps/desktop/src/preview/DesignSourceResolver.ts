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
  type ResolvedDesignSource,
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
 *
 * Three tiers, not two. Only a FULL location caches for the element's lifetime. Both a null
 * result and a hint (`{file?, componentName?}` with no position) expire after a short TTL, so
 * an element asked before React mounted its dev metadata — hydration, a lazy chunk, a source
 * map still in flight — can succeed on a later ask instead of being pinned at "(line not
 * resolvable)" forever. Caching hints as successes would have quietly cancelled the retry
 * behaviour PR #54 added, since a hint is non-null. The TTL also bounds retry cost: at most
 * one react-grab attempt per element per TTL. */
const resolutionCache = new WeakMap<Element, Promise<ResolvedDesignSource | null>>();

const RETRYABLE_RESULT_TTL_MS = 5000;

async function resolveElement(element: Element): Promise<ResolvedDesignSource | null> {
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

function resolve(element: unknown): Promise<ResolvedDesignSource | null> {
  if (!(element instanceof Element) || element.ownerDocument !== document || !element.isConnected) {
    return Promise.resolve(null);
  }
  const cached = resolutionCache.get(element);
  if (cached) return cached;
  const resolution = resolveElement(element);
  resolutionCache.set(element, resolution);
  void resolution.then((result) => {
    // A hint is not a success — `line` is what distinguishes the two arms of the union.
    if (result !== null && "line" in result && result.line !== undefined) return;
    window.setTimeout(() => {
      if (resolutionCache.get(element) === resolution) resolutionCache.delete(element);
    }, RETRYABLE_RESULT_TTL_MS);
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
