/** The collapsed tabs' project filter (fork-collapsed-thread-tabs), persisted per device. */
import * as Schema from "effect/Schema";

import { useLocalStorage, writeLocalStorageValue } from "~/hooks/useLocalStorage";
import { ALL_PROJECTS } from "./collapsedThreadTabsModel";

const STORAGE_KEY = "t3code:fork:collapsed-thread-tabs-project:v1";

export function useCollapsedTabsProjectFilter() {
  return useLocalStorage(STORAGE_KEY, ALL_PROJECTS, Schema.String);
}

/** Collapsing hands the sidebar's project scope (collapsedTabProjectForScope) to the tabs. */
export function handSidebarProjectScopeToTabs(projectKey: string | null): void {
  if (projectKey === null) return;
  writeLocalStorageValue(STORAGE_KEY, projectKey, ALL_PROJECTS, Schema.String);
}
