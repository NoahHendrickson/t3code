import { act, memo, StrictMode, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useForkDictationController } from "../custom/voice/useForkDictationController";

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

let root: Root;
let dictation: ReturnType<typeof useForkDictationController>;
let drafts: Map<string, string>;
const transcribe = vi.fn(async () => "spoken words");

// ChatComposer uses memo: without it, the stale effect-event bug does not reproduce.
const Composer = memo(function Composer({ ownerKey }: { ownerKey: string }) {
  const session = useForkDictationController({
    ownerKey,
    disabled: false,
    getComposerElement: () => null,
    focusEditor: () => {},
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

beforeEach(() => {
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
  root = createRoot(container as unknown as HTMLElement);
});

afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("dictation thread ownership", () => {
  it("inserts into the current thread after navigating with the same composer mounted", async () => {
    for (const owner of ["thread-a", "thread-b", "thread-c"]) {
      await renderThread(owner);
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
    await act(async () => {
      dictation.start();
    });
    await act(async () => {
      dictation.stop();
    });
    expect(drafts.get("thread-b")).toBe("spoken words");
    expect(drafts.has("thread-a")).toBe(false);
  });
});
