import type { ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { writeLocalStorageValue } from "~/hooks/useLocalStorage";

export const COLLAPSED_TABS_PROJECT_STORAGE_KEY = "t3code:fork:collapsed-thread-tabs-project:v1";
export const COLLAPSED_TABS_ALL_PROJECTS = "all";

/** Collapsing hands the sidebar's project scope to the tabs' switcher: its one project, else All. */
export function handSidebarProjectScopeToTabs(scope: ReadonlySet<string>): void {
  const [only] = scope;
  writeLocalStorageValue(
    COLLAPSED_TABS_PROJECT_STORAGE_KEY,
    scope.size === 1 && only !== undefined ? only : COLLAPSED_TABS_ALL_PROJECTS,
    COLLAPSED_TABS_ALL_PROJECTS,
    Schema.String,
  );
}

/** Sidebar actions reached from outside it (fork-collapsed-thread-tabs), so both run the
    sidebar's own code. The collapsed sidebar stays mounted offcanvas, so they stay live. */
type OpenThreadMenu = (threadRef: ScopedThreadRef, position: { x: number; y: number }) => void;
type StartThreadInProject = (projectKey: string) => void;

let registeredOpenThreadMenu: OpenThreadMenu | null = null;
let registeredStartThreadInProject: StartThreadInProject | null = null;

export function registerSidebarThreadMenu(handler: OpenThreadMenu): () => void {
  registeredOpenThreadMenu = handler;
  return () => {
    if (registeredOpenThreadMenu === handler) registeredOpenThreadMenu = null;
  };
}

export function openSidebarThreadMenu(
  threadRef: ScopedThreadRef,
  position: { x: number; y: number },
): void {
  registeredOpenThreadMenu?.(threadRef, position);
}

export function registerSidebarStartThreadInProject(handler: StartThreadInProject): () => void {
  registeredStartThreadInProject = handler;
  return () => {
    if (registeredStartThreadInProject === handler) registeredStartThreadInProject = null;
  };
}

/** False when no sidebar is mounted to start it. */
export function startSidebarThreadInProject(projectKey: string): boolean {
  if (!registeredStartThreadInProject) return false;
  registeredStartThreadInProject(projectKey);
  return true;
}
