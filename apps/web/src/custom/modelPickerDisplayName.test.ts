import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { prefixComposerProviderName, stripProviderName } from "./modelPickerDisplayName";

const claude = ProviderDriverKind.make("claudeAgent");
const codex = ProviderDriverKind.make("codex");
const cursor = ProviderDriverKind.make("cursor");
const grok = ProviderDriverKind.make("grok");

describe("stripProviderName", () => {
  it("drops the standard provider name", () => {
    expect(stripProviderName("Claude Opus 5.5", { driverKind: claude })).toBe("Opus 5.5");
  });

  it("drops a custom account name", () => {
    expect(stripProviderName("Work Opus 5.5", { driverKind: claude, displayName: "Work" })).toBe(
      "Opus 5.5",
    );
  });

  it("drops Claude from Cursor's resold models only", () => {
    expect(stripProviderName("Claude Opus 5.5", { driverKind: cursor })).toBe("Opus 5.5");
    expect(stripProviderName("Composer 2", { driverKind: cursor })).toBe("Composer 2");
    expect(stripProviderName("Claude Opus 5.5", { driverKind: codex })).toBe("Claude Opus 5.5");
  });

  it("keeps a family word that carries the model's identity", () => {
    expect(stripProviderName("Grok Build", { driverKind: grok })).toBe("Grok Build");
    expect(stripProviderName("Grok 4.6", { driverKind: grok })).toBe("Grok 4.6");
  });

  it("leaves names that don't lead with the provider", () => {
    expect(stripProviderName("GPT-5.5", { driverKind: codex })).toBe("GPT-5.5");
    expect(stripProviderName("Claudette 2", { driverKind: claude })).toBe("Claudette 2");
    expect(stripProviderName("Claude", { driverKind: claude })).toBe("Claude");
  });
});

describe("prefixComposerProviderName", () => {
  it("names Cursor, whose resold models would otherwise read as their maker's", () => {
    expect(prefixComposerProviderName("Opus 5.5", { driverKind: cursor })).toBe("Cursor Opus 5.5");
    expect(prefixComposerProviderName("Composer 2", { driverKind: cursor })).toBe(
      "Cursor Composer 2",
    );
  });

  it("leaves other providers' names alone", () => {
    expect(prefixComposerProviderName("Opus 5.5", { driverKind: claude })).toBe("Opus 5.5");
    expect(prefixComposerProviderName("GPT-5.5", { driverKind: codex })).toBe("GPT-5.5");
  });
});
