/**
 * Shadow of upstream's `components/chat/DraftHeroHeadline` — see
 * `.fork/customizations.yaml#fork-new-agent-draft`.
 *
 * Upstream weaves the project chooser into its headline as dotted-underline
 * text ("What should we build in <project>?") and, since #13612, an "or start
 * without a project" line under it. The fork's "New agent" flow opens a draft
 * with no project at all, and the chooser is the first chip in the composer's
 * context row (custom/DraftProjectPill, ahead of the workspace and branch
 * chips — ChatView mounts it there), so the headline is just the sentence.
 * A draft already on the no-project home reads upstream's "What should we
 * work on?". This file keeps upstream's prop surface and the `h1`, so
 * ChatView's call site and the mobile view-transition wrapper around it are
 * untouched.
 */
import type { DraftId } from "~/composerDraftStore";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";

import { useScratchProject } from "~/hooks/useScratchProject";
import { useProjects } from "~/state/entities";

interface DraftHeroHeadlineProps {
  readonly draftId: DraftId | null;
  readonly activeProjectRef: ScopedProjectRef | null;
  readonly activeProjectTitle: string | null;
}

export function DraftHeroHeadline({
  activeProjectRef,
  activeProjectTitle,
}: DraftHeroHeadlineProps) {
  const projects = useProjects();
  const { scratchWorkspaceRootFor } = useScratchProject();
  const activeProject =
    activeProjectRef === null
      ? null
      : (projects.find(
          (project) =>
            project.environmentId === activeProjectRef.environmentId &&
            project.id === activeProjectRef.projectId,
        ) ?? null);
  const isScratchDraft =
    activeProject !== null &&
    isScratchProject(activeProject, scratchWorkspaceRootFor(activeProject.environmentId));
  const hasResolvedProject = activeProjectTitle !== null;
  return (
    <h1 className="w-full text-center font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
      {isScratchDraft
        ? "What should we work on?"
        : hasResolvedProject
          ? "What should we build?"
          : "Choose a project to start"}
    </h1>
  );
}
