// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-file-link-ink`.
 *
 * The rule re-points variables upstream's ContextChip reads; a sync that
 * renames the file-link class or stops inking through `--context-chip-ink`
 * silently brings the per-kind accent back.
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

describe("fork-file-link-ink", () => {
  it("inks file links like every other chat link", () => {
    const rule = cssRules(readSibling("../theme.custom.css")).find((candidate) =>
      candidate.selector.includes(".chat-markdown-file-link"),
    );
    expect(rule?.selector.startsWith(MARKER)).toBe(true);
    expect(rule?.body).toContain("--context-chip-ink: var(--info-foreground)");
  });

  it("still finds the hooks upstream owns", () => {
    expect(readSibling("../components/chat/MarkdownFileLink.tsx")).toContain(
      '"chat-markdown-file-link"',
    );
    const chip = readSibling("../components/ContextChip.tsx");
    expect(chip).toContain("text-(--context-chip-ink)");
    expect(chip).toContain("[--document-icon-stroke:var(--context-chip-ink)]");
  });
});
