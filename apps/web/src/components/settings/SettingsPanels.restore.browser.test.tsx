import { DEFAULT_UNIFIED_SETTINGS, type UnifiedSettings } from "@t3tools/contracts";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  settings: null as UnifiedSettings | null,
  update: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock(import("../../hooks/useTheme"), async (original) => ({
  ...(await original()),
  useTheme: () =>
    ({
      theme: "system",
      followSystem: true,
      themeHalves: null,
      setTheme: vi.fn(),
      setFollowSystem: vi.fn(),
      setThemeHalf: vi.fn(),
      clearThemeHalves: vi.fn(),
    }) as never,
  readThemePreference: () => "system",
  readThemeHalves: () => null,
  readAppearanceModePreference: () => "system",
}));
vi.mock(import("./useScopedSettings"), async (original) => ({
  ...(await original()),
  useScopedSettings: (() => state.settings!) as never,
  useUpdateScopedSettings: () => state.update,
}));

/* fork:begin fork-cool-dark-theme — see .fork/customizations.yaml#fork-cool-dark-theme */
// useSettingsRestore also reads the fork palette through useSyncExternalStore,
// which the hook harness does not provide; answer with upstream's theme as-is.
vi.mock("../../custom/forkTheme", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../custom/forkTheme")>()),
  useForkAppearance: (theme: string) => ({
    appearance: theme,
    setAppearance: vi.fn(),
    palette: null,
  }),
}));
/* fork:end fork-cool-dark-theme */
/* fork:begin fork-glass-new-agent-stage — see .fork/customizations.yaml#fork-glass-new-agent-stage */
// The new agent picture switch reads localStorage the same way; answer with
// its default, so it is never one of the changed settings.
vi.mock("../../custom/forkGlassNewAgentPicture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../custom/forkGlassNewAgentPicture")>()),
  useForkGlassNewAgentPicture: () => [true, vi.fn()],
}));
/* fork:end fork-glass-new-agent-stage */
/* fork:begin fork-glass-3d — see .fork/customizations.yaml#fork-glass-3d */
vi.mock("../../custom/forkGlass3d", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../custom/forkGlass3d")>()),
  useForkGlass3d: () => ["full", vi.fn()],
}));
/* fork:end fork-glass-3d */
vi.mock(import("../../localApi"), async (original) => ({
  ...(await original()),
  readLocalApi: () => ({ dialogs: { confirm: state.confirm } }) as never,
}));

import { useSettingsRestore } from "./SettingsPanels";

let root: Root;
let restore: ReturnType<typeof useSettingsRestore>;

function Probe() {
  const result = useSettingsRestore();
  useEffect(() => {
    restore = result;
  });
  return null;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  state.settings = { ...DEFAULT_UNIFIED_SETTINGS };
  state.confirm.mockResolvedValue(true);
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

const render = () => act(async () => root.render(<Probe />));

describe("restoring V2 settings", () => {
  it.each([
    ["persistComposerContextStrip", "Composer context"],
    ["autoResumeLimitedThreads", "Auto-resume limited threads"],
    ["snoozeLimitedThreads", "Snooze limited threads"],
  ] as const)("restores %s when it is the only changed setting", async (key, label) => {
    state.settings = { ...DEFAULT_UNIFIED_SETTINGS, [key]: true };
    await render();

    expect(restore.changedSettingLabels).toEqual([label]);
    await act(() => restore.restoreDefaults());

    expect(state.confirm.mock.calls[0]?.[0]).toContain(label);
    expect(state.update).toHaveBeenCalledOnce();
    expect(state.update.mock.calls[0]?.[0][key]).toBe(DEFAULT_UNIFIED_SETTINGS[key]);
  });

  it("does not reset settings after cancellation", async () => {
    state.settings = { ...DEFAULT_UNIFIED_SETTINGS, autoResumeLimitedThreads: true };
    state.confirm.mockResolvedValue(false);
    await render();

    await act(() => restore.restoreDefaults());

    expect(state.confirm).toHaveBeenCalledOnce();
    expect(state.update).not.toHaveBeenCalled();
  });
});
