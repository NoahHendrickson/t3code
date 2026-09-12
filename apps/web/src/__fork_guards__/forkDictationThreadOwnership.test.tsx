/**
 * Fork guard — see `.fork/customizations.yaml#fork-local-dictation`.
 *
 * ChatComposer is `memo(fn)`, and react-dom refreshes a useEffectEvent impl
 * only for FunctionComponent fibers, so one declared inside it keeps its
 * mount-time closure forever. These tests pin that dictation still targets the
 * thread on screen; against the effect-event version of the hook every
 * transcript lands in the first thread opened.
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

let useForkDictationController: DictationHook;
let root: Root;
let dictation: ReturnType<DictationHook>;
let drafts: Map<string, string>;
let focused: string[];
const transcribe = vi.fn(async () => "spoken words");

/**
 * Each thread gets its own composer element, so a stale `getComposerElement`
 * is observable: the chord only starts when the keydown target sits inside the
 * composer of the thread currently rendered.
 */
class FakeNode {
  constructor(readonly ownerKey: string) {}
}
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
const Composer = memo(function Composer({ ownerKey }: { ownerKey: string }) {
  const session = useForkDictationController({
    ownerKey,
    disabled: false,
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

async function renderThread(ownerKey: string) {
  await act(() => {
    root.render(
      <StrictMode>
        <Composer ownerKey={ownerKey} />
      </StrictMode>,
    );
  });
}

function pressChord(target: unknown) {
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperty(event, "target", { value: target });
  Object.assign(event, {
    key: " ",
    code: "Space",
    ctrlKey: true,
    shiftKey: true,
    metaKey: false,
    altKey: false,
    repeat: false,
  });
  window.dispatchEvent(event);
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
  root = createRoot(container as unknown as HTMLElement);
});

afterEach(async () => {
  // Unmount runs the hook's cleanups; a throw there must not leak the stubs.
  try {
    await act(() => {
      root.unmount();
    });
  } finally {
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

  it("runs the keyboard chord against the visible thread's composer", async () => {
    await renderThread("thread-a");
    await renderThread("thread-b");

    // The previous thread's editor is no longer inside the composer the hook reads.
    await act(async () => {
      pressChord(editorFor("thread-a"));
    });
    expect(dictation.state.phase).toBe("idle");

    await act(async () => {
      pressChord(editorFor("thread-b"));
    });
    expect(dictation.state.phase).toBe("recording");
    await act(async () => {
      pressChord(editorFor("thread-b"));
    });
    expect(dictation.state.phase).toBe("idle");
    expect(drafts.get("thread-b")).toBe("spoken words");
    expect(drafts.has("thread-a")).toBe(false);
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
