/**
 * Shadow of upstream's `components/chat/DraftHeroHeadline` — see
 * `.fork/customizations.yaml#fork-new-agent-draft`.
 *
 * Upstream weaves the project chooser into its headline as dotted-underline
 * text ("What should we build in <project>?"). The fork's "New agent" flow
 * opens a draft with no project at all, and the chooser is the first chip in
 * the composer's context row (custom/DraftProjectPill, ahead of the
 * workspace and branch chips — ChatView mounts it there), so the headline is
 * just the sentence. This file keeps upstream's prop surface and the `h1`,
 * so ChatView's call site and the mobile view-transition wrapper around it
 * are untouched.
 */
import type { DraftId } from "~/composerDraftStore";
import type { ScopedProjectRef } from "@t3tools/contracts";

interface DraftHeroHeadlineProps {
  readonly draftId: DraftId | null;
  readonly activeProjectRef: ScopedProjectRef | null;
  readonly activeProjectTitle: string | null;
}

export function DraftHeroHeadline({ activeProjectTitle }: DraftHeroHeadlineProps) {
  const hasResolvedProject = activeProjectTitle !== null;
  return (
    <h1 className="w-full text-center font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
      {hasResolvedProject ? "What should we build?" : "Choose a project to start"}
    </h1>
  );
}
