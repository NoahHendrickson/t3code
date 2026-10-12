/**
 * Shared chrome for the Scheduled page — see
 * `.fork/customizations.yaml#fork-scheduled-page`. One card surface and one
 * section label, so the list, the editor and the run history read as one
 * page. The card is the workspace's own border-on-background; the frost
 * belongs to the menus and selects that open over it, not to the page.
 * It clips so a hovered table row cannot paint square past its corners
 * (every popup inside portals out), and Glass swaps its fill for the
 * stage-card wash through `data-scheduled-card` (theme.custom.palettes.css).
 */
import type { ComponentProps, ReactNode } from "react";
import { useMemo } from "react";

import { resolveEnvironmentMachineKind } from "@t3tools/contracts";

import { EnvironmentMachineIcon } from "~/components/EnvironmentMachineIcon";
import { cn } from "~/lib/utils";
import { useEnvironments, type EnvironmentPresentation } from "~/state/environments";

export function ScheduledCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-scheduled-card=""
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-card/40 dark:bg-card/30",
        className,
      )}
      {...props}
    />
  );
}

export function ScheduledSectionLabel(props: { readonly children: ReactNode }) {
  return <h2 className="text-sm font-medium text-muted-foreground">{props.children}</h2>;
}

function isConnectedEnvironment(environment: EnvironmentPresentation): boolean {
  return environment.connection.phase === "connected" && environment.serverConfig !== null;
}

export function useConnectedEnvironments(): ReadonlyArray<EnvironmentPresentation> {
  const { environments } = useEnvironments();
  return useMemo(() => environments.filter(isConnectedEnvironment), [environments]);
}

export function EnvironmentLabel(props: {
  readonly environment: EnvironmentPresentation;
  readonly className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", props.className)}>
      <EnvironmentMachineIcon
        kind={resolveEnvironmentMachineKind(props.environment.serverConfig)}
        className="size-3.5 shrink-0"
      />
      <span className="truncate">{props.environment.label}</span>
    </span>
  );
}
