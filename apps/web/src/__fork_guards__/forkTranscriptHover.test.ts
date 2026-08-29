// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-transcript-hover`.
 *
 * CSS-only, keyed on two Tailwind utilities upstream uses for transparent
 * transcript rows and on the fork-stamped scroller class. Renaming either
 * upstream leaves the rule matching nothing — the rows compile, ship, and
 * hover as a cool smudge again.
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
const timeline = readSibling("../components/chat/MessagesTimeline.tsx");

describe("fork guard: fork-transcript-hover", () => {
  it("keeps the utilities and scroller class the rule keys on", () => {
    expect(timeline).toContain("hover:bg-accent/20");
    expect(timeline).toContain("hover:bg-muted/55");
    expect(timeline).toContain('"fork-timeline-cutoff"');
  });

  it("hovers transparent transcript rows as a 4% white lift", () => {
    const rule = cssRules(theme).find(
      (candidate) =>
        candidate.selector.includes(".fork-timeline-cutoff") &&
        candidate.selector.includes(":hover") &&
        candidate.body.includes("--fork-outline-hover-bg"),
    );
    expect(rule?.selector).toContain(MARKER);
    expect(rule?.selector).toContain(".dark");
    expect(rule?.selector).toContain(".hover\\:bg-accent\\/20");
    expect(rule?.selector).toContain(".hover\\:bg-muted\\/55");
    // The filled tile keeps its own hover; a white-only lift would darken it.
    expect(rule?.selector).not.toContain("accent\\/50");
    expect(rule?.body).toMatch(/background-color:\s*var\(--fork-outline-hover-bg\)/u);
  });
});
