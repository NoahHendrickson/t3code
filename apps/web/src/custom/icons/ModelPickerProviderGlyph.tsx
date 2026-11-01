/* The model picker's provider marks, see `.fork/customizations.yaml#fork-model-picker`.
   Claude's is the Claude Code mascot; Codex's art is a one-colour cloud with the prompt cut
   out, so it masks the app icon's gradient over a white patch that fills the cutout. Every
   other provider keeps its instance icon. */
import { ProviderDriverKind } from "@t3tools/contracts";
import type { CSSProperties, JSX } from "react";

import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
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

const FORK_MARK_BY_DRIVER: Partial<Record<ProviderDriverKind, () => JSX.Element>> = {
  [ProviderDriverKind.make("claudeAgent")]: ClaudeCodeMark,
  [ProviderDriverKind.make("codex")]: CodexMark,
};

export function ModelPickerProviderGlyph(props: {
  readonly entry: ProviderInstanceEntry;
  /** Set when several instances share a driver, so the initials tell them apart. */
  readonly showBadge: boolean;
}) {
  const { entry } = props;
  const Mark = FORK_MARK_BY_DRIVER[entry.driverKind];
  const icon = (className: string, iconClassName: string) => (
    <ProviderInstanceIcon
      driverKind={entry.driverKind}
      displayName={entry.displayName}
      accentColor={entry.accentColor}
      acpRegistryAgentId={entry.acpRegistryAgentId}
      acpRegistryIconUrl={entry.acpRegistryIconUrl}
      showBadge={props.showBadge}
      className={className}
      iconClassName={iconClassName}
      indicatorBackground="var(--popover)"
      badgeClassName="right-[-0.25rem] bottom-[-0.25rem] h-3 min-w-3 px-0.5 text-[7px]"
    />
  );
  if (!Mark) return icon("size-4", "size-4");
  // Upstream's icon with its glyph hidden, laid over the mark, draws the badge.
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      <Mark />
      {props.showBadge ? icon("absolute inset-0", "hidden") : null}
    </span>
  );
}
