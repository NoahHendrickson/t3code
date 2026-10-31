// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-queued-runs-banner`.
 *
 * Queued messages are the reorderable "Queued" banner above the composer, not
 * upstream's dashed bubbles in the timeline footer.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function read(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const chatView = read("../components/ChatView.tsx");
const composer = read("../components/chat/ChatComposer.tsx");
const banner = read("../custom/ForkQueuedRunsBanner.tsx");
const commands = read("../../../../packages/client-runtime/src/operations/commands.ts");
const threadCommands = read("../../../../packages/client-runtime/src/state/threadCommands.ts");

describe("fork-queued-runs-banner", () => {
  it("mounts the banner in the composer dock, not the timeline footer", () => {
    expect(chatView).toContain("<ForkQueuedRunsBanner");
    expect(chatView).not.toMatch(/<QueuedRunsControl\s/u);
    expect(chatView).toContain("forkQueuedRunsBanner={hasQueuedTurns ? queuedRunsControl : null}");
    const footer = chatView.slice(chatView.indexOf("const timelineFooter ="));
    expect(footer.slice(0, footer.indexOf("\n    );\n"))).not.toContain("queuedRunsControl");
    const dock = composer.slice(composer.indexOf("<ComposerBanner.Column>"));
    expect(dock.slice(0, dock.indexOf("</ComposerBanner.Column>"))).toContain(
      "{props.forkQueuedRunsBanner}",
    );
  });

  it("renders the collapsible banner with reorder, steer, edit and remove", () => {
    expect(banner).toContain("<ComposerBanner.Attachment>");
    expect(banner).toContain("<ComposerBanner.ToggleIcon expanded={expanded} />");
    expect(banner).toContain("useAtomCommand(threadEnvironment.reorderQueuedRun)");
    expect(banner).toContain("<GripVerticalIcon />");
    expect(banner).toContain('aria-label="Edit queued message"');
    expect(banner).toContain('aria-label="Remove queued message"');
    expect(banner).toContain('workflow?.canSendNow ? "Send now" : "Steer"');
  });

  it("keeps the client reorder command that upstream removed", () => {
    expect(commands).toContain('type: "queued-run.reorder"');
    expect(threadCommands).toContain("reorderQueuedRun: createEnvironmentCommand(runtime, {");
  });
});
