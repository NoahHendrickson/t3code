/**
 * Fork guard — see `.fork/customizations.yaml#fork-local-dictation`.
 *
 * A bare right Command tap starts dictation into the registered composer and
 * a second tap finishes it; a right Command that modifies a key, click or
 * scroll, a left Command tap, and a composer that cannot start do nothing.
 */
import type { VoiceInputState } from "@t3tools/client-runtime/voice-input";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  installForkDictationHotkey,
  registerForkDictationTarget,
  type ForkDictation,
} from "../custom/voice/forkDictation";

let phase: VoiceInputState["phase"];
const start = vi.fn(() => {
  phase = "recording";
});
const stop = vi.fn(() => {
  phase = "idle";
});

function dictation(): ForkDictation {
  return {
    isAvailable: true,
    state: { phase, error: null, errorAction: null },
    level: 0,
    error: null,
    errorAction: null,
    blocksSubmission: phase !== "idle" && phase !== "error",
    freezesEditor: phase !== "idle" && phase !== "error",
    start,
    stop,
    cancel: () => {},
    settleWithoutControls: () => {},
  };
}

function key(type: "keydown" | "keyup", init: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent(type, init));
}

function tapRightCommand() {
  key("keydown", { key: "Meta", code: "MetaRight", metaKey: true });
  key("keyup", { key: "Meta", code: "MetaRight", metaKey: false });
}

let cleanups: Array<() => void>;

function setup(canStart = true) {
  phase = "idle";
  start.mockClear();
  stop.mockClear();
  cleanups.push(installForkDictationHotkey());
  cleanups.push(registerForkDictationTarget({ dictation, canStart: () => canStart }));
}

beforeEach(() => {
  cleanups = [];
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "KeyboardEvent",
    class extends Event {
      readonly code: string;
      readonly metaKey: boolean;
      readonly repeat = false;
      readonly ctrlKey = false;
      readonly altKey = false;
      readonly shiftKey = false;
      constructor(type: string, init: KeyboardEventInit) {
        super(type, { cancelable: true });
        this.code = init.code ?? "";
        this.metaKey = init.metaKey ?? false;
      }
    },
  );
});

afterEach(() => {
  for (const cleanup of cleanups.toReversed()) cleanup();
  vi.unstubAllGlobals();
});

describe("fork dictation hotkey", () => {
  it("starts on a right Command tap and finishes on the next", () => {
    setup();
    tapRightCommand();
    expect(start).toHaveBeenCalledTimes(1);
    tapRightCommand();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("does nothing when right Command modifies a key, click or scroll", () => {
    setup();
    key("keydown", { key: "Meta", code: "MetaRight", metaKey: true });
    key("keydown", { key: "c", code: "KeyC", metaKey: true });
    key("keyup", { key: "Meta", code: "MetaRight", metaKey: false });
    for (const type of ["pointerdown", "wheel"]) {
      key("keydown", { key: "Meta", code: "MetaRight", metaKey: true });
      window.dispatchEvent(new Event(type));
      key("keyup", { key: "Meta", code: "MetaRight", metaKey: false });
    }
    expect(start).not.toHaveBeenCalled();
  });

  it("ignores left Command and a composer that cannot start", () => {
    setup(false);
    key("keydown", { key: "Meta", code: "MetaLeft", metaKey: true });
    key("keyup", { key: "Meta", code: "MetaLeft", metaKey: false });
    tapRightCommand();
    expect(start).not.toHaveBeenCalled();
  });

  it("leaves the latest registration in place when an older one cleans up", () => {
    setup();
    const older = registerForkDictationTarget({ dictation, canStart: () => false });
    cleanups.push(registerForkDictationTarget({ dictation, canStart: () => true }));
    older();
    tapRightCommand();
    expect(start).toHaveBeenCalledTimes(1);
  });
});
