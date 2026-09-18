/**
 * Fork guard — see `.fork/customizations.yaml#fork-local-dictation`.
 *
 * ChatComposer is `memo(fn)`, and react-dom refreshes a useEffectEvent impl
 * only for FunctionComponent fibers, so one declared inside it keeps its
 * mount-time closure forever. These tests pin that dictation still targets the
 * thread on screen; against the effect-event version of the hook every
 * transcript lands in the first thread opened.
 *
 * They also pin the app-level session: the right Command tap works wherever
 * focus sits while the window is active, lands in the composer on screen,
 * and when no composer can take it the transcript goes to the fallback
 * presenter (the toast with Copy) instead of being lost.
 */
import { act, memo, StrictMode, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("../custom/voice/BrowserVoiceRecorder", () => ({
  BrowserVoiceRecorder: class {
    uri = "blob:test-recording";
    async prepareToRecordAsync() {}
    record() {}
    async stop() {}
    release() {}
  },
  recordingToWav: async () => new Uint8Array([1]),
  releaseRecording: () => {},
}));

type DictationHook =
  typeof import("../custom/voice/useForkDictationController").useForkDictationController;
type DictationSessionModule = typeof import("../custom/voice/forkDictationSession");

let useForkDictationController: DictationHook;
let sessions: DictationSessionModule;
let fallback: ReturnType<DictationSessionModule["createDictationFallback"]>;
let uninstallHotkeys: () => void;
let root: Root;
let dictation: ReturnType<DictationHook>;
let drafts: Map<string, string>;
let focused: string[];
let presented: string[];
const transcribe = vi.fn(async () => "spoken words");

/**
 * Stands in for whatever has focus. Each thread gets its own editor node so
 * a stale `getComposerElement` is observable through the Escape rule.
 */
class FakeNode {
  constructor(readonly name: string) {}
}
const elsewhere = new FakeNode("sidebar-search");
let editors: Map<string, FakeNode>;
function editorFor(ownerKey: string) {
  let node = editors.get(ownerKey);
  if (!node) {
    node = new FakeNode(ownerKey);
    editors.set(ownerKey, node);
  }
  return node;
}

// ChatComposer uses memo: without it, the stale effect-event bug does not reproduce.
const Composer = memo(function Composer({
  ownerKey,
  disabled = false,
}: {
  ownerKey: string;
  disabled?: boolean;
}) {
  const session = useForkDictationController({
    ownerKey,
    disabled,
    getComposerElement: () => {
      const editor = editorFor(ownerKey);
      return { contains: (node: unknown) => node === editor } as unknown as HTMLElement;
    },
    focusEditor: () => {
      focused.push(ownerKey);
    },
    readDraft: () => {
      const value = drafts.get(ownerKey) ?? "";
      return { value, expandedCursor: value.length };
    },
    commitDraft: (text) => {
      drafts.set(ownerKey, text);
    },
  });
  useLayoutEffect(() => {
    dictation = session;
  });
  return null;
});

async function renderThread(ownerKey: string, options: { disabled?: boolean } = {}) {
  await act(() => {
    root.render(
      <StrictMode>
        <Composer ownerKey={ownerKey} disabled={options.disabled ?? false} />
      </StrictMode>,
    );
  });
}

async function renderNoComposer() {
  await act(() => {
    root.render(<StrictMode />);
  });
}

function dispatchKey(
  type: "keydown" | "keyup",
  target: unknown,
  init: {
    key: string;
    code: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  },
) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "target", { value: target });
  Object.assign(event, {
    key: init.key,
    code: init.code,
    ctrlKey: init.ctrlKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
    metaKey: init.metaKey ?? false,
    repeat: false,
  });
  window.dispatchEvent(event);
}

function tapRightCommand(target: unknown) {
  dispatchKey("keydown", target, { key: "Meta", code: "MetaRight", metaKey: true });
  dispatchKey("keyup", target, { key: "Meta", code: "MetaRight", metaKey: false });
}

beforeEach(async () => {
  // VoiceInputController holds its active-session token at module scope and
  // releases it only when a transcription settles. A test ending while
  // preparing or transcribing would leave it held and fail the next one inside
  // acquireSession(). client-runtime does not export
  // resetVoiceInputGlobalsForTests() from its barrel, so a fresh module graph
  // per test is the file-local equivalent. Import before the stubs below: the
  // graph reaches modules that sniff the real navigator at load.
  vi.resetModules();
  ({ useForkDictationController } = await import("../custom/voice/useForkDictationController"));
  sessions = await import("../custom/voice/forkDictationSession");

  // The probe renders no host nodes, but ReactDOM still needs an event target.
  const document = { nodeType: 9, addEventListener() {}, removeEventListener() {} };
  const container = {
    nodeType: 1,
    tagName: "DIV",
    namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: document,
    addEventListener() {},
    removeEventListener() {},
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { document, HTMLIFrameElement: EventTarget }),
  );
  vi.stubGlobal("navigator", { permissions: { query: async () => ({ state: "granted" }) } });
  // The keydown handler narrows the event target with `instanceof Node`.
  vi.stubGlobal("Node", FakeNode);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("forkDesktopBridge", {
    voiceInput: {
      prepare: async () => {},
      transcribe,
      cancel: async () => {},
      onDownloadProgress: () => () => {},
    },
  });
  transcribe.mockReset().mockResolvedValue("spoken words");
  drafts = new Map();
  editors = new Map();
  focused = [];
  presented = [];
  // What `ForkDictationHotkeyHost` does at the root: the fallback session
  // with its presenter, and the hotkeys, built after the bridge stub.
  const bridge = (globalThis as { forkDesktopBridge?: { voiceInput: unknown } }).forkDesktopBridge!
    .voiceInput as Parameters<DictationSessionModule["createDictationFallback"]>[0];
  fallback = sessions.createDictationFallback(bridge, () => ({
    onStateChange: (state) => {
      presented.push(state.phase);
    },
    onDownload: () => {},
    onTranscript: (text) => {
      presented.push(`delivered:${text}`);
    },
    dismiss: () => {
      presented.push("dismissed");
    },
  }));
  uninstallHotkeys = sessions.installDictationHotkeys(fallback);
  root = createRoot(container as unknown as HTMLElement);
});

afterEach(async () => {
  // Unmount runs the hook's cleanups; a throw there must not leak the stubs.
  try {
    await act(() => {
      root.unmount();
    });
  } finally {
    uninstallHotkeys();
    fallback.dispose();
    vi.unstubAllGlobals();
  }
});

describe("dictation thread ownership", () => {
  it("inserts into the current thread after navigating with the same composer mounted", async () => {
    const sessions = new Set<unknown>();
    for (const owner of ["thread-a", "thread-b", "thread-c"]) {
      await renderThread(owner);
      // Built once per mount, so this doubles as the harness's own invariant:
      // if a tree change ever remounted the composer, each thread would get a
      // fresh session and the stale-closure bug would be unreachable here.
      sessions.add(dictation.subscribeLevel);
      await act(async () => {
        dictation.start();
      });
      expect(dictation.state.phase).toBe("recording");
      await act(async () => {
        dictation.stop();
      });
      expect(dictation.state.phase).toBe("idle");
      expect(drafts.get(owner)).toBe("spoken words");
    }
    expect(sessions.size).toBe(1);
    expect([...drafts.values()]).toEqual(["spoken words", "spoken words", "spoken words"]);
  });

  it("does not insert a late transcript after switching threads", async () => {
    let finish!: (text: string) => void;
    transcribe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await renderThread("thread-a");
    await act(async () => {
      dictation.start();
    });
    await act(async () => {
      dictation.stop();
    });
    expect(dictation.state.phase).toBe("transcribing");
    await renderThread("thread-b");
    await act(async () => {
      finish("old thread's speech");
    });
    expect(drafts.size).toBe(0);
    // The owner change cancels; dropping the transcript through an error path
    // instead would put a banner and a Retry on a thread that never recorded.
    expect(dictation.state.phase).toBe("idle");
    expect(dictation.error).toBeNull();
    await act(async () => {
      dictation.start();
    });
    await act(async () => {
      dictation.stop();
    });
    expect(drafts.get("thread-b")).toBe("spoken words");
    expect(drafts.has("thread-a")).toBe(false);
  });

  it("runs the right Command tap from anywhere against the visible thread's composer", async () => {
    await renderThread("thread-a");
    await renderThread("thread-b");

    // Focus is outside the composer: the tap still starts, into the thread on screen.
    await act(async () => {
      tapRightCommand(elsewhere);
    });
    expect(dictation.state.phase).toBe("recording");
    await act(async () => {
      tapRightCommand(elsewhere);
    });
    expect(dictation.state.phase).toBe("idle");
    expect(drafts.get("thread-b")).toBe("spoken words");
    expect(drafts.has("thread-a")).toBe(false);
    // The composer took it, so nothing was offered to copy.
    expect(presented).toEqual([]);
  });

  it("cancels with Escape only from the composer or an unfocused page", async () => {
    await renderThread("thread-a");
    await act(async () => {
      tapRightCommand(elsewhere);
    });
    expect(dictation.state.phase).toBe("recording");
    // A focused control elsewhere (a dialog, the palette, a field) keeps its Escape.
    await act(async () => {
      dispatchKey("keydown", elsewhere, { key: "Escape", code: "Escape" });
    });
    expect(dictation.state.phase).toBe("recording");
    focused.length = 0;
    await act(async () => {
      dispatchKey("keydown", editorFor("thread-a"), { key: "Escape", code: "Escape" });
    });
    expect(dictation.state.phase).toBe("idle");
    expect(drafts.size).toBe(0);
    expect(focused).toEqual(["thread-a"]);

    await act(async () => {
      tapRightCommand(elsewhere);
    });
    expect(dictation.state.phase).toBe("recording");
    await act(async () => {
      dispatchKey("keydown", window.document, { key: "Escape", code: "Escape" });
    });
    expect(dictation.state.phase).toBe("idle");
  });

  it("offers the transcript to copy when no composer is on screen", async () => {
    await renderNoComposer();
    await act(async () => {
      tapRightCommand(elsewhere);
    });
    expect(fallback.controller.currentState.phase).toBe("recording");
    await act(async () => {
      tapRightCommand(elsewhere);
    });
    expect(fallback.controller.currentState.phase).toBe("idle");
    expect(presented).toEqual([
      "preparing",
      "recording",
      "transcribing",
      "delivered:spoken words",
      "idle",
    ]);
    expect(drafts.size).toBe(0);
  });

  it("offers the transcript to copy when the composer on screen cannot take it", async () => {
    await renderThread("thread-a", { disabled: true });
    await act(async () => {
      tapRightCommand(elsewhere);
    });
    // Not this composer's session: it stays idle and editable.
    expect(dictation.state.phase).toBe("idle");
    expect(dictation.blocksSubmission).toBe(false);
    expect(fallback.controller.currentState.phase).toBe("recording");
    await act(async () => {
      tapRightCommand(elsewhere);
    });
    expect(presented).toContain("delivered:spoken words");
    expect(drafts.size).toBe(0);
  });

  it("does not hand a fallback transcript to a composer that arrives mid-session", async () => {
    let finish!: (text: string) => void;
    transcribe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await renderNoComposer();
    await act(async () => {
      tapRightCommand(elsewhere);
    });
    await act(async () => {
      tapRightCommand(elsewhere);
    });
    expect(fallback.controller.currentState.phase).toBe("transcribing");
    await renderThread("thread-a");
    expect(dictation.state.phase).toBe("idle");
    await act(async () => {
      finish("said before the thread opened");
    });
    expect(presented).toContain("delivered:said before the thread opened");
    expect(drafts.size).toBe(0);
    // And the composer is the target again for the next one.
    await act(async () => {
      tapRightCommand(elsewhere);
    });
    expect(dictation.state.phase).toBe("recording");
    await act(async () => {
      tapRightCommand(elsewhere);
    });
    expect(drafts.get("thread-a")).toBe("spoken words");
  });

  it("settles a cancelled fallback session back to idle for its toast to close", async () => {
    await renderNoComposer();
    await act(async () => {
      tapRightCommand(elsewhere);
    });
    await act(async () => {
      dispatchKey("keydown", window.document, { key: "Escape", code: "Escape" });
    });
    expect(fallback.controller.currentState.phase).toBe("idle");
    expect(presented).toEqual(["preparing", "recording", "idle"]);
  });

  it("disposes the fallback session with its host", async () => {
    await renderNoComposer();
    await act(async () => {
      tapRightCommand(elsewhere);
    });
    expect(fallback.controller.currentState.phase).toBe("recording");
    fallback.dispose();
    expect(fallback.controller.currentState.phase).toBe("idle");
    expect(presented).toEqual(["preparing", "recording", "idle", "dismissed"]);
  });

  it("does not start dictation when right Command is used as a modifier", async () => {
    await renderThread("thread-a");
    const editor = elsewhere;
    await act(async () => {
      dispatchKey("keydown", editor, { key: "Meta", code: "MetaRight", metaKey: true });
      dispatchKey("keydown", editor, { key: "c", code: "KeyC", metaKey: true });
      dispatchKey("keyup", editor, { key: "c", code: "KeyC", metaKey: true });
      dispatchKey("keyup", editor, { key: "Meta", code: "MetaRight", metaKey: false });
    });
    expect(dictation.state.phase).toBe("idle");
  });

  it("does not start dictation when right Command modifies a click or scroll", async () => {
    await renderThread("thread-a");
    const editor = elsewhere;
    for (const type of ["pointerdown", "wheel"]) {
      await act(async () => {
        dispatchKey("keydown", editor, { key: "Meta", code: "MetaRight", metaKey: true });
        window.dispatchEvent(new Event(type));
        dispatchKey("keyup", editor, { key: "Meta", code: "MetaRight", metaKey: false });
      });
      expect(dictation.state.phase, type).toBe("idle");
    }
  });

  it("ignores a tap of left Command", async () => {
    await renderThread("thread-a");
    const editor = elsewhere;
    await act(async () => {
      dispatchKey("keydown", editor, { key: "Meta", code: "MetaLeft", metaKey: true });
      dispatchKey("keyup", editor, { key: "Meta", code: "MetaLeft", metaKey: false });
    });
    expect(dictation.state.phase).toBe("idle");
  });

  it("keeps retained start and cancel callbacks pointed at the visible thread", async () => {
    await renderThread("thread-a");
    // Stands in for anything holding the returned object across renders, such
    // as memoizing the mic button or hoisting start into a command action.
    const retained = dictation;
    await renderThread("thread-b");

    await act(async () => {
      retained.start();
    });
    expect(dictation.state.phase).toBe("recording");
    focused.length = 0;
    await act(async () => {
      retained.cancel();
    });
    expect(dictation.state.phase).toBe("idle");
    expect(focused).toEqual(["thread-b"]);
    expect(drafts.size).toBe(0);
  });
});
