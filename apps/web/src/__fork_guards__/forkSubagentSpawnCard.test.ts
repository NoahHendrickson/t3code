// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-subagent-spawn-card`.
 *
 * The transcript spawn CTA is a thin wrapper over the fork-owned tree. A
 * sync that drops the import, restores the bordered bar, or unhooks
 * onOpenAgents compiles and ships the old one-line card.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const timeline = readSibling("../components/chat/MessagesTimeline.tsx");
const card = readSibling("../custom/AgentSpawnCtaRow.tsx");

describe("fork guard: fork-subagent-spawn-card", () => {
  it("routes the spawn CTA through the fork tree", () => {
    expect(timeline).toContain('from "~/custom/AgentSpawnCtaRow"');
    expect(timeline).toContain("<ForkAgentSpawnCtaRow");
    expect(timeline).toContain("onOpenAgents={onOpenAgents}");
    expect(timeline).not.toContain("Open Agents ▸");
    expect(timeline).not.toContain("border-border/60 bg-card/50");
  });

  it("keeps the Figma header, member rows, and open-agents action", () => {
    expect(card).toContain('from "@phosphor-icons/react"');
    expect(card).toContain("TreeView");
    expect(card).toContain('weight="regular"');
    // Lead/status wording comes from upstream's summary helper since the
    // 2026-09-08 sync; the card only strips its check glyph.
    expect(card).toContain("deriveAgentSpawnSummary({");
    expect(card).toContain('summary.status.replace(/^✓ /u, "")');
    expect(card).toContain("View agents");
    expect(card).toContain("onClick={props.onOpenAgents}");
    expect(card).toContain("SidebarV2WorkingRain");
    expect(card).toContain("SidebarV2IdleMark");
    expect(card).toContain("formatSubagentTokenCount");
    expect(card).toContain("formatSubagentModelLabel");
    expect(card).toContain("resolveSpawnCta");
    expect(card).toContain("coordinatorTokens");
    expect(card).toContain("w-full min-w-0");
    expect(card).toContain("SPAWN_MEMBER_VISUAL");
    expect(card).toContain("data-fork-subagent-spawn-card");
    expect(card).not.toContain('tone="input"');
    expect(card).not.toContain("border-border/60");
    expect(card).not.toContain("bg-card/50");
  });
});
