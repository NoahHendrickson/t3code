import { afterEach, expect, it, vi } from "vite-plus/test";

import {
  DESIGN_MODE_GLOBAL,
  parseDesignModeConsoleMessage,
  type DesignModeEngineMessage,
} from "../protocol";

afterEach(() => {
  const handle = (globalThis as Record<string, unknown>)[DESIGN_MODE_GLOBAL] as
    | { destroy: () => void }
    | undefined;
  handle?.destroy();
  document.body.replaceChildren();
});

it("re-sends the layers tree after the state flip that wipes the host's copy", async () => {
  document.body.innerHTML = `
    <main data-dc-source="src/App.tsx:1:1">
      <h1 data-dc-source="src/App.tsx:2:3">Title</h1>
    </main>`;
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  // Importing the bundle entry boots the engine, as injecting it into a guest page does.
  await import("./boot");
  log.mockRestore();

  const messages = lines
    .map(parseDesignModeConsoleMessage)
    .filter((message): message is DesignModeEngineMessage => message !== null);
  const stateOn = messages.findIndex((message) => message.type === "state" && message.active);
  expect(stateOn).toBeGreaterThanOrEqual(0);
  // The host resets its per-tab layers on every enabled flip (designModeStore.setEnabled),
  // so only a tree sent after `state` survives into the rail.
  const after = messages.slice(stateOn + 1).find((message) => message.type === "layers");
  expect(after?.type === "layers" ? after.roots.map((root) => root.label) : null).toEqual(["Main"]);
});
