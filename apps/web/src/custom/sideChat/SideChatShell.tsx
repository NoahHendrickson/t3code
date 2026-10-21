/**
 * The side chat window's layout — see `.fork/customizations.yaml#fork-side-chat`.
 *
 * Stands where AppSidebarLayout stands in the main window: a sidebar
 * provider (ChatView reads its context) with no sidebar in it, around the
 * normal chat routes. It also owns "fresh every time". The window opens on
 * `/`, where it starts a "No project" draft itself; the index route's own
 * landing, which drafts in the most recent project, never mounts here. When
 * the desktop hides the window, a draft stays as it is (empty is already
 * fresh, and typed text is kept for the next open); any other chat reloads
 * the window back to `/`, which also drops the storage copies surface.ts
 * keeps. ⌘N starts another draft in place.
 */
import { useAtomValue } from "@effect/atom-react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { isCommandPaletteOpen } from "~/commandPaletteBus";
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

/** Reloads the window at `/`: the surface flag stays, the chat route goes. */
function reloadToFreshChat(): void {
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  window.location.reload();
}

function useFreshSideChats(pathname: string): void {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { scratchEnvironmentId, startScratchThread } = useScratchProject();
  const environmentId = scratchEnvironmentId(primaryEnvironmentId);
  const router = useRouter();
  const startedRef = useRef(false);

  useEffect(
    () =>
      readSideChatBridge()?.onFresh(() => {
        if (!router.state.location.pathname.startsWith("/draft/")) reloadToFreshChat();
      }),
    [router],
  );

  // The first chat waits for the environment to connect.
  useEffect(() => {
    if (startedRef.current || environmentId === null || pathname !== "/") return;
    startedRef.current = true;
    void startScratchThread(environmentId);
  }, [environmentId, pathname, startScratchThread]);

  useEffect(() => {
    // Capture phase, ahead of the chat layout's handler, which would open a
    // project draft for `chat.new` and `chat.newLocal`. It already starts
    // `chat.newWithoutProject` in No project.
    const onKeyDown = (event: KeyboardEvent) => {
      if (isCommandPaletteOpen()) return;
      const command = resolveShortcutCommand(event, keybindings, {
        context: { terminalFocus: isTerminalFocused() },
      });
      if (command !== "chat.new" && command !== "chat.newLocal") return;
      event.preventDefault();
      event.stopPropagation();
      if (environmentId !== null) void startScratchThread(environmentId);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [environmentId, keybindings, startScratchThread]);
}

export function SideChatShell({ children }: { readonly children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  useFreshSideChats(pathname);
  const isMacosDesktop = isElectron && isMacPlatform(navigator.platform);
  const style = {
    ...(isMacosDesktop ? { "--workspace-controls-left": MACOS_TRAFFIC_LIGHTS_LEFT_INSET } : {}),
    // No sidebar toggle to clear: the header starts right after the window controls.
    "--workspace-titlebar-content-left": "var(--workspace-controls-left)",
  } as CSSProperties;
  return (
    <SidebarProvider className="h-dvh! min-h-0!" defaultOpen={false} style={style}>
      {pathname === "/" ? null : children}
    </SidebarProvider>
  );
}
