/**
 * Glass new-agent picture switch — see
 * `.fork/customizations.yaml#fork-glass-new-agent-stage`.
 *
 * Turns Glass's new-agent stage (theme.custom.glass.css) off and on. Off,
 * every rule in that sheet stands down through the root attribute below,
 * so a draft paints on the same stage as a started thread; the composer
 * still centres, which is fork-new-agent-draft's and not the stage's. The
 * popup cutout and the palettes sheet read the same attribute, so popups,
 * the thread details popover among them, cut holes as in a started thread.
 * The attribute is the one place the state lives in the DOM; no component
 * subscribes to it.
 */
import * as Schema from "effect/Schema";

import { createForkRootSetting } from "./forkRootSetting";

/** Stamped on the root while the picture is off; the stage sheet's rules require its absence. */
export const FORK_GLASS_PICTURE_OFF_ATTRIBUTE = "data-fork-glass-picture";

export const {
  initialize: initializeForkGlassNewAgentPicture,
  useValue: useForkGlassNewAgentPicture,
} = createForkRootSetting({
  storageKey: "t3code:fork:glass-new-agent-picture:v1",
  attribute: FORK_GLASS_PICTURE_OFF_ATTRIBUTE,
  schema: Schema.Boolean,
  defaultValue: true,
  attributeValue: (enabled) => (enabled ? null : "off"),
});
