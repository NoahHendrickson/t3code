// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const sidebar = NodeFS.readFileSync(
  NodeURL.fileURLToPath(new URL("../components/ui/sidebar.tsx", import.meta.url)),
  "utf8",
);

const offcanvasFence =
  /fork:begin sidebar-offcanvas-compositing(?<body>[\s\S]*?)fork:end sidebar-offcanvas-compositing/u.exec(
    sidebar,
  )?.groups?.body;

describe("fork guard: composited sidebar offcanvas transition", () => {
  it("slides the fixed panel with transform while leaving layout width separate", () => {
    expect(offcanvasFence).toBeDefined();
    expect(offcanvasFence).toContain("transition-[translate,width]");
    expect(offcanvasFence).toContain("-translate-x-full");
    expect(offcanvasFence).toContain("translate-x-full");
    expect(offcanvasFence).not.toMatch(/transition-\[[^\]]*(?:left|right)/u);
    expect(offcanvasFence).not.toContain("calc(var(--sidebar-width)*-1)");
  });
});
