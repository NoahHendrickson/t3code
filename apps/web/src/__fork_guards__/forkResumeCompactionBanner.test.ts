// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-resume-compaction-banner`.
 *
 * A stale, large Claude thread offers compaction through the "Resume with less
 * context" notice card, not upstream's "Compact and send" button. The button
 * takes the send slot (pushing out the dictation mic) and makes Enter compact
 * first; it only renders while the composer gets non-null tokens, so ChatView
 * must keep handing it null and keep the card in the banner stack.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const chatView = readSibling("../components/ChatView.tsx");
const primaryActions = readSibling("../components/chat/ComposerPrimaryActions.tsx");
const card = readSibling("../custom/useResumeCompactionBanner.tsx");

describe("fork-resume-compaction-banner", () => {
  it("never hands the composer or the send path compact-on-send tokens", () => {
    expect(chatView).toContain("const resumeCompactionTokens: number | null = null;");
    expect(chatView.match(/const resumeCompactionTokens\b/gu)).toHaveLength(1);
    expect(chatView).toContain("resumeCompactionTokens={resumeCompactionTokens}");
    // The button the null keeps away, so a rename upstream turns this red.
    expect(primaryActions).toContain("compactBeforeSendTokens !== null");
  });

  it("puts the resume card in the composer banner stack", () => {
    expect(chatView).toContain("const resumeCompactionBannerItem = useResumeCompactionBanner({");
    expect(chatView.match(/\.\.\.resumeCompactionItems,/gu)).toHaveLength(2);
    expect(card).toContain('title: "Resume with less context"');
    expect(card).toContain('dismissLabel: "Keep full history"');
    expect(card).toContain('data-fork-composer-notice-action="primary"');
    expect(card).toContain("noticeCard: true");
  });
});
