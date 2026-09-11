/**
 * Renderer view of the fork's device-local dictation IPC, exposed by the
 * desktop preload as `forkDesktopBridge.voiceInput`. Kept local to the fork on
 * both sides so `packages/contracts` and `client-runtime` never carry a
 * fork-only shape (see `apps/desktop/src/fork/voice/VoiceInputIpc.ts`).
 */
export interface ForkVoiceInputBridge {
  prepare(requestId: string): Promise<void>;
  transcribe(requestId: string, wav: Uint8Array): Promise<string>;
  cancel(requestId: string): Promise<void>;
  /** Opens the OS microphone privacy pane for a denied permission. */
  openMicrophoneSettings(): Promise<void>;
  onDownloadProgress(listener: (event: { requestId: string; percent: number }) => void): () => void;
}

/** Read off `globalThis` so the module stays importable in non-DOM tests. */
export function readForkVoiceInputBridge(): ForkVoiceInputBridge | null {
  const bridge = (globalThis as { forkDesktopBridge?: { voiceInput?: unknown } }).forkDesktopBridge
    ?.voiceInput;
  if (typeof bridge !== "object" || bridge === null) return null;
  return typeof (bridge as { transcribe?: unknown }).transcribe === "function"
    ? (bridge as ForkVoiceInputBridge)
    : null;
}
