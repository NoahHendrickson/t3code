// Fork shadow of upstream threadSidebarWidth — see
// `.fork/customizations.yaml#narrow-workspace-layout`.
//
// Only the main-content reserve moves: 40rem → 400px. It is the chat column's
// minimum width, and the fork gives it one meaning in both directions. Upstream
// uses it to stop a sidebar *drag* from eating the column; the fork reuses the
// same number in `custom/narrowChatOverlay.ts`, where the sidebar stops pushing
// and floats over the workspace instead as soon as pushing would take the
// column under it.
//
// 400px is where the composer's own compaction bottoms out
// (`overrides/components/composerFooterLayout.ts`), so it is the narrowest
// column whose controls still have a designed layout.

export const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
const THREAD_SIDEBAR_DEFAULT_WIDTH = 16 * 16;
export const THREAD_SIDEBAR_MIN_WIDTH = 13 * 16;
export const THREAD_MAIN_CONTENT_MIN_WIDTH = 400;

export function resolveThreadSidebarMaximumWidth(viewportWidth: number): number {
  return Math.max(
    THREAD_SIDEBAR_MIN_WIDTH,
    Math.floor(viewportWidth) - THREAD_MAIN_CONTENT_MIN_WIDTH,
  );
}

export function resolveInitialThreadSidebarWidth(
  storedWidth: number | null,
  viewportWidth: number,
): number {
  const preferredWidth =
    storedWidth === null
      ? THREAD_SIDEBAR_DEFAULT_WIDTH
      : Math.max(THREAD_SIDEBAR_MIN_WIDTH, storedWidth);
  return Math.min(preferredWidth, resolveThreadSidebarMaximumWidth(viewportWidth));
}
