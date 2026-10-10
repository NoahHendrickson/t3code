// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-subagent-spawn-card`.
 *
 * The customization is parked since the orchestrator-V2 sync: upstream
 * removed the spawn CTA row and the agent-panel model the fork tree drew
 * from, and spawn batches render through V2SubagentGroup. This pins that
 * parked state so a sync neither resurrects a dangling import of the removed
 * tree nor brings back the bordered one-line bar the tree replaced.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const timeline = readSibling("../components/chat/MessagesTimeline.tsx");

describe("fork guard: fork-subagent-spawn-card (parked)", () => {
  it("renders spawn batches through upstream's V2 group while the tree is parked", () => {
    expect(timeline).toContain("<V2SubagentGroup key={row.id} row={row} />");
    expect(timeline).not.toContain('from "~/custom/AgentSpawnCtaRow"');
    expect(timeline).not.toContain("<ForkAgentSpawnCtaRow");
    expect(timeline).not.toContain("Open Agents ▸");
    expect(timeline).not.toContain("border-border/60 bg-card/50");
    expect(
      NodeFS.existsSync(
        NodeURL.fileURLToPath(new URL("../custom/AgentSpawnCtaRow.tsx", import.meta.url)),
      ),
    ).toBe(false);
  });
});
