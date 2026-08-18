import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  resolveSidebarStageFocusRingOffsetClass,
  StageBackdropArt,
  StageBackdropButtonArt,
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

  it("matches the focus-ring offset to each artwork palette", () => {
    expect(resolveSidebarStageFocusRingOffsetClass("nightly")).toBe(
      "focus-visible:ring-offset-(--stage-night-bottom)",
    );
    expect(resolveSidebarStageFocusRingOffsetClass("dev")).toBe(
      "focus-visible:ring-offset-(--stage-art-bottom)",
    );
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

  /* fork:begin fork-sidebar-chrome — see .fork/customizations.yaml#fork-sidebar-chrome
     The dev variant renders the fork's PNG dither (SidebarStageDitherArt), not
     upstream's blueprint SVG, so upstream's token and viewBox assertions apply
     to the Nightly sky only; the dev cases assert the dither's own contract. */
  it("paints the nightly artwork with theme-owned color tokens", () => {
    const nightlyMarkup = renderToStaticMarkup(<StageBackdropArt variant="nightly" />);

    expect(nightlyMarkup).toContain("var(--stage-night-bottom)");
    expect(nightlyMarkup).toContain("var(--stage-night-line)");
    expect(nightlyMarkup).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("uses the compact nightly crop inside the send button", () => {
    const markup = renderToStaticMarkup(<StageBackdropButtonArt variant="nightly" />);

    expect(markup).toContain('viewBox="96 0 8192 96"');
    expect(markup).toContain("stage-nightly");
  });

  it("uses the dither's light corner inside the send button for dev", () => {
    const markup = renderToStaticMarkup(<StageBackdropButtonArt variant="dev" />);

    expect(markup).toContain("right top");
  });
  /* fork:end fork-sidebar-chrome */
});
