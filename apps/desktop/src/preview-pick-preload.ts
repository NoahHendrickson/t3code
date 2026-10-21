import { ipcRenderer } from "electron";

import { PASSKEY_BRIDGE_ARGUMENT } from "./preview/GuestProtocol.ts";
import { installPasskeyBridge } from "./preview/PasskeyBridge.ts";
import "./preview/PickPreload.ts";
/* fork:begin fork-design-mode — see .fork/customizations.yaml#fork-design-mode */
import "./preview/DesignSourceResolver.ts";
/* fork:end fork-design-mode */

// Electron hands webPreferences.additionalArguments to sandboxed preloads in process.argv.
if (process.argv.includes(PASSKEY_BRIDGE_ARGUMENT)) {
  installPasskeyBridge((channel, publicKey) => ipcRenderer.invoke(channel, publicKey));
}
