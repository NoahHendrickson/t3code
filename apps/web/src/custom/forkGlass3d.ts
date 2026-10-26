/**
 * Glass 3D switch — see `.fork/customizations.yaml#fork-glass-3d`.
 *
 * Turns Glass's depth off and on: the stage card a thread sits in
 * (theme.custom.glass-stage.css) and the glints, sheens and halos on the
 * selected rows, chips, tabs, buttons and popups
 * (theme.custom.glass-surfaces.css). Off, both sheets stand down through the
 * root attribute below, and Glass paints the flat stage and fills it had
 * before them.
 */
import { createForkRootSwitch } from "./forkRootSwitch";

/** Stamped on the root while 3D is off; the 3D sheets require its absence. */
export const FORK_GLASS_3D_OFF_ATTRIBUTE = "data-fork-glass-3d";

export const { initialize: initializeForkGlass3d, useEnabled: useForkGlass3d } =
  createForkRootSwitch({
    storageKey: "t3code:fork:glass-3d:v1",
    attribute: FORK_GLASS_3D_OFF_ATTRIBUTE,
  });
