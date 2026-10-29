// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-subagent-spawn-card`.
 *
 * The transcript spawn batch renders as the fork-owned tree. A sync that
 * puts upstream's avatar-stack group back at the call site, drops the member
 * rows, or brings back a bordered member box compiles and ships upstream's
 * card.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

// Upstream moved V2EventTimelineRow out of MessagesTimeline.
const timeline = readSibling("../components/chat/TimelineV2EventRow.tsx");
const group = readSibling("../custom/ForkSubagentGroup.tsx");
const model = readSibling("../custom/forkSubagentTree.ts");
const theme = readSibling("../theme.custom.css");

describe("fork guard: fork-subagent-spawn-card", () => {
  it("routes the spawn batch through the fork tree", () => {
    expect(timeline).toContain('from "~/custom/ForkSubagentGroup"');
    expect(timeline).toMatch(
      /\(row\.subagents\?\.length \?\? 1\) > 1\) \{[\s\S]{0,400}?<ForkSubagentGroup[\s\S]{0,200}?onOpenThread=\{ctx\.onOpenThread\}/u,
    );
    expect(timeline).not.toContain("return <V2SubagentGroup key={row.id} row={row} />;");
    // Upstream deleted its grouped-batch browser cases (#22557), so no fenced skips remain.
  });

  it("keeps the Figma header and member rows", () => {
    expect(group).toContain('from "@phosphor-icons/react"');
    expect(group).toContain('<TreeView weight="regular"');
    // Lead, status wording, the progress-or-result pick and the model's name
    // come from upstream's shared helpers; the fork owns only the vocabulary.
    expect(model).toContain("subagentGroupSummary(rows)");
    expect(model).toContain("summarizeSubagentStatuses(rows.map((row) => row.status))");
    expect(model).toContain("subagentDetailPreview(input)");
    expect(model).toContain("formatModelSlugName(slug)");
    expect(model).not.toContain("isForkSubagentSettled");
    // Members take the sidebar's status marks, not avatars or a box.
    expect(group).toContain("<SidebarV2StatusMark status={memberStatus(member.mark)}");
    expect(group).not.toContain("SubagentAvatar");
    expect(group).not.toContain("border-border/60");
    expect(group).not.toContain("bg-card/30");
    // A member with a thread of its own opens it.
    expect(group).toContain("onClick={() => onOpenThread(childThreadId)}");
    expect(theme).toContain("button[data-fork-subagent-member]:hover");
  });
});
