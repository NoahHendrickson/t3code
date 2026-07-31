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

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const theme = readSibling("../theme.custom.css");

/** The type-size block is the only panel rule that sets --text-xs. */
function typeSizeBlock(): string {
  const pattern = new RegExp(
    `${MARKER.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*` +
      `\\[data-sidebar-version="v2"\\]\\s*` +
      `\\{([^}]*)\\}`,
    "u",
  );
  const matches = [...theme.matchAll(new RegExp(pattern.source, "gu"))].filter((match) =>
    (match[1] ?? "").includes("--text-xs:"),
  );
  expect(matches.length, "expected exactly one panel --text-xs block").toBe(1);
  return matches[0]?.[1] ?? "";
}

describe("fork guard: fork-sidebar-type-size", () => {
  it("remaps sidebar body type to 13px / 16px on the v2 panel", () => {
    const block = typeSizeBlock();
    expect(block).toContain("--text-xs: 13px");
    expect(block).toContain("--text-xs--line-height: 16px");
    expect(block).toContain("--text-sm: 13px");
    expect(block).toContain("--text-sm--line-height: 16px");
  });

  it("does not leak the 13px remap outside the sidebar panel", () => {
    // A bare :root rule would resize the workspace too. The remap must keep
    // the panel attribute in its selector.
    expect(theme).toMatch(
      new RegExp(
        `${MARKER.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}` +
          `[^/{]*\\[data-sidebar-version="v2"\\][^/{]*\\{[^}]*--text-xs:\\s*13px`,
        "u",
      ),
    );
    expect(theme).not.toMatch(
      new RegExp(
        `${MARKER.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\.dark\\s*\\{[^}]*--text-xs:`,
        "u",
      ),
    );
  });
});
