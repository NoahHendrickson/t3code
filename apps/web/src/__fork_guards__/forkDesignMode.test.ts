// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and `.fork/customizations.yaml#fork-design-mode`.
 *
 * The design mode's outcome contract, from the outside in:
 *   - the toggle is wired into the preview chrome (PreviewView fence intact);
 *   - the engine bundler plugin is registered and the engine TS island stays excluded;
 *   - the engine bundles to one self-contained IIFE (proves the vendored module graph is
 *     complete after any upstream sync or Forge re-sync);
 *   - the engine keeps ZERO network delivery — T3 threads are the only delivery surface,
 *     so a Forge re-sync that drags /__the-forge/* fetches back in must fail here;
 *   - the console-message protocol round-trips.
 */

import { build } from "esbuild";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  DESIGN_MODE_CONSOLE_PREFIX,
  DESIGN_MODE_GLOBAL,
  parseDesignModeConsoleMessage,
} from "../custom/designMode/protocol";

const webRoot = NodePath.resolve(NodeURL.fileURLToPath(new URL(".", import.meta.url)), "../..");
const read = (relative: string) => NodeFS.readFileSync(NodePath.join(webRoot, relative), "utf8");

describe("fork guard: design mode", () => {
  it("mounts the Design toggle and the native panel in the preview pane", () => {
    const previewView = read("src/components/preview/PreviewView.tsx");
    expect(previewView).toContain(
      'import { ForkPreviewDesignMode } from "~/custom/designMode/ForkPreviewDesignMode"',
    );
    expect(previewView).toContain(
      'import { ForkDesignPanel } from "~/custom/designMode/panel/ForkDesignPanel"',
    );
    expect(previewView).toContain("<ForkPreviewDesignMode");
    expect(previewView).toContain(
      "<ForkDesignPanel runtimeTabId={runtimeTabId} threadRef={threadRef} />",
    );
  });

  it("delivers design changes as composer attachments, not prompt text", () => {
    const chatComposer = read("src/components/chat/ChatComposer.tsx");
    expect(chatComposer).toContain(
      'import { ForkComposerDesignChanges } from "~/custom/designMode/ForkComposerDesignChanges"',
    );
    expect(chatComposer).toContain("<ForkComposerDesignChanges target={composerDraftTarget}");
    // Pill-only sendability: the button's own sendState memo counts pending attachments.
    expect(chatComposer).toContain(
      "const forkPendingDesignChangeCount = useForkPendingDesignChangeCount(composerDraftTarget)",
    );
    expect(chatComposer).toContain("forkPendingDesignChangeCount,");
    const chatView = read("src/components/ChatView.tsx");
    expect(chatView).toContain(
      'import { forkDesignChanges } from "~/custom/designMode/designChangeDraftStore"',
    );
    expect(chatView).toContain("forkDesignChanges.count({ environmentId, threadId:");
    expect(chatView).toContain("forkDesignChanges.appendToPrompt(");
    expect(chatView).toContain(
      "messageTextForSendWithDesignChanges || IMAGE_ONLY_BOOTSTRAP_PROMPT",
    );
    expect(chatView).toContain(
      "if (turnStartSucceeded) forkDesignChanges.clear(forkDesignChangeRef)",
    );
  });

  it("registers the engine bundler plugin and serves the virtual module", () => {
    const viteConfig = read("vite.config.ts");
    expect(viteConfig).toContain(
      'import { forkDesignModeEngine } from "./fork/vitePluginForkDesignMode"',
    );
    expect(viteConfig).toContain("forkDesignModeEngine({");
    const plugin = read("fork/vitePluginForkDesignMode.ts");
    expect(plugin).toContain('"virtual:fork-design-mode-engine"');
  });

  it("keeps the engine TS island excluded from the web project", () => {
    const tsconfig = read("tsconfig.json");
    expect(tsconfig).toContain('"exclude": ["src/custom/designMode/engine"]');
    expect(
      NodeFS.existsSync(NodePath.join(webRoot, "src/custom/designMode/engine/tsconfig.json")),
    ).toBe(true);
  });

  it("keeps the engine free of network delivery (T3 threads are the delivery surface)", () => {
    const engineDir = NodePath.join(webRoot, "src/custom/designMode/engine");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of NodeFS.readdirSync(dir, { withFileTypes: true })) {
        const absolute = NodePath.join(dir, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (entry.isFile() && entry.name.endsWith(".ts")) {
          const source = NodeFS.readFileSync(absolute, "utf8");
          // Quoted endpoint literals and network constructors — comments that merely
          // mention the removed delivery layer are fine; call sites are not.
          if (
            source.includes("'/__the-forge") ||
            source.includes('"/__the-forge') ||
            /\bfetch\s*\(/u.test(source) ||
            source.includes("new WebSocket") ||
            source.includes("new EventSource") ||
            source.includes("XMLHttpRequest")
          ) {
            offenders.push(NodePath.relative(webRoot, absolute));
          }
        }
      }
    };
    walk(engineDir);
    expect(offenders).toEqual([]);
  });

  it("bundles the engine into one self-contained injectable IIFE", async () => {
    const result = await build({
      entryPoints: [NodePath.join(webRoot, "src/custom/designMode/engine/boot.ts")],
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      minify: true,
      write: false,
      logLevel: "silent",
    });
    const code = result.outputFiles[0]?.text ?? "";
    expect(code.length).toBeGreaterThan(50_000);
    expect(code).toContain(DESIGN_MODE_CONSOLE_PREFIX);
    expect(code).toContain(DESIGN_MODE_GLOBAL);
    // The delivery layer must not ride along in any form.
    expect(code).not.toContain("/__the-forge/");
  });

  it("round-trips the console-message protocol", () => {
    const selection = {
      type: "selection",
      elements: [
        {
          id: 1,
          tag: "button",
          sourceLabel: "App.tsx:5",
          styles: { width: "120px" },
        },
      ],
    };
    const line = `${DESIGN_MODE_CONSOLE_PREFIX}${JSON.stringify(selection)}`;
    expect(parseDesignModeConsoleMessage(line)).toEqual(selection);
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}{"type":"drafts","count":3}`),
    ).toEqual({ type: "drafts", count: 3 });
    expect(parseDesignModeConsoleMessage("plain page log")).toBeNull();
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}{"type":"nope"}`),
    ).toBeNull();
    expect(parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}not-json`)).toBeNull();
  });
});
