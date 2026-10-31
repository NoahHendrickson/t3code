// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-composer-approval-notice`.
 *
 * Pending approvals answer from a notice card above the composer, not from
 * upstream's inline timeline row.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function read(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const chatView = read("../components/ChatView.tsx");
const composer = read("../components/chat/ChatComposer.tsx");
const notice = read("../custom/forkApprovalNotice.tsx");

describe("fork-composer-approval-notice", () => {
  it("keeps approvals off the timeline and hands the composer the respond handler", () => {
    const timeline = chatView.slice(chatView.indexOf("<ThreadTimeline"));
    expect(timeline.slice(0, timeline.indexOf("/>"))).toContain(
      "pendingApprovals={FORK_NO_TIMELINE_APPROVALS}",
    );
    expect(chatView).toContain("onRespondToApproval={onRespondToApprovalStable}");
  });

  it("puts the active approval in the composer banner stack as a notice card", () => {
    expect(composer).toMatch(
      /const hasBlockingComposerTopDrawer =\s+activePendingApproval !== null \|\| pendingUserInputs\.length > 0;/u,
    );
    expect(composer).toContain("forkApprovalNoticeItem({");
    expect(composer).toContain("<ComposerBannerStack items={forkShelfItems} />");
    expect(notice).toContain("noticeCard: true");
    expect(notice).toContain("<ComposerPendingApprovalActions");
  });
});
