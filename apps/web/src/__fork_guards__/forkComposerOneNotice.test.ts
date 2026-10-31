// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-composer-one-notice`.
 *
 * The composer shows only its front notice. If ChatComposer stops filtering
 * the stack's items, every notice stacks up at once — Compact offered under
 * a usage limit that blocks it — and everything still compiles.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { frontComposerBanner } from "../custom/frontComposerBanner";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const chatComposer = readSibling("../components/chat/ChatComposer.tsx");
const bannerStack = readSibling("../components/chat/ComposerBannerStack.tsx");

describe("fork-composer-one-notice", () => {
  it("hands the composer's banner stack only the front item", () => {
    expect(chatComposer).toContain(
      "<ComposerBannerStack items={frontComposerBanner(shelfItems)} />",
    );
    expect(chatComposer).not.toContain("<ComposerBannerStack items={shelfItems} />");
    // The display order frontComposerBanner mirrors, so a reorder upstream turns this red.
    expect(bannerStack).toContain('const GROUPS = ["environment", "attention"] as const;');
    expect(bannerStack).toContain('(item.group ?? "attention") === group');
  });

  it("keeps the notice the stack would draw first and holds the rest back", () => {
    const usageLimit = { id: "usage-limit", variant: "warning", title: "" } as const;
    const compaction = { id: "resume-compaction", variant: "info", title: "" } as const;
    const offline = {
      id: "offline",
      variant: "error",
      group: "environment",
      title: "",
    } as const;

    expect(frontComposerBanner([usageLimit, compaction])).toEqual([usageLimit]);
    expect(frontComposerBanner([usageLimit, compaction, offline])).toEqual([offline]);
    expect(frontComposerBanner([])).toEqual([]);
  });
});
