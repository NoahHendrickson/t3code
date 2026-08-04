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

/**
 * Curated tree walk (Figma pivot P2, spec §5): a node per tagged element under `root`;
 * untagged elements contribute nothing but are descended THROUGH, so their tagged
 * descendants attach to the nearest tagged ancestor's children — the tree shows the
 * designer's structure, not the DOM's wrapper noise (panel-patterns anti-pattern: a raw
 * DOM tree as a layers panel). The overlay host can never appear: it mounts on
 * documentElement and walks start at body.
 */
export function buildLayerTree(root: Element): LayerNode[] {
  const out: LayerNode[] = []
  for (const child of root.children) {
    const el = child as TaggedElement
    const opaque = OPAQUE_TAGS.has(child.tagName.toLowerCase())
    if (el.dataset?.dcSource) {
      out.push({ el, label: layerLabel(el), children: opaque ? [] : buildLayerTree(child) })
    } else if (!opaque) {
      out.push(...buildLayerTree(child))
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
  const tag = el.tagName.toLowerCase()
  return TAG_LABELS[tag] ?? tag
}
