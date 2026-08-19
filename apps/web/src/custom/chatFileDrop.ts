/**
 * Stray file-drop navigation guard — see
 * `.fork/customizations.yaml#fork-chat-file-drop`.
 *
 * Upstream's chat column (`data-chat-workspace-drop-target` in ChatView) owns
 * attaching dropped files. What nothing upstream owns is a file released
 * anywhere else — the sidebar, the header, the right panel — which hits the
 * browser default and navigates the app away to the dropped file, costing the
 * whole session over a missed drop.
 *
 * These handlers bind to `window` in the bubble phase, so every real drop
 * target — upstream's column, the file tree's mention channel, any future
 * surface — sees the event first; anything already claimed
 * (`defaultPrevented`) is left alone. Whatever reaches here unclaimed is
 * swallowed: preventDefault on dragover is what makes `drop` fire at all, and
 * the "none" dropEffect keeps the cursor honest that nothing will be attached
 * there. Only drags carrying files are touched.
 */
import { useEffect } from "react";

/** The `DataTransfer.types` entry every OS file drag carries. */
const FILE_DRAG_TYPE = "Files";

export interface StrayFileDragTransfer {
  readonly types: ReadonlyArray<string>;
  dropEffect: string;
}

export interface StrayFileDragEvent {
  readonly dataTransfer: StrayFileDragTransfer | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface StrayFileDropGuardHandlers {
  onDragOver(event: StrayFileDragEvent): void;
  onDrop(event: StrayFileDragEvent): void;
}

function carriesFiles(transfer: StrayFileDragTransfer | null): transfer is StrayFileDragTransfer {
  return transfer !== null && transfer.types.includes(FILE_DRAG_TYPE);
}

export function makeStrayFileDropGuardHandlers(): StrayFileDropGuardHandlers {
  return {
    onDragOver(event) {
      if (!carriesFiles(event.dataTransfer)) return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "none";
    },

    onDrop(event) {
      if (!carriesFiles(event.dataTransfer)) return;
      if (event.defaultPrevented) return;
      event.preventDefault();
    },
  };
}

/**
 * Mounted from ChatView, so the guard is active exactly while a chat column
 * exists to drop into; elsewhere a drop keeps its usual browser behaviour.
 */
export function useStrayFileDropGuard(): void {
  useEffect(() => {
    const handlers = makeStrayFileDropGuardHandlers();
    const onDragOver = (event: DragEvent) => handlers.onDragOver(event);
    const onDrop = (event: DragEvent) => handlers.onDrop(event);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
}
