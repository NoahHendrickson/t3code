/** Unit tests for the stray file-drop navigation guard — see
 * `.fork/customizations.yaml#fork-chat-file-drop`. */
import { describe, expect, it } from "vite-plus/test";

import { makeStrayFileDropGuardHandlers, type StrayFileDragEvent } from "./chatFileDrop";

function makeEvent(input: {
  types?: ReadonlyArray<string>;
  defaultPrevented?: boolean;
}): StrayFileDragEvent & { prevented: boolean; dropEffect: string | null } {
  const event = {
    prevented: false,
    dropEffect: null as string | null,
    dataTransfer:
      input.types === undefined
        ? null
        : {
            types: input.types,
            get dropEffect() {
              return event.dropEffect ?? "";
            },
            set dropEffect(value: string) {
              event.dropEffect = value;
            },
          },
    defaultPrevented: input.defaultPrevented ?? false,
    preventDefault() {
      event.prevented = true;
    },
  };
  return event;
}

describe("stray file-drop guard", () => {
  const handlers = makeStrayFileDropGuardHandlers();

  it("swallows an unclaimed file drag so the browser cannot navigate", () => {
    const over = makeEvent({ types: ["Files"] });
    handlers.onDragOver(over);
    // preventDefault on dragover is what makes `drop` fire at all; "none"
    // keeps the cursor honest that nothing will be attached here.
    expect(over.prevented).toBe(true);
    expect(over.dropEffect).toBe("none");

    const drop = makeEvent({ types: ["Files"] });
    handlers.onDrop(drop);
    expect(drop.prevented).toBe(true);
  });

  it("leaves a claimed drag to the target that claimed it", () => {
    // Upstream's chat-column handlers (and any nested target) run first in
    // the bubble phase; defaultPrevented is their claim.
    const over = makeEvent({ types: ["Files"], defaultPrevented: true });
    handlers.onDragOver(over);
    expect(over.prevented).toBe(false);
    expect(over.dropEffect).toBeNull();

    const drop = makeEvent({ types: ["Files"], defaultPrevented: true });
    handlers.onDrop(drop);
    expect(drop.prevented).toBe(false);
  });

  it("ignores drags that carry no files", () => {
    // The file tree's mention channel and text drags must keep their own
    // semantics untouched.
    const over = makeEvent({ types: ["text/plain"] });
    handlers.onDragOver(over);
    expect(over.prevented).toBe(false);

    const bare = makeEvent({});
    handlers.onDragOver(bare);
    handlers.onDrop(bare);
    expect(bare.prevented).toBe(false);
  });
});
