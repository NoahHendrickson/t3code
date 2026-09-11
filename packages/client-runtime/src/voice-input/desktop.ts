/** Fork-owned, device-local IPC. Audio never crosses an environment connection. */
export type DesktopVoiceInputResult =
  | { ok: true; value: string | void }
  | { ok: false; error: string };

export interface DesktopVoiceInputBridge {
  prepare(requestId: string): Promise<void>;
  transcribe(requestId: string, wav: Uint8Array): Promise<string>;
  cancel(requestId: string): Promise<void>;
  onDownloadProgress(listener: (event: { requestId: string; percent: number }) => void): () => void;
}
