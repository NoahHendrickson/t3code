// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import { cssRules } from "./cssRules";

const theme = NodeFS.readFileSync(new URL("../theme.custom.css", import.meta.url), "utf8");
const rules = cssRules(theme);
const gate =
  ':root[data-fork="noahhendrickson-t3code"][data-fork-sidebar-vibrancy="true"].dark[data-fork-theme="cool-darker"]';

describe("fork guard: fork-glass-buttons", () => {
  it.each([
    ["button.surface-glass", "--fork-context-chip-bg"],
    ["button.surface-glass:is(:hover, [data-pressed])", "--fork-context-chip-bg-hover"],
  ])("paints %s with the shared chip fill over an opaque glass floor", (selector, token) => {
    const rule = rules.find(
      (candidate) => candidate.selector.replace(/\s+/gu, " ") === `${gate} ${selector}`,
    );
    expect(rule?.body.replace(/\s+/gu, " ")).toContain(
      `background: linear-gradient(var(${token}), var(${token})), var(--fork-popup-glass-floor);`,
    );
  });
});
