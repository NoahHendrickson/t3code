import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  StageBackdropButtonArt,
  StageBackdropArt,
} from "./SidebarStageBackdrop";

describe("SidebarStageBackdrop", () => {
  it("resolves stage artwork only when enabled", () => {
    expect(resolveSidebarStageBackdropVariant("Dev")).toBe("dev");
    expect(resolveSidebarStageBackdropVariant("Nightly")).toBe("nightly");
    expect(resolveSidebarStageBackdropVariant("Dev", false)).toBeNull();
    expect(resolveSidebarStageBackdropVariant("Alpha")).toBeNull();
  });

  it("resolves supported environment pill labels", () => {
    expect(resolveEnvironmentIdentificationPillLabel("Dev")).toBe("Dev");
    expect(resolveEnvironmentIdentificationPillLabel("nightly")).toBe("Nightly");
    expect(resolveEnvironmentIdentificationPillLabel("Latest")).toBeNull();
    expect(resolveEnvironmentIdentificationPillLabel("Alpha")).toBeNull();
  });

  it.each(["nightly", "dev"] as const)(
    "uses unique SVG definition ids when %s artwork is rendered more than once",
    (variant) => {
      const markup = renderToStaticMarkup(
        <>
          <StageBackdropArt variant={variant} />
          <StageBackdropArt variant={variant} />
        </>,
      );
      const ids = Array.from(markup.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);

      /* fork:begin fork-sidebar-chrome — see .fork/customizations.yaml#fork-sidebar-chrome
         The Dev art is a raster background rather than an SVG with <defs>, so
         it emits no ids at all and the collision this case exists to catch
         cannot arise for it. Only the "is this test exercising anything"
         precondition narrows to nightly; the uniqueness assertion below still
         covers both, so reverting Dev to SVG art re-arms it automatically. */
      if (variant === "nightly") expect(ids.length).toBeGreaterThan(0);
      /* fork:end fork-sidebar-chrome */
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  it("uses a compact Nightly crop for composer buttons", () => {
    const backdrop = renderToStaticMarkup(<StageBackdropArt variant="nightly" />);
    const button = renderToStaticMarkup(<StageBackdropButtonArt variant="nightly" />);

    expect(backdrop).toContain('viewBox="0 0 8192 96"');
    expect(button).toContain('viewBox="96 0 8192 96"');
  });
});
