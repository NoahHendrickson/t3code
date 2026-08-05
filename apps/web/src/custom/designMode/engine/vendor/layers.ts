/* t3-fork: re-vendored TRIMMED from the Forge's src/client/layers.ts for the native
 * layers tree — only the pure curated-walk functions came back; the LayersTree DOM
 * component, its callbacks, and the observer plumbing stayed deleted (the native rail in
 * custom/designMode/ForkLayersTree.tsx renders the tree; headlessMode.ts owns the
 * observer). Every function here is runtime-reachable from boot.ts, keeping the PR #50
 * review's vendor boundary. */
import type { TaggedElement } from './source'

/** One curated tree node — a TAGGED element; untagged wrappers never mint nodes. */
export interface LayerNode {
  el: TaggedElement
  label: string
  children: LayerNode[]
}

/** Tags whose subtree is noise in a layers tree. The Babel tagger tags EVERY JSX element,
 * so an inline `<svg><path/><path/></svg>` would otherwise mint a row per path under the
 * Icon row. Figma treats an icon as one leaf layer; so do we (PR #45 review). */
const OPAQUE_TAGS = new Set(['svg'])

/* t3-fork: native-source mode — non-visual noise skipped entirely by the untagged walk. */
const NOISE_TAGS = new Set(['script', 'style', 'link', 'meta', 'template', 'noscript', 'title'])

/* t3-fork: `display: none` is the untagged walk's other noise filter. A closed dialog or a
 * portal root full of unmounted-but-rendered chrome would otherwise fill the rail with rows
 * the user cannot see AND spend the host's node budget before the visible page is reached
 * (PR #54 review). display:none hides the whole SUBTREE, so skipping it here is both correct
 * and cheaper than walking it. Deliberately not `visibility`/`opacity`/off-screen: those
 * still occupy layout, a designer can legitimately want them, and only display:none is
 * subtree-wide. getComputedStyle (not checkVisibility) so the walk stays testable in jsdom. */
function isDisplayNone(el: Element): boolean {
  return getComputedStyle(el).display === 'none'
}

/* t3-fork: the host's serialization cap, threaded into the walk so it stops MINTING at
 * the cap instead of allocating (and labelling) a whole-DOM tree the serializer would
 * drop anyway — the untagged walk mints per element, so on a deep page the difference is
 * O(cap) vs O(DOM) per rebuild (PR #54 review). `truncated` means a mintable node was
 * actually dropped: a tree of exactly the cap's size exhausts `left` without setting it. */
export interface LayerBudget {
  left: number
  truncated: boolean
}

/**
 * Curated tree walk (Figma pivot P2, spec §5): a node per tagged element under `root`;
 * untagged elements contribute nothing but are descended THROUGH, so their tagged
 * descendants attach to the nearest tagged ancestor's children — the tree shows the
 * designer's structure, not the DOM's wrapper noise (panel-patterns anti-pattern: a raw
 * DOM tree as a layers panel). The overlay host can never appear: it mounts on
 * documentElement and walks start at body.
 *
 * t3-fork: `includeUntagged` is native-source mode's walk — on a page with no project
 * Forge tags there is no designer structure to curate, so every rendered element (minus
 * NOISE_TAGS and `display: none` subtrees; svg still opaque) mints a node. Tagged pages keep
 * the curated walk exactly, hidden nodes included: a Forge tag is the project's own claim
 * that the element is part of the design, and the curated tree is small either way.
 */
export function buildLayerTree(
  root: Element,
  includeUntagged = false,
  budget?: LayerBudget,
): LayerNode[] {
  const out: LayerNode[] = []
  for (const child of root.children) {
    if (budget?.truncated) break
    const el = child as TaggedElement
    const tag = child.tagName.toLowerCase()
    const opaque = OPAQUE_TAGS.has(tag)
    if (NOISE_TAGS.has(tag)) continue
    if (includeUntagged && !el.dataset?.dcSource && isDisplayNone(child)) continue
    const mints =
      Boolean(el.dataset?.dcSource) ||
      (includeUntagged && (child instanceof HTMLElement || child instanceof SVGElement))
    if (mints) {
      if (budget && budget.left <= 0) {
        budget.truncated = true
        break
      }
      if (budget) budget.left -= 1
      out.push({
        el,
        label: layerLabel(el),
        children: opaque ? [] : buildLayerTree(child, includeUntagged, budget),
      })
    } else if (!opaque) {
      out.push(...buildLayerTree(child, includeUntagged, budget))
    }
  }
  return out
}

const LABEL_CAP = 24

/** Designer vocabulary for the structural tags — a div IS a frame in the pivot's model.
 * Text-bearing elements label as their content instead (Figma's text-layer behavior). */
const TAG_LABELS: Record<string, string> = {
  div: 'Frame',
  section: 'Frame',
  article: 'Frame',
  main: 'Main',
  nav: 'Nav',
  header: 'Header',
  footer: 'Footer',
  aside: 'Aside',
  form: 'Form',
  button: 'Button',
  a: 'Link',
  img: 'Image',
  picture: 'Image',
  svg: 'Icon',
  input: 'Input',
  textarea: 'Input',
  select: 'Input',
  ul: 'List',
  ol: 'List',
  li: 'Item',
}

/** DIRECT text children only — deliberately not `textContent`, which concatenates the whole
 * subtree: `<div>Total<h1>Revenue</h1></div>` would label as "TotalRevenue" while its own
 * child row already says "Revenue" (the mixed-content trap panel-readers.ts documents for
 * isTextLeaf; PR #45 review). An element with no direct text falls through to its tag. */
function directText(el: Element): string {
  let out = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) out += node.nodeValue ?? ''
  }
  return out.replace(/\s+/g, ' ').trim()
}

export function layerLabel(el: TaggedElement): string {
  const t = directText(el)
  if (t) return t.length > LABEL_CAP ? `${t.slice(0, LABEL_CAP)}…` : t
  /* t3-fork: an id beats the generic tag vocabulary — most valuable on untagged pages,
   * where it is often the only human-authored name a wrapper has. */
  if (el.id) return el.id.length > LABEL_CAP ? `#${el.id.slice(0, LABEL_CAP)}…` : `#${el.id}`
  const tag = el.tagName.toLowerCase()
  return TAG_LABELS[tag] ?? tag
}
