/**
 * Glass 3D setting — see `.fork/customizations.yaml#fork-glass-3d`.
 *
 * How much of Glass gets depth. Full: the stage card a thread sits in
 * (theme.custom.glass-stage.css) and the glints, sheens and halos on the
 * selected rows, chips, tabs, buttons and popups
 * (theme.custom.glass-surfaces.css). Selected items only: just the selected
 * thread card and the active top sidebar rows. Off: the flat stage and fills
 * Glass had before either. The sheets key on the root attribute below.
 */
import * as Schema from "effect/Schema";

import { createForkRootSetting } from "./forkRootSetting";

/** Absent at Full; "selection" or "off" otherwise. */
export const FORK_GLASS_3D_ATTRIBUTE = "data-fork-glass-3d";

export const FORK_GLASS_3D_MODES = ["full", "selection", "off"] as const;
export type ForkGlass3dMode = (typeof FORK_GLASS_3D_MODES)[number];

export const DEFAULT_FORK_GLASS_3D_MODE: ForkGlass3dMode = "full";

export const FORK_GLASS_3D_MODE_LABELS: Record<ForkGlass3dMode, string> = {
  full: "Full",
  selection: "Selected items only",
  off: "Off",
};

const ForkGlass3dModeSchema = Schema.Literals(FORK_GLASS_3D_MODES);

export const isForkGlass3dMode = Schema.is(ForkGlass3dModeSchema);

export const { initialize: initializeForkGlass3d, useValue: useForkGlass3d } =
  createForkRootSetting({
    storageKey: "t3code:fork:glass-3d:v1",
    attribute: FORK_GLASS_3D_ATTRIBUTE,
    schema: ForkGlass3dModeSchema,
    defaultValue: DEFAULT_FORK_GLASS_3D_MODE,
    attributeValue: (mode) => (mode === DEFAULT_FORK_GLASS_3D_MODE ? null : mode),
  });
