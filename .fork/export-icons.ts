#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off
/**
 * Renders every fork app-icon raster from the Icon Composer projects in
 * assets/fork, see `.fork/customizations.yaml#fork-app-identity`.
 *
 * Usage: node .fork/export-icons.ts [--check]
 *
 * macOS only: it needs Icon Composer's ictool (Xcode 26+, or set
 * ICON_COMPOSER_TOOL) and sips. Every size is rendered natively with the
 * macOS platform so each one carries the system Liquid Glass tile; the Dock
 * PNG pads the 1024 render onto a transparent 1272 canvas, the standard Mac
 * icon footprint. `--check` renders into memory and fails on any stale file.
 * Web favicons are not rendered here: they are a flat tile from Figma
 * (t3-fork 598:6596), committed as rasters.
 */

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { encodePngIco, WINDOWS_ICON_SIZES } from "../scripts/lib/icon-export.ts";

const DESIGN_GENERATION = 26;
const DOCK_CANVAS_SIZE = 1272;

const repoRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");

function resolveIctool(): string {
  if (process.env.ICON_COMPOSER_TOOL) return process.env.ICON_COMPOSER_TOOL;
  const developerDir = NodeChildProcess.execFileSync("xcode-select", ["-p"], {
    encoding: "utf8",
  }).trim();
  return NodePath.join(
    developerDir,
    "..",
    "Applications/Icon Composer.app/Contents/Executables/ictool",
  );
}

const ictool = resolveIctool();
const workDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "fork-icons-"));
let renderCount = 0;

function render(source: string, size: number): Buffer {
  const output = NodePath.join(workDir, `${renderCount++}.png`);
  NodeChildProcess.execFileSync(
    ictool,
    [
      NodePath.join(repoRoot, source),
      "--export-image",
      "--output-file",
      output,
      "--platform",
      "macOS",
      "--rendition",
      "Default",
      "--width",
      String(size),
      "--height",
      String(size),
      "--scale",
      "1",
      "--design-generation",
      String(DESIGN_GENERATION),
    ],
    { stdio: "ignore" },
  );
  return NodeFS.readFileSync(output);
}

function padToDockCanvas(icon: Buffer): Buffer {
  const input = NodePath.join(workDir, `${renderCount++}.png`);
  const output = NodePath.join(workDir, `${renderCount++}.png`);
  NodeFS.writeFileSync(input, icon);
  NodeChildProcess.execFileSync(
    "sips",
    ["-p", String(DOCK_CANVAS_SIZE), String(DOCK_CANVAS_SIZE), input, "--out", output],
    { stdio: "ignore" },
  );
  return NodeFS.readFileSync(output);
}

function ico(source: string, sizes: ReadonlyArray<number>): Buffer {
  return encodePngIco(sizes.map((size) => ({ size, contents: render(source, size) })));
}

function variantOutputs(source: string, prefix: string): Map<string, Buffer> {
  const macos = render(source, 1024);
  return new Map([
    [`assets/fork/${prefix}-macos-1024.png`, macos],
    [`assets/fork/${prefix}-macos-dock.png`, padToDockCanvas(macos)],
    [`assets/fork/${prefix}-web-apple-touch-180.png`, render(source, 180)],
  ]);
}

const outputs = new Map<string, Buffer>();
try {
  const production = variantOutputs("assets/fork/app-icon.icon", "n3");
  for (const [path, contents] of production) outputs.set(path, contents);
  // Linux and Windows have no runtime icon override; they ship the release art.
  outputs.set(
    "assets/fork/n3-universal-1024.png",
    production.get("assets/fork/n3-macos-1024.png")!,
  );
  outputs.set("assets/fork/n3-windows.ico", ico("assets/fork/app-icon.icon", WINDOWS_ICON_SIZES));

  const development = variantOutputs("assets/fork/dev-app-icon.icon", "n3-dev");
  for (const [path, contents] of development) outputs.set(path, contents);
  // `vp run dev` serves apps/web/public, so it carries the development family.
  outputs.set(
    "apps/web/public/apple-touch-icon.png",
    development.get("assets/fork/n3-dev-web-apple-touch-180.png")!,
  );
} finally {
  NodeFS.rmSync(workDir, { recursive: true, force: true });
}

if (process.argv.includes("--check")) {
  const stale = [...outputs].filter(([path, contents]) => {
    const absolute = NodePath.join(repoRoot, path);
    return !NodeFS.existsSync(absolute) || !NodeFS.readFileSync(absolute).equals(contents);
  });
  if (stale.length > 0) {
    console.error(
      `Fork icon rasters are stale; run node .fork/export-icons.ts:\n${stale
        .map(([path]) => `- ${path}`)
        .join("\n")}`,
    );
    process.exit(1);
  }
  console.log(`All ${outputs.size} fork icon rasters are current.`);
} else {
  for (const [path, contents] of outputs) {
    NodeFS.writeFileSync(NodePath.join(repoRoot, path), contents);
  }
  console.log(`Wrote ${outputs.size} fork icon rasters.`);
}
