/**
 * Fork-owned — see `.fork/customizations.yaml#fork-app-identity`.
 *
 * Upstream T3 Code and the fork can both be installed, each offering a `t3`
 * command. A link is claimed by the launcher's marker text, so the fork's
 * marker differs from upstream's and neither app adopts, replaces or deletes
 * the other's link.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as DesktopCliCommand from "./DesktopCliCommand.ts";
import * as DesktopCliShim from "./DesktopCliShim.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";

const UPSTREAM_MARKER = "Written by T3 Code: runs the desktop app's bundled t3 CLI.";

const machinePath = process.env.PATH;
beforeEach(() => {
  process.env.PATH = "";
});
afterEach(() => {
  process.env.PATH = machinePath;
});

it.layer(NodeServices.layer)("DesktopCliCommand fork identity", (it) => {
  it("does not share upstream's launcher marker", () => {
    expect(DesktopCliShim.MARKER).not.toContain(UPSTREAM_MARKER);
  });

  it.effect("leaves upstream's t3 link alone through install and uninstall", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      const upstreamLauncher = path.join(home, ".t3", "bin", "t3");
      const upstreamLink = path.join(home, ".local", "bin", "t3");
      yield* fs.makeDirectory(path.dirname(upstreamLauncher), { recursive: true });
      yield* fs.writeFileString(upstreamLauncher, `#!/bin/sh\n# ${UPSTREAM_MARKER}\n`);
      yield* fs.makeDirectory(path.dirname(upstreamLink), { recursive: true });
      yield* fs.symlink(upstreamLauncher, upstreamLink);

      const baseDir = path.join(home, ".t3-fork");
      yield* fs.makeDirectory(path.join(baseDir, "userdata"), { recursive: true });
      const command = yield* DesktopCliCommand.make.pipe(
        Effect.provideService(
          DesktopEnvironment.DesktopEnvironment,
          DesktopEnvironment.DesktopEnvironment.of({
            path,
            platform: "linux",
            isPackaged: true,
            homeDirectory: home,
            baseDir,
            stateDir: path.join(baseDir, "userdata"),
            serverRoot: "/opt/no3y Code/resources/app.asar",
            appImagePath: Option.none(),
          } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]),
        ),
      );

      expect((yield* command.state).installedPath).toBeNull();
      const installed = yield* command.install;
      expect(installed.installedPath).not.toBe(upstreamLink);
      yield* command.uninstall;
      expect(yield* fs.readLink(upstreamLink)).toBe(upstreamLauncher);
    }).pipe(Effect.scoped),
  );
});
