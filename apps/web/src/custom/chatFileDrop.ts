/**
 * Makes the whole chat column a drop target for files dragged in from outside
 * the app — see `.fork/customizations.yaml#fork-chat-file-drop`.
 *
 * Upstream scopes the drop target to the composer box, so a screenshot dragged
 * out of a screenshot tool has to be aimed at a 40px-tall strip at the bottom
 * of the window. Releasing it over the timeline instead — the obvious place to
 * aim, since that is where the conversation is — hit the browser default and
 * navigated the app away to the dropped file, costing the whole session. The
 * chat column answers for every file released over it, and everywhere else
 * the drop is caught and discarded so that navigation can never happen.
 *
 * The handlers are event-shaped rather than DOM-bound so the counting and
 * hit-testing rules are testable without a drag simulation. `useChatFileDrop`
 * binds them to `window` in the bubble phase, which is what keeps this
 * additive: anything nested — the composer's own file drop, the file tree's
 * mention channel — sees the event first, and a nested target that claimed it
 * (`defaultPrevented`) is left to finish the job alone.
 */
import { useEffect, useRef } from "react";

/** The `DataTransfer.types` entry every OS file drag carries. */
const FILE_DRAG_TYPE = "Files";

/** Marks the chat column in ChatView — the timeline and the composer docked under it. */
export const CHAT_FILE_DROP_ZONE_ATTRIBUTE = "data-fork-chat-drop-zone";

const CHAT_FILE_DROP_ZONE_SELECTOR = `[${CHAT_FILE_DROP_ZONE_ATTRIBUTE}="true"]`;

export interface ChatFileDragTransfer {
  readonly types: ReadonlyArray<string>;
  readonly files: ArrayLike<File>;
  dropEffect: string;
}

export interface ChatFileDragEvent {
  readonly dataTransfer: ChatFileDragTransfer | null;
  readonly target: EventTarget | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface ChatFileDropHost {
  isInsideDropZone(target: EventTarget | null): boolean;
  /**
   * Everything the drop carried, filtering left to the host: the composer
   * already reports unsupported types and attachment limits per file, and a
   * silent drop would be worse than its message.
   */
  onFiles(files: ReadonlyArray<File>): void;
  setDragActive(active: boolean): void;
}

export interface ChatFileDropHandlers {
  onDragEnter(event: ChatFileDragEvent): void;
  onDragOver(event: ChatFileDragEvent): void;
  onDragLeave(event: ChatFileDragEvent): void;
  onDrop(event: ChatFileDragEvent): void;
  onDragEnd(): void;
}

function carriesFiles(transfer: ChatFileDragTransfer | null): transfer is ChatFileDragTransfer {
  return transfer !== null && transfer.types.includes(FILE_DRAG_TYPE);
}

/** True for an element inside the chat column, so drags can be hit-tested off the event. */
export function isInsideChatFileDropZone(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(CHAT_FILE_DROP_ZONE_SELECTOR) !== null;
}

export function makeChatFileDropHandlers(host: ChatFileDropHost): ChatFileDropHandlers {
  // dragenter and dragleave fire once per element the pointer crosses, so a
  // plain boolean drops the highlight every time the drag passes between two
  // children of the chat column. Counting entries against leaves is the
  // standard fix; counting only the ones inside the zone makes the same number
  // answer "is the pointer over the chat", since the enter of the element
  // being entered fires before the leave of the one being left.
  //
  // The count deliberately ignores `defaultPrevented`, unlike the effects
  // below: enter and leave have to be counted on the same rule or the pair
  // stops balancing — a nested target that claims the enter but not the leave
  // would drive the count negative and drop the highlight mid-drag.
  let depth = 0;
  const publish = () => host.setDragActive(depth > 0);

  return {
    onDragEnter(event) {
      if (!carriesFiles(event.dataTransfer)) return;
      if (!host.isInsideDropZone(event.target)) return;
      depth += 1;
      publish();
    },

    onDragOver(event) {
      if (!carriesFiles(event.dataTransfer)) return;
      // A nested target already claimed the drag: it is answering for this
      // drop, and its dropEffect is the one the cursor should show.
      if (event.defaultPrevented) return;
      const inside = host.isInsideDropZone(event.target);
      // preventDefault outside the chat too — it is what makes `drop` fire at
      // all, and a drop that never fires is one the browser handles by
      // navigating to the file. "none" keeps the cursor honest about the fact
      // that nothing will be attached there.
      event.preventDefault();
      event.dataTransfer.dropEffect = inside ? "copy" : "none";
      // Re-anchors the count on the pointer: a drag already in flight when
      // these listeners mount never fired its enter here, and a portalled
      // overlay can take a crossing the zone never sees.
      depth = inside ? Math.max(depth, 1) : 0;
      publish();
    },

    onDragLeave(event) {
      if (!carriesFiles(event.dataTransfer)) return;
      if (!host.isInsideDropZone(event.target)) return;
      depth = Math.max(0, depth - 1);
      publish();
    },

    onDrop(event) {
      if (!carriesFiles(event.dataTransfer)) return;
      depth = 0;
      publish();
      // A nested target that took the drop has already added the files.
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (!host.isInsideDropZone(event.target)) return;
      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;
      host.onFiles(files);
    },

    onDragEnd() {
      // An in-page drag cancelled with Escape can end without a matching
      // leave, which would strand the highlight.
      depth = 0;
      publish();
    },
  };
}

export interface UseChatFileDropOptions extends Omit<ChatFileDropHost, "isInsideDropZone"> {
  /** Off while there is nothing to attach to, so a drop keeps its usual browser behaviour. */
  enabled: boolean;
}

/**
 * Binds the handlers to `window` while `enabled`. Callbacks are read through a
 * ref so a re-render of the (very hot) composer does not re-bind five
 * listeners, and so a drag in progress keeps its count across renders.
 */
export function useChatFileDrop(options: UseChatFileDropOptions): void {
  const { enabled } = options;
  const hostRef = useRef(options);
  useEffect(() => {
    hostRef.current = options;
  });

  useEffect(() => {
    if (!enabled) return;
    const handlers = makeChatFileDropHandlers({
      isInsideDropZone: isInsideChatFileDropZone,
      onFiles: (files) => hostRef.current.onFiles(files),
      setDragActive: (active) => hostRef.current.setDragActive(active),
    });
    const onDragEnter = (event: DragEvent) => handlers.onDragEnter(event);
    const onDragOver = (event: DragEvent) => handlers.onDragOver(event);
    const onDragLeave = (event: DragEvent) => handlers.onDragLeave(event);
    const onDrop = (event: DragEvent) => handlers.onDrop(event);
    const onDragEnd = () => handlers.onDragEnd();
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", onDragEnd);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", onDragEnd);
      hostRef.current.setDragActive(false);
    };
  }, [enabled]);
}
