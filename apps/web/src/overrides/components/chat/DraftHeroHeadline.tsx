/**
 * Shadow of upstream's `components/chat/DraftHeroHeadline` — see
 * `.fork/customizations.yaml#fork-new-agent-draft`.
 *
 * Upstream weaves the project chooser into its headline as dotted-underline
 * text ("What should we build in <project>?"). The fork's "New agent" flow
 * opens a draft with no project at all, and the chooser becomes the first
 * thing the user does in the column — so it is a pill under the headline,
 * with the project's favicon, rather than a word inside a sentence.
 * `custom/DraftProjectPill` owns the control; this file only keeps upstream's
 * prop surface and the `h1`, so ChatView's call site and the mobile
 * view-transition wrapper around it are untouched.
 */
import type { DraftId } from "~/composerDraftStore";
import type { ScopedProjectRef } from "@t3tools/contracts";

import { DraftProjectPill } from "~/custom/DraftProjectPill";

interface DraftHeroHeadlineProps {
  readonly draftId: DraftId | null;
  readonly activeProjectRef: ScopedProjectRef | null;
  readonly activeProjectTitle: string | null;
}

export function DraftHeroHeadline({
  draftId,
  activeProjectRef,
  activeProjectTitle,
}: DraftHeroHeadlineProps) {
  const hasResolvedProject = activeProjectTitle !== null;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4">
      <h1 className="text-center font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
        {hasResolvedProject ? "What should we build?" : "Choose a project to start"}
      </h1>
      <DraftProjectPill
        draftId={draftId}
        activeProjectRef={activeProjectRef}
        activeProjectTitle={activeProjectTitle}
      />
    </div>
  );
}
