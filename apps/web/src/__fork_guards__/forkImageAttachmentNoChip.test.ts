// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-image-attachment-no-chip`.
 *
 * A staged image shows only as its thumbnail. Upstream gates an inline chip
 * on `imageAttachmentsGetChips`; the fork pins it false. Every
 * `imageContextReference` use is counted, so a rename or any new chip
 * insertion path upstream turns this red.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const composer = NodeFS.readFileSync(
  NodeURL.fileURLToPath(
    new URL("../components/chat/useComposerAttachmentIntake.ts", import.meta.url),
  ),
  "utf8",
);

describe("fork-image-attachment-no-chip", () => {
  it("never auto-inserts an inline chip for an attached image", () => {
    expect(composer).toContain("const imageAttachmentsGetChips = false;");
    expect(composer.match(/const imageAttachmentsGetChips\b/gu)).toHaveLength(1);
    expect(composer).toContain("if (storedImages.length > 0 && imageAttachmentsGetChips) {");
    expect(composer.match(/storedImages\.map\(imageContextReference\)/gu)).toHaveLength(1);
    // The import, the gated insertion above, and removeComposerImage's lookup.
    expect(composer.match(/\bimageContextReference\b/gu)).toHaveLength(3);
  });
});
