import { ChevronDownIcon, ChevronRight } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";

import { designModeBridge } from "./designModeBridge";
import { selectDesignModeTab, useDesignModeStore } from "./designModeStore";
import type { DesignModeLayerNode } from "./protocol";

/** Depth below which nodes start collapsed by default — the top two levels give the
 * page's structure without a wall of rows on first open. */
const DEFAULT_EXPAND_DEPTH = 2;

function LayerRow({
  node,
  depth,
  runtimeTabId,
  selectedIds,
  expanded,
  setExpanded,
}: {
  node: DesignModeLayerNode;
  depth: number;
  runtimeTabId: string;
  selectedIds: ReadonlySet<number>;
  expanded: Record<number, boolean>;
  setExpanded: (updater: (prev: Record<number, boolean>) => Record<number, boolean>) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded[node.id] ?? depth < DEFAULT_EXPAND_DEPTH;
  const isSelected = selectedIds.has(node.id);
  return (
    <>
      {/* Plain divs by design: role="tree"/"treeitem" would promise the ARIA keyboard
          contract (arrow nav, focusable rows) this v1 doesn't implement — real keyboard
          navigation is the follow-up that earns the roles back. */}
      <div
        className={cn(
          "flex h-6 cursor-pointer items-center gap-0.5 rounded pe-1 text-xs",
          isSelected
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
        style={{ paddingInlineStart: `${depth * 12 + 4}px` }}
        onMouseEnter={() => designModeBridge.hoverElement(runtimeTabId, node.id)}
        onClick={() => designModeBridge.selectElement(runtimeTabId, node.id)}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isExpanded ? "Collapse" : "Expand"}
            className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((prev) => ({ ...prev, [node.id]: !isExpanded }));
            }}
          >
            {isExpanded ? (
              <ChevronDownIcon className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <span className="truncate">{node.label}</span>
      </div>
      {hasChildren && isExpanded
        ? node.children.map((child) => (
            <LayerRow
              key={child.id}
              node={child}
              depth={depth + 1}
              runtimeTabId={runtimeTabId}
              selectedIds={selectedIds}
              expanded={expanded}
              setExpanded={setExpanded}
            />
          ))
        : null}
    </>
  );
}

/**
 * The native layers rail — a Figma-style tree of the previewed page's elements, docked
 * left of the browser surface while Design mode is on. The guest owns the walk: on
 * Forge-tagged pages the vendored curated rules (untagged wrappers descended through,
 * svg opaque); on untagged pages every visible element, minus non-visual noise. It
 * re-emits on DOM mutation; hover and click drive the same outline/selection funnels the
 * pointer does, over shared element ids. See `.fork/customizations.yaml#fork-design-mode`.
 */
export function ForkLayersTree({ runtimeTabId }: { runtimeTabId: string | null }) {
  const tab = useDesignModeStore((state) => selectDesignModeTab(state.byTabId, runtimeTabId));
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  if (!runtimeTabId || !tab.enabled || !tab.layers) return null;
  const selectedIds = new Set(tab.selection.map((element) => element.id));
  return (
    <div
      className="flex w-44 shrink-0 flex-col border-r border-border bg-background"
      data-fork-design-layers
    >
      <header className="flex h-9 shrink-0 items-center border-b border-border px-3">
        <span className="text-xs font-medium text-muted-foreground">Layers</span>
      </header>
      <div
        aria-label="Page layers"
        className="min-h-0 flex-1 overflow-y-auto p-1.5"
        onMouseLeave={() => designModeBridge.hoverElement(runtimeTabId, null)}
      >
        {tab.layers.roots.map((node) => (
          <LayerRow
            key={node.id}
            node={node}
            depth={0}
            runtimeTabId={runtimeTabId}
            selectedIds={selectedIds}
            expanded={expanded}
            setExpanded={setExpanded}
          />
        ))}
        {tab.layers.truncated ? (
          <p className="px-1.5 py-1 text-[10px] text-muted-foreground/70">
            Tree truncated — deeper elements aren&apos;t shown.
          </p>
        ) : null}
      </div>
    </div>
  );
}
