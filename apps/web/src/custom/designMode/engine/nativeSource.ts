/**
 * Native React source resolution — the guest half of the desktop preload's
 * `__T3_DESIGN_SOURCE_RESOLVER_V1__` bridge (apps/desktop/src/preview/DesignSourceResolver.ts).
 *
 * Forge's `data-dc-source` JSX tags remain the most precise source and always win: this
 * module only runs for elements that carry no tag. When the resolver produces a valid
 * location, the element gets a synthesized canonical `data-dc-source="file:line:col"`
 * attribute — every existing consumer (snapshots, persistence, the change-request
 * builder, structural ops) keeps reading the one representation it always has — plus a
 * `data-t3-native-source` marker so synthesized tags are never mistaken for project
 * Forge tags, even across engine re-injections (a WeakSet alone would forget ownership
 * when the host re-injects after a toggle).
 *
 * Results are treated as untrusted input (the resolver global lives on a page-shared
 * globalThis): validated here, and later sanitized again by the request builder like any
 * other page-controlled `data-dc-source`. Failures — no resolver (web/mobile hosts, old
 * preloads), no React metadata, hostile shapes — cache as a per-element null so pointer
 * traffic can never retry-storm, and the element simply stays selector-addressed.
 */
import type { TaggedElement } from "./vendor/source";

export const NATIVE_SOURCE_RESOLVER_GLOBAL = "__T3_DESIGN_SOURCE_RESOLVER_V1__";

/** Marker attribute for T3-synthesized `data-dc-source` tags. Attribute (not WeakSet) on
 * purpose: forge-vs-native detection must survive destroy/re-inject cycles that reset
 * module state while the page DOM (and its synthesized tags) lives on. */
export const NATIVE_SOURCE_MARKER_ATTR = "data-t3-native-source";

const MAX_FILE_LENGTH = 4096;

interface NativeSourceResolver {
  resolve(element: Element): Promise<unknown>;
}

function getResolver(): NativeSourceResolver | null {
  const candidate = (globalThis as Record<string, unknown>)[NATIVE_SOURCE_RESOLVER_GLOBAL];
  if (typeof candidate !== "object" || candidate === null) return null;
  return typeof (candidate as { resolve?: unknown }).resolve === "function"
    ? (candidate as NativeSourceResolver)
    : null;
}

export function hasNativeResolver(): boolean {
  return getResolver() !== null;
}

/** Whether the page carries any PROJECT-authored Forge tag (synthesized ones excluded). */
export function hasForgeTags(doc: Document = document): boolean {
  return doc.querySelector(`[data-dc-source]:not([${NATIVE_SOURCE_MARKER_ATTR}])`) !== null;
}

export function markSynthesizedSource(el: TaggedElement, source: string): void {
  el.setAttribute("data-dc-source", source);
  el.setAttribute(NATIVE_SOURCE_MARKER_ATTR, "");
}

/** Whether `el`'s `data-dc-source` was written by T3 rather than the project's tagger. */
export function isSynthesizedSource(el: Element): boolean {
  return el.hasAttribute(NATIVE_SOURCE_MARKER_ATTR);
}

/** Validates one resolver result into a canonical `file:line:col` string, or null.
 * Mirrors the preload's own validation — belt and braces across a page-shared global. */
export function normalizeNativeSource(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as { file?: unknown; line?: unknown; column?: unknown };
  if (typeof v.file !== "string" || v.file.length === 0 || v.file.length > MAX_FILE_LENGTH) {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(v.file)) return null;
  if (typeof v.line !== "number" || !Number.isInteger(v.line) || v.line < 1) return null;
  if (typeof v.column !== "number" || !Number.isInteger(v.column) || v.column < 0) return null;
  return `${v.file}:${v.line}:${Math.max(1, v.column)}`;
}

/** One attempt per element for the element's lifetime — success, failure, and in-flight
 * all share the promise, so hover/click/send callers coalesce for free. */
const attempts = new WeakMap<TaggedElement, Promise<boolean>>();

/** Resolves `el`'s source through the native bridge and, on success, synthesizes the
 * canonical tag. Resolves true when the element ends up tagged (either way), false when
 * it stays selector-only. Never resolves for an element that already carries a tag —
 * a pre-existing (Forge or synthesized) `data-dc-source` is authoritative. */
export function resolveAndTag(el: TaggedElement): Promise<boolean> {
  if (el.dataset?.dcSource) return Promise.resolve(true);
  const cached = attempts.get(el);
  if (cached) return cached;
  const resolver = getResolver();
  if (!resolver) return Promise.resolve(false);
  const attempt = (async () => {
    let raw: unknown;
    try {
      raw = await resolver.resolve(el);
    } catch {
      return false;
    }
    const source = normalizeNativeSource(raw);
    // Recheck after the await: a node replaced by HMR must not be tagged post-mortem,
    // and a tag that appeared meanwhile (restore re-synthesis) must not be overwritten.
    if (!source || !el.isConnected) return false;
    if (el.dataset.dcSource) return true;
    markSynthesizedSource(el, source);
    return true;
  })();
  attempts.set(el, attempt);
  return attempt;
}

/** Bounded barrier for send time: kicks (or joins) resolution for every untagged element
 * in `els` and waits for the batch — or the timeout, whichever lands first. */
export async function awaitResolutions(
  els: readonly TaggedElement[],
  timeoutMs: number,
): Promise<void> {
  const pending = els.filter((el) => !el.dataset?.dcSource).map((el) => resolveAndTag(el));
  if (pending.length === 0) return;
  await Promise.race([
    Promise.allSettled(pending),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
