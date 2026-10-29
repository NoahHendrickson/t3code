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
 * work on?", except in the desktop side chat (fork-side-chat), which is for
 * quick questions and asks "Got a question?". This file keeps upstream's prop
 * surface and the `h1`, so ChatView's call site and the mobile
 * view-transition wrapper around it are untouched.
 */
import type { DraftId } from "~/composerDraftStore";
import { useComposerDraftStore } from "~/composerDraftStore";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";

import { isSideChatSurface } from "~/custom/sideChat/surface";
import { useScratchProject } from "~/hooks/useScratchProject";
import { isTriagePrompt } from "~/hooks/useStartTriage";
import { useProjects } from "~/state/entities";
import { useEnvironments } from "~/state/environments";
import { TriageDraftHero } from "./TriageDraftHero";

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
  const projects = useProjects();
  const { environments } = useEnvironments();
  const { scratchWorkspaceRootFor } = useScratchProject();
  // A boolean, so typing in a draft does not re-render the hero.
  const isTriageDraftPrompt = useComposerDraftStore((store) =>
    draftId ? isTriagePrompt(store.getComposerDraft(draftId)?.prompt ?? "") : false,
  );
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
  if (isScratchDraft && isTriageDraftPrompt) {
    const environment = environments.find(
      (entry) => entry.environmentId === activeProject.environmentId,
    );
    return (
      <TriageDraftHero
        machineLabel={environment?.label ?? null}
        serverVersion={environment?.serverConfig?.environment.serverVersion ?? null}
      />
    );
  }
  return (
    <h1 className="w-full text-center font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
      {isScratchDraft
        ? isSideChatSurface
          ? "Got a question?"
          : "What should we work on?"
        : hasResolvedProject
          ? "What should we build?"
          : "Choose a project to start"}
    </h1>
  );
}
