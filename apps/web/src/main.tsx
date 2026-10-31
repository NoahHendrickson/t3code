/* fork:begin fork-side-chat — see .fork/customizations.yaml#fork-side-chat
   First import: it isolates the side chat window's localStorage writes
   before any persisted store loads. */
import "./custom/sideChat/surface";
/* fork:end fork-side-chat */
import React from "react";
import ReactDOM from "react-dom/client";

import "@fontsource-variable/inter";
import "./index.css";
/* fork:begin fork-marker — see .fork/customizations.yaml#fork-marker */
import "./theme.custom.css";
import "./theme.custom.palettes.css";
import { applyForkMarker } from "./custom/forkMarker";
/* fork:end fork-marker */
/* fork:begin fork-cool-darker-theme — see .fork/customizations.yaml#fork-cool-darker-theme
   After the palettes sheet, so its glass ties with palettes rules on order. */
import "./theme.custom.glass-surfaces.css";
/* fork:end fork-cool-darker-theme */
/* fork:begin fork-glass-stage-card — see .fork/customizations.yaml#fork-glass-stage-card
   After the palettes sheet, so its gutter wins ties against the stage ramp. */
import "./theme.custom.glass-stage.css";
/* fork:end fork-glass-stage-card */
/* fork:begin fork-cool-dark-theme — see .fork/customizations.yaml#fork-cool-dark-theme */
import { initializeForkTheme } from "./custom/forkTheme";
/* fork:end fork-cool-dark-theme */
/* fork:begin fork-glass-new-agent-stage — see .fork/customizations.yaml#fork-glass-new-agent-stage */
import { initializeForkGlassNewAgentPicture } from "./custom/forkGlassNewAgentPicture";
/* fork:end fork-glass-new-agent-stage */
/* fork:begin fork-glass-3d — see .fork/customizations.yaml#fork-glass-3d */
import { initializeForkGlass3d } from "./custom/forkGlass3d";
/* fork:end fork-glass-3d */
/* fork:begin fork-touch-affordances — see .fork/customizations.yaml#fork-touch-affordances */
import { installTouchLongPressContextMenu } from "./custom/touchLongPressContextMenu";
/* fork:end fork-touch-affordances */

import { hasCloudPublicConfig } from "./cloud/publicConfig";
import { isElectron } from "./env";
import { startAppServices } from "./appInit";
import { AppRoot } from "./AppRoot";
import { clearChunkReloadGuard, reloadOnceForChunkLoadError } from "./lib/chunkReloadGuard";

const router = startAppServices();

/* fork:begin fork-marker — see .fork/customizations.yaml#fork-marker */
applyForkMarker(document.documentElement);
/* fork:end fork-marker */
/* fork:begin fork-cool-dark-theme — see .fork/customizations.yaml#fork-cool-dark-theme */
initializeForkTheme();
/* fork:end fork-cool-dark-theme */
/* fork:begin fork-glass-new-agent-stage — see .fork/customizations.yaml#fork-glass-new-agent-stage */
initializeForkGlassNewAgentPicture();
/* fork:end fork-glass-new-agent-stage */
/* fork:begin fork-glass-3d — see .fork/customizations.yaml#fork-glass-3d */
initializeForkGlass3d();
/* fork:end fork-glass-3d */
/* fork:begin fork-touch-affordances — see .fork/customizations.yaml#fork-touch-affordances */
installTouchLongPressContextMenu();
/* fork:end fork-touch-affordances */

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

let chunkLoadFailed = false;
let reloadScheduled = false;
window.addEventListener("vite:preloadError", (event) => {
  chunkLoadFailed = true;
  if (reloadOnceForChunkLoadError()) {
    reloadScheduled = true;
    event.preventDefault();
  }
});

const app = <AppRoot router={router} />;

// Split by runtime to keep Clerk out of local startup and clerk-js out of browser builds.
const managedAuthShellModule =
  clerkPublishableKey && hasCloudPublicConfig()
    ? isElectron
      ? import("./components/clerk/ElectronManagedAuthShell")
      : import("./components/clerk/BrowserManagedAuthShell")
    : null;

export const startup = Promise.all([
  managedAuthShellModule?.then((module) => module.default) ?? null,
  router.load(),
])
  .then(([ManagedAuthShell]) => {
    // Route chunk failures resolve router.load() and surface later through the error boundary.
    if (reloadScheduled) return;
    if (!chunkLoadFailed) clearChunkReloadGuard();
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        {ManagedAuthShell && clerkPublishableKey ? (
          <ManagedAuthShell publishableKey={clerkPublishableKey}>{app}</ManagedAuthShell>
        ) : (
          app
        )}
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    if (reloadScheduled) return;
    throw error;
  });
