// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-thread-state-cards`.
 *
 * Settled, snoozed and woke threads announce themselves with notice cards
 * above the composer, not upstream's status line after the last message. A
 * sync that wires the status line back in as the timeline footer, or drops
 * the cards from the banner stack, silently moves Unsettle out of reach.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const chatView = readSibling("../components/ChatView.tsx");
const cards = readSibling("../custom/useThreadStateBanners.tsx");

describe("fork-thread-state-cards", () => {
  it("draws no status line after the last message", () => {
    expect(chatView).not.toContain("<ThreadStatusLine");
    expect(chatView).not.toMatch(/\bfooter=\{/u);
  });

  it("puts the settled, snoozed and woke cards in the composer banner stack", () => {
    expect(chatView).toContain("useThreadStateBanners({");
    expect(chatView).toContain(
      "if (activeThreadSettled && parkedThreadBannerItem) return [parkedThreadBannerItem];",
    );
    expect(chatView.match(/\.\.\.wokeThreadItems,/gu)).toHaveLength(2);
    expect(chatView.match(/\.\.\.parkedThreadItems,/gu)).toHaveLength(2);
    expect(cards).toContain('title: `This thread is ${snoozed ? "snoozed" : "settled"}`');
    expect(cards).toContain('"Unsettle"');
    expect(cards).toContain('title: "Thread woke from snooze"');
    expect(cards).toContain('data-fork-composer-notice-action="primary"');
    expect(cards).toContain("noticeCard: true");
  });
});
