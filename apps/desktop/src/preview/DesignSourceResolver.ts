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
 * method returning validated scalars (`file`/`line`/`column`/`componentName`, plus the
 * primitives-only `props` snapshot) or null. No Electron object, IPC function, Node
 * capability, React Fiber, or raw react-grab context ever crosses this boundary.
 */
// The ROOT export on purpose, side effect and all: importing `bippy` installs the React
// DevTools hook stub at module load when none exists. In this preload that is guarded
// double work, not new behavior — react-grab's own bundled bippy ships the identical
// installer in the chunk `react-grab/primitives` pulls in, and fiber access (the picker,
// getElementContext) already depends on it. `bippy/core` would skip the install but its
// published d.ts exports mangled names (`getDisplayName as L`), so it cannot be imported
// by name. Same pinned version as react-grab's bundled copy (0.5.41).
import { getDisplayName, isCompositeFiber, type Fiber } from "bippy";
import { getElementContext } from "react-grab/primitives";

import {
  DESIGN_SOURCE_RESOLVER_GLOBAL,
  describeResolvedSource,
  type ResolvedDesignSource,
} from "./DesignSourceResult.ts";

/** How far up the fiber tree to look for the named component. The rendering component is
 * normally the first composite ancestor; the budget only exists so a hostile or cyclic
 * `return` chain cannot spin. */
const MAX_FIBER_WALK = 25;

/** The `memoizedProps` of the composite fiber whose displayName matches the name react-grab
 * reported, walked upward from the context's own fiber. Matching by NAME is the honesty
 * guard: the request renders these as `<Name> — props: ...`, so props read off any other
 * fiber would be labeled with a component they do not belong to — no match, no props.
 * Returns the RAW object; normalizeResolvedProps (via describeResolvedSource) owns making
 * it safe to cross the bridge. Best-effort throughout: any surprise returns null rather
 * than failing a resolution that already has a location to deliver. */
function readComponentProps(fiber: Fiber | null, componentName: string | null): unknown {
  if (!fiber || typeof componentName !== "string" || componentName.length === 0) return null;
  try {
    let candidate: Fiber | null = fiber;
    for (let depth = 0; candidate && depth < MAX_FIBER_WALK; depth += 1) {
      if (isCompositeFiber(candidate) && getDisplayName(candidate.type) === componentName) {
        const props: unknown = candidate.memoizedProps;
        return typeof props === "object" ? props : null;
      }
      candidate = candidate.return;
    }
  } catch {
    // A hostile props getter or a detached fiber mid-commit — context, never worth throwing.
  }
  return null;
}

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
    const normalized = describeResolvedSource({
      ...context,
      props: readComponentProps(context.fiber, context.componentName),
    });
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
