import {
  ArrowLeftIcon,
  ChartNoAxesColumnIcon,
  GitPullRequestIcon,
  SettingsIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { memo, useCallback } from "react";
import { Link, useCanGoBack, useLocation, useNavigate } from "@tanstack/react-router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { useEnvironments } from "../../state/environments";
import {
  resolveEnvironmentIdentificationPillLabel,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
/* fork:begin fork-sidebar-chrome — see .fork/customizations.yaml#fork-sidebar-chrome */
import { SidebarBrandWordmark } from "~/custom/SidebarBrandWordmark";
import { SidebarBrandMark } from "~/custom/SidebarBrandMark";
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
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";

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
          className="[:hover,[data-pressed]]:bg-sidebar-row-hover focus-visible:ring-ring focus-visible:ring-offset-sidebar [&_svg]:size-5! [&_svg]:text-sidebar-muted-foreground/80! [&_svg]:opacity-100!"
        />
      </div>
      {/* Preserve the existing identification setting without changing the
          default header: only the explicit pill mode adds this badge. */}
      {pillLabel ? (
        <Badge
          className="ml-1 hidden rounded-full border-0 bg-sidebar-control-surface px-1.5 text-sidebar-foreground @[15rem]/sidebar-header:inline-flex"
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
    /* The link carries its own display gate (hidden below md, flex row above)
       since upstream 9885a845c deleted the .sidebar-brand stylesheet rule that
       used to supply it. The lockup is a fixed 16px mark + 4px + 8px wordmark,
       both shrink-0; the link may still shrink so a 208px sidebar cannot
       overflow the header. */
    <Link
      aria-label="Go to threads"
      className="sidebar-brand ml-auto hidden h-4 w-fit min-w-0 items-center gap-1 overflow-hidden rounded-md pr-4 text-sidebar-foreground outline-hidden ring-ring focus-visible:ring-2 md:flex"
      to="/"
    >
      {/* fork:begin fork-app-identity — see .fork/customizations.yaml#fork-app-identity
          The borrowed T3 wordmark stays gone. Figma t3-fork 364:11245 is a 16px
          pixel mark, a 4px gap, then the 13×3 "no3y" wordmark at 8px / 40%
          foreground — not live APP_BASE_NAME type. The mark stays the 23-cell
          vector: a bitmap cannot resample that grid into 16px without smearing
          every cell. Inline so palettes can recolour its arms (Westworld). */}
      <SidebarBrandMark className="size-4 shrink-0" />
      <SidebarBrandWordmark />
      {/* fork:end fork-app-identity */}
    </Link>
  );
}

function SidebarUtilityItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <SidebarMenuItem className="shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton aria-label={label} onClick={onClick} size="icon">
              {icon}
            </SidebarMenuButton>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

export const SidebarUtilityMenu = memo(function SidebarUtilityMenu({
  /* fork:begin fork-sidebar-chrome — see .fork/customizations.yaml#fork-sidebar-chrome
     The V2 sidebar carries Usage as a labeled row in its chrome, so its footer
     drops the icon rather than offering the same door twice. The legacy
     sidebar has no such row and keeps it. */
  hideUsage = false,
}: {
  hideUsage?: boolean;
  /* fork:end fork-sidebar-chrome */
} = {}) {
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const { isMobile, setOpenMobile } = useSidebar();
  const currentFooterPage = useLocation({
    select: (location) =>
      /^\/settings(?:\/|$)/.test(location.pathname)
        ? "settings"
        : /^\/projects\/[^/]+\/?$/.test(location.pathname)
          ? "project-settings"
          : location.pathname === "/usage"
            ? "usage"
            : location.pathname === "/pull-requests"
              ? "pull-requests"
              : null,
  });
  const { environments } = useEnvironments();
  // The page reads every connected server, so one of them offering pull requests is enough for
  // the link to lead somewhere.
  const pullRequestsSupported = environments.some(
    (environment) => environment.serverConfig?.environment.capabilities.pullRequests === true,
  );
  const closeMobileSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);
  const handlePullRequestsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({
      to: "/pull-requests",
      search: readPullRequestListPreferences(),
    });
  }, [closeMobileSidebar, navigate]);
  const handleSettingsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/settings" });
  }, [closeMobileSidebar, navigate]);

  const handleUsageClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/usage" });
  }, [isMobile, navigate, setOpenMobile]);

  const handleBackClick = useCallback(() => {
    closeMobileSidebar();
    if (canGoBack) {
      window.history.back();
      return;
    }
    void navigate({ to: "/" });
  }, [canGoBack, closeMobileSidebar, navigate]);

  return (
    <SidebarMenu className="flex-row items-center">
      {currentFooterPage ? (
        <SidebarMenuItem className="min-w-0 flex-1">
          <SidebarMenuButton onClick={handleBackClick}>
            <ArrowLeftIcon />
            <span>Back</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : (
        <>
          <SidebarUtilityItem
            icon={<SettingsIcon />}
            label="Settings"
            onClick={handleSettingsClick}
          />
          {pullRequestsSupported ? (
            <SidebarUtilityItem
              icon={<GitPullRequestIcon />}
              label="Pull Requests"
              onClick={handlePullRequestsClick}
            />
          ) : null}
          {/* fork:begin fork-sidebar-chrome — see .fork/customizations.yaml#fork-sidebar-chrome */}
          {hideUsage ? null : (
            <SidebarUtilityItem
              icon={<ChartNoAxesColumnIcon />}
              label="Usage"
              onClick={handleUsageClick}
            />
          )}
          {/* fork:end fork-sidebar-chrome */}
        </>
      )}
      <SidebarUpdatePill />
    </SidebarMenu>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter({
  /* fork:begin fork-sidebar-chrome — see .fork/customizations.yaml#fork-sidebar-chrome */
  hideUsage = false,
}: {
  hideUsage?: boolean;
  /* fork:end fork-sidebar-chrome */
} = {}) {
  return (
    <SidebarFooter className="p-[var(--sidebar-content-inset)]">
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      {/* fork:begin fork-sidebar-chrome — see .fork/customizations.yaml#fork-sidebar-chrome */}
      <SidebarUtilityMenu hideUsage={hideUsage} />
      {/* fork:end fork-sidebar-chrome */}
    </SidebarFooter>
  );
});
