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
  it("answers only from the composer while the timeline still knows the run is waiting", () => {
    const timelineTag = chatView.slice(chatView.indexOf("<ThreadTimeline"));
    const timelineProps = timelineTag.slice(0, timelineTag.indexOf("/>"));
    // The real list keeps the timeline's waiting state; without a responder its row is read-only.
    expect(timelineProps).toContain("pendingApprovals={pendingApprovals}");
    expect(timelineProps).not.toContain("onRespondToApproval=");
    expect(chatView).toContain("onRespondToApproval={onRespondToApprovalStable}");
  });

  it("declines on send only the approval the notice shows", () => {
    expect(composer).toContain(
      "shownPendingApprovalIds: activePendingApproval ? [activePendingApproval.requestId] : [],",
    );
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
