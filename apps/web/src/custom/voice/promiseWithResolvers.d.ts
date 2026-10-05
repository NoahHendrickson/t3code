/**
 * fork-local-dictation — see `.fork/customizations.yaml#fork-local-dictation`.
 *
 * The fork's web dictation imports client-runtime's voice-input controller,
 * which upstream (#15502) builds on `Promise.withResolvers`; upstream's web
 * never reaches that file, and the web project's ES2023 lib has no typing
 * for it. Electron and every supported browser ship it, so this declares the
 * one member rather than raising the whole web lib target.
 */
interface PromiseConstructor {
  withResolvers<T>(): {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  };
}
