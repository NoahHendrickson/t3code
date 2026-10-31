/* The model picker's provider marks, see `.fork/customizations.yaml#fork-model-picker`.
   Claude's is the Claude Code mascot; Codex's art is a one-colour cloud with the prompt cut
   out, so it masks the app icon's gradient over a white patch that fills the cutout. Every
   other provider keeps its instance icon. */
import {
  normalizeProviderAccentColor,
  providerAccentForegroundColor,
  providerInstanceInitials,
} from "@t3tools/client-runtime/state/provider-instance-display";
import type { CSSProperties } from "react";

import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
import { cn } from "~/lib/utils";
import type { ProviderInstanceEntry } from "~/providerInstances";
import codexMarkUrl from "../assets/codex-mark.png";

const CODEX_MARK_STYLE: CSSProperties = {
  maskImage: `url(${codexMarkUrl})`,
  maskSize: "contain",
  maskRepeat: "no-repeat",
  maskPosition: "center",
  backgroundImage: "linear-gradient(#ada8ff, #7b9dff, #3b43ff)",
};

function ClaudeCodeMark() {
  return (
    <svg viewBox="0 0 256 161" className="w-4 shrink-0" fill="#D97757" aria-hidden>
      <path d="M223.979 63.79H256v33.087h-32v32.299h-15.861v31.157H192v-31.157h-15.861v31.157H160v-31.157H96v31.157H79.872v-31.157H64v31.157H47.861v-31.157H32v-32.31H0V63.8h32V.333h191.979zM64 63.79h15.872V33.42H64zm112.107 0H192V33.42h-15.893z" />
    </svg>
  );
}

function CodexMark() {
  return (
    <span className="relative size-4 shrink-0" aria-hidden>
      {/* Inset a quarter, so it stays inside the cloud and shows only through the prompt. */}
      <span className="absolute inset-1 bg-white" />
      <span className="absolute inset-0" style={CODEX_MARK_STYLE} />
    </span>
  );
}

export function ModelPickerProviderGlyph(props: {
  readonly entry: ProviderInstanceEntry;
  /** Set when several instances share a driver, so the initials tell them apart. */
  readonly showBadge: boolean;
}) {
  const { entry } = props;
  const mark =
    entry.driverKind === "claudeAgent" ? (
      <ClaudeCodeMark />
    ) : entry.driverKind === "codex" ? (
      <CodexMark />
    ) : null;

  if (!mark) {
    return (
      <ProviderInstanceIcon
        driverKind={entry.driverKind}
        displayName={entry.displayName}
        accentColor={entry.accentColor}
        acpRegistryAgentId={entry.acpRegistryAgentId}
        acpRegistryIconUrl={entry.acpRegistryIconUrl}
        showBadge={props.showBadge}
        className="size-4"
        iconClassName="size-4"
        indicatorBackground="var(--popover)"
        badgeClassName="right-[-0.25rem] bottom-[-0.25rem] h-3 min-w-3 px-0.5 text-[7px]"
      />
    );
  }

  // The same corner badge ProviderInstanceIcon draws for the other providers.
  const accentColor = normalizeProviderAccentColor(entry.accentColor);
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      {mark}
      {props.showBadge ? (
        <span
          className={cn(
            "pointer-events-none absolute right-[-0.25rem] bottom-[-0.25rem] flex h-3 min-w-3 items-center justify-center rounded-full border border-(--popover) px-0.5 text-[7px] font-semibold leading-none shadow-sm",
            accentColor
              ? "bg-(--provider-accent) text-(--provider-accent-foreground)"
              : "bg-card text-muted-foreground",
          )}
          style={
            accentColor
              ? ({
                  "--provider-accent": accentColor,
                  "--provider-accent-foreground": providerAccentForegroundColor(accentColor),
                } as CSSProperties)
              : undefined
          }
          aria-hidden
        >
          {providerInstanceInitials(entry.displayName)}
        </span>
      ) : null}
    </span>
  );
}
