import { DESIGN_MODE_CONSOLE_PREFIX, type DesignModeEngineMessage } from "../protocol";

/** Guest → host transport: one console line per message. The host filters the webview's
 * `console-message` events by the prefix; ordinary page logging passes through untouched.
 * Volume is a handful of lines per session (boot, state flips, sends), never per-frame. */
export function emitToHost(message: DesignModeEngineMessage): void {
  console.log(DESIGN_MODE_CONSOLE_PREFIX + JSON.stringify(message));
}
