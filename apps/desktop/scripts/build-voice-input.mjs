import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";

// oxlint-disable t3code/no-global-process-runtime -- Build-time host and toolchain selection.
//
// Builds the whisper.cpp CLI with Metal for macOS. The fork ships macOS only,
// and whisper.cpp publishes no prebuilt macOS CLI, so compiling is the only
// path. `--optional` is for the dev tasks: without CMake the helper is skipped
// and the app runs without dictation instead of failing to start.
const { values } = NodeUtil.parseArgs({
  options: {
    arch: { type: "string", default: process.arch },
    platform: { type: "string", default: process.platform },
    output: { type: "string" },
    optional: { type: "boolean", default: false },
  },
});
const platform = values.platform === "mac" ? "darwin" : values.platform;
if (platform !== "darwin") {
  if (values.optional) process.exit(0);
  throw new Error("Local dictation ships for macOS only.");
}
if (process.platform !== "darwin") throw new Error("Build the speech helper on macOS.");
if (!["arm64", "x64", "universal"].includes(values.arch))
  throw new Error(`Unsupported speech helper architecture: ${values.arch}`);

// whisper.cpp v1.8.3, pinned so native builds are reproducible across upstream releases.
const revision = "2eeeba56e9edd762b4b38467bab96c2517163158";
const root = NodeURL.fileURLToPath(new URL("../../../native/voice-input/build/", import.meta.url));
const source = NodePath.join(root, `whisper.cpp-${revision}`);
const build = NodePath.join(root, `cmake-darwin-${values.arch}`);
const destination = NodePath.join(root, `darwin-${values.arch}`);
const assets = ["whisper-cli", "default.metallib"];
const stamp = `${revision}:2`;
const current = await NodeFSP.readFile(NodePath.join(destination, "version"), "utf8").catch(
  () => "",
);
const assetsExist = (
  await Promise.all(
    assets.map((asset) =>
      NodeFSP.access(NodePath.join(destination, asset)).then(
        () => true,
        () => false,
      ),
    ),
  )
).every(Boolean);
// The Metal shader library needs the full Xcode toolchain; Command Line Tools
// alone provide `cmake` and a C++ compiler but no `metal` compiler.
const missingTool = [
  ["cmake", ["--version"]],
  ["xcrun", ["-f", "metal"]],
].find(([tool, args]) => {
  try {
    NodeChildProcess.execFileSync(tool, args, { stdio: "ignore" });
    return false;
  } catch {
    return true;
  }
})?.[0];
if (current !== stamp || !assetsExist) {
  if (missingTool) {
    const toolchain =
      missingTool === "cmake" ? "CMake" : "Xcode's Metal toolchain (xcrun -f metal)";
    if (values.optional) {
      console.warn(
        `[voice-input] ${toolchain} not found; skipping the local dictation helper. Install CMake and full Xcode to enable dictation in dev.`,
      );
      process.exit(0);
    }
    throw new Error(
      `Building local dictation requires CMake and Xcode with the Metal toolchain; ${toolchain} is missing.`,
    );
  }
  console.log("[voice-input] Building the whisper.cpp helper (one-time, cached afterwards)…");
  try {
    await buildHelper();
  } catch (error) {
    // Offline, or a compile failure: dev keeps working without dictation.
    if (!values.optional) throw error;
    console.warn(
      `[voice-input] Could not build the local dictation helper; skipping it for this dev session. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(0);
  }
}

async function buildHelper() {
  await NodeFSP.mkdir(root, { recursive: true });
  try {
    await NodeFSP.access(NodePath.join(source, "CMakeLists.txt"));
  } catch {
    const response = await fetch(
      `https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/${revision}`,
    );
    if (!response.ok) throw new Error(`Could not download whisper.cpp: ${response.status}`);
    const archive = NodePath.join(root, `${revision}.tar.gz`);
    await NodeFSP.writeFile(archive, new Uint8Array(await response.arrayBuffer()));
    NodeChildProcess.execFileSync("cmake", ["-E", "tar", "xzf", archive], {
      cwd: root,
      stdio: "inherit",
    });
    await NodeFSP.rm(archive);
  }
  const osxArchitectures =
    values.arch === "universal" ? "arm64;x86_64" : values.arch === "x64" ? "x86_64" : "arm64";
  NodeChildProcess.execFileSync(
    "cmake",
    [
      "-S",
      source,
      "-B",
      build,
      "-DCMAKE_BUILD_TYPE=Release",
      "-DBUILD_SHARED_LIBS=OFF",
      "-DGGML_NATIVE=OFF",
      "-DGGML_BLAS=OFF",
      "-DWHISPER_BUILD_TESTS=OFF",
      "-DGGML_METAL_EMBED_LIBRARY=OFF",
      `-DCMAKE_OSX_ARCHITECTURES=${osxArchitectures}`,
      "-DCMAKE_OSX_DEPLOYMENT_TARGET=12.0",
      "-DGGML_METAL_MACOSX_VERSION_MIN=12.0",
    ],
    { stdio: "inherit" },
  );
  NodeChildProcess.execFileSync(
    "cmake",
    [
      "--build",
      build,
      "--config",
      "Release",
      "--target",
      "whisper-cli",
      "ggml-metal-lib",
      "--parallel",
      String(NodeOS.availableParallelism()),
    ],
    { stdio: "inherit" },
  );
  await NodeFSP.mkdir(destination, { recursive: true });
  await NodeFSP.cp(
    NodePath.join(build, "bin/whisper-cli"),
    NodePath.join(destination, "whisper-cli"),
  );
  // Precompiled shaders avoid recompiling the Metal source on every dictation.
  await NodeFSP.cp(
    NodePath.join(build, "bin/default.metallib"),
    NodePath.join(destination, "default.metallib"),
  );
  await NodeFSP.cp(
    NodePath.join(source, "LICENSE"),
    NodePath.join(destination, "LICENSE-whisper.cpp"),
  );
  await NodeFSP.writeFile(NodePath.join(destination, "version"), stamp);
}
await NodeFSP.cp(
  new URL("../../../native/voice-input/LICENSE-Whisper.txt", import.meta.url),
  NodePath.join(destination, "LICENSE-Whisper.txt"),
);
if (values.output) {
  await NodeFSP.mkdir(values.output, { recursive: true });
  await NodeFSP.cp(destination, values.output, { recursive: true });
}
