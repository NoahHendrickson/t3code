import {
  ChevronDownIcon,
  ChevronRight,
  ChevronsDownUpIcon,
  PanelLeftCloseIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "~/lib/utils";

import { designModeBridge } from "./designModeBridge";
import { selectDesignModeTab, useDesignModeStore } from "./designModeStore";
import { useLayersCollapsed } from "./layersCollapsed";
import { useLayersDrag, type DropEdge } from "./layersDrag";
import {
  ancestorsOf,
  flattenLayers,
  isExpanded,
  matchingIds,
  type LayerRow,
} from "./layersTreeModel";
import { LayerTypeIcon } from "./panel/LayerTypeIcon";

/** Marks the disclosure caret so the delegated click handler can tell "expand this" from
 * "select this" without a per-row closure. */
const TOGGLE_ATTRIBUTE = "data-layer-toggle";

/**
 * One row. Memoized on purpose: every interaction on this rail is delegated to the
 * container, so a row's props are its own id, three booleans and a string — which means a
 * drag crossing rows, or a keyboard walk, re-renders the two rows that changed rather than
 * all 400 of them (PR #57 review).
 */
const LayerRowView = memo(function LayerRowView({
  row,
  selected,
  active,
  draggable,
  dropEdge,
}: {
  row: LayerRow;
  selected: boolean;
  active: boolean;
  draggable: boolean;
  dropEdge: DropEdge | null;
}) {
  const { node, depth, expanded, hasChildren } = row;
  return (
    <div
      // Addressed by attribute rather than a ref callback: the rail re-renders on every
      // layers re-emit, and a fresh per-row callback tears down and re-attaches every ref
      // each time. The delegated handlers read the same attribute.
      data-layer-id={node.id}
      role="treeitem"
      aria-selected={selected}
      aria-level={depth + 1}
      {...(hasChildren ? { "aria-expanded": expanded } : {})}
      tabIndex={active ? 0 : -1}
      draggable={draggable}
      className={cn(
        "relative flex h-6 cursor-pointer items-center gap-0.5 rounded pe-1 text-xs outline-none",
        selected
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        active && !selected && "bg-accent/30",
        "focus-visible:ring-1 focus-visible:ring-[var(--fork-design-accent)]",
      )}
      style={{ paddingInlineStart: `${depth * 12 + 4}px` }}
    >
      {dropEdge ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 h-0.5 bg-[var(--fork-design-accent)]",
            dropEdge === "before" ? "top-0" : "bottom-0",
          )}
        />
      ) : null}
      {hasChildren ? (
        <span
          {...{ [TOGGLE_ATTRIBUTE]: "" }}
          role="button"
          aria-label={expanded ? "Collapse" : "Expand"}
          className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground"
        >
          {expanded ? <ChevronDownIcon className="size-3" /> : <ChevronRight className="size-3" />}
        </span>
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <LayerTypeIcon tag={node.tag} className="size-3.5 shrink-0 text-muted-foreground/70" />
      <span className="truncate">{node.label}</span>
    </div>
  );
});

/**
 * The native layers rail — a Figma-style tree of the previewed page's elements, docked
 * left of the browser surface while Design mode is on. The guest owns the walk: on
 * Forge-tagged pages the vendored curated rules (untagged wrappers descended through,
 * svg opaque); on untagged pages every visible element, minus non-visual noise. It
 * re-emits on DOM mutation; hover and click drive the same outline/selection funnels the
 * pointer does, over shared element ids.
 *
 * Figma's layers-panel behaviors, all of them going through the same shared ids: the rail
 * REVEALS whatever the canvas selects (expanding its ancestors and scrolling to it), it is
 * a real keyboard tree (arrows, Home/End, Shift to extend), it filters, and a row can be
 * dragged among its DOM siblings when the parent is an auto-layout container. Tree
 * arithmetic lives in layersTreeModel.ts and the drag in layersDrag.ts; every interaction is
 * delegated from the container here, so rows stay memoizable.
 * See `.fork/customizations.yaml#fork-design-mode`.
 */
export function ForkLayersTree({ runtimeTabId }: { runtimeTabId: string | null }) {
  const tab = useDesignModeStore((state) => selectDesignModeTab(state.byTabId, runtimeTabId));
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useLayersCollapsed();
  const listRef = useRef<HTMLDivElement>(null);
  const focusOnRender = useRef(false);
  /** The selection this rail has already scrolled to — see the reveal effect. */
  const revealed = useRef<number | null>(null);

  const roots = useMemo(() => tab.layers?.roots ?? [], [tab.layers]);
  const filter = useMemo(() => matchingIds(roots, query), [roots, query]);
  const rows = useMemo(() => flattenLayers(roots, expanded, filter), [roots, expanded, filter]);
  const selectedIds = useMemo(
    () => new Set(tab.selection.map((element) => element.id)),
    [tab.selection],
  );

  const rowElement = useCallback(
    (id: number) => listRef.current?.querySelector<HTMLElement>(`[data-layer-id="${id}"]`) ?? null,
    [],
  );

  // Reveal: a selection made in the PAGE has to become visible here, which means expanding
  // every ancestor and scrolling to the row. Guarded on what was actually revealed rather
  // than on the effect's deps: `roots` is a fresh array on every layers message, and the
  // guest re-emits on every debounced DOM mutation — so without this, any repaint in the
  // previewed page yanked the rail back to the selection and stomped the roving tabindex
  // mid-keyboard-navigation (PR #57 review).
  const firstSelected = tab.selection[0]?.id ?? null;
  useEffect(() => {
    if (firstSelected === null) {
      revealed.current = null;
      return;
    }
    if (revealed.current === firstSelected) return;
    const ancestors = ancestorsOf(roots, firstSelected);
    // Not in the tree YET: selection snapshots arrive immediately while layers are debounced
    // 250ms, so the first selection after enabling the mode routinely lands before its rows
    // exist. Stamping "revealed" here would burn the reveal for exactly that case (PR #57
    // review) — leave it unstamped and let the next layers message run it.
    if (!ancestors) return;
    revealed.current = firstSelected;
    if (ancestors.length > 0) {
      setExpanded((previous) => {
        const missing = ancestors.filter((id, index) => !isExpanded(previous, id, index));
        if (missing.length === 0) return previous;
        return { ...previous, ...Object.fromEntries(missing.map((id) => [id, true])) };
      });
    }
    setActiveId(firstSelected);
    // After the expansion lands, not during it.
    const frame = requestAnimationFrame(() => {
      rowElement(firstSelected)?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [firstSelected, roots, rowElement]);

  // Focus follows the roving tabindex only when the keyboard moved it — never on a plain
  // canvas selection, which must not steal focus out of the page.
  useEffect(() => {
    if (!focusOnRender.current || activeId === null) return;
    focusOnRender.current = false;
    const element = rowElement(activeId);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest" });
  }, [activeId, rows, rowElement]);

  // The tree needs exactly one tab stop at all times, or none of the keyboard handling below
  // is reachable — `activeId` is null on a fresh mount, and goes stale whenever its row is
  // filtered or collapsed away. Falling back to the first row keeps the rail enterable
  // without ever stealing focus, since the focus effect above still keys on `activeId`.
  const activeRowId =
    activeId !== null && rows.some((row) => row.node.id === activeId)
      ? activeId
      : (rows[0]?.node.id ?? null);

  const select = useCallback(
    (id: number, additive: boolean) => {
      if (!runtimeTabId) return;
      designModeBridge.selectElement(runtimeTabId, id, additive ? "toggle" : "replace");
    },
    [runtimeTabId],
  );

  const toggle = useCallback((id: number, depth: number) => {
    setExpanded((state) => ({ ...state, [id]: !isExpanded(state, id, depth) }));
  }, []);

  const moveActive = useCallback(
    (id: number, additive: boolean) => {
      focusOnRender.current = true;
      setActiveId(id);
      if (runtimeTabId) designModeBridge.hoverElement(runtimeTabId, id);
      if (additive) select(id, true);
    },
    [runtimeTabId, select],
  );

  const onReorder = useCallback(
    (id: number, beforeId: number | null) => {
      if (runtimeTabId) designModeBridge.reorderElement(runtimeTabId, id, beforeId);
    },
    [runtimeTabId],
  );

  const { dropTarget, canDrag, containerHandlers } = useLayersDrag({
    rows,
    filtering: filter !== null,
    onReorder,
  });

  /** The row an event happened in, plus its index — the delegated handlers' one lookup. */
  const rowFromEvent = useCallback(
    (target: EventTarget | null): { row: LayerRow; index: number } | null => {
      const host = (target as HTMLElement | null)?.closest?.("[data-layer-id]");
      const id = Number.parseInt(host?.getAttribute("data-layer-id") ?? "", 10);
      if (!Number.isFinite(id)) return null;
      const index = rows.findIndex((candidate) => candidate.node.id === id);
      const row = rows[index];
      return row ? { row, index } : null;
    },
    [rows],
  );

  const onListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const found = rowFromEvent(event.target);
      if (!found) return;
      const { row, index } = found;
      const { node } = row;
      switch (event.key) {
        case "ArrowDown": {
          const next = rows[index + 1];
          if (next) moveActive(next.node.id, event.shiftKey);
          break;
        }
        case "ArrowUp": {
          const previous = rows[index - 1];
          if (previous) moveActive(previous.node.id, event.shiftKey);
          break;
        }
        case "ArrowRight": {
          if (row.hasChildren && !row.expanded) toggle(node.id, row.depth);
          else if (row.hasChildren) {
            const child = rows[index + 1];
            if (child) moveActive(child.node.id, false);
          }
          break;
        }
        case "ArrowLeft": {
          if (row.hasChildren && row.expanded) toggle(node.id, row.depth);
          else if (row.parentId !== null) moveActive(row.parentId, false);
          break;
        }
        case "Home": {
          const first = rows[0];
          if (first) moveActive(first.node.id, false);
          break;
        }
        case "End": {
          const last = rows[rows.length - 1];
          if (last) moveActive(last.node.id, false);
          break;
        }
        case "Enter":
        case " ": {
          select(node.id, event.shiftKey || event.metaKey || event.ctrlKey);
          break;
        }
        default:
          return;
      }
      // Every handled key would otherwise scroll the rail or the page underneath it.
      event.preventDefault();
      event.stopPropagation();
    },
    [moveActive, rowFromEvent, rows, select, toggle],
  );

  if (!runtimeTabId || !tab.enabled || !tab.layers) return null;

  // Collapsed gives the space back entirely — no stub rail. The control that reopens it
  // lives in the preview chrome row (ForkPreviewLayersToggle), which is why the flag is
  // shared state rather than local to this component.
  if (collapsed) return null;

  return (
    <div
      className="flex w-52 shrink-0 flex-col border-r border-border bg-background"
      data-fork-design-layers="expanded"
    >
      <header className="flex h-9 shrink-0 items-center gap-1 border-b border-border pe-1.5 ps-3">
        <SearchIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setQuery("");
          }}
          placeholder="Layers"
          spellCheck={false}
          aria-label="Filter layers"
          className="h-6 w-full min-w-0 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query ? (
          <button
            type="button"
            title="Clear filter"
            aria-label="Clear filter"
            onClick={() => setQuery("")}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground [&_svg]:size-3"
          >
            <XIcon />
          </button>
        ) : (
          <button
            type="button"
            title="Collapse all"
            aria-label="Collapse all"
            onClick={() => setExpanded(Object.fromEntries(rows.map((row) => [row.node.id, false])))}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
          >
            <ChevronsDownUpIcon />
          </button>
        )}
        <button
          type="button"
          title="Hide layers"
          aria-label="Hide layers"
          aria-expanded={true}
          onClick={() => setCollapsed(true)}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
        >
          <PanelLeftCloseIcon />
        </button>
      </header>
      <div
        ref={listRef}
        // The ARIA tree contract this rail now actually implements: roving tabindex, arrow
        // navigation, expand/collapse and Shift-extend (PR #50's comment deferred the roles
        // until exactly that existed). Every handler is delegated from here — see LayerRowView.
        role="tree"
        aria-label="Page layers"
        aria-multiselectable
        className="min-h-0 flex-1 overflow-y-auto p-1.5"
        onKeyDown={onListKeyDown}
        onFocus={(event) => {
          const found = rowFromEvent(event.target);
          if (found) setActiveId(found.row.node.id);
        }}
        onClick={(event) => {
          const found = rowFromEvent(event.target);
          if (!found) return;
          if ((event.target as HTMLElement).closest(`[${TOGGLE_ATTRIBUTE}]`)) {
            toggle(found.row.node.id, found.row.depth);
            return;
          }
          setActiveId(found.row.node.id);
          select(found.row.node.id, event.shiftKey || event.metaKey || event.ctrlKey);
        }}
        onMouseOver={(event) => {
          const found = rowFromEvent(event.target);
          designModeBridge.hoverElement(runtimeTabId, found?.row.node.id ?? null);
        }}
        onMouseLeave={() => designModeBridge.hoverElement(runtimeTabId, null)}
        {...containerHandlers}
      >
        {rows.map((row) => (
          <LayerRowView
            key={row.node.id}
            row={row}
            selected={selectedIds.has(row.node.id)}
            active={activeRowId === row.node.id}
            draggable={canDrag(row)}
            dropEdge={dropTarget?.overId === row.node.id ? dropTarget.edge : null}
          />
        ))}
        {rows.length === 0 ? (
          <p className="px-1.5 py-1 text-[10px] text-muted-foreground/70">
            {query ? "No layers match." : "No layers yet."}
          </p>
        ) : null}
        {tab.layers.truncated ? (
          <p className="px-1.5 py-1 text-[10px] text-muted-foreground/70">
            Tree truncated — deeper elements aren&apos;t shown.
          </p>
        ) : null}
      </div>
    </div>
  );
}
