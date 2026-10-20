/**
 * The side chat window's layout — see `.fork/customizations.yaml#fork-side-chat`.
 *
 * Stands where AppSidebarLayout stands in the main window: a sidebar
 * provider (ChatView reads its context) with no sidebar in it, around the
 * normal chat routes. It also owns "fresh every time": the window's first
 * chat, every reopen (the desktop's fresh signal on hide) and the new-chat
 * shortcuts all start a new "No project" thread. A draft the user typed into
 * and left stays in the store, as upstream keeps any invested draft.
 */
import { useAtomValue } from "@effect/atom-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { SidebarProvider } from "~/components/ui/sidebar";
import { isElectron } from "~/env";
import { useScratchProject } from "~/hooks/useScratchProject";
import { resolveShortcutCommand } from "~/keybindings";
import { isMacPlatform } from "~/lib/utils";
import { isTerminalFocused } from "~/lib/terminalFocus";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { readSideChatBridge } from "./sideChatBridge";

/** AppSidebarLayout's traffic-light inset; the panel's lights sit where the main window's do. */
const MACOS_TRAFFIC_LIGHTS_LEFT_INSET = "calc(var(--desktop-window-controls-inset, 90px) * 8 / 9)";

function useFreshSideChats(): void {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { scratchEnvironmentId, startScratchThread } = useScratchProject();
  const environmentId = scratchEnvironmentId(primaryEnvironmentId);
  // Requests count up; the window's first chat is request 1.
  const [requested, setRequested] = useState(1);
  const handledRef = useRef(0);

  useEffect(() => readSideChatBridge()?.onFresh(() => setRequested((count) => count + 1)), []);

  useEffect(() => {
    // Capture phase, ahead of the chat layout's own shortcut handler, which
    // would otherwise open a New agent draft here.
    const onKeyDown = (event: KeyboardEvent) => {
      const command = resolveShortcutCommand(event, keybindings, {
        context: { terminalFocus: isTerminalFocused() },
      });
      if (
        command !== "chat.new" &&
        command !== "chat.newLocal" &&
        command !== "chat.newWithoutProject"
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setRequested((count) => count + 1);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [keybindings]);

  // Waits for the environment to connect: the first request usually lands
  // before it has.
  useEffect(() => {
    if (environmentId === null || handledRef.current >= requested) return;
    handledRef.current = requested;
    void startScratchThread(environmentId);
  }, [environmentId, requested, startScratchThread]);
}

export function SideChatShell({ children }: { readonly children: ReactNode }) {
  useFreshSideChats();
  const isMacosDesktop = isElectron && isMacPlatform(navigator.platform);
  const style = {
    ...(isMacosDesktop ? { "--workspace-controls-left": MACOS_TRAFFIC_LIGHTS_LEFT_INSET } : {}),
    // No sidebar toggle to clear: the header starts right after the window controls.
    "--workspace-titlebar-content-left": "var(--workspace-controls-left)",
  } as CSSProperties;
  return (
    <SidebarProvider className="h-dvh! min-h-0!" defaultOpen={false} style={style}>
      {children}
    </SidebarProvider>
  );
}
