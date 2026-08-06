export interface SourceLocation {
  file: string
  line: number
  col: number
}

export function parseSourceAttr(value: string): SourceLocation | null {
  const m = /^(.+):(\d+):(\d+)$/.exec(value)
  if (!m) return null
  return { file: m[1], line: Number(m[2]), col: Number(m[3]) }
}

/** Last path segment — the lastIndexOf('/') idiom, shared by every call site that needs to
 * shorten a file path for display (changelist.ts, index.ts's element chip, panel.ts's source
 * line, session-feed.ts's tool-edit summary). Paths with no '/' are returned unchanged. */
export function basename(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? path : path.slice(slash + 1)
}

/** `<basename>:<line>` formatting for a raw data-dc-source attribute value — the project's
 * element-label convention (established by the Changes list). Returns '(no source)' when
 * `source` doesn't parse as a `file:line:col` tag. */
export function shortSource(source: string): string {
  const parsed = parseSourceAttr(source)
  if (!parsed) return '(no source)'
  return `${basename(parsed.file)}:${parsed.line}`
}

export type TaggedElement = HTMLElement | SVGElement

export function findTaggedElement(start: Element | null): TaggedElement | null {
  let el: Element | null = start
  while (el) {
    if ((el instanceof HTMLElement || el instanceof SVGElement) && el.dataset.dcSource) return el
    el = el.parentElement
  }
  return null
}

/* t3-fork: native-source mode — selection no longer requires a data-dc-source ancestor. */

/** Tags that are never a design target: the document scaffold plus non-visual metadata. */
const NONSELECTABLE_TAGS = new Set(['html', 'body', 'head', 'script', 'style', 'link', 'meta', 'template', 'noscript', 'title'])

/** The one selection-eligibility rule. A tagged ancestor still wins outright (Forge pages
 * behave exactly as before); without one, the pointer's own element is the target — the
 * native resolver (engine/nativeSource.ts) recovers its source lazily, and untagged
 * elements stay editable either way. SVG internals are opaque, matching the layers walk:
 * a click on a <path> selects its outermost <svg>. */
export function findSelectableElement(start: Element | null): TaggedElement | null {
  const tagged = findTaggedElement(start)
  if (tagged) return tagged
  let el: Element | null = start
  while (el instanceof SVGElement && el.ownerSVGElement) el = el.ownerSVGElement
  if (!(el instanceof HTMLElement || el instanceof SVGElement)) return null
  if (NONSELECTABLE_TAGS.has(el.tagName.toLowerCase())) return null
  return el
}
