/** The collapsed tabs' project filter (fork-collapsed-thread-tabs), persisted per device. */
import * as Schema from "effect/Schema";

import { useLocalStorage, writeLocalStorageValue } from "~/hooks/useLocalStorage";
import { ALL_PROJECTS, collapsedTabProjectForScope } from "./collapsedThreadTabsModel";

const STORAGE_KEY = "t3code:fork:collapsed-thread-tabs-project:v1";

export function useCollapsedTabsProjectFilter() {
  return useLocalStorage(STORAGE_KEY, ALL_PROJECTS, Schema.String);
}

/** Collapsing hands the sidebar's project scope to the tabs' filter. */
export function handSidebarProjectScopeToTabs(scope: ReadonlySet<string>): void {
  writeLocalStorageValue(
    STORAGE_KEY,
    collapsedTabProjectForScope(scope),
    ALL_PROJECTS,
    Schema.String,
  );
}
