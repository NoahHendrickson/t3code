/**
 * The sidebar header's artwork — see
 * `.fork/customizations.yaml#fork-sidebar-chrome`.
 *
 * Upstream treats header art as a *channel indicator*: it renders only on Dev
 * and Nightly, and a release build gets none. The fork splits that in two. The
 * sidebar header always carries artwork, because it is brand chrome rather than
 * a build cue; the other two surfaces upstream paints with the same art — the
 * composer's send button and the standalone auth screen — keep upstream's
 * behaviour untouched, so they still light up on Dev and stay plain on a
 * release build. Those two need no fork code at all: they gate on
 * `resolveSidebarStageBackdropVariant`, which is null on a release build.
 *
 * Nightly is deliberately left on upstream's night sky. The fork has never cut
 * a Nightly build — that label needs a `-nightly.YYYYMMDD.N` version, and the
 * release workflow takes a hand-entered `0.1.2`-shaped one — so this branch is
 * unreachable in practice. Leaving it alone costs nothing and keeps the fork
 * correct if that ever changes, or if upstream reworks that art in a sync.
 */
import {
  StageBackdropArt,
  resolveSidebarStageBackdropVariant,
} from "~/components/SidebarStageBackdrop";
import { SidebarStageDitherArt } from "./SidebarStageDitherArt";

/** Which artwork the header shows. Not the same question as upstream's
    "is this a non-prod build", which is why this does not reuse its variant. */
export type ForkSidebarHeaderArt = "dev" | "nightly" | "release";

export function resolveForkSidebarHeaderArt(stageLabel: string): ForkSidebarHeaderArt {
  // Dev and Nightly are still whatever upstream says they are, so the fork
  // inherits any change to how those labels are recognised. Everything upstream
  // leaves unclassified — "Alpha", and any future release label — is what the
  // fork calls release, which is the case upstream draws no art for at all.
  const upstream = resolveSidebarStageBackdropVariant(stageLabel);
  return upstream ?? "release";
}

export function ForkSidebarHeaderBackdrop({ stageLabel }: { stageLabel: string }) {
  const art = resolveForkSidebarHeaderArt(stageLabel);

  return (
    // The class is upstream's, deliberately: the fade, mask and `::after` ramp
    // all key off it, and the fork's own hard-edge override keys off
    // `:has(.stage-dither)` inside it — so the dither gets a solid band while
    // the night sky keeps its dissolve, from one shared wrapper.
    <div
      aria-hidden
      className="sidebar-stage-backdrop pointer-events-none absolute inset-x-0 top-0 z-0 h-20 select-none overflow-hidden"
    >
      {art === "nightly" ? (
        <StageBackdropArt variant="nightly" />
      ) : (
        <SidebarStageDitherArt tone={art === "dev" ? "dev" : "release"} />
      )}
    </div>
  );
}
