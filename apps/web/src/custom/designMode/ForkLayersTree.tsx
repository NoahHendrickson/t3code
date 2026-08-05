import { ChevronDownIcon, ChevronRight, ChevronsDownUpIcon, SearchIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "~/lib/utils";

import { designModeBridge } from "./designModeBridge";
import { selectDesignModeTab, useDesignModeStore } from "./designModeStore";
import { LayerTypeIcon } from "./panel/LayerTypeIcon";
import {
  ancestorsOf,
  flattenLayers,
  isExpanded,
  matchingIds,
  type LayerRow,
} from "./layersTreeModel";

/** Where a drag would land relative to the hovered row. */
type DropEdge = "before" | "after";

function LayerRowView({
  row,
  selected,
  active,
  dropEdge,
  onToggle,
  onSelect,
  onHover,
  onFocusRow,
  onKeyDown,
  drag,
  registerRef,
}: {
  row: LayerRow;
  selected: boolean;
  active: boolean;
  dropEdge: DropEdge | null;
  onToggle: () => void;
  onSelect: (additive: boolean) => void;
  onHover: () => void;
  onFocusRow: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  drag: {
    onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragLeave: () => void;
    onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragEnd: () => void;
  };
  registerRef: (element: HTMLDivElement | null) => void;
}) {
  const { node, depth, expanded, hasChildren } = row;
  return (
    <div
      ref={registerRef}
      role="treeitem"
      aria-selected={selected}
      aria-level={depth + 1}
      {...(hasChildren ? { "aria-expanded": expanded } : {})}
      tabIndex={active ? 0 : -1}
      draggable={node.reorderable}
      onFocus={onFocusRow}
      onKeyDown={onKeyDown}
      onMouseEnter={onHover}
      onClick={(event) => onSelect(event.shiftKey || event.metaKey || event.ctrlKey)}
      {...drag}
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
        <button
          type="button"
          tabIndex={-1}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          {expanded ? <ChevronDownIcon className="size-3" /> : <ChevronRight className="size-3" />}
        </button>
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <LayerTypeIcon tag={node.tag} className="size-3.5 shrink-0 text-muted-foreground/70" />
      <span className="truncate">{node.label}</span>
    </div>
  );
}

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
 * dragged among its siblings when the parent is an auto-layout container.
 * See `.fork/customizations.yaml#fork-design-mode`.
 */
export function ForkLayersTree({ runtimeTabId }: { runtimeTabId: string | null }) {
  const tab = useDesignModeStore((state) => selectDesignModeTab(state.byTabId, runtimeTabId));
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ id: number; overId: number; edge: DropEdge } | null>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const focusOnRender = useRef(false);

  const roots = useMemo(() => tab.layers?.roots ?? [], [tab.layers]);
  const filter = useMemo(() => matchingIds(roots, query), [roots, query]);
  const rows = useMemo(() => flattenLayers(roots, expanded, filter), [roots, expanded, filter]);
  const selectedIds = useMemo(
    () => new Set(tab.selection.map((element) => element.id)),
    [tab.selection],
  );

  // Reveal: a selection made in the PAGE has to become visible here, which means expanding
  // every ancestor and scrolling to the row. Keyed on the first selected id, so re-emitted
  // snapshots for the same selection (a scrub tick, a discard) don't re-scroll the rail.
  const firstSelected = tab.selection[0]?.id ?? null;
  useEffect(() => {
    if (firstSelected === null) return;
    const ancestors = ancestorsOf(roots, firstSelected);
    if (ancestors && ancestors.length > 0) {
      setExpanded((previous) => {
        const missing = ancestors.filter((id, index) => !isExpanded(previous, id, index));
        if (missing.length === 0) return previous;
        return { ...previous, ...Object.fromEntries(missing.map((id) => [id, true])) };
      });
    }
    setActiveId(firstSelected);
    // After the expansion lands, not during it.
    const frame = requestAnimationFrame(() => {
      rowRefs.current.get(firstSelected)?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [firstSelected, roots]);

  // Focus follows the roving tabindex only when the keyboard moved it — never on a plain
  // canvas selection, which must not steal focus out of the page.
  useEffect(() => {
    if (!focusOnRender.current || activeId === null) return;
    focusOnRender.current = false;
    rowRefs.current.get(activeId)?.focus({ preventScroll: true });
    rowRefs.current.get(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId, rows]);

  const select = useCallback(
    (id: number, additive: boolean) => {
      if (!runtimeTabId) return;
      designModeBridge.selectElement(runtimeTabId, id, additive ? "toggle" : "replace");
    },
    [runtimeTabId],
  );

  const moveActive = useCallback(
    (id: number, additive: boolean) => {
      focusOnRender.current = true;
      setActiveId(id);
      if (runtimeTabId) designModeBridge.hoverElement(runtimeTabId, id);
      if (additive) select(id, true);
    },
    [runtimeTabId, select],
  );

  const onRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, row: LayerRow, index: number) => {
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
          if (row.hasChildren && !row.expanded) {
            setExpanded((state) => ({ ...state, [node.id]: true }));
          } else if (row.hasChildren) {
            const child = rows[index + 1];
            if (child) moveActive(child.node.id, false);
          }
          break;
        }
        case "ArrowLeft": {
          if (row.hasChildren && row.expanded) {
            setExpanded((state) => ({ ...state, [node.id]: false }));
          } else if (row.parentId !== null) {
            moveActive(row.parentId, false);
          }
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
    [moveActive, rows, select],
  );

  if (!runtimeTabId || !tab.enabled || !tab.layers) return null;

  const dropTargetFor = (row: LayerRow, edge: DropEdge): number | null =>
    edge === "before" ? row.node.id : row.nextSiblingId;

  return (
    <div
      className="flex w-52 shrink-0 flex-col border-r border-border bg-background"
      data-fork-design-layers
    >
      <header className="flex h-9 shrink-0 items-center gap-1 border-b border-border ps-3 pe-1.5">
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
      </header>
      <div
        // The ARIA tree contract this rail now actually implements: roving tabindex, arrow
        // navigation, expand/collapse and Shift-extend (PR #50's comment deferred the roles
        // until exactly that existed).
        role="tree"
        aria-label="Page layers"
        aria-multiselectable
        className="min-h-0 flex-1 overflow-y-auto p-1.5"
        onMouseLeave={() => designModeBridge.hoverElement(runtimeTabId, null)}
      >
        {rows.map((row, index) => (
          <LayerRowView
            key={row.node.id}
            row={row}
            selected={selectedIds.has(row.node.id)}
            active={activeId === row.node.id}
            dropEdge={drag && drag.overId === row.node.id ? drag.edge : null}
            registerRef={(element) => {
              if (element) rowRefs.current.set(row.node.id, element);
              else rowRefs.current.delete(row.node.id);
            }}
            onToggle={() =>
              setExpanded((state) => ({
                ...state,
                [row.node.id]: !isExpanded(state, row.node.id, row.depth),
              }))
            }
            onSelect={(additive) => {
              setActiveId(row.node.id);
              select(row.node.id, additive);
            }}
            onHover={() => designModeBridge.hoverElement(runtimeTabId, row.node.id)}
            onFocusRow={() => setActiveId(row.node.id)}
            onKeyDown={(event) => onRowKeyDown(event, row, index)}
            drag={{
              onDragStart: (event) => {
                event.dataTransfer.effectAllowed = "move";
                // Firefox needs data set for a drag to start at all; the payload is unused.
                event.dataTransfer.setData("text/plain", String(row.node.id));
                setDrag({ id: row.node.id, overId: row.node.id, edge: "before" });
              },
              onDragOver: (event) => {
                if (!drag) return;
                const dragged = rows.find((candidate) => candidate.node.id === drag.id);
                // Same parent only — the move draft can reorder siblings, not reparent, and
                // an accepted drop that quietly did nothing would be the worse answer.
                if (
                  !dragged ||
                  dragged.parentId !== row.parentId ||
                  dragged.node.id === row.node.id
                ) {
                  event.dataTransfer.dropEffect = "none";
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const bounds = event.currentTarget.getBoundingClientRect();
                const edge: DropEdge =
                  event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
                if (drag.overId !== row.node.id || drag.edge !== edge) {
                  setDrag({ ...drag, overId: row.node.id, edge });
                }
              },
              onDragLeave: () => {
                if (drag?.overId === row.node.id) setDrag({ ...drag, overId: -1 });
              },
              onDrop: (event) => {
                event.preventDefault();
                if (!drag) return;
                const beforeId = dropTargetFor(row, drag.edge);
                if (beforeId !== drag.id) {
                  designModeBridge.reorderElement(runtimeTabId, drag.id, beforeId);
                }
                setDrag(null);
              },
              onDragEnd: () => setDrag(null),
            }}
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
