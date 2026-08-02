import { SettingsIcon } from "lucide-react";
import { memo, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { APP_BASE_NAME } from "../../branding";
import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import {
  resolveEnvironmentIdentificationPillLabel,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
/* fork:begin fork-sidebar-chrome — see .fork/customizations.yaml#fork-sidebar-chrome */
import { ForkSidebarHeaderBackdrop } from "~/custom/SidebarHeaderBackdrop";
/* fork:end fork-sidebar-chrome */
import {
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdatePill } from "./SidebarUpdatePill";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  /* fork:begin fork-sidebar-chrome — see .fork/customizations.yaml#fork-sidebar-chrome
     Everything from here to the fence's end diverges from upstream: the
     hooks (upstream resolves a backdrop variant here; the fork resolves only
     the pill), the header's px-0 padding rewrite, the always-on backdrop,
     the inline toggle, the pill, and the trailing brand. */
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <SidebarHeader
      className={cn(
        // px-0: the toggle carries its own left inset (traffic lights on macOS
        // desktop, the safe-area gutter everywhere else) and the brand its own
        // right padding, so header padding would double up on both edges.
        "@container/sidebar-header relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-0 py-0",
        isElectron && "drag-region",
      )}
    >
      {/* Always, not only on a non-prod build: in the fork this is brand
          chrome rather than a channel cue, so it also ignores the environment
          identification setting upstream added for its own header art. That
          setting still governs the composer send button; the standalone auth
          screen never read it — upstream gates that surface on the build
          channel alone, and it stays untouched. */}
      <ForkSidebarHeaderBackdrop stageLabel={stageLabel} />
      {/* The toggle sits inline here rather than floating over the workspace, so
          it reads as belonging to the panel it collapses. The mobile-only
          visibility class is gone with it: that existed because the desktop
          toggle lived in AppSidebarLayout's fixed SidebarControl, which now
          renders only while the panel is shut.

          The left inset is the traffic-light clearance on macOS desktop — the
          same variable the floating button used, so the toggle lands in the same
          place it always did. The brand moves to the trailing edge, where it
          stops competing with the toggle for the corner your eye starts at.

          Both arts stay white-on-dark, so upstream's single backdrop treatment
          still holds. One correction to it: the `stroke-*` half was already
          inert here, because the Phosphor shim renders fills rather than
          strokes — the icon colour has to come from `text-*` or the toggle sits
          at muted-foreground on top of the art. */}
      <div className="relative z-10 flex items-center pl-[var(--workspace-controls-left)]">
        <SidebarTrigger
          aria-label="Toggle main sidebar"
          className="[:hover,[data-pressed]]:bg-white/15 focus-visible:ring-white/90 focus-visible:ring-offset-transparent [&_svg]:text-white! [&_svg]:opacity-100!"
        />
      </div>
      {/* Upstream's pill mode, honored on top of the art rather than instead
          of it: the art is brand chrome and never leaves, but "Version pill"
          must still produce a pill or the setting lies. `none` produces
          neither pill nor composer art, and `artwork` lights the composer —
          every option stays distinguishable in the fork. White on the art,
          not upstream's secondary-on-plain, for the same reason the toggle
          is. */}
      {pillLabel ? (
        <Badge
          className="relative z-10 ml-1 rounded-full border-0 bg-white/15 px-1.5 text-white/90"
          data-environment-identification="pill"
          size="sm"
          variant="secondary"
        >
          {pillLabel}
        </Badge>
      ) : null}
      <SidebarBrand />
      {/* fork:end fork-sidebar-chrome */}
    </SidebarHeader>
  );
});

function SidebarBrand() {
  return (
    <Link
      aria-label="Go to threads"
      // Always white: the header now always sits on artwork, so upstream's
      // on-backdrop / off-backdrop branch has only one reachable side.
      className="sidebar-brand relative z-10 ml-auto h-7 w-fit min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-md pr-4 text-white outline-hidden ring-ring focus-visible:ring-2"
      to="/"
    >
      {/* fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
          The wordmark + "Code" lockup is replaced by the app's own name as
          plain text, per the design. Upstream's lockup was two pieces because
          the "T3" half was a logo; this fork has no mark of its own, and a
          borrowed T3 glyph next to a different name read as a mismatch rather
          than as branding. Reading APP_BASE_NAME rather than a literal keeps
          the packaged build (which gets the name over the desktop bridge) and
          a dev build showing the same thing. */}
      <span className="truncate text-xs font-medium tracking-tight">{APP_BASE_NAME}</span>
      {/* fork:end fork-app-identity */}
    </Link>
  );
}

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const handleSettingsClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/settings" });
  }, [isMobile, navigate, setOpenMobile]);

  return (
    <SidebarFooter className="p-[var(--sidebar-content-inset)]">
      <SidebarProviderUpdatePill />
      <SidebarUpdatePill />
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton onClick={handleSettingsClick}>
            <SettingsIcon />
            <span>Settings</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
});
