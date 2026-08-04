import type { TaggedElement } from './source'
import type { DraftStore } from './drafts'
import { createButton } from './ui/button'

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

export interface LayersCallbacks {
  onSelect: (el: TaggedElement, additive: boolean) => void
  onHover: (el: TaggedElement | null) => void
  onDelete: (el: TaggedElement) => void
  /** The head's ‹ button — the host (layers-controller.ts) owns open-state truth. */
  onClose: () => void
}

/** Quiet-window for MutationObserver-driven rebuilds — HMR re-renders land as bursts. */
const REFRESH_DEBOUNCE_MS = 100

/**
 * The layers tree component (Figma pivot P2). Presentation + interaction only — selection
 * truth stays in DesignMode (rows call back; setSelection paints). Zero idle overhead:
 * the body MutationObserver exists only between start() and stop(). The observer can never
 * feed back on itself — rows render into the overlay's shadow tree, which hangs off
 * documentElement, outside the observed body subtree.
 *
 * Rebuild policy (PR #45 review): a full rebuild is page-proportional, so it is reserved
 * for the paths that actually change tree SHAPE — the observer, collapse toggles, and the
 * drafts tombstone paint. Selection, which fires on every canvas click, paints classes in
 * place through `rows` and never rebuilds.
 */
export class LayersTree {
  root = document.createElement('div')

  private list = document.createElement('div')
  /** Collapse state keyed by ELEMENT identity so it survives refresh()'s row rebuilds
   * (same nodes re-render across HMR bursts; a replaced node naturally re-expands). */
  private collapsed = new WeakSet<Element>()
  private selection = new Set<TaggedElement>()
  /** Live row index — the whole point of the in-place selection paint. Rebuilt by refresh(),
   * so it only ever holds rows currently in the list. */
  private rows = new Map<TaggedElement, HTMLElement>()
  /** The element whose row the pointer is over, so a rebuild can retract an outline whose
   * mouseleave will never fire (the hovered row node is gone). */
  private hovered: TaggedElement | null = null
  private observer: MutationObserver | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private running = false

  constructor(
    private drafts: DraftStore,
    private cb: LayersCallbacks
  ) {
    this.root.className = 'layers-panel'
    this.root.hidden = true
    const head = document.createElement('div')
    head.className = 'layers-head'
    const title = document.createElement('span')
    title.textContent = 'Layers'
    const close = createButton({ label: '‹', title: 'Hide layers', className: 'layers-close' })
    close.addEventListener('click', () => this.cb.onClose())
    head.append(title, close)
    this.list.className = 'layers-list'
    this.list.setAttribute('role', 'tree')
    this.list.setAttribute('aria-label', 'Layers')
    this.root.append(head, this.list)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.root.hidden = false
    this.observer = new MutationObserver(() => this.scheduleRefresh())
    // childList+characterData, no attributes — attribute churn (our own inline-style drafts,
    // canvas's body transform) must not thrash the tree, but React updates text nodes IN
    // PLACE, so childList alone leaves labels stale after an out-of-band text change
    // (hand edit + Fast Refresh, a chat-driven edit that never rides the draft lifecycle).
    this.observer.observe(document.body, { childList: true, characterData: true, subtree: true })
    this.refresh()
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    this.root.hidden = true
    this.observer?.disconnect()
    this.observer = null
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = null
  }

  /** Debounced refresh for external burst-y triggers (drafts.onChange fires per scrub tick;
   * the tombstone strike-through doesn't need per-tick tree rebuilds). */
  refreshSoon(): void {
    if (this.running) this.scheduleRefresh()
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null
      this.refresh()
    }, REFRESH_DEBOUNCE_MS)
  }

  refresh(): void {
    if (!this.running) return
    // Every row node is about to be replaced: the hovered row's mouseleave can never fire
    // (the node is gone), so retract its outline here or it lingers on the page until the
    // pointer happens to cross another row. Keyboard focus is likewise on a doomed node —
    // remember whose row had it and hand it back after the rebuild, so an observer tick
    // mid-keyboard-navigation doesn't drop the user out of the tree.
    if (this.hovered) {
      this.hovered = null
      this.cb.onHover(null)
    }
    const focused = this.focusedElement()
    this.rows.clear()
    this.list.replaceChildren()
    for (const node of buildLayerTree(document.body)) this.renderNode(node, 0)
    if (focused) this.rows.get(focused)?.focus()
  }

  /** Which tree row currently holds focus, as its element — reverse-looked-up because focus
   * lives on the row node and `rows` is keyed the other way. */
  private focusedElement(): TaggedElement | null {
    const scope = this.root.getRootNode() as Document | ShadowRoot
    const active = scope.activeElement
    if (!active || !(active as HTMLElement).classList?.contains('layer-row')) return null
    for (const [el, row] of this.rows) if (row === active) return el
    return null
  }

  /** Paints selection highlights, auto-expanding collapsed ancestors so a canvas click can
   * never select an invisible row, and reveals the first selected row. Rebuilds ONLY when
   * auto-expand actually changed the tree's shape — the common case (a click on an already
   * visible row) is a class swap on at most a handful of rows (PR #45 review). */
  setSelection(els: TaggedElement[]): void {
    const previous = this.selection
    this.selection = new Set(els)
    if (!this.running) return
    let expanded = false
    for (const el of els) {
      let node: Element | null = el.parentElement
      while (node && node !== document.body) {
        if (this.collapsed.delete(node)) expanded = true
        node = node.parentElement
      }
    }
    if (expanded) {
      this.refresh()
    } else {
      for (const el of previous) {
        if (this.selection.has(el)) continue
        const row = this.rows.get(el)
        if (!row) continue
        row.classList.remove('layer-selected')
        row.setAttribute('aria-selected', 'false')
      }
      for (const el of this.selection) {
        const row = this.rows.get(el)
        if (!row) continue
        row.classList.add('layer-selected')
        row.setAttribute('aria-selected', 'true')
      }
    }
    const first = els.length > 0 ? this.rows.get(els[0]) : null
    // jsdom has no scrollIntoView — presence-check keeps the unit environment honest.
    if (first && typeof first.scrollIntoView === 'function') first.scrollIntoView({ block: 'nearest' })
  }

  private renderNode(node: LayerNode, depth: number): void {
    const row = document.createElement('div')
    row.className = 'layer-row'
    row.dataset.depth = String(depth)
    row.style.setProperty('--layer-depth', String(depth))
    row.tabIndex = 0
    row.setAttribute('role', 'treeitem')
    row.setAttribute('aria-level', String(depth + 1))
    const selected = this.selection.has(node.el)
    row.setAttribute('aria-selected', String(selected))
    if (selected) row.classList.add('layer-selected')
    if (this.drafts.structuralOf(node.el)?.kind === 'delete') row.classList.add('layer-deleted')

    const isCollapsed = this.collapsed.has(node.el)
    if (node.children.length > 0) {
      row.setAttribute('aria-expanded', String(!isCollapsed))
      const chevron = document.createElement('span')
      chevron.className = 'layer-chevron'
      chevron.textContent = isCollapsed ? '▸' : '▾'
      chevron.addEventListener('click', (e) => {
        e.stopPropagation()
        if (isCollapsed) this.collapsed.delete(node.el)
        else this.collapsed.add(node.el)
        this.refresh() // a collapse changes tree SHAPE — one of the three rebuild paths
      })
      row.appendChild(chevron)
      if (isCollapsed) row.classList.add('layer-collapsed')
    } else {
      const spacer = document.createElement('span')
      spacer.className = 'layer-chevron layer-chevron-empty'
      row.appendChild(spacer)
    }

    const label = document.createElement('span')
    label.className = 'layer-label'
    label.textContent = node.label
    row.appendChild(label)

    row.addEventListener('click', (e) => this.cb.onSelect(node.el, e.shiftKey))
    row.addEventListener('mouseenter', () => {
      this.hovered = node.el
      this.cb.onHover(node.el.isConnected ? node.el : null)
    })
    row.addEventListener('mouseleave', () => {
      this.hovered = null
      this.cb.onHover(null)
    })
    row.addEventListener('keydown', (e) => {
      // Enter/Space select: without them a keyboard user could DELETE a row they had no way
      // to select (PR #45 review). Space is preventDefault'd anyway — it would scroll the
      // page, and canvas mode reads space-hold as pan.
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        this.cb.onSelect(node.el, e.shiftKey)
        return
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      e.preventDefault()
      e.stopPropagation()
      this.cb.onDelete(node.el)
    })

    this.rows.set(node.el, row)
    this.list.appendChild(row)
    if (!isCollapsed) for (const child of node.children) this.renderNode(child, depth + 1)
  }
}
