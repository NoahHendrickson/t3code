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
import sidebarBrandMarkUrl from "~/custom/assets/sidebar-brand-mark.png";
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
     header's drawn spacing, inline toggle, pill, and trailing fork brand. */
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <SidebarHeader
      className={cn(
        // The controls own their drawn edge insets: native traffic lights occupy
        // the first 52px on macOS, while the brand ends 16px from the far edge.
        "@container/sidebar-header relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-0 py-0",
        isElectron && "drag-region",
      )}
    >
      {/* The toggle sits inline here rather than floating over the workspace, so
          it reads as belonging to the panel it collapses. The mobile-only
          visibility class is gone with it: that existed because the desktop
          toggle lived in AppSidebarLayout's fixed SidebarControl, which now
          renders only while the panel is shut.

          The left inset clears native traffic lights on macOS and places the
          20px glyph at the design's x=84. Everywhere else it reduces to the
          safe-area gutter. */}
      <div className="flex items-center pl-[var(--workspace-controls-left)]">
        <SidebarTrigger
          aria-label="Toggle main sidebar"
          className="[:hover,[data-pressed]]:bg-white/10 focus-visible:ring-white/90 focus-visible:ring-offset-transparent [&_svg]:size-5! [&_svg]:text-white/65! [&_svg]:opacity-100!"
        />
      </div>
      {/* Preserve the existing identification setting without changing the
          default header: only the explicit pill mode adds this badge. */}
      {pillLabel ? (
        <Badge
          className="ml-1 rounded-full border-0 bg-white/10 px-1.5 text-white/90"
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
      className="sidebar-brand ml-auto h-6 w-fit min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-md pr-4 text-white outline-hidden ring-ring focus-visible:ring-2"
      to="/"
    >
      {/* fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
          The borrowed T3 wordmark stays gone. The fork's own exported mark and
          APP_BASE_NAME form the exact 24px / 4px / 14px lockup from the design,
          while the injected desktop name and bridge-less fallback still agree. */}
      <img
        alt=""
        className="size-6 shrink-0 [image-rendering:pixelated]"
        src={sidebarBrandMarkUrl}
      />
      <span className="truncate text-[0.875rem] leading-4 font-medium">{APP_BASE_NAME}</span>
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
