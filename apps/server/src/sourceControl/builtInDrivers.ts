import type {
  SourceControlDriver,
  SourceControlDriverInstance,
} from "@t3tools/source-control-core/server/driver";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";
/* fork:begin fork-github-pr-automation — see .fork/customizations.yaml#fork-github-pr-automation */
import * as GitHubRest from "@t3tools/source-control-github/server/GitHubRest";
/* fork:end fork-github-pr-automation */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerSourceControlHost from "./ServerSourceControlHost.ts";
import { BUILT_IN_SOURCE_CONTROL_DRIVER_LIST } from "./sourceControlDefinitions.ts";

export interface SourceControlDriverEntry {
  readonly driver: Pick<SourceControlDriver, "kind" | "definition">;
  readonly instance: SourceControlDriverInstance;
}

/** Every driver's instance, in registry order. Everything that reads a host reads it here. */
export class SourceControlDrivers extends Context.Service<
  SourceControlDrivers,
  ReadonlyArray<SourceControlDriverEntry>
>()("t3/sourceControl/builtInDrivers/SourceControlDrivers") {}

const make = Effect.forEach(BUILT_IN_SOURCE_CONTROL_DRIVER_LIST, (driver) =>
  driver.make.pipe(Effect.map((instance) => ({ driver, instance }))),
);

export const layer = Layer.effect(SourceControlDrivers, make).pipe(
  /* fork:begin fork-github-pr-automation — see .fork/customizations.yaml#fork-github-pr-automation
     Built here first, in the server's memo map, so the GitHub driver and GitHubPrAutomation
     share one GitHubRest and one sign-in refresh lock instead of building their own. */
  Layer.provide(GitHubRest.layerWithDependencies),
  /* fork:end fork-github-pr-automation */
  Layer.provideMerge(ServerSourceControlHost.layer),
  Layer.provideMerge(SourceControlRateLimit.layer),
);
