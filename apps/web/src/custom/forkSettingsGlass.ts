/**
 * Settings on Glass — see `.fork/customizations.yaml#fork-settings-glass`.
 *
 * Settings' selects and menus portal to the body, out of reach of any marker
 * on the page, so the open page stamps the root instead. A root attribute
 * rather than a `:root:has()` query, which would put every DOM change in the
 * app on the style-invalidation path.
 */
import { useLayoutEffect } from "react";

export const FORK_SETTINGS_ATTRIBUTE = "data-fork-settings";

export function useForkSettingsMarker(): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute(FORK_SETTINGS_ATTRIBUTE, "");
    return () => root.removeAttribute(FORK_SETTINGS_ATTRIBUTE);
  }, []);
}
