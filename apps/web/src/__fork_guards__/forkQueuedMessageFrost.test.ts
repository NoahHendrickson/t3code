// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-queued-message-frost`.
 *
 * CSS-only, keyed on the data-queued-message-id row and its dashed bubble.
 * Renaming either upstream leaves the rule matching nothing — the queued
 * message ships as a bare dashed outline again.
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

describe("fork guard: fork-queued-message-frost", () => {
  it("keeps the row attribute and dashed bubble the rule keys on", () => {
    expect(timeline).toMatch(
      /data-queued-message-id=\{queuedMessage\.id\}>\s*<div className="[^"]*\bborder-dashed\b/u,
    );
  });

  it("frosts the queued bubble with a low white wash over a blur", () => {
    const rule = cssRules(theme).find((candidate) =>
      candidate.selector.includes("[data-queued-message-id] > .border-dashed"),
    );
    expect(rule?.selector).toContain(MARKER);
    expect(rule?.selector).toContain(".dark");
    expect(rule?.body).toMatch(/background-color:\s*rgb\(255 255 255 \/ 4%\)/u);
    expect(rule?.body).toMatch(/(?<!-webkit-)backdrop-filter:\s*blur\(12px\)/u);
  });
});
