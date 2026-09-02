import type { RuntimeMode } from "@t3tools/contracts";
import { memo, type ComponentProps, type CSSProperties, type ReactNode } from "react";

import { ComposerSelectControl } from "../components/chat/ComposerControl";
import { cn } from "~/lib/utils";

import "./ComposerShell.css";

type ComposerShellVisibilityInput = {
  approvalPending: boolean;
  collapsedMobile: boolean;
  mobilePendingActionsVisible: boolean;
};

export function resolveComposerShellVisibility({
  approvalPending,
  collapsedMobile,
  mobilePendingActionsVisible,
}: ComposerShellVisibilityInput) {
  return {
    showInlinePrimaryAction: !approvalPending && !mobilePendingActionsVisible,
    showInteractiveControls: !approvalPending && !collapsedMobile,
  };
}

type ComposerShellProps = ComposerShellVisibilityInput & {
  children?: ReactNode;
  context?: ReactNode;
  modeControls: ReactNode;
  modelControls: ReactNode;
  readoutControls: ReactNode;
};

/** Owns the fork's context → vessel(surface + controls) composition and state gates. */
export const ComposerShell = memo(function ComposerShell({
  approvalPending,
  children,
  collapsedMobile,
  context,
  mobilePendingActionsVisible,
  modeControls,
  modelControls,
  readoutControls,
}: ComposerShellProps) {
  const { showInteractiveControls } = resolveComposerShellVisibility({
    approvalPending,
    collapsedMobile,
    mobilePendingActionsVisible,
  });
  const left = showInteractiveControls ? modeControls : null;
  const right =
    readoutControls || (showInteractiveControls && modelControls) ? (
      <>
        {readoutControls}
        {showInteractiveControls ? (
          <div data-fork-composer-model-controls="true" className="flex min-w-0 items-center">
            {modelControls}
          </div>
        ) : null}
      </>
    ) : null;

  return (
    <>
      {context ? (
        <div data-fork-composer-context-row="true" className="flex min-w-0 items-center pb-2">
          {context}
        </div>
      ) : null}
      {/* No vessel paint while collapsed: the mobile pill rounds to 12px and
          the vessel's 8px corners would peek out as background wedges (and a
          live readout row would slab onto the pill). */}
      <div
        {...(collapsedMobile ? {} : { "data-fork-composer-vessel": "true" })}
        className="flex min-w-0 flex-col"
      >
        {children}
        {left || right ? (
          <div
            data-fork-composer-control-row="true"
            className="flex min-w-0 items-center justify-between gap-2 p-2"
          >
            <div
              data-fork-composer-control-row-slot="left"
              className="-m-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {left}
            </div>
            {right ? (
              <div
                data-fork-composer-control-row-slot="right"
                className="flex min-w-0 shrink-0 items-center justify-end"
              >
                {right}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
});

type ComposerPromptRowProps = Pick<
  ComposerShellVisibilityInput,
  "approvalPending" | "mobilePendingActionsVisible"
> & {
  action: ReactNode;
  children?: ReactNode;
};

/** Keeps the prompt and its single primary-action cluster in the drawn base row. */
export const ComposerPromptRow = memo(function ComposerPromptRow({
  action,
  approvalPending,
  children,
  mobilePendingActionsVisible,
}: ComposerPromptRowProps) {
  const { showInlinePrimaryAction } = resolveComposerShellVisibility({
    approvalPending,
    collapsedMobile: false,
    mobilePendingActionsVisible,
  });

  return (
    <div className="flex min-w-0 items-end gap-6">
      <div data-fork-composer-prompt="true" className="relative min-w-0 flex-1">
        {children}
      </div>
      {showInlinePrimaryAction ? (
        <div
          data-chat-composer-inline-actions="true"
          className="flex shrink-0 items-center self-end"
        >
          {action}
        </div>
      ) : null}
    </div>
  );
});

type RuntimeModeChipStyle = CSSProperties & {
  "--fork-mode-bg": string;
  "--fork-mode-bg-hover": string;
  "--fork-mode-fg": string;
  "--fork-mode-fg-dark": string;
};

const runtimeModeChipStyles = {
  auto: {
    "--fork-mode-bg": "rgb(18 255 89 / 16%)",
    "--fork-mode-bg-hover": "rgb(18 255 89 / 24%)",
    "--fork-mode-fg": "var(--color-emerald-700)",
    "--fork-mode-fg-dark": "#00ff88",
  },
  "full-access": {
    "--fork-mode-bg": "rgb(255 205 89 / 16%)",
    "--fork-mode-bg-hover": "rgb(255 205 89 / 24%)",
    "--fork-mode-fg": "var(--color-amber-700)",
    "--fork-mode-fg-dark": "#ffcd59",
  },
  "auto-accept-edits": {
    "--fork-mode-bg": "rgb(192 132 252 / 16%)",
    "--fork-mode-bg-hover": "rgb(192 132 252 / 24%)",
    "--fork-mode-fg": "var(--color-violet-700)",
    "--fork-mode-fg-dark": "#c084fc",
  },
  "approval-required": {
    "--fork-mode-bg": "rgb(255 107 96 / 16%)",
    "--fork-mode-bg-hover": "rgb(255 107 96 / 24%)",
    "--fork-mode-fg": "var(--color-red-700)",
    "--fork-mode-fg-dark": "#ff6b60",
  },
} satisfies Record<RuntimeMode, RuntimeModeChipStyle>;

export function getRuntimeModeChipStyle(runtimeMode: RuntimeMode): RuntimeModeChipStyle {
  return runtimeModeChipStyles[runtimeMode];
}

type ComposerRuntimeModeTriggerProps = Omit<
  ComponentProps<typeof ComposerSelectControl>,
  "style"
> & {
  runtimeMode: RuntimeMode;
  style?: CSSProperties;
};

/** The runtime select trigger with its mode-specific accent tokens. */
export function ComposerRuntimeModeTrigger({
  className,
  runtimeMode,
  style,
  ...props
}: ComposerRuntimeModeTriggerProps) {
  return (
    <ComposerSelectControl
      {...props}
      data-fork-composer-mode-chip="true"
      className={cn("font-medium", className)}
      style={{ ...getRuntimeModeChipStyle(runtimeMode), ...style }}
    />
  );
}
