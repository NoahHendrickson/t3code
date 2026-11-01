/**
 * Fork replacement for the two legacy-favorite cases upstream's
 * ProviderModelPicker.browser.test.tsx skips behind `fork-model-picker`
 * (see `.fork/customizations.yaml#fork-model-picker`). The fork's picker is a
 * Base UI Menu with a rail of provider tabs, so these drive menu items instead of
 * upstream's provider buttons and listbox options.
 */
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react";
import { Atom, AtomRegistry } from "effect/reactivity";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";

import { ProviderModelPicker } from "~/components/chat/ProviderModelPicker";
import { deriveProviderInstanceEntries } from "~/providerInstances";

const favoritesAtom = Atom.make<ReadonlyArray<{ provider: ProviderInstanceId; model: string }>>(
  [],
).pipe(Atom.keepAlive);

vi.mock(import("~/hooks/useSettings"), async (original) => ({
  ...(await original()),
  useEnvironmentModelPreferences: () => ({
    favorites: useAtomValue(favoritesAtom),
    providerModelPreferences: {},
  }),
  useToggleEnvironmentModelFavorite: () => {
    const setFavorites = useAtomSet(favoritesAtom);
    return async (provider: ProviderInstanceId, model: string) => {
      setFavorites((favorites) =>
        favorites.filter((favorite) => favorite.provider !== provider || favorite.model !== model),
      );
    };
  },
}));

vi.mock(import("@tanstack/react-router"), async (original) => ({
  ...(await original()),
  useNavigate: () => vi.fn(),
}));

let pickerRoot: Root | undefined;
let pickerRegistry: AtomRegistry.AtomRegistry | undefined;

function providerEntry(instanceId: string, driver: string) {
  const provider: ServerProvider = {
    instanceId: ProviderInstanceId.make(instanceId),
    driver: ProviderDriverKind.make(driver),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-08-28T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
  };
  return deriveProviderInstanceEntries([provider])[0]!;
}

afterEach(async () => {
  if (pickerRoot) await act(async () => pickerRoot!.unmount());
  pickerRoot = undefined;
  pickerRegistry?.dispose();
  pickerRegistry = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function click(target: Parameters<typeof userEvent.click>[0]) {
  await act(async () => userEvent.click(target));
}

const menuItem = (name: RegExp) => page.getByRole("menuitem", { name });

// With favorites set, the menu opens scoped to Favorites; the provider's tab
// in the rail swaps the list to its models.
async function openProviderPage(activeModel: string) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const entry = providerEntry("codex", "codex");
  pickerRegistry = AtomRegistry.make();
  pickerRegistry.set(favoritesAtom, [
    { provider: entry.instanceId, model: "current-favorite" },
    { provider: entry.instanceId, model: "legacy-favorite" },
  ]);
  pickerRoot = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () =>
    pickerRoot!.render(
      <RegistryContext.Provider value={pickerRegistry!}>
        <ProviderModelPicker
          environmentId={null}
          activeInstanceId={entry.instanceId}
          model={activeModel}
          lockedProvider={null}
          instanceEntries={[entry]}
          modelOptionsByInstance={
            new Map([
              [
                entry.instanceId,
                [
                  { slug: "current", name: "Current model" },
                  { slug: "legacy-favorite", name: "Legacy favorite", isLegacy: true },
                  { slug: "current-favorite", name: "Current favorite" },
                  { slug: "other-legacy", name: "Other legacy", isLegacy: true },
                ],
              ],
            ])
          }
          onInstanceModelChange={() => {}}
        />
      </RegistryContext.Provider>,
    ),
  );
  await click(document.querySelector("button")!);
  await click(menuItem(new RegExp(`^${entry.displayName}`)));
}

describe("ProviderModelPicker legacy favorites (fork menu)", () => {
  it("hoists legacy favorites in provider order and returns an unfavorited model to legacy", async () => {
    await openProviderPage("current");
    const legacyFavorite = menuItem(/Legacy favorite/);
    const currentFavorite = menuItem(/Current favorite/);
    const current = menuItem(/Current model/);
    const legacyModels = menuItem(/Legacy models/);

    await expect.element(legacyFavorite).toBeVisible();
    await expect.element(currentFavorite).toBeVisible();
    await expect.element(current).toBeVisible();
    await expect.element(menuItem(/Other legacy/)).not.toBeInTheDocument();
    expect(legacyFavorite.element().getBoundingClientRect().top).toBeLessThan(
      currentFavorite.element().getBoundingClientRect().top,
    );
    expect(currentFavorite.element().getBoundingClientRect().top).toBeLessThan(
      current.element().getBoundingClientRect().top,
    );

    await click(legacyFavorite.getByRole("button", { name: "Remove from favorites" }));
    await expect.element(legacyFavorite).not.toBeInTheDocument();
    await expect.element(currentFavorite).toBeVisible();

    await click(legacyModels);
    // Legacy models expand inline under their toggle; the current list stays.
    await expect.element(legacyModels).toBeVisible();
    await expect.element(legacyFavorite).toBeVisible();
    await expect.element(menuItem(/Other legacy/)).toBeVisible();
    await expect.element(current).toBeVisible();
    expect(legacyFavorite.element().getBoundingClientRect().top).toBeGreaterThan(
      legacyModels.element().getBoundingClientRect().top,
    );
    await expect
      .element(legacyFavorite.getByRole("button", { name: "Add to favorites" }))
      .toBeInTheDocument();
  });

  it("keeps unrelated legacy models collapsed when the active model is a favorite", async () => {
    await openProviderPage("legacy-favorite");

    await expect.element(menuItem(/Legacy favorite/)).toBeVisible();
    await expect.element(menuItem(/Other legacy/)).not.toBeInTheDocument();
    await click(menuItem(/Legacy models/));
    await expect.element(menuItem(/Other legacy/)).toBeVisible();
  });
});
