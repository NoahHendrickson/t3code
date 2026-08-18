import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import { passkeys } from "@clerk/electron/passkeys";
import { ClerkProvider as ElectronClerkProvider } from "@clerk/electron/react";
import { createHashHistory, createBrowserHistory } from "@tanstack/react-router";

import "./index.css";
/* fork:begin fork-marker — see .fork/customizations.yaml#fork-marker */
import "./theme.custom.css";
import "./theme.custom.palettes.css";
import { applyForkMarker } from "./custom/forkMarker";
/* fork:end fork-marker */
/* fork:begin fork-cool-dark-theme — see .fork/customizations.yaml#fork-cool-dark-theme */
import { initializeForkTheme } from "./custom/forkTheme";
/* fork:end fork-cool-dark-theme */

import { isElectron } from "./env";
import { ManagedRelayAuthProvider } from "./cloud/managedAuth";
import { hasCloudPublicConfig } from "./cloud/publicConfig";
import { getRouter } from "./router";
import {
  syncDocumentElectronPlatformClasses,
  syncDocumentWindowControlsOverlayClass,
} from "./lib/windowControlsOverlay";
import { AppRoot } from "./AppRoot";
import { clerkAppearance } from "./components/clerk/clerkAppearance";

// Electron loads the app from a file-backed shell, so hash history avoids path resolution issues.
const history = isElectron ? createHashHistory() : createBrowserHistory();

const router = getRouter(history);

/* fork:begin fork-marker — see .fork/customizations.yaml#fork-marker */
applyForkMarker(document.documentElement);
/* fork:end fork-marker */
/* fork:begin fork-cool-dark-theme — see .fork/customizations.yaml#fork-cool-dark-theme */
initializeForkTheme();
/* fork:end fork-cool-dark-theme */

if (isElectron) {
  syncDocumentElectronPlatformClasses(navigator.platform);
  syncDocumentWindowControlsOverlayClass();
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const app = <AppRoot router={router} />;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {clerkPublishableKey && hasCloudPublicConfig() ? (
      isElectron ? (
        <ElectronClerkProvider
          appearance={clerkAppearance}
          publishableKey={clerkPublishableKey}
          passkeys={passkeys}
        >
          <ManagedRelayAuthProvider>{app}</ManagedRelayAuthProvider>
        </ElectronClerkProvider>
      ) : (
        <ClerkProvider appearance={clerkAppearance} publishableKey={clerkPublishableKey}>
          <ManagedRelayAuthProvider>{app}</ManagedRelayAuthProvider>
        </ClerkProvider>
      )
    ) : (
      app
    )}
  </React.StrictMode>,
);
