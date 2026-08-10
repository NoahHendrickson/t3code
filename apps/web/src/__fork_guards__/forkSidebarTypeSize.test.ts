// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-sidebar-type-size`.
 *
 * Remapping --text-xs / --text-sm only works when the rule is scoped to the
 * sidebar panel: a :root-only declaration would fight the whole app, and a
 * rule that evaporates in a sync silently puts the panel back on upstream's
 * 12px / 14px. The line-height pin is load-bearing too — letting it float
 * with the type size would grow the card's h-4 rows and desync the
 * contain-intrinsic-size hints.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const theme = readSibling("../theme.custom.css");
const sidebarLayout = readSibling("../components/AppSidebarLayout.tsx");
const canonicalSidebarPath = NodeURL.fileURLToPath(
  new URL("../components/Sidebar.tsx", import.meta.url),
);
const orphanedSidebarPath = NodeURL.fileURLToPath(
  new URL("../components/SidebarV2.tsx", import.meta.url),
);

const TEXT_SIZE_PROPS = [
  "--text-xs",
  "--text-xs--line-height",
  "--text-sm",
  "--text-sm--line-height",
] as const;

function declarationValue(body: string, prop: string): string | null {
  const pattern = new RegExp(`${prop.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}:\\s*([^;]+);`, "u");
  return pattern.exec(body)?.[1]?.trim() ?? null;
}

/** Every leaf rule that declares any of the remapped text-size props. */
function textSizeRules() {
  return cssRules(theme).filter((rule) =>
    TEXT_SIZE_PROPS.some((prop) => declarationValue(rule.body, prop) !== null),
  );
}

describe("fork guard: fork-sidebar-type-size", () => {
  it("mounts one canonical Sidebar V2 path and stamps its palette selector", () => {
    expect(NodeFS.existsSync(canonicalSidebarPath)).toBe(true);
    expect(NodeFS.existsSync(orphanedSidebarPath)).toBe(false);
    expect(sidebarLayout).toContain('import ThreadSidebar from "./Sidebar";');
    expect(sidebarLayout).not.toContain('from "./SidebarV2"');
    expect(sidebarLayout).toContain("<ThreadSidebar />");
    expect(sidebarLayout).toContain(
      'data-sidebar-version={legacySidebarEnabled && !isOnSettings ? "v1" : "v2"}',
    );
    expect(sidebarLayout).toMatch(
      /fork:begin fork-sidebar-type-size[\s\S]*data-sidebar-version[\s\S]*fork:end fork-sidebar-type-size/u,
    );
  });

  it("remaps sidebar body type to 0.8125rem / 1rem on the v2 panel", () => {
    const panel = textSizeRules().find((rule) =>
      rule.selector.includes('[data-sidebar-version="v2"]'),
    );
    expect(panel, "expected a panel-scoped text-size rule").toBeDefined();
    expect(declarationValue(panel?.body ?? "", "--text-xs")).toBe("0.8125rem");
    expect(declarationValue(panel?.body ?? "", "--text-xs--line-height")).toBe("1rem");
    expect(declarationValue(panel?.body ?? "", "--text-sm")).toBe("0.8125rem");
    expect(declarationValue(panel?.body ?? "", "--text-sm--line-height")).toBe("1rem");
    // Rem, not px — a px pin freezes the sidebar while h-4 and the rest of
    // the app still honour the browser font-size setting.
    expect(panel?.body ?? "").not.toMatch(/--text-(?:xs|sm):\s*\d+px/u);
  });

  it("scopes every text-size remap to the sidebar panel", () => {
    // The invariant: any declaration of these props must sit under a selector
    // that includes [data-sidebar-version=…]. A bare :root { --text-xs: … }
    // would resize the whole app and must fail this test — unlike checking
    // only for one arbitrary leak shape (MARKER.dark { … }).
    const rules = textSizeRules();
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.selector, `text-size remap leaked outside the panel: ${rule.selector}`).toMatch(
        /\[data-sidebar-version=/u,
      );
      expect(rule.selector).toContain(MARKER);
    }
  });
});
