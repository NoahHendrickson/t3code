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
 * preloads), no React metadata, hostile shapes — leave the element selector-addressed but
 * are retryable: a later hover/selection/send asks again, and the preload's own cache
 * (which holds a settled null for a short TTL) absorbs the repeats, so pointer traffic
 * still can't retry-storm react-grab.
 */
import type { TaggedElement } from "./vendor/source";

export const NATIVE_SOURCE_RESOLVER_GLOBAL = "__T3_DESIGN_SOURCE_RESOLVER_V1__";

/** Marker attribute for T3-synthesized `data-dc-source` tags. Attribute (not WeakSet) on
 * purpose: forge-vs-native detection must survive destroy/re-inject cycles that reset
 * module state while the page DOM (and its synthesized tags) lives on. */
export const NATIVE_SOURCE_MARKER_ATTR = "data-t3-native-source";

/** The React component that rendered the element, when the host could name one. Written
 * INDEPENDENTLY of `data-dc-source`: the host rejects a location it could not symbolicate, and
 * that is exactly when knowing "this is a `ComposerSelectControl`" saves the agent the hunt. */
export const COMPONENT_NAME_ATTR = "data-t3-component";

/** The authored file, when the host could name one but could NOT resolve a position inside it.
 * Never written alongside `data-dc-source` — a real tag already carries the file. */
export const SOURCE_FILE_ATTR = "data-t3-source-file";

const COMPONENT_NAME_PATTERN = /^[A-Za-z_$][\w$.]{0,63}$/;
const MAX_FILE_LENGTH = 4096;

/** Same posture as readComponentName: re-validated rather than trusted from the preload.
 * TWIN of `normalizeFilePath` in apps/desktop/src/preview/DesignSourceResult.ts — deliberate
 * duplication across the trust boundary, not a shared helper, because each side must hold on
 * its own. Loosen one and loosen the other, or the boundary stops meaning anything. */
function readSourceFile(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const file = (value as { file?: unknown }).file;
  if (typeof file !== "string" || file.length === 0 || file.length > MAX_FILE_LENGTH) return null;
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f]/.test(file) ? null : file;
}

/** Page-controlled like every other resolver field, and it lands in the agent's request text —
 * re-validated here rather than trusted from the preload (same posture as normalizeNativeSource).
 * TWIN of `normalizeComponentName` in apps/desktop/src/preview/DesignSourceResult.ts; keep the
 * two patterns identical. */
function readComponentName(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const name = (value as { componentName?: unknown }).componentName;
  return typeof name === "string" && COMPONENT_NAME_PATTERN.test(name) ? name : null;
}

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

/** One attempt per element at a time — success and in-flight share the promise, so
 * hover/click/send callers coalesce for free. Failures are dropped on settle so a later
 * ask can retry (an element hovered before React's dev metadata mounts should not stay
 * selector-only forever); the preload's short-TTL null cache bounds the retry cost. */
const attempts = new WeakMap<TaggedElement, Promise<boolean>>();

/** Elements whose attempt settled without producing a tag. Snapshots read this to tell
 * "no attempt has finished" (pending — stay editable) apart from "an attempt finished
 * and found nothing" (with the attributes also absent, the element is anonymous and the
 * panel disables editing). Membership is never the whole answer: a tag or a
 * component/file attribute — including one a LATER retry writes — always wins at read
 * time, so stale membership is harmless. */
const settledUntagged = new WeakSet<TaggedElement>();

/** Whether a native-source attempt for `el` has settled without tagging it. */
export function hasSettledUntagged(el: TaggedElement): boolean {
  return settledUntagged.has(el);
}

/** The elements a send or selection actually names: each element itself plus the parent
 * and adjacent siblings the structural asks (move/absolute) reference. One helper for
 * BOTH the send barrier and selection promotion so the two fan-outs never drift. */
export function sourceContextTargets(els: Iterable<TaggedElement>): Set<TaggedElement> {
  const targets = new Set<TaggedElement>();
  for (const el of els) {
    if (!el.isConnected) continue;
    targets.add(el);
    for (const context of [el.parentElement, el.previousElementSibling, el.nextElementSibling]) {
      if (context instanceof HTMLElement || context instanceof SVGElement) targets.add(context);
    }
  }
  return targets;
}

/** Resolves `el`'s source through the native bridge and, on success, synthesizes the
 * canonical tag. Resolves true when the element ends up tagged (either way), false when
 * it stays selector-only. Never resolves for an element that already carries a tag —
 * a pre-existing (Forge or synthesized) `data-dc-source` is authoritative. */
export function resolveAndTag(el: TaggedElement): Promise<boolean> {
  if (el.dataset?.dcSource) return Promise.resolve(true);
  const cached = attempts.get(el);
  if (cached) return cached;
  const resolver = getResolver();
  if (!resolver) {
    // A host with no resolver installed can never address this element — that IS a
    // settled answer, and recording it here is what lets the panel's per-element gate
    // work without a separate page-level concept (PR #72 review). If a resolver appears
    // later (never in practice — preloads install before page scripts), the ordinary
    // retry path still runs because nothing was cached in `attempts`.
    settledUntagged.add(el);
    return Promise.resolve(false);
  }
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
    if (!el.isConnected) return false;
    // Before the source gate on purpose — a component name is most valuable precisely when
    // there is no location to pair it with.
    // Overwrites rather than first-write-wins: HMR can rename or replace the component behind
    // a still-connected element, and a `hasAttribute` guard would serve the stale name forever.
    const componentName = readComponentName(raw);
    if (componentName) el.setAttribute(COMPONENT_NAME_ATTR, componentName);
    if (!source) {
      // No position, but the file survived the host's symbolication check — worth carrying,
      // since "which file" is most of what the address was for. Re-checked against a tag that
      // may have appeared during the await, exactly like the success path below: an element
      // that resolved fully in the meantime must not also gain a "(line not resolvable)" hint.
      if (el.dataset.dcSource) return true;
      const file = readSourceFile(raw);
      if (file) el.setAttribute(SOURCE_FILE_ATTR, file);
      return false;
    }
    if (el.dataset.dcSource) return true;
    // Clear any hint left by an earlier attempt — the resolved tag carries the file now, and
    // leaving both would render a location heading beside "(line not resolvable)".
    el.removeAttribute(SOURCE_FILE_ATTR);
    markSynthesizedSource(el, source);
    return true;
  })();
  attempts.set(el, attempt);
  void attempt.then((tagged) => {
    if (!tagged) settledUntagged.add(el);
    if (!tagged && attempts.get(el) === attempt) attempts.delete(el);
  });
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.allSettled(pending),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
