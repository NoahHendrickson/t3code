import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";

// oxlint-disable t3code/no-global-process-runtime -- Build-time host and toolchain selection.
const { values } = NodeUtil.parseArgs({
  options: {
    arch: { type: "string", default: process.arch },
    platform: { type: "string", default: process.platform },
    output: { type: "string" },
  },
});
const platform =
  values.platform === "mac" ? "darwin" : values.platform === "win" ? "win32" : values.platform;
if (platform !== process.platform)
  throw new Error("Build the speech helper on the target operating system.");
if (!["arm64", "x64", ...(platform === "darwin" ? ["universal"] : [])].includes(values.arch))
  throw new Error(`Unsupported speech helper architecture: ${values.arch}`);
if (platform !== "darwin" && values.arch !== process.arch)
  throw new Error("Build the speech helper on the target architecture.");

// whisper.cpp v1.8.3, pinned so native builds are reproducible across upstream releases.
const revision = "2eeeba56e9edd762b4b38467bab96c2517163158";
const root = NodeURL.fileURLToPath(new URL("../../../native/voice-input/build/", import.meta.url));
const source = NodePath.join(root, `whisper.cpp-${revision}`);
const build = NodePath.join(root, `cmake-${platform}-${values.arch}`);
const destination = NodePath.join(root, `${platform}-${values.arch}`);
const binary = platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
const stamp = `${revision}:2`;
const current = await NodeFSP.readFile(NodePath.join(destination, "version"), "utf8").catch(
  () => "",
);
const assetsExist = (
  await Promise.all(
    [binary, ...(platform === "darwin" ? ["default.metallib"] : [])].map((asset) =>
      NodeFSP.access(NodePath.join(destination, asset)).then(
        () => true,
        () => false,
      ),
    ),
  )
).every(Boolean);
if (current !== stamp || !assetsExist) {
  try {
    NodeChildProcess.execFileSync("cmake", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error(
      "Building local dictation requires CMake and a C++ compiler (macOS: Xcode with the Metal toolchain). Install CMake, then rebuild.",
    );
  }
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
      ...(platform === "darwin"
        ? [
            `-DCMAKE_OSX_ARCHITECTURES=${values.arch === "universal" ? "arm64;x86_64" : values.arch === "x64" ? "x86_64" : "arm64"}`,
            "-DCMAKE_OSX_DEPLOYMENT_TARGET=12.0",
            "-DGGML_METAL_MACOSX_VERSION_MIN=12.0",
          ]
        : []),
      ...(platform === "win32" ? ["-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded"] : []),
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
      ...(platform === "darwin" ? ["ggml-metal-lib"] : []),
      "--parallel",
      "4",
    ],
    { stdio: "inherit" },
  );
  await NodeFSP.mkdir(destination, { recursive: true });
  await NodeFSP.cp(
    NodePath.join(build, "bin", ...(platform === "win32" ? ["Release"] : []), binary),
    NodePath.join(destination, binary),
  );
  await NodeFSP.cp(
    NodePath.join(source, "LICENSE"),
    NodePath.join(destination, "LICENSE-whisper.cpp"),
  );
  if (platform === "darwin") {
    // Precompiled shaders avoid recompiling the Metal source on every dictation.
    await NodeFSP.cp(
      NodePath.join(build, "bin/default.metallib"),
      NodePath.join(destination, "default.metallib"),
    );
  }
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
