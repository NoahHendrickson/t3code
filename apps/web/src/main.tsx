/* fork:begin fork-side-chat — see .fork/customizations.yaml#fork-side-chat
   First import: it isolates the side chat window's localStorage writes
   before any persisted store loads. */
import "./custom/sideChat/surface";
/* fork:end fork-side-chat */
import React from "react";
import ReactDOM from "react-dom/client";
import { createHashHistory, createBrowserHistory } from "@tanstack/react-router";

import "./index.css";
/* fork:begin fork-marker — see .fork/customizations.yaml#fork-marker */
import "./theme.custom.css";
import "./theme.custom.palettes.css";
import { applyForkMarker } from "./custom/forkMarker";
/* fork:end fork-marker */
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
/* fork:begin fork-touch-affordances — see .fork/customizations.yaml#fork-touch-affordances */
import { installTouchLongPressContextMenu } from "./custom/touchLongPressContextMenu";
/* fork:end fork-touch-affordances */

import { prepareProviderAuthDelivery } from "./providerAuthDelivery";
import { isElectron } from "./env";
import { hasCloudPublicConfig } from "./cloud/publicConfig";
import { getRouter } from "./router";
import {
  syncDocumentElectronPlatformClasses,
  syncDocumentWindowControlsOverlayClass,
} from "./lib/windowControlsOverlay";
import { AppRoot } from "./AppRoot";
import { clearChunkReloadGuard, reloadOnceForChunkLoadError } from "./lib/chunkReloadGuard";

prepareProviderAuthDelivery();

// Electron loads the app from a file-backed shell, so hash history avoids path resolution issues.
const history = isElectron ? createHashHistory() : createBrowserHistory();

const router = getRouter(history);

/* fork:begin fork-marker — see .fork/customizations.yaml#fork-marker */
applyForkMarker(document.documentElement);
/* fork:end fork-marker */
/* fork:begin fork-cool-dark-theme — see .fork/customizations.yaml#fork-cool-dark-theme */
initializeForkTheme();
/* fork:end fork-cool-dark-theme */
/* fork:begin fork-glass-new-agent-stage — see .fork/customizations.yaml#fork-glass-new-agent-stage */
initializeForkGlassNewAgentPicture();
/* fork:end fork-glass-new-agent-stage */
/* fork:begin fork-touch-affordances — see .fork/customizations.yaml#fork-touch-affordances */
installTouchLongPressContextMenu();
/* fork:end fork-touch-affordances */

if (isElectron) {
  syncDocumentElectronPlatformClasses(navigator.platform);
  syncDocumentWindowControlsOverlayClass();
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

// A failed split-chunk fetch usually means the hashed assets went stale under
// a deploy; one guarded reload picks up the fresh index.html.
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

// Loading only the selected runtime as a split chunk keeps every Clerk byte out
// of the startup graph for local-mode users, and keeps the bundled clerk-js out
// of the browser build entirely.
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
    // A route chunk failure still resolves router.load(): the error is parked in
    // the lazy component and surfaces through the route error boundary.
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
