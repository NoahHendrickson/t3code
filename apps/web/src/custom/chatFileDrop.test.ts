import { describe, expect, it, vi } from "vite-plus/test";

import {
  makeChatFileDropHandlers,
  type ChatFileDragEvent,
  type ChatFileDropHost,
} from "./chatFileDrop";

/** Stand in for "inside the chat column" without a DOM: the target is the answer. */
const INSIDE = { name: "inside-chat" } as unknown as EventTarget;
const OUTSIDE = { name: "outside-chat" } as unknown as EventTarget;

function makeHost() {
  const host = {
    isInsideDropZone: (target: EventTarget | null) => target === INSIDE,
    onFiles: vi.fn(),
    setDragActive: vi.fn(),
  } satisfies ChatFileDropHost;
  return { host, handlers: makeChatFileDropHandlers(host) };
}

function dragEvent(
  input: {
    target?: EventTarget;
    types?: ReadonlyArray<string>;
    files?: ReadonlyArray<File>;
    defaultPrevented?: boolean;
    dataTransfer?: null;
  } = {},
): ChatFileDragEvent & { dropEffect: string } {
  const dropEffect = { value: "none" };
  const event = {
    dataTransfer:
      input.dataTransfer === null
        ? null
        : {
            types: input.types ?? ["Files"],
            files: input.files ?? [],
            get dropEffect() {
              return dropEffect.value;
            },
            set dropEffect(next: string) {
              dropEffect.value = next;
            },
          },
    target: input.target ?? INSIDE,
    defaultPrevented: input.defaultPrevented ?? false,
    preventDefault: vi.fn(() => {
      Object.assign(event, { defaultPrevented: true });
    }),
    get dropEffect() {
      return dropEffect.value;
    },
  };
  return event as unknown as ChatFileDragEvent & { dropEffect: string };
}

const imageFile = (name: string) => new File([new Uint8Array([1])], name, { type: "image/png" });

describe("makeChatFileDropHandlers", () => {
  it("lights the drag state over the chat column and allows the drop", () => {
    const { host, handlers } = makeHost();

    handlers.onDragEnter(dragEvent());
    expect(host.setDragActive).toHaveBeenLastCalledWith(true);

    const over = dragEvent();
    handlers.onDragOver(over);
    expect(over.preventDefault).toHaveBeenCalled();
    expect(over.dropEffect).toBe("copy");
  });

  it("ignores drags that carry no files", () => {
    const { host, handlers } = makeHost();

    const mention = dragEvent({ types: ["application/x-t3code-composer-mention"] });
    handlers.onDragEnter(mention);
    handlers.onDragOver(mention);
    handlers.onDrop(mention);

    expect(host.setDragActive).not.toHaveBeenCalled();
    expect(host.onFiles).not.toHaveBeenCalled();
    expect(mention.preventDefault).not.toHaveBeenCalled();
  });

  it("holds the drag state while the pointer crosses nested chat elements", () => {
    const { host, handlers } = makeHost();

    // dragenter on the element being entered fires before dragleave on the one
    // being left, so the count never bottoms out mid-column.
    handlers.onDragEnter(dragEvent());
    handlers.onDragEnter(dragEvent());
    handlers.onDragLeave(dragEvent());

    expect(host.setDragActive).toHaveBeenLastCalledWith(true);

    handlers.onDragLeave(dragEvent());
    expect(host.setDragActive).toHaveBeenLastCalledWith(false);
  });

  it("hands every file dropped on the chat column to the host", () => {
    const { host, handlers } = makeHost();
    const files = [imageFile("shot.png"), imageFile("other.png")];

    handlers.onDragEnter(dragEvent());
    const drop = dragEvent({ files });
    handlers.onDrop(drop);

    expect(drop.preventDefault).toHaveBeenCalled();
    expect(host.onFiles).toHaveBeenCalledWith(files);
    expect(host.setDragActive).toHaveBeenLastCalledWith(false);
  });

  it("stays dark and refuses the drop outside the chat column", () => {
    const { host, handlers } = makeHost();

    handlers.onDragEnter(dragEvent({ target: OUTSIDE }));
    const over = dragEvent({ target: OUTSIDE });
    handlers.onDragOver(over);

    expect(host.setDragActive).not.toHaveBeenCalledWith(true);
    expect(over.dropEffect).toBe("none");
  });

  it("swallows a drop outside the chat column so the app cannot navigate to it", () => {
    const { host, handlers } = makeHost();

    // preventDefault on both is what stops the browser opening the file: the
    // dragover one is what makes the drop event fire at all.
    const over = dragEvent({ target: OUTSIDE });
    handlers.onDragOver(over);
    const drop = dragEvent({ target: OUTSIDE, files: [imageFile("shot.png")] });
    handlers.onDrop(drop);

    expect(over.preventDefault).toHaveBeenCalled();
    expect(drop.preventDefault).toHaveBeenCalled();
    expect(host.onFiles).not.toHaveBeenCalled();
  });

  it("drops the highlight when the pointer leaves the chat column mid-drag", () => {
    const { host, handlers } = makeHost();

    handlers.onDragEnter(dragEvent());
    // The pointer crossed onto something portalled over the column; the enter
    // and leave pair never reached the zone, so dragover has to re-anchor.
    handlers.onDragOver(dragEvent({ target: OUTSIDE }));

    expect(host.setDragActive).toHaveBeenLastCalledWith(false);
  });

  it("leaves a drop a nested target already claimed alone", () => {
    const { host, handlers } = makeHost();

    handlers.onDragEnter(dragEvent());
    handlers.onDrop(dragEvent({ files: [imageFile("shot.png")], defaultPrevented: true }));

    expect(host.onFiles).not.toHaveBeenCalled();
    expect(host.setDragActive).toHaveBeenLastCalledWith(false);
  });

  it("does not restate the drop effect a nested target chose", () => {
    const { handlers } = makeHost();

    const over = dragEvent({ defaultPrevented: true });
    handlers.onDragOver(over);

    expect(over.preventDefault).not.toHaveBeenCalled();
    expect(over.dropEffect).toBe("none");
  });

  it("lights a drag that was already in flight when it started listening", () => {
    const { host, handlers } = makeHost();

    handlers.onDragOver(dragEvent());
    expect(host.setDragActive).toHaveBeenLastCalledWith(true);

    handlers.onDragLeave(dragEvent());
    expect(host.setDragActive).toHaveBeenLastCalledWith(false);
  });

  it("clears the drag state when a drag ends without a leave", () => {
    const { host, handlers } = makeHost();

    handlers.onDragEnter(dragEvent());
    handlers.onDragEnter(dragEvent());
    handlers.onDragEnd();

    expect(host.setDragActive).toHaveBeenLastCalledWith(false);
  });

  it("ignores an event with no data transfer", () => {
    const { host, handlers } = makeHost();

    handlers.onDragEnter(dragEvent({ dataTransfer: null }));
    handlers.onDrop(dragEvent({ dataTransfer: null }));

    expect(host.setDragActive).not.toHaveBeenCalled();
    expect(host.onFiles).not.toHaveBeenCalled();
  });

  it("does not raise an empty drop", () => {
    const { host, handlers } = makeHost();

    handlers.onDrop(dragEvent({ files: [] }));

    expect(host.onFiles).not.toHaveBeenCalled();
  });
});
